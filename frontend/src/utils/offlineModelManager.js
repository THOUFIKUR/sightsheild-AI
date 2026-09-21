/**
 * offlineModelManager.js — Manages offline AI model downloading and IndexedDB caching.
 * Ensures the EfficientNet-B3 and YOLOv8 ONNX models (~56 MB total) are downloaded
 * while online and cached in IndexedDB so offline inference works seamlessly in the field.
 */

const IDB_NAME = 'retinascan-models';
const IDB_VERSION = 2;
const IDB_STORE = 'onnx-binaries';

const RETINA_KEY = `retina_model_v${IDB_VERSION}`;
const YOLO_KEY   = `yolo_lesions_v${IDB_VERSION}`;

const RETINA_LOCAL = '/models/retina_model.onnx';
const YOLO_LOCAL   = '/models/yolo_lesions.onnx';

const RETINA_CDN = 'https://media.githubusercontent.com/media/THOUFIKUR/sih2026/main/backend/models/retina_model.onnx';
const YOLO_CDN   = 'https://media.githubusercontent.com/media/THOUFIKUR/sih2026/main/backend/models/yolo_lesions.onnx';

// Expected sizes in bytes
const MIN_VALID_SIZE = 500_000; // >500 KB to avoid Git LFS pointer files (~133 B)

let isDownloading = false;
const listeners = new Set();

function notifyListeners(state) {
    listeners.forEach((fn) => {
        try { fn(state); } catch (e) { console.error('[offlineModelManager] listener error:', e); }
    });
}

export function subscribeModelStatus(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function openModelDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

async function idbGet(db, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

async function idbPut(db, key, value) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror   = (e) => reject(e.target.error);
    });
}

/**
 * Checks if both models are cached and valid in IndexedDB.
 */
export async function checkOfflineModelsStatus() {
    try {
        const db = await openModelDB();
        const [retinaBuf, yoloBuf] = await Promise.all([
            idbGet(db, RETINA_KEY),
            idbGet(db, YOLO_KEY),
        ]);

        const retinaOk = !!(retinaBuf && retinaBuf.byteLength >= MIN_VALID_SIZE);
        const yoloOk   = !!(yoloBuf && yoloBuf.byteLength >= MIN_VALID_SIZE);

        const ready = retinaOk && yoloOk;
        const totalBytes = (retinaBuf?.byteLength || 0) + (yoloBuf?.byteLength || 0);

        return {
            ready,
            retinaOk,
            yoloOk,
            sizeMB: parseFloat((totalBytes / (1024 * 1024)).toFixed(1)),
            isDownloading,
        };
    } catch (e) {
        console.warn('[offlineModelManager] Failed to check status:', e.message);
        return { ready: false, retinaOk: false, yoloOk: false, sizeMB: 0, isDownloading };
    }
}

/**
 * Downloads a model with progress tracking and stores in IndexedDB.
 */
