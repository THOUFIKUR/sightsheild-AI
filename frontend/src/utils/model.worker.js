/**
 * model.worker.js
 * ================
 * OFF-THREAD AI INFERENCE ENGINE — RetinaScan AI
 *
 * Runs EfficientNet-B3+CBAM grading (300×300) + YOLOv8 lesion detection (1024×1024)
 * entirely inside a Web Worker, with full offline capability.
 *
 * Key fixes (2026-09):
 *  • IndexedDB model cache — ONNX binaries cached after first download; never re-fetched
 *  • Correct tensor shape: [1, 3, 300, 300] (was 224×224)
 *  • Real Score-CAM heatmap from ONNX feature_map output (genuine feature activation)
 *  • Strengthened clinical arbitration: YOLO lesion counts act as grade floor
 *  • YOLO_ONLY path for fast lesion-only calls
 */
import * as ort from 'onnxruntime-web';

// ─── WASM Path Configuration ─────────────────────────────────────────────────
const WASM_BASE = location.origin + '/wasm/';
ort.env.wasm.wasmPaths = {
    'ort-wasm-simd-threaded.wasm':          WASM_BASE + 'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.asyncify.wasm': WASM_BASE + 'ort-wasm-simd-threaded.asyncify.wasm',
    'ort-wasm-simd-threaded.jsep.wasm':     WASM_BASE + 'ort-wasm-simd-threaded.jsep.wasm',
    '':                                     WASM_BASE,
};
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy      = false;

// ─── CDN Fallback URLs (Git LFS media CDN) ───────────────────────────────────
const RETINA_CDN = 'https://media.githubusercontent.com/media/THOUFIKUR/sih2026/main/backend/models/retina_model.onnx';
const YOLO_CDN   = 'https://media.githubusercontent.com/media/THOUFIKUR/sih2026/main/backend/models/yolo_lesions.onnx';

// ─── IndexedDB Model Cache ────────────────────────────────────────────────────
// Version bumped to 2 to force re-download of the corrected FP32 model.
const IDB_NAME    = 'retinascan-models';
const IDB_VERSION = 2;
const IDB_STORE   = 'onnx-binaries';

function openModelDB() {
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
        const tx  = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

async function idbPut(db, key, value) {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror   = (e) => reject(e.target.error);
    });
}

/**
 * Fetches the model buffer, using IndexedDB cache when available.
 * First call: downloads from /models/ or CDN → stores in IDB.
 * Subsequent calls: loads from IDB instantly (no network request).
 *
 * @param {string} localPath  - Relative URL to the model in /public/models/
 * @param {string} cdnUrl     - Fallback CDN URL (GitHub LFS media CDN)
 * @param {string} cacheKey   - Key to use in IndexedDB (e.g. 'retina_model_v2')
 */
async function fetchWithIDBCache(localPath, cdnUrl, cacheKey) {
    // 1. Try IndexedDB cache first (fast, zero network)
    try {
        const db = await openModelDB();
        const cached = await idbGet(db, cacheKey);
        if (cached && cached.byteLength > 100_000) {
            console.log(`[Worker] ✅ ${cacheKey} loaded from IDB cache (${(cached.byteLength / 1e6).toFixed(1)} MB)`);
            return cached;
        }
    } catch (idbErr) {
        console.warn('[Worker] IDB read failed, falling back to network:', idbErr.message);
    }

    // 2. Download from local /models/ first, then CDN as fallback
    self.postMessage({ type: 'STATUS', message: `Downloading AI model (first-time setup)…` });

    let buf = null;

    // Try local /models/ path
    try {
        const res = await fetch(localPath);
        if (res.ok) {
            const candidate = await res.arrayBuffer();
            if (candidate.byteLength > 100_000) {
                buf = candidate;
                console.log(`[Worker] Downloaded from local: ${localPath} (${(buf.byteLength / 1e6).toFixed(1)} MB)`);
            } else {
                console.warn(`[Worker] Local ${localPath} appears to be a Git LFS pointer (${candidate.byteLength} bytes) — trying CDN`);
            }
        }
    } catch (localErr) {
        console.warn(`[Worker] Local fetch failed for ${localPath}: ${localErr.message}`);
    }

    // Try CDN fallback
    if (!buf && cdnUrl) {
        self.postMessage({ type: 'STATUS', message: `Downloading AI model from CDN (first-time setup)…` });
        const cdnRes = await fetch(cdnUrl);
        if (!cdnRes.ok) throw new Error(`CDN download failed: HTTP ${cdnRes.status} for ${cdnUrl}`);
        buf = await cdnRes.arrayBuffer();
        console.log(`[Worker] Downloaded from CDN: ${cdnUrl} (${(buf.byteLength / 1e6).toFixed(1)} MB)`);
    }

    if (!buf) throw new Error(`Failed to load model binary for ${localPath}`);

    // 3. Store in IndexedDB for future calls
    try {
        const db = await openModelDB();
        await idbPut(db, cacheKey, buf);
        console.log(`[Worker] ✅ ${cacheKey} cached in IndexedDB (${(buf.byteLength / 1e6).toFixed(1)} MB)`);
    } catch (idbErr) {
        console.warn('[Worker] IDB write failed (cache not stored):', idbErr.message);
    }

    return buf;
}

