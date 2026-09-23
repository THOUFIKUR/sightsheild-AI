function evaluate_on_real_data(idridRoot, messidor2Root, logFile)
% EVALUATE_ON_REAL_DATA
% Problem Statement: SIH26038 (MathWorks) — Cross-Dataset ONNX Evaluation
%
% Runs the existing production ONNX model (retina_model.onnx) against
% the real IDRiD test split AND Messidor-2 separately, computing real
% sensitivity/specificity/QWK from actual confusion matrices.
%
% PRIMARY PATH: MATLAB Deep Learning Toolbox / ONNX import.
% Per Amendment 3: If ONNX import fails due to unsupported operators/layers,
%   this script STOPS, reports the exact compatibility problem, and does NOT
%   silently switch to Python subprocess or claim MATLAB performed the evaluation.
%
% Amendment 7: Reports BOTH 5-class ICDR AND binary referable DR metrics.
% Amendment 2: DATA MISSING guard for each dataset independently.
% Amendment 4: Model compatibility audit logged before evaluation.
%
% Usage:
%   evaluate_on_real_data('path/to/idrid', 'path/to/messidor2')
%   evaluate_on_real_data('path/to/idrid', '', 'REAL_VALIDATION_LOG.md')

if nargin < 1, idridRoot    = fullfile(fileparts(mfilename('fullpath')), '..', '..', 'data', 'idrid'); end
if nargin < 2, messidor2Root = ''; end
if nargin < 3, logFile      = fullfile(fileparts(mfilename('fullpath')), '..', '..', 'REAL_VALIDATION_LOG.md'); end

ts = datestr(now, 'yyyy-mm-dd HH:MM:SS UTC');
fprintf('\n=== evaluate_on_real_data === %s ===\n', ts);

thisDir  = fileparts(mfilename('fullpath'));
onnxPath = fullfile(thisDir, '..', '..', 'backend', 'models', 'retina_model.onnx');

if ~isfile(onnxPath)
    msg = sprintf('DATA MISSING — NOT RUN\nONNX model not found: %s', onnxPath);
    fprintf('%s\n', msg);
    _append_log(logFile, 'evaluate_on_real_data', ts, msg);
    return;
end

addpath(fullfile(thisDir, '..', 'data_loading'));
addpath(fullfile(thisDir, '..', 'preprocessing'));

% ─── Amendment 4: ONNX Compatibility Audit ──────────────────────────────────
fprintf('\n--- ONNX Model Compatibility Audit ---\n');
fprintf('Model: %s\n', onnxPath);
d = dir(onnxPath);
fprintf('Size: %.2f MB\n', d.bytes/1024/1024);
fprintf('Modified: %s\n', datestr(d.datenum));

% Check MATLAB Deep Learning Toolbox ONNX import availability
hasDLT = ~isempty(which('importONNXNetwork')) || ~isempty(which('importNetworkFromONNX'));
fprintf('MATLAB Deep Learning Toolbox ONNX import: %s\n', _tf(hasDLT));

onnxCompatible = false;
net = [];

if hasDLT
    fprintf('Attempting ONNX import (this may take 30-120 seconds)...\n');
    try
        % Try importNetworkFromONNX (R2023b+) then importONNXNetwork (older)
        if ~isempty(which('importNetworkFromONNX'))
            net = importNetworkFromONNX(onnxPath);
        else
            net = importONNXNetwork(onnxPath, 'OutputLayerType', 'classification', ...
                'ImageInputSize', [300 300 3]);
        end
        onnxCompatible = true;
        fprintf('ONNX import: SUCCESS\n');
        if isobject(net)
            fprintf('Network type: %s\n', class(net));
        end
    catch importErr
        onnxCompatible = false;
        compatMsg = sprintf('ONNX IMPORT FAILED\nError: %s\n\nMATLAB Deep Learning Toolbox could not import this model.\nPossible causes:\n  - OPSET 18 operators not supported in this MATLAB version\n  - Custom CBAM attention layers not in ONNX operator registry\n  - Unsupported dynamic shapes\n\nThe MATLAB evaluation CANNOT be performed for this model.\nDo NOT claim MATLAB performed this evaluation.\nUse the Python ONNX runtime (backend/routes/inference.py) for production inference.', importErr.message);
        fprintf('\n%s\n', compatMsg);
        _append_log(logFile, 'evaluate_on_real_data ONNX_COMPAT_AUDIT', ts, compatMsg);
        fprintf('[evaluate_on_real_data] STOPPING — ONNX import incompatibility. Results appended to log.\n');
        return;
    end
