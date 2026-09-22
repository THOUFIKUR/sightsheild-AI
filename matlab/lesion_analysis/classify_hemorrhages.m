function [hm] = classify_hemorrhages(imagePath, saveOverlay)
% CLASSIFY_HEMORRHAGES
% Problem Statement: SIH26038 (MathWorks) - Lesion Analysis
%
% Implementation Type: CANDIDATE DETECTION + CLASSIFICATION
%   Detects dark blobs and classifies them as dot vs flame hemorrhages.
%   Produces bounding boxes (detection), not pixel-level masks.
%
% ╔══════════════════════════════════════════════════════════════════════╗
% ║  STATUS: PROTOTYPE — NOT CLINICALLY VALIDATED                      ║
% ║                                                                      ║
% ║  Method: Bottom-hat morphological transform detects dark blobs.    ║
% ║  Shape analysis classifies dot (small, circular) vs flame          ║
% ║  (larger, irregular) hemorrhages.                                   ║
% ║                                                                      ║
% ║  No hemorrhage ground-truth masks in this repo.                    ║
% ║  Detection accuracy NOT evaluated.                                  ║
% ╚══════════════════════════════════════════════════════════════════════╝
%
% Syntax:
%   hm = classify_hemorrhages(imagePath)
%   hm = classify_hemorrhages(imagePath, true)   % saves overlay
%
% Outputs:
%   hm.total_count        integer — total candidate hemorrhages
%   hm.dot_count          integer — small circular type
%   hm.flame_count        integer — large irregular type
%   hm.bounding_boxes     [Nx4] [x,y,w,h] per candidate
%   hm.types              {Nx1} cellstr: 'dot' or 'flame'
%   hm.areas              [Nx1] pixel areas
%   hm.method             'morphological_bottomhat'
%   hm.validated          false

if nargin < 2, saveOverlay = false; end

fprintf('[MATLAB Hemorrhage] Processing: %s\\n', imagePath);
fprintf('[MATLAB Hemorrhage] PROTOTYPE CANDIDATE DETECTION — not clinically validated.\\n');

% ─── 1. Load image ────────────────────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1, rawRGB = cat(3, rawRGB, rawRGB, rawRGB); end

green = rawRGB(:, :, 2);
enhanced = adapthisteq(green, 'ClipLimit', 0.02, 'NumTiles', [8 8]);

% ─── 2. Bottom-hat transform ─────────────────────────────────────────────
% Black bottom-hat: image_closing - image → isolates dark structures
% Use disk SE with radius 15 (covers maximum expected hemorrhage radius)
diskSE   = strel('disk', 15);
bottomHat = imbothat(enhanced, diskSE);

% ─── 3. Adaptive threshold ───────────────────────────────────────────────
% Otsu on bottom-hat response
threshLevel = graythresh(bottomHat);
bwRaw = bottomHat > round(threshLevel * 255 * 0.9);  % slightly below Otsu — more sensitive

% ─── 4. Remove very small noise specks (< 30 px²) ────────────────────────
bwFiltered = bwareaopen(bwRaw, 30);

% ─── 5. Shape-based classification ──────────────────────────────────────
props = regionprops(bwFiltered, 'Centroid', 'Area', 'Eccentricity', ...
    'BoundingBox', 'Perimeter', 'MajorAxisLength', 'MinorAxisLength');

% Hemorrhage classification criteria:
%   Dot hemorrhage:   area 30–300 px², eccentricity < 0.75 (roughly circular)
%   Flame hemorrhage: area 300–8000 px², elongated (eccentricity >= 0.75) or irregular
%   Discard: area > 8000 px² (likely vessel artifact or large retinal feature)

dotIdx   = false(length(props), 1);
flameIdx = false(length(props), 1);

for k = 1:length(props)
    a = props(k).Area;
    e = props(k).Eccentricity;
    if a >= 30 && a < 300 && e < 0.75
        dotIdx(k)   = true;
    elseif a >= 200 && a <= 8000
        flameIdx(k) = true;
    end
end

dotProps   = props(dotIdx);
flameProps = props(flameIdx);

% ─── 6. Build output ─────────────────────────────────────────────────────
hm = struct();
hm.total_count  = numel(dotProps) + numel(flameProps);
hm.dot_count    = numel(dotProps);
hm.flame_count  = numel(flameProps);
hm.method       = 'morphological_bottomhat';
hm.validated    = false;
hm.note         = 'PROTOTYPE CANDIDATE DETECTION. No GT masks in repo. Accuracy not evaluated.';

% Collect bounding boxes and types
allProps = [dotProps, flameProps];
if ~isempty(allProps)
    hm.bounding_boxes = vertcat(allProps.BoundingBox);
    hm.areas          = vertcat(allProps.Area);
    hm.types          = [repmat({'dot'},   numel(dotProps), 1); ...
                          repmat({'flame'}, numel(flameProps), 1)];
else
    hm.bounding_boxes = zeros(0, 4);
    hm.areas          = zeros(0, 1);
    hm.types          = {};
end

fprintf('[Hemorrhage] Candidates: %d total (dot=%d, flame=%d) | %s\\n', ...
    hm.total_count, hm.dot_count, hm.flame_count, hm.note);

% ─── 7. Save overlay ─────────────────────────────────────────────────────
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
        fprintf('[Hemorrhage] Could not save overlay: %s\\n', err.message);
    end
end
end
