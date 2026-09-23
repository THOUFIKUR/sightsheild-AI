function [ma] = detect_microaneurysms(imagePath, saveOverlay, idridMaskDir, modelSavePath)
% DETECT_MICROANEURYSMS
% Problem Statement: SIH26038 (MathWorks) — Lesion Analysis
%
% Implementation Type: CANDIDATE DETECTION + SUB-PIXEL REFINEMENT + SVM FILTER
%
% ╔══════════════════════════════════════════════════════════════════════════╗
% ║  STATUS: PROTOTYPE DETECTION / UNVALIDATED                             ║
% ║                                                                          ║
% ║  Method: Morphological top-hat on CLAHE-enhanced green channel.         ║
% ║  Candidate blobs filtered by area and circularity.                      ║
% ║                                                                          ║
% ║  Sub-pixel centroid refinement (Amendment 11):                          ║
% ║    Fits a 2D quadratic (paraboloid) to intensity values in a 5×5       ║
% ║    window around each integer-pixel centroid and solves for the true    ║
% ║    peak location to sub-pixel precision.                                ║
% ║    ma.candidate_centroids        = integer centroids (existing)         ║
% ║    ma.candidate_centroids_subpixel = float centroids (NEW)              ║
% ║                                                                          ║
% ║  Second-stage SVM classifier (Amendment 1):                             ║
% ║    If IDRiD lesion masks are provided (idridMaskDir), trains a          ║
% ║    shallow SVM on real ground-truth positive/negative patches and       ║
% ║    filters candidates. If masks are absent, logs DATA MISSING and       ║
% ║    returns morphological candidates only.                               ║
% ║    Trained SVM saved to modelSavePath for inference reuse.              ║
% ║                                                                          ║
% ║  Validation: See evaluate_lesion_modules.m for Dice/IoU/sens/spec.      ║
% ╚══════════════════════════════════════════════════════════════════════════╝
%
% Syntax:
%   ma = detect_microaneurysms(imagePath)
%   ma = detect_microaneurysms(imagePath, true)
%   ma = detect_microaneurysms(imagePath, true, idridMaskDir, modelSavePath)
%
% Outputs struct fields:
%   ma.candidate_count               integer — morphological candidates
%   ma.candidate_centroids           [Nx2] integer [x,y]  (from connected-component)
%   ma.candidate_centroids_subpixel  [Nx2] float   [x,y]  (paraboloid-refined, sub-pixel)
%   ma.candidate_areas               [Nx1] pixel areas
%   ma.svm_filtered_count            integer (or NaN if SVM not run)
%   ma.svm_filtered_centroids        [Mx2] float — sub-pixel, after SVM filter
%   ma.svm_filtered_centroids_int    [Mx2] integer
%   ma.svm_status                    'TRAINED_AND_APPLIED' | 'LOADED_AND_APPLIED' |
%                                    'DATA MISSING — SECOND-STAGE CLASSIFIER NOT RUN'
%   ma.method                        'morphological_tophat + subpixel_paraboloid'
%   ma.validated                     false
%   ma.note                          disclaimer

if nargin < 2, saveOverlay   = false;  end
if nargin < 3, idridMaskDir  = '';    end
if nargin < 4, modelSavePath = '';    end

fprintf('[MA Detection] Processing: %s\n', imagePath);
fprintf('[MA Detection] Method: morphological top-hat + sub-pixel paraboloid centroid + SVM filter\n');
fprintf('[MA Detection] STATUS: Prototype — not clinically validated.\n');

% ─── 1. Load image ──────────────────────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1, rawRGB = cat(3, rawRGB, rawRGB, rawRGB); end
[imgH, imgW, ~] = size(rawRGB);

% Retinal FOV mask to avoid black borders and perimeter artifacts
retinaMask = rawRGB(:,:,1) > 20 | rawRGB(:,:,2) > 15;
retinaMask = imerode(retinaMask, strel('disk', 15));