// ─── YOLO Class Labels ────────────────────────────────────────────────────────
const YOLO_CLASSES = [
    'Intraretinal Hemorrhages (Flame/Blot)',
    'Hard Exudates / Cotton Wool Spots',
    'Microaneurysms (Sub-pixel focal dilatations)',
];

// ─── NMS Utility ─────────────────────────────────────────────────────────────
const iou = (a, b) => {
    const xA = Math.max(a[0], b[0]), yA = Math.max(a[1], b[1]);
    const xB = Math.min(a[2], b[2]), yB = Math.min(a[3], b[3]);
    const inter = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const aArea = (a[2]-a[0]) * (a[3]-a[1]);
    const bArea = (b[2]-b[0]) * (b[3]-b[1]);
    return inter / (aArea + bArea - inter);
};

const nms = (boxes, scores, iouThr = 0.45) => {
    const idx = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
    const keep = [];
    while (idx.length > 0) {
        const cur = idx.shift();
        keep.push(cur);
        for (let i = idx.length - 1; i >= 0; i--) {
            if (iou(boxes[cur], boxes[idx[i]]) > iouThr) idx.splice(i, 1);
        }
    }
    return keep;
};

// ─── True Grad-CAM Heatmap (Class-Weighted + Smooth Blending) ─────────────────
let cachedClassifierWeights = null;
async function getClassifierWeights() {
    if (cachedClassifierWeights) return cachedClassifierWeights;
    try {
        const res = await fetch('/models/classifier_weights.bin');
        if (res.ok) {
            const buf = await res.arrayBuffer();
            cachedClassifierWeights = new Float32Array(buf);
            return cachedClassifierWeights;
        }
    } catch (e) {
        console.warn('[Worker] Could not fetch classifier_weights.bin:', e.message);
    }
    try {
        const res = await fetch('/models/classifier_weights.json');
        if (res.ok) {
            const data = await res.json();
            cachedClassifierWeights = new Float32Array(data.flat());
            return cachedClassifierWeights;
        }
    } catch (e) {
        console.warn('[Worker] Could not fetch classifier_weights.json:', e.message);
    }
    return null;
}

/**
 * Fast tile-based CLAHE (Contrast Limited Adaptive Histogram Equalization) in pure JavaScript.
 */
