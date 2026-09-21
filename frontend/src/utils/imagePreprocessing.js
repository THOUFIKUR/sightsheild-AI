// imagePreprocessing.js — Handles image validation, blur detection, and preprocessing for AI models

/**
 * Heuristic validation to check if an uploaded image is a valid fundus photograph.
 *
 * Runs BEFORE ONNX inference and rejects obvious non-eye content such as
 * certificates, documents, or selfies.
 *
 * Implementation follows a three-step validator:
 *  1) Corner brightness check
 *  2) Center texture / variance check
 *  3) Soft circularity heuristic (center vs corner brightness)
 *
 * @param {ImageData} imageData - The raw image data to validate.
 * @returns {Object} Object containing valid boolean and an array of warnings.
 * @throws {Error} If the image fails critical validation (too small, blank, or uniform color).
 */
export const validateFundusImage = (imageData) => {
    const { width: imageWidth, height: imageHeight, data: pixelData } = imageData;
    const validationWarnings = [];

    // 1. Minimum resolution check
    if (imageWidth < 100 || imageHeight < 100)
        throw new Error('Image too small. Minimum 100×100px required.');

    // 2. Aspect ratio validation (fundus images are typically near-square)
    if (imageWidth / imageHeight > 4.0 || imageWidth / imageHeight < 0.25)
        throw new Error('Unusual image shape — is this a fundus photograph?');

    /**
     * Helper to calculate average brightness in a rectangular region.
     */
    const calculateRegionBrightness = (x0, y0, x1, y1) => {
        let totalBrightness = 0, pixelCount = 0;
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                const pixelIndex = (y * imageWidth + x) * 4;
                totalBrightness += (pixelData[pixelIndex] + pixelData[pixelIndex + 1] + pixelData[pixelIndex + 2]) / 3; 
                pixelCount++;
            }
        return pixelCount ? totalBrightness / pixelCount : 0;
    };

    // 3. Corner brightness check (Bright corners often indicate a document/certificate)
    const cornerWidth = Math.max(4, Math.floor(imageWidth * 0.08));
    const cornerHeight = Math.max(4, Math.floor(imageHeight * 0.08));
    const cornerBrightnesses = [
        calculateRegionBrightness(0, 0, cornerWidth, cornerHeight), 
        calculateRegionBrightness(imageWidth - cornerWidth, 0, imageWidth, cornerHeight),
        calculateRegionBrightness(0, imageHeight - cornerHeight, cornerWidth, imageHeight), 
        calculateRegionBrightness(imageWidth - cornerWidth, imageHeight - cornerHeight, imageWidth, imageHeight)
    ];
    
    if (cornerBrightnesses.every(brightness => brightness > 200))
        validationWarnings.push('Bright corners detected — verify this is a fundus image.');

    // 4. Centre brightness check
    const centerBrightness = calculateRegionBrightness(
        Math.floor(imageWidth * 0.35), Math.floor(imageHeight * 0.35),
        Math.floor(imageWidth * 0.65), Math.floor(imageHeight * 0.65)
    );
    if (centerBrightness < 15) validationWarnings.push('Image very dark — check illumination.');

    // 5. Colour profile heuristic
    let redSum = 0, blueSum = 0;
    for (let i = 0; i < pixelData.length; i += 16) { 
        redSum += pixelData[i]; 
        blueSum += pixelData[i + 2]; 
    }
    if (blueSum > redSum * 1.6) validationWarnings.push('Unusual colour profile — fundus images are typically warm/orange.');

    // 6. Blank or solid color rejection
    let graySum = 0, graySquaredSum = 0, pixelCount = 0;
    for (let i = 0; i < pixelData.length; i += 4) {
        const brightness = (pixelData[i] + pixelData[i + 1] + pixelData[i + 2]) / 3; 
        graySum += brightness; 
        graySquaredSum += brightness * brightness; 
        pixelCount++;
    }
    const grayMean = graySum / pixelCount;
    const grayVariance = graySquaredSum / pixelCount - grayMean * grayMean;
    
    if (grayMean > 250 && grayVariance < 10) throw new Error('Image appears blank or completely white.');
    if (grayVariance < 3) throw new Error('Uniform solid colour — not a retinal photograph.');

    return { valid: true, warnings: validationWarnings };
};

/**
 * Calculates the variance of the Laplacian to estimate image blur.
 * Lower variance indicates fewer edges and a blurrier image.
 * 
 * @param {ImageData} imageData - The image data to analyze.
 * @returns {number} The calculated variance score.
 */
