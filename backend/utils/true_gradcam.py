"""
backend/utils/true_gradcam.py
==============================
Real gradient-based Grad-CAM for the RetinaScan AI EfficientNet-B3 + CBAM classifier.

METHOD (Selvaraju et al., ICCV 2017):
  1. Register forward hook on the final convolutional feature layer
     (backbone.conv_head → backbone.bn2 is the last conv output; 
      actual feature tensor hooked at backbone.bn2 output, shape [B, 1536, H, W])
  2. Forward pass to obtain predicted class score
  3. Backpropagate gradients of predicted class score w.r.t. that layer's activations
  4. Global-average-pool gradients over spatial dims → channel weights α_k
  5. Weighted sum of activation maps: cam = ReLU(Σ_k α_k · A_k)
  6. Upsample to input resolution (300×300)
  7. Normalize to [0,1], apply colormap, overlay on original image

MODEL PROVENANCE (Amendment 5):
  The PyTorch checkpoint MUST correspond to the same model as the production
  ONNX file.  Provenance is verified by comparing classifier weight SHA-256
  between the checkpoint state_dict and the ONNX initializer.
  If they do not match: GRAD-CAM STATUS = NOT VERIFIED

USAGE:
  from backend.utils.true_gradcam import GradCAM, GRADCAM_STATUS

  cam = GradCAM(checkpoint_path)          # raises FileNotFoundError if missing
  heatmap_b64 = cam.generate(image_rgb, predicted_class)

  # Always check status before trusting output:
  print(GRADCAM_STATUS)                   # 'VERIFIED' | 'NOT VERIFIED' | 'UNAVAILABLE'
"""

import os
import hashlib
import base64
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import cv2

logger = logging.getLogger(__name__)

# ─── Model Provenance Record ────────────────────────────────────────────────
# Filled in at load time.  Inspect via true_gradcam.PROVENANCE_RECORD.
PROVENANCE_RECORD: dict = {
    "status":               "NOT LOADED",
    "architecture":         "EfficientNet-B3 + CBAM (7-stage MBConv, se_ratio=0.25)",
    "hooked_layer":         "backbone.bn2",       # last BN after conv_head — shape [B,1536,10,10] for 300×300 input
    "classifier_layer":     "classifier.1",
    "num_classes":          5,
    "class_ordering":       ["Grade 0","Grade 1","Grade 2","Grade 3","Grade 4"],
    "input_size":           [300, 300],
    "preprocessing":        "ImageNet normalize: mean=[0.485,0.456,0.406] std=[0.229,0.224,0.225]",
    "checkpoint_path":      None,
    "checkpoint_sha256":    None,
    "onnx_classifier_sha256": None,
    "provenance_verified":  False,
    "note":                 "Not yet loaded",
}

GRADCAM_STATUS: str = "UNAVAILABLE"

# ─── ImageNet normalisation ─────────────────────────────────────────────────
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)

ONNX_MODEL_PATH = Path(__file__).parent.parent / "models" / "retina_model.onnx"


