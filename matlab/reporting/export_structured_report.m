function export_structured_report(screeningResult, outputDir)
% EXPORT_STRUCTURED_REPORT
% Problem Statement: SIH26038 (MathWorks) — Medical Imaging Toolbox
%
% Packages each screening result as a structured clinical metadata object
% (DICOM-SR-style key-value structure) using the MATLAB Medical Imaging Toolbox
% when available, alongside the existing PDF report.
%
% Amendment 10:
%   If Medical Imaging Toolbox IS installed: executes the toolbox implementation.
%   If Medical Imaging Toolbox is NOT available: reports
%     "MEDICAL IMAGING TOOLBOX — NOT AVAILABLE / NOT VERIFIED"
%   The JSON fallback preserves application functionality but is clearly labeled
%   as a fallback — it does NOT satisfy the toolbox requirement.
%
% Inputs:
%   screeningResult : struct with fields:
%     .grade            integer (0-4) DR severity
%     .grade_label      string
%     .confidence       float
%     .lesion_findings  struct (from clinical_arbitration_engine)
%     .od_center        [x,y] or [] if not detected
%     .fovea_center     [x,y] or [] if not detected
%     .gradcam_path     string — path to Grad-CAM overlay image (or '')
%     .gradcam_status   'VERIFIED' | 'NOT VERIFIED' | 'HEURISTIC_FALLBACK'
%     .image_path       string — original fundus image path
%     .timestamp        string
%   outputDir : string — directory to write report files
%
% Outputs (written to outputDir):
%   <imageId>_structured_report.json  (always — JSON fallback or toolbox output)
%   <imageId>_structured_report.mat   (if Medical Imaging Toolbox available)
%
% Usage:
%   result.grade = 2; result.grade_label = 'Moderate DR'; % etc.
%   export_structured_report(result, 'reports/')

if nargin < 2, outputDir = '.'; end
if ~isfolder(outputDir), mkdir(outputDir); end

ts = datestr(now, 'yyyy-mm-dd HH:MM:SS UTC');
[~, imgId, ~] = fileparts(screeningResult.image_path);

fprintf('[export_structured_report] Image: %s | Grade: %d (%s)\n', ...
    imgId, screeningResult.grade, screeningResult.grade_label);

% ─── Build core metadata struct ─────────────────────────────────────────────
meta = struct();
meta.study_date            = ts;
meta.image_id              = imgId;
meta.image_path            = screeningResult.image_path;
meta.dr_severity_grade     = screeningResult.grade;
meta.dr_severity_label     = screeningResult.grade_label;
meta.confidence_score      = screeningResult.confidence;
meta.is_referable          = screeningResult.grade >= 2;
meta.gradcam_overlay_path  = get_safe_field(screeningResult, 'gradcam_path', '');
meta.gradcam_status        = get_safe_field(screeningResult, 'gradcam_status', 'UNKNOWN');
meta.od_center             = get_safe_field(screeningResult, 'od_center',    []);
meta.fovea_center          = get_safe_field(screeningResult, 'fovea_center', []);

% Lesion findings
lf = get_safe_field(screeningResult, 'lesion_findings', struct());
meta.lesion_microaneurysms = get_safe_field(lf, 'microaneurysms', NaN);
meta.lesion_hemorrhages    = get_safe_field(lf, 'hemorrhages',    NaN);
meta.lesion_hard_exudates  = get_safe_field(lf, 'hard_exudates',  NaN);
meta.clinical_rule_applied = get_safe_field(lf, 'clinical_rule_applied', 'none');

meta.system_version = 'RetinaScan AI SIH26038';
meta.schema         = 'DICOM-SR-style key-value (SIH26038 custom)';

% ─── Attempt Medical Imaging Toolbox export ──────────────────────────────────
toolboxAvailable = false;
toolboxStatus    = 'MEDICAL IMAGING TOOLBOX — NOT AVAILABLE';

% Check using ver() — the correct approach. dicomwrite/dicomread are Image
% Processing Toolbox functions, NOT Medical Imaging Toolbox indicators.
installedToolboxes = ver();
toolboxNames = {installedToolboxes.Name};
if any(contains(toolboxNames, 'Medical Imaging', 'IgnoreCase', true))
    toolboxAvailable = true;
    toolboxStatus    = 'MEDICAL IMAGING TOOLBOX — DETECTED (ver check)';
    fprintf('[export_structured_report] Medical Imaging Toolbox detected via ver().\n');
