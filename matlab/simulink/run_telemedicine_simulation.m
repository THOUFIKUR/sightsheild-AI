% RUN_TELEMEDICINE_SIMULATION
% Problem Statement: SIH26038 (MathWorks) — Back-of-Envelope Capacity Analysis
%
% PURPOSE: Provides an analytically derived capacity estimate for a district-level
%          DR screening programme. This is NOT a Simulink simulation.
%          Every output is computed from the formulas below; nothing is hard-coded.
%
% For the full discrete-event Simulink model with queue dynamics, stochastic
% arrivals and resource optimisation, see:
%   matlab/simulink/retinascan_resource_allocation.slx   (P2 task)
%   matlab/simulink/run_simulation.m
%
% CITATION for parameters:
%   • Rural connectivity mix (2G/3G/4G): TRAI Annual Report 2023, Table 4.2
%   • Manual review time 5 min: Rajalakshmi et al. 2018 (TNDR programme)
%   • AI-assisted review time 3 min: estimate, unvalidated; see pilot table
%   • Referable prevalence 18%: Rema et al. 2019 (Sankara Nethralaya study)
%   • Fundus image size 5 MB: typical JPEG from portable non-mydriatic camera
%
% NOTE: Output is LABELLED BACK-OF-ENVELOPE. Do NOT quote as Simulink simulation
%       output in any presentation, pitch deck, or report.

clc;
fprintf('=================================================================\n');
fprintf(' SIH26038 — Back-of-Envelope Capacity Analysis\n');
fprintf(' NOTE: Analytical model. See retinascan_resource_allocation.slx\n');
fprintf('       for the discrete-event Simulink model (P2 task).\n');
fprintf('=================================================================\n\n');

% ─── 1. PROGRAMME PARAMETERS (all cited above) ───────────────────────────────
numPatientsAnnual = 100000;          % district annual cohort
workingDaysYear   = 250;             % ~5 days/week, 50 weeks
numPHCs           = 10;
imageSizeMB       = 5.0;             % typical portable-camera JPEG
referableRate     = 0.18;            % Rema et al. 2019

% Connectivity mix fractions (TRAI 2023)
frac2G = 0.40;  bw2G_kbps  = 64;
frac3G = 0.45;  bw3G_kbps  = 384;
frac4G = 0.15;  bw4G_kbps  = 2048;

% Review times
manualReviewMin = 5;           % Rajalakshmi et al. 2018
aiAssistedMin   = 3;           % estimate; mark as unvalidated
numDoctors      = 2;           % district ophthalmologists

fprintf('Parameters:\n');
fprintf('  Annual cohort          : %d patients\n', numPatientsAnnual);
fprintf('  PHCs                   : %d\n', numPHCs);
fprintf('  Image size             : %.1f MB\n', imageSizeMB);
fprintf('  Referable rate         : %.1f%%  (Rema et al. 2019)\n', referableRate*100);
fprintf('  Connectivity 2G/3G/4G  : %.0f%%/%.0f%%/%.0f%%  (TRAI 2023)\n', frac2G*100, frac3G*100, frac4G*100);
fprintf('  Manual review time     : %d min  (Rajalakshmi 2018)\n', manualReviewMin);
fprintf('  AI-assisted review     : %d min  [ESTIMATE — unvalidated]\n', aiAssistedMin);
fprintf('\n');

% ─── 2. UPLOAD TIME (weighted average across connectivity classes) ─────────────
uploadTime2G_sec = (imageSizeMB * 8 * 1024) / bw2G_kbps;
uploadTime3G_sec = (imageSizeMB * 8 * 1024) / bw3G_kbps;
uploadTime4G_sec = (imageSizeMB * 8 * 1024) / bw4G_kbps;
avgUploadTime_sec = frac2G*uploadTime2G_sec + frac3G*uploadTime3G_sec + frac4G*uploadTime4G_sec;

fprintf('[Upload times by connectivity class]\n');
fprintf('  2G (%.0f kbps): %.0f s = %.1f min\n', bw2G_kbps, uploadTime2G_sec, uploadTime2G_sec/60);
fprintf('  3G (%.0f kbps): %.0f s = %.1f min\n', bw3G_kbps, uploadTime3G_sec, uploadTime3G_sec/60);
fprintf('  4G (%d kbps): %.0f s = %.1f min\n', bw4G_kbps, uploadTime4G_sec, uploadTime4G_sec/60);
fprintf('  Weighted average: %.0f s = %.1f min\n\n', avgUploadTime_sec, avgUploadTime_sec/60);

