function [fovea] = localize_fovea(imagePath, discCenter, discRadius, saveOverlay)
% LOCALIZE_FOVEA
% Problem Statement: SIH26038 (MathWorks) - Retinal Structure Analysis
%
% Implementation Type: LOCALIZATION — heuristic coordinate estimate
%
% ╔══════════════════════════════════════════════════════════════════════╗
% ║  STATUS: HEURISTIC PROTOTYPE — NOT CLINICALLY VALIDATED            ║
% ║                                                                      ║
% ║  Method: Anatomical displacement rule combined with dark-region      ║
% ║  sanity check. The fovea is estimated at ~2.5 disc diameters       ║
% ║  temporal to the optic disc.                                        ║
% ║                                                                      ║
% ║  Ground-truth fovea annotations are NOT available in this          ║
% ║  repository. No accuracy metric can be reported.                    ║
% ║                                                                      ║
% ║  Do NOT present this as clinically accurate fovea detection.       ║
% ╚══════════════════════════════════════════════════════════════════════╝
%
% Syntax:
%   fovea = localize_fovea(imagePath)
%   fovea = localize_fovea(imagePath, discCenter, discRadius)
%   fovea = localize_fovea(imagePath, discCenter, discRadius, true)
%
% Inputs:
%   imagePath   - Path to fundus image
%   discCenter  - [x, y] from detect_optic_disc (optional; recomputed if absent)
%   discRadius  - scalar from detect_optic_disc (optional)
%   saveOverlay - true to save annotated PNG (default: false)
%
% Outputs:
%   fovea.center          [x, y] estimated fovea coordinates
%   fovea.method          'anatomical_heuristic'
%   fovea.validated       false (always — no GT available)
%   fovea.accuracy_note   string explaining validation status
%   fovea.dark_check_pass logical — sanity check passed

if nargin < 2, discCenter = []; end
if nargin < 3, discRadius = []; end
if nargin < 4, saveOverlay = false; end

fprintf('[MATLAB Fovea] Processing: %s\\n', imagePath);
fprintf('[MATLAB Fovea] METHOD: Anatomical heuristic — NOT clinically validated.\\n');

% ─── 1. Load image ────────────────────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1
    rawRGB = cat(3, rawRGB, rawRGB, rawRGB);
end
[imgH, imgW, ~] = size(rawRGB);
gray = rgb2gray(rawRGB);

% ─── 2. Get optic disc if not provided ───────────────────────────────────
if isempty(discCenter) || isempty(discRadius)
    fprintf('[Fovea] Optic disc not provided — running detect_optic_disc...\\n');
    % Add retinal_structures to path relative to this file
    thisDir  = fileparts(mfilename('fullpath'));
    addpath(thisDir);
    disc     = detect_optic_disc(imagePath);
    discCenter = disc.center;
    discRadius = disc.radius;
end

discDiameter = discRadius * 2;

% ─── 3. Anatomical displacement heuristic ────────────────────────────────
% The fovea lies ~2.5 disc diameters temporal to the optic disc.
% "Temporal" = toward the patient's temple = away from nose.
% In a standard fundus image (right eye, optic disc on left of frame):
%   fovea is to the RIGHT of the disc center.
% In a left-eye image the disc is on the right, fovea to the LEFT.
%
% Simple heuristic: disc on left half → fovea is to the right
%                   disc on right half → fovea is to the left
discNormX = discCenter(1) / imgW;
if discNormX < 0.5
    % Right-eye configuration: fovea is temporal (to the right)
    foveaX = round(discCenter(1) + 2.5 * discDiameter);
else
    % Left-eye configuration: fovea is temporal (to the left)
    foveaX = round(discCenter(1) - 2.5 * discDiameter);
end
% Fovea is slightly inferior to the horizontal disc meridian (~0.5 disc diam)
foveaY = round(discCenter(2) + 0.5 * discRadius);

% Clamp to image bounds
foveaX = max(1, min(foveaX, imgW));
foveaY = max(1, min(foveaY, imgH));

% ─── 4. Dark-region sanity check ─────────────────────────────────────────
% The foveal avascular zone (FAZ) is darker than surrounding retina.
% Check a small patch (3×3 disc-radius) around the estimated fovea.
patchR = max(round(discRadius * 0.5), 10);
y1 = max(1, foveaY - patchR); y2 = min(imgH, foveaY + patchR);
x1 = max(1, foveaX - patchR); x2 = min(imgW, foveaX + patchR);
patch = double(gray(y1:y2, x1:x2));
localMean = mean(patch(:));
globalMean = mean(double(gray(:)));
darkCheckPass = localMean < (globalMean * 0.95);  % fovea should be darker than mean

% ─── 5. Build output struct ───────────────────────────────────────────────
fovea = struct();
fovea.center          = [foveaX, foveaY];
fovea.method          = 'anatomical_heuristic';
fovea.validated       = false;
fovea.dark_check_pass = darkCheckPass;
fovea.disc_center     = discCenter;
fovea.disc_radius     = discRadius;
fovea.accuracy_note   = 'HEURISTIC PROTOTYPE. No ground-truth fovea annotations available. Accuracy not evaluated.';

fprintf('[Fovea] Estimated center: [%d, %d] | DarkCheck: %d | %s\\n', ...
    foveaX, foveaY, darkCheckPass, fovea.accuracy_note);

% ─── 6. Save overlay ─────────────────────────────────────────────────────
fovea.overlay_path = '';
if saveOverlay
    try
        fig = figure('Visible', 'off');
        imshow(rawRGB); hold on;
        % Draw fovea marker
        plot(foveaX, foveaY, 'c+', 'MarkerSize', 18, 'LineWidth', 2.5);
        plot(foveaX, foveaY, 'co', 'MarkerSize', 20, 'LineWidth', 1.5);
        % Draw disc center for reference
        plot(discCenter(1), discCenter(2), 'y+', 'MarkerSize', 12, 'LineWidth', 2);
        % Connecting line
        plot([discCenter(1), foveaX], [discCenter(2), foveaY], 'w--', 'LineWidth', 1);
        title('Fovea Localization — HEURISTIC PROTOTYPE (Not Validated)', ...
            'FontSize', 10, 'Color', 'r');
        legend({'Fovea (estimated)', '', 'Optic disc center', ''}, ...
            'Location', 'southeast', 'TextColor', 'w', 'Color', [0.1 0.1 0.1]);
        hold off;
        [fDir, fName, ~] = fileparts(imagePath);
        fovea.overlay_path = fullfile(fDir, sprintf('%s_fovea_overlay.png', fName));
        saveas(fig, fovea.overlay_path);
        close(fig);
        fprintf('[Fovea] Overlay saved: %s\\n', fovea.overlay_path);
    catch ex
        fprintf('[Fovea] Could not save overlay: %s\\n', ex.message);
    end
end
end
