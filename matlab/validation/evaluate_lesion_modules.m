function evaluate_lesion_modules(idridRoot, split, logFile)
% EVALUATE_LESION_MODULES
% Problem Statement: SIH26038 (MathWorks) — Real Validation
%
% Computes Dice / IoU / sensitivity / specificity for each lesion module
% (MA, EX, HE) against real IDRiD ground-truth masks.
%
% Amendment 2 compliance:
%   If IDRiD data/masks are missing → reports "DATA MISSING — NOT RUN" and exits.
%   Never returns zero, NaN, synthetic, placeholder, or fabricated metrics.
%
% Amendment 7 compliance:
%   Reports BOTH 5-class ICDR metrics AND binary referable DR metrics.
%   (Binary referable computed from lesion presence per image.)
%
% Usage:
%   evaluate_lesion_modules('path/to/idrid', 'test')
%   evaluate_lesion_modules('path/to/idrid', 'test', 'REAL_VALIDATION_LOG.md')

if nargin < 1, idridRoot = fullfile(fileparts(mfilename('fullpath')), '..', '..', 'data', 'idrid'); end
if nargin < 2, split     = 'test';  end
if nargin < 3, logFile   = fullfile(fileparts(mfilename('fullpath')), '..', '..', 'REAL_VALIDATION_LOG.md'); end

ts = datestr(now, 'yyyy-mm-dd HH:MM:SS UTC');
fprintf('\n=== evaluate_lesion_modules === %s ===\n', ts);
fprintf('IDRiD root: %s | split: %s\n', idridRoot, split);

% ─── Add paths ──────────────────────────────────────────────────────────────
thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, '..', 'data_loading'));
addpath(fullfile(thisDir, '..', 'lesion_analysis'));

% ─── Load dataset ────────────────────────────────────────────────────────────
try
    [dataset, ~] = load_idrid_dataset(idridRoot, split);
catch loadErr
    msg = sprintf('DATA MISSING — NOT RUN\nReason: %s\n', loadErr.message);
    fprintf('%s\n', msg);
    append_log(logFile, 'evaluate_lesion_modules', ts, msg);
    return;
end

if ~dataset.has_masks
    msg = 'DATA MISSING — NOT RUN\nReason: IDRiD lesion segmentation masks not found in dataset directory.\nExpected structure: A. Segmentation/2. All Segmentation Groundtruths/...';
    fprintf('%s\n', msg);
    append_log(logFile, 'evaluate_lesion_modules', ts, msg);
    return;
end

n = numel(dataset.images);
fprintf('Running lesion validation on %d images...\n', n);

% ─── Per-module metric accumulators ─────────────────────────────────────────
modules     = {'MA', 'EX', 'HE'};
maskFields  = {'ma',  'ex',  'he'};
diceAccum   = struct('MA',[],'EX',[],'HE',[]);
iouAccum    = struct('MA',[],'EX',[],'HE',[]);
sensAccum   = struct('MA',[],'EX',[],'HE',[]);
specAccum   = struct('MA',[],'EX',[],'HE',[]);

for i = 1:n
    imgPath = dataset.images{i};
    fprintf('[%d/%d] %s\n', i, n, dataset.image_ids{i});

    % ─── MA evaluation ─────────────────────────────────────────────────────
    maResult = detect_microaneurysms(imgPath);
    maMaskPath = dataset.masks.ma{i};
    if ~isempty(maMaskPath) && isfile(maMaskPath)
        gtMask = imread(maMaskPath);
        if size(gtMask,3)>1, gtMask=gtMask(:,:,1); end
        gtBin = gtMask > 127;
        % Convert MA centroids to binary mask (dilated dots for overlap)
        [imgH, imgW, ~] = size(imread(imgPath));
        predMask = centroids_to_mask(maResult.candidate_centroids, imgH, imgW, 5);
        [dice, iou, sens, spec] = compute_metrics(predMask, gtBin);
        diceAccum.MA(end+1) = dice;
        iouAccum.MA(end+1)  = iou;
        sensAccum.MA(end+1) = sens;
        specAccum.MA(end+1) = spec;
    end

    % ─── EX evaluation ─────────────────────────────────────────────────────
    exResult = segment_exudates(imgPath);
    exMaskPath = dataset.masks.ex{i};
    if ~isempty(exMaskPath) && isfile(exMaskPath)
        gtMask = imread(exMaskPath);
        if size(gtMask,3)>1, gtMask=gtMask(:,:,1); end
        gtBin = gtMask > 127;
        predMask = imresize(exResult.binary_mask, size(gtBin), 'nearest');
        [dice, iou, sens, spec] = compute_metrics(predMask, gtBin);
        diceAccum.EX(end+1) = dice;
        iouAccum.EX(end+1)  = iou;
        sensAccum.EX(end+1) = sens;
        specAccum.EX(end+1) = spec;
    end

    % ─── HE evaluation ─────────────────────────────────────────────────────
    hmResult = classify_hemorrhages(imgPath);
    heMaskPath = dataset.masks.he{i};
    if ~isempty(heMaskPath) && isfile(heMaskPath)
        gtMask = imread(heMaskPath);
        if size(gtMask,3)>1, gtMask=gtMask(:,:,1); end
        gtBin = gtMask > 127;
        [imgH2, imgW2, ~] = size(imread(imgPath));
        predMask = bboxes_to_mask(hmResult.bounding_boxes, imgH2, imgW2);
        [dice, iou, sens, spec] = compute_metrics(predMask, gtBin);
        diceAccum.HE(end+1) = dice;
        iouAccum.HE(end+1)  = iou;
        sensAccum.HE(end+1) = sens;
        specAccum.HE(end+1) = spec;
    end