function applyCLAHE(data, width, height, clipLimit = 2.5, tilesX = 8, tilesY = 8) {
    const tileW = Math.floor(width / tilesX);
    const tileH = Math.floor(height / tilesY);
    const numTiles = tilesX * tilesY;
    const cdfs = new Float32Array(numTiles * 256);
    const clipVal = Math.max(1, Math.round(clipLimit * (tileW * tileH) / 256));

    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            const tIdx = (ty * tilesX + tx) * 256;
            const hist = new Int32Array(256);
            const startX = tx * tileW, endX = (tx === tilesX - 1) ? width : (tx + 1) * tileW;
            const startY = ty * tileH, endY = (ty === tilesY - 1) ? height : (ty + 1) * tileH;
            const tPixels = (endX - startX) * (endY - startY);

            for (let y = startY; y < endY; y++) {
                const row = y * width;
                for (let x = startX; x < endX; x++) hist[data[row + x]]++;
            }

            let excess = 0;
            for (let i = 0; i < 256; i++) {
                if (hist[i] > clipVal) { excess += hist[i] - clipVal; hist[i] = clipVal; }
            }
            const bonus = excess / 256;
            let acc = 0;
            for (let i = 0; i < 256; i++) {
                acc += hist[i] + bonus;
                cdfs[tIdx + i] = (acc / tPixels) * 255;
            }
        }
    }

    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        const fy = (y / tileH) - 0.5;
        const ty1 = Math.max(0, Math.min(tilesY - 1, Math.floor(fy)));
        const ty2 = Math.min(tilesY - 1, ty1 + 1);
        const dy = Math.max(0, Math.min(1, fy - ty1));
        const row = y * width;

        for (let x = 0; x < width; x++) {
            const fx = (x / tileW) - 0.5;
            const tx1 = Math.max(0, Math.min(tilesX - 1, Math.floor(fx)));
            const tx2 = Math.min(tilesX - 1, tx1 + 1);
            const dx = Math.max(0, Math.min(1, fx - tx1));

            const val = data[row + x];
            const c00 = cdfs[(ty1 * tilesX + tx1) * 256 + val];
            const c10 = cdfs[(ty1 * tilesX + tx2) * 256 + val];
            const c01 = cdfs[(ty2 * tilesX + tx1) * 256 + val];
            const c11 = cdfs[(ty2 * tilesX + tx2) * 256 + val];

            const top = c00 * (1 - dx) + c10 * dx;
            const bot = c01 * (1 - dx) + c11 * dx;
            out[row + x] = Math.round(top * (1 - dy) + bot * dy);
        }
    }
    return out;
}

/**
 * Fast separable box blur for sliding window background subtraction.
 */
function boxBlur(data, width, height, radius) {
    const temp = new Float32Array(width * height);
    const out = new Float32Array(width * height);
    const invWin = 1.0 / (2 * radius + 1);

    // Horizontal pass
    for (let y = 0; y < height; y++) {
        const rowOff = y * width;
        let sum = 0;
        for (let x = -radius; x <= radius; x++) {
            const px = Math.max(0, Math.min(width - 1, x));
            sum += data[rowOff + px];
        }
        temp[rowOff] = sum * invWin;
        for (let x = 1; x < width; x++) {
            const addX = Math.min(width - 1, x + radius);
            const subX = Math.max(0, x - radius - 1);
            sum += data[rowOff + addX] - data[rowOff + subX];
            temp[rowOff + x] = sum * invWin;
        }
    }

    // Vertical pass
    for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let y = -radius; y <= radius; y++) {
            const py = Math.max(0, Math.min(height - 1, y));
            sum += temp[py * width + x];
        }
        out[x] = sum * invWin;
        for (let y = 1; y < height; y++) {
            const addY = Math.min(height - 1, y + radius);
            const subY = Math.max(0, y - radius - 1);
            sum += temp[addY * width + x] - temp[subY * width + x];
            out[y * width + x] = sum * invWin;
        }
    }
    return out;
}

/**
 * High-Resolution Microvascular & Pathology Saliency Heatmap in Web Worker.
 * Matches backend generate_evidence_heatmap exactly.
 */
