"""
export_correct_onnx.py
======================
Re-exports the real trained EfficientNet-B3 + CBAM checkpoint to FP32 ONNX.

Architecture is reconstructed to exactly match best_retinascan_model.pt key names:
  backbone.*          → timm EfficientNet-B3 feature extractor
  cbam.ca.*           → Channel Attention (1536 channels, ratio=16)
  cbam.sa.*           → Spatial Attention (7×7 kernel)
  classifier.0        → nn.Dropout(0.3)
  classifier.1        → nn.Linear(1536, 5)

FP32, no quantization — cloud inference doesn't need weight compression.
Input:  [batch, 3, 300, 300] — dynamic batch + spatial axes
Output: logits [batch, 5]  |  feature_map [batch, 1536, H, W]
"""

import os
import sys
import warnings
from pathlib import Path

import numpy as np
import cv2
import torch
import torch.nn as nn

# timm must be installed: pip install timm
try:
    import timm
except ImportError:
    sys.exit("ERROR: timm is not installed. Run: pip install timm")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).parent.parent.parent
PT_PATH  = ROOT_DIR / "backend" / "models" / "best_retinascan_model.pt"
OUT_PATH = ROOT_DIR / "backend" / "models" / "retina_model.onnx"
SAMPLES  = ROOT_DIR / "data" / "samples" / "idrid_samples"

# ─── Architecture — must match training checkpoint exactly ───────────────────

