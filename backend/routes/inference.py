"""
inference.py — RetinaScan AI Cloud Inference Router
====================================================
Runs EfficientNet-B3 + CBAM grading and YOLO lesion detection on the server.

Key facts (2026-09 audit):
• Retinal-aware preprocessing: auto-crop black border → square pad → 300×300
• Heatmap: tries real gradient Grad-CAM (true_gradcam.py) first;
  falls back to generate_heuristic_saliency_map() (CLAHE/BG-subtraction/YOLO)
  ONLY when the PyTorch checkpoint is unavailable — fallback is always explicitly
  labeled [HEURISTIC FALLBACK] in logs and response metadata.
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


# ─── Heuristic Saliency Map (CLAHE + BG-subtraction + YOLO fusion) ────────────
# NOTE: This is NOT Grad-CAM. It does not compute gradients or use feature maps.
# It is a classical image-processing saliency heuristic retained as an explicit
# fallback when the PyTorch checkpoint for real Grad-CAM is unavailable.

def generate_heuristic_saliency_map(
    image_rgb: np.ndarray,
    grade: int = 0,
    detections: list | None = None,
) -> str:
    """
    HEURISTIC SALIENCY MAP — NOT GRAD-CAM.

    Method: CLAHE on green channel → background subtraction → Gaussian blur →
    threshold → YOLO bounding-box Gaussian foci overlay → JET colormap blend.

    This does NOT compute gradients, does NOT use the model's feature maps,
    and is NOT a gradient-class activation map.
    Use only as an explicitly-labeled fallback when the PyTorch checkpoint is
    unavailable for real Grad-CAM computation.
    """
    if len(image_rgb.shape) == 2:
        image_rgb = cv2.cvtColor(image_rgb, cv2.COLOR_GRAY2RGB)
    image_np = image_rgb[:, :, :3]

    # Green channel extraction (maximal haemoglobin absorption)
    green = image_np[:, :, 1]

    # Adaptive CLAHE to equalize fundus illumination across macula and periphery
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(green)

    # Isolate high-frequency lesion and microvascular features by subtracting smooth background
    background = cv2.GaussianBlur(enhanced, (25, 25), 0)
    diff = cv2.absdiff(enhanced, background)

    # Focus attention on lesions and microvascular structures (high-variance areas)
    _, thresh = cv2.threshold(diff, 20, 255, cv2.THRESH_TOZERO)
    blurred_diff = cv2.GaussianBlur(thresh, (15, 15), 0)
    norm_heatmap = cv2.normalize(blurred_diff, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    # Fuse YOLO lesion detections as attention foci if present
    if detections:
        h, w = norm_heatmap.shape
        y_grid, x_grid = np.ogrid[:h, :w]
        for det in detections:
            bbox = det.get("bbox", [0, 0, 0, 0])
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0
            radius = max(int(min(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 1.5), 25)
            spot = np.exp(-((x_grid - cx) ** 2 + (y_grid - cy) ** 2) / (2.0 * (radius ** 2))) * 255.0
            norm_heatmap = np.clip(norm_heatmap.astype(np.float32) + spot * 0.7, 0, 255).astype(np.uint8)

    # Apply colormap JET
    colored_map = cv2.applyColorMap(norm_heatmap, cv2.COLORMAP_JET)

    # Blend with original fundus scan (65% original + 35% heuristic heatmap)
    blended = cv2.addWeighted(image_np, 0.65, colored_map, 0.35, 0)
    _, buffer = cv2.imencode(".jpg", cv2.cvtColor(blended, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")


def generate_best_available_heatmap(
    image_rgb: np.ndarray,
    grade: int = 0,
    detections: list | None = None,
) -> tuple:
    """
    Returns (heatmap_b64: str, heatmap_method: str, provenance: dict).

    Priority:
      1. Real gradient Grad-CAM via backend.utils.true_gradcam
         → heatmap_method = 'grad_cam' | 'grad_cam_not_verified'
      2. Heuristic saliency map (CLAHE/BG-subtraction/YOLO) as explicit fallback
         → heatmap_method = 'heuristic_saliency_FALLBACK'

    Never silently substitutes heuristic for Grad-CAM.
    Always returns the method label so callers and API responses are transparent.
    """
    try:
        from backend.utils.true_gradcam import generate_gradcam_heatmap, GRADCAM_STATUS, PROVENANCE_RECORD
        heatmap, provenance = generate_gradcam_heatmap(image_rgb, target_class=grade)
        method = "grad_cam" if GRADCAM_STATUS == "VERIFIED" else "grad_cam_NOT_VERIFIED"
        print(f"[Heatmap] Real Grad-CAM used. Status: {GRADCAM_STATUS}")
        return heatmap, method, provenance
    except FileNotFoundError as e:
        print(f"[Heatmap] [HEURISTIC FALLBACK] Real Grad-CAM unavailable: {e}")
    except Exception as e:
        print(f"[Heatmap] [HEURISTIC FALLBACK] Grad-CAM error: {e}")

    heatmap = generate_heuristic_saliency_map(image_rgb, grade=grade, detections=detections)
    provenance = {
        "status": "HEURISTIC_FALLBACK",
        "method": "CLAHE + background subtraction + YOLO Gaussian foci",
        "note": "PyTorch checkpoint unavailable. Heuristic saliency used — NOT Grad-CAM.",
    }
    return heatmap, "heuristic_saliency_FALLBACK", provenance


# ─── EfficientNet-B3 Grading ──────────────────────────────────────────────────


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

    # 6. Best-available heatmap: real Grad-CAM if checkpoint present, heuristic saliency fallback
    heatmap_method = "heuristic_saliency_FALLBACK"
    heatmap_provenance = {}
    try:
        heatmap_b64, heatmap_method, heatmap_provenance = generate_best_available_heatmap(
            image_rgb  = image_rgb,
            grade      = arbitration["final_grade"],
            detections = detections,
        )
    except Exception as exc:
        print(f"[Heatmap] Error generating heatmap: {exc}")
        heatmap_b64 = generate_heuristic_saliency_map(image_rgb, grade=arbitration["final_grade"], detections=detections)
        heatmap_method = "heuristic_saliency_FALLBACK"
        heatmap_provenance = {"status": "HEURISTIC_FALLBACK", "note": str(exc)}

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
        "heatmap_url":       heatmap_b64,
        "heatmap_method":    heatmap_method,
        "heatmap_provenance": heatmap_provenance,
        "timestamp":         datetime.now().isoformat(),
        "quality_warnings":  quality_warnings,
        "_note": "RetinaScan AI — FP32 EfficientNet-B3+CBAM + ETDRS Clinical Arbitration | heatmap_method field indicates Grad-CAM vs heuristic fallback",
    }

    return response


# ─── Optional model warm-up ───────────────────────────────────────────────────
if os.environ.get("WARMUP_MODELS") == "true":
    try:
        get_grading_session()
        print(f"[Startup] Grading model pre-loaded: {GRADING_MODEL}")
    except Exception as exc:
        print(f"[Startup] WARNING: Could not preload grading model: {exc}")