% ─── 3. SCENARIO A: CENTRALISED TELEMEDICINE ─────────────────────────────────
fprintf('[Scenario A] Centralised: all images uploaded, manual review\n');
totalOphthHoursA   = (numPatientsAnnual * manualReviewMin) / 60;  % hours/year
availOphthHours    = numDoctors * workingDaysYear * 7;              % 7 hr/day
deficitHoursA      = max(0, totalOphthHoursA - availOphthHours);
% Backlog: fraction of year each patient must wait beyond same-day capacity
scansPerDayA       = numPatientsAnnual / workingDaysYear;
capacityPerDayA    = (availOphthHours / workingDaysYear * 60) / manualReviewMin;
backlogDaysA       = 0;
if scansPerDayA > capacityPerDayA
    backlogDaysA = (deficitHoursA * 60 / manualReviewMin) / capacityPerDayA;
end
% Annual bandwidth
bandwidthA_GB      = (numPatientsAnnual * imageSizeMB) / 1024;

fprintf('  Ophthalmologist capacity (hrs/yr): %.0f available vs %.0f required\n', ...
    availOphthHours, totalOphthHoursA);
fprintf('  Backlog: %.0f days (computed from deficit hours / daily capacity)\n', backlogDaysA);
fprintf('  Annual uplink: %.0f GB\n\n', bandwidthA_GB);

% ─── 4. SCENARIO B: EDGE-TRIAGE HYBRID ────────────────────────────────────────
fprintf('[Scenario B] Edge AI hybrid: non-referable triaged at PHC\n');
escalatedAnnual    = numPatientsAnnual * referableRate;
totalOphthHoursB   = (escalatedAnnual * aiAssistedMin) / 60;
workloadReduction  = (totalOphthHoursA - totalOphthHoursB) / totalOphthHoursA * 100;

% Turnaround: non-referable diagnosed at PHC, referable by tele-ophth
% (turnaround for referable depends on doctor availability — not computed here)
bandwidthB_GB      = (escalatedAnnual * imageSizeMB) / 1024;

fprintf('  Escalated patients/yr : %.0f (%.0f%% of cohort)\n', escalatedAnnual, referableRate*100);
fprintf('  Ophthalmologist hours needed: %.0f  (vs %.0f centralised)\n', totalOphthHoursB, totalOphthHoursA);
fprintf('  Workload reduction    : %.1f%% (COMPUTED from formula above)\n', workloadReduction);
fprintf('  Annual uplink         : %.0f GB\n', bandwidthB_GB);
fprintf('  Bandwidth saving      : %.1f%% (computed)\n\n', (1 - bandwidthB_GB/bandwidthA_GB)*100);

% ─── 5. SUMMARY ───────────────────────────────────────────────────────────────
fprintf('=================================================================\n');
fprintf('[BACK-OF-ENVELOPE SUMMARY — computed values]\n');
fprintf('=================================================================\n');
fprintf('%-35s %12s %12s\n', 'Metric', 'Centralised', 'Edge Hybrid');
fprintf('%-35s %12d %12d\n', 'Annual cohort screened', numPatientsAnnual, numPatientsAnnual);
fprintf('%-35s %12.0f %12.0f\n', 'Ophth. queue (scans/yr)', numPatientsAnnual, escalatedAnnual);
fprintf('%-35s %12.0f %12.0f\n', 'Annual uplink (GB)', bandwidthA_GB, bandwidthB_GB);
fprintf('%-35s %12s %12s\n', 'Works on 2G?', 'Partial', 'Yes (non-ref offline)');
fprintf('%-35s %12.1f %12s\n', 'Clinical backlog (days)', backlogDaysA, 'N/A (PHC-side)');
fprintf('=================================================================\n');
fprintf('\n[WARNING] These are analytical estimates, not Simulink simulation results.\n');
fprintf('[WARNING] Doctor review time (%.0f min) is UNVALIDATED for AI-assisted flow.\n', aiAssistedMin);
fprintf('[WARNING] Do NOT quote this table in presentations without these caveats.\n');
fprintf('         Use retinascan_resource_allocation.slx for validated results.\n');
