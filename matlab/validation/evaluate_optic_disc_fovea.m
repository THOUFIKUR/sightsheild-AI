function evaluate_optic_disc_fovea(idridRoot, logFile)
% EVALUATE_OPTIC_DISC_FOVEA
% Problem Statement: SIH26038 (MathWorks) — Real Validation
%
% Runs detect_optic_disc.m and localize_fovea.m against every image in the
% IDRiD Localization subset and computes real pixel-distance error vs GT
% OD/Fovea coordinates.
%
% Reports mean/median error in pixels and as percentage of image diagonal.
% Replaces "not validated" status for these two modules with a real number.
%
% Amendment 2: If IDRiD localization data missing → "DATA MISSING — NOT RUN"
%
% Usage:
%   evaluate_optic_disc_fovea('path/to/idrid')
%   evaluate_optic_disc_fovea('path/to/idrid', 'REAL_VALIDATION_LOG.md')

if nargin < 1, idridRoot = fullfile(fileparts(mfilename('fullpath')), '..', '..', 'data', 'idrid'); end
if nargin < 2, logFile   = fullfile(fileparts(mfilename('fullpath')), '..', '..', 'REAL_VALIDATION_LOG.md'); end

ts = datestr(now, 'yyyy-mm-dd HH:MM:SS UTC');
fprintf('\n=== evaluate_optic_disc_fovea === %s ===\n', ts);

thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, '..', 'data_loading'));
addpath(fullfile(thisDir, '..', 'retinal_structures'));

% ─── Load IDRiD (for localization) ──────────────────────────────────────────
try
    [dataset, localization] = load_idrid_dataset(idridRoot, 'train');
catch loadErr
    msg = sprintf('DATA MISSING — NOT RUN\nReason: %s', loadErr.message);
    fprintf('%s\n', msg);
    _append_log(logFile, 'evaluate_optic_disc_fovea', ts, msg);
    return;
end

if ~localization.available
    msg = 'DATA MISSING — NOT RUN\nReason: IDRiD Localization CSV not found. Required: C. Localization/IDRiD_OD_Fovea_Localization.csv with columns Optic Disk X/Y and Fovea X/Y.';
    fprintf('%s\n', msg);
    _append_log(logFile, 'evaluate_optic_disc_fovea', ts, msg);
    return;
end

nLoc = numel(localization.image_ids);
fprintf('Localization subset: %d images with GT OD/Fovea coordinates.\n', nLoc);

od_errors_px    = nan(nLoc, 1);
fovea_errors_px = nan(nLoc, 1);
img_diagonals   = nan(nLoc, 1);

for i = 1:nLoc
    imgId = char(localization.image_ids(i));

    % Find corresponding image path in dataset
    idx = find(strcmp(dataset.image_ids, imgId), 1);
    if isempty(idx)
        fprintf('[%d/%d] WARNING: No image found for localization ID "%s"\n', i, nLoc, imgId);
        continue;
    end

    imgPath = dataset.images{idx};
    gtODx   = localization.od_x(i);
    gtODy   = localization.od_y(i);
    gtFovX  = localization.fovea_x(i);
    gtFovY  = localization.fovea_y(i);

    fprintf('[%d/%d] %s | GT OD=[%.1f,%.1f] Fovea=[%.1f,%.1f]\n', ...
        i, nLoc, imgId, gtODx, gtODy, gtFovX, gtFovY);

    % Get image size for diagonal normalization
    info = imfinfo(imgPath);
    imgW = info.Width; imgH = info.Height;
    diag = sqrt(imgW^2 + imgH^2);
    img_diagonals(i) = diag;

    % ─── Detect OD ────────────────────────────────────────────────────────
    try
        disc = detect_optic_disc(imgPath);
        if ~isempty(disc.center)
            od_errors_px(i) = sqrt((disc.center(1)-gtODx)^2 + (disc.center(2)-gtODy)^2);
            fprintf('   OD pred=[%.1f,%.1f]  error=%.2f px\n', disc.center(1), disc.center(2), od_errors_px(i));
        else
            fprintf('   OD: no center detected.\n');
        end
    catch ex
        fprintf('   OD detection error: %s\n', ex.message);
    end

    % ─── Detect Fovea ────────────────────────────────────────────────────
    try
        if ~isempty(disc) && isfield(disc,'center') && ~isempty(disc.center)
            fov = localize_fovea(imgPath, disc.center, disc.radius);
        else
            fov = localize_fovea(imgPath);
        end
        if isfield(fov,'center') && ~isempty(fov.center)
            fovea_errors_px(i) = sqrt((fov.center(1)-gtFovX)^2 + (fov.center(2)-gtFovY)^2);
            fprintf('   Fovea pred=[%.1f,%.1f]  error=%.2f px\n', fov.center(1), fov.center(2), fovea_errors_px(i));
        else
            fprintf('   Fovea: no center detected.\n');
        end
    catch ex
        fprintf('   Fovea detection error: %s\n', ex.message);
    end
