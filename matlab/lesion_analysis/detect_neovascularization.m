function [nv] = detect_neovascularization(imagePath, discCenter, discRadius, saveOverlay)
% DETECT_NEOVASCULARIZATION
% Problem Statement: SIH26038 (MathWorks) - Lesion Analysis
%
% Implementation Type: CANDIDATE DETECTION
%   Produces candidate region flags — NOT a clinical diagnosis.
%
% ╔══════════════════════════════════════════════════════════════════════════╗
% ║  STATUS: RESEARCH PROTOTYPE — NOT CLINICALLY VALIDATED               ║
% ║                                                                          ║
% ║  Clinical neovascularization (NV) diagnosis requires expert            ║
% ║  ophthalmologist review, fluorescein angiography, and/or deep-        ║
% ║  learning models trained on NV-annotated datasets.                     ║
% ║                                                                          ║
% ║  This module uses vessel-density analysis ONLY. Abnormally high        ║
% ║  local vessel density near the disc (NVD) or in peripheral regions    ║
% ║  (NVE) flags these areas as CANDIDATES for further review.             ║
% ║                                                                          ║
% ║  Results must NOT be used for clinical decision-making.                ║
% ║  Sensitivity and specificity have NOT been evaluated.                  ║
% ╚══════════════════════════════════════════════════════════════════════════╝
%
% Syntax:
%   nv = detect_neovascularization(imagePath)
%   nv = detect_neovascularization(imagePath, discCenter, discRadius, true)
%
% Outputs:
%   nv.nv_disc_candidate       logical — high density near disc
%   nv.nv_elsewhere_candidate  logical — high density peripherally
%   nv.disc_zone_density       float — vessel density in disc zone (0-1)
%   nv.peripheral_density      float — mean peripheral vessel density (0-1)
%   nv.disc_density_percentile float — where disc zone ranks in image
%   nv.confidence              string — always 'LOW — research prototype only'
%   nv.validated               false
%   nv.note                    disclaimer

if nargin < 2, discCenter = []; end
if nargin < 3, discRadius = []; end
if nargin < 4, saveOverlay = false; end

fprintf('[MATLAB NV Detection] Processing: %s\\n', imagePath);
fprintf('[MATLAB NV Detection] RESEARCH PROTOTYPE — vessel-density analysis only.\\n');
fprintf('[MATLAB NV Detection] NOT for clinical use. Expert review required.\\n');

% ─── 1. Load and prepare ─────────────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1, rawRGB = cat(3, rawRGB, rawRGB, rawRGB); end
[imgH, imgW, ~] = size(rawRGB);

green    = rawRGB(:, :, 2);
enhanced = adapthisteq(green, 'ClipLimit', 0.02, 'NumTiles', [8 8]);

% ─── 2. Compute vessel probability map using fibermetric ─────────────────
% Reuse the same approach as segment_retinal_vessels.m
try
    vesselProb = fibermetric(enhanced, [1 8], 'StructureSensitivity', 12);
catch ex
    fprintf('[NV Detection] fibermetric unavailable (%s). Cannot compute vessel map.\\n', ex.message);
    nv = struct('nv_disc_candidate', false, 'nv_elsewhere_candidate', false, ...
        'disc_zone_density', NaN, 'peripheral_density', NaN, ...
        'disc_density_percentile', NaN, 'confidence', 'LOW — prototype only', ...
        'validated', false, 'note', 'fibermetric unavailable; result invalid.');
    return;
end

% ─── 3. Get optic disc location ──────────────────────────────────────────
if isempty(discCenter) || isempty(discRadius)
    fprintf('[NV Detection] Disc not provided — running detect_optic_disc...\\n');
    thisDir = fileparts(mfilename('fullpath'));
    addpath(fullfile(thisDir, '..', 'retinal_structures'));
    disc       = detect_optic_disc(imagePath);
    discCenter = disc.center;
    discRadius = disc.radius;
end

discDiameter = discRadius * 2;

% ─── 4. Compute vessel density in disc zone ───────────────────────────────
% Disc zone: circle of radius = 1.5× disc diameter around disc center
[yy, xx] = ndgrid(1:imgH, 1:imgW);
discZoneMask = (xx - discCenter(1)).^2 + (yy - discCenter(2)).^2 ...
    <= (1.5 * discDiameter)^2;

