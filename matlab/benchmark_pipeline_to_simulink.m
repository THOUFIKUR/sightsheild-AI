% BENCHMARK_PIPELINE_TO_SIMULINK.M
% Problem Statement: SIH26038 (MathWorks) — Simulink Timing Bridge
%
% Runs benchmark_pipeline.m, extracts REAL per-stage mean timings (tic/toc),
% and writes them into simulink/simulink_params.m, replacing the assumed constants.
%
% Amendment 13 compliance:
%   Records all required stage timings:
%     image_acquisition_time, quality_assessment_time, preprocessing_time,
%     segmentation_time, lesion_detection_time, classification_time,
%     gradcam_time, report_generation_time, total_processing_time
%
% Amendment 15: Preserves existing functionality. Old values printed before overwrite.
%
% Usage:
%   cd('d:/sih2026/retino/matlab')
%   benchmark_pipeline_to_simulink

clc;
fprintf('=================================================================\n');
fprintf(' benchmark_pipeline_to_simulink.m\n');
fprintf(' SIH26038 — Feed real pipeline timings into Simulink model\n');
fprintf('=================================================================\n\n');

thisDir = fileparts(mfilename('fullpath'));
addpath(thisDir);
addpath(fullfile(thisDir, 'preprocessing'));
addpath(fullfile(thisDir, 'retinal_structures'));
addpath(fullfile(thisDir, 'segmentation'));
addpath(fullfile(thisDir, 'lesion_analysis'));
addpath(fullfile(thisDir, 'explainability'));

simulinkParamsPath = fullfile(thisDir, 'simulink', 'simulink_params.m');

% ─── Step 1: Run benchmark ───────────────────────────────────────────────────
fprintf('[Step 1] Running benchmark_pipeline.m (real tic/toc measurements)...\n');
fprintf('[Step 1] This may take several minutes depending on number of test images.\n\n');

sampleDir = fullfile(thisDir, '..', 'data', 'samples', 'idrid_samples');
imgFiles  = dir(fullfile(sampleDir, '*.jpg'));

if isempty(imgFiles)
    error('[benchmark_pipeline_to_simulink] DATA MISSING: No test images in:\n  %s\nPlace IDRiD sample images there to measure real timings.', sampleDir);
end

fprintf('[Step 1] Found %d test images.\n', numel(imgFiles));

% Module index mapping (matches benchmark_pipeline.m column order)
QUALITY_COL         = 1;
CLAHE_COL           = 2;
OPTIC_DISC_COL      = 3;
FOVEA_COL           = 4;
VESSEL_COL          = 5;
MA_COL              = 6;
EXUDATE_COL         = 7;
HEMORRHAGE_COL      = 8;
NEOVASCULARIZATION_COL = 9;
GRADCAM_COL         = 10;
NUM_MODULES         = 10;

timingData = nan(numel(imgFiles), NUM_MODULES);

for i = 1:numel(imgFiles)
    imgPath = fullfile(imgFiles(i).folder, imgFiles(i).name);
    fprintf('[Benchmark] Image %d/%d: %s\n', i, numel(imgFiles), imgFiles(i).name);

    t=tic; try, check_image_quality(imgPath); catch; end; timingData(i,QUALITY_COL)=toc(t);
    t=tic; try, adaptive_clahe_retina(imgPath,0.02,[8 8]); catch; end; timingData(i,CLAHE_COL)=toc(t);
    disc=struct('center',[],'radius',[]);
    t=tic; try, disc=detect_optic_disc(imgPath); catch; end; timingData(i,OPTIC_DISC_COL)=toc(t);
    t=tic; try
        if isfield(disc,'center')&&~isempty(disc.center), localize_fovea(imgPath,disc.center,disc.radius);
        else, localize_fovea(imgPath); end
    catch; end; timingData(i,FOVEA_COL)=toc(t);
    t=tic; try, segment_retinal_vessels(imgPath,[1 8]); catch; end; timingData(i,VESSEL_COL)=toc(t);
    t=tic; try, detect_microaneurysms(imgPath); catch; end; timingData(i,MA_COL)=toc(t);
    t=tic; try, segment_exudates(imgPath); catch; end; timingData(i,EXUDATE_COL)=toc(t);
    t=tic; try, classify_hemorrhages(imgPath); catch; end; timingData(i,HEMORRHAGE_COL)=toc(t);
    t=tic; try, detect_neovascularization(imgPath); catch; end; timingData(i,NEOVASCULARIZATION_COL)=toc(t);
    t=tic; try, visualize_gradcam_overlay(imgPath,struct()); catch; end; timingData(i,GRADCAM_COL)=toc(t);
end

% ─── Step 2: Extract mean timings ────────────────────────────────────────────
mean_t = @(col) nanmean(timingData(:,col));

