function [compositePath] = visualize_gradcam_overlay(imagePath, analysisResult, outputDir)
% VISUALIZE_GRADCAM_OVERLAY
% Problem Statement: SIH26038 (MathWorks) - Explainability Visualization
%
% Produces a comprehensive annotated composite image combining:
%   - Original fundus photograph
%   - Vessel segmentation overlay (semi-transparent red)
%   - Optic disc boundary (yellow circle)
%   - Fovea location marker (cyan cross)
%   - Microaneurysm candidates (green dots)
%   - Exudate candidate mask (yellow overlay)
%   - Hemorrhage bounding boxes (orange=dot, red=flame)
%   - Lesion density heatmap (JET colormap)
%   - Grade label and risk annotation
%
% This is MATLAB-side visualization — complements the Python/browser
% Score-CAM heatmap (inference.py / model.worker.js) without replacing it.
%
% Syntax:
%   compositePath = visualize_gradcam_overlay(imagePath, analysisResult)
%   compositePath = visualize_gradcam_overlay(imagePath, analysisResult, outputDir)
%
% Inputs:
%   imagePath      - path to original fundus image
%   analysisResult - struct from run_retinascan_demo (optional sub-structs)
%   outputDir      - where to save composite PNG (default: same dir as image)

if nargin < 2, analysisResult = struct(); end
if nargin < 3 || isempty(outputDir)
    outputDir = fileparts(imagePath);
    if isempty(outputDir), outputDir = pwd; end
end

fprintf('[MATLAB XAI] Generating annotated composite overlay for: %s\\n', imagePath);

% ─── 1. Load image ────────────────────────────────────────────────────────
rawRGB = imread(imagePath);
if size(rawRGB, 3) == 1, rawRGB = cat(3, rawRGB, rawRGB, rawRGB); end
[imgH, imgW, ~] = size(rawRGB);

overlay = double(rawRGB);

% ─── 2. Vessel density heatmap background ────────────────────────────────
green    = rawRGB(:, :, 2);
enhanced = adapthisteq(green, 'ClipLimit', 0.02, 'NumTiles', [8 8]);
try
    vesselProb = fibermetric(enhanced, [1 8], 'StructureSensitivity', 12);
    % Smooth for background heatmap
    vesselSmooth = imgaussfilt(vesselProb, 5.0);
    vesselNorm   = vesselSmooth / max(vesselSmooth(:) + eps);
    % JET colormap applied to vessel density
    jetMap = colormap(jet(256)); close(gcf);
    vesselIdx    = round(vesselNorm * 255) + 1;
    vesselColored = zeros(imgH, imgW, 3);
    for c = 1:3
        vesselColored(:,:,c) = jetMap(vesselIdx, c) * 255;
    end
    % Blend: 70% original, 30% vessel heatmap
    overlay = 0.70 * double(rawRGB) + 0.30 * vesselColored;
catch
    fprintf('[XAI Overlay] fibermetric unavailable — skipping vessel heatmap.\\n');
end

% ─── 3. Exudate mask (yellow) ─────────────────────────────────────────────
if isfield(analysisResult, 'exudates') && isfield(analysisResult.exudates, 'binary_mask')
    exMask = analysisResult.exudates.binary_mask;
    if ~isempty(exMask) && isequal(size(exMask), [imgH imgW])
        overlay(:,:,1) = min(255, overlay(:,:,1) + double(exMask) * 120);
        overlay(:,:,2) = min(255, overlay(:,:,2) + double(exMask) * 120);
        overlay(:,:,3) = max(0,   overlay(:,:,3) - double(exMask) * 80);
    end
end

% Clamp to uint8
overlay = uint8(min(255, max(0, overlay)));

% ─── 4. Create figure with all annotations ───────────────────────────────
fig = figure('Visible', 'off', 'Position', [0 0 1400 900]);
imshow(overlay); hold on;

% ─── 5. Draw optic disc boundary ─────────────────────────────────────────
if isfield(analysisResult, 'optic_disc')
    od = analysisResult.optic_disc;
    if isfield(od, 'center') && isfield(od, 'radius') && ~isempty(od.center)
        theta = linspace(0, 2*pi, 200);
        plot(od.center(1) + od.radius .* cos(theta), ...
             od.center(2) + od.radius .* sin(theta), ...
             'y-', 'LineWidth', 2.5);
        plot(od.center(1), od.center(2), 'y+', 'MarkerSize', 12, 'LineWidth', 2);
        text(od.center(1)+od.radius+5, od.center(2), 'OD', ...
            'Color', 'yellow', 'FontSize', 10, 'FontWeight', 'bold');
    end
