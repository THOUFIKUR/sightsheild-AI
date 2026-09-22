function [cal] = calibrate_confidence(softmaxProbs, trueLabels, temperature)
% CALIBRATE_CONFIDENCE
% Problem Statement: SIH26038 (MathWorks) - Explainability: Calibrated Confidence
%
% Implements temperature-scaling post-hoc calibration for the EfficientNetB3
% classifier. Computes Expected Calibration Error (ECE) and Brier score.
%
% ╔══════════════════════════════════════════════════════════════════════════╗
% ║  CALIBRATION STATUS NOTE                                               ║
% ║                                                                          ║
% ║  Robust calibration requires a held-out validation set of several      ║
% ║  hundred examples. This repository contains only 5 IDRiD sample        ║
% ║  images. Running calibration on N=5 is statistically insufficient.    ║
% ║                                                                          ║
% ║  If softmaxProbs/trueLabels from 5 images are provided:               ║
% ║    → Temperature T is estimated but flagged as UNRELIABLE              ║
% ║    → ECE and Brier score are computed but marked LOW CONFIDENCE        ║
% ║                                                                          ║
% ║  If no data is provided:                                                ║
% ║    → Framework is demonstrated with clearly synthetic example          ║
% ║    → No temperature value is presented as a real calibration result    ║
% ╚══════════════════════════════════════════════════════════════════════════╝
%
% Syntax (with real data):
%   cal = calibrate_confidence(softmaxProbs, trueLabels)
%       softmaxProbs : [N x 5] matrix — raw softmax probabilities from model
%       trueLabels   : [N x 1] integer vector — ground truth grade (0–4)
%
% Syntax (framework demonstration with synthetic data):
%   cal = calibrate_confidence()
%
% Outputs:
%   cal.temperature           estimated T (or NaN if insufficient data)
%   cal.calibrated_probs      [N x 5] temperature-scaled probabilities
%   cal.ece_before            Expected Calibration Error before scaling
%   cal.ece_after             Expected Calibration Error after scaling
%   cal.brier_score_before    Brier score (multiclass) before scaling
%   cal.brier_score_after     Brier score after scaling
%   cal.validation_note       string — calibration status assessment
%   cal.n_samples             number of samples used

fprintf('[MATLAB Calibration] Temperature Scaling Framework — SIH26038 Req 4\\n');

% ─── 1. Determine data source ─────────────────────────────────────────────
usingSyntheticData = false;
if nargin < 2
    fprintf('[Calibration] No real data provided. Using synthetic demonstration.\\n');
    fprintf('[Calibration] NOTE: Synthetic results are for framework demonstration only.\\n');
    usingSyntheticData = true;

    % Synthetic data: deliberately miscalibrated softmax probs (overconfident)
    rng(42);  % reproducible
    N = 50;
    trueLabels   = randi([0 4], N, 1);
    % Create overconfident predictions: correct class gets 0.85–0.95
    softmaxProbs = zeros(N, 5);
    for i = 1:N
        p = rand(1, 5) * 0.05;
        p(trueLabels(i)+1) = 0.80 + rand() * 0.15;
        softmaxProbs(i, :) = p / sum(p);
    end
end

N = size(softmaxProbs, 1);
nClasses = size(softmaxProbs, 2);

% ─── 2. Determine temperature ─────────────────────────────────────────────
if nargin >= 3 && ~isempty(temperature)
    % Temperature explicitly provided by caller
    T = temperature;
    fprintf('[Calibration] Using externally provided temperature T=%.3f\\n', T);
elseif usingSyntheticData || N < 20
    % CANNOT reliably estimate T from insufficient data
    T = NaN;
    if ~usingSyntheticData
        fprintf('[Calibration] WARNING: Only %d samples available.\\n', N);
        fprintf('[Calibration] Minimum ~200 samples required for reliable calibration.\\n');
    end
else
    % Estimate T via NLL minimization (grid search: T in [0.5, 3.0])
    fprintf('[Calibration] Estimating temperature via NLL grid search...\\n');
    T_grid  = 0.5:0.05:3.0;
    nll_grid = zeros(size(T_grid));
    for ti = 1:numel(T_grid)
        t = T_grid(ti);
        logits_scaled = log(softmaxProbs + 1e-8) / t;
        probs_scaled  = exp(logits_scaled) ./ sum(exp(logits_scaled), 2);
        nll = 0;
        for i = 1:N
            nll = nll - log(probs_scaled(i, trueLabels(i)+1) + 1e-8);
        end
        nll_grid(ti) = nll;
    end
    [~, bestIdx] = min(nll_grid);
    T = T_grid(bestIdx);
    fprintf('[Calibration] Estimated T = %.3f (grid search on N=%d samples)\\n', T, N);
end

% ─── 3. Apply temperature scaling ─────────────────────────────────────────
if ~isnan(T)
    logits         = log(softmaxProbs + 1e-8);
    logits_scaled  = logits / T;
    exp_scaled     = exp(logits_scaled - max(logits_scaled, [], 2));
    calibratedProbs = exp_scaled ./ sum(exp_scaled, 2);
else
    calibratedProbs = softmaxProbs;  % unchanged
end

