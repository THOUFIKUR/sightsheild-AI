function [ex] = segment_exudates(imagePath, discCenter, discRadius, saveOverlay, idridMaskDir, modelSavePath)
% SEGMENT_EXUDATES
% Problem Statement: SIH26038 (MathWorks) — Lesion Analysis
%
% Implementation Type: CANDIDATE SEGMENTATION (pixel-level binary mask)
%   + SECOND-STAGE SVM CLASSIFIER (Amendment 1)
%
% ╔══════════════════════════════════════════════════════════════════════════╗
% ║  STATUS: PROTOTYPE — NOT CLINICALLY VALIDATED                          ║
% ║                                                                          ║
% ║  Method: Brightness thresholding on CLAHE-enhanced LAB image +         ║
% ║  optic disc exclusion + morphological cleaning + optional SVM filter.   ║
% ║                                                                          ║
% ║  Second-stage SVM (Amendment 1):                                        ║
% ║    If IDRiD EX masks are provided (idridMaskDir), trains a shallow SVM  ║
% ║    on real GT positive/negative patches and filters superpixel regions. ║
% ║    If masks absent → DATA MISSING — SECOND-STAGE CLASSIFIER NOT RUN    ║
% ║    No synthetic training samples are generated.                         ║
% ║                                                                          ║
% ║  Validation: See evaluate_lesion_modules.m for Dice/IoU/sens/spec.      ║
% ╚══════════════════════════════════════════════════════════════════════════╝

if nargin < 2, discCenter  = [];  end
if nargin < 3, discRadius  = [];  end
if nargin < 4, saveOverlay = false; end
if nargin < 5, idridMaskDir  = ''; end
if nargin < 6, modelSavePath = ''; end

fprintf('[Exudate Seg] Processing: %s\n', imagePath);
fprintf('[Exudate Seg] STATUS: Prototype — not clinically validated.\n');

% ─── 1. Load image ──────────────────────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1, rawRGB = cat(3, rawRGB, rawRGB, rawRGB); end
[imgH, imgW, ~] = size(rawRGB);

% ─── 2. Retinal FOV Mask & CLAHE on L-channel ──────────────────────────────
retinaMask = rawRGB(:,:,1) > 20 | rawRGB(:,:,2) > 15;
retinaMask = imerode(retinaMask, strel('disk', 10));

labImg   = rgb2lab(rawRGB);
lChannel = labImg(:,:,1);
lNorm    = uint8((lChannel / 100) * 255);
lEnhanced = adapthisteq(lNorm, 'ClipLimit', 0.02, 'NumTiles', [8 8]);

% ─── 3. Adaptive threshold relative to retinal background ───────────────────
retinaL = double(lEnhanced(retinaMask));
if isempty(retinaL)
    exThresh = 240;
else
    exThresh = mean(retinaL) + 3.0 * std(retinaL);
    exThresh = max(exThresh, 230); % Exudates must be distinctly brighter than retina
end
bwBright = (double(lEnhanced) > exThresh) & retinaMask;

% ─── 4. Exclude optic disc region ────────────────────────────────────────────
if ~isempty(discCenter) && ~isempty(discRadius)
    [yy, xx]  = ndgrid(1:imgH, 1:imgW);
    discMask  = (xx - discCenter(1)).^2 + (yy - discCenter(2)).^2 <= (discRadius * 1.5)^2;
    bwBright(discMask) = false;
else
    fprintf('[Exudate Seg] Optic disc not provided — disc region NOT excluded (may cause false positives).\n');
end

% ─── 5. Morphological cleaning ───────────────────────────────────────────────
bwClean = bwareaopen(bwBright, 25);
seClose = strel('disk', 2);
bwFinal = imclose(bwClean, seClose);