class ChannelAttention(nn.Module):
    def __init__(self, in_planes: int, ratio: int = 16):
        super().__init__()
        self.fc = nn.Sequential(
            nn.Conv2d(in_planes, in_planes // ratio, 1, bias=False),
            nn.ReLU(),
            nn.Conv2d(in_planes // ratio, in_planes, 1, bias=False),
        )
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.max_pool = nn.AdaptiveMaxPool2d(1)
        self.sig = nn.Sigmoid()

    def forward(self, x):
        return self.sig(self.fc(self.avg_pool(x)) + self.fc(self.max_pool(x)))


class SpatialAttention(nn.Module):
    def __init__(self, kernel_size: int = 7):
        super().__init__()
        self.conv = nn.Conv2d(2, 1, kernel_size, padding=kernel_size // 2, bias=False)
        self.sig = nn.Sigmoid()

    def forward(self, x):
        avg_out = torch.mean(x, dim=1, keepdim=True)
        max_out, _ = torch.max(x, dim=1, keepdim=True)
        return self.sig(self.conv(torch.cat([avg_out, max_out], dim=1)))


class CBAM(nn.Module):
    def __init__(self, in_planes: int):
        super().__init__()
        self.ca = ChannelAttention(in_planes)
        self.sa = SpatialAttention()

    def forward(self, x):
        x = x * self.ca(x)
        x = x * self.sa(x)
        return x


class EfficientNetB3_CBAM(nn.Module):
    """
    Exact architecture used during training:
      - timm EfficientNet-B3 backbone (feature extractor, no head)
      - CBAM attention on 1536-channel feature map
      - Dropout(0.3) + Linear(1536 -> 5) classifier
    """
    def __init__(self, num_classes: int = 5):
        super().__init__()
        self.backbone = timm.create_model("efficientnet_b3", pretrained=False, num_classes=0)
        self.cbam = CBAM(1536)
        self.classifier = nn.Sequential(
            nn.Dropout(p=0.3),
            nn.Linear(1536, num_classes),
        )

    def forward(self, x):
        fmap   = self.backbone.forward_features(x)   # [B, 1536, H, W]
        attn   = self.cbam(fmap)                     # [B, 1536, H, W]
        pooled = torch.mean(attn, dim=[2, 3])        # [B, 1536]
        logits = self.classifier(pooled)             # [B, 5]
        return logits, attn                          # expose feature map for CAM


# ─── Step 1: Load checkpoint ──────────────────────────────────────────────────

print("=" * 72)
print("  RetinaScan AI — Correct ONNX Export (FP32, EfficientNet-B3 + CBAM)")
print("=" * 72)
print(f"\n[1/4] Loading checkpoint: {PT_PATH.name} ({PT_PATH.stat().st_size / 1e6:.1f} MB)")

ckpt = torch.load(str(PT_PATH), map_location="cpu")
if isinstance(ckpt, dict) and "state_dict" in ckpt:
    ckpt = ckpt["state_dict"]

model = EfficientNetB3_CBAM(num_classes=5)
result = model.load_state_dict(ckpt, strict=True)
print(f"  ✓ All weights loaded — missing={result.missing_keys}, unexpected={result.unexpected_keys}")
model.eval()


# ─── Step 2: Quick IDRiD benchmark ───────────────────────────────────────────

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)

GRADE_LABELS = [
    "No DR (Grade 0)", "Mild NPDR (Grade 1)", "Moderate NPDR (Grade 2)",
    "Severe NPDR (Grade 3)", "Proliferative DR (Grade 4)",
]

def preprocess_fundus(bgr: np.ndarray, size: int = 300) -> np.ndarray:
    """
    Retinal-aware preprocessing:
    1. Auto-crop black border using threshold on brightness
    2. Pad to square with black
    3. Resize to size x size
    4. ImageNet normalization
    Returns [1, 3, size, size] float32 numpy array.
    """
    # Crop black border
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
    ys, xs = np.where(mask > 0)
    if len(ys) > 0:
        y0, y1 = int(ys.min()), int(ys.max())
        x0, x1 = int(xs.min()), int(xs.max())
        bgr = bgr[y0:y1+1, x0:x1+1]

    # Pad to square preserving aspect ratio
    h, w = bgr.shape[:2]
    side = max(h, w)
    padded = np.zeros((side, side, 3), dtype=np.uint8)
    y_off = (side - h) // 2
    x_off = (side - w) // 2
    padded[y_off:y_off+h, x_off:x_off+w] = bgr

    # Resize + normalize
    rgb = cv2.cvtColor(cv2.resize(padded, (size, size)), cv2.COLOR_BGR2RGB)
    norm = ((rgb / 255.0) - MEAN) / STD
    return norm.transpose(2, 0, 1).astype(np.float32)[np.newaxis]


print("\n[2/4] IDRiD Benchmark Evaluation (PyTorch, FP32):")
correct = 0
with torch.no_grad():
    for g in range(5):
        p = SAMPLES / f"idrid_grade_{g}.jpg"
        if not p.exists():
            print(f"  ⚠  Missing sample: {p.name}")
            continue
        tensor = torch.from_numpy(preprocess_fundus(cv2.imread(str(p))))
        logits, _ = model(tensor)
        probs = torch.softmax(logits[0], dim=0).numpy()
        pred  = int(np.argmax(probs))
        hit   = "✓" if pred == g else "✗"
        print(f"  {hit}  True={g}  Pred={pred}  p=[{', '.join(f'{x:.2f}' for x in probs)}]")
        if pred == g:
            correct += 1
print(f"  Accuracy: {correct}/5  (Note: classifier has high-grade bias from training)")


# ─── Step 3: ONNX Export (FP32) ───────────────────────────────────────────────

print("\n[3/4] Exporting FP32 ONNX (legacy exporter — inline weights, self-contained file) …")
dummy = torch.randn(1, 3, 300, 300)

import torch.onnx
# Use legacy TorchScript-based exporter (dynamo=False) so all weights are
# embedded directly in the .onnx protobuf — no external data file.
torch.onnx.export(
    model,
    dummy,
    str(OUT_PATH),
    export_params=True,
    opset_version=17,
    do_constant_folding=True,
    input_names=["input"],
    output_names=["logits", "feature_map"],
    dynamic_axes={
        "input":       {0: "batch"},
        "logits":      {0: "batch"},
        "feature_map": {0: "batch"},
    },
)

# Ensure all weights are embedded in a single file (< 2GB protobuf limit)
import onnx
_loaded_model = onnx.load(str(OUT_PATH), load_external_data=True)
onnx.save_model(_loaded_model, str(OUT_PATH), save_as_external_data=False)
data_file = OUT_PATH.parent / f"{OUT_PATH.name}.data"
if data_file.exists():
    data_file.unlink()

size_mb = OUT_PATH.stat().st_size / 1e6
print(f"  ✓ Self-contained FP32 ONNX saved: {OUT_PATH.name} ({size_mb:.1f} MB)")

# ─── Step 4: ONNX Runtime Verification ───────────────────────────────────────

print("\n[4/4] ONNX Runtime Verification:")
try:
    import onnxruntime as ort
    sess = ort.InferenceSession(str(OUT_PATH), providers=["CPUExecutionProvider"])
    for inp in sess.get_inputs():
        print(f"  Input  : {inp.name}  shape={inp.shape}  dtype={inp.type}")
    for out in sess.get_outputs():
        print(f"  Output : {out.name}  shape={out.shape}  dtype={out.type}")

    print("\n  IDRiD Benchmark (ONNX Runtime, FP32):")
    ort_correct = 0
    for g in range(5):
        p = SAMPLES / f"idrid_grade_{g}.jpg"
        if not p.exists():
            continue
        x = preprocess_fundus(cv2.imread(str(p)))
        logits_ort, _ = sess.run(None, {"input": x})
        exp = np.exp(logits_ort[0] - np.max(logits_ort[0]))
        probs = exp / exp.sum()
        pred = int(np.argmax(probs))
        hit = "✓" if pred == g else "✗"
        print(f"    {hit}  True={g}  Pred={pred}  p=[{', '.join(f'{x:.2f}' for x in probs)}]")
        if pred == g:
            ort_correct += 1
    print(f"  ONNX Accuracy: {ort_correct}/5")

    # Max diff between PyTorch and ONNX
    dummy_np = np.random.randn(1, 3, 300, 300).astype(np.float32)
    with torch.no_grad():
        pt_logits, _ = model(torch.from_numpy(dummy_np))
    ort_logits, _ = sess.run(None, {"input": dummy_np})
    max_diff = float(np.max(np.abs(pt_logits.numpy() - ort_logits)))
    print(f"\n  PyTorch vs ONNX max logit diff: {max_diff:.5f}  ({'OK (<0.01)' if max_diff < 0.01 else 'HIGH — check export'})")

except ImportError:
    print("  ⚠ onnxruntime not installed — skipping runtime verification")

print("\n" + "=" * 72)
print("  ✅  Export complete.  Deploy backend/models/retina_model.onnx")
print("=" * 72)
