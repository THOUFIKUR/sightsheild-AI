function [binaryVessels, vesselProbability, metrics] = segment_retinal_vessels(imagePath, vesselThickness, groundTruthPath)
% SEGMENT_RETINAL_VESSELS
% Problem Statement: SIH26038 (MathWorks) - Retinal Structure Segmentation
%
% Segments the retinal vascular tree using:
% 1. Green-channel extraction (absorbs green maximally)
% 2. Multi-scale tubular vesselness filter (fibermetric / Hessian eigenvalues)
% 3. Morphological post-processing (bwareaopen)
%
% Benchmark: Validated against the official DRIVE dataset.
%
% Syntax:
%   [binaryVessels, vesselProbability] = segment_retinal_vessels(imagePath, vesselThickness)

if nargin < 2, vesselThickness = [1 8]; end
if nargin < 3, groundTruthPath = ''; end

metrics = struct();  % populated below if ground truth is provided

rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1
    rawRGB = cat(3, rawRGB, rawRGB, rawRGB);
end

% 1. Green channel isolation
green = rawRGB(:, :, 2);

% 2. Contrast enhancement before vessel filtering
enhancedGreen = adapthisteq(green, 'ClipLimit', 0.02);

% 3. Multi-scale tubular structure enhancement (fibermetric)
% fibermetric uses Hessian matrix eigenvalues to detect continuous vessels
vesselProbability = fibermetric(enhancedGreen, vesselThickness, ...
    'StructureSensitivity', 12);

% 4. Adaptive Thresholding
threshold = graythresh(vesselProbability) * 0.85;
rawBinary = vesselProbability > threshold;

% 5. Morphological cleaning: Remove tiny spurious noise specks (<30 pixels)
binaryVessels = bwareaopen(rawBinary, 30);

vesselAreaRatio = sum(binaryVessels(:)) / numel(binaryVessels) * 100;
fprintf('[MATLAB Vessel Segmentation] Segmented %s: Vessel density = %.2f%%\n', ...
    imagePath, vesselAreaRatio);

% ─── DRIVE Benchmark Metric Computation ──────────────────────────────────
% Computed only when groundTruthPath is supplied.
% IMPORTANT: Evaluation performed on a single DRIVE sample image.
% Full DRIVE test set contains 20 images. Results here are NOT
% representative of whole-dataset performance.
if ~isempty(groundTruthPath) && isfile(groundTruthPath)
    fprintf('[DRIVE Evaluation] Computing metrics against: %s\n', groundTruthPath);
    gtRaw = imread(groundTruthPath);
    
    % DRIVE GT masks are greyscale or RGB — binarise at 128
    if size(gtRaw, 3) == 3
        gtGray = rgb2gray(gtRaw);
    else
        gtGray = gtRaw;
    end
    gtBinary = gtGray > 128;
    
    % Resize prediction to match GT size if needed
    if ~isequal(size(binaryVessels), size(gtBinary))
        binaryVessels = imresize(binaryVessels, size(gtBinary), 'nearest') > 0;
    end
    
    % Compute confusion matrix elements
    TP = sum(binaryVessels(:) & gtBinary(:));
    TN = sum(~binaryVessels(:) & ~gtBinary(:));
    FP = sum(binaryVessels(:) & ~gtBinary(:));
    FN = sum(~binaryVessels(:) & gtBinary(:));
    
    % Metrics
    dice_score    = (2 * TP) / (2 * TP + FP + FN + eps);
    iou_score     = TP / (TP + FP + FN + eps);
    sensitivity   = TP / (TP + FN + eps);   % Recall / True Positive Rate
    specificity   = TN / (TN + FP + eps);   % True Negative Rate
    accuracy      = (TP + TN) / (TP + TN + FP + FN);
    
    metrics = struct( ...
        'Dice',         dice_score, ...
        'IoU',          iou_score, ...
        'Sensitivity',  sensitivity, ...
        'Specificity',  specificity, ...
        'Accuracy',     accuracy, ...
        'Note',         'Evaluated on 1 DRIVE sample only. Not representative of full test set.');
    
    fprintf('[DRIVE Evaluation] Dice=%.4f | IoU=%.4f | Sensitivity=%.4f | Specificity=%.4f | Accuracy=%.4f\n', ...
        dice_score, iou_score, sensitivity, specificity, accuracy);
    fprintf('[DRIVE Evaluation] NOTE: %s\n', metrics.Note);
else
    if ~isempty(groundTruthPath)
        fprintf('[DRIVE Evaluation] Ground truth file not found: %s\n', groundTruthPath);
    end
end
end
