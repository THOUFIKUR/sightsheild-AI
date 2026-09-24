/**
 * ValidationMetrics.jsx
 * Clinical Validation Page
 *
 * Reads validation/results.json (produced by evaluation/eval_referable.py).
 * If the file is missing or malformed, shows "Not yet validated".
 * Never displays hard-coded accuracy/sensitivity/specificity values.
 *
 * Expected JSON schema (from eval_referable.py):
 * {
 *   "n": 103,
 *   "dataset": "IDRiD test",
 *   "split": "test",
 *   "run_date": "2026-09-30",
 *   "model_sha256": "...",
 *   "preprocessing_version": "...",
 *   "five_class": {
 *     "accuracy": 0.72,
 *     "qwk": 0.81,
 *     "confusion_matrix": [[...], ...]
 *   },
 *   "referable": {
 *     "sensitivity": 0.93, "sensitivity_ci_lo": 0.86, "sensitivity_ci_hi": 0.97,
 *     "specificity": 0.93, "specificity_ci_lo": 0.85, "specificity_ci_hi": 0.97,
 *     "ppv": 0.94, "npv": 0.92,
 *     "tp": 91, "fp": 6, "fn": 7, "tn": 80,
 *     "auc": 0.97
 *   },
 *   "ps_targets": { "sensitivity": 0.90, "specificity": 0.85 }
 * }
 */
import React, { useState, useEffect } from 'react';

// ─── Wilson 95% CI (if not pre-computed by the script) ────────────────────────
function wilsonCI(k, n) {
    if (!n || n === 0) return [null, null];
    const z = 1.96;
    const p = k / n;
    const denom = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denom;
    const spread = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom;
    return [
        Math.max(0, center - spread),
        Math.min(1, center + spread),
    ];
}

function pct(v) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(1) + '%';
}

function ciStr(lo, hi) {
    if (lo == null || hi == null) return '';
    return ` (95% CI: ${pct(lo)}–${pct(hi)})`;
}

