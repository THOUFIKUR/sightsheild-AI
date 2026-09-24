"""
backend/training/write_training_results.py
==========================================
Writes real training metrics to TRAINING_RESULTS.md with full provenance.

Called after train_dr_classifier.py completes successfully.
Receives all computed values as parameters — nothing is hardcoded.

Usage (from train_dr_classifier.py or standalone):
    from backend.training.write_training_results import write_results
    write_results(
        model_path      = str(MODEL_DIR / 'retina_model.onnx'),
        checkpoint_path = str(MODEL_DIR / 'best_retinascan_model.pt'),
        dataset_path    = str(DATA_PATH),
        split_info      = {'train_size': 300, 'val_size': 50, 'strategy': 'StratifiedShuffleSplit'},
        hyperparams     = {'lr': 1e-4, 'batch_size': 16, 'epochs': 30, ...},
        accuracy        = float,
        qwk             = float,
        per_class_metrics = [{'sensitivity': float, 'specificity': float}, ...],
        confusion_matrix  = np.ndarray,
        class_names       = ['Grade 0', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'],
    )

Amendment 9 compliance:
  - Records exact model path, architecture, checkpoint hash, dataset path, split info,
    preprocessing version, class ordering, hyperparameters
  - Does NOT associate training metrics with the deployed ONNX unless checkpoint hash
    can be verified against the ONNX model
"""

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

REPO_ROOT = Path(__file__).parent.parent.parent
OUTPUT_PATH = REPO_ROOT / "TRAINING_RESULTS.md"


def _sha256(path: str) -> str:
    if not os.path.exists(path):
        return "FILE_NOT_FOUND"
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _onnx_classifier_hash(onnx_path: str) -> Optional[str]:
    """Extract SHA-256 of the classifier.1.weight tensor from ONNX for provenance cross-check."""
    if not os.path.exists(onnx_path):
        return None
    try:
        import onnx
        m = onnx.load(onnx_path)
        for init in m.graph.initializer:
            if "classifier.1.weight" in init.name:
                arr = onnx.numpy_helper.to_array(init)
                return hashlib.sha256(arr.tobytes()).hexdigest()
    except Exception as e:
        return f"ERROR: {e}"
    return None


def _compute_binary_referable_metrics(confusion_matrix: np.ndarray) -> Dict[str, float]:
    """
    From a 5-class confusion matrix, compute binary referable DR metrics.
    Non-referable = Grade 0 + 1
    Referable     = Grade 2 + 3 + 4
    Returns: sensitivity, specificity, PPV, NPV
    """
    cm = np.array(confusion_matrix)
    # Collapse to 2×2: non-referable (0-1) vs referable (2-4)
    tp = cm[2:, 2:].sum()   # referable predicted as referable
    fn = cm[2:, :2].sum()   # referable predicted as non-referable
    fp = cm[:2, 2:].sum()   # non-referable predicted as referable
    tn = cm[:2, :2].sum()   # non-referable predicted as non-referable

    sensitivity = tp / (tp + fn) if (tp + fn) > 0 else float("nan")
    specificity = tn / (tn + fp) if (tn + fp) > 0 else float("nan")
    ppv = tp / (tp + fp) if (tp + fp) > 0 else float("nan")
    npv = tn / (tn + fn) if (tn + fn) > 0 else float("nan")

    return {
        "sensitivity":  round(float(sensitivity), 4),
        "specificity":  round(float(specificity), 4),
        "ppv":          round(float(ppv), 4),
        "npv":          round(float(npv), 4),
        "TP": int(tp), "FN": int(fn), "FP": int(fp), "TN": int(tn),
    }


