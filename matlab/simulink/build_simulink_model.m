% BUILD_SIMULINK_MODEL.M
% Problem Statement: SIH26038 (MathWorks) — Simulink Model Builder
%
% Programmatically creates retinascan_resource_allocation.slx using
% MATLAB/Simulink API calls (new_system, add_block, set_param, add_line).
%
% Run this script ONCE to generate the .slx file.
% Subsequent runs via run_simulation.m load the existing model and
% update parameters without rebuilding from scratch.
%
% Requires: Simulink (with base licence)
%
% Usage:
%   cd('d:/sih2026/retino/matlab/simulink')
%   build_simulink_model   % creates retinascan_resource_allocation.slx

clc;
fprintf('=================================================================\\n');
fprintf(' Building Simulink Model: retinascan_resource_allocation.slx\\n');
fprintf(' SIH26038 (MathWorks) — Resource Allocation / Telemedicine Model\\n');
fprintf('=================================================================\\n\\n');

MODEL_NAME = 'retinascan_resource_allocation';
MODEL_FILE = [MODEL_NAME '.slx'];

% Close existing model if open
if bdIsLoaded(MODEL_NAME)
    close_system(MODEL_NAME, 0);
    fprintf('[Builder] Closed existing model instance.\\n');
end

% Create new Simulink system
new_system(MODEL_NAME);
open_system(MODEL_NAME);
fprintf('[Builder] New Simulink system created: %s\\n', MODEL_NAME);

% ─── Set model-level configuration ────────────────────────────────────────
set_param(MODEL_NAME, ...
    'Solver',       'ode45', ...
    'StopTime',     'params.sim_duration_sec', ...
    'SolverType',   'Variable-step', ...
    'MaxStep',      '1', ...
    'RelTol',       '1e-3');

%% ─── BLOCK LAYOUT (x,y positions) ────────────────────────────────────────────
% Each stage is an enabled subsystem or library block.
% Y positions are staggered for readable layout.

X_START  = 50;
X_STEP   = 200;
Y_CENTER = 300;
W_BLOCK  = 120;
H_BLOCK  = 60;

stages = {
    'Patient_Arrival',       'Poisson patient generator (stochastic arrivals)';
    'Image_Acquisition',     'Camera capture + patient positioning (45 s avg)';
    'Quality_Assessment',    'MATLAB-side IQA — blur, illumination, FOV check';
    'AI_Processing',         'EfficientNet grading + YOLO detection (2.1 s avg)';
    'Network_Transmission',  'Conditional upload — 2G/3G/4G/offline routing';
    'Doctor_Review',         'Ophthalmologist queue — referable cases only (15%)';
    'Report_Generation',     'PDF + WhatsApp output — end of pipeline';
};

numStages = size(stages, 1);
xPos = X_START;

% ─── Add blocks ───────────────────────────────────────────────────────────
blockHandles = zeros(numStages, 1);

for s = 1:numStages
    blockName = [MODEL_NAME '/' stages{s,1}];
    pos = [xPos, Y_CENTER - H_BLOCK/2, xPos + W_BLOCK, Y_CENTER + H_BLOCK/2];

    try
        if s == 1
            % Stage 1: Poisson arrival — use Pulse Generator as discrete arrival model
            add_block('simulink/Sources/Pulse Generator', blockName, ...
                'Position', pos, ...
                'Period',   '1/params.arrival_rate_per_sec', ...
                'PulseWidth', '10', ...
                'Amplitude', '1');
        elseif s == numStages
            % Last stage: To Workspace (capture output for analysis)
            add_block('simulink/Sinks/To Workspace', blockName, ...
                'Position', pos, ...
                'VariableName', 'simOutput', ...
                'MaxDataPoints', 'inf', ...
                'SaveFormat', 'Array');
        else
            % Intermediate stages: Gain blocks (representing service times)
            % Each gain = processing delay in seconds for that stage
            serviceTimeMap = [45, 0.8, 2.1, 0.0, 180, 0.3];  % seconds per stage (s>1)
            if s <= numel(serviceTimeMap) + 1
                svcTime = serviceTimeMap(s - 1);
            else
                svcTime = 1.0;
            end
            add_block('simulink/Math Operations/Gain', blockName, ...
                'Position', pos, ...
                'Gain', num2str(svcTime));
        end
        blockHandles(s) = get_param(blockName, 'Handle');
        fprintf('[Builder] Added block [%d/%d]: %s\\n', s, numStages, stages{s,1});
    catch ex
        fprintf('[Builder] Warning — could not add block %s: %s\\n', stages{s,1}, ex.message);
    end

    xPos = xPos + X_STEP;
end

% ─── Connect blocks sequentially ──────────────────────────────────────────
for s = 1:(numStages - 1)
    src  = [MODEL_NAME '/' stages{s,  1}];
    dst  = [MODEL_NAME '/' stages{s+1,1}];
    try
        add_line(MODEL_NAME, [stages{s,1}   '/1'], [stages{s+1,1} '/1'], 'autorouting', 'on');
        fprintf('[Builder] Connected: %s → %s\\n', stages{s,1}, stages{s+1,1});
    catch ex
        fprintf('[Builder] Warning — could not connect %s → %s: %s\\n', src, dst, ex.message);
    end
end

% ─── Add annotation blocks with stage descriptions ────────────────────────
xPos = X_START;
for s = 1:numStages
    yAnnot = Y_CENTER + H_BLOCK/2 + 25;
    pos    = [xPos, yAnnot, xPos + W_BLOCK, yAnnot + 30];
    try
        note = add_block('built-in/Note', [MODEL_NAME '/Note_' stages{s,1}], ...
            'Position', pos, ...
            'Text', stages{s,2});
        fprintf('[Builder] Annotation added for: %s\\n', stages{s,1});
    catch
        % Annotations optional — don't fail model build
    end
    xPos = xPos + X_STEP;
end

% ─── Save model ───────────────────────────────────────────────────────────
try
    save_system(MODEL_NAME, MODEL_FILE);
    fprintf('\\n[Builder] Model saved: %s\\n', MODEL_FILE);
    fprintf('[Builder] SUCCESS — retinascan_resource_allocation.slx created.\\n');
catch ex
    fprintf('[Builder] ERROR saving model: %s\\n', ex.message);
    fprintf('[Builder] You can try: save_system(''%s'')\\n', MODEL_NAME);
end

fprintf('\\n[Builder] To run the full simulation: run_simulation\\n');
fprintf('[Builder] To view model: open_system(''%s'')\\n', MODEL_NAME);