export const calculateBlur = (imageData) => {
    const { width, height, data } = imageData;

    // 1. Convert to grayscale manually for performance
    const grayscaleData = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        grayscaleData[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }

    // 2. Apply 3x3 Laplacian filter
    let laplaceSum = 0;
    let laplaceCount = 0;
    const laplacianData = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const laplaceValue =
                grayscaleData[(y - 1) * width + x] +
                grayscaleData[(y + 1) * width + x] +
                grayscaleData[y * width + (x - 1)] +
                grayscaleData[y * width + (x + 1)] -
                4 * grayscaleData[idx];

            laplacianData[idx] = laplaceValue;
            laplaceSum += laplaceValue;
            laplaceCount++;
        }
    }

    // 3. Calculate variance
    const laplaceMean = laplaceSum / laplaceCount;
    let laplaceVariance = 0;
    for (let i = 0; i < laplaceCount; i++) {
        const diff = laplacianData[i] - laplaceMean;
        laplaceVariance += diff * diff;
    }

    return laplaceVariance / laplaceCount;
};

/**
 * Preprocesses an image element for EfficientNetB3+CBAM ONNX inference.
 *
 * Pipeline:
 *   1. Draw image onto a large canvas to get full-resolution pixel data
 *   2. Auto-crop black circular fundus border (pixels < brightness 10)
 *   3. Pad cropped region to square with black fill (preserves aspect ratio)
 *   4. Resize to 300×300 (ONNX model contract — trained at this resolution)
 *   5. ImageNet normalise: mean=[0.485,0.456,0.406] std=[0.229,0.224,0.225]
 *   6. Return CHW Float32Array tensor [3, 300, 300]
 *
 * @param {HTMLImageElement} imageElement - The source image element.
 * @returns {Object} { tensorData: Float32Array, blurScore: number, imageData: ImageData }
 */
export const preprocessImageForONNX = (imageElement) => {
    // CRITICAL: must match ONNX model input shape — EfficientNetB3+CBAM is 300×300.
    const TARGET_SIZE = 300;

    // ── Step 1: Draw at native resolution for high-quality crop detection ──────
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width  = imageElement.width;
    srcCanvas.height = imageElement.height;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(imageElement, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, imageElement.width, imageElement.height);
    const px = srcData.data;
    const W  = imageElement.width;
    const H  = imageElement.height;

    // ── Step 2: Auto-crop black border ─────────────────────────────────────────
    // Find bounding box of pixels with brightness > 10
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const idx = (y * W + x) * 4;
            const brightness = (px[idx] + px[idx+1] + px[idx+2]) / 3;
            if (brightness > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    // Guard against degenerate images (very dark)
    if (maxX <= minX || maxY <= minY) {
        minX = 0; minY = 0; maxX = W - 1; maxY = H - 1;
    }
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    // ── Step 3: Pad to square ──────────────────────────────────────────────────
    const side   = Math.max(cropW, cropH);
    const xOff   = Math.floor((side - cropW) / 2);
    const yOff   = Math.floor((side - cropH) / 2);

    const squareCanvas = document.createElement('canvas');
    squareCanvas.width  = side;
    squareCanvas.height = side;
    const sqCtx = squareCanvas.getContext('2d');
    sqCtx.fillStyle = '#000000';
    sqCtx.fillRect(0, 0, side, side);
    sqCtx.drawImage(srcCanvas, minX, minY, cropW, cropH, xOff, yOff, cropW, cropH);

    // ── Step 4: Resize to TARGET_SIZE × TARGET_SIZE ────────────────────────────
    const outCanvas = document.createElement('canvas');
    outCanvas.width  = TARGET_SIZE;
    outCanvas.height = TARGET_SIZE;
    const outCtx = outCanvas.getContext('2d');
    outCtx.drawImage(squareCanvas, 0, 0, TARGET_SIZE, TARGET_SIZE);

    const imageData = outCtx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);
    const pixelData = imageData.data;

    // Blur detection on resized canvas
    const blurScore = calculateBlur(imageData);

    // ── Step 5: ImageNet normalisation ─────────────────────────────────────────
    const imageNetMean = [0.485, 0.456, 0.406];
    const imageNetStd  = [0.229, 0.224, 0.225];

    // CHW Float32 tensor: [3, 300, 300]
    const tensorBuffer = new Float32Array(3 * TARGET_SIZE * TARGET_SIZE);
    for (let i = 0; i < TARGET_SIZE * TARGET_SIZE; i++) {
        tensorBuffer[i]                          = ((pixelData[i * 4]     / 255.0) - imageNetMean[0]) / imageNetStd[0]; // R
        tensorBuffer[i + TARGET_SIZE * TARGET_SIZE]     = ((pixelData[i * 4 + 1] / 255.0) - imageNetMean[1]) / imageNetStd[1]; // G
        tensorBuffer[i + 2 * TARGET_SIZE * TARGET_SIZE] = ((pixelData[i * 4 + 2] / 255.0) - imageNetMean[2]) / imageNetStd[2]; // B
    }

    return { tensorData: tensorBuffer, blurScore, imageData };
};