else
    compatMsg = 'MATLAB Deep Learning Toolbox not found. ONNX import unavailable. MATLAB evaluation CANNOT be performed. This evaluation requires the Deep Learning Toolbox with ONNX support.';
    fprintf('%s\n', compatMsg);
    _append_log(logFile, 'evaluate_on_real_data ONNX_COMPAT_AUDIT', ts, compatMsg);
    return;
end

% ─── Define inference function ───────────────────────────────────────────────
function grade = _infer_grade(net, imgPath)
    raw = imread(imgPath);
    if size(raw,3)==1, raw=cat(3,raw,raw,raw); end
    % Black-border crop
    gray = rgb2gray(raw);
    bw   = gray > 10;
    rp   = regionprops(bw,'BoundingBox');
    if ~isempty(rp)
        bb = rp(1).BoundingBox;
        raw = imcrop(raw, bb);
    end
    % Square pad
    [h,w,~] = size(raw);
    side = max(h,w);
    padded = zeros(side,side,3,'uint8');
    yo = floor((side-h)/2)+1; xo = floor((side-w)/2)+1;
    padded(yo:yo+h-1, xo:xo+w-1, :) = raw;
    % Resize
    resized = imresize(padded, [300 300]);
    % ImageNet normalize
    img_f = single(resized) / 255;
    mn  = reshape([0.485 0.456 0.406],[1 1 3]);
    std_= reshape([0.229 0.224 0.225],[1 1 3]);
    img_f = (img_f - mn) ./ std_;
    % Inference
    try
        if isa(net,'dlnetwork')
            dlX = dlarray(img_f,'SSC');
            out = predict(net, dlX);
            scores = extractdata(out);
        else
            scores = predict(net, img_f);
        end
        scores = scores(:)';
        exp_s = exp(scores - max(scores));
        probs = exp_s / sum(exp_s);
        [~, grade] = max(probs);
        grade = grade - 1;  % 0-indexed
    catch inferEx
        grade = NaN;
    end
end

% ─── Run evaluation per dataset ─────────────────────────────────────────────
datasets = {};
if ~isempty(idridRoot) && isfolder(idridRoot)
    datasets{end+1} = struct('name','IDRiD','root',idridRoot,'type','idrid');
else
    fprintf('IDRiD: DATA MISSING — NOT RUN (%s)\n', idridRoot);
    _append_log(logFile,'evaluate_on_real_data IDRiD',ts,'DATA MISSING — NOT RUN');
end

if ~isempty(messidor2Root) && isfolder(messidor2Root)
    datasets{end+1} = struct('name','Messidor-2','root',messidor2Root,'type','messidor2');
else
    fprintf('Messidor-2: DATA MISSING — NOT RUN (%s)\n', messidor2Root);
    _append_log(logFile,'evaluate_on_real_data Messidor2',ts,'DATA MISSING — NOT RUN');
end