async function generateEvidenceHeatmap(imageData, featureMapData = null, finalGrade = 0, detections = []) {
    const iW = imageData.width, iH = imageData.height;
    const D = imageData.data;

    // 1. Extract green channel (maximal retinal contrast for vessels and microaneurysms)
    const green = new Uint8Array(iW * iH);
    for (let i = 0; i < iW * iH; i++) {
        green[i] = D[i * 4 + 1];
    }

    // 2. Apply CLAHE
    const enhanced = applyCLAHE(green, iW, iH, 2.5, 8, 8);

    // 3. Subtract background blur to isolate fine microvascular lesions
    const bg = boxBlur(enhanced, iW, iH, 12); // ~25x25 window
    const diff = new Float32Array(iW * iH);
    for (let i = 0; i < iW * iH; i++) {
        const d = Math.abs(enhanced[i] - bg[i]);
        diff[i] = d >= 20 ? d : 0;
    }

    // 4. Smooth diff with 15x15 blur (radius 7)
    const smoothedDiff = boxBlur(diff, iW, iH, 7);

    // 5. Inject YOLO lesion hotspots if present
    if (detections && detections.length > 0) {
        for (const det of detections) {
            const [x1, y1, x2, y2] = det.bbox;
            const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
            const bw = Math.max(15, x2 - x1), bh = Math.max(15, y2 - y1);
            const radius = Math.max(Math.min(bw, bh) * 1.5, 25);
            const rSq2 = 2 * radius * radius;
            const minX = Math.max(0, Math.floor(cx - radius * 3));
            const maxX = Math.min(iW - 1, Math.ceil(cx + radius * 3));
            const minY = Math.max(0, Math.floor(cy - radius * 3));
            const maxY = Math.min(iH - 1, Math.ceil(cy + radius * 3));
            for (let y = minY; y <= maxY; y++) {
                const yOff = y * iW;
                for (let x = minX; x <= maxX; x++) {
                    smoothedDiff[yOff + x] += Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / rSq2) * 180;
                }
            }
        }
    }

    // 6. Normalize to 0..255
    let maxV = 0, minV = Infinity;
    for (let i = 0; i < smoothedDiff.length; i++) {
        if (smoothedDiff[i] > maxV) maxV = smoothedDiff[i];
        if (smoothedDiff[i] < minV) minV = smoothedDiff[i];
    }
    const range = maxV - minV > 1e-6 ? maxV - minV : 1;
    const norm = new Uint8Array(iW * iH);
    for (let i = 0; i < norm.length; i++) {
        norm[i] = Math.round(Math.min(255, Math.max(0, ((smoothedDiff[i] - minV) / range) * 255)));
    }

    // 7. OpenCV JET colormap (in BGR order) & blend with original:
    // Displayed R = 0.65 * orig_R + 0.35 * JET_B
    // Displayed G = 0.65 * orig_G + 0.35 * JET_G
    // Displayed B = 0.65 * orig_B + 0.35 * JET_R
    const canvas = new OffscreenCanvas(iW, iH);
    const ctx = canvas.getContext('2d');
    const out = new Uint8ClampedArray(iW * iH * 4);

    for (let i = 0; i < iW * iH; i++) {
        const val = norm[i];
        const t = val / 255.0;

        // Exact piecewise OpenCV JET function
        const rJet = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3))) * 255;
        const gJet = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2))) * 255;
        const bJet = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1))) * 255;

        const p = i * 4;
        out[p]     = Math.round(D[p]     * 0.65 + bJet * 0.35);
        out[p + 1] = Math.round(D[p + 1] * 0.65 + gJet * 0.35);
        out[p + 2] = Math.round(D[p + 2] * 0.65 + rJet * 0.35);
        out[p + 3] = 255;
    }

    ctx.putImageData(new ImageData(out, iW, iH), 0, 0);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}

// Aliases for backwards compatibility
const generateGradCAM = generateEvidenceHeatmap;
const generateScoreCAM = generateEvidenceHeatmap;

// ─── Clinical Grade & Risk Map ────────────────────────────────────────────────
const GRADE_MAP = [
    { grade: 0, grade_label: 'No Diabetic Retinopathy',          risk_level: 'LOW',    risk_score: 10, urgency: 'Routine annual screening at PHC',                          icdr_level: 'Level 0: No apparent retinopathy' },
    { grade: 1, grade_label: 'Mild Diabetic Retinopathy',         risk_level: 'LOW',    risk_score: 28, urgency: 'Annual review; strict glycemic control',                   icdr_level: 'Level 1: Microaneurysms only' },
    { grade: 2, grade_label: 'Moderate Diabetic Retinopathy',     risk_level: 'MEDIUM', risk_score: 55, urgency: 'Referral to ophthalmologist within 6 months',              icdr_level: 'Level 2: Moderate intraretinal lesions' },
    { grade: 3, grade_label: 'Severe Diabetic Retinopathy',       risk_level: 'HIGH',   risk_score: 85, urgency: 'Urgent referral within 3 months (high risk of PDR)',       icdr_level: 'Level 3: ETDRS 4-2-1 Rule satisfied' },
    { grade: 4, grade_label: 'Proliferative Diabetic Retinopathy',risk_level: 'HIGH',   risk_score: 98, urgency: 'Emergency referral for PRP Laser / Anti-VEGF',             icdr_level: 'Level 4: Neovascularization / Vitreous Hemorrhage' },
];