% Green channel: maximum haemoglobin absorption → best MA contrast
green = rawRGB(:, :, 2);

% CLAHE to equalize illumination
enhanced = adapthisteq(green, 'ClipLimit', 0.02, 'NumTiles', [8 8]);

% ─── 2. Bottom-hat / Top-hat on green channel ───────────────────────────────
% Microaneurysms are small dark spots on the green channel
diskSE = strel('disk', 6);
botHat = imbothat(enhanced, diskSE);
botHat(~retinaMask) = 0;

% ─── 3. Adaptive threshold inside retinal FOV ────────────────────────────────
retinaVals = double(botHat(retinaMask));
if isempty(retinaVals)
    maThresh = 30;
else
    maThresh = mean(retinaVals) + 2.8 * std(retinaVals);
    maThresh = max(maThresh, 20); % Minimum contrast to prevent noise triggering
end
bwRaw = (double(botHat) > maThresh) & retinaMask;

% ─── 4. Connected component filtering (area + circularity) ──────────────────
bwFiltered = bwareaopen(bwRaw, 3);
props = regionprops(bwFiltered, 'Centroid', 'Area', 'Eccentricity', 'BoundingBox');

validIdx = false(length(props), 1);
for k = 1:length(props)
    if props(k).Area >= 3 && props(k).Area <= 100 && props(k).Eccentricity < 0.85
        validIdx(k) = true;
    end
end
validProps = props(validIdx);

% ─── 5. Build integer centroids ─────────────────────────────────────────────
ma = struct();
ma.candidate_count  = numel(validProps);
ma.method           = 'morphological_tophat + subpixel_paraboloid';
ma.validated        = false;
ma.note = 'PROTOTYPE CANDIDATE DETECTION. Not clinically validated. Sub-pixel centroids via paraboloid fit.';

if ma.candidate_count > 0
    centroids = vertcat(validProps.Centroid);
    areas     = vertcat(validProps.Area);
    ma.candidate_centroids = round(centroids);
    ma.candidate_areas     = areas;
else
    ma.candidate_centroids = zeros(0, 2);
    ma.candidate_areas     = zeros(0, 1);
end

% ─── 6. SUB-PIXEL CENTROID REFINEMENT (Amendment 11) ────────────────────────
% For each integer-pixel centroid, extract a 5×5 local window from
% the top-hat response image, fit a 2D quadratic (paraboloid), and
% solve for the sub-pixel peak location.
%
% Model: f(x,y) = a*x² + b*y² + c*x*y + d*x + e*y + f
% Peak condition: ∂f/∂x = 0, ∂f/∂y = 0
%   2a*xp + c*yp + d = 0
%   2b*yp + c*xp + e = 0

halfW   = 2;  % half-window: 5×5 = (2*halfW+1)^2
wSize   = 2 * halfW + 1;
topHatF = double(topHat);

subpixCentroids = nan(ma.candidate_count, 2);

