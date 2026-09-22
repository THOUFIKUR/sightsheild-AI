function [ex] = segment_exudates(imagePath, discCenter, discRadius, saveOverlay)
% SEGMENT_EXUDATES
% Problem Statement: SIH26038 (MathWorks) - Lesion Analysis
%
% Implementation Type: CANDIDATE SEGMENTATION (pixel-level binary mask)
%   This module produces a pixel MASK — distinct from YOLO which produces
%   bounding-box DETECTIONS. Both serve different analytical purposes.
%
% ╔══════════════════════════════════════════════════════════════════════╗
% ║  STATUS: PROTOTYPE — NOT CLINICALLY VALIDATED                      ║
% ║                                                                      ║
% ║  Method: Brightness thresholding on CLAHE-enhanced image           ║
% ║  followed by optic disc exclusion and morphological cleaning.       ║
% ║                                                                      ║
% ║  No IDRiD exudate segmentation masks present in this repo.         ║
% ║  Dice/IoU metrics NOT evaluated.                                    ║
% ╚══════════════════════════════════════════════════════════════════════╝
%
% Syntax:
%   ex = segment_exudates(imagePath)
%   ex = segment_exudates(imagePath, discCenter, discRadius, true)
%
% Outputs:
%   ex.binary_mask         logical [H×W] — candidate exudate pixels
%   ex.candidate_area_px   total candidate area in pixels^2
%   ex.candidate_ratio     fraction of image area classified as exudate
%   ex.method              'brightness_thresholding'
%   ex.validated           false
%   ex.note                disclaimer

if nargin < 2, discCenter = []; end
if nargin < 3, discRadius = []; end
if nargin < 4, saveOverlay = false; end

fprintf('[MATLAB Exudate Seg] Processing: %s\\n', imagePath);
fprintf('[MATLAB Exudate Seg] PROTOTYPE SEGMENTATION — pixel mask — not clinically validated.\\n');

% ─── 1. Load image ────────────────────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1, rawRGB = cat(3, rawRGB, rawRGB, rawRGB); end
[imgH, imgW, ~] = size(rawRGB);

% ─── 2. CLAHE enhancement (all 3 channels converted to LAB) ──────────────
% Convert to Lab colour space: exudates are bright yellow-white
% L channel carries luminance — exudates appear as bright regions
labImg = rgb2lab(rawRGB);
lChannel = labImg(:,:,1);  % L channel [0–100]

% Normalise to uint8 for adapthisteq
lNorm = uint8((lChannel / 100) * 255);
lEnhanced = adapthisteq(lNorm, 'ClipLimit', 0.03, 'NumTiles', [8 8]);

% ─── 3. Brightness thresholding ──────────────────────────────────────────
% Exudates are significantly brighter than surrounding retina
% Use Otsu threshold on the enhanced L channel
threshLevel  = graythresh(lEnhanced);
bwBright     = lEnhanced > round(threshLevel * 255 * 1.05);  % slightly above Otsu

% ─── 4. Exclude optic disc region ────────────────────────────────────────
% Optic disc is also bright — must be excluded to avoid false positives
if ~isempty(discCenter) && ~isempty(discRadius)
    fprintf('[Exudate Seg] Excluding optic disc region (center=[%d,%d], r=%d)\\n', ...
        discCenter(1), discCenter(2), discRadius);
    [yy, xx]   = ndgrid(1:imgH, 1:imgW);
    discMask   = (xx - discCenter(1)).^2 + (yy - discCenter(2)).^2 <= (discRadius * 1.2)^2;
    bwBright(discMask) = false;
else
    fprintf('[Exudate Seg] Optic disc not provided — disc region NOT excluded (may cause false positives).\\n');
end

% ─── 5. Morphological cleaning ───────────────────────────────────────────
% Remove tiny specks (< 20 px²) unlikely to be exudates
bwClean = bwareaopen(bwBright, 20);

% Close small gaps within exudate patches
seClose = strel('disk', 2);
bwFinal = imclose(bwClean, seClose);

% ─── 6. Build output ─────────────────────────────────────────────────────
ex = struct();
ex.binary_mask       = bwFinal;
ex.candidate_area_px = sum(bwFinal(:));
ex.candidate_ratio   = ex.candidate_area_px / (imgH * imgW);
ex.method            = 'brightness_thresholding_lab';
ex.validated         = false;
ex.note              = 'PROTOTYPE SEGMENTATION (pixel mask). No IDRiD GT masks in repo. Dice/IoU not evaluated.';

fprintf('[Exudate Seg] Candidate area: %d px (%.2f%% of image) | %s\\n', ...
    ex.candidate_area_px, ex.candidate_ratio * 100, ex.note);

% ─── 7. Save overlay ─────────────────────────────────────────────────────
ex.overlay_path = '';
if saveOverlay
    try
        overlay = rawRGB;
        % Colour candidate exudate pixels yellow
        overlay(:,:,1) = uint8(double(overlay(:,:,1)) .* ~bwFinal + 255 .* bwFinal);
        overlay(:,:,2) = uint8(double(overlay(:,:,2)) .* ~bwFinal + 255 .* bwFinal);
        overlay(:,:,3) = uint8(double(overlay(:,:,3)) .* ~bwFinal);

        fig = figure('Visible', 'off');
        subplot(1,2,1); imshow(rawRGB);    title('Original');
        subplot(1,2,2); imshow(overlay);   title(sprintf('Exudate Candidates — PROTOTYPE (%d px)', ex.candidate_area_px));
        [fDir, fName, ~] = fileparts(imagePath);
        ex.overlay_path = fullfile(fDir, sprintf('%s_exudate_seg_overlay.png', fName));
        saveas(fig, ex.overlay_path);
        close(fig);
        fprintf('[Exudate Seg] Overlay saved: %s\\n', ex.overlay_path);
    catch err
        fprintf('[Exudate Seg] Could not save overlay: %s\\n', err.message);
    end
end
end