end

% ─── Report ────────────────────────────────────────────────────────────────
od_valid    = od_errors_px(~isnan(od_errors_px));
fovea_valid = fovea_errors_px(~isnan(fovea_errors_px));
diag_valid  = img_diagonals(~isnan(od_errors_px));

fprintf('\n=== OD / FOVEA LOCALIZATION RESULTS (IDRiD Localization, N=%d) ===\n', nLoc);

if isempty(od_valid)
    fprintf('Optic Disc: NO VALID RESULTS (detection failed for all images)\n');
    od_report = 'Optic Disc: NO VALID RESULTS';
else
    od_pct = (od_valid ./ diag_valid) * 100;
    fprintf('Optic Disc Error (pixels): mean=%.2f | median=%.2f | min=%.2f | max=%.2f\n', ...
        mean(od_valid), median(od_valid), min(od_valid), max(od_valid));
    fprintf('Optic Disc Error (%% diag): mean=%.2f%% | median=%.2f%%\n', ...
        mean(od_pct), median(od_pct));
    od_report = sprintf('OD: mean=%.2fpx (%.2f%% diag) | median=%.2fpx | N=%d', ...
        mean(od_valid), mean(od_pct), median(od_valid), numel(od_valid));
end

if isempty(fovea_valid)
    fprintf('Fovea: NO VALID RESULTS\n');
    fov_report = 'Fovea: NO VALID RESULTS';
else
    fov_diag = img_diagonals(~isnan(fovea_errors_px));
    fov_pct = (fovea_valid ./ fov_diag) * 100;
    fprintf('Fovea Error (pixels): mean=%.2f | median=%.2f | min=%.2f | max=%.2f\n', ...
        mean(fovea_valid), median(fovea_valid), min(fovea_valid), max(fovea_valid));
    fprintf('Fovea Error (%% diag): mean=%.2f%% | median=%.2f%%\n', ...
        mean(fov_pct), median(fov_pct));
    fov_report = sprintf('Fovea: mean=%.2fpx (%.2f%% diag) | median=%.2fpx | N=%d', ...
        mean(fovea_valid), mean(fov_pct), median(fovea_valid), numel(fovea_valid));
end

logMsg = sprintf('IDRiD Localization subset (N=%d)\n%s\n%s', nLoc, od_report, fov_report);
append_log(logFile, 'evaluate_optic_disc_fovea', ts, logMsg);
fprintf('[OD/Fovea Validation] Results appended to: %s\n', logFile);
end

function append_log(logFile, section, ts, content)
try
    fid = fopen(logFile, 'a');
    if fid==-1, fprintf('[LOG] Cannot open: %s\n', logFile); return; end
    fprintf(fid, '\n---\n## [%s] %s\n\n%s\n', ts, section, content);
    fclose(fid);
catch ex
    fprintf('[LOG] Write error: %s\n', ex.message);
end
end