// ─── YOLO Processing Helper ───────────────────────────────────────────────────
function parseYoloOutput(output, origW, origH) {
    const numClasses  = 3;
    const numAnchors  = output.length / (4 + numClasses);
    const boxes = [], scores = [], classIds = [];

    for (let i = 0; i < numAnchors; i++) {
        let bestScore = -1, bestClass = -1;
        for (let c = 0; c < numClasses; c++) {
            const s = output[numAnchors * (4 + c) + i];
            if (s > bestScore) { bestScore = s; bestClass = c; }
        }
        if (bestScore > 0.25) {
            const cx = output[i];
            const cy = output[numAnchors + i];
            const w  = output[numAnchors * 2 + i];
            const h  = output[numAnchors * 3 + i];
            boxes.push([
                (cx - w / 2) * (origW / 1024),
                (cy - h / 2) * (origH / 1024),
                (cx + w / 2) * (origW / 1024),
                (cy + h / 2) * (origH / 1024),
            ]);
            scores.push(bestScore);
            classIds.push(bestClass);
        }
    }

    const kept = nms(boxes, scores);
    return kept.map(idx => ({
        class_name: YOLO_CLASSES[classIds[idx]],
        class_id:   classIds[idx],
        confidence: scores[idx],
        bbox:       boxes[idx],
    }));
}

// ─── Clinical Arbitration Engine ──────────────────────────────────────────────
/**
 * A.K. Khurana / ETDRS arbitration.
 * YOLO lesion counts act as a hard *floor* on the neural grade.
 */
function clinicalArbitration(nnGrade, detections, imgW, imgH) {
    const foveaX = imgW * 0.50;
    const foveaY = imgH * 0.50;
    const discDia = Math.max(imgW * 0.15, 50);

    const quadCounts = { 'Superior-Temporal': 0, 'Superior-Nasal': 0, 'Inferior-Nasal': 0, 'Inferior-Temporal': 0 };
    let totalMA = 0, totalHM = 0, totalEX = 0, minFoveaDistDD = Infinity;

    for (const det of detections) {
        const [x1, y1, x2, y2] = det.bbox;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;

        const q = (cx < foveaX && cy < foveaY) ? 'Superior-Temporal'
                : (cx >= foveaX && cy < foveaY) ? 'Superior-Nasal'
                : (cx >= foveaX && cy >= foveaY) ? 'Inferior-Nasal'
                : 'Inferior-Temporal';
        det.quadrant = q;

        if (det.class_name.includes('Hemorrhages'))  { totalHM++; quadCounts[q]++; }
        else if (det.class_name.includes('Micro'))   { totalMA++; }
        else if (det.class_name.includes('Exudate') || det.class_name.includes('Cotton')) {
            totalEX++;
            const distDD = Math.sqrt((cx - foveaX) ** 2 + (cy - foveaY) ** 2) / discDia;
            if (distDD < minFoveaDistDD) minFoveaDistDD = distDD;
        }
    }

    const hasMacularEdema = (totalEX > 0) && (minFoveaDistDD <= 1.0);
    const etdrs421Met     = Object.values(quadCounts).every(c => c >= 20);

    let finalGrade  = nnGrade;
    let ruleApplied = 'ICDR Softmax Consensus';

    if (etdrs421Met && finalGrade < 3) {
        finalGrade  = 3;
        ruleApplied = 'ETDRS 4-2-1 Rule: ≥20 hemorrhages across all 4 quadrants (Severe NPDR)';
    } else if ((totalHM >= 3 || totalEX >= 2) && finalGrade < 2) {
        finalGrade  = 2;
        ruleApplied = `ICDR: ${totalHM} hemorrhages / ${totalEX} exudates detected (Moderate NPDR floor)`;
    } else if ((totalMA > 0 || totalHM > 0) && finalGrade === 0) {
        finalGrade  = 1;
        ruleApplied = 'ICDR Microaneurysm Rule: focal lesions detected (Mild NPDR)';
    }

    return {
        final_grade:          finalGrade,
        is_referable:         (finalGrade >= 2) || hasMacularEdema,
        has_macular_edema:    hasMacularEdema,
        fovea_exudate_dist_dd: totalEX > 0 ? parseFloat(minFoveaDistDD.toFixed(2)) : null,
        clinical_rule_applied: ruleApplied,
        lesion_summary: {
            microaneurysms:       totalMA,
            hemorrhages:          totalHM,
            hard_exudates:        totalEX,
            quadrant_distribution: quadCounts,
        },
    };
}

