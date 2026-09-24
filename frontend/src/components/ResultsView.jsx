// ResultsView.jsx — Displays clinical AI-generated DR classification results for single-eye and dual-eye scans.
// Restyled with clinical precision, expansive responsive layout, and authoritative ophthalmology ergonomics.

import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import VoiceGuide from './VoiceGuide';
import PDFGenerator from './PDFGenerator';
import ABDMIntegration from './ABDMIntegration';
import SplitHeatmapView from './SplitHeatmapView';
import LongitudinalChart from './LongitudinalChart';
import { savePatient, getPatientById } from '../utils/indexedDB';
import { useScreeningMode } from '../utils/screeningContext';

// Standardized clinical management timelines from A.K. Khurana (Comprehensive Ophthalmology)
const GRADE_INFO = [
    { label: 'No Diabetic Retinopathy', cls: 'grade-0', urgency: 'Routine annual screening at PHC', accent: 'border-emerald-500', bg: 'bg-emerald-50/60', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
    { label: 'Mild Diabetic Retinopathy', cls: 'grade-1', urgency: 'Annual review · Strict glycemic control', accent: 'border-amber-400', bg: 'bg-amber-50/60', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-900 border-amber-300' },
    { label: 'Moderate Diabetic Retinopathy', cls: 'grade-2', urgency: 'Referral to ophthalmologist within 6 months', accent: 'border-orange-500', bg: 'bg-orange-50/60', text: 'text-orange-900', badge: 'bg-orange-100 text-orange-900 border-orange-300' },
    { label: 'Severe Diabetic Retinopathy', cls: 'grade-3', urgency: 'Urgent referral within 3 months (high risk of PDR)', accent: 'border-red-500', bg: 'bg-red-50/60', text: 'text-red-900', badge: 'bg-red-100 text-red-900 border-red-300' },
    { label: 'Proliferative Diabetic Retinopathy', cls: 'grade-4', urgency: '🚨 Emergency referral for PRP Laser / Anti-VEGF', accent: 'border-rose-600', bg: 'bg-rose-50/70', text: 'text-rose-900', badge: 'bg-rose-100 text-rose-900 border-rose-300' },
];

const GRADE_TEXT_COLORS = ['text-emerald-700', 'text-amber-700', 'text-orange-700', 'text-red-700', 'text-rose-700'];

/**
 * Interactive YOLO lesion bounding box overlay component for EyeResultCard.
 */
function YoloInteractiveOverlay({ imageUrl, yolo, label }) {
    const [showLabels, setShowLabels] = useState(true);
    const detections = yolo?.detections || [];
    const imgW = yolo?.image_shape?.[1] || 1024;
    const imgH = yolo?.image_shape?.[0] || 1024;

    const COLORS = {
        0: { border: 'border-red-500', bg: 'bg-red-600', text: 'text-red-300' },
        1: { border: 'border-amber-400', bg: 'bg-amber-600', text: 'text-amber-200' },
        2: { border: 'border-cyan-400', bg: 'bg-cyan-600', text: 'text-cyan-200' },
    };

    return (
        <div className="relative w-full h-full flex items-center justify-center bg-slate-950 overflow-hidden">
            <img src={imageUrl} alt={label} className="w-full h-full object-contain pointer-events-none" />

            {/* Bounding box layer */}
            <div className="absolute inset-0 pointer-events-none">
                {detections.map((det, idx) => {
                    const [x1, y1, x2, y2] = det.bbox;
                    const style = COLORS[det.class_id] || COLORS[0];
                    return (
                        <div
                            key={idx}
                            className={`absolute border-2 ${style.border} rounded-sm shadow-sm`}
                            style={{
                                left: `${(x1 / imgW) * 100}%`,
                                top: `${(y1 / imgH) * 100}%`,
                                width: `${Math.max(2, ((x2 - x1) / imgW) * 100)}%`,
                                height: `${Math.max(2, ((y2 - y1) / imgH) * 100)}%`,
                            }}
                        >
                            {showLabels && (
                                <span className={`absolute -top-4 left-0 text-[9px] font-mono font-bold text-white px-1 py-0.2 rounded ${style.bg} whitespace-nowrap shadow`}>
                                    {det.class_name} {Math.round(det.confidence * 100)}%
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Bottom telemetry overlay pill */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-auto">
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-black/80 text-white border border-slate-700 backdrop-blur-sm">
                    {detections.length > 0 ? `🎯 ${detections.length} Lesions Identified` : '✓ Clear Retina (0 Lesions)'}
                </span>
                {detections.length > 0 && (
                    <button
                        onClick={() => setShowLabels(s => !s)}
                        className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-lg bg-rs-primary hover:bg-rs-navy-800 text-white border border-white/20 transition-all shadow-sm"
                    >
                        {showLabels ? 'Hide Labels' : 'Show Labels'}
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * Renders a card for one eye's AI inference result.
 */
function EyeResultCard({ label, data }) {
    const [viewMode, setViewMode] = useState('raw'); // 'raw' | 'cam' | 'split' | 'yolo'
    const hasCam = !!(data?.raw_heatmap_url || data?.heatmap_url);
    const yoloData = data?.yolo || data?.yoloDetections;
    const hasYolo = !!yoloData;
    // Show "Grad-CAM" only when the backend confirms it computed a real gradient CAM.
    // Otherwise label it "Saliency (heuristic)" — CLAHE+BG-sub+YOLO foci method.
    const heatmapMethod = data?.heatmap_method || 'heuristic_saliency';
    const camTabLabel = heatmapMethod === 'grad_cam' ? 'Grad-CAM' : 'Saliency (heuristic)';

    return (
        <div className="bg-white rounded-2xl border border-rs-border p-5 shadow-rs-sm space-y-4">
            <div className="flex justify-between items-center border-b border-rs-border pb-3">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rs-primary"></span>
                    <h3 className="font-semibold text-xs text-rs-deep-navy font-display">{label}</h3>
                </div>
                <div className="flex items-center gap-2">
                    {hasYolo && (yoloData.count > 0 || yoloData.detections?.length > 0) && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            {yoloData.count || yoloData.detections?.length} Lesions
                        </span>
                    )}
                    <span className={`grade-pill grade-${data.grade}`}>Grade {data.grade}</span>
                </div>
            </div>

            {/* Visualizer view */}
            <div className="space-y-3">
                {viewMode === 'split' && hasCam ? (
                    <div className="w-full">
                        <SplitHeatmapView originalUrl={data.image_url} heatmapUrl={data.raw_heatmap_url || data.heatmap_url} />
                    </div>
                ) : (
                    <div className="relative aspect-square max-h-80 w-full mx-auto bg-slate-950 rounded-xl overflow-hidden border border-rs-border flex items-center justify-center">
                        {viewMode === 'raw' && (
                            <img src={data.image_url} alt={label} className="w-full h-full object-contain" />
                        )}
                        {viewMode === 'cam' && (
                            <img src={data.raw_heatmap_url || data.heatmap_url || data.image_url} alt={`${label} Saliency`} className="w-full h-full object-contain" />
                        )}
                        {viewMode === 'yolo' && (
                            <YoloInteractiveOverlay imageUrl={data.image_url} yolo={yoloData} label={label} />
                        )}
                    </div>
                )}

                {/* View toggles */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-rs-ice rounded-lg border border-rs-border text-xs">
                    <button
                        onClick={() => setViewMode('raw')}
                        className={`px-3 py-1 rounded font-medium transition-all ${viewMode === 'raw' ? 'bg-rs-primary text-white shadow-rs-xs' : 'text-rs-muted hover:text-rs-deep-navy'}`}
                    >
                        Original
                    </button>
                    {hasCam && (
                        <button
                            onClick={() => setViewMode('cam')}
                            className={`px-3 py-1 rounded font-medium transition-all ${viewMode === 'cam' ? 'bg-rs-primary text-white shadow-rs-xs' : 'text-rs-muted hover:text-rs-deep-navy'}`}
                        >
                            {camTabLabel}
                        </button>
                    )}
                    {hasCam && (
                        <button
                            onClick={() => setViewMode('split')}
                            className={`px-3 py-1 rounded font-medium transition-all ${viewMode === 'split' ? 'bg-rs-primary text-white shadow-rs-xs' : 'text-rs-muted hover:text-rs-deep-navy'}`}
                        >
                            Split Slider
                        </button>
                    )}
                    {hasYolo && (
                        <button
                            onClick={() => setViewMode('yolo')}
                            className={`px-3 py-1 rounded font-medium transition-all ${viewMode === 'yolo' ? 'bg-rs-primary text-white shadow-rs-xs' : 'text-rs-muted hover:text-rs-deep-navy'}`}
                        >
                            YOLO Lesions
                        </button>
                    )}
                </div>
            </div>
            
            <div className="flex items-baseline justify-between pt-1">
                <div>
                    <span className="text-xs text-rs-muted font-normal block">Diagnosis</span>
                    <p className="text-sm font-semibold text-rs-deep-navy mt-0.5">{data.diagnosis}</p>
                </div>
                <div className="text-right">
                    <span className="text-xs text-rs-muted font-normal block">Confidence</span>
                    <p className="text-xl font-semibold font-mono text-rs-deep-navy mt-0.5">
                        {(data.confidence * 100).toFixed(1)}%
                    </p>
                </div>
            </div>
        </div>
    );
}

/**
 * Displays a horizontal bar chart of model-output class probabilities (Grade 0–4).
 */
function GradeProbChart({ probs }) {
    const LBL  = ['Grade 0 (No DR)', 'Grade 1 (Mild)', 'Grade 2 (Moderate)', 'Grade 3 (Severe)', 'Grade 4 (Proliferative)'];
    const BARS = ['bg-emerald-500', 'bg-amber-400', 'bg-orange-500', 'bg-red-500', 'bg-rose-600'];
    const TXTS = ['text-emerald-700', 'text-amber-700', 'text-orange-700', 'text-red-700', 'text-rose-700'];
    const best = probs.indexOf(Math.max(...probs));
    
    return (
        <div className="bg-white rounded-2xl border border-rs-border p-5 sm:p-6 shadow-rs-sm space-y-4">
            <div className="flex items-center justify-between border-b border-rs-border pb-3">
                <h4 className="text-xs font-semibold text-rs-deep-navy font-display uppercase tracking-wider">
                    Neural Grade Probability Distribution
                </h4>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono text-rs-primary bg-rs-ice border border-rs-border">
                    Softmax
                </span>
            </div>
            
            <div className="space-y-3 pt-1">
                {probs.map((prob, i) => (
                    <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className={i === best ? `${TXTS[i]} font-semibold` : 'text-rs-muted font-normal'}>
                                {i === best ? '● ' : ''}{LBL[i]}
                            </span>
                            <span className="font-mono text-rs-deep-navy font-medium text-xs">
                                {(prob * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="h-2 bg-rs-ice rounded-full overflow-hidden border border-rs-border">
                            <div
                                className={`h-full rounded-full ${BARS[i]} ${i !== best ? 'opacity-30' : 'opacity-100'}`}
                                style={{ width: `${(prob * 100).toFixed(1)}%`, transition: 'width 0.8s ease-out' }}
                            />
                        </div>
                    </div>
                ))}
            </div>
            
            {Math.max(...probs) < 0.70 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-2.5 text-xs text-amber-800">
                    <span>⚠️</span>
                    <span>Classification margin is narrow (&lt;70%). Clinical correlation advised.</span>
                </div>
            )}
        </div>
    );
}

function RiskProbabilityMeter({ riskScore, mode }) {
    const pct = Math.min(100, Math.max(0, riskScore || 0));
    const threshold = mode === 'preventative' ? 35 : 50;
    const isFlagged = pct > threshold;

    return (
        <div className="bg-white rounded-2xl border border-rs-border p-5 sm:p-6 shadow-rs-sm space-y-4">
            <div className="flex justify-between items-center border-b border-rs-border pb-3">
                <h4 className="text-xs font-semibold text-rs-deep-navy font-display uppercase tracking-wider">
                    Clinical Referral Threshold Meter
                </h4>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${isFlagged ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                    {isFlagged ? 'Flagged for Referral' : 'Normal Range'}
                </span>
            </div>

            <div className="space-y-2 pt-1">
                <div className="flex justify-between text-xs">
                    <span className="text-rs-muted">Composite risk score</span>
                    <span className="font-mono text-rs-deep-navy font-semibold text-sm">{pct} / 100</span>
                </div>
                <div className="h-3 bg-rs-ice rounded-full overflow-hidden relative border border-rs-border">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ 
                            width: `${pct}%`,
                            background: pct > 75 ? '#dc2626' : pct > 50 ? '#ea580c' : pct > 35 ? '#d97706' : '#16a34a' 
                        }} 
                    />
                    <div
                        className="absolute top-0 h-full border-l-2 border-slate-700/60"
                        style={{ left: `${threshold}%` }}
                        title={`Referral threshold: ${threshold}`}
                    />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-rs-muted pt-0.5">
                    <span>0 (Lowest)</span>
                    <span>Triage threshold: {threshold}</span>
                    <span>100 (Critical)</span>
                </div>
            </div>

            <p className="text-xs text-rs-muted font-normal leading-relaxed">
                Mode: <strong className="text-rs-deep-navy font-medium capitalize">{mode || 'Standard'}</strong>. {mode === 'preventative' ? 'Sensitive threshold (35) flags early Grade 1 changes.' : 'Standard threshold (50) flags referable Grade 2+ changes.'}
            </p>
        </div>
    );
}

/**
 * Clinician Validation Card (ETDRS & ICDR Protocol)
 */
function ClinicianValidationCard({ rightArbitration, leftArbitration, rightYolo, leftYolo }) {
    const countClass = (yolo, keyword) =>
        yolo?.detections?.filter(d => d.class_name?.includes(keyword)).length ?? null;

    const hasRight = !!(rightArbitration || rightYolo);
    const hasLeft  = !!(leftArbitration  || leftYolo);

    const od = hasRight ? {
        ma: rightArbitration?.lesion_summary?.microaneurysms ?? countClass(rightYolo, 'Microaneurysms') ?? 0,
        hm: rightArbitration?.lesion_summary?.hemorrhages    ?? countClass(rightYolo, 'Hemorrhages')    ?? 0,
        ex: rightArbitration?.lesion_summary?.hard_exudates  ?? countClass(rightYolo, 'Exudates')       ?? 0,
        dme: rightArbitration?.has_macular_edema ?? false,
        rule: rightArbitration?.clinical_rule_applied || null,
    } : null;

    const os = hasLeft ? {
        ma: leftArbitration?.lesion_summary?.microaneurysms  ?? countClass(leftYolo, 'Microaneurysms')  ?? 0,
        hm: leftArbitration?.lesion_summary?.hemorrhages     ?? countClass(leftYolo, 'Hemorrhages')     ?? 0,
        ex: leftArbitration?.lesion_summary?.hard_exudates   ?? countClass(leftYolo, 'Exudates')        ?? 0,
        dme: leftArbitration?.has_macular_edema ?? false,
        rule: leftArbitration?.clinical_rule_applied || null,
    } : null;

    const combined = {
        ma: (od?.ma ?? 0) + (os?.ma ?? 0),
        hm: (od?.hm ?? 0) + (os?.hm ?? 0),
        ex: (od?.ex ?? 0) + (os?.ex ?? 0),
        dme: (od?.dme || os?.dme),
    };

    const rule = od?.rule || os?.rule || 'ICDR Clinical Consensus';
    const dualEye = hasRight && hasLeft;

    return (
        <div className="bg-white rounded-2xl border border-rs-border p-5 sm:p-6 shadow-rs-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rs-border pb-3">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rs-primary"></span>
                    <h3 className="text-xs font-semibold text-rs-deep-navy font-display uppercase tracking-wider">
                        ICDR / ETDRS Clinical Validation Parameters
                    </h3>
                </div>
                <span className="text-xs font-mono text-rs-primary bg-rs-ice px-2.5 py-0.5 rounded border border-rs-border">
                    {rule}
                </span>
            </div>

            {/* Per-eye counts */}
            <div className={`grid gap-4 ${dualEye ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {/* Right Eye */}
                {hasRight && (
                    <div className="p-4 rounded-xl bg-rs-ice/60 border border-rs-border space-y-2.5">
                        <p className="text-xs font-semibold text-rs-deep-navy font-display">Right Eye (OD) Lesions</p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                                ['Microaneurysms', od.ma],
                                ['Hemorrhages', od.hm],
                                ['Hard Exudates', od.ex],
                            ].map(([lbl, val]) => (
                                <div key={lbl} className="bg-white p-2.5 rounded-lg border border-rs-border">
                                    <p className="text-[10px] text-rs-muted font-normal">{lbl}</p>
                                    <p className="text-base font-semibold font-mono text-rs-deep-navy mt-0.5">{val}</p>
                                </div>
                            ))}
                        </div>
                        {od.dme && (
                            <div className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg text-center">
                                ⚠️ Macular edema detected (OD)
                            </div>
                        )}
                    </div>
                )}

                {/* Left Eye */}
                {hasLeft && (
                    <div className="p-4 rounded-xl bg-rs-ice/60 border border-rs-border space-y-2.5">
                        <p className="text-xs font-semibold text-rs-deep-navy font-display">Left Eye (OS) Lesions</p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                                ['Microaneurysms', os.ma],
                                ['Hemorrhages', os.hm],
                                ['Hard Exudates', os.ex],
                            ].map(([lbl, val]) => (
                                <div key={lbl} className="bg-white p-2.5 rounded-lg border border-rs-border">
                                    <p className="text-[10px] text-rs-muted font-normal">{lbl}</p>
                                    <p className="text-base font-semibold font-mono text-rs-deep-navy mt-0.5">{val}</p>
                                </div>
                            ))}
                        </div>
                        {os.dme && (
                            <div className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg text-center">
                                ⚠️ Macular edema detected (OS)
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Combined Totals */}
            {dualEye && (
                <div className="pt-2 border-t border-rs-border">
                    <p className="text-xs font-medium text-rs-muted mb-2">Combined Bilateral Findings</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-center">
                        <div className="bg-rs-ice/60 p-2.5 rounded-lg border border-rs-border">
                            <span className="text-[11px] text-rs-muted">Microaneurysms</span>
                            <p className="text-base font-semibold font-mono text-rs-deep-navy">{combined.ma}</p>
                        </div>
                        <div className="bg-rs-ice/60 p-2.5 rounded-lg border border-rs-border">
                            <span className="text-[11px] text-rs-muted">Hemorrhages</span>
                            <p className="text-base font-semibold font-mono text-rs-deep-navy">{combined.hm}</p>
                        </div>
                        <div className="bg-rs-ice/60 p-2.5 rounded-lg border border-rs-border">
                            <span className="text-[11px] text-rs-muted">Hard Exudates</span>
                            <p className="text-base font-semibold font-mono text-rs-deep-navy">{combined.ex}</p>
                        </div>
                        <div className={`p-2.5 rounded-lg border ${combined.dme ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-rs-ice/60 border-rs-border text-emerald-700'}`}>
                            <span className="text-[11px] text-rs-muted block">Macular Edema</span>
                            <p className="text-sm font-semibold font-mono mt-0.5">{combined.dme ? 'Detected ⚠️' : 'None'}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Main ResultsView Component
 */
export default function ResultsView() {
    const { state } = useLocation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    
    const [record, setRecord] = useState(state?.record || null);
    const [isLoading, setIsLoading] = useState(!state?.record && searchParams.get('id'));
    const [confirmSaved, setConfirmSaved] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
    const { mode } = useScreeningMode();

    useEffect(() => {
        const id = searchParams.get('id');
        if (!record && id) {
            setIsLoading(true);
            getPatientById(id).then(data => {
                if (data) setRecord(data);
                setIsLoading(false);
            }).catch(() => setIsLoading(false));
        }
    }, [searchParams, record]);

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
                <div className="w-10 h-10 border-3 border-rs-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-normal text-rs-muted">Retrieving diagnostic data...</p>
            </div>
        );
    }

    if (!record && (!state || !state.result)) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                <div className="max-w-md w-full space-y-5 bg-white p-8 rounded-2xl border border-rs-border shadow-rs-sm">
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-2xl">
                        ⚠️
                    </div>
                    <div className="space-y-1.5">
                        <h2 className="text-xl font-semibold text-rs-deep-navy font-display">No Diagnostic Record Loaded</h2>
                        <p className="text-rs-muted text-xs leading-relaxed">
                            Please select a completed screening from Patient Records or run a new scan.
                        </p>
                    </div>
                    <button 
                        onClick={() => navigate('/scan')} 
                        className="btn-primary w-full h-11 text-sm font-medium rounded-xl"
                    >
                        Go to Scanner
                    </button>
                </div>
            </div>
        );
    }

    const activeRecord = record ? (record.rightEye ? record : (record.od_image_url ? {
        ...record,
        rightEye: {
            image_url: record.od_image_url,
            heatmap_url: record.od_heatmap_url,
            raw_heatmap_url: record.od_heatmap_url,
            grade: record.gradeOD ?? record.grade ?? 0,
            confidence: record.confidenceOD ?? record.confidence ?? 0,
            diagnosis: record.diagnosisOD ?? record.diagnosis ?? 'Unknown',
        },
        leftEye: record.os_image_url ? {
            image_url: record.os_image_url,
            heatmap_url: record.os_heatmap_url,
            raw_heatmap_url: record.os_heatmap_url,
            grade: record.gradeOS ?? record.grade ?? 0,
            confidence: record.confidenceOS ?? record.confidence ?? 0,
            diagnosis: record.diagnosisOS ?? record.diagnosis ?? 'Unknown',
        } : null
    } : record)) : null;

    const result = (activeRecord?.grade !== undefined) ? {
        grade: activeRecord.grade,
        confidence: activeRecord.confidence,
        risk_score: activeRecord.risk_score,
        risk_level: activeRecord.risk_level,
        urgency: activeRecord.urgency,
        heatmap_url: activeRecord.heatmap_url || activeRecord.rightEye?.heatmap_url,
        raw_heatmap_url: activeRecord.raw_heatmap_url || activeRecord.rightEye?.raw_heatmap_url,
        grade_label: activeRecord.rightEye?.grade_label || '',
        diagnosis: activeRecord.diagnosis,
        class_probabilities: activeRecord.rightEye?.class_probabilities || activeRecord.class_probabilities,
    } : (state?.result || null);
    
    const imagePreview = state?.imagePreview || activeRecord?.rightEye?.image_url || activeRecord?.image_url || null;
    const patientData = state?.patient || activeRecord;
    const currentGrade = result?.grade ?? 0;
    const info = GRADE_INFO[currentGrade] || GRADE_INFO[0];

    const hasRight = !!(activeRecord?.rightEye || imagePreview);
    const hasLeft  = !!(activeRecord?.leftEye);
    const isDualCaptured = hasRight && hasLeft;

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-fade-in relative pt-4">
            
            {/* Top Navigation & Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-rs-border text-rs-deep-navy hover:bg-rs-ice transition-all shadow-rs-xs"
                        title="Go back"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-rs-primary">Clinical Screening Report</span>
                            <span className="text-xs text-rs-muted font-mono">• #{activeRecord?.id?.slice(0, 8) || 'RS-NEW'}</span>
                        </div>
                        <h1 className="text-2xl font-semibold text-rs-deep-navy font-display tracking-tight">
                            Diagnostic Assessment
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <div className="bg-white px-3.5 py-1.5 rounded-xl border border-rs-border text-xs flex items-center gap-2 shadow-rs-xs">
                        <span className="text-rs-muted font-normal">Patient:</span>
                        <span className="font-semibold text-rs-deep-navy">{patientData?.name || 'Screening Patient'}</span>
                        {patientData?.age && <span className="font-mono text-rs-muted">({patientData.age}y)</span>}
                    </div>
                </div>
            </div>

            {/* Image Quality Alerts */}
            {(() => {
                const alerts = [
                    ...(activeRecord?.rightEye?.quality_warnings || []),
                    ...(activeRecord?.leftEye?.quality_warnings || []),
                    ...(result?.quality_warnings || [])
                ];
                if (alerts.length === 0) return null;
                return (
                    <div className="bg-amber-50 border-2 border-amber-400 p-5 rounded-2xl shadow-sm space-y-2 animate-fade-in">
                        <div className="flex items-start gap-3">
                            <span className="text-2xl shrink-0">⚠️</span>
                            <div className="flex-1">
                                <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide">
                                    Diagnostic Quality Notice — Low Sharpness or Blur Detected
                                </h3>
                                <ul className="text-xs text-amber-800 list-disc list-inside mt-1 space-y-1">
                                    {alerts.map((w, idx) => (
                                        <li key={idx} className="font-medium">{w}</li>
                                    ))}
                                </ul>
                                <p className="text-[11px] text-amber-700/90 mt-2 font-medium italic">
                                    💡 Protocol: Automated preprocessing was applied, but results should be confirmed with clinical caution. If possible, adjust camera diopter/illumination and recapture.
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ═══ ASSESSMENT HERO CARD ═══ */}
            <div className={`rounded-2xl border ${info.accent} ${info.bg} p-6 sm:p-7 shadow-rs-sm`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-black/5 pb-5">
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-rs-muted uppercase tracking-wider block">
                            Validated Diagnosis (Worst Eye)
                        </span>
                        <h2 className="text-2xl sm:text-3xl font-semibold text-rs-deep-navy font-display tracking-tight">
                            {info.label}
                        </h2>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <div className={`px-4 py-2 rounded-xl border font-mono font-semibold text-base ${info.badge}`}>
                            Grade {currentGrade}
                        </div>
                        <div className="bg-white px-3 py-2 rounded-xl border border-rs-border text-center">
                            <span className="text-[10px] text-rs-muted uppercase tracking-wider block">Risk Level</span>
                            <span className="font-mono text-xs font-semibold text-rs-deep-navy">{activeRecord?.risk_level || 'LOW'}</span>
                        </div>
                    </div>
                </div>

                {/* Key clinical metadata metrics row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-4">
                    <div className="bg-white/90 rounded-xl p-3.5 border border-black/5">
                        <span className="text-[11px] font-normal text-rs-muted block">Clinical Action Protocol</span>
                        <p className="text-xs font-medium text-rs-deep-navy mt-1 leading-snug">
                            {mode === 'preventative' && currentGrade >= 1
                                ? '⚡ Preventative Mode: Early referral recommended'
                                : info.urgency}
                        </p>
                    </div>
                    <div className="bg-white/90 rounded-xl p-3.5 border border-black/5">
                        <span className="text-[11px] font-normal text-rs-muted block">AI Model Confidence</span>
                        <p className="text-sm font-semibold font-mono text-rs-primary mt-1">
                            {Math.round((result?.confidence || 0) * 100)}% Match
                        </p>
                    </div>
                    <div className="bg-white/90 rounded-xl p-3.5 border border-black/5">
                        <span className="text-[11px] font-normal text-rs-muted block">Screening Protocol</span>
                        <p className="text-xs font-mono font-medium text-rs-deep-navy mt-1">
                            {isDualCaptured ? 'Bilateral (OD + OS)' : 'Monocular (OD Capture)'}
                        </p>
                    </div>
                </div>
            </div>

            {/* ═══ EYE SCANS PRESENTATION ═══ */}
            <div>
                {isDualCaptured ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <EyeResultCard label="Right Eye (OD)" data={activeRecord.rightEye} />
                        <EyeResultCard label="Left Eye (OS)" data={activeRecord.leftEye} />
                    </div>
                ) : (
                    /* Clean single eye view when only one eye was captured */
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                        <div className="lg:col-span-6">
                            <EyeResultCard 
                                label="Captured Eye (Right - OD)" 
                                data={activeRecord?.rightEye || {
                                    image_url: imagePreview,
                                    heatmap_url: result?.heatmap_url,
                                    raw_heatmap_url: result?.raw_heatmap_url,
                                    grade: currentGrade,
                                    confidence: result?.confidence || 0.9,
                                    diagnosis: result?.diagnosis || info.label
                                }} 
                            />
                        </div>
                        <div className="lg:col-span-6 space-y-4">
                            <div className="bg-white rounded-2xl border border-rs-border p-5 shadow-rs-sm space-y-3">
                                <div className="flex items-center justify-between border-b border-rs-border pb-2.5">
                                    <h4 className="text-xs font-semibold text-rs-deep-navy font-display uppercase tracking-wider">
                                        Clinical Protocol Notice
                                    </h4>
                                    <span className="text-[11px] font-mono text-rs-muted bg-rs-ice px-2 py-0.5 rounded border border-rs-border">
                                        OD Only
                                    </span>
                                </div>
                                <p className="text-xs text-rs-muted leading-relaxed font-normal">
                                    This diagnostic assessment was generated from a single-eye fundus photography capture. Standard ICDR protocols recommend bilateral screening whenever clinically feasible to assess systemic microvascular progression across both eyes.
                                </p>
                                <div className="p-3 bg-rs-ice rounded-xl border border-rs-border flex items-center justify-between">
                                    <span className="text-xs text-rs-deep-navy font-medium">Bilateral Assessment Status</span>
                                    <span className="text-xs text-amber-700 font-medium">OS Scan Omitted</span>
                                </div>
                            </div>

                            {/* Micro-Lesion Mapping Quick Action */}
                            <button
                                onClick={() => navigate('/yolo-results', { state: activeRecord ? { record: activeRecord } : state })}
                                className="w-full bg-white hover:bg-rs-ice/80 border border-rs-border rounded-2xl p-4 text-left transition-all shadow-rs-sm flex items-center justify-between group"
                            >
                                <div>
                                    <span className="text-[11px] font-mono text-rs-primary font-medium block">Spatial Telemetry</span>
                                    <h5 className="text-sm font-semibold text-rs-deep-navy font-display mt-0.5">Explore Micro-Lesion Bounding Boxes →</h5>
                                    <p className="text-xs text-rs-muted font-normal mt-0.5">Open interactive YOLOv8 lesion mapping for microaneurysms and exudates.</p>
                                </div>
                                <span className="text-2xl group-hover:scale-110 transition-transform">🗺️</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ DETAILED MICRO-LESION MAPPING ACTION BANNER (YOLOv8) ═══ */}
            <div className="bg-gradient-to-r from-rs-navy-800 to-rs-primary rounded-2xl p-6 text-white shadow-rs-md flex flex-col md:flex-row items-start md:items-center justify-between gap-5 border border-rs-bright/20">
                <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-white text-[10px] font-mono font-bold uppercase tracking-wider border border-white/20">
                            Spatial Telemetry
                        </span>
                        <span className="text-xs text-rs-cyan font-mono font-medium">YOLOv8 Deep Feature Detection</span>
                    </div>
                    <h3 className="text-xl font-bold font-display text-white tracking-tight">
                        Detailed Micro-Lesion Spatial Mapping & Diagnostics
                    </h3>
                    <p className="text-xs text-white/80 font-normal leading-relaxed">
                        Inspect individual microaneurysms, flame hemorrhages, and hard exudates with pixel-accurate coordinates, confidence scores, and quadrant distribution.
                    </p>
                </div>
                <button
                    onClick={() => navigate('/yolo-results', { state: activeRecord ? { record: activeRecord } : state })}
                    className="shrink-0 bg-white hover:bg-rs-ice text-rs-deep-navy font-semibold px-5 py-3 rounded-xl transition-all shadow-rs-sm flex items-center gap-2 group text-xs font-mono border border-white/40"
                >
                    <span>Launch Detailed YOLO Inspector</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                </button>
            </div>

            {/* ═══ CLINICAL VALIDATION CHAIN (ETDRS) ═══ */}
            <ClinicianValidationCard
                rightArbitration={activeRecord?.rightEye?.arbitration || activeRecord?.arbitration}
                leftArbitration={activeRecord?.leftEye?.arbitration || null}
                rightYolo={activeRecord?.rightEye?.yolo || activeRecord?.yolo}
                leftYolo={activeRecord?.leftEye?.yolo || null}
            />

            {/* ═══ PROBABILITY DISTRIBUTIONS & RISK METER ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {(activeRecord?.rightEye?.class_probabilities?.length > 0 || result?.class_probabilities?.length > 0) && (
                    <GradeProbChart probs={activeRecord?.rightEye?.class_probabilities || result.class_probabilities} />
                )}
                <RiskProbabilityMeter riskScore={result?.risk_score} mode={mode} />
            </div>

            {/* Longitudinal Chart if contact available */}
            {(patientData?.contact || activeRecord?.contact) && (
                <div className="bg-white rounded-2xl border border-rs-border p-5 sm:p-6 shadow-rs-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-rs-border pb-3">
                        <h4 className="text-xs font-semibold text-rs-deep-navy font-display uppercase tracking-wider">
                            Patient Longitudinal Screening Progression
                        </h4>
                        <span className="text-xs font-mono text-rs-primary">Historical Tracker</span>
                    </div>
                    <LongitudinalChart contact={patientData?.contact || activeRecord?.contact} />
                </div>
            )}

            {/* ═══ ACTION & TELEMETRY PANEL ═══ */}
            <div className="bg-white rounded-2xl border border-rs-border p-5 sm:p-6 shadow-rs-sm space-y-5">
                <div className="flex items-center justify-between border-b border-rs-border pb-3">
                    <div>
                        <h3 className="text-sm font-semibold text-rs-deep-navy font-display">
                            Clinical Actions & Consultation Export
                        </h3>
                        <p className="text-xs text-rs-muted font-normal mt-0.5">Generate verified medical reports and patient referrals</p>
                    </div>
                    <span className="text-xs font-mono text-rs-primary bg-rs-ice px-2.5 py-1 rounded-md border border-rs-border">
                        Digital Health Protocol
                    </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    {/* Left 6 cols: Voice Guide */}
                    <div className="lg:col-span-6 flex flex-col">
                        <VoiceGuide 
                            patient={patientData} 
                            result={result} 
                            language={selectedLanguage} 
                            onLanguageChange={setSelectedLanguage} 
                        />
                    </div>

                    {/* Right 6 cols: Action Buttons */}
                    <div className="lg:col-span-6 flex flex-col gap-3 justify-center">
                        <PDFGenerator 
                            patient={{ ...activeRecord, ...patientData }} 
                            result={result} 
                            imagePreview={imagePreview} 
                            record={activeRecord} 
                            language={selectedLanguage} 
                        />

                        <button
                            onClick={() => {
                                const pName = patientData?.name || activeRecord?.name || 'Patient';
                                const g = activeRecord?.grade ?? result?.grade ?? 0;
                                const risk = activeRecord?.risk_level ?? result?.risk_level ?? 'LOW';
                                const conf = Math.round((activeRecord?.confidence ?? result?.confidence ?? 0) * 100);
                                
                                const msg = encodeURIComponent(
                                    `🏥 *RetiScan AI Clinical Report Summary*\n` +
                                    `━━━━━━━━━━━━━━━━━━━━\n` +
                                    `👤 *Patient:* ${pName}\n` +
                                    `👁 *Diagnosis:* ${GRADE_INFO[g]?.label}\n` +
                                    `📊 *Confidence:* ${conf}%\n` +
                                    `🚨 *Risk Level:* ${risk}\n` +
                                    `🏥 *Recommendation:* ${GRADE_INFO[g]?.urgency}\n` +
                                    `━━━━━━━━━━━━━━━━━━━━\n` +
                                    `_Automated point-of-care screening. Consult a certified ophthalmologist for treatment._`
                                );
                                window.open(`https://wa.me/?text=${msg}`, '_blank');
                            }}
                            className="w-full btn bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-300 text-emerald-800 text-xs font-medium py-3 rounded-xl transition-all shadow-rs-xs flex items-center justify-start px-4 gap-3 cursor-pointer"
                        >
                            <span className="text-xl">💬</span>
                            <div className="text-left">
                                <p className="font-semibold text-xs leading-tight">Share Summary via WhatsApp</p>
                                <p className="text-[11px] text-emerald-700/80 font-normal mt-0.5">Send formatted clinical report directly to patient</p>
                            </div>
                        </button>

                        <ABDMIntegration 
                            reportId={result?.report_id || `RS-${Date.now()}`} 
                            patientId={patientData?.patientId || patientData?.id || activeRecord?.patient_id || activeRecord?.id}
                            patientName={patientData?.name || activeRecord?.name} 
                            onLinked={(linkedAbha) => {
                                if (activeRecord) {
                                    activeRecord.abhaId = linkedAbha;
                                    activeRecord.abha_id = linkedAbha;
                                }
                                if (patientData) {
                                    patientData.abhaId = linkedAbha;
                                    patientData.abha_id = linkedAbha;
                                }
                                setRecord(prev => prev ? { ...prev, abhaId: linkedAbha, abha_id: linkedAbha } : prev);
                            }}
                        />

                        <button
                            onClick={async () => {
                                if (confirmSaved) { navigate('/camp'); return; }
                                try {
                                    const pId = patientData?.id || activeRecord?.id;
                                    if (pId) {
                                        await savePatient({ ...activeRecord, ...patientData, id: pId });
                                        setConfirmSaved(true);
                                    } else {
                                        const p = patientData || {};
                                        const p_id = p.patientId || `TN-${Date.now()}`;
                                        await savePatient({
                                            ...p,
                                            id: p_id,
                                            grade: result?.grade,
                                            diagnosis: GRADE_INFO[result?.grade]?.label || 'Unknown',
                                            confidence: result?.confidence,
                                            risk_level: result?.risk_level || 'LOW',
                                            timestamp: new Date().toISOString(),
                                        });
                                        setConfirmSaved(true);
                                    }
                                } catch (e) { console.error('Save failed', e); }
                            }}
                            className={`w-full btn py-3 px-4 rounded-xl text-xs font-medium transition-all shadow-rs-xs flex items-center justify-start gap-3 cursor-pointer border ${
                                confirmSaved 
                                    ? 'bg-blue-50 border-blue-300 text-rs-primary' 
                                    : 'bg-rs-ice border-rs-border text-rs-deep-navy hover:bg-white'
                            }`}
                        >
                            <span className="text-xl">{confirmSaved ? '📑' : '💾'}</span>
                            <div className="text-left">
                                <p className="font-semibold text-xs leading-tight">
                                    {confirmSaved ? 'Saved to Registry (Go to Records)' : 'Archive to Patient Registry'}
                                </p>
                                <p className="text-[11px] text-rs-muted font-normal mt-0.5">
                                    {confirmSaved ? 'Click to open Camp Patient Records' : 'Save findings to offline encrypted IndexedDB'}
                                </p>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
