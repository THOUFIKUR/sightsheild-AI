// DoctorPortal.jsx — Specialist review interface for AI-flagged DR patients.
// Allows ophthalmologists to confirm, override, and annotate AI diagnoses.
// Tabs: Urgent (Grade 3–4), Refer (Grade 2), All (flagged ≥ Grade 2 or HIGH risk).

import { useState, useEffect } from 'react';
import { getAllPatients, saveReview, getAllReviews } from '../utils/indexedDB';

const GRADE_LABELS = ['No DR', 'Mild DR', 'Moderate DR', 'Severe DR', 'Proliferative DR'];
const GRADE_COLORS = ['text-emerald-700', 'text-yellow-700', 'text-orange-700', 'text-red-700', 'text-pink-700'];

function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function DoctorPortal() {
    const [patients, setPatients] = useState([]);
    const [reviews, setReviews] = useState({});
    const [tab, setTab] = useState('urgent');
    const [overrides, setOverrides] = useState({});
    const [notes, setNotes] = useState({});
    const [showNote, setShowNote] = useState({});

    async function reload() {
        const all = await getAllPatients();
        const flagged = all.filter(p => p.grade >= 2 || p.risk === 'HIGH');
        setPatients(flagged);
        const revs = await getAllReviews();
        const revMap = {};
        revs.forEach(r => { revMap[r.patientId] = r; });
        setReviews(revMap);
    }

    useEffect(() => {
        reload();
        const id = setInterval(reload, 30000);
        return () => clearInterval(id);
    }, []);

    const tabs = {
        urgent: patients.filter(p => p.grade >= 3),
        refer: patients.filter(p => p.grade === 2),
        all: patients,
    };

    const shown = tabs[tab] || [];
    const reviewed = Object.keys(reviews).length;
    const pending = patients.length - reviewed;
    const avgConf = patients.length > 0
        ? Math.round(patients.reduce((s, p) => s + (p.confidence || 0), 0) / patients.length * 100)
        : 0;

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-12">
            {/* Header */}
            <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rs-primary/10 text-rs-primary font-medium text-xs mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rs-primary animate-pulse" />
                    Clinical Review Specialist Portal
                </div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-rs-deep-navy tracking-tight font-display">
                    Ophthalmologist Case Review
                </h1>
                <div className="mt-2.5 bg-amber-50/70 border border-amber-200 text-amber-900 text-xs font-normal px-3.5 py-2 rounded-xl flex items-center gap-2">
                    <span className="text-amber-600 text-sm">⚕</span>
                    <span>Clinical notice: Automated classifications are intended for frontline triage. Diagnostic confirmation and treatment decisions must be validated by an ophthalmologist.</span>
                </div>
            </div>

            {/* Stats row - Differentiated clean cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {[
                    { label: 'Flagged cases', val: patients.length, color: 'text-rose-700', bg: 'bg-white border-rs-border' },
                    { label: 'Validated cases', val: reviewed, color: 'text-emerald-700', bg: 'bg-white border-rs-border' },
                    { label: 'Pending review', val: pending, color: 'text-amber-700', bg: 'bg-white border-rs-border' },
                    { label: 'Mean confidence', val: `${avgConf}%`, color: 'text-rs-deep-navy', bg: 'bg-white border-rs-border' },
                ].map(({ label, val, color, bg }) => (
                    <div key={label} className={`p-4 sm:p-5 rounded-2xl border ${bg} text-center shadow-rs-sm`}>
                        <div className={`text-2xl sm:text-3xl font-semibold ${color} font-mono mb-1`}>{val}</div>
                        <div className="text-xs text-rs-muted font-normal">{label}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-rs-ice rounded-xl border border-rs-border">
              {[
                ['urgent', '🚨', 'Urgent triage', 'Grade 3–4', 'bg-rose-600 text-white', 'text-rs-text hover:bg-white/80'],
                ['refer',  '⚠️', 'Referable cases', 'Grade 2',  'bg-amber-600 text-white', 'text-rs-text hover:bg-white/80'],
                ['all',    '📋', 'All flagged',     'Total',      'bg-rs-primary text-white', 'text-rs-text hover:bg-white/80'],
              ].map(([key, icon, label, sub, activeClass, inactiveClass]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                    tab === key
                      ? `${activeClass} shadow-rs-sm`
                      : `${inactiveClass} bg-transparent`
                  }`}
                >
                  <span className="font-semibold">{icon} {label}</span>
                  <span className="text-[10px] opacity-80 font-mono">({tabs[key].length})</span>
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
                <div className="bg-white border border-rs-border rounded-2xl p-12 text-center shadow-rs-sm">
                    <p className="text-3xl mb-2">✅</p>
                    <p className="text-base font-semibold text-rs-deep-navy font-display">No cases pending in this category</p>
                    <p className="text-xs text-rs-muted mt-1">All clinical cases for this triage filter have been reviewed or none are pending.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shown.map(p => {
                        const isReviewed = !!reviews[p.id];
                        const ov = overrides[p.id];
                        const noteVal = notes[p.id] || '';
                        return (
                            <div key={p.id} className="bg-white border border-rs-border rounded-2xl p-5 relative space-y-3.5 shadow-rs-sm hover:shadow-rs-md transition-all">
                                {/* Reviewed badge */}
                                {isReviewed && (
                                    <div className="absolute top-4 right-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium px-2.5 py-0.5 rounded-full font-mono">
                                        Validated ✓
                                    </div>
                                )}

                                {/* Patient info */}
                                <div className="flex justify-between items-start pr-20">
                                    <div>
                                        <p className="text-rs-deep-navy font-semibold text-base font-display leading-tight">{p.name || 'Unnamed Patient'}</p>
                                        <p className="text-rs-muted text-xs font-normal mt-0.5">{p.age}y &bull; {p.gender} &bull; <span className="font-mono text-rs-primary font-medium">{p.id}</span></p>
                                        <p className="text-slate-400 text-[11px] font-mono mt-0.5">{timeAgo(p.timestamp)}</p>
                                    </div>
                                    <span className={`grade-pill grade-${p.grade}`}>Grade {p.grade}</span>
                                </div>

                                <div className="bg-rs-ice/60 rounded-xl p-3 border border-rs-border">
                                    <p className="text-rs-deep-navy text-xs font-medium">{p.diagnosis || 'Clinical screening completed'}</p>
                                    <p className="text-xs text-rs-muted font-normal mt-1">Screening confidence: <span className="text-rs-deep-navy font-mono font-medium">{Math.round((p.confidence || 0) * 100)}%</span></p>
                                </div>

                                {/* Retinal Images — 2 rows: originals then heatmaps */}
                                {(p.od_image_url || p.os_image_url || p.od_heatmap_url || p.os_heatmap_url ||
                                  p.rightEye?.image_url || p.rightEye?.heatmap_url ||
                                  p.leftEye?.image_url  || p.leftEye?.heatmap_url  ||
                                  p.heatmap_url || p.image_url) && (
                                    <div className="space-y-2.5 pt-1">
                                        {/* Row 1: Original scans */}
                                        <p className="text-[11px] text-rs-deep-navy font-medium">Fundus photographs</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <p className="text-[10px] font-mono text-rs-muted mb-1">OD (Right Eye)</p>
                                                {(p.od_image_url || p.rightEye?.image_url || p.image_url) ? (
                                                    <img
                                                        src={p.od_image_url || p.rightEye?.image_url || p.image_url}
                                                        className="w-full rounded-lg aspect-square object-cover border border-rs-border"
                                                        alt="Right eye scan"
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                ) : (
                                                    <div className="w-full rounded-lg aspect-square bg-rs-ice border border-rs-border flex items-center justify-center">
                                                        <span className="text-slate-400 text-xs font-normal">No image</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-mono text-rs-muted mb-1">OS (Left Eye)</p>
                                                {(p.os_image_url || p.leftEye?.image_url) ? (
                                                    <img
                                                        src={p.os_image_url || p.leftEye?.image_url}
                                                        className="w-full rounded-lg aspect-square object-cover border border-rs-border"
                                                        alt="Left eye scan"
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                ) : (
                                                    <div className="w-full rounded-lg aspect-square bg-rs-ice border border-rs-border flex items-center justify-center">
                                                        <span className="text-slate-400 text-xs font-normal">Not captured</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Row 2: AI Heatmaps */}
                                        <p className="text-[11px] text-rs-deep-navy font-medium pt-1">Diagnostic saliency (Grad-CAM)</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <p className="text-[10px] font-mono text-rs-muted mb-1">OD Saliency</p>
                                                {(p.od_heatmap_url || p.rightEye?.heatmap_url || p.heatmap_url) ? (
                                                    <img
                                                        src={p.od_heatmap_url || p.rightEye?.heatmap_url || p.heatmap_url}
                                                        className="w-full rounded-lg aspect-square object-cover border border-rs-border"
                                                        alt="Right eye heatmap"
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                ) : (
                                                    <div className="w-full rounded-lg aspect-square bg-rs-ice border border-rs-border flex items-center justify-center">
                                                        <span className="text-slate-400 text-xs font-normal">No heatmap</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-mono text-rs-muted mb-1">OS Saliency</p>
                                                {(p.os_heatmap_url || p.leftEye?.heatmap_url) ? (
                                                    <img
                                                        src={p.os_heatmap_url || p.leftEye?.heatmap_url}
                                                        className="w-full rounded-lg aspect-square object-cover border border-rs-border"
                                                        alt="Left eye heatmap"
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                ) : (
                                                    <div className="w-full rounded-lg aspect-square bg-rs-ice border border-rs-border flex items-center justify-center">
                                                        <span className="text-slate-400 text-xs font-normal">Not captured</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Action row */}
                                <div className="flex gap-2 flex-wrap pt-1.5">
                                    <button
                                        onClick={() => saveReview({ patientId: p.id, confirmed: true, confirmedGrade: p.grade }).then(reload)}
                                        className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-rs-sm transition-colors flex items-center justify-center gap-1"
                                    >
                                        ✓ Confirm
                                    </button>
                                    <div className="flex-1 flex gap-1.5">
                                        <select 
                                            value={ov ?? p.grade} 
                                            onChange={e => setOverrides(o => ({ ...o, [p.id]: Number(e.target.value) }))}
                                            className="flex-1 bg-rs-ice border border-rs-border text-rs-deep-navy text-xs font-medium rounded-xl px-2 py-1.5"
                                        >
                                            {[0, 1, 2, 3, 4].map(g => <option key={g} value={g}>Grade {g}</option>)}
                                        </select>
                                        <button
                                            onClick={() => saveReview({ patientId: p.id, override: true, confirmedGrade: ov ?? p.grade }).then(reload)}
                                            className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors"
                                        >
                                            Override
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setShowNote(n => ({ ...n, [p.id]: !n[p.id] }))}
                                        className="px-3 py-2 rounded-xl text-xs font-medium bg-rs-ice border border-rs-border text-rs-deep-navy hover:bg-white transition-colors"
                                    >
                                        📝 Clinical Note
                                    </button>
                                </div>

                                {showNote[p.id] && (
                                    <div className="space-y-2 pt-2">
                                        <textarea
                                            value={noteVal}
                                            onChange={e => setNotes(n => ({ ...n, [p.id]: e.target.value }))}
                                            maxLength={150}
                                            placeholder="Add clinical observation (max 150 characters)..."
                                            className="w-full bg-rs-ice border border-rs-border text-rs-text text-xs rounded-xl p-3 resize-none h-16 outline-none focus:border-rs-primary font-sans"
                                        />
                                        <button
                                            onClick={() => saveReview({ patientId: p.id, note: noteVal }).then(reload)}
                                            className="w-full py-2 rounded-xl text-xs font-medium bg-rs-primary text-white hover:bg-rs-deep-navy transition-colors shadow-rs-sm"
                                        >
                                            Save Observation
                                        </button>
                                    </div>
                                )}

                                {/* Show existing review details */}
                                {reviews[p.id] && (
                                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 text-xs text-emerald-900">
                                        <span className="font-medium">Validated:</span> {reviews[p.id].confirmed ? `Confirmed Grade ${reviews[p.id].confirmedGrade}` : reviews[p.id].override ? `Overridden to Grade ${reviews[p.id].confirmedGrade}` : 'Clinical note appended'}
                                        {reviews[p.id].note && <p className="text-emerald-800 mt-1 italic font-normal">"{reviews[p.id].note}"</p>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="text-center pt-2">
                <a href="/" className="text-xs font-medium text-rs-primary hover:underline transition-colors">← Return to Dashboard</a>
            </div>
        </div>
    );
}