allResults = {};
for di = 1:numel(datasets)
    ds = datasets{di};
    fprintf('\n--- Evaluating on %s ---\n', ds.name);

    try
        if strcmp(ds.type,'idrid')
            [dataset, ~] = load_idrid_dataset(ds.root, 'test');
        else
            dataset = _load_messidor2(ds.root);
        end
    catch loadErr
        msg = sprintf('DATA MISSING — NOT RUN\nDataset: %s\nReason: %s', ds.name, loadErr.message);
        fprintf('%s\n', msg);
        _append_log(logFile, ['evaluate_on_real_data ' ds.name], ts, msg);
        continue;
    end

    n = numel(dataset.images);
    fprintf('Images: %d\n', n);

    labels   = dataset.labels;
    preds    = nan(n,1);
    for i = 1:n
        preds(i) = _infer_grade(net, dataset.images{i});
        if mod(i,10)==0, fprintf('  %d/%d...\n', i, n); end
    end

    valid = ~isnan(preds) & ~isnan(labels);
    preds_v  = preds(valid);
    labels_v = labels(valid);

    if sum(valid) == 0
        fprintf('%s: No valid predictions.\n', ds.name);
        continue;
    end

    % 5-class confusion matrix
    numClasses = 5;
    cm = zeros(numClasses, numClasses);
    for i = 1:numel(labels_v)
        r = labels_v(i) + 1;
        c = preds_v(i)  + 1;
        if r>=1&&r<=5&&c>=1&&c<=5
            cm(r,c) = cm(r,c) + 1;
        end
    end

    % QWK
    qwk_val = _compute_qwk(labels_v, preds_v, numClasses);

    % Per-class sensitivity / specificity
    pc_sens = nan(numClasses,1); pc_spec = nan(numClasses,1);
    for k = 1:numClasses
        tp = cm(k,k);
        fn = sum(cm(k,:)) - tp;
        fp = sum(cm(:,k)) - tp;
        tn = sum(cm(:)) - tp - fp - fn;
        pc_sens(k) = tp / max(tp+fn,1);
        pc_spec(k) = tn / max(tn+fp,1);
    end

    % Binary referable
    ref_gt   = labels_v >= 2;
    ref_pred = preds_v  >= 2;
    tp_b = sum(ref_pred & ref_gt);
    fp_b = sum(ref_pred & ~ref_gt);
    fn_b = sum(~ref_pred & ref_gt);
    tn_b = sum(~ref_pred & ~ref_gt);
    sens_b = tp_b/max(tp_b+fn_b,1);
    spec_b = tn_b/max(tn_b+fp_b,1);
    ppv_b  = tp_b/max(tp_b+fp_b,1);
    npv_b  = tn_b/max(tn_b+fn_b,1);

    fprintf('\n%s Results (N=%d valid):\n', ds.name, sum(valid));
    fprintf('  QWK: %.4f\n', qwk_val);
    fprintf('  5-class per-class Sensitivity/Specificity:\n');
    classNames = {'Grade0','Grade1','Grade2','Grade3','Grade4'};
    for k=1:numClasses
        fprintf('    %s: sens=%.4f spec=%.4f\n', classNames{k}, pc_sens(k), pc_spec(k));
    end
    fprintf('  Binary Referable DR:\n');
    fprintf('    Sensitivity=%.4f Specificity=%.4f PPV=%.4f NPV=%.4f\n', ...
        sens_b, spec_b, ppv_b, npv_b);
    fprintf('    TP=%d FP=%d FN=%d TN=%d\n', tp_b, fp_b, fn_b, tn_b);
    fprintf('  NOTE: PS targets >90%% sensitivity / >85%% specificity — reported value is real, not adjusted.\n');

    result = struct('dataset',ds.name,'N',sum(valid),'qwk',qwk_val,'cm',cm,...
        'sens_binary',sens_b,'spec_binary',spec_b,'ppv',ppv_b,'npv',npv_b);
    allResults{end+1} = result;

    logMsg = sprintf('%s | N=%d | QWK=%.4f | Binary sens=%.4f spec=%.4f ppv=%.4f npv=%.4f\nConfusion Matrix:\n%s', ...
        ds.name, sum(valid), qwk_val, sens_b, spec_b, ppv_b, npv_b, mat2str(cm));
    _append_log(logFile, ['evaluate_on_real_data ' ds.name], ts, logMsg);