% ─── 4. Compute ECE (Expected Calibration Error) ─────────────────────────
% Uses M=10 confidence bins on the max-class probability
function ece = compute_ece(probs, labels, M)
    [maxProbs, predClasses] = max(probs, [], 2);
    predClasses = predClasses - 1;  % convert to 0-indexed
    binEdges = linspace(0, 1, M+1);
    ece = 0;
    total = numel(labels);
    for b = 1:M
        inBin = maxProbs >= binEdges(b) & maxProbs < binEdges(b+1);
        if sum(inBin) == 0, continue; end
        binAcc  = mean(predClasses(inBin) == labels(inBin));
        binConf = mean(maxProbs(inBin));
        ece     = ece + (sum(inBin)/total) * abs(binAcc - binConf);
    end
end

eceBefore = compute_ece(softmaxProbs, trueLabels, 10);
eceAfter  = compute_ece(calibratedProbs, trueLabels, 10);

% ─── 5. Compute Brier Score (multiclass) ─────────────────────────────────
% One-hot encode true labels
oneHot = zeros(N, nClasses);
for i = 1:N
    oneHot(i, trueLabels(i)+1) = 1;
end
brierBefore = mean(sum((softmaxProbs  - oneHot).^2, 2));
brierAfter  = mean(sum((calibratedProbs - oneHot).^2, 2));

% ─── 6. Determine validation status ──────────────────────────────────────
if usingSyntheticData
    validationNote = 'CALIBRATION NOT VALIDATED — synthetic demonstration data used. ' + ...
        'Run with real model predictions and ground-truth labels for valid results.';
elseif N < 20
    validationNote = sprintf(['CALIBRATION NOT VALIDATED — INSUFFICIENT DATA (N=%d). ' ...
        'Minimum ~200 held-out samples required for reliable temperature estimation.'], N);
else
    validationNote = sprintf('Calibration performed on N=%d samples. ' + ...
        'Results are indicative. Independent validation set recommended.', N);
end

% ─── 7. Build output struct ───────────────────────────────────────────────
cal = struct();
cal.temperature          = T;
cal.calibrated_probs     = calibratedProbs;
cal.ece_before           = eceBefore;
cal.ece_after            = eceAfter;
cal.brier_score_before   = brierBefore;
cal.brier_score_after    = brierAfter;
cal.n_samples            = N;
cal.validation_note      = char(validationNote);
cal.using_synthetic      = usingSyntheticData;

fprintf('\\n[Calibration Results]\\n');
fprintf('  Samples used:    %d\\n', N);
fprintf('  Temperature T:   %s\\n', mat2str(T));
fprintf('  ECE before:      %.4f\\n', eceBefore);
fprintf('  ECE after:       %.4f\\n', eceAfter);
fprintf('  Brier before:    %.4f\\n', brierBefore);
fprintf('  Brier after:     %.4f\\n', brierAfter);
fprintf('  Status: %s\\n', cal.validation_note);

% ─── 8. Reliability diagram ───────────────────────────────────────────────
try
    fig = figure('Visible', 'off');
    M = 10;
    binEdges = linspace(0, 1, M+1);
    binCenters = 0.5 * (binEdges(1:end-1) + binEdges(2:end));

    function [accOut, confOut] = bin_stats(probs, labels, edges)
        [mp, pc] = max(probs, [], 2); pc = pc-1;
        accOut = zeros(1, numel(edges)-1);
        confOut = zeros(1, numel(edges)-1);
        for b = 1:numel(edges)-1
            inB = mp >= edges(b) & mp < edges(b+1);
            if sum(inB) == 0, continue; end
            accOut(b)  = mean(pc(inB) == labels(inB));
            confOut(b) = mean(mp(inB));
        end
    end

    [accB, ~] = bin_stats(softmaxProbs,   trueLabels, binEdges);
    [accA, ~] = bin_stats(calibratedProbs, trueLabels, binEdges);

    hold on;
    plot([0 1], [0 1], 'k--', 'LineWidth', 1, 'DisplayName', 'Perfect calibration');
    bar(binCenters, accB, 0.4, 'FaceAlpha', 0.5, 'FaceColor', [0.9 0.3 0.3], 'DisplayName', 'Before T-scaling');
    bar(binCenters, accA, 0.4, 'FaceAlpha', 0.5, 'FaceColor', [0.3 0.7 0.3], 'DisplayName', 'After T-scaling');
    xlabel('Confidence'); ylabel('Accuracy');
    title(sprintf('Reliability Diagram (ECE: %.3f → %.3f)', eceBefore, eceAfter));
    legend('Location', 'northwest'); grid on; axis([0 1 0 1]);
    hold off;

    [cDir, ~, ~] = fileparts(mfilename('fullpath'));
    reliabilityPath = fullfile(cDir, 'reliability_diagram.png');
    saveas(fig, reliabilityPath);
    close(fig);
    cal.reliability_diagram_path = reliabilityPath;
    fprintf('[Calibration] Reliability diagram saved: %s\\n', reliabilityPath);
catch plotErr
    fprintf('[Calibration] Could not save diagram: %s\\n', plotErr.message);
    cal.reliability_diagram_path = '';
end

end
