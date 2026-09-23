function prodResult = call_production_model(imagePath, apiUrl)
% CALL_PRODUCTION_MODEL
% Problem Statement: SIH26038 (MathWorks) — Clinical Diagnosis Bridge
%
% Bridges MATLAB to the validated RetinaScan AI production model:
% EfficientNet-B3 + CBAM (FP32 ONNX).
%
% Replaces all hand-coded lesion thresholding with genuine validated model inference.
%
% Usage:
%   res = call_production_model('IDRiD_01.jpg')
%   res = call_production_model('IDRiD_01.jpg', 'http://127.0.0.1:8000/api/inference/?skip_yolo=true')
%
% Returns a struct:
%   prodResult.success              - logical true if validated model ran
%   prodResult.grade                - integer 0..4 (ETDRS / ICDR DR severity grade)
%   prodResult.diagnosis            - clinical diagnosis label
%   prodResult.confidence           - prediction confidence in [0, 1]
%   prodResult.is_referable         - logical true if referral required (grade >= 2)
%   prodResult.urgency              - clinical triage referral guidance
%   prodResult.class_probabilities  - [1x5] vector of probabilities for Grades 0..4
%   prodResult.method               - string description of validated execution path
%   prodResult.quality_warnings     - cell array of quality warnings from server
%   prodResult.error_message        - empty on success, error detail on failure

if nargin < 2 || isempty(apiUrl)
    apiUrl = 'http://127.0.0.1:8000/api/inference/?skip_yolo=true';
end

prodResult = struct();
prodResult.success = false;
prodResult.grade = NaN;
prodResult.diagnosis = 'DIAGNOSIS PENDING — Production Model Offline';
prodResult.confidence = 0.0;
prodResult.is_referable = false;
prodResult.urgency = 'Connect to RetinaScan AI Production Endpoint (FastAPI) to obtain validated diagnosis.';
prodResult.class_probabilities = zeros(1, 5);
prodResult.method = 'NONE';
prodResult.quality_warnings = {};
prodResult.error_message = '';

if ~isfile(imagePath)
    prodResult.error_message = sprintf('Image file not found: %s', imagePath);
    fprintf('[Production Bridge ERROR] %s\n', prodResult.error_message);
    return;
end

% Get absolute file path
[fDir, fName, fExt] = fileparts(imagePath);
if isempty(fDir), fDir = pwd; end
absImagePath = fullfile(fDir, [fName, fExt]);

fprintf('[Production Bridge] Contacting validated model for: %s\n', imagePath);

% ─── Strategy 1: HTTP POST to FastAPI backend via matlab.net.http ──────────
httpSuccess = false;
try
    import matlab.net.http.*
    import matlab.net.http.io.*

    provider = FileProvider(absImagePath);
    formProvider = MultipartFormProvider('file', provider);
    req = RequestMessage(RequestMethod.POST, [], formProvider);
    uri = URI(apiUrl);
    opts = HTTPOptions('ConnectTimeout', 4, 'ReceiveTimeout', 20);

    resp = req.send(uri, opts);

    if resp.StatusCode == StatusCode.OK
        rawBody = resp.Body.Data;
        if ischar(rawBody) || isstring(rawBody)
            payload = jsondecode(char(rawBody));
        elseif isstruct(rawBody)
            payload = rawBody;
        else
            payload = jsondecode(char(resp.Body.string()));
        end
        prodResult = parse_api_response(payload, 'FastAPI /inference endpoint (EfficientNet-B3+CBAM ONNX)');
        httpSuccess = true;
    elseif resp.StatusCode == StatusCode.UnprocessableEntity % 422 Quality Reject
        try
            payload = jsondecode(char(resp.Body.string()));
            reason = 'Quality Rejection';
            guidance = 'Please recapture image.';
            if isfield(payload, 'detail') && isstruct(payload.detail)
                if isfield(payload.detail, 'reason'), reason = payload.detail.reason; end
                if isfield(payload.detail, 'recapture_guidance'), guidance = payload.detail.recapture_guidance; end
            end
            prodResult.diagnosis = sprintf('REJECTED (%s)', reason);
            prodResult.urgency = sprintf('RECAPTURE REQUIRED: %s', guidance);
            prodResult.error_message = sprintf('Image quality failed (HTTP 422): %s — %s', reason, guidance);
        catch
            prodResult.error_message = 'Image rejected for quality (HTTP 422). Recapture required.';
        end
        prodResult.success = false;
        return;
    else
        fprintf('[Production Bridge] HTTP server returned status: %s\n', char(resp.StatusCode));
    end
catch httpErr
    fprintf('[Production Bridge] matlab.net.http call notice: %s\n', httpErr.message);
end