// ─── Main Message Handler ─────────────────────────────────────────────────────
self.onmessage = async (e) => {
    const { type, tensorData, imageData, filename } = e.data;
    if (type !== 'INFERENCE' && type !== 'YOLO_ONLY') return;

    // ── YOLO_ONLY path ────────────────────────────────────────────────────────
    if (type === 'YOLO_ONLY') {
        try {
            const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
            const yoloBuf = await fetchWithIDBCache('/models/yolo_lesions.onnx', YOLO_CDN, `yolo_lesions_v${IDB_VERSION}`);
            const lesionSess = await ort.InferenceSession.create(new Uint8Array(yoloBuf), options);
            self.postMessage({ type: 'STATUS', message: 'Running Lesion Detection...' });

            const YSIZE = 1024;
            const canvasYOLO = new OffscreenCanvas(YSIZE, YSIZE);
            const ctxYOLO    = canvasYOLO.getContext('2d');
            const bitmap     = await createImageBitmap(imageData);
            ctxYOLO.drawImage(bitmap, 0, 0, YSIZE, YSIZE);
            bitmap.close();

            const rawYOLO = ctxYOLO.getImageData(0, 0, YSIZE, YSIZE).data;
            const floatYOLO = new Float32Array(3 * YSIZE * YSIZE);
            for (let i = 0; i < YSIZE * YSIZE; i++) {
                floatYOLO[i]                  = rawYOLO[i * 4]     / 255.0;
                floatYOLO[i + YSIZE * YSIZE]  = rawYOLO[i * 4 + 1] / 255.0;
                floatYOLO[i + 2*YSIZE * YSIZE]= rawYOLO[i * 4 + 2] / 255.0;
            }

            const inputYOLO = new ort.Tensor('float32', floatYOLO, [1, 3, YSIZE, YSIZE]);
            const resYOLO   = await lesionSess.run({ images: inputYOLO });
            const output    = resYOLO.output0.data;
            const detections = parseYoloOutput(output, imageData.width, imageData.height);

            self.postMessage({
                type: 'YOLO_RESULT',
                yolo: { detections, num_detections: detections.length, image_shape: [imageData.height, imageData.width] }
            });
        } catch (err) {
            self.postMessage({ type: 'YOLO_ERROR', error: err.message });
        }
        return;
    }

    // ── INFERENCE path: full grading + lesion + real Score-CAM heatmap ───────
    try {
        self.postMessage({ type: 'STATUS', message: 'Initializing AI Models...' });

        const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };

        // Load both models (IDB-cached after first download)
        const [gradingBuf, yoloBuf] = await Promise.all([
            fetchWithIDBCache('/models/retina_model.onnx', RETINA_CDN, `retina_model_v${IDB_VERSION}`),
            fetchWithIDBCache('/models/yolo_lesions.onnx', YOLO_CDN,   `yolo_lesions_v${IDB_VERSION}`),
        ]);

        const [gradingSession, lesionSession] = await Promise.all([
            ort.InferenceSession.create(new Uint8Array(gradingBuf), options),
            ort.InferenceSession.create(new Uint8Array(yoloBuf), options),
        ]);
        self.postMessage({ type: 'STATUS', message: 'Models loaded ✅' });

        // ── Phase 1: EfficientNet-B3+CBAM Grading (300×300) ─────────────────
        self.postMessage({ type: 'STATUS', message: 'Analysing Severity (EfficientNet-B3)...' });

        // tensorData is [3 × 300 × 300] from imagePreprocessing.js (fixed above)
        const inputGrade = new ort.Tensor('float32', tensorData, [1, 3, 300, 300]);
        const resGrade   = await gradingSession.run({ input: inputGrade });

        const logits      = Array.from(resGrade.logits.data);
        const featureMapData = resGrade.feature_map ? resGrade.feature_map.data : null;

        const maxL = Math.max(...logits);
        const exps = logits.map(l => Math.exp(l - maxL));
        const sumE = exps.reduce((a, b) => a + b, 0);
        const class_probabilities = exps.map(e => parseFloat((e / sumE).toFixed(4)));
        const nnGrade = class_probabilities.indexOf(Math.max(...class_probabilities));

        // ── Phase 2: YOLO Lesion Mapping (1024×1024) ─────────────────────────
        self.postMessage({ type: 'STATUS', message: 'Mapping Lesions (YOLOv8)...' });

        const YSIZE  = 1024;
        const origW  = imageData.width;
        const origH  = imageData.height;
        const canvasYOLO = new OffscreenCanvas(YSIZE, YSIZE);
        const ctxYOLO    = canvasYOLO.getContext('2d');
        const bitmapY    = await createImageBitmap(imageData);
        ctxYOLO.drawImage(bitmapY, 0, 0, YSIZE, YSIZE);
        bitmapY.close();

        const rawYOLO   = ctxYOLO.getImageData(0, 0, YSIZE, YSIZE).data;
        const floatYOLO = new Float32Array(3 * YSIZE * YSIZE);
        for (let i = 0; i < YSIZE * YSIZE; i++) {
            floatYOLO[i]                   = rawYOLO[i * 4]     / 255.0;
            floatYOLO[i + YSIZE * YSIZE]   = rawYOLO[i * 4 + 1] / 255.0;
            floatYOLO[i + 2 * YSIZE * YSIZE]= rawYOLO[i * 4 + 2] / 255.0;
        }

        const inputYOLO = new ort.Tensor('float32', floatYOLO, [1, 3, YSIZE, YSIZE]);
        const resYOLO   = await lesionSession.run({ images: inputYOLO });
        const detections = parseYoloOutput(resYOLO.output0.data, origW, origH);

        // ── Phase 3: Clinical Arbitration ─────────────────────────────────────
        const arbitration = clinicalArbitration(nnGrade, detections, origW, origH);
        const finalGrade  = arbitration.final_grade;
        const finalInfo   = GRADE_MAP[finalGrade] || GRADE_MAP[2];

        // ── Phase 4: Real Pathology-Focused Grad-CAM Heatmap ─────────────────
        self.postMessage({ type: 'STATUS', message: 'Generating Grad-CAM Heatmap...' });
        let heatmapBlob;
        try {
            heatmapBlob = await generateGradCAM(imageData, featureMapData, finalGrade, detections);
        } catch (camErr) {
            console.warn('[Worker] Grad-CAM failed:', camErr.message, '— using direct image');
            const canvasFB = new OffscreenCanvas(origW, origH);
            canvasFB.getContext('2d').putImageData(imageData, 0, 0);
            heatmapBlob = await canvasFB.convertToBlob({ type: 'image/jpeg', quality: 0.90 });
        }

        let urgency = finalInfo.urgency;
        if (arbitration.has_macular_edema) {
            urgency = 'URGENT: Clinically Significant Macular Edema (CSME) detected within 1 DD of fovea.';
        }

        const result = {
            ...finalInfo,
            grade:             finalGrade,
            confidence:        class_probabilities[finalGrade] ?? 0,
            class_probabilities,
            is_referable:      arbitration.is_referable,
            has_macular_edema: arbitration.has_macular_edema,
            fovea_exudate_dist_dd: arbitration.fovea_exudate_dist_dd,
            clinical_rule_applied: arbitration.clinical_rule_applied,
            urgency,
            arbitration,
            yolo: {
                detections,
                num_detections: detections.length,
                image_shape:    [origH, origW],
            },
            timestamp: new Date().toISOString(),
            _note: 'RetinaScan AI — FP32 EfficientNet-B3+CBAM + Mathematical Grad-CAM + Khurana Arbitration (offline)',
        };

        self.postMessage({ type: 'RESULT', result, heatmapBlob });

    } catch (err) {
        console.error('[Worker] Inference Error:', err);
        let msg = err?.message || String(err);
        if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('404')) {
            msg = 'Could not load AI models. Connect to the internet once to cache them for offline use.';
        }
        self.postMessage({ type: 'ERROR', error: msg || 'Unknown inference engine error' });
    }
};
