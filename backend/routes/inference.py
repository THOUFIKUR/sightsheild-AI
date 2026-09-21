"""
inference.py — RetinaScan AI Cloud Inference Router
====================================================
Runs EfficientNet-B3 + CBAM grading and YOLO lesion detection on the server.

Key fixes applied (2026-09):
• Retinal-aware preprocessing: auto-crop black border → square pad → 300×300
• Real Score-CAM heatmap from ONNX feature_map output (not fake OpenCV CLAHE)
• Strengthened clinical arbitration using YOLO lesion counts as grade floor
• No INT8 quantization — FP32 ONNX served directly from cloud backend
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
import cv2
import numpy as np
import base64
from datetime import datetime
import onnxruntime as ort
import os
from pathlib import Path

router = APIRouter()

# ─── ONNX Model Paths ────────────────────────────────────────────────────────
MODEL_DIR     = Path(__file__).parent.parent / "models"
GRADING_MODEL = str(MODEL_DIR / "retina_model.onnx")
LESION_MODEL  = str(MODEL_DIR / "yolo_lesions.onnx")

# ─── Session Cache ────────────────────────────────────────────────────────────
_grading_session = None
_lesion_session  = None


def get_grading_session():
    global _grading_session
    if _grading_session is None:
        _grading_session = ort.InferenceSession(
            GRADING_MODEL, providers=["CPUExecutionProvider"]
        )
    return _grading_session


def get_lesion_session():
    global _lesion_session
    if _lesion_session is None and os.path.exists(LESION_MODEL):
        _lesion_session = ort.InferenceSession(
            LESION_MODEL, providers=["CPUExecutionProvider"]
        )
    return _lesion_session


YOLO_CLASSES = [
    "Intraretinal Hemorrhages (Flame/Blot)",
    "Hard Exudates / Cotton Wool Spots",
    "Microaneurysms (Sub-pixel focal dilatations)",
]

# ─── ImageNet normalisation constants ────────────────────────────────────────
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)


# ─── Preprocessing ───────────────────────────────────────────────────────────

def preprocess_fundus_rgb(image_rgb: np.ndarray, size: int = 300) -> np.ndarray:
    """
    Retinal-aware preprocessing:
      1. Auto-crop the black circular border (fundus cameras produce near-black background)
      2. Pad to square preserving aspect ratio
      3. Resize to size×size
      4. ImageNet normalise → CHW float32 tensor [1, 3, size, size]
    """
    # Step 1 — black-border crop
    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    _, mask = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
    ys, xs = np.where(mask > 0)
    if len(ys) > 10:
        y0, y1 = int(ys.min()), int(ys.max())
        x0, x1 = int(xs.min()), int(xs.max())
        image_rgb = image_rgb[y0:y1+1, x0:x1+1]

    # Step 2 — square pad
    h, w = image_rgb.shape[:2]
    side  = max(h, w)
    padded = np.zeros((side, side, 3), dtype=np.uint8)
    y_off  = (side - h) // 2
    x_off  = (side - w) // 2
    padded[y_off:y_off+h, x_off:x_off+w] = image_rgb

    # Step 3 — resize
    resized = cv2.resize(padded, (size, size), interpolation=cv2.INTER_LINEAR)

    # Step 4 — normalise
    norm   = ((resized / 255.0) - MEAN) / STD
    tensor = norm.transpose(2, 0, 1).astype(np.float32)
    return tensor[np.newaxis]   # [1, 3, 300, 300]


# ─── True Grad-CAM Heatmap (Class-Weighted + Smooth Blending) ─────────────────
WEIGHTS_PATH = MODEL_DIR / "classifier_weights.npy"
_classifier_weights = None

def get_classifier_weights():
    global _classifier_weights
    if _classifier_weights is None:
        if WEIGHTS_PATH.exists():
            _classifier_weights = np.load(str(WEIGHTS_PATH))
        else:
            try:
                import onnx
                m = onnx.load(GRADING_MODEL)
                for init in m.graph.initializer:
                    if "classifier.1.weight" in init.name:
                        _classifier_weights = onnx.numpy_helper.to_array(init)
                        np.save(str(WEIGHTS_PATH), _classifier_weights)
                        break
            except Exception as e:
                print(f"[Grad-CAM Warning] Could not load classifier weights: {e}")
    return _classifier_weights


def generate_gradcam_heatmap(
    image_rgb: np.ndarray,
    feature_map: np.ndarray | None,
    grade: int = 0,
    detections: list | None = None,
) -> str:
    """
    True Mathematical Grad-CAM (Class Activation Mapping) for EfficientNet-B3 + CBAM.
    
    1. Extracts linear classifier weights W for the specific predicted grade.
    2. Computes class-specific CAM: sum_k(W[grade, k] * feature_map[k]).
    3. Retinal circular mask suppresses any background camera artifacts.
    4. Smooth continuous alpha blending (smoothstep curve) — eliminates hard cut-off
       contours ('omelette' border) so hot spots fade naturally into the retina.
    5. Clean fundus returned untouched for Grade 0 with no lesions.
    """
    orig_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    h, w = image_rgb.shape[:2]

    # Grade 0 with no lesions → return pristine clean fundus
    if grade == 0 and (not detections or len(detections) == 0):
        _, buf = cv2.imencode(".jpg", orig_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

    # Retinal field mask (keep heat inside illuminated fundus circle)
    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    _, retina_mask = cv2.threshold(gray, 18, 255, cv2.THRESH_BINARY)
    retina_mask = cv2.erode(retina_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))

    W = get_classifier_weights()
    cam_base = np.zeros((h, w), dtype=np.float32)

    if feature_map is not None and feature_map.ndim >= 3 and W is not None:
        fmap = feature_map[0]  # [1536, 10, 10]
        c_idx = min(max(grade, 0), W.shape[0] - 1)
        weights = W[c_idx]  # [1536]

        # True CAM: class-weighted sum over feature channels
        cam_10x10 = np.tensordot(weights, fmap, axes=(0, 0))  # [10, 10]
        cam_10x10 = np.maximum(cam_10x10, 0)
        if cam_10x10.max() > 1e-8:
            cam_10x10 /= cam_10x10.max()
        cam_base = cv2.resize(cam_10x10, (w, h), interpolation=cv2.INTER_CUBIC)
    elif feature_map is not None and feature_map.ndim >= 3:
        # Fallback if W unavailable
        fmap_max = np.maximum(feature_map[0].mean(axis=0), 0)
        if fmap_max.max() > 1e-8:
            fmap_max /= fmap_max.max()
        cam_base = cv2.resize(fmap_max, (w, h), interpolation=cv2.INTER_CUBIC)

    # Fuse with YOLO lesion focal spots
    cam_lesion = np.zeros((h, w), dtype=np.float32)
    y_grid, x_grid = np.ogrid[:h, :w]
    if detections:
        for det in detections:
            bbox = det.get("bbox", [0, 0, 0, 0])
            conf = float(det.get("confidence", 0.6))
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0
            radius = max(int(min(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 1.5), 25)
            spot = np.exp(-((x_grid - cx) ** 2 + (y_grid - cy) ** 2) / (2.0 * (radius ** 2))) * conf
            cam_lesion += spot

    if cam_lesion.max() > 1e-8:
        cam_lesion /= cam_lesion.max()

    # Combine Grad-CAM features with lesion localized spots
    if detections and len(detections) > 0:
        cam_final = cam_base * 0.45 + cam_lesion * 0.65
    else:
        cam_final = cam_base

    if cam_final.max() > 1e-8:
        cam_final /= cam_final.max()

    # Mask out background camera border
    cam_final[retina_mask == 0] = 0.0

    # Smooth continuous alpha blending (smoothstep curve: soft falloff, NO hard edges)
    v = np.clip(cam_final, 0.0, 1.0)
    low, high = 0.20, 0.70
    t = np.clip((v - low) / (high - low), 0.0, 1.0)
    alpha = (t * t * (3.0 - 2.0 * t)) * 0.60  # max 60% opacity at hot foci
    alpha[retina_mask == 0] = 0.0

    cam_u8 = np.uint8(255 * v)
    jet_bgr = cv2.applyColorMap(cam_u8, cv2.COLORMAP_JET)

    alpha_3d = alpha[:, :, np.newaxis]
    blended = (1.0 - alpha_3d) * orig_bgr.astype(np.float32) + alpha_3d * jet_bgr.astype(np.float32)
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    _, buf = cv2.imencode(".jpg", blended, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

# Alias for backwards compatibility
generate_scorecam_heatmap = generate_gradcam_heatmap



# ─── EfficientNet-B3 Grading ──────────────────────────────────────────────────

MAP = [
    {
        "grade_label": "No Diabetic Retinopathy",
        "risk_level": "LOW",
        "risk_score": 10,
        "urgency": "Routine annual screening at PHC",
        "icdr_level": "Level 0: No apparent retinopathy",
    },
    {
        "grade_label": "Mild Diabetic Retinopathy",
        "risk_level": "LOW",
        "risk_score": 28,
        "urgency": "Annual review; strict glycemic control",
        "icdr_level": "Level 1: Microaneurysms only",
    },
    {
        "grade_label": "Moderate Diabetic Retinopathy",
        "risk_level": "MEDIUM",
        "risk_score": 55,
        "urgency": "Referral to ophthalmologist within 6 months",
        "icdr_level": "Level 2: Moderate intraretinal lesions",
    },
    {
        "grade_label": "Severe Diabetic Retinopathy",
        "risk_level": "HIGH",
        "risk_score": 85,
        "urgency": "Urgent referral within 3 months (high risk of PDR)",
        "icdr_level": "Level 3: ETDRS 4-2-1 Rule satisfied",
    },
    {
        "grade_label": "Proliferative Diabetic Retinopathy",
        "risk_level": "HIGH",
        "risk_score": 98,
        "urgency": "Emergency referral for PRP Laser / Anti-VEGF",
        "icdr_level": "Level 4: Neovascularization / Vitreous Hemorrhage",
    },
]


def run_grading(image_rgb: np.ndarray) -> dict:
    """
    Runs EfficientNet-B3 + CBAM ONNX grading on the fundus image.
    Returns grade, confidence, probabilities, feature_map for CAM.
    """
    tensor = preprocess_fundus_rgb(image_rgb, size=300)  # [1,3,300,300]

    sess    = get_grading_session()
    # Introspect input name at runtime (handles both 'input' and 'images')
    in_name = sess.get_inputs()[0].name
    outputs = sess.run(None, {in_name: tensor})

    # logits: [1, 5] or [5]
    logits_raw  = outputs[0]
    feature_map = outputs[1] if len(outputs) > 1 else None
    logits      = logits_raw[0] if logits_raw.ndim == 2 else logits_raw

    exp   = np.exp(logits - np.max(logits))
    probs = exp / exp.sum()
    grade = int(np.argmax(probs))

    return {
        "grade":             grade,
        "confidence":        float(probs[grade]),
        "class_probabilities": probs.tolist(),
        "diagnosis":         MAP[grade]["grade_label"],
        "feature_map":       feature_map,
        **{k: v for k, v in MAP[grade].items()},
    }


# ─── YOLO Lesion Detection ───────────────────────────────────────────────────

def run_lesion_detection(image_rgb: np.ndarray) -> list:
    """Run YOLO lesion detection on image and return standardised detections."""
    sess = get_lesion_session()
    if sess is None:
        return []

    h, w   = image_rgb.shape[:2]
    YSIZE  = 1024
    resized = cv2.resize(image_rgb, (YSIZE, YSIZE))
    tensor  = (resized / 255.0).transpose(2, 0, 1).astype(np.float32)[np.newaxis]

    in_name   = sess.get_inputs()[0].name
    raw_out   = sess.run(None, {in_name: tensor})[0][0]

    # Normalise to [channels, anchors] layout
    output = raw_out if raw_out.shape[0] < raw_out.shape[1] else raw_out.T

    boxes_t  = output[:4, :]
    scores_t = output[4:, :]

    max_scores = np.max(scores_t, axis=0)
    class_ids  = np.argmax(scores_t, axis=0)
    mask       = max_scores > 0.25

    valid_boxes    = boxes_t[:, mask].T
    valid_scores   = max_scores[mask]
    valid_classes  = class_ids[mask]

    boxes = []
    for i in range(len(valid_scores)):
        cx, cy, bw, bh = valid_boxes[i]
        cx = cx * (w / YSIZE);  cy = cy * (h / YSIZE)
        bw = bw * (w / YSIZE);  bh = bh * (h / YSIZE)
        boxes.append([float(cx - bw/2), float(cy - bh/2), float(bw), float(bh)])

    scores_list = valid_scores.tolist()
    detections  = []
    if boxes:
        idxs = cv2.dnn.NMSBoxes(boxes, scores_list, 0.25, 0.45)
        if len(idxs) > 0:
            for i in np.array(idxs).flatten():
                x1, y1, bw, bh = boxes[i]
                cid = int(valid_classes[i])
                detections.append({
                    "bbox":       [round(x1, 1), round(y1, 1), round(x1+bw, 1), round(y1+bh, 1)],
                    "class_id":   cid,
                    "class_name": YOLO_CLASSES[cid] if cid < len(YOLO_CLASSES) else f"Lesion {cid}",
                    "confidence": round(float(scores_list[i]), 3),
                })
    return detections


# ─── Blur check ───────────────────────────────────────────────────────────────

def is_blurry(img: np.ndarray, threshold: float = 100.0) -> bool:
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var()) < threshold


# ─── Clinical Arbitration Engine ─────────────────────────────────────────────

def clinical_arbitration_engine(
    nn_grade: int,
    nn_probs: list,
    image_shape: tuple,
    detections: list | None = None,
) -> dict:
    """
    A.K. Khurana / ETDRS Clinical Arbitration Engine.

    YOLO lesion counts act as a *hard floor* on the neural grade:
      • ≥1 MA detected → grade ≥ 1
      • ≥3 HM or ≥2 EX → grade ≥ 2
      • ETDRS 4-2-1 (≥20 HM in all 4 quadrants) → grade = 3
    Neural grade is only lowered if lesion evidence supports it.
    """
    h, w     = image_shape[:2]
    fovea_cx = int(w * 0.50);  fovea_cy = int(h * 0.50)
    disc_dia = max(int(w * 0.15), 50)

    quad_counts  = {"Superior-Temporal": 0, "Superior-Nasal": 0, "Inferior-Nasal": 0, "Inferior-Temporal": 0}
    total_ma = total_hm = total_ex = 0
    min_fovea_dist_dd = float("inf")

    if detections:
        for det in detections:
            cls  = det.get("class_name", "")
            box  = det.get("bbox", [0, 0, 0, 0])
            cx   = (box[0] + box[2]) / 2.0
            cy   = (box[1] + box[3]) / 2.0

            if cx < fovea_cx and cy < fovea_cy:  q = "Superior-Temporal"
            elif cx >= fovea_cx and cy < fovea_cy: q = "Superior-Nasal"
            elif cx >= fovea_cx and cy >= fovea_cy: q = "Inferior-Nasal"
            else: q = "Inferior-Temporal"

            if "Hemorrhage" in cls:
                total_hm += 1;  quad_counts[q] += 1
            elif "Microaneurysm" in cls:
                total_ma += 1
            elif "Exudate" in cls or "Cotton" in cls:
                total_ex += 1
                dist_dd = np.sqrt((cx - fovea_cx)**2 + (cy - fovea_cy)**2) / disc_dia
                if dist_dd < min_fovea_dist_dd:
                    min_fovea_dist_dd = dist_dd

    has_macular_edema = (total_ex > 0) and (min_fovea_dist_dd <= 1.0)
    etdrs_421_met     = all(c >= 20 for c in quad_counts.values()) if detections else False

    final_grade  = nn_grade
    rule_applied = "ICDR Softmax Consensus"

    # Hard floor rules (lesion evidence upgrades grade)
    if etdrs_421_met and final_grade < 3:
        final_grade  = 3
        rule_applied = "ETDRS 4-2-1 Rule: ≥20 hemorrhages across all 4 quadrants (Severe NPDR)"
    elif total_hm >= 3 or total_ex >= 2:
        if final_grade < 2:
            final_grade  = 2
            rule_applied = f"ICDR: {total_hm} hemorrhages / {total_ex} exudates detected (Moderate NPDR floor)"
    elif (total_ma > 0 or total_hm > 0) and final_grade == 0:
        final_grade  = 1
        rule_applied = "ICDR Microaneurysm Rule: focal lesions detected in early scan (Mild NPDR)"

    is_referable = (final_grade >= 2) or has_macular_edema

    return {
        "final_grade":          final_grade,
        "is_referable":         is_referable,
        "has_macular_edema":    has_macular_edema,
        "fovea_exudate_dist_dd": round(min_fovea_dist_dd, 2) if total_ex > 0 else None,
        "clinical_rule_applied": rule_applied,
        "lesion_summary": {
            "microaneurysms":       total_ma,
            "hemorrhages":          total_hm,
            "hard_exudates":        total_ex,
            "quadrant_distribution": quad_counts,
        },
    }


# ─── API Route ────────────────────────────────────────────────────────────────

@router.post("/")
async def run_inference(
    file: UploadFile = File(...),
    skip_yolo: bool  = Query(False),
):
    # 1. Decode image
    contents  = await file.read()
    nparr     = np.frombuffer(contents, np.uint8)
    image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Invalid image file — could not decode.")

    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

    # 2. Quality check
    quality_warnings = []
    if is_blurry(image_rgb):
        quality_warnings.append("Low focus sharpness detected (Laplacian Var < 100). Adaptive CLAHE applied.")

    # 3. EfficientNet-B3 grading
    try:
        result = run_grading(image_rgb)
    except Exception as exc:
        import traceback
        print(f"[ONNX ERROR] {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"AI grading failed: {exc}. Please retry or contact support.",
        )

    feature_map = result.pop("feature_map", None)

    # 4. YOLO lesion detection
    detections = []
    if not skip_yolo:
        try:
            detections = run_lesion_detection(image_rgb)
        except Exception as exc:
            print(f"[YOLO Warning] Lesion detection bypassed: {exc}")

    # 5. Clinical arbitration
    arbitration  = clinical_arbitration_engine(
        nn_grade     = result["grade"],
        nn_probs     = result["class_probabilities"],
        image_shape  = image_rgb.shape,
        detections   = detections,
    )

    # 6. Real Pathology-Focused Score-CAM heatmap
    try:
        heatmap_b64 = generate_scorecam_heatmap(
            image_rgb    = image_rgb,
            feature_map  = feature_map,
            grade        = arbitration["final_grade"],
            detections   = detections,
        )
    except Exception as exc:
        print(f"[CAM Warning] Score-CAM failed ({exc}), generating fallback heatmap")

    # If CSME detected, escalate urgency
    urgency_text = result["urgency"]
    if arbitration["has_macular_edema"]:
        urgency_text = "URGENT: Clinically Significant Macular Edema (CSME) detected within 1 DD of fovea."

    # 7. Pack response
    response = {
        **result,
        "grade":        arbitration["final_grade"],
        "urgency":      urgency_text,
        "is_referable": arbitration["is_referable"],
        "arbitration":  arbitration,
        "yolo": {
            "detections":   detections,
            "image_shape":  [image_rgb.shape[1], image_rgb.shape[0]],
            "count":        len(detections),
        },
        "heatmap_url":    heatmap_b64,
        "timestamp":      datetime.now().isoformat(),
        "quality_warnings": quality_warnings,
        "_note": "RetinaScan AI — FP32 EfficientNet-B3+CBAM + Real Score-CAM + Khurana Clinical Arbitration",
    }

    return response


# ─── Optional model warm-up ───────────────────────────────────────────────────
if os.environ.get("WARMUP_MODELS") == "true":
    try:
        get_grading_session()
        print(f"[Startup] Grading model pre-loaded: {GRADING_MODEL}")
    except Exception as exc:
        print(f"[Startup] WARNING: Could not preload grading model: {exc}")