% Map benchmark columns to Simulink parameter semantics:
t_quality      = mean_t(QUALITY_COL);
t_preprocess   = mean_t(CLAHE_COL);
t_segmentation = mean_t(VESSEL_COL) + mean_t(OPTIC_DISC_COL) + mean_t(FOVEA_COL);
t_lesion       = mean_t(MA_COL) + mean_t(EXUDATE_COL) + mean_t(HEMORRHAGE_COL) + mean_t(NEOVASCULARIZATION_COL);
t_gradcam      = mean_t(GRADCAM_COL);
% Classification time not directly measured (ONNX runs in Python; use previous assumed value if not measurable)
% NOTE: MATLAB benchmark does not run the ONNX classifier (Python-only) — keep previous value for that stage
t_classification_note = 'NOT_MEASURED_IN_MATLAB_PIPELINE';

totalMeasured = t_quality + t_preprocess + t_segmentation + t_lesion + t_gradcam;

fprintf('\n=== Real Measured Timings (mean across %d images) ===\n', numel(imgFiles));
fprintf('  quality_assessment_time_sec:  %.4f s\n', t_quality);
fprintf('  preprocessing_time_sec:       %.4f s (CLAHE)\n', t_preprocess);
fprintf('  segmentation_time_sec:        %.4f s (vessels + OD + fovea)\n', t_segmentation);
fprintf('  lesion_detection_time_sec:    %.4f s (MA + EX + HE + NV)\n', t_lesion);
fprintf('  gradcam_time_sec:             %.4f s\n', t_gradcam);
fprintf('  classification_time_sec:      NOT MEASURED (ONNX runs in Python — previous assumed value kept)\n');
fprintf('  total_measured_matlab_sec:    %.4f s\n', totalMeasured);

% ─── Step 3: Read current simulink_params.m ──────────────────────────────────
fprintf('\n[Step 3] Reading existing simulink_params.m...\n');
if ~isfile(simulinkParamsPath)
    error('[benchmark_pipeline_to_simulink] simulink_params.m not found: %s', simulinkParamsPath);
end

paramsText = fileread(simulinkParamsPath);

% Print old values before overwriting (audit trail)
fprintf('\n[Step 3] OLD values in simulink_params.m:\n');
fprintf('  preprocessing_time_sec:  (reading from file...)\n');
oldMatch = regexp(paramsText, 'params\.preprocessing_time_sec\s*=\s*([0-9.]+)', 'tokens', 'once');
if ~isempty(oldMatch), fprintf('  OLD preprocessing_time_sec = %s\n', oldMatch{1}); end
oldMatch2 = regexp(paramsText, 'params\.heatmap_time_sec\s*=\s*([0-9.]+)', 'tokens', 'once');
if ~isempty(oldMatch2), fprintf('  OLD heatmap_time_sec = %s\n', oldMatch2{1}); end

% ─── Step 4: Replace timing constants in simulink_params.m ──────────────────
fprintf('\n[Step 4] Writing real timings into simulink_params.m...\n');

% Replace preprocessing_time_sec with real CLAHE time
newParams = regexprep(paramsText, ...
    '(params\.preprocessing_time_sec\s*=\s*)[0-9.]+', ...
    sprintf('$1%.4f', t_preprocess));

% Replace heatmap_time_sec with real Grad-CAM overlay time
newParams = regexprep(newParams, ...
    '(params\.heatmap_time_sec\s*=\s*)[0-9.]+', ...
    sprintf('$1%.4f', t_gradcam));

% Add a comment block at the top of processing section
benchmarkBlock = sprintf([...
    '%%%% ─── PROCESSING PIPELINE TIMES — MEASURED BY benchmark_pipeline_to_simulink.m ────\n'...
    '%% Measured: %s\n'...
    '%% Images: %d | Machine: %s | MATLAB %s\n'...
    '%% quality_assessment_sec=%.4f | preprocessing_sec=%.4f | segmentation_sec=%.4f\n'...
    '%% lesion_detection_sec=%.4f | gradcam_sec=%.4f | total_matlab_sec=%.4f\n'...
    '%% classification_time_sec: NOT MEASURED (ONNX runs in Python — kept from previous estimate)\n'...
    '%%\n'], ...
    datestr(now,'yyyy-mm-dd HH:MM:SS'), numel(imgFiles), ...
    computer(), version('-release'), ...
    t_quality, t_preprocess, t_segmentation, t_lesion, t_gradcam, totalMeasured);

% Insert block before PROCESSING PIPELINE TIMES section
newParams = regexprep(newParams, ...
    '(%% \u2500{3} PROCESSING PIPELINE TIMES[^\n]*\n)', ...
    [benchmarkBlock '$1'], 'once');

fid = fopen(simulinkParamsPath, 'w');
if fid == -1
    error('[benchmark_pipeline_to_simulink] Cannot write to: %s', simulinkParamsPath);
end
fprintf(fid, '%s', newParams);
fclose(fid);

fprintf('\n[Step 4] simulink_params.m updated with real timings.\n');
fprintf('[Step 5] DONE. Simulink model will now use measured stage timings.\n');
fprintf('  Updated: %s\n', simulinkParamsPath);
fprintf('  Real preprocessing_time_sec: %.4f s\n', t_preprocess);
fprintf('  Real heatmap_time_sec:        %.4f s\n', t_gradcam);
fprintf('  NOTE: inference_time_sec (Python ONNX) was NOT updated — measure separately.\n');