end

if numel(allResults) == 2
    fprintf('\n=== CROSS-DATASET COMPARISON ===\n');
    fprintf('%-15s  %-8s  %-10s  %-10s  %-8s  %-8s\n', ...
        'Dataset','N','QWK','Sensitivity','Specificity','PPV');
    fprintf('%s\n', repmat('-',1,65));
    for di=1:numel(allResults)
        r = allResults{di};
        fprintf('%-15s  %-8d  %-10.4f  %-10.4f  %-8.4f  %-8.4f\n', ...
            r.dataset, r.N, r.qwk, r.sens_binary, r.spec_binary, r.ppv);
    end
end

fprintf('[evaluate_on_real_data] Complete. Results in: %s\n', logFile);
end

% ─── QWK computation ────────────────────────────────────────────────────────
function qwk = _compute_qwk(y_true, y_pred, numClasses)
n = numel(y_true);
W = zeros(numClasses);
for i=0:numClasses-1
    for j=0:numClasses-1
        W(i+1,j+1) = ((i-j)^2) / ((numClasses-1)^2);
    end
end
O = zeros(numClasses);
for k=1:n
    r=y_true(k)+1; c=y_pred(k)+1;
    if r>=1&&r<=numClasses&&c>=1&&c<=numClasses
        O(r,c)=O(r,c)+1;
    end
end
hist_t = sum(O,2)/n;
hist_p = sum(O,1)'/n;
E = hist_t * hist_p';
qwk = 1 - sum(sum(W.*O)) / sum(sum(W.*E.*n));
end

% ─── Messidor-2 loader (minimal — user must populate directory) ─────────────
function dataset = _load_messidor2(root)
imgFiles = [dir(fullfile(root,'*.jpg')); dir(fullfile(root,'*.png')); dir(fullfile(root,'*.tif'))];
if isempty(imgFiles)
    error('DATA MISSING: No images found in Messidor-2 root: %s\nExpected *.jpg fundus images with grade CSV.', root);
end
labelFile = '';
candidates = {fullfile(root,'messidor_data.csv'); fullfile(root,'labels.csv'); fullfile(root,'grades.csv')};
for k=1:numel(candidates), if isfile(candidates{k}), labelFile=candidates{k}; break; end; end
if isempty(labelFile)
    error('DATA MISSING: Messidor-2 label CSV not found in: %s\nExpected messidor_data.csv or labels.csv with image/grade columns.', root);
end
tbl = readtable(labelFile);
colN = lower(tbl.Properties.VariableNames);
imgCol = find(contains(colN,'image')||contains(colN,'filename'),1);
gradeCol = find(contains(colN,'grade')||contains(colN,'label'),1);
if isempty(imgCol)||isempty(gradeCol)
    error('Messidor-2 CSV: cannot find image/grade columns. Available: %s', strjoin(tbl.Properties.VariableNames,', '));
end
labelMap = containers.Map(string(table2cell(tbl(:,imgCol))), tbl{:,gradeCol});
n = numel(imgFiles);
dataset.images = cell(n,1); dataset.labels = nan(n,1); dataset.image_ids = cell(n,1);
for i=1:n
    dataset.images{i} = fullfile(imgFiles(i).folder, imgFiles(i).name);
    dataset.image_ids{i} = imgFiles(i).name;
    if isKey(labelMap, string(imgFiles(i).name))
        dataset.labels(i) = double(labelMap(string(imgFiles(i).name)));
    end
end
end

function _append_log(logFile, section, ts, content)
try
    fid = fopen(logFile,'a');
    if fid==-1, return; end
    fprintf(fid,'\n---\n## [%s] %s\n\n%s\n', ts, section, content);
    fclose(fid);
catch; end
end

function s = _tf(v)
if v, s='YES'; else, s='NO'; end
end