% ─── 6. Build primary output ─────────────────────────────────────────────────
ex = struct();
ex.binary_mask       = bwFinal;
ex.candidate_area_px = sum(bwFinal(:));
ex.candidate_ratio   = ex.candidate_area_px / (imgH * imgW);
ex.method            = 'brightness_thresholding_lab + optional_svm';
ex.validated         = false;
ex.note = 'PROTOTYPE SEGMENTATION (pixel mask). No IDRiD GT masks confirmed in repo. Dice/IoU not evaluated.';

fprintf('[Exudate Seg] Primary mask: %d px (%.2f%%).\n', ex.candidate_area_px, ex.candidate_ratio * 100);

% ─── 7. SECOND-STAGE SVM (Amendment 1) ──────────────────────────────────────
ex.svm_status       = 'DATA MISSING — SECOND-STAGE CLASSIFIER NOT RUN';
ex.svm_refined_mask = [];

if ~isempty(idridMaskDir) && isfolder(idridMaskDir)
    try
        svm = train_or_load_ex_svm(lEnhanced, idridMaskDir, modelSavePath);
        if ~isempty(svm)
            % Classify each connected component region using SVM
            ccProps = regionprops(bwFinal, lEnhanced, 'PixelIdxList', 'MeanIntensity', ...
                'Area', 'Eccentricity', 'EquivDiameter');
            refinedMask = false(imgH, imgW);
            for k = 1:numel(ccProps)
                feat = extract_ex_cc_features(ccProps(k));
                if ~any(isnan(feat))
                    label = predict(svm, feat);
                    if label == 1
                        refinedMask(ccProps(k).PixelIdxList) = true;
                    end
                end
            end
            ex.svm_refined_mask = refinedMask;
            ex.svm_status       = 'TRAINED_AND_APPLIED';
            fprintf('[Exudate Seg] SVM filter applied. Refined area: %d px.\n', sum(refinedMask(:)));
        end
    catch svmErr
        fprintf('[Exudate Seg] SVM error: %s\n', svmErr.message);
        ex.svm_status = sprintf('SVM ERROR: %s', svmErr.message);
    end
else
    if ~isempty(idridMaskDir)
        fprintf('[Exudate Seg] DATA MISSING — IDRiD EX mask dir not found: %s\n', idridMaskDir);
    else
        fprintf('[Exudate Seg] DATA MISSING — SECOND-STAGE CLASSIFIER NOT RUN (no mask directory provided).\n');
    end
end

% Clinical safety flag: raw morphological candidates must NOT be usable for diagnosis
ex.diagnosis_usable = strcmp(ex.svm_status, 'TRAINED_AND_APPLIED');
if ~ex.diagnosis_usable
    ex.usage_warning = 'UNVALIDATED PROTOTYPE — Raw morphological candidate area NOT usable for clinical staging or diagnosis (SVM not applied).';
    fprintf('[Exudate SAFEGUARD] %s\n', ex.usage_warning);
else
    ex.usage_warning = '';
end

% ─── 8. Save overlay ─────────────────────────────────────────────────────────
ex.overlay_path = '';
if saveOverlay
    try
        displayMask = ex.binary_mask;
        if ~isempty(ex.svm_refined_mask), displayMask = ex.svm_refined_mask; end
        overlay = rawRGB;
        overlay(:,:,1) = uint8(double(overlay(:,:,1)) .* ~displayMask + 255 .* displayMask);
        overlay(:,:,2) = uint8(double(overlay(:,:,2)) .* ~displayMask + 255 .* displayMask);
        overlay(:,:,3) = uint8(double(overlay(:,:,3)) .* ~displayMask);
        fig = figure('Visible', 'off');
        subplot(1,2,1); imshow(rawRGB);    title('Original');
        subplot(1,2,2); imshow(overlay);   title(sprintf('Exudate Candidates — PROTOTYPE (%d px)', sum(displayMask(:))));
        [fDir, fName, ~] = fileparts(imagePath);
        ex.overlay_path = fullfile(fDir, sprintf('%s_exudate_seg_overlay.png', fName));
        saveas(fig, ex.overlay_path);
        close(fig);
    catch err
        fprintf('[Exudate Seg] Could not save overlay: %s\n', err.message);
    end