% ─── Strategy 2: System curl fallback (if matlab.net.http failed) ──────────
if ~httpSuccess
    try
        curlCmd = sprintf('curl.exe -s -F "file=@%s" "%s"', absImagePath, apiUrl);
        [status, cmdOut] = system(curlCmd);
        if status == 0 && ~isempty(cmdOut) && contains(cmdOut, '"grade"')
            payload = jsondecode(cmdOut);
            prodResult = parse_api_response(payload, 'FastAPI /inference endpoint via curl (EfficientNet-B3+CBAM ONNX)');
            httpSuccess = true;
        elseif status == 0 && contains(cmdOut, '"gradeable":false')
            payload = jsondecode(cmdOut);
            detail = payload.detail;
            prodResult.diagnosis = sprintf('REJECTED (%s)', detail.reason);
            prodResult.urgency = sprintf('RECAPTURE REQUIRED: %s', detail.recapture_guidance);
            prodResult.error_message = sprintf('Quality rejection: %s', detail.reason);
            prodResult.success = false;
            return;
        end
    catch curlErr
        % Silently proceed to Strategy 3
    end
end

if httpSuccess
    fprintf('[Production Bridge] SUCCESS — Validated Grade: Level %d (%s) | Confidence: %.1f%%\n', ...
        prodResult.grade, prodResult.diagnosis, prodResult.confidence * 100);
    return;
end

% ─── Strategy 3: Direct ONNX inference via MATLAB importONNXNetwork ────────
% When the backend is offline, we load retina_model.onnx directly, matching
% the EXACT preprocessing of backend/routes/inference.py's preprocess_fundus_rgb
fprintf('[Production Bridge] Backend server unreachable. Attempting direct ONNX inference...\n');

onnxPaths = {
    fullfile(fDir, '..', 'backend', 'models', 'retina_model.onnx'), ...
    fullfile(pwd, '..', 'backend', 'models', 'retina_model.onnx'), ...
    fullfile(pwd, 'backend', 'models', 'retina_model.onnx'), ...
    fullfile('D:', 'sih2026', 'retino', 'backend', 'models', 'retina_model.onnx'), ...
    'retina_model.onnx'
};

onnxFile = '';
for k = 1:numel(onnxPaths)
    if isfile(onnxPaths{k})
        onnxFile = onnxPaths{k};
        break;
    end
end

if ~isempty(onnxFile) && exist('importONNXNetwork', 'file') == 2
    try
        rawRGB = imread(absImagePath);
        if size(rawRGB, 3) == 1, rawRGB = cat(3, rawRGB, rawRGB, rawRGB); end

        % EXACT PREPROCESSING from backend/routes/inference.py: preprocess_fundus_rgb
        % 1. Auto-crop black border (threshold 10)
        gray = rgb2gray(rawRGB);
        mask = gray > 10;
        [ys, xs] = find(mask);
        if numel(ys) > 10
            y0 = min(ys); y1 = max(ys);
            x0 = min(xs); x1 = max(xs);
            cropped = rawRGB(y0:y1, x0:x1, :);
        else
            cropped = rawRGB;
        end

        % 2. Square pad preserving aspect ratio
        [h, w, ~] = size(cropped);
        side = max(h, w);
        padded = zeros(side, side, 3, 'uint8');
        y_off = floor((side - h) / 2) + 1;
        x_off = floor((side - w) / 2) + 1;
        padded(y_off:y_off+h-1, x_off:x_off+w-1, :) = cropped;

        % 3. Resize to 300x300
        resized = imresize(padded, [300, 300], 'bilinear');

        % 4. ImageNet normalize: (img/255.0 - MEAN) / STD
        normImg = double(resized) / 255.0;
        meanVals = reshape([0.485, 0.456, 0.406], [1, 1, 3]);
        stdVals  = reshape([0.229, 0.224, 0.225], [1, 1, 3]);
        normImg = (normImg - meanVals) ./ stdVals;

        % Convert to dlarray [300, 300, 3, 1] for MATLAB network
        dlIn = dlarray(single(normImg), 'SSCB');

        net = importONNXNetwork(onnxFile, 'OutputDataFormats', 'BC');
        outLogits = predict(net, dlIn);
        logits = extractdata(outLogits);

        % Softmax
        expLogits = exp(logits - max(logits));
        probs = expLogits / sum(expLogits);
        [conf, maxIdx] = max(probs);
        predGrade = maxIdx - 1; % 0-indexed

        prodResult = format_grade_output(predGrade, conf, probs, sprintf('Local ONNX import (%s)', onnxFile));
        prodResult.success = true;
        fprintf('[Production Bridge] SUCCESS (Local ONNX) — Grade: Level %d (%s) | Confidence: %.1f%%\n', ...
            prodResult.grade, prodResult.diagnosis, prodResult.confidence * 100);
        return;
    catch onnxErr
        fprintf('[Production Bridge] Direct ONNX import error: %s\n', onnxErr.message);
    end