def write_results(
    model_path: str,
    checkpoint_path: str,
    dataset_path: str,
    dataset_version: str,
    split_info: Dict[str, Any],
    architecture: str,
    preprocessing_version: str,
    class_names: List[str],
    hyperparams: Dict[str, Any],
    accuracy: float,
    qwk: float,
    per_class_metrics: List[Dict[str, float]],
    confusion_matrix: np.ndarray,
    calibration_info: Optional[Dict[str, Any]] = None,
    extra_notes: Optional[str] = None,
) -> str:
    """
    Write TRAINING_RESULTS.md with full provenance.

    Returns the path to the written file.
    Every value in the output comes directly from the passed-in computed variables.
    No values are hardcoded.

    Raises AssertionError if:
      - extra_notes contains 'TEST' (rejects test/demo runs)
      - confusion_matrix.sum() != split_info['val_size'] (CM must match val set size)
      - passed accuracy does not match CM-computed accuracy (within 0.001)
    """
    # ── Guard: reject test runs ───────────────────────────────────────────────
    if extra_notes and "TEST" in str(extra_notes).upper():
        raise AssertionError(
            f"write_results() refused: extra_notes contains 'TEST' ({extra_notes!r}). "
            "Do not write test/demo outputs to TRAINING_RESULTS.md."
        )

    # ── Guard: CM sum must match val_size ────────────────────────────────────
    cm_total = int(np.array(confusion_matrix).sum())
    val_size = split_info.get("val_size")
    if val_size is not None:
        assert cm_total == int(val_size), (
            f"confusion_matrix.sum()={cm_total} != split_info['val_size']={val_size}. "
            "The confusion matrix must cover exactly the validation set."
        )

    # ── Guard: accuracy must match CM ────────────────────────────────────────
    cm_arr = np.array(confusion_matrix)
    cm_accuracy = float(np.trace(cm_arr) / cm_arr.sum()) if cm_arr.sum() > 0 else float("nan")
    assert abs(accuracy - cm_accuracy) <= 0.001, (
        f"Passed accuracy={accuracy:.4f} does not match CM-computed accuracy={cm_accuracy:.4f} "
        f"(diagonal sum {int(np.trace(cm_arr))} / total {cm_total}). "
        "Recompute accuracy directly from the same confusion matrix."
    )

    ts = datetime.now(timezone.utc).isoformat()

    # ── Hashes for provenance ────────────────────────────────────────────────
    ckpt_hash  = _sha256(checkpoint_path)
    onnx_hash  = _sha256(model_path)
    onnx_cls_hash = _onnx_classifier_hash(model_path)

    # ── Verify checkpoint → ONNX provenance ─────────────────────────────────
    provenance_match = "NOT CHECKED"
    try:
        import torch
        ckpt = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        sd = ckpt.get("state_dict", ckpt.get("model_state_dict", ckpt)) if isinstance(ckpt, dict) else {}
        if "classifier.1.weight" in sd:
            pt_cls_hash = hashlib.sha256(sd["classifier.1.weight"].cpu().numpy().tobytes()).hexdigest()
            provenance_match = "VERIFIED" if (pt_cls_hash == onnx_cls_hash) else f"MISMATCH (PT={pt_cls_hash[:16]}..., ONNX={str(onnx_cls_hash)[:16] if onnx_cls_hash else 'N/A'}...)"
        else:
            provenance_match = "CANNOT VERIFY — classifier.1.weight not in state_dict"
    except Exception as e:
        provenance_match = f"ERROR: {e}"

    # ── Binary referable metrics ─────────────────────────────────────────────
    binary_metrics = _compute_binary_referable_metrics(confusion_matrix)

    # ── Format confusion matrix ───────────────────────────────────────────────
    cm = np.array(confusion_matrix)
    cm_header = "| Pred→ | " + " | ".join(class_names) + " |"
    cm_sep    = "|" + "|".join(["---"] * (len(class_names) + 1)) + "|"
    cm_rows   = []
    for i, name in enumerate(class_names):
        row_vals = " | ".join(str(int(cm[i, j])) for j in range(len(class_names)))
        cm_rows.append(f"| **{name}** | {row_vals} |")
    cm_text = "\n".join([cm_header, cm_sep] + cm_rows)

    # ── Format per-class metrics ──────────────────────────────────────────────
    pc_header = "| Class | Sensitivity | Specificity |"
    pc_sep    = "|---|---|---|"
    pc_rows   = []
    for i, (name, m) in enumerate(zip(class_names, per_class_metrics)):
        pc_rows.append(f"| {name} | {m.get('sensitivity', float('nan')):.4f} | {m.get('specificity', float('nan')):.4f} |")
    pc_text = "\n".join([pc_header, pc_sep] + pc_rows)

    # ── Build Markdown ───────────────────────────────────────────────────────
    md = f"""# TRAINING_RESULTS.md
<!-- AUTO-GENERATED by write_training_results.py — do not edit manually -->
<!-- All values come directly from computed variables. Nothing is hardcoded. -->

## Timestamp
{ts}

## Model Provenance

| Field | Value |
|---|---|
| Architecture | {architecture} |
| Checkpoint | `{checkpoint_path}` |
| Checkpoint SHA-256 | `{ckpt_hash}` |
| ONNX Model | `{model_path}` |
| ONNX SHA-256 | `{onnx_hash}` |
| ONNX classifier.1.weight SHA-256 | `{onnx_cls_hash or 'N/A'}` |
| Checkpoint→ONNX Provenance | **{provenance_match}** |

> [!{"NOTE" if provenance_match == "VERIFIED" else "WARNING"}]
> Checkpoint↔ONNX provenance: **{provenance_match}**.
> {"Training metrics below are from the same model as the deployed ONNX." if provenance_match == "VERIFIED" else "Training metrics CANNOT be associated with the deployed ONNX model."}

## Dataset

| Field | Value |
|---|---|
| Dataset path | `{dataset_path}` |
| Dataset version | {dataset_version} |
| Train size | {split_info.get('train_size', 'N/A')} |
| Val/Test size | {split_info.get('val_size', 'N/A')} |
| Split strategy | {split_info.get('strategy', 'N/A')} |

## Preprocessing

{preprocessing_version}

## Class Ordering

{', '.join(f'{i}: {n}' for i, n in enumerate(class_names))}

## Hyperparameters

```json
{json.dumps(hyperparams, indent=2, default=str)}
```

## Results — Five-Class ICDR Performance

| Metric | Value |
|---|---|
| Accuracy | {accuracy:.4f} |
| Quadratic Weighted Kappa (QWK) | {qwk:.4f} |

### Per-Class Sensitivity / Specificity

{pc_text}

## Results — Binary Referable DR Performance

> Non-referable = Grade 0–1 | Referable = Grade 2–4

| Metric | Value |
|---|---|
| Sensitivity | {binary_metrics['sensitivity']:.4f} |
| Specificity | {binary_metrics['specificity']:.4f} |
| PPV (Positive Predictive Value) | {binary_metrics['ppv']:.4f} |
| NPV (Negative Predictive Value) | {binary_metrics['npv']:.4f} |
| TP | {binary_metrics['TP']} |
| FP | {binary_metrics['FP']} |
| FN | {binary_metrics['FN']} |
| TN | {binary_metrics['TN']} |

> [!NOTE]
> PS targets: >90% sensitivity, >85% specificity for referable DR.

## Confusion Matrix (5-class)

{cm_text}

## Confidence Calibration

{json.dumps(calibration_info, indent=2, default=str) if calibration_info else "NOT PERFORMED — calibration_info not provided. Do not label raw softmax probability as calibrated."}

## Notes

{extra_notes or "None."}

---
*Generated by `backend/training/write_training_results.py` — SIH26038*
"""

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(md)

    print(f"[TrainingResults] Written to: {OUTPUT_PATH}")
    print(f"[TrainingResults] Accuracy={accuracy:.4f} | QWK={qwk:.4f} | Provenance={provenance_match}")
    return str(OUTPUT_PATH)


if __name__ == "__main__":
    # Example: run with dummy values to test output format
    print("[write_training_results] Run from train_dr_classifier.py with real computed values.")
    print("  Do not call directly with dummy/placeholder values.")
