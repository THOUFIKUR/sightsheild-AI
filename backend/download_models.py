"""
download_models.py — Runs at startup on Railway/Render/any cloud host.

On platforms that clone repos without Git LFS support (e.g., Railway free tier),
the .onnx files in the repo are tiny LFS pointer text files (~130 bytes) instead
of the real model binaries. This script detects that case and downloads the real
model binaries from the GitHub CDN before the FastAPI server starts.
"""

import os
import sys
import urllib.request
from pathlib import Path

MODEL_DIR = Path(__file__).parent / "models"

MODELS = {
    "retina_model.onnx": "https://media.githubusercontent.com/media/THOUFIKUR/sih2026/main/backend/models/retina_model.onnx",
    "yolo_lesions.onnx":  "https://media.githubusercontent.com/media/THOUFIKUR/sih2026/main/backend/models/yolo_lesions.onnx",
}

# Minimum expected size for a real ONNX binary (10 MB)
MIN_VALID_SIZE = 10 * 1024 * 1024


def is_lfs_pointer(path: Path) -> bool:
    """Return True if the file is a Git LFS text pointer (< 1 KB)."""
    if not path.exists():
        return True  # Missing entirely — treat as needing download
    return path.stat().st_size < MIN_VALID_SIZE


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

    for name, url in MODELS.items():
        dest = MODEL_DIR / name
        if is_lfs_pointer(dest):
            size = dest.stat().st_size if dest.exists() else 0
            print(f"[download_models] {name} is missing or an LFS pointer ({size} bytes). Downloading real binary...", flush=True)
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
