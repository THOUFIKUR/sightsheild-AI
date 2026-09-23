function [hm] = classify_hemorrhages(imagePath, saveOverlay, idridMaskDir, modelSavePath)
% CLASSIFY_HEMORRHAGES
% Problem Statement: SIH26038 (MathWorks) — Lesion Analysis
%
% Implementation Type: CANDIDATE DETECTION + SHAPE CLASSIFICATION
%   + SECOND-STAGE SVM CLASSIFIER (Amendment 1)
%
% ╔══════════════════════════════════════════════════════════════════════════╗
% ║  STATUS: PROTOTYPE — NOT CLINICALLY VALIDATED                          ║
% ║                                                                          ║
% ║  Method: Bottom-hat morphological transform detects dark blobs.         ║
% ║  Shape analysis classifies dot vs flame hemorrhages.                    ║
% ║                                                                          ║
% ║  Second-stage SVM (Amendment 1):                                        ║
% ║    If IDRiD HE masks are provided (idridMaskDir), trains a shallow SVM  ║
% ║    on real GT positive/negative patches and re-scores candidates.       ║
% ║    If masks absent → DATA MISSING — SECOND-STAGE CLASSIFIER NOT RUN    ║
% ║                                                                          ║
% ║  Validation: See evaluate_lesion_modules.m for Dice/IoU/sens/spec.      ║
% ╚══════════════════════════════════════════════════════════════════════════╝

if nargin < 2, saveOverlay   = false; end
if nargin < 3, idridMaskDir  = '';   end
if nargin < 4, modelSavePath = '';   end

fprintf('[Hemorrhage] Processing: %s\n', imagePath);
fprintf('[Hemorrhage] STATUS: Prototype — not clinically validated.\n');

% ─── 1. Load image ──────────────────────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1, rawRGB = cat(3, rawRGB, rawRGB, rawRGB); end

green    = rawRGB(:, :, 2);
enhanced = adapthisteq(green, 'ClipLimit', 0.02, 'NumTiles', [8 8]);

% ─── 2. Bottom-hat transform ─────────────────────────────────────────────────
diskSE    = strel('disk', 15);
bottomHat = imbothat(enhanced, diskSE);

% ─── 3. Adaptive threshold ───────────────────────────────────────────────────
threshLevel = graythresh(bottomHat);
bwRaw = bottomHat > round(threshLevel * 255 * 0.9);

% ─── 4. Remove noise ─────────────────────────────────────────────────────────
bwFiltered = bwareaopen(bwRaw, 30);

% ─── 5. Shape-based classification ──────────────────────────────────────────
props = regionprops(bwFiltered, 'Centroid', 'Area', 'Eccentricity', ...
    'BoundingBox', 'Perimeter', 'MajorAxisLength', 'MinorAxisLength');

dotIdx   = false(length(props), 1);
flameIdx = false(length(props), 1);

for k = 1:length(props)
    a = props(k).Area;
    e = props(k).Eccentricity;
    if a >= 30 && a < 300 && e < 0.75
        dotIdx(k) = true;
    elseif a >= 200 && a <= 8000
        flameIdx(k) = true;
    end
end

dotProps   = props(dotIdx);
flameProps = props(flameIdx);

% ─── 6. Build output ─────────────────────────────────────────────────────────
hm = struct();
hm.total_count  = numel(dotProps) + numel(flameProps);
hm.dot_count    = numel(dotProps);
hm.flame_count  = numel(flameProps);
hm.method       = 'morphological_bottomhat + shape_classify + optional_svm';
hm.validated    = false;
hm.note = 'PROTOTYPE CANDIDATE DETECTION. No GT masks confirmed in repo. Accuracy not evaluated.';

allProps = [dotProps, flameProps];
if ~isempty(allProps)
    hm.bounding_boxes = vertcat(allProps.BoundingBox);
    hm.areas          = vertcat(allProps.Area);
    hm.types          = [repmat({'dot'},   numel(dotProps),   1);
                         repmat({'flame'}, numel(flameProps), 1)];
    hm.centroids      = vertcat(allProps.Centroid);