end
end

% ─── Helper: Train or load EX SVM ─────────────────────────────────────────
function svm = train_or_load_ex_svm(enhancedImg, maskDir, modelSavePath)
svm = [];
if ~isempty(modelSavePath) && isfile(modelSavePath)
    try
        loaded = load(modelSavePath, 'svmModel');
        svm = loaded.svmModel;
        fprintf('[EX SVM] Loaded pre-trained SVM from: %s\n', modelSavePath);
        return;
    catch; end
end

maskFiles = [dir(fullfile(maskDir, '*_EX.tif')); dir(fullfile(maskDir, '*_EX.png'))];
if isempty(maskFiles)
    fprintf('[EX SVM] DATA MISSING — No EX mask files in: %s\n', maskDir);
    return;
end

posFeats = []; negFeats = [];
for mi = 1:numel(maskFiles)
    maskPath = fullfile(maskFiles(mi).folder, maskFiles(mi).name);
    [mDir, mBase, ~] = fileparts(maskPath);
    imgId = regexprep(mBase, '_EX$', '');
    imgCands = {fullfile(mDir, [imgId '.jpg']); fullfile(mDir,'..','..','a. Training Set',[imgId '.jpg'])};
    imgPath = '';
    for ci=1:numel(imgCands), if isfile(imgCands{ci}), imgPath=imgCands{ci}; break; end; end
    if isempty(imgPath), continue; end
    try
        rawImg = imread(imgPath);
        if size(rawImg,3)==1, rawImg=cat(3,rawImg,rawImg,rawImg); end
        lab = rgb2lab(rawImg); lN = uint8((lab(:,:,1)/100)*255);
        eImg = adapthisteq(lN,'ClipLimit',0.03,'NumTiles',[8 8]);
        mask = imread(maskPath);
        if size(mask,3)>1, mask=mask(:,:,1); end
        binaryGT = mask > 127;
        % Positive: CC regions that overlap GT
        cc = bwconncomp(eImg > graythresh(eImg) * 255);
        for k=1:cc.NumObjects
            roi = false(size(binaryGT)); roi(cc.PixelIdxList{k}) = true;
            if sum(roi(:) & binaryGT(:)) > 3
                ccP = regionprops(roi, eImg, 'MeanIntensity','Area','Eccentricity','EquivDiameter');
                if ~isempty(ccP), f=extract_ex_cc_features(ccP(1)); if ~any(isnan(f)), posFeats=[posFeats;f]; end; end
            else
                ccP = regionprops(roi, eImg, 'MeanIntensity','Area','Eccentricity','EquivDiameter');
                if ~isempty(ccP) && ccP(1).Area > 20
                    f=extract_ex_cc_features(ccP(1)); if ~any(isnan(f)), negFeats=[negFeats;f]; end
                end
            end
        end
    catch; end
end

if isempty(posFeats)||isempty(negFeats)
    fprintf('[EX SVM] Insufficient training data (pos=%d,neg=%d).\n',size(posFeats,1),size(negFeats,1));
    return;
end
nNeg = min(size(negFeats,1), size(posFeats,1)*2);
negFeats = negFeats(randperm(size(negFeats,1),nNeg),:);
X = [posFeats;negFeats]; y = [ones(size(posFeats,1),1); zeros(nNeg,1)];
try
    svm = fitcsvm(X, y, 'KernelFunction','rbf','Standardize',true,'ClassNames',[0 1]);
    if ~isempty(modelSavePath), svmModel=svm; save(modelSavePath,'svmModel'); end
    fprintf('[EX SVM] Trained on %d pos / %d neg samples.\n', size(posFeats,1), nNeg);
catch ex2
    fprintf('[EX SVM] Training failed: %s\n', ex2.message); svm = [];
end
end

function feat = extract_ex_cc_features(ccProp)
feat = [ccProp.MeanIntensity, ccProp.Area, ccProp.Eccentricity, ccProp.EquivDiameter];
end