for k = 1:ma.candidate_count
    cx_int = ma.candidate_centroids(k, 1);
    cy_int = ma.candidate_centroids(k, 2);

    % Clamp window to image boundaries
    xmin = max(cx_int - halfW, 1);
    xmax = min(cx_int + halfW, imgW);
    ymin = max(cy_int - halfW, 1);
    ymax = min(cy_int + halfW, imgH);

    winW = xmax - xmin + 1;
    winH = ymax - ymin + 1;

    if winW < 3 || winH < 3
        % Window too small for a reliable fit — keep integer centroid
        subpixCentroids(k, :) = [cx_int, cy_int];
        continue;
    end

    patch = topHatF(ymin:ymax, xmin:xmax);

    % Local coordinate grid centred at (0,0) relative to integer centroid
    [ly, lx] = ndgrid((ymin:ymax) - cy_int, (xmin:xmax) - cx_int);
    lx = lx(:); ly = ly(:); z = patch(:);

    % Design matrix for 2D quadratic: [x² y² xy x y 1]
    A = [lx.^2, ly.^2, lx.*ly, lx, ly, ones(numel(lx),1)];

    if rank(A) < 6
        subpixCentroids(k, :) = [cx_int, cy_int];
        continue;
    end

    % Least-squares fit
    coef = A \ z;
    a = coef(1); b = coef(2); c = coef(3); d = coef(4); e = coef(5);

    % Solve peak: [2a c; c 2b] * [xp; yp] = [-d; -e]
    M = [2*a, c; c, 2*b];
    if abs(det(M)) < 1e-10
        subpixCentroids(k, :) = [cx_int, cy_int];
        continue;
    end

    peak_local = M \ [-d; -e];  % [xp; yp] in local coords

    % Clamp to window (reject implausible extrapolation beyond 1 px)
    peak_local = max(min(peak_local, halfW + 0.5), -halfW - 0.5);

    subpixCentroids(k, 1) = cx_int + peak_local(1);
    subpixCentroids(k, 2) = cy_int + peak_local(2);
end

ma.candidate_centroids_subpixel = subpixCentroids;

fprintf('[MA Detection] Candidates: %d | Sub-pixel centroids computed via 5×5 paraboloid fit.\n', ma.candidate_count);

% ─── 7. SECOND-STAGE SVM CLASSIFIER (Amendment 1) ─────────────────────────
% Requires real IDRiD MA lesion masks for training.
% If masks unavailable → DATA MISSING, no filtering applied.

ma.svm_filtered_count        = NaN;
ma.svm_filtered_centroids    = zeros(0, 2);
ma.svm_filtered_centroids_int = zeros(0, 2);
ma.svm_status = 'DATA MISSING — SECOND-STAGE CLASSIFIER NOT RUN';

if ma.candidate_count == 0
    ma.svm_status = 'NO CANDIDATES — SVM NOT APPLICABLE';
    ma.svm_filtered_count = 0;
elseif ~isempty(idridMaskDir) && isfolder(idridMaskDir)
    fprintf('[MA Detection] IDRiD mask directory found. Attempting SVM training/loading.\n');
    try
        svm = train_or_load_ma_svm(enhanced, idridMaskDir, modelSavePath);
        if ~isempty(svm)
            % Extract feature patch for each candidate and predict
            patchSize = 9;
            keepIdx   = false(ma.candidate_count, 1);
            for k = 1:ma.candidate_count
                feat = extract_ma_patch_features(enhanced, ...
                    round(ma.candidate_centroids_subpixel(k,1)), ...
                    round(ma.candidate_centroids_subpixel(k,2)), patchSize);
                if ~any(isnan(feat))
                    label = predict(svm, feat);
                    keepIdx(k) = (label == 1);
                end
            end
            ma.svm_filtered_centroids     = ma.candidate_centroids_subpixel(keepIdx, :);
            ma.svm_filtered_centroids_int = ma.candidate_centroids(keepIdx, :);
            ma.svm_filtered_count         = sum(keepIdx);
            ma.svm_status = 'TRAINED_AND_APPLIED';
            fprintf('[MA Detection] SVM filter: %d/%d candidates retained.\n', ...
                ma.svm_filtered_count, ma.candidate_count);
        else
            fprintf('[MA Detection] SVM training returned empty — no filtering applied.\n');
        end
    catch svmErr
        fprintf('[MA Detection] SVM error: %s\n', svmErr.message);
        ma.svm_status = sprintf('SVM ERROR: %s', svmErr.message);
    end
else
    if ~isempty(idridMaskDir)
        fprintf('[MA Detection] DATA MISSING — IDRiD mask directory not found: %s\n', idridMaskDir);
    else
        fprintf('[MA Detection] DATA MISSING — SECOND-STAGE CLASSIFIER NOT RUN (no mask directory provided).\n');
    end
end

