function [disc] = detect_optic_disc(imagePath, saveOverlay)
% DETECT_OPTIC_DISC
% Problem Statement: SIH26038 (MathWorks) - Retinal Structure Analysis
%
% Implementation Type: LOCALIZATION (not segmentation — outputs center
%   coordinates and radius, not a pixel-level binary mask)
%
% Status: PROTOTYPE IMPLEMENTATION
%   The optic disc is the brightest large circular structure in a
%   fundus image. This function uses multi-scale Hough circle detection
%   on the CLAHE-enhanced green channel. Falls back to largest bright-blob
%   regionprops if imfindcircles (Computer Vision Toolbox) is unavailable.
%
% NOT clinically validated. Results should be verified by a clinician.
%
% Syntax:
%   disc = detect_optic_disc(imagePath)
%   disc = detect_optic_disc(imagePath, true)   % saves overlay PNG
%
% Outputs:
%   disc.center          [x, y] pixel coordinates of disc center
%   disc.radius          estimated disc radius in pixels
%   disc.bounding_box    [x, y, width, height]
%   disc.confidence      detection confidence (0.0 – 1.0) — heuristic
%   disc.method          string: 'hough_circle' or 'bright_blob'
%   disc.overlay_path    path to saved overlay PNG (if saveOverlay=true)
%   disc.note            disclaimer text

if nargin < 2, saveOverlay = false; end

fprintf('[MATLAB Optic Disc] Processing: %s\\n', imagePath);
fprintf('[MATLAB Optic Disc] Method: Prototype — Hough circle on brightest green-channel region.\\n');

% ─── 1. Load and prepare image ───────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1
    rawRGB = cat(3, rawRGB, rawRGB, rawRGB);
end
[imgH, imgW, ~] = size(rawRGB);

% Green channel: optic disc appears bright due to nerve fibre reflectance
green = rawRGB(:, :, 2);

% CLAHE to normalise illumination before disc detection
enhancedGreen = adapthisteq(green, 'ClipLimit', 0.02, 'NumTiles', [8 8]);

% Gaussian blur to smooth vessel clutter before circle detection
blurred = imgaussfilt(double(enhancedGreen), 4.0);
blurredUint8 = uint8(blurred);

% ─── 2. Hough circle detection (Computer Vision Toolbox) ─────────────────
disc = struct();
disc.method    = 'bright_blob';  % default; overwritten below if Hough succeeds
disc.note      = 'PROTOTYPE LOCALIZATION — Not clinically validated. May fail on heavily diseased or poor-quality images.';

% Optic disc diameter is typically 1/7 to 1/5 of image width
discRadiusMin = round(imgW * 0.07);
discRadiusMax = round(imgW * 0.16);

try
    % imfindcircles requires Computer Vision Toolbox
    [centers, radii, strengths] = imfindcircles(blurredUint8, ...
        [discRadiusMin, discRadiusMax], ...
        'ObjectPolarity', 'bright', ...
        'Sensitivity',    0.92, ...
        'EdgeThreshold',  0.05);

    if ~isempty(centers)
        % Select highest-strength circle
        [~, bestIdx]     = max(strengths);
        disc.center      = round(centers(bestIdx, :));   % [x, y]
        disc.radius      = round(radii(bestIdx));
        disc.bounding_box = [disc.center(1)-disc.radius, disc.center(2)-disc.radius, ...
                             2*disc.radius, 2*disc.radius];
        disc.confidence  = min(double(strengths(bestIdx)), 1.0);
        disc.method      = 'hough_circle';
        fprintf('[Optic Disc] Hough detection: center=[%d,%d] radius=%dpx confidence=%.2f\\n', ...
            disc.center(1), disc.center(2), disc.radius, disc.confidence);
    else
        fprintf('[Optic Disc] Hough returned no circles — falling back to bright-blob.\\n');
    end
catch ex
    fprintf('[Optic Disc] imfindcircles unavailable (%s) — using bright-blob fallback.\\n', ex.message);
end

% ─── 3. Bright-blob fallback (no toolbox required) ───────────────────────
if strcmp(disc.method, 'bright_blob')
    % Threshold: top 2% brightest pixels as disc candidates
    thresh    = prctile(double(blurred(:)), 98);
    bwBright  = blurred > thresh;
    bwClean   = bwareaopen(bwBright, discRadiusMin^2);

    props = regionprops(bwClean, 'Centroid', 'Area', 'BoundingBox', 'EquivDiameter');

    if isempty(props)
        % Nothing detected — use image centre as desperate fallback
        disc.center       = [round(imgW/2), round(imgH/2)];
        disc.radius       = round(imgW * 0.10);
        disc.bounding_box = [disc.center(1)-disc.radius, disc.center(2)-disc.radius, ...
                             2*disc.radius, 2*disc.radius];
        disc.confidence   = 0.0;
        fprintf('[Optic Disc] No bright region found. Returning image-centre estimate (confidence=0.0).\\n');
    else
        % Pick the largest bright region as the optic disc candidate
        [~, idx]          = max([props.Area]);
        disc.center       = round(props(idx).Centroid);      % [x, y]
        disc.radius       = round(props(idx).EquivDiameter / 2);
        disc.bounding_box = round(props(idx).BoundingBox);   % [x,y,w,h]
        disc.confidence   = min(props(idx).Area / (pi * discRadiusMax^2), 1.0);
        fprintf('[Optic Disc] Bright-blob detection: center=[%d,%d] radius=%dpx confidence=%.2f\\n', ...
            disc.center(1), disc.center(2), disc.radius, disc.confidence);
    end
end

% ─── 4. Save overlay visualization ───────────────────────────────────────
disc.overlay_path = '';
if saveOverlay
    try
        fig = figure('Visible', 'off');
        imshow(rawRGB); hold on;
        theta = linspace(0, 2*pi, 200);
        cx = disc.center(1); cy = disc.center(2); r = disc.radius;
        plot(cx + r.*cos(theta), cy + r.*sin(theta), 'y-', 'LineWidth', 2.5);
        plot(cx, cy, 'y+', 'MarkerSize', 12, 'LineWidth', 2);
        title(sprintf('Optic Disc Localization [%s] — PROTOTYPE', disc.method), ...
            'FontSize', 11, 'Interpreter', 'none');
        hold off;
        [fDir, fName, ~] = fileparts(imagePath);
        disc.overlay_path = fullfile(fDir, sprintf('%s_optic_disc_overlay.png', fName));
        saveas(fig, disc.overlay_path);
        close(fig);
        fprintf('[Optic Disc] Overlay saved: %s\\n', disc.overlay_path);
    catch ex
        fprintf('[Optic Disc] Could not save overlay (headless?): %s\\n', ex.message);
    end
end

fprintf('[MATLAB Optic Disc] Complete. Method=%s | Confidence=%.2f | %s\\n', ...
    disc.method, disc.confidence, disc.note);
end
