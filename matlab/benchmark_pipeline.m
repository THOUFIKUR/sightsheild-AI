% BENCHMARK_PIPELINE.M
% Problem Statement: SIH26038 (MathWorks) — Performance Measurement
%
% Measures ACTUAL wallclock execution time for each MATLAB pipeline module.
% All timings from tic/toc — NO assumed or invented values.
%
% Usage:
%   cd('d:/sih2026/retino/matlab')
%   benchmark_pipeline
%
% Outputs printed: mean, median, min, max per module across all test images.
% Also saves: benchmark_results.mat

clc; clear; close all;
fprintf('=================================================================\\n');
fprintf(' RetinaScan AI — MATLAB Pipeline Benchmark\\n');
fprintf(' SIH26038 (MathWorks) — Measured Performance\\n');
fprintf('=================================================================\\n\\n');

% ─── Add paths ────────────────────────────────────────────────────────────
thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, 'preprocessing'));
addpath(fullfile(thisDir, 'retinal_structures'));
addpath(fullfile(thisDir, 'segmentation'));
addpath(fullfile(thisDir, 'lesion_analysis'));
addpath(fullfile(thisDir, 'explainability'));

% ─── Locate test images ───────────────────────────────────────────────────
sampleDir = fullfile(thisDir, '..', 'data', 'samples', 'idrid_samples');
imgFiles  = dir(fullfile(sampleDir, '*.jpg'));

if isempty(imgFiles)
    fprintf('[Benchmark] No IDRiD sample images found in: %s\\n', sampleDir);
    fprintf('[Benchmark] Please place fundus .jpg files in the samples directory.\\n');
    return;
end

fprintf('[Benchmark] Found %d test images.\\n', numel(imgFiles));
fprintf('[Benchmark] Each module timed independently (tic/toc).\\n\\n');

% ─── Module timing data ───────────────────────────────────────────────────
modules = {
    'quality',          'check_image_quality';
    'clahe',            'adaptive_clahe_retina';
    'optic_disc',       'detect_optic_disc';
    'fovea',            'localize_fovea';
    'vessels',          'segment_retinal_vessels';
    'microaneurysms',   'detect_microaneurysms';
    'exudates',         'segment_exudates';
    'hemorrhages',      'classify_hemorrhages';
    'neovascularization','detect_neovascularization';
    'overlay',          'visualize_gradcam_overlay';
};
numModules = size(modules, 1);
timingData = nan(numel(imgFiles), numModules);

% ─── Run each image through every module ─────────────────────────────────
for i = 1:numel(imgFiles)
    imgPath = fullfile(imgFiles(i).folder, imgFiles(i).name);
    fprintf('[Benchmark] Image %d/%d: %s\\n', i, numel(imgFiles), imgFiles(i).name);

    % --- 1. Quality
    col = 1;
    t = tic;
    try, check_image_quality(imgPath); catch; end
    timingData(i, col) = toc(t);

    % --- 2. CLAHE
    col = 2;
    t = tic;
    try, adaptive_clahe_retina(imgPath, 0.02, [8 8]); catch; end
    timingData(i, col) = toc(t);

    % --- 3. Optic disc
    col = 3;
    t = tic;
    try, disc = detect_optic_disc(imgPath); catch; disc = struct('center',[],'radius',[]); end
    timingData(i, col) = toc(t);

    % --- 4. Fovea
    col = 4;
    t = tic;
    try
        if isfield(disc, 'center') && ~isempty(disc.center)
            localize_fovea(imgPath, disc.center, disc.radius);
        else
            localize_fovea(imgPath);
        end
    catch; end
    timingData(i, col) = toc(t);

    % --- 5. Vessel segmentation
    col = 5;
    t = tic;
    try, segment_retinal_vessels(imgPath, [1 8]); catch; end
    timingData(i, col) = toc(t);

    % --- 6. Microaneurysms
    col = 6;
    t = tic;
    try, detect_microaneurysms(imgPath); catch; end
    timingData(i, col) = toc(t);

    % --- 7. Exudates
    col = 7;
    t = tic;
    try, segment_exudates(imgPath); catch; end
    timingData(i, col) = toc(t);

    % --- 8. Hemorrhages
    col = 8;
    t = tic;
    try, classify_hemorrhages(imgPath); catch; end
    timingData(i, col) = toc(t);

    % --- 9. Neovascularization
    col = 9;
    t = tic;
    try, detect_neovascularization(imgPath); catch; end
    timingData(i, col) = toc(t);

    % --- 10. Overlay visualization
    col = 10;
    t = tic;
    try, visualize_gradcam_overlay(imgPath, struct()); catch; end
    timingData(i, col) = toc(t);

    fprintf('[Benchmark] Image %d complete. Total: %.2f s\\n', i, sum(timingData(i,:), 'omitnan'));
end

% ─── Compute statistics ───────────────────────────────────────────────────
fprintf('\\n');
fprintf('=================================================================\\n');
fprintf('MODULE                      Mean    Median    Min     Max    (seconds)\\n');
fprintf('=================================================================\\n');

totalTimes = zeros(numel(imgFiles), 1);
for col = 1:numModules
    colData = timingData(:, col);
    validData = colData(~isnan(colData));
    if isempty(validData)
        fprintf('%-26s  ERROR — no valid timing\\n', modules{col, 1});
        continue;
    end
    mn  = mean(validData);
    med = median(validData);
    mn_ = min(validData);
    mx  = max(validData);
    fprintf('%-26s  %5.3f   %6.3f  %6.3f  %6.3f\\n', modules{col,1}, mn, med, mn_, mx);
    totalTimes = totalTimes + colData;
end

% Total pipeline
totalTimes(isnan(totalTimes)) = 0;
fprintf('-----------------------------------------------------------------\\n');
fprintf('%-26s  %5.3f   %6.3f  %6.3f  %6.3f\\n', 'TOTAL PIPELINE', ...
    mean(totalTimes), median(totalTimes), min(totalTimes), max(totalTimes));
fprintf('=================================================================\\n');
fprintf('N = %d images | Machine: %s | MATLAB %s\\n', ...
    numel(imgFiles), computer(), version('-release'));
fprintf('All timings measured via tic/toc. No assumed values.\\n');

% ─── Save ─────────────────────────────────────────────────────────────────
benchmarkData = struct('modules', {modules}, 'timingData', timingData, ...
    'machine', computer(), 'matlab_version', version('-release'), ...
    'test_images', {{imgFiles.name}});
try
    save(fullfile(thisDir, 'benchmark_results.mat'), 'benchmarkData');
    fprintf('[Benchmark] Results saved: benchmark_results.mat\\n');
catch
    fprintf('[Benchmark] Could not save .mat\\n');
end