end

% ─── 6. Draw fovea marker ─────────────────────────────────────────────────
if isfield(analysisResult, 'fovea')
    fv = analysisResult.fovea;
    if isfield(fv, 'center') && ~isempty(fv.center)
        plot(fv.center(1), fv.center(2), 'c+', 'MarkerSize', 18, 'LineWidth', 3);
        plot(fv.center(1), fv.center(2), 'co', 'MarkerSize', 20, 'LineWidth', 1.5);
        text(fv.center(1)+15, fv.center(2), 'Fovea*', ...
            'Color', 'cyan', 'FontSize', 9, 'FontStyle', 'italic');
    end
end

% ─── 7. Draw microaneurysm candidates ────────────────────────────────────
if isfield(analysisResult, 'microaneurysms')
    ma = analysisResult.microaneurysms;
    if isfield(ma, 'candidate_centroids') && ~isempty(ma.candidate_centroids)
        scatter(ma.candidate_centroids(:,1), ma.candidate_centroids(:,2), ...
            30, 'g', 'filled', 'MarkerEdgeColor', 'darkgreen');
    end
end

% ─── 8. Draw hemorrhage bounding boxes ───────────────────────────────────
if isfield(analysisResult, 'hemorrhages')
    hm = analysisResult.hemorrhages;
    if isfield(hm, 'bounding_boxes') && ~isempty(hm.bounding_boxes)
        for k = 1:size(hm.bounding_boxes, 1)
            bb  = hm.bounding_boxes(k, :);
            typ = '';
            if isfield(hm, 'types') && k <= numel(hm.types)
                typ = hm.types{k};
            end
            if strcmp(typ, 'dot')
                edgeCol = [1.0 0.5 0.0];  % orange
            else
                edgeCol = [1.0 0.1 0.1];  % red
            end
            rectangle('Position', bb, 'EdgeColor', edgeCol, 'LineWidth', 1.5);
        end
    end
end

% ─── 9. Grade annotation box ─────────────────────────────────────────────
if isfield(analysisResult, 'grade')
    gradeLabels = {'Grade 0: No DR', 'Grade 1: Mild NPDR', 'Grade 2: Moderate NPDR', ...
                   'Grade 3: Severe NPDR', 'Grade 4: Proliferative DR'};
    gradeColors = {[0.2 0.8 0.3], [0.8 0.8 0.2], [0.9 0.5 0.1], ...
                   [0.9 0.2 0.2], [0.7 0.0 0.7]};
    g = analysisResult.grade + 1;
    if g >= 1 && g <= 5
        annotation('textbox', [0.01 0.88 0.35 0.10], ...
            'String', gradeLabels{g}, ...
            'Color', 'white', 'BackgroundColor', gradeColors{g}, ...
            'FontSize', 13, 'FontWeight', 'bold', 'EdgeColor', 'white', ...
            'LineWidth', 1.5, 'FitBoxToText', 'on');
    end
end

% ─── 10. Legend ───────────────────────────────────────────────────────────
legendItems = {'Vessel density (JET)', 'Optic disc (yellow)', ...
               'Fovea* (cyan, heuristic)', 'MA candidates (green)', ...
               'Exudates (yellow tint)', 'Hemorrhage-dot (orange)', ...
               'Hemorrhage-flame (red)'};
text(10, imgH - 10, ...
    '* Fovea: heuristic estimate. All lesion annotations: PROTOTYPE, not validated.', ...
    'Color', 'white', 'FontSize', 8, 'BackgroundColor', [0 0 0 0.6]);

hold off;
title(sprintf('RetinaScan AI — Annotated Explainability Overlay [%s]', datetime('now', 'Format', 'yyyy-MM-dd')), ...
    'FontSize', 12, 'FontWeight', 'bold');

% ─── 11. Save composite ───────────────────────────────────────────────────
[~, imgName, ~] = fileparts(imagePath);
compositePath   = fullfile(outputDir, sprintf('%s_annotated_overlay.png', imgName));
try
    saveas(fig, compositePath);
    close(fig);
    fprintf('[MATLAB XAI] Annotated composite saved: %s\\n', compositePath);
catch saveErr
    close(fig);
    compositePath = '';
    fprintf('[MATLAB XAI] Could not save composite: %s\\n', saveErr.message);
end
end