else
    hm.bounding_boxes = zeros(0,4);
    hm.areas          = zeros(0,1);
    hm.types          = {};
    hm.centroids      = zeros(0,2);
end

fprintf('[Hemorrhage] Morphological candidates: %d (dot=%d, flame=%d).\n', ...
    hm.total_count, hm.dot_count, hm.flame_count);

% ─── 7. SECOND-STAGE SVM (Amendment 1) ──────────────────────────────────────
hm.svm_status             = 'DATA MISSING — SECOND-STAGE CLASSIFIER NOT RUN';
hm.svm_filtered_count     = NaN;
hm.svm_filtered_centroids = zeros(0,2);

if hm.total_count == 0
    hm.svm_status         = 'NO CANDIDATES — SVM NOT APPLICABLE';
    hm.svm_filtered_count = 0;
elseif ~isempty(idridMaskDir) && isfolder(idridMaskDir)
    try
        svm = train_or_load_hm_svm(enhanced, idridMaskDir, modelSavePath);
        if ~isempty(svm)
            keepIdx = false(hm.total_count, 1);
            for k = 1:hm.total_count
                cx = round(hm.centroids(k,1));
                cy = round(hm.centroids(k,2));
                feat = extract_hm_patch_features(enhanced, cx, cy, ...
                    hm.areas(k), hm.bounding_boxes(k,:));
                if ~any(isnan(feat))
                    label = predict(svm, feat);
                    keepIdx(k) = (label == 1);
                end
            end
            hm.svm_filtered_centroids = hm.centroids(keepIdx,:);
            hm.svm_filtered_count     = sum(keepIdx);
            hm.svm_status             = 'TRAINED_AND_APPLIED';
            fprintf('[Hemorrhage] SVM: %d/%d candidates retained.\n', ...
                hm.svm_filtered_count, hm.total_count);
        end
    catch svmErr
        fprintf('[Hemorrhage] SVM error: %s\n', svmErr.message);
        hm.svm_status = sprintf('SVM ERROR: %s', svmErr.message);
    end
else
    if ~isempty(idridMaskDir)
        fprintf('[Hemorrhage] DATA MISSING — IDRiD HE mask dir not found: %s\n', idridMaskDir);
    else
        fprintf('[Hemorrhage] DATA MISSING — SECOND-STAGE CLASSIFIER NOT RUN.\n');
    end
end

% ─── 8. Overlay ─────────────────────────────────────────────────────────────
hm.overlay_path = '';
if saveOverlay && hm.total_count > 0
    try
        fig = figure('Visible', 'off');
        imshow(rawRGB); hold on;
        for k = 1:numel(dotProps)
            bb = dotProps(k).BoundingBox;
            rectangle('Position', bb, 'EdgeColor', [1 0.4 0], 'LineWidth', 1.5);
        end
        for k = 1:numel(flameProps)
            bb = flameProps(k).BoundingBox;
            rectangle('Position', bb, 'EdgeColor', [1 0 0], 'LineWidth', 2);
        end
        title(sprintf('Hemorrhage Candidates: %d (dot=%d, flame=%d) — PROTOTYPE', ...
            hm.total_count, hm.dot_count, hm.flame_count), 'FontSize', 10);
        hold off;
        [fDir, fName, ~] = fileparts(imagePath);
        hm.overlay_path = fullfile(fDir, sprintf('%s_hemorrhage_overlay.png', fName));
        saveas(fig, hm.overlay_path);
        close(fig);
    catch err
        fprintf('[Hemorrhage] Could not save overlay: %s\n', err.message);
    end
end
end

% ─── Helper: Train or load HM SVM ─────────────────────────────────────────
function svm = train_or_load_hm_svm(enhancedImg, maskDir, modelSavePath)
svm = [];
if ~isempty(modelSavePath) && isfile(modelSavePath)
    try
        loaded = load(modelSavePath, 'svmModel');
        svm = loaded.svmModel;
        fprintf('[HM SVM] Loaded pre-trained SVM from: %s\n', modelSavePath);
        return;
    catch; end