end

% ─── Strategy 4: Python execution fallback ────────────────────────────────
try
    pyScript = fullfile(tempdir, 'run_grading_bridge.py');
    fid = fopen(pyScript, 'w');
    if fid ~= -1
        fprintf(fid, 'import sys, json\n');
        fprintf(fid, 'from pathlib import Path\n');
        fprintf(fid, 'sys.path.insert(0, r"%s")\n', fullfile('D:', 'sih2026', 'retino'));
        fprintf(fid, 'from backend.routes.inference import run_grading\n');
        fprintf(fid, 'import cv2\n');
        fprintf(fid, 'img_bgr = cv2.imread(r"%s")\n', absImagePath);
        fprintf(fid, 'img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)\n');
        fprintf(fid, 'res = run_grading(img_rgb)\n');
        fprintf(fid, 'res.pop("feature_map", None)\n');
        fprintf(fid, 'print(json.dumps(res))\n');
        fclose(fid);

        pyExe = fullfile('D:', 'sih2026', 'retino', 'backend', 'venv', 'Scripts', 'python.exe');
        if ~isfile(pyExe), pyExe = 'python'; end
        [st, out] = system(sprintf('"%s" "%s"', pyExe, pyScript));
        if isfile(pyScript), delete(pyScript); end

        if st == 0 && contains(out, '"grade"')
            payload = jsondecode(out);
            prodResult = parse_api_response(payload, 'Local Python ONNX Engine (backend.routes.inference.run_grading)');
            prodResult.success = true;
            fprintf('[Production Bridge] SUCCESS (Local Python Engine) — Grade: Level %d (%s) | Confidence: %.1f%%\n', ...
                prodResult.grade, prodResult.diagnosis, prodResult.confidence * 100);
            return;
        end
    end
catch
    % Non-fatal
end

% ─── All Validated Paths Failed ───────────────────────────────────────────
prodResult.success = false;
prodResult.error_message = 'Could not reach FastAPI backend at 127.0.0.1:8000 and direct ONNX execution failed.';
fprintf('========================================================================\n');
fprintf('[WARNING] Validated Production Model is currently offline.\n');
fprintf('  To obtain a validated clinical diagnosis:\n');
fprintf('  1. Start the FastAPI server: python -m uvicorn backend.main:app --port 8000\n');
fprintf('  2. Or ensure retina_model.onnx is accessible.\n');
fprintf('  NOTE: RetinaScan AI refuses to output an unvalidated morphological grade.\n');
fprintf('========================================================================\n');
end

% ─── Helper: Parse API Payload ─────────────────────────────────────────────
function prodResult = parse_api_response(payload, methodStr)
prodResult = struct();
prodResult.success = true;
prodResult.grade = payload.grade;
prodResult.confidence = payload.confidence;
prodResult.diagnosis = payload.diagnosis;
prodResult.urgency = payload.urgency;
prodResult.is_referable = payload.is_referable;

if isfield(payload, 'class_probabilities')
    prodResult.class_probabilities = payload.class_probabilities;
else
    prodResult.class_probabilities = zeros(1, 5);
end

if isfield(payload, 'quality_warnings') && ~isempty(payload.quality_warnings)
    if iscell(payload.quality_warnings)
        prodResult.quality_warnings = payload.quality_warnings;
    else
        prodResult.quality_warnings = {char(payload.quality_warnings)};
    end
else
    prodResult.quality_warnings = {};
end

prodResult.method = methodStr;
prodResult.error_message = '';
end

% ─── Helper: Format Grade Output ───────────────────────────────────────────
function prodResult = format_grade_output(grade, conf, probs, methodStr)
MAP = {
    'No Diabetic Retinopathy',             'Routine annual screening at PHC';
    'Mild Diabetic Retinopathy',           'Annual review; strict glycemic control';
    'Moderate Diabetic Retinopathy',       'Referral to ophthalmologist within 6 months';
    'Severe Diabetic Retinopathy',         'Urgent referral within 3 months (high risk of PDR)';
    'Proliferative Diabetic Retinopathy',   'Emergency referral for PRP Laser / Anti-VEGF'
};

idx = min(max(grade + 1, 1), 5);
prodResult = struct();
prodResult.success = true;
prodResult.grade = grade;
prodResult.diagnosis = MAP{idx, 1};
prodResult.confidence = conf;
prodResult.urgency = MAP{idx, 2};
prodResult.is_referable = (grade >= 2);
prodResult.class_probabilities = probs(:)';
prodResult.method = methodStr;
prodResult.quality_warnings = {};
prodResult.error_message = '';
end