function MetricCard({ title, value, ci, desc, targetMet, targetValue }) {
    const met = targetValue != null && value != null ? value >= targetValue : null;
    return (
        <div className="p-6 rounded-2xl border border-rs-border bg-white shadow-rs-sm hover:shadow-rs-md transition-all">
            <h3 className="text-xs font-medium text-rs-muted mb-2">{title}</h3>
            <div className={`text-3xl font-semibold font-mono mb-1 tracking-tight ${met === true ? 'text-emerald-700' : met === false ? 'text-rose-700' : 'text-rs-deep-navy'}`}>
                {value != null ? pct(value) : '—'}
            </div>
            {ci && <div className="text-[11px] text-rs-muted font-mono mb-1">{ci}</div>}
            {targetValue != null && (
                <div className={`text-[11px] font-medium mb-1 ${met ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {met ? '✓' : '✗'} Target: {pct(targetValue)}
                </div>
            )}
            <p className="text-xs text-rs-muted leading-relaxed font-normal">{desc}</p>
        </div>
    );
}

export default function ValidationMetrics() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch('/validation/results.json')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(json => { setData(json); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    }, []);

    const ref = data?.referable || {};
    const fc = data?.five_class || {};
    const pt = data?.ps_targets || { sensitivity: 0.90, specificity: 0.85 };

    // Derive CIs from script output or recompute from TP/FP/TN/FN
    const n = data?.n || 0;
    const refN = (ref.tp || 0) + (ref.fn || 0) + (ref.fp || 0) + (ref.tn || 0);
    const sens = ref.sensitivity;
    const spec = ref.specificity;
    const [sensLo, sensHi] = (ref.sensitivity_ci_lo != null)
        ? [ref.sensitivity_ci_lo, ref.sensitivity_ci_hi]
        : (ref.tp != null ? wilsonCI(ref.tp, ref.tp + ref.fn) : [null, null]);
    const [specLo, specHi] = (ref.specificity_ci_lo != null)
        ? [ref.specificity_ci_lo, ref.specificity_ci_hi]
        : (ref.tn != null ? wilsonCI(ref.tn, ref.tn + ref.fp) : [null, null]);

    // Confusion matrix grades
    const cm = fc.confusion_matrix || null;
    const cmGrades = ['0 (None)', '1 (Mild)', '2 (Mod)', '3 (Sev)', '4 (Prolif)'];
    const cmColors = [
        'bg-emerald-100/60 text-emerald-900',
        'bg-amber-100/60 text-amber-900',
        'bg-orange-100/60 text-orange-900',
        'bg-red-100/60 text-red-900',
        'bg-rose-100/60 text-rose-900',
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12">

            {/* Header */}
            <div className="text-center space-y-2.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rs-primary/10 border border-rs-primary/20 text-rs-primary text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-rs-primary animate-pulse"></span>
                    Clinical Validation Protocol
                </div>
                <h1 className="text-3xl sm:text-4xl font-semibold text-rs-deep-navy tracking-tight font-display">
                    Diagnostic Performance &amp; Clinical Validation
                </h1>
                <p className="max-w-2xl mx-auto text-sm sm:text-base text-rs-muted leading-relaxed">
                    All metrics computed by <code className="text-xs bg-rs-ice px-1 py-0.5 rounded">evaluation/eval_referable.py</code> on the real dataset.
                    Hard-coded metrics have been removed; this page shows only script-computed values.
                </p>
            </div>

            {/* Loading / Error / Not-yet-validated */}
            {loading && (
                <div className="text-center py-16 text-rs-muted text-sm">Loading validation results…</div>
            )}

            {!loading && (error || !data) && (
                <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-10 text-center space-y-3">
                    <div className="text-4xl">⚠️</div>
                    <h2 className="text-lg font-semibold text-amber-900 font-display">Not yet validated</h2>
                    <p className="text-sm text-amber-800 max-w-lg mx-auto leading-relaxed">
                        <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">frontend/public/validation/results.json</code> is missing or
                        could not be fetched ({error}).
                    </p>
                    <p className="text-xs text-amber-700">
                        Run <code className="bg-amber-100 px-1 py-0.5 rounded">python evaluation/eval_referable.py</code> to generate it.
                    </p>
                </div>
            )}

            {!loading && data && (
                <>
                    {/* Dataset provenance */}
                    <div className="bg-rs-ice/60 border border-rs-border rounded-2xl px-6 py-4 flex flex-wrap gap-6 text-xs">
                        {[
                            { label: 'Dataset', val: data.dataset || '—' },
                            { label: 'Split', val: data.split || '—' },
                            { label: 'N', val: n ? n.toLocaleString() : '—' },
                            { label: 'Run date', val: data.run_date || '—' },
                            { label: 'Model SHA-256', val: data.model_sha256 ? data.model_sha256.slice(0, 16) + '…' : '—' },
                            { label: 'Preprocessing', val: data.preprocessing_version || '—' },
                        ].map(({ label, val }) => (
                            <div key={label}>
                                <span className="text-rs-muted block">{label}</span>
                                <span className="font-mono font-semibold text-rs-deep-navy">{val}</span>
                            </div>
                        ))}
                    </div>

                    {/* CI note for small N */}
                    {n < 200 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-800">
                            <strong>Note:</strong> N = {n} produces wide 95% Wilson CIs (roughly ±5–8 percentage points for referable DR).
                            Results should be confirmed on a larger external test set.
                        </div>
                    )}

                    {/* Referable DR metrics */}
                    <div>
                        <h2 className="text-base font-semibold text-rs-deep-navy mb-3 font-display">
                            Referable DR Performance (Grade ≥ 2 vs Grade 0–1)
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <MetricCard
                                title="Sensitivity (TPR)"
                                value={sens}
                                ci={ciStr(sensLo, sensHi)}
                                desc={`True positive rate for referable DR. TP=${ref.tp ?? '—'}, FN=${ref.fn ?? '—'}`}
                                targetValue={pt.sensitivity}
                            />
                            <MetricCard
                                title="Specificity (TNR)"
                                value={spec}
                                ci={ciStr(specLo, specHi)}
                                desc={`True negative rate for non-referable. TN=${ref.tn ?? '—'}, FP=${ref.fp ?? '—'}`}
                                targetValue={pt.specificity}
                            />
                            <MetricCard
                                title="AUC (ROC)"
                                value={ref.auc}
                                desc="Area under the ROC curve for referable vs non-referable binary classification."
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                            <MetricCard
                                title="PPV (Precision)"
                                value={ref.ppv}
                                desc={`Positive predictive value. Proportion of referrals that are truly referable.`}
                            />
                            <MetricCard
                                title="NPV"
                                value={ref.npv}
                                desc="Negative predictive value. Proportion of non-referrals that are truly non-referable."
                            />
                        </div>
                    </div>

                    {/* 5-class metrics */}
                    <div className="grid lg:grid-cols-2 gap-6">

                        {/* 5-class summary */}
                        <div className="bg-white border border-rs-border rounded-2xl p-6 sm:p-7 space-y-5 shadow-rs-sm">
                            <h3 className="text-lg font-semibold text-rs-deep-navy font-display flex items-center gap-2.5 border-b border-rs-border pb-3.5">
                                <span className="text-xl">📊</span> Five-Class ICDR Performance
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { val: fc.accuracy != null ? pct(fc.accuracy) : '—', label: '5-class accuracy' },
                                    { val: fc.qwk != null ? fc.qwk.toFixed(3) : '—', label: 'Quadratic kappa' },
                                    { val: n ? n.toLocaleString() : '—', label: 'Test images (N)' },
                                    { val: data.dataset || '—', label: 'Dataset' },
                                ].map((item, i) => (
                                    <div key={i} className="bg-rs-ice/60 p-3.5 rounded-xl border border-rs-border">
                                        <div className="text-lg font-semibold font-mono text-rs-deep-navy mb-0.5">{item.val}</div>
                                        <div className="text-[11px] text-rs-muted font-normal">{item.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Confusion matrix */}
                        {cm && (
                            <div className="bg-white border border-rs-border rounded-2xl p-6 sm:p-7 space-y-5 shadow-rs-sm">
                                <h3 className="text-lg font-semibold text-rs-deep-navy font-display flex items-center gap-2.5 border-b border-rs-border pb-3.5">
                                    <span className="text-xl">🎯</span> Confusion Matrix (N = {n.toLocaleString()})
                                </h3>
                                <div className="overflow-x-auto text-xs">
                                    <table className="w-full text-center border-collapse">
                                        <thead>
                                            <tr className="bg-rs-ice text-rs-deep-navy">
                                                <th className="p-1.5 border border-rs-border font-medium text-[10px]">True \ Pred</th>
                                                {cmGrades.map(g => (
                                                    <th key={g} className="p-1.5 border border-rs-border font-medium text-[10px]">{g}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="text-rs-text font-mono text-xs">
                                            {cm.map((row, ri) => (
                                                <tr key={ri}>
                                                    <td className="p-1.5 border border-rs-border font-medium font-sans bg-rs-ice/80 text-rs-deep-navy text-[10px]">
                                                        {cmGrades[ri]}
                                                    </td>
                                                    {row.map((v, ci) => (
                                                        <td
                                                            key={ci}
                                                            className={`p-1.5 border border-rs-border ${ri === ci ? cmColors[ri] + ' font-semibold' : 'bg-white text-rs-muted'}`}
                                                        >
                                                            {v}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-rs-muted text-center font-normal">
                                    Computed by <code className="text-[10px] bg-rs-ice px-1 rounded">eval_referable.py</code> — do not edit manually.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ECE / Calibration */}
                    {data.calibration && (
                        <div className="bg-white border border-rs-border rounded-2xl p-6 shadow-rs-sm space-y-4">
                            <h3 className="text-base font-semibold text-rs-deep-navy font-display border-b border-rs-border pb-3">
                                Confidence Calibration
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { label: 'ECE (before)', val: data.calibration.ece_before?.toFixed(4) },
                                    { label: 'ECE (after)', val: data.calibration.ece_after?.toFixed(4) },
                                    { label: 'Brier (before)', val: data.calibration.brier_before?.toFixed(4) },
                                    { label: 'Brier (after)', val: data.calibration.brier_after?.toFixed(4) },
                                ].map(({ label, val }) => (
                                    <div key={label} className="bg-rs-ice/60 p-3 rounded-xl border border-rs-border">
                                        <div className="text-sm font-mono font-semibold text-rs-deep-navy">{val ?? '—'}</div>
                                        <div className="text-[11px] text-rs-muted">{label}</div>
                                    </div>
                                ))}
                            </div>
                            {data.calibration.note && (
                                <p className="text-xs text-rs-muted">{data.calibration.note}</p>
                            )}
                        </div>
                    )}

                    {/* Explainable AI callout */}
                    <div className="rounded-2xl p-6 sm:p-7 bg-rs-deep-navy text-white shadow-rs-md border border-rs-border">
                        <div className="flex flex-col md:flex-row items-center gap-5">
                            <div className="w-12 h-12 shrink-0 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center text-rs-cyan">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-white mb-1.5 font-display">
                                    Explainability Method
                                </h3>
                                <p className="text-white/80 text-sm leading-relaxed font-normal">
                                    The heatmap method is reported per inference as <code className="text-xs bg-white/10 px-1 rounded">heatmap_method</code> in the API response.
                                    It reads <strong>grad_cam</strong> only when the model's feature map and classifier weights are used to compute
                                    a genuine gradient-class activation map. Otherwise it reads <strong>heuristic_saliency_FALLBACK</strong>
                                    (CLAHE + background subtraction + YOLO foci — not a gradient method).
                                </p>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
