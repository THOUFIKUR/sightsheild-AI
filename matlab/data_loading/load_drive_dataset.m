function [dataset] = load_drive_dataset(dataRoot, split)
% LOAD_DRIVE_DATASET
% Problem Statement: SIH26038 (MathWorks) — Data Loading
%
% Loads the DRIVE (Digital Retinal Images for Vessel Extraction) dataset.
% Fails LOUDLY if required data is missing — never returns synthetic data.
%
% Expected directory structure under dataRoot:
%   dataRoot/
%     training/
%       images/   *.tif  (fundus images, 565x584)
%       1st_manual/*.gif (vessel ground-truth masks)
%       2nd_manual/*.gif (optional second annotator)
%       mask/    *.gif   (FOV masks)
%     test/
%       images/   *.tif
%       1st_manual/*.gif
%       mask/    *.gif
%
% Syntax:
%   ds = load_drive_dataset(dataRoot)            % training split
%   ds = load_drive_dataset(dataRoot, 'test')    % test split
%
% Returns:
%   dataset.images           cell array of image file paths
%   dataset.masks_vessel     cell array of vessel GT mask paths
%   dataset.masks_fov        cell array of FOV mask paths ('' if absent)
%   dataset.image_ids        cell array of image IDs (e.g. '21')
%   dataset.split            'training' or 'test'
%   dataset.has_vessel_masks logical — true iff ALL vessel masks found

if nargin < 2, split = 'training'; end
split = lower(strtrim(split));
if ~ismember(split, {'training','train','test'})
    error('[DRIVE Loader] split must be ''training'' or ''test''. Got: %s', split);
end
if strcmp(split,'train'), split = 'training'; end

fprintf('[DRIVE Loader] Loading split="%s" from: %s\n', split, dataRoot);

if ~isfolder(dataRoot)
    error('[DRIVE Loader] DATA MISSING: root directory not found:\n  %s\nObtain DRIVE from https://drive.grand-challenge.org/', dataRoot);
end

imgDir    = fullfile(dataRoot, split, 'images');
maskDir   = fullfile(dataRoot, split, '1st_manual');
fovDir    = fullfile(dataRoot, split, 'mask');

if ~isfolder(imgDir)
    error('[DRIVE Loader] DATA MISSING: image directory not found:\n  %s', imgDir);
end

imgFiles = [dir(fullfile(imgDir,'*.tif')); dir(fullfile(imgDir,'*.TIF')); ...
            dir(fullfile(imgDir,'*.png')); dir(fullfile(imgDir,'*.jpg'))];

if isempty(imgFiles)
    error('[DRIVE Loader] DATA MISSING: no image files found in:\n  %s\nExpected *.tif fundus images.', imgDir);
end

fprintf('[DRIVE Loader] Found %d images.\n', numel(imgFiles));

if ~isfolder(maskDir)
    error('[DRIVE Loader] DATA MISSING: vessel mask directory not found:\n  %s\nExpected 1st_manual/*.gif ground-truth masks.', maskDir);
end

n = numel(imgFiles);
imagePaths  = cell(n,1);
maskPaths   = cell(n,1);
fovPaths    = cell(n,1);
imageIds    = cell(n,1);
hasAllMasks = true;

for i = 1:n
    imgPth = fullfile(imgFiles(i).folder, imgFiles(i).name);
    [~, baseName, ~] = fileparts(imgFiles(i).name);
    % DRIVE image IDs like '21_training', mask IDs like '21_manual1'
    numPart = regexp(baseName, '^\d+', 'match', 'once');
    imagePaths{i} = imgPth;
    imageIds{i}   = numPart;

    % Find vessel mask
    mCandidates = {
        fullfile(maskDir, [numPart '_manual1.gif']);
        fullfile(maskDir, [numPart '_manual1.png']);
        fullfile(maskDir, [numPart '_manual1.tif']);
        fullfile(maskDir, [baseName '_manual1.gif']);
    };
    maskFound = '';
    for k = 1:numel(mCandidates)
        if isfile(mCandidates{k}), maskFound = mCandidates{k}; break; end
    end
    maskPaths{i} = maskFound;
    if isempty(maskFound)
        fprintf('[DRIVE Loader] WARNING: vessel mask not found for image "%s"\n', baseName);
        hasAllMasks = false;
    end

    % Find FOV mask
    fCandidates = {
        fullfile(fovDir, [numPart '_' split '_mask.gif']);
        fullfile(fovDir, [numPart '_test_mask.gif']);
        fullfile(fovDir, [baseName '_mask.gif']);
        fullfile(fovDir, [numPart '_mask.gif']);
    };
    fovFound = '';
    for k = 1:numel(fCandidates)
        if isfile(fCandidates{k}), fovFound = fCandidates{k}; break; end
    end
    fovPaths{i} = fovFound;
end

dataset = struct();
dataset.images          = imagePaths;
dataset.masks_vessel    = maskPaths;
dataset.masks_fov       = fovPaths;
dataset.image_ids       = imageIds;
dataset.split           = split;
dataset.has_vessel_masks = hasAllMasks;
dataset.root            = dataRoot;

if ~hasAllMasks
    fprintf('[DRIVE Loader] NOTE: Some vessel masks are missing — vessel segmentation validation may be incomplete.\n');
end

fprintf('[DRIVE Loader] Dataset ready: %d images, vessel masks complete=%d.\n', n, hasAllMasks);
end
