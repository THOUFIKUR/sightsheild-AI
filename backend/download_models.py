"""
download_models.py — Runs at startup on Railway/Render/any cloud host.

On platforms that clone repos without Git LFS support (e.g., Railway free tier),
the .onnx files in the repo are tiny LFS pointer text files (~130 bytes) instead
of the real model binaries. This script detects that case and downloads the real
model binaries from the GitHub CDN before the FastAPI server starts.

Updated 2026-09: retina_model.onnx is ~42.7 MB (FP32, EfficientNet-B3+CBAM, all weights embedded).
MIN_VALID_SIZES has per-model thresholds so each file is validated independently.
"""

import os
import sys
import urllib.request
from pathlib import Path

MODEL_DIR = Path(__file__).parent / "models"

MODELS = {
    # retina_model.onnx — FP32 EfficientNet-B3+CBAM, ~42.7 MB (all weights embedded)
    "retina_model.onnx": {
        "url": "https://media.githubusercontent.com/media/THOUFIKUR/sih2026/main/backend/models/retina_model.onnx",
        "min_bytes": 40_000_000,  # Real model is ~42.7 MB; LFS pointer is ~130 bytes
    },
    # yolo_lesions.onnx — INT8 YOLO, ~11.5 MB
    "yolo_lesions.onnx": {
        "url": "https://media.githubusercontent.com/media/THOUFIKUR/sih2026/main/backend/models/yolo_lesions.onnx",
        "min_bytes": 10 * 1024 * 1024,  # 10 MB threshold for the larger YOLO model
    },
}


def is_lfs_pointer(path: Path, min_bytes: int) -> bool:
    """Return True if the file is a Git LFS text pointer or missing."""
    if not path.exists():
        return True  # Missing entirely — treat as needing download
    return path.stat().st_size < min_bytes


def download(name: str, url: str, dest: Path):
    print(f"[download_models] Downloading {name} from GitHub CDN...", flush=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    def reporthook(count, block_size, total_size):
        if total_size > 0 and count % 100 == 0:
            pct = min(100, count * block_size * 100 // total_size)
            print(f"  {pct}% ({count * block_size // 1024 // 1024} MB)", flush=True)

    try:
        urllib.request.urlretrieve(url, dest, reporthook)
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"[download_models] ✅ {name} saved ({size_mb:.1f} MB)", flush=True)
    except Exception as e:
        print(f"[download_models] ❌ Failed to download {name}: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    print("[download_models] Checking ONNX model files...", flush=True)
    any_downloaded = False

    for name, cfg in MODELS.items():
        dest      = MODEL_DIR / name
        min_bytes = cfg["min_bytes"]
        url       = cfg["url"]

        if is_lfs_pointer(dest, min_bytes):
            size = dest.stat().st_size if dest.exists() else 0
            print(
                f"[download_models] {name} is missing or an LFS pointer ({size} bytes). "
                f"Downloading real binary (min expected: {min_bytes // 1024} KB)...",
                flush=True,
            )
            download(name, url, dest)
            any_downloaded = True
        else:
            size_mb = dest.stat().st_size / 1024 / 1024
            print(f"[download_models] ✅ {name} OK ({size_mb:.1f} MB) — skipping download.", flush=True)

    if any_downloaded:
        print("[download_models] All models ready. Starting server...", flush=True)
    else:
        print("[download_models] All models already present. Starting server...", flush=True)


if __name__ == "__main__":
    main()