end

maskFiles = [dir(fullfile(maskDir, '*_HE.tif')); dir(fullfile(maskDir, '*_HE.png'))];
if isempty(maskFiles)
    fprintf('[HM SVM] DATA MISSING — No HE mask files in: %s\n', maskDir);
    return;
end

posFeats = []; negFeats = [];
patchSize = 11;
for mi = 1:numel(maskFiles)
    maskPath = fullfile(maskFiles(mi).folder, maskFiles(mi).name);
    [mDir, mBase, ~] = fileparts(maskPath);
    imgId = regexprep(mBase, '_HE$', '');
    imgCands = {fullfile(mDir,[imgId '.jpg']); fullfile(mDir,'..','..','a. Training Set',[imgId '.jpg'])};
    imgPath = '';
    for ci=1:numel(imgCands), if isfile(imgCands{ci}), imgPath=imgCands{ci}; break; end; end
    if isempty(imgPath), continue; end
    try
        rawImg = imread(imgPath);
        if size(rawImg,3)==1, rawImg=cat(3,rawImg,rawImg,rawImg); end
        g = rawImg(:,:,2);
        eImg = adapthisteq(g,'ClipLimit',0.02,'NumTiles',[8 8]);
        diskS = strel('disk',15);
        bh = imbothat(eImg, diskS);
        mask = imread(maskPath);
        if size(mask,3)>1, mask=mask(:,:,1); end
        bGT = mask > 127;
        posP = regionprops(bGT,'Centroid','Area','BoundingBox');
        for k=1:numel(posP)
            cx=round(posP(k).Centroid(1)); cy=round(posP(k).Centroid(2));
            feat=extract_hm_patch_features(eImg,cx,cy,posP(k).Area,posP(k).BoundingBox);
            if ~any(isnan(feat)), posFeats=[posFeats;feat]; end
        end
        [H2,W2]=size(bGT); halfP=floor(patchSize/2);
        for ni=1:min(numel(posP)*2,30)
            rx=randi([halfP+1,W2-halfP]); ry=randi([halfP+1,H2-halfP]);
            if ~any(any(bGT(ry-halfP:ry+halfP,rx-halfP:rx+halfP)))
                bb=[rx-halfP,ry-halfP,patchSize,patchSize];
                feat=extract_hm_patch_features(eImg,rx,ry,patchSize^2,bb);
                if ~any(isnan(feat)), negFeats=[negFeats;feat]; end
            end
        end
    catch; end
end

if isempty(posFeats)||isempty(negFeats)
    fprintf('[HM SVM] Insufficient training data.\n'); return;
end
nNeg=min(size(negFeats,1),size(posFeats,1)*2);
negFeats=negFeats(randperm(size(negFeats,1),nNeg),:);
X=[posFeats;negFeats]; y=[ones(size(posFeats,1),1);zeros(nNeg,1)];
try
    svm=fitcsvm(X,y,'KernelFunction','rbf','Standardize',true,'ClassNames',[0 1]);
    if ~isempty(modelSavePath), svmModel=svm; save(modelSavePath,'svmModel'); end
    fprintf('[HM SVM] Trained: %d pos / %d neg.\n',size(posFeats,1),nNeg);
catch ex2
    fprintf('[HM SVM] Training failed: %s\n',ex2.message); svm=[];
end
end

function feat = extract_hm_patch_features(eImg, cx, cy, area, bbox)
[H,W]=size(eImg); halfP=5;
feat=nan(1,6);
if cx-halfP<1||cx+halfP>W||cy-halfP<1||cy+halfP>H, return; end
patch=double(eImg(cy-halfP:cy+halfP,cx-halfP:cx+halfP));
feat=[mean(patch(:)), std(patch(:)), area, bbox(3)/max(bbox(4),1), ...
      min(patch(:)), max(patch(:))-min(patch(:))];
end