fprintf('[MA Detection] Final: morphological=%d | sub-pixel refined=%d | SVM status: %s\n', ...
    ma.candidate_count, ma.candidate_count, ma.svm_status);

% ─── 8. Overlay visualization ────────────────────────────────────────────────
ma.overlay_path = '';
if saveOverlay && ma.candidate_count > 0
    try
        fig = figure('Visible', 'off');
        imshow(rawRGB); hold on;
        % Integer centroids (green)
        for k = 1:numel(validProps)
            cx = ma.candidate_centroids(k,1);
            cy = ma.candidate_centroids(k,2);
            plot(cx, cy, 'g+', 'MarkerSize', 6, 'LineWidth', 1);
        end
        % Sub-pixel centroids (magenta)
        for k = 1:ma.candidate_count
            spx = ma.candidate_centroids_subpixel(k,1);
            spy = ma.candidate_centroids_subpixel(k,2);
            if ~isnan(spx) && ~isnan(spy)
                plot(spx, spy, 'm.', 'MarkerSize', 8);
            end
        end
        title(sprintf('MA Candidates: %d (green=integer, magenta=sub-pixel) — PROTOTYPE', ...
            ma.candidate_count), 'FontSize', 9);
        hold off;
        [fDir, fName, ~] = fileparts(imagePath);
        ma.overlay_path = fullfile(fDir, sprintf('%s_ma_overlay.png', fName));
        saveas(fig, ma.overlay_path);
        close(fig);
        fprintf('[MA Detection] Overlay saved: %s\n', ma.overlay_path);
    catch ex
        fprintf('[MA Detection] Could not save overlay: %s\n', ex.message);
    end
end
end


% ─── Helper: Train or load MA SVM from IDRiD masks ─────────────────────────
function svm = train_or_load_ma_svm(enhancedImg, maskDir, modelSavePath)
% Attempts to load a pre-trained SVM from modelSavePath.
% If not found, trains on all MA mask images in maskDir.
% Returns [] if insufficient data.

svm = [];

% Try to load existing model
if ~isempty(modelSavePath) && isfile(modelSavePath)
    try
        loaded = load(modelSavePath, 'svmModel');
        svm = loaded.svmModel;
        fprintf('[MA SVM] Loaded pre-trained SVM from: %s\n', modelSavePath);
        return;
    catch
        fprintf('[MA SVM] Could not load SVM model — will retrain.\n');
    end
end

% Find MA mask files
maskFiles = [dir(fullfile(maskDir, '*_MA.tif')); dir(fullfile(maskDir, '*_MA.png'))];

if isempty(maskFiles)
    fprintf('[MA SVM] DATA MISSING — No MA mask files found in: %s\n', maskDir);
    return;
end

patchSize = 9;
halfP = floor(patchSize / 2);
posFeats = [];
negFeats = [];