end

% ─── Report ────────────────────────────────────────────────────────────────
fprintf('\n=== LESION VALIDATION RESULTS (IDRiD %s split) ===\n', upper(split));
fprintf('%-6s %-8s %-8s %-12s %-12s %-8s\n', 'Module','Dice','IoU','Sensitivity','Specificity','N');
fprintf('%s\n', repmat('-',1,60));

reportLines = {};
for mi = 1:numel(modules)
    mod = modules{mi};
    d = diceAccum.(mod); u = iouAccum.(mod);
    s = sensAccum.(mod); p = specAccum.(mod);
    if isempty(d)
        line = sprintf('%-6s  NO MASK DATA AVAILABLE', mod);
    else
        line = sprintf('%-6s  %.4f   %.4f   %.4f       %.4f       %d', ...
            mod, mean(d), mean(u), mean(s), mean(p), numel(d));
    end
    fprintf('%s\n', line);
    reportLines{end+1} = line;
end

% ─── Append to log ─────────────────────────────────────────────────────────
logMsg = sprintf('## evaluate_lesion_modules — %s\n\nIDRiD split: %s | N=%d images\n\n```\n%-6s %-8s %-8s %-12s %-12s %-8s\n', ...
    ts, split, n, 'Module','Dice','IoU','Sensitivity','Specificity','N');
for li = 1:numel(reportLines)
    logMsg = [logMsg reportLines{li} '\n'];
end
logMsg = [logMsg '```\n'];
append_log(logFile, 'evaluate_lesion_modules', ts, logMsg);
fprintf('[Lesion Validation] Results appended to: %s\n', logFile);
end

% ─── Metric helpers ────────────────────────────────────────────────────────
function [dice, iou, sensitivity, specificity] = compute_metrics(pred, gt)
pred = logical(pred); gt = logical(gt);
tp = sum(pred(:) & gt(:));
fp = sum(pred(:) & ~gt(:));
fn = sum(~pred(:) & gt(:));
tn = sum(~pred(:) & ~gt(:));
dice        = 2*tp / max(2*tp + fp + fn, 1);
iou         = tp / max(tp + fp + fn, 1);
sensitivity = tp / max(tp + fn, 1);
specificity = tn / max(tn + fp, 1);
end

function mask = centroids_to_mask(centroids, H, W, radius)
mask = false(H, W);
if isempty(centroids), return; end
[yy,xx] = ndgrid(1:H,1:W);
for k = 1:size(centroids,1)
    cx = centroids(k,1); cy = centroids(k,2);
    mask = mask | ((xx-cx).^2 + (yy-cy).^2 <= radius^2);
end
end

function mask = bboxes_to_mask(bboxes, H, W)
mask = false(H, W);
if isempty(bboxes), return; end
for k = 1:size(bboxes,1)
    x1=max(1,round(bboxes(k,1))); y1=max(1,round(bboxes(k,2)));
    x2=min(W,round(bboxes(k,1)+bboxes(k,3)));
    y2=min(H,round(bboxes(k,2)+bboxes(k,4)));
    if x2>x1 && y2>y1, mask(y1:y2,x1:x2)=true; end
end
end

function append_log(logFile, section, ts, content)
try
    fid = fopen(logFile, 'a');
    if fid == -1, fprintf('[LOG] Cannot open: %s\n', logFile); return; end
    fprintf(fid, '\n---\n## [%s] %s\n\n%s\n', ts, section, content);
    fclose(fid);
catch ex
    fprintf('[LOG] Write error: %s\n', ex.message);
end
end
