% SIMULINK_PARAMS.M
% Problem Statement: SIH26038 (MathWorks) — Simulink Resource Allocation Model
% Configuration file for retinascan_resource_allocation.slx
%
% Edit values here to reconfigure scenarios without touching the model or runner.
% All parameters are loaded by run_simulation.m before each scenario run.

%% ─── POPULATION AND DISTRICT PARAMETERS ──────────────────────────────────────
params.annual_patients      = 100000;   % PS-specified population (do NOT change)
params.working_days_year    = 250;      % working days per year
params.num_phcs             = 10;       % Primary Health Centres in district
params.working_hours_per_day = 7;       % hours per working day

% Derived: patients per day
params.patients_per_day     = params.annual_patients / params.working_days_year;
params.patients_per_hour    = params.patients_per_day / params.working_hours_per_day;
params.arrival_rate_per_sec = params.patients_per_hour / 3600;   % Poisson λ

%% ─── IMAGE ACQUISITION ────────────────────────────────────────────────────────
params.image_size_mb         = 5.0;     % high-res fundus TIFF/PNG in MB
params.acquisition_time_sec  = 45;      % camera setup + patient positioning
params.eyes_per_patient      = 2;       % both OD and OS images

%% ─── PROCESSING PIPELINE TIMES (in seconds) ──────────────────────────────────
params.preprocessing_time_sec  = 0.8;  % CLAHE + quality check (MATLAB)
params.inference_time_sec      = 2.1;  % EfficientNet + YOLO (browser/CPU)
params.heatmap_time_sec        = 0.5;  % Score-CAM overlay
params.report_time_sec         = 0.3;  % PDF generation

%% ─── PROCESSING NODES ────────────────────────────────────────────────────────
params.num_processing_nodes    = 1;    % number of parallel inference devices
params.node_queue_capacity     = 50;   % max patients in processing queue

%% ─── DOCTOR REVIEW ───────────────────────────────────────────────────────────
params.num_doctors             = 2;    % district ophthalmologists
params.doctor_review_time_sec  = 180;  % 3 min review with AI annotations (referable cases)
params.referable_rate          = 0.15; % fraction needing doctor review (Grade 2+)
params.doctor_queue_capacity   = 200;  % max cases in doctor queue

%% ─── NETWORK / CONNECTIVITY ──────────────────────────────────────────────────
% Fractions must sum to 1.0
% Scenario 1 — Good connectivity (urban/well-served)
params.scenario1.connectivity_2g_frac  = 0.05;
params.scenario1.connectivity_3g_frac  = 0.30;
params.scenario1.connectivity_4g_frac  = 0.65;
params.scenario1.offline_frac          = 0.00;
params.scenario1.label                 = 'Scenario 1: Good Connectivity';

% Scenario 2 — Poor connectivity (rural, 2G dominated)
params.scenario2.connectivity_2g_frac  = 0.60;
params.scenario2.connectivity_3g_frac  = 0.30;
params.scenario2.connectivity_4g_frac  = 0.10;
params.scenario2.offline_frac          = 0.00;
params.scenario2.label                 = 'Scenario 2: Poor Connectivity (2G dominant)';

% Scenario 3 — Intermittent connectivity (camp in field, dropouts)
params.scenario3.connectivity_2g_frac  = 0.20;
params.scenario3.connectivity_3g_frac  = 0.10;
params.scenario3.connectivity_4g_frac  = 0.10;
params.scenario3.offline_frac          = 0.60;
params.scenario3.label                 = 'Scenario 3: Intermittent (60% offline)';

% Scenario 4 — Full offline edge processing (no uploads)
params.scenario4.connectivity_2g_frac  = 0.00;
params.scenario4.connectivity_3g_frac  = 0.00;
params.scenario4.connectivity_4g_frac  = 0.00;
params.scenario4.offline_frac          = 1.00;
params.scenario4.label                 = 'Scenario 4: Full Offline Edge Processing';

%% ─── NETWORK SPEEDS ──────────────────────────────────────────────────────────
params.bandwidth_2g_kbps    = 64;     % 2G EDGE
params.bandwidth_3g_kbps    = 384;    % 3G HSPA
params.bandwidth_4g_kbps    = 2048;   % 4G LTE (conservative rural estimate)

%% ─── MULTI-NODE SCALING EXPERIMENT ──────────────────────────────────────────
params.scaling_nodes        = [1, 2, 4];  % processing nodes to compare

%% ─── SIMULATION TIME ─────────────────────────────────────────────────────────
% Simulate one full working day (in seconds)
params.sim_duration_sec     = params.working_hours_per_day * 3600;   % 25200 s

fprintf('[simulink_params] Parameters loaded. Annual cohort: %d | PHCs: %d | Sim duration: %d s\\n', ...
    params.annual_patients, params.num_phcs, params.sim_duration_sec);
