function [ma] = detect_microaneurysms(imagePath, saveOverlay)
% DETECT_MICROANEURYSMS
% Problem Statement: SIH26038 (MathWorks) - Lesion Analysis
%
% Implementation Type: CANDIDATE DETECTION
%   Produces candidate centroid coordinates (not pixel-level segmentation masks).
%   Use YOLO output (inference.py) for production bounding-box detection.
%   This MATLAB module provides a classical image-processing perspective.
%
% ╔══════════════════════════════════════════════════════════════════════╗
% ║  STATUS: PROTOTYPE — NOT CLINICALLY VALIDATED                      ║
% ║                                                                      ║
% ║  Method: Morphological top-hat transform on CLAHE-enhanced green   ║
% ║  channel. Candidate blobs filtered by area and circularity.        ║
% ║                                                                      ║
% ║  No ground-truth microaneurysm masks available in this repo.       ║
% ║  Sensitivity and specificity NOT evaluated.                         ║
% ╚══════════════════════════════════════════════════════════════════════╝
%
% Syntax:
%   ma = detect_microaneurysms(imagePath)
%   ma = detect_microaneurysms(imagePath, true)   % saves overlay PNG
%
% Outputs:
%   ma.candidate_count     integer — number of MA candidates detected
%   ma.candidate_centroids [Nx2] array of [x, y] centroids
%   ma.candidate_areas     [Nx1] area in pixels^2
%   ma.method              'morphological_tophat'
%   ma.validated           false
%   ma.note                disclaimer

if nargin < 2, saveOverlay = false; end

fprintf('[MATLAB MA Detection] Processing: %s\\n', imagePath);
fprintf('[MATLAB MA Detection] PROTOTYPE candidate detection — not clinically validated.\\n');

% ─── 1. Load and prepare ─────────────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1, rawRGB = cat(3, rawRGB, rawRGB, rawRGB); end
[imgH, imgW, ~] = size(rawRGB);

% Green channel: maximum haemoglobin absorption → best MA contrast
green = rawRGB(:, :, 2);

% CLAHE to equalize illumination (critical for peripheral vs central consistency)
enhanced = adapthisteq(green, 'ClipLimit', 0.02, 'NumTiles', [8 8]);

% ─── 2. Top-hat morphological transform ──────────────────────────────────
% White top-hat: enhanced = image - morphological_opening
% Isolates bright structures (MAs, dots) smaller than the disk SE.
% Disk radius = 8px approximates upper bound of microaneurysm size at
% typical fundus camera resolution (~12 µm/px at 45° FOV, 3.5M px).
diskSE   = strel('disk', 8);
topHat   = imtophat(enhanced, diskSE);

% ─── 3. Adaptive threshold + binary mask ─────────────────────────────────
% Otsu threshold on top-hat response
threshLevel = graythresh(topHat);
bwRaw       = topHat > (threshLevel * 255);

% ─── 4. Connected component analysis with shape filters ─────────────────
% Remove objects outside plausible MA size range
% MA area: 5–200 px² (at standard resolution); eccentricity < 0.85 (roughly circular)
bwFiltered = bwareaopen(bwRaw, 5);

props = regionprops(bwFiltered, 'Centroid', 'Area', 'Eccentricity', 'BoundingBox');

% Apply area ceiling and circularity filter
validIdx = false(length(props), 1);
for k = 1:length(props)
    if props(k).Area <= 200 && props(k).Eccentricity < 0.85
        validIdx(k) = true;
    end
end

validProps = props(validIdx);

% ─── 5. Build output ─────────────────────────────────────────────────────
ma = struct();
ma.candidate_count    = numel(validProps);
ma.method             = 'morphological_tophat';
ma.validated          = false;
ma.note               = 'PROTOTYPE CANDIDATE DETECTION. No ground-truth available. Not clinically validated.';

if ma.candidate_count > 0
    centroids = vertcat(validProps.Centroid);
    areas     = vertcat(validProps.Area);
    ma.candidate_centroids = round(centroids);
    ma.candidate_areas     = areas;
else
    ma.candidate_centroids = zeros(0, 2);
    ma.candidate_areas     = zeros(0, 1);
end

fprintf('[MA Detection] Candidates found: %d | %s\\n', ma.candidate_count, ma.note);

% ─── 6. Save overlay ─────────────────────────────────────────────────────
ma.overlay_path = '';
if saveOverlay && ma.candidate_count > 0
    try
        fig = figure('Visible', 'off');
        imshow(rawRGB); hold on;
        for k = 1:numel(validProps)
            cx = validProps(k).Centroid(1);
            cy = validProps(k).Centroid(2);
            plot(cx, cy, 'g.', 'MarkerSize', 8);
            bb = validProps(k).BoundingBox;
            rectangle('Position', bb, 'EdgeColor', 'g', 'LineWidth', 1);
        end
        title(sprintf('MA Candidate Detection (%d candidates) — PROTOTYPE', ma.candidate_count), ...
            'FontSize', 10);
        hold off;
        [fDir, fName, ~] = fileparts(imagePath);
        ma.overlay_path = fullfile(fDir, sprintf('%s_ma_overlay.png', fName));
        saveas(fig, ma.overlay_path);
        close(fig);
        fprintf('[MA Detection] Overlay saved: %s\\n', ma.overlay_path);
    catch ex
        fprintf('[MA Detection] Could not save overlay: %s\\n', ex.message);
    end
end
end