for mi = 1:numel(maskFiles)
    maskPath = fullfile(maskFiles(mi).folder, maskFiles(mi).name);
    % Derive corresponding image path (convention: same base name, remove _MA suffix)
    [mDir, mBase, ~] = fileparts(maskPath);
    imgId   = regexprep(mBase, '_MA$', '');
    imgCands = {
        fullfile(mDir, [imgId '.jpg']);
        fullfile(mDir, '..', [imgId '.jpg']);
        fullfile(mDir, '..', '..', 'a. Training Set', [imgId '.jpg']);
    };
    imgPath = '';
    for ci = 1:numel(imgCands)
        if isfile(imgCands{ci}), imgPath = imgCands{ci}; break; end
    end
    if isempty(imgPath)
        fprintf('[MA SVM] WARNING: Cannot find image for mask %s — skipping.\n', mBase);
        continue;
    end

    try
        rawImg  = imread(imgPath);
        if size(rawImg,3)==1, rawImg=cat(3,rawImg,rawImg,rawImg); end
        gImg    = rawImg(:,:,2);
        eImg    = adapthisteq(gImg,'ClipLimit',0.02,'NumTiles',[8 8]);
        maskImg = imread(maskPath);
        if size(maskImg,3) > 1, maskImg = maskImg(:,:,1); end
        maskBin = maskImg > 127;

        posProps = regionprops(maskBin, 'Centroid');
        % Positive samples: patches centred on GT MA centroids
        for pp = 1:numel(posProps)
            cx = round(posProps(pp).Centroid(1));
            cy = round(posProps(pp).Centroid(2));
            feat = extract_ma_patch_features(eImg, cx, cy, patchSize);
            if ~any(isnan(feat))
                posFeats = [posFeats; feat]; %#ok<AGROW>
            end
        end

        % Negative samples: random patches NOT overlapping any MA
        [imgH2, imgW2] = size(maskBin);
        nNeg = min(numel(posProps) * 3, 50);
        attempts = 0;
        while size(negFeats,1) < size(posFeats,1) && attempts < 500
            rx = randi([halfP+1, imgW2-halfP]);
            ry = randi([halfP+1, imgH2-halfP]);
            if ~any(any(maskBin(ry-halfP:ry+halfP, rx-halfP:rx+halfP)))
                feat = extract_ma_patch_features(eImg, rx, ry, patchSize);
                if ~any(isnan(feat))
                    negFeats = [negFeats; feat]; %#ok<AGROW>
                end
            end
            attempts = attempts + 1;
        end
    catch ex
        fprintf('[MA SVM] Error processing %s: %s\n', imgId, ex.message);
    end
end

if isempty(posFeats) || isempty(negFeats)
    fprintf('[MA SVM] Insufficient training data (pos=%d, neg=%d). SVM not trained.\n', ...
        size(posFeats,1), size(negFeats,1));
    return;
end

% Balance classes
nPos = size(posFeats,1);
nNeg2 = min(size(negFeats,1), nPos * 2);
negFeats = negFeats(randperm(size(negFeats,1), nNeg2), :);

X = [posFeats; negFeats];
y = [ones(nPos,1); zeros(nNeg2,1)];

fprintf('[MA SVM] Training SVM: %d positive, %d negative samples.\n', nPos, nNeg2);
try
    svm = fitcsvm(X, y, 'KernelFunction', 'rbf', 'Standardize', true, ...
        'ClassNames', [0 1], 'BoxConstraint', 1.0);
    fprintf('[MA SVM] SVM trained. Cross-val loss (5-fold): %.4f\n', ...
        kfoldLoss(crossval(svm, 'KFold', min(5, size(X,1)))));
    if ~isempty(modelSavePath)
        svmModel = svm; %#ok<NASGU>
        save(modelSavePath, 'svmModel');
        fprintf('[MA SVM] Model saved: %s\n', modelSavePath);
    end
catch svmEx
    fprintf('[MA SVM] Training failed: %s\n', svmEx.message);
    svm = [];
end
end


% ─── Helper: extract feature vector from patch ────────────────────────────
function feat = extract_ma_patch_features(enhancedImg, cx, cy, patchSize)
% Returns a feature vector for a candidate patch.
% Features: mean intensity, std, top-hat max, 9-bin histogram, circularity proxy.
halfP = floor(patchSize / 2);
[H, W] = size(enhancedImg);

feat = nan(1, 13);
if cx-halfP < 1 || cx+halfP > W || cy-halfP < 1 || cy+halfP > H
    return;
end

patch = double(enhancedImg(cy-halfP:cy+halfP, cx-halfP:cx+halfP));
feat(1) = mean(patch(:));
feat(2) = std(patch(:));
feat(3) = max(patch(:));
feat(4) = min(patch(:));
feat(5) = feat(3) - feat(4);  % dynamic range

% 8-bin histogram of patch intensity
edges = linspace(0, 255, 9);
cnts  = histcounts(patch(:), edges);
feat(6:13) = cnts / max(sum(cnts), 1);
end
