function [dataset, localization] = load_idrid_dataset(dataRoot, split)
% LOAD_IDRID_DATASET
% Problem Statement: SIH26038 (MathWorks) — Data Loading
%
% Loads the IDRiD (Indian Diabetic Retinopathy Image Dataset) from a local
% directory tree. Fails LOUDLY if required data is missing — never silently
% returns synthetic or placeholder data.
%
% Expected directory structure under dataRoot:
%   dataRoot/
%     B. Disease Grading/
%       1. Original Images/
%         a. Training Set/*.jpg
%         b. Testing Set/*.jpg
%       2. Groundtruths/
%         a. IDRiD_Disease Grading_Training Labels.csv
%         b. IDRiD_Disease Grading_Testing Labels.csv
%     A. Segmentation/
%       1. Original Images/
%         a. Training Set/*.jpg
%         b. Testing Set/*.jpg
%       2. All Segmentation Groundtruths/
%         a. Training Set/
%           1. Microaneurysms/*.tif   (suffix _MA.tif)
%           2. Haemorrhages/*.tif     (suffix _HE.tif)
%           3. Hard Exudates/*.tif    (suffix _EX.tif)
%           4. Soft Exudates/*.tif    (suffix _SE.tif)
%           5. Optic Disc/*.tif       (suffix _OD.tif)
%         b. Testing Set/ (same structure)
%     C. Localization/
%       1. IDRiD_Disease Grading_Training Labels.csv  (reused — OD/Fovea cols)
%       OR dedicated Localization CSV with columns:
%         Image No, Optic Disk X, Optic Disk Y, Fovea X, Fovea Y
%
% Syntax:
%   [ds, loc] = load_idrid_dataset(dataRoot)          % training split
%   [ds, loc] = load_idrid_dataset(dataRoot, 'test')  % testing split
%
% Returns:
%   dataset.images         cell array of image file paths
%   dataset.labels         numeric array of DR grades (0–4)
%   dataset.image_ids      cell array of image IDs (e.g. 'IDRiD_01')
%   dataset.split          'train' or 'test'
%   dataset.masks.ma       cell array: microaneurysm mask paths ('' if absent)
%   dataset.masks.he       cell array: haemorrhage mask paths ('' if absent)
%   dataset.masks.ex       cell array: hard exudate mask paths ('' if absent)
%   dataset.masks.se       cell array: soft exudate mask paths ('' if absent)
%   dataset.masks.od       cell array: optic disc mask paths ('' if absent)
%   dataset.has_masks      logical — true iff ANY mask files were found
%   localization.image_ids cell array
%   localization.od_x      numeric (pixels)
%   localization.od_y      numeric (pixels)
%   localization.fovea_x   numeric (pixels)
%   localization.fovea_y   numeric (pixels)
%   localization.available logical — false if localization CSV not found

if nargin < 2, split = 'train'; end
split = lower(strtrim(split));
if ~ismember(split, {'train','test'})
    error('[IDRiD Loader] split must be ''train'' or ''test''. Got: %s', split);
end

fprintf('[IDRiD Loader] Loading split="%s" from: %s\n', split, dataRoot);

% ─── Validate root exists ──────────────────────────────────────────────────
if ~isfolder(dataRoot)
    error('[IDRiD Loader] DATA MISSING: root directory not found:\n  %s\nObtain IDRiD from IEEE DataPort (https://ieee-dataport.org/open-access/indian-diabetic-retinopathy-image-dataset-idrid)', dataRoot);
end

% ─── Map split to sub-folder names ─────────────────────────────────────────
if strcmp(split, 'train')
    imgSubDir   = fullfile('B. Disease Grading', '1. Original Images', 'a. Training Set');
    labelFile   = fullfile('B. Disease Grading', '2. Groundtruths', 'a. IDRiD_Disease Grading_Training Labels.csv');
    maskBaseDir = fullfile('A. Segmentation', '2. All Segmentation Groundtruths', 'a. Training Set');
else
    imgSubDir   = fullfile('B. Disease Grading', '1. Original Images', 'b. Testing Set');
    labelFile   = fullfile('B. Disease Grading', '2. Groundtruths', 'b. IDRiD_Disease Grading_Testing Labels.csv');
    maskBaseDir = fullfile('A. Segmentation', '2. All Segmentation Groundtruths', 'b. Testing Set');
end

imgDir    = fullfile(dataRoot, imgSubDir);
labelPath = fullfile(dataRoot, labelFile);

% ─── Validate image directory ──────────────────────────────────────────────
if ~isfolder(imgDir)
    error('[IDRiD Loader] DATA MISSING: image directory not found:\n  %s', imgDir);
end

imgFiles = [dir(fullfile(imgDir,'*.jpg')); dir(fullfile(imgDir,'*.JPG')); ...
            dir(fullfile(imgDir,'*.png')); dir(fullfile(imgDir,'*.tif'))];

if isempty(imgFiles)
    error('[IDRiD Loader] DATA MISSING: no image files found in:\n  %s\nExpected *.jpg fundus images.', imgDir);
end

fprintf('[IDRiD Loader] Found %d images in %s\n', numel(imgFiles), imgDir);

% ─── Load labels ───────────────────────────────────────────────────────────
if ~isfile(labelPath)
    error('[IDRiD Loader] DATA MISSING: label CSV not found:\n  %s', labelPath);
end

try
    labelTbl = readtable(labelPath);
catch err
    error('[IDRiD Loader] Failed to read label CSV: %s\n  File: %s', err.message, labelPath);
end

% Detect column names (IDRiD uses 'Image name' and 'Retinopathy grade')
colNames = lower(labelTbl.Properties.VariableNames);
idCol    = find(contains(colNames, 'image'), 1);
gradeCol = find(contains(colNames, {'grade','retinopathy','label'}), 1);

if isempty(idCol) || isempty(gradeCol)
    error('[IDRiD Loader] Cannot find required columns in label CSV.\n  Available: %s\n  Expected columns containing "image" and "grade/retinopathy/label".', strjoin(labelTbl.Properties.VariableNames, ', '));
end

labelMap = containers.Map(string(table2cell(labelTbl(:,idCol))), ...
                           labelTbl{:,gradeCol});

% ─── Build dataset struct ───────────────────────────────────────────────────
n = numel(imgFiles);
imagePaths  = cell(n,1);
imageIds    = cell(n,1);
labels      = nan(n,1);
masksMa     = cell(n,1);
masksHe     = cell(n,1);
masksEx     = cell(n,1);
masksSe     = cell(n,1);
masksOd     = cell(n,1);

for i = 1:n
    imgPth = fullfile(imgFiles(i).folder, imgFiles(i).name);
    [~, baseId, ~] = fileparts(imgFiles(i).name);
    imagePaths{i} = imgPth;
    imageIds{i}   = baseId;

    % Grade lookup
    if isKey(labelMap, string(baseId))
        labels(i) = double(labelMap(string(baseId)));
    else
        fprintf('[IDRiD Loader] WARNING: no label found for image "%s" — will be NaN\n', baseId);
    end

    % Mask paths (set to '' if mask file not present — caller must check)
    masksMa{i} = _find_mask(maskBaseDir, '1. Microaneurysms', baseId, '_MA');
    masksHe{i} = _find_mask(maskBaseDir, '2. Haemorrhages',   baseId, '_HE');
    masksEx{i} = _find_mask(maskBaseDir, '3. Hard Exudates',  baseId, '_EX');
    masksSe{i} = _find_mask(maskBaseDir, '4. Soft Exudates',  baseId, '_SE');
    masksOd{i} = _find_mask(maskBaseDir, '5. Optic Disc',     baseId, '_OD');
end

hasMasks = any(~cellfun(@isempty, masksMa)) || any(~cellfun(@isempty, masksHe)) || ...
           any(~cellfun(@isempty, masksEx)) || any(~cellfun(@isempty, masksSe)) || ...
           any(~cellfun(@isempty, masksOd));

dataset = struct();
dataset.images    = imagePaths;
dataset.labels    = labels;
dataset.image_ids = imageIds;
dataset.split     = split;
dataset.masks     = struct('ma',{masksMa},'he',{masksHe},'ex',{masksEx},'se',{masksSe},'od',{masksOd});
dataset.has_masks = hasMasks;
dataset.root      = dataRoot;

if hasMasks
    fprintf('[IDRiD Loader] Lesion mask files found for at least one image.\n');
else
    fprintf('[IDRiD Loader] NOTE: No lesion mask files found in:\n  %s\n  Segmentation validation will report DATA MISSING.\n', maskBaseDir);
end

% ─── Localization subset ────────────────────────────────────────────────────
localization = struct();
localization.available = false;

locDir = fullfile(dataRoot, 'C. Localization');

% Try multiple plausible CSV names
locCsvCandidates = {
    fullfile(locDir, 'IDRiD_OD_Fovea_Localization.csv');
    fullfile(locDir, 'IDRiD_Localization_Training.csv');
    fullfile(locDir, 'IDRiD_Localization_Testing.csv');
    fullfile(locDir, 'Localization.csv');
    fullfile(dataRoot, 'B. Disease Grading', '2. Groundtruths', 'a. IDRiD_Disease Grading_Training Labels.csv');
};

locCsv = '';
for ci = 1:numel(locCsvCandidates)
    if isfile(locCsvCandidates{ci})
        locCsv = locCsvCandidates{ci};
        break;
    end
end

if isempty(locCsv)
    fprintf('[IDRiD Loader] NOTE: Localization CSV not found. OD/Fovea validation cannot run.\n');
    localization.image_ids = {};
    localization.od_x = [];
    localization.od_y = [];
    localization.fovea_x = [];
    localization.fovea_y = [];
else
    try
        locTbl = readtable(locCsv);
        lColNames = lower(locTbl.Properties.VariableNames);
        idCol  = find(contains(lColNames,'image'),1);
        odxCol = find(contains(lColNames,'optic') & contains(lColNames,'x'),1);
        odyCol = find(contains(lColNames,'optic') & contains(lColNames,'y'),1);
        fxCol  = find(contains(lColNames,'fovea') & contains(lColNames,'x'),1);
        fyCol  = find(contains(lColNames,'fovea') & contains(lColNames,'y'),1);

        if ~isempty(idCol) && ~isempty(odxCol) && ~isempty(odyCol) && ~isempty(fxCol) && ~isempty(fyCol)
            localization.available  = true;
            localization.image_ids  = string(table2cell(locTbl(:,idCol)));
            localization.od_x       = locTbl{:,odxCol};
            localization.od_y       = locTbl{:,odyCol};
            localization.fovea_x    = locTbl{:,fxCol};
            localization.fovea_y    = locTbl{:,fyCol};
            localization.csv_path   = locCsv;
            fprintf('[IDRiD Loader] Localization loaded: %d entries from %s\n', height(locTbl), locCsv);
        else
            fprintf('[IDRiD Loader] NOTE: Localization CSV found but required columns (OD X/Y, Fovea X/Y) missing.\n');
        end
    catch err
        fprintf('[IDRiD Loader] WARNING: Could not parse localization CSV: %s\n', err.message);
    end
end

fprintf('[IDRiD Loader] Dataset ready: %d images, %d with valid labels.\n', n, sum(~isnan(labels)));
end

% ─── Helper: find mask file path ───────────────────────────────────────────
function p = _find_mask(maskBaseDir, subDir, imageId, suffix)
    p = '';
    candidates = {
        fullfile(maskBaseDir, subDir, [imageId suffix '.tif']);
        fullfile(maskBaseDir, subDir, [imageId suffix '.png']);
        fullfile(maskBaseDir, subDir, [imageId '.tif']);
        fullfile(maskBaseDir, subDir, [imageId '.png']);
    };
    for k = 1:numel(candidates)
        if isfile(candidates{k})
            p = candidates{k};
            return;
        end
    end
end