discZoneProb = vesselProb(discZoneMask);
discZoneDensity = mean(discZoneProb);

% ─── 5. Compute peripheral vessel density ────────────────────────────────
% Peripheral = outside 2× disc diameter from center and outside disc zone
centerX = imgW / 2;
centerY = imgH / 2;
innerExclude = (xx - centerX).^2 + (yy - centerY).^2 <= (discDiameter * 2)^2;
peripheralMask = ~innerExclude;
peripheralProb  = vesselProb(peripheralMask);
peripheralDensity = mean(peripheralProb);

% ─── 6. Compute disc density percentile ──────────────────────────────────
% Compare disc zone density to overall image distribution
% High percentile = disc zone has unusually high vessel density
allDensities = movmean(vesselProb(:), 100);  % local density samples
discDensityPercentile = sum(allDensities < discZoneDensity) / numel(allDensities) * 100;

% ─── 7. Apply thresholds (empirical — not clinically validated) ───────────
% NVD candidate: disc zone density in top 10% of image distribution
NVD_DENSITY_THRESH       = 0.45;  % vessel probability threshold
NVD_PERCENTILE_THRESH    = 90;    % disc zone vs image percentile
NVE_DENSITY_THRESH       = 0.35;  % peripheral density threshold

nvDiscCandidate      = (discZoneDensity > NVD_DENSITY_THRESH) && ...
                       (discDensityPercentile > NVD_PERCENTILE_THRESH);
nvElsewhereCandidate = (peripheralDensity > NVE_DENSITY_THRESH);

% ─── 8. Build output ─────────────────────────────────────────────────────
nv = struct();
nv.nv_disc_candidate        = nvDiscCandidate;
nv.nv_elsewhere_candidate   = nvElsewhereCandidate;
nv.disc_zone_density        = double(discZoneDensity);
nv.peripheral_density       = double(peripheralDensity);
nv.disc_density_percentile  = discDensityPercentile;
nv.confidence               = 'LOW — research prototype only. Vessel density ≠ clinical NV diagnosis.';
nv.validated                = false;
nv.note                     = 'RESEARCH PROTOTYPE. Vessel-density heuristic. Not clinically validated. Do not use for diagnosis.';

fprintf('[NV Detection] DiscZoneDensity=%.3f (%.1fth pct) | PeripheralDensity=%.3f\\n', ...
    discZoneDensity, discDensityPercentile, peripheralDensity);
fprintf('[NV Detection] NVD candidate=%d | NVE candidate=%d\\n', ...
    nvDiscCandidate, nvElsewhereCandidate);
fprintf('[NV Detection] %s\\n', nv.note);

% ─── 9. Save overlay ─────────────────────────────────────────────────────
nv.overlay_path = '';
if saveOverlay
    try
        fig = figure('Visible', 'off');
        subplot(1,2,1);
        imshow(rawRGB); title('Original Fundus');

        subplot(1,2,2);
        imagesc(vesselProb); colormap(jet); colorbar;
        hold on;
        % Draw disc zone ring
        theta = linspace(0, 2*pi, 200);
        plot(discCenter(1) + 1.5*discDiameter.*cos(theta), ...
             discCenter(2) + 1.5*discDiameter.*sin(theta), ...
             'w-', 'LineWidth', 2);
        title(sprintf('Vessel Density Map | NVD=%d NVE=%d [PROTOTYPE]', ...
            nvDiscCandidate, nvElsewhereCandidate), 'FontSize', 9);
        hold off;

        sgtitle('Neovascularization Candidate Detection — RESEARCH PROTOTYPE', ...
            'FontSize', 10, 'Color', 'r');

        [fDir, fName, ~] = fileparts(imagePath);
        nv.overlay_path = fullfile(fDir, sprintf('%s_nv_overlay.png', fName));
        saveas(fig, nv.overlay_path);
        close(fig);
        fprintf('[NV Detection] Overlay saved: %s\\n', nv.overlay_path);
    catch err
        fprintf('[NV Detection] Could not save overlay: %s\\n', err.message);
    end
end
end
