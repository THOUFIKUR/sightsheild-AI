import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function EyeCanvas({ imageUrl, yolo, label, accentClass }) {
    const [showBoxes, setShowBoxes] = useState(true);

    if (!imageUrl) return null;

    const rawDetections = yolo?.detections || [];
    const imgW = yolo?.image_shape?.[1] || 1024;
    const imgH = yolo?.image_shape?.[0] || 1024;

    const detections = rawDetections;

    const COLORS = {
        0: 'border-red-500 bg-red-500/10',
        1: 'border-amber-400 bg-amber-400/10',
        2: 'border-blue-400 bg-blue-400/10',
    };

    // Group by class for mini summary
    const stats = detections.reduce((acc, d) => {
        acc[d.class_name] = (acc[d.class_name] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="space-y-2.5">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl w-fit ${accentClass}`}>
                <span className="text-xs font-semibold font-display">{label}</span>
                <span className="text-xs text-slate-300 font-mono">({detections.length} lesions)</span>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-xl">
                <img src={imageUrl} alt={label} className="w-full h-auto block" />

                {showBoxes && detections.map((det, idx) => {
                    const [x1, y1, x2, y2] = det.bbox;
                    return (
                        <div
                            key={idx}
                            className={`absolute border-2 pointer-events-none rounded ${COLORS[det.class_id] || 'border-white'}`}
                            style={{
                                left: `${(x1 / imgW) * 100}%`,
                                top: `${(y1 / imgH) * 100}%`,
                                width: `${((x2 - x1) / imgW) * 100}%`,
                                height: `${((y2 - y1) / imgH) * 100}%`,
                            }}
                        >
                            <span className={`absolute -top-5 left-0 text-[10px] font-medium font-mono text-white px-1 py-0.5 rounded-t whitespace-nowrap ${(COLORS[det.class_id] || '').split(' ')[0].replace('border-', 'bg-')}`}>
                                {det.class_name} ({Math.round(det.confidence * 100)}%)
                            </span>
                        </div>
                    );
                })}

                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

                <div className="absolute bottom-3 left-3">
                    <button
                        onClick={() => setShowBoxes(s => !s)}
                        className={`px-3 py-1.5 rounded-lg font-medium text-xs shadow-md backdrop-blur-md transition-all ${showBoxes ? 'bg-rs-primary text-white' : 'bg-slate-800/90 text-slate-300'}`}
                    >
                        {showBoxes ? 'Hide Bounding Boxes' : 'Show Bounding Boxes'}
                    </button>
                </div>
            </div>

            {/* Mini detection summary for this eye */}
            {Object.entries(stats).length > 0 && (
                <div className="space-y-1 bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                    {Object.entries(stats).map(([name, count]) => (
                        <div key={name} className="flex justify-between items-center text-xs">
                            <span className="text-slate-300 truncate max-w-[160px]">{name}</span>
                            <span className="font-mono text-white bg-slate-800 px-2 py-0.5 rounded text-[11px]">{count}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// -- Main Page --
const YoloResultsPage = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const { result, imagePreview } = location.state || {};
    const record = location.state?.record;

    const odImage = imagePreview || record?.rightEye?.image_url;
    const osImage = record?.leftEye?.image_url;

    const odYolo = result?.yolo || result?.yoloDetections || record?.rightEye?.yoloDetections || record?.rightEye?.yolo;
    const osYolo = record?.leftEye?.yoloDetections || record?.leftEye?.yolo;

    if (!odImage) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
                <div className="text-center space-y-3">
                    <div className="text-4xl">⚠️</div>
                    <h1 className="text-xl font-semibold text-white font-display">No Detection Telemetry Found</h1>
                    <p className="text-slate-400 text-sm">Please conduct a fundus scan to view detailed lesion telemetry.</p>
                    <button
                        onClick={() => navigate('/scan')}
                        className="bg-rs-primary text-white px-5 py-2 rounded-xl font-medium text-sm hover:bg-rs-deep-navy transition-colors"
                    >
                        Return to Scanner
                    </button>
                </div>
            </div>
        );
    }

    // Combine detections from both eyes for totals
    const allDetections = [
        ...(odYolo?.detections || []),
        ...(osYolo?.detections || []),
    ];
    const totalLesions = allDetections.length;
    const allStats = allDetections.reduce((acc, d) => {
        acc[d.class_name] = (acc[d.class_name] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <button onClick={() => navigate(-1)}
                            className="text-slate-400 hover:text-white flex items-center gap-1.5 mb-2 transition-colors text-xs font-normal">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to Diagnostic Summary
                        </button>
                        <h1 className="text-2xl md:text-3xl font-semibold text-white font-display tracking-tight">
                            Lesion Spatial Localization
                        </h1>
                        <p className="text-slate-400 text-xs mt-0.5">On-device YOLOv8 micro-lesion detection model</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-3.5 py-1.5 bg-blue-950/60 border border-blue-500/30 rounded-xl">
                            <span className="text-[10px] text-blue-400 block font-normal">Pipeline status</span>
                            <span className="text-xs font-mono font-medium flex items-center gap-1.5 text-white">
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                On-device inference
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Dual-eye / single-eye visualiser grid ── */}
                <div className={`grid gap-6 ${osImage ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-3xl mx-auto'}`}>
                    <EyeCanvas
                        imageUrl={odImage}
                        yolo={odYolo}
                        label="Right Eye (OD)"
                        accentClass="bg-blue-950/70 border border-blue-800 text-blue-200"
                    />
                    {osImage && (
                        <EyeCanvas
                            imageUrl={osImage}
                            yolo={osYolo}
                            label="Left Eye (OS)"
                            accentClass="bg-indigo-950/70 border border-indigo-800 text-indigo-200"
                        />
                    )}
                </div>

                {/* ── Combined Clinical Findings ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* Totals */}
                    <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                        <h2 className="text-base font-semibold mb-3 flex items-center gap-2 font-display text-white">
                            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                            Clinical Findings Summary
                        </h2>
                        <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/50 mb-3">
                            <div className="text-slate-400 text-xs mb-1">Total localized lesions</div>
                            <div className="text-3xl font-semibold font-mono text-white">{totalLesions}</div>
                        </div>
                        <div className="space-y-1.5">
                            {Object.entries(allStats).map(([name, count]) => (
                                <div key={name} className="flex items-center justify-between p-2.5 bg-slate-800/30 rounded-lg">
                                    <span className="text-xs text-slate-300 truncate">{name}</span>
                                    <span className="font-mono text-xs text-white bg-slate-800 px-2 py-0.5 rounded">{count}</span>
                                </div>
                            ))}
                            {totalLesions === 0 && (
                                <div className='p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl'>
                                    <p className='text-amber-400 font-medium text-xs mb-1'>
                                        Clinical correlation note
                                    </p>
                                    <p className='text-slate-400 text-[11px] leading-relaxed'>
                                        Global staging (EfficientNetB3) evaluates full fundus morphology. Lesion bounding boxes represent regional YOLO detections. Both outputs operate independently.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Detection Log */}
                    <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                        <h2 className="text-xs font-medium text-slate-400 mb-3">Detections log (Both eyes)</h2>
                        <div className="space-y-1 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {allDetections.length === 0 && <p className="text-slate-500 italic text-xs">No localized lesion coordinates identified.</p>}
                            {allDetections.map((det, i) => (
                                <div key={i} className="flex items-center justify-between p-2 bg-slate-800/20 rounded-lg border border-slate-800/50">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full ${det.class_id === 0 ? 'bg-red-500' : det.class_id === 1 ? 'bg-amber-400' : 'bg-blue-400'}`} />
                                        <span className="text-xs font-normal text-slate-200">{det.class_name}</span>
                                    </div>
                                    <span className="text-[11px] font-mono text-slate-400">{Math.round(det.confidence * 100)}% conf</span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 p-3.5 bg-blue-950/30 border border-blue-800/40 rounded-xl">
                            <h4 className="text-xs font-medium text-blue-300 mb-0.5">Clinical validation notice</h4>
                            <p className="text-[11px] text-slate-400 leading-normal">
                                Bounding boxes represent automated spatial suggestions generated in real-time. Final diagnostic staging must incorporate direct funduscopy by an eye care specialist.
                            </p>
                        </div>
                    </div>

                </div>

            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}</style>
        </div>
    );
};

export default YoloResultsPage;