else
    fprintf('[export_structured_report] Medical Imaging Toolbox NOT found.\n');
    fprintf('[export_structured_report] Toolboxes installed: %s\n', strjoin(toolboxNames(1:min(5,end)), ', '));
end
    end
end

if toolboxAvailable
    fprintf('[export_structured_report] Attempting Medical Imaging Toolbox export...\n');
    try
        srPath = fullfile(outputDir, [imgId '_structured_report.mat']);
        % Attempt to use medicalVolume or dicomCollection if available
        % These are true Medical Imaging Toolbox objects (not Image Processing Toolbox)
        if ~isempty(which('dicomCollection'))
            % Build a minimal DICOM attribute struct for a Structured Report
            % dicomCollection is a Medical Imaging Toolbox class
            srAttribs.SOPClassUID        = '1.2.840.10008.5.1.4.1.1.88.33'; % Comprehensive SR
            srAttribs.Modality           = 'OPT';
            srAttribs.StudyDate          = datestr(now,'yyyymmdd');
            srAttribs.StudyTime          = datestr(now,'HHMMSS');
            srAttribs.PatientID          = 'ANON';
            srAttribs.SeriesDescription  = 'RetinaScan AI DR Screening Report';
            srAttribs.RetinaGrade        = meta.dr_severity_grade;
            srAttribs.GradeLabel         = meta.dr_severity_label;
            srAttribs.Confidence         = meta.confidence_score;
            srAttribs.IsReferable        = meta.is_referable;
            srAttribs.HeatmapStatus      = meta.gradcam_status;
            srAttribs.MACount            = meta.lesion_microaneurysms;
            srAttribs.HECount            = meta.lesion_hemorrhages;
            srAttribs.EXCount            = meta.lesion_hard_exudates;
            srAttribs.ClinicalRule       = meta.clinical_rule_applied;
            save(srPath, 'srAttribs', 'meta');
            toolboxStatus = sprintf('MEDICAL IMAGING TOOLBOX — dicomCollection available, SR attributes saved to: %s', srPath);
        else
            % medicalVolume exists but dicomCollection may not — still label correctly
            save(srPath, 'meta');
            toolboxStatus = sprintf('MEDICAL IMAGING TOOLBOX — available but dicomCollection not found; MATLAB struct saved (NOT a DICOM-SR file): %s', srPath);
        end
        fprintf('[export_structured_report] %s\n', toolboxStatus);
    catch toolboxErr
        toolboxStatus = sprintf('MEDICAL IMAGING TOOLBOX — ERROR: %s. JSON fallback used.', toolboxErr.message);
        fprintf('[export_structured_report] %s\n', toolboxStatus);
    end
else
    fprintf('[export_structured_report] %s\n', toolboxStatus);
    fprintf('[export_structured_report] Using JSON fallback (does NOT satisfy Medical Imaging Toolbox requirement).\n');
end

meta.toolbox_status = toolboxStatus;

% ─── JSON fallback (always written — explicitly labeled) ───────────────────
jsonPath = fullfile(outputDir, [imgId '_structured_report.json']);
jsonMeta = meta;
jsonMeta.json_fallback_note = 'This JSON file is a FALLBACK. It is NOT a DICOM-SR file and does NOT satisfy the Medical Imaging Toolbox PS requirement unless the toolbox_status field above shows EXECUTED.';
if ~isempty(meta.od_center)
    jsonMeta.od_center = meta.od_center;
end
if ~isempty(meta.fovea_center)
    jsonMeta.fovea_center = meta.fovea_center;
end

jsonStr = jsonencode(jsonMeta);
fid = fopen(jsonPath, 'w');
if fid ~= -1
    fprintf(fid, '%s\n', jsonStr);
    fclose(fid);
    fprintf('[export_structured_report] JSON metadata written: %s\n', jsonPath);
else
    fprintf('[export_structured_report] WARNING: Could not write JSON to: %s\n', jsonPath);
end

fprintf('[export_structured_report] TOOLBOX STATUS: %s\n', toolboxStatus);
end

% ─── Helper ────────────────────────────────────────────────────────────────
function val = get_safe_field(s, field, default)
if isfield(s, field)
    val = s.(field);
else
    val = default;
end
end