def _sha256_file(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _sha256_array(arr: np.ndarray) -> str:
    return hashlib.sha256(arr.tobytes()).hexdigest()


def _extract_onnx_classifier_weight_hash() -> Optional[str]:
    """Extract SHA-256 of the classifier.1.weight tensor from the ONNX model."""
    if not ONNX_MODEL_PATH.exists():
        return None
    try:
        import onnx
        m = onnx.load(str(ONNX_MODEL_PATH))
        for init in m.graph.initializer:
            if "classifier.1.weight" in init.name:
                arr = onnx.numpy_helper.to_array(init)
                return _sha256_array(arr)
    except Exception as e:
        logger.warning(f"[GradCAM] Could not extract ONNX classifier weight hash: {e}")
    return None


class GradCAM:
    """
    Real gradient-based Grad-CAM for EfficientNet-B3 + CBAM DR classifier.

    Parameters
    ----------
    checkpoint_path : str
        Absolute path to best_retinascan_model.pt (PyTorch checkpoint).
        Raises FileNotFoundError if not found — never silently falls back.
    target_layer_name : str
        Name of the layer to hook for gradient computation.
        Default: 'backbone.bn2' (last feature layer before global pool).

    Raises
    ------
    FileNotFoundError
        If checkpoint_path does not exist.
    RuntimeError
        If the checkpoint cannot be loaded or the target layer is not found.
    """

    def __init__(
        self,
        checkpoint_path: str,
        target_layer_name: str = "backbone.bn2",
    ):
        global GRADCAM_STATUS, PROVENANCE_RECORD

        if not os.path.exists(checkpoint_path):
            GRADCAM_STATUS = "UNAVAILABLE"
            PROVENANCE_RECORD["status"] = "UNAVAILABLE — checkpoint not found"
            PROVENANCE_RECORD["note"] = f"File not found: {checkpoint_path}"
            raise FileNotFoundError(
                f"[GradCAM] PyTorch checkpoint not found: {checkpoint_path}\n"
                "Provide the checkpoint or set PYTORCH_CHECKPOINT_PATH env var.\n"
                "The heuristic saliency map (generate_heuristic_saliency_map) will be used as explicit fallback."
            )

        import torch
        import torch.nn as nn

        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._target_layer_name = target_layer_name
        self._activations: Optional[np.ndarray] = None
        self._gradients: Optional[np.ndarray]   = None

        # ── Load checkpoint ─────────────────────────────────────────────────
        ckpt_hash = _sha256_file(checkpoint_path)
        try:
            ckpt = torch.load(checkpoint_path, map_location=self._device, weights_only=False)
        except Exception as e:
            raise RuntimeError(f"[GradCAM] Failed to load checkpoint: {e}") from e

        # ── Build model ──────────────────────────────────────────────────────
        self._model = self._build_model(ckpt)
        self._model.eval()

        # ── Hook target layer ────────────────────────────────────────────────
        self._hooks: list = []
        self._register_hooks()

        # ── Provenance verification ──────────────────────────────────────────
        # Compare classifier.1.weight between checkpoint and ONNX
        import torch.nn.functional as F
        onnx_cls_hash = _extract_onnx_classifier_weight_hash()

        # Get classifier weight from checkpoint model
        pt_cls_hash = None
        try:
            sd = ckpt.get("state_dict", ckpt.get("model_state_dict", {}))
            if "classifier.1.weight" in sd:
                pt_cls_hash = _sha256_array(sd["classifier.1.weight"].cpu().numpy())
        except Exception:
            pass

        provenance_verified = (
            onnx_cls_hash is not None
            and pt_cls_hash is not None
            and onnx_cls_hash == pt_cls_hash
        )

        PROVENANCE_RECORD.update({
            "status":                 "VERIFIED" if provenance_verified else "NOT VERIFIED",
            "checkpoint_path":        checkpoint_path,
            "checkpoint_sha256":      ckpt_hash,
            "onnx_classifier_sha256": onnx_cls_hash,
            "pt_classifier_sha256":   pt_cls_hash,
            "provenance_verified":    provenance_verified,
            "note": (
                "Checkpoint classifier weights match ONNX production model — Grad-CAM is valid for production predictions."
                if provenance_verified else
                "WARNING: Checkpoint classifier weights DO NOT match ONNX production model. "
                "GRAD-CAM STATUS = NOT VERIFIED. Heatmap must NOT be presented as evidence for production predictions."
            ),
        })

        GRADCAM_STATUS = "VERIFIED" if provenance_verified else "NOT VERIFIED"

        if not provenance_verified:
            logger.warning(
                "[GradCAM] PROVENANCE MISMATCH — checkpoint does not match production ONNX.\n"
                "  PT  classifier.1.weight SHA256: %s\n"
                "  ONNX classifier.1.weight SHA256: %s\n"
                "  GRAD-CAM STATUS = NOT VERIFIED",
                pt_cls_hash, onnx_cls_hash,
            )
        else:
            logger.info("[GradCAM] Provenance VERIFIED — checkpoint matches production ONNX.")

        logger.info(
            "[GradCAM] Loaded. Target layer: %s | Device: %s | Status: %s",
            target_layer_name, self._device, GRADCAM_STATUS,
        )

    # ── Model builder ─────────────────────────────────────────────────────────
    def _build_model(self, ckpt):
        """Reconstruct the EfficientNet-B3 + CBAM model from checkpoint."""
        import torch
        import torch.nn as nn
        from torchvision.models import efficientnet_b3, EfficientNet_B3_Weights

        class CBAM(nn.Module):
            """Channel + Spatial Attention Module (matches training code)."""
            def __init__(self, channels, reduction=16):
                super().__init__()
                self.ca = nn.Sequential(
                    nn.AdaptiveAvgPool2d(1),
                    nn.Flatten(),
                    nn.Linear(channels, channels // reduction),
                    nn.ReLU(),
                    nn.Linear(channels // reduction, channels),
                    nn.Sigmoid(),
                )
                self.sa = nn.Sequential(
                    nn.Conv2d(2, 1, kernel_size=7, padding=3, bias=False),
                    nn.Sigmoid(),
                )

            def forward(self, x):
                b, c, h, w = x.shape
                ca_w = self.ca(x).view(b, c, 1, 1)
                x = x * ca_w
                mx = x.max(dim=1, keepdim=True).values
                mn = x.mean(dim=1, keepdim=True)
                sa_w = self.sa(torch.cat([mx, mn], dim=1))
                return x * sa_w

        class EfficientNetB3CBAM(nn.Module):
            def __init__(self, num_classes=5):
                super().__init__()
                base = efficientnet_b3(weights=None)
                self.backbone   = base.features   # renamed for hook compatibility
                self.cbam       = CBAM(1536)
                self.pool       = nn.AdaptiveAvgPool2d(1)
                self.classifier = nn.Sequential(
                    nn.Dropout(0.3),
                    nn.Linear(1536, num_classes),
                )

            def forward(self, x):
                x = self.backbone(x)
                x = self.cbam(x)
                x = self.pool(x)
                x = torch.flatten(x, 1)
                return self.classifier(x)

        model = EfficientNetB3CBAM(num_classes=5)

        sd = ckpt
        if isinstance(ckpt, dict):
            sd = ckpt.get("state_dict", ckpt.get("model_state_dict", ckpt))

        # Remap keys: if checkpoint uses 'backbone.blocks.' → map to 'backbone.'
        # The checkpoint state_dict uses direct backbone keys matching our model
        try:
            missing, unexpected = model.load_state_dict(sd, strict=False)
            if missing:
                logger.warning("[GradCAM] Missing keys in state_dict: %s", missing[:5])
            if unexpected:
                logger.warning("[GradCAM] Unexpected keys in state_dict: %s", unexpected[:5])
        except Exception as e:
            raise RuntimeError(f"[GradCAM] State dict load failed: {e}") from e

        model.to(self._device)
        return model

    # ── Hook registration ─────────────────────────────────────────────────────
    def _register_hooks(self):
        """Register forward and backward hooks on the target layer."""
        target_module = None
        for name, module in self._model.named_modules():
            if name == self._target_layer_name:
                target_module = module
                break

        if target_module is None:
            available = [n for n, _ in self._model.named_modules()]
            raise RuntimeError(
                f"[GradCAM] Target layer '{self._target_layer_name}' not found.\n"
                f"Available modules (first 20): {available[:20]}"
            )

        def _save_activation(module, inp, output):
            self._activations = output.detach().cpu().numpy()

        def _save_gradient(module, grad_in, grad_out):
            self._gradients = grad_out[0].detach().cpu().numpy()

        self._hooks.append(target_module.register_forward_hook(_save_activation))
        self._hooks.append(target_module.register_full_backward_hook(_save_gradient))

    def remove_hooks(self):
        for h in self._hooks:
            h.remove()
        self._hooks = []

    # ── Core Grad-CAM computation ─────────────────────────────────────────────
    def generate(
        self,
        image_rgb: np.ndarray,
        target_class: Optional[int] = None,
        alpha: float = 0.5,
    ) -> str:
        """
        Compute Grad-CAM heatmap and return as base64-encoded JPEG.

        Parameters
        ----------
        image_rgb : np.ndarray   HxWx3 uint8 RGB image (original resolution)
        target_class : int       DR grade to explain (default: argmax of logits)
        alpha : float            blend weight for overlay (0=only cam, 1=only image)

        Returns
        -------
        str   'data:image/jpeg;base64,...'
        """
        import torch

        if len(image_rgb.shape) == 2:
            image_rgb = cv2.cvtColor(image_rgb, cv2.COLOR_GRAY2RGB)
        h_orig, w_orig = image_rgb.shape[:2]

        # ── Preprocess ──────────────────────────────────────────────────────
        resized = cv2.resize(image_rgb, (300, 300), interpolation=cv2.INTER_LINEAR)
        tensor  = ((resized / 255.0) - _MEAN) / _STD
        tensor  = tensor.transpose(2, 0, 1).astype(np.float32)
        inp     = torch.tensor(tensor[np.newaxis], device=self._device, requires_grad=False)

        # ── Forward pass ────────────────────────────────────────────────────
        self._model.zero_grad()
        logits = self._model(inp)   # shape [1, 5]

        if target_class is None:
            target_class = int(logits.argmax(dim=1).item())

        # ── Backward pass ───────────────────────────────────────────────────
        self._model.zero_grad()
        score = logits[0, target_class]
        score.backward()

        # ── Compute CAM ─────────────────────────────────────────────────────
        # self._gradients: [1, C, H_feat, W_feat]
        # self._activations: [1, C, H_feat, W_feat]
        grads  = self._gradients[0]      # [C, H_feat, W_feat]
        acts   = self._activations[0]    # [C, H_feat, W_feat]

        # Channel weights: global average pool of gradients
        weights = grads.mean(axis=(1, 2))  # [C]

        # Weighted activation sum
        cam = np.zeros(acts.shape[1:], dtype=np.float32)  # [H_feat, W_feat]
        for i, w in enumerate(weights):
            cam += w * acts[i]

        # ReLU (keep only positive contributions)
        cam = np.maximum(cam, 0)

        # ── Upsample to input resolution ────────────────────────────────────
        cam_up = cv2.resize(cam, (w_orig, h_orig), interpolation=cv2.INTER_LINEAR)

        # ── Normalize to [0, 255] ────────────────────────────────────────────
        cam_min, cam_max = cam_up.min(), cam_up.max()
        if cam_max - cam_min > 1e-8:
            cam_norm = (cam_up - cam_min) / (cam_max - cam_min)
        else:
            cam_norm = np.zeros_like(cam_up)
        cam_uint8 = (cam_norm * 255).astype(np.uint8)

        # ── Colormap and overlay ─────────────────────────────────────────────
        colormap = cv2.applyColorMap(cam_uint8, cv2.COLORMAP_JET)
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        overlay = cv2.addWeighted(image_bgr, alpha, colormap, 1 - alpha, 0)

        # ── Encode ──────────────────────────────────────────────────────────
        _, buf = cv2.imencode(".jpg", overlay, [cv2.IMWRITE_JPEG_QUALITY, 92])
        b64 = base64.b64encode(buf).decode("utf-8")

        return f"data:image/jpeg;base64,{b64}"

    def __del__(self):
        self.remove_hooks()


# ─── Module-level singleton (lazy init) ────────────────────────────────────
_gradcam_instance: Optional[GradCAM] = None


def get_gradcam(checkpoint_path: Optional[str] = None) -> Optional[GradCAM]:
    """
    Return a cached GradCAM instance, loading from checkpoint_path on first call.
    Returns None if checkpoint is unavailable (caller must use heuristic fallback).
    """
    global _gradcam_instance

    if _gradcam_instance is not None:
        return _gradcam_instance

    if checkpoint_path is None:
        checkpoint_path = os.environ.get(
            "PYTORCH_CHECKPOINT_PATH",
            str(Path(__file__).parent.parent / "models" / "best_retinascan_model.pt"),
        )

    try:
        _gradcam_instance = GradCAM(checkpoint_path)
        return _gradcam_instance
    except FileNotFoundError as e:
        logger.warning(str(e))
        return None
    except Exception as e:
        logger.error("[GradCAM] Unexpected error loading checkpoint: %s", e)
        return None


def generate_gradcam_heatmap(
    image_rgb: np.ndarray,
    target_class: Optional[int] = None,
    checkpoint_path: Optional[str] = None,
    alpha: float = 0.5,
) -> tuple[str, dict]:
    """
    Convenience wrapper.  Returns (heatmap_b64, provenance_record).
    Raises FileNotFoundError if checkpoint unavailable — caller decides on fallback.
    """
    cam = get_gradcam(checkpoint_path)
    if cam is None:
        raise FileNotFoundError(
            "[GradCAM] No GradCAM instance available. "
            "PyTorch checkpoint not found or failed to load. "
            "Use generate_heuristic_saliency_map() as an explicitly-labeled fallback."
        )
    heatmap = cam.generate(image_rgb, target_class=target_class, alpha=alpha)
    return heatmap, PROVENANCE_RECORD.copy()