async function fetchAndCacheModel(localUrl, cdnUrl, cacheKey, onProgress) {
    // Check if already in IDB
    try {
        const db = await openModelDB();
        const existing = await idbGet(db, cacheKey);
        if (existing && existing.byteLength >= MIN_VALID_SIZE) {
            console.log(`[offlineModelManager] ✅ ${cacheKey} already cached (${(existing.byteLength / 1e6).toFixed(1)} MB)`);
            return existing;
        }
    } catch (idbErr) {
        console.warn('[offlineModelManager] IDB check error:', idbErr.message);
    }

    let candidateBuf = null;

    // 1. Try local path
    try {
        const res = await fetch(localUrl);
        if (res.ok) {
            const buf = await res.arrayBuffer();
            if (buf.byteLength >= MIN_VALID_SIZE) {
                candidateBuf = buf;
                console.log(`[offlineModelManager] Fetched local ${localUrl} (${(buf.byteLength / 1e6).toFixed(1)} MB)`);
            } else {
                console.log(`[offlineModelManager] Local ${localUrl} is LFS pointer (${buf.byteLength} B) — falling back to CDN`);
            }
        }
    } catch (err) {
        console.warn(`[offlineModelManager] Local fetch failed for ${localUrl}:`, err.message);
    }

    // 2. Try CDN if local is missing or an LFS pointer
    if (!candidateBuf && cdnUrl) {
        console.log(`[offlineModelManager] Downloading from CDN: ${cdnUrl}`);
        const res = await fetch(cdnUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${cdnUrl}`);

        const contentLength = res.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        if (res.body && window.ReadableStream && total > 0) {
            const reader = res.body.getReader();
            const chunks = [];
            let received = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
                if (onProgress) {
                    onProgress(received, total);
                }
            }

            // Concatenate chunks
            const fullArray = new Uint8Array(received);
            let offset = 0;
            for (const chunk of chunks) {
                fullArray.set(chunk, offset);
                offset += chunk.length;
            }
            candidateBuf = fullArray.buffer;
        } else {
            candidateBuf = await res.arrayBuffer();
        }
    }

    if (!candidateBuf || candidateBuf.byteLength < MIN_VALID_SIZE) {
        throw new Error(`Failed to obtain valid model binary for ${cacheKey}`);
    }

    // Store in IndexedDB
    try {
        const db = await openModelDB();
        await idbPut(db, cacheKey, candidateBuf);
        console.log(`[offlineModelManager] ✅ Stored ${cacheKey} in IndexedDB (${(candidateBuf.byteLength / 1e6).toFixed(1)} MB)`);
    } catch (storeErr) {
        console.warn(`[offlineModelManager] Failed to store ${cacheKey} in IDB:`, storeErr.message);
    }

    return candidateBuf;
}

/**
 * Downloads and caches all required models for offline mode.
 * Safe to call multiple times (idempotent).
 */
export async function downloadAllOfflineModels(progressCallback) {
    if (isDownloading) return;
    isDownloading = true;

    notifyListeners({ status: 'downloading', progress: 0, message: 'Checking offline model cache…' });

    try {
        const status = await checkOfflineModelsStatus();
        if (status.ready) {
            isDownloading = false;
            notifyListeners({ status: 'ready', progress: 100, message: 'Offline AI models are ready ✅' });
            return status;
        }

        // Download retina model
        notifyListeners({ status: 'downloading', progress: 10, message: 'Downloading EfficientNet-B3 model…' });
        await fetchAndCacheModel(
            RETINA_LOCAL,
            RETINA_CDN,
            RETINA_KEY,
            (received, total) => {
                const pct = Math.round((received / total) * 50);
                const mb = (received / 1e6).toFixed(1);
                const totalMb = (total / 1e6).toFixed(1);
                const msg = `Downloading Grading AI: ${mb}/${totalMb} MB (${pct * 2}%)`;
                if (progressCallback) progressCallback({ percent: pct, message: msg });
                notifyListeners({ status: 'downloading', progress: pct, message: msg });
            }
        );

        // Download YOLO lesions model
        notifyListeners({ status: 'downloading', progress: 55, message: 'Downloading YOLO Lesion model…' });
        await fetchAndCacheModel(
            YOLO_LOCAL,
            YOLO_CDN,
            YOLO_KEY,
            (received, total) => {
                const pct = 50 + Math.round((received / total) * 50);
                const mb = (received / 1e6).toFixed(1);
                const totalMb = (total / 1e6).toFixed(1);
                const msg = `Downloading Lesion AI: ${mb}/${totalMb} MB (${pct}%)`;
                if (progressCallback) progressCallback({ percent: pct, message: msg });
                notifyListeners({ status: 'downloading', progress: pct, message: msg });
            }
        );

        isDownloading = false;
        notifyListeners({ status: 'ready', progress: 100, message: 'Offline AI models cached successfully ✅' });
        return { ready: true };
    } catch (err) {
        isDownloading = false;
        console.error('[offlineModelManager] Download error:', err);
        notifyListeners({ status: 'error', progress: 0, message: err.message });
        throw err;
    }
}

/**
 * Automatically checks and prewarms models in background if online.
 * Never blocks the main thread or user experience.
 */
export async function autoPrewarmIfOnline() {
    if (typeof window === 'undefined' || !navigator.onLine) return;

    try {
        const status = await checkOfflineModelsStatus();
        if (status.ready) {
            notifyListeners({ status: 'ready', progress: 100, message: 'Offline AI models ready' });
            return;
        }

        // Wait 3 seconds after page load so it doesn't compete with initial rendering
        setTimeout(() => {
            if (navigator.onLine && !isDownloading) {
                console.log('[offlineModelManager] Starting automatic background prewarm for offline models…');
                downloadAllOfflineModels().catch((e) => {
                    console.warn('[offlineModelManager] Background prewarm completed with note:', e.message);
                });
            }
        }, 3000);
    } catch (e) {
        console.warn('[offlineModelManager] autoPrewarm check failed:', e.message);
    }
}
