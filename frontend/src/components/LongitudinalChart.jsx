import { useState, useEffect } from 'react';
import { getAllPatients } from '../utils/indexedDB';

const GRADE_COLORS = ['#10B981', '#F59E0B', '#F97316', '#EF4444', '#EC4899'];

export default function LongitudinalChart({ contact }) {
    const [scans, setScans] = useState([]);
    useEffect(() => {
        getAllPatients()
            .then(all => {
                const matched = all
                    .filter(p => p.contact === contact)
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                setScans(matched);
            })
            .catch(() => setScans([]));
    }, [contact]);

    if (scans.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center space-y-3 bg-[#F8FAFD] rounded-2xl border border-rs-border">
                <div className="w-12 h-12 rounded-xl bg-rs-ice border border-rs-border flex items-center justify-center text-rs-primary">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
                <div>
                    <p className="text-rs-deep-navy font-semibold text-sm font-display">Baseline Screening Analysis</p>
                    <p className="text-slate-500 text-xs mt-1 max-w-[240px] mx-auto font-normal leading-relaxed">
                        This is the patient's initial recorded scan. Longitudinal disease progression telemetry will populate on follow-up screening.
                    </p>
                </div>
            </div>
        );
    }

    const n = scans.length;
    const W = 400, H = 180;
    const PAD_L = 55, PAD_T = 30, PAD_B = 30, PAD_R = 20;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const xOf = i => PAD_L + (i / (n - 1)) * chartW;
    const yOf = g => PAD_T + chartH - (g / 4) * chartH;

    const pts = scans.map((s, i) => `${xOf(i)},${yOf(s.grade)}`).join(' ');
    const last = scans[n - 1], first = scans[0];
    const trend = last.grade < first.grade ? { text: '↓ Improving', color: '#059669' }
                : last.grade > first.grade ? { text: '↑ Worsening', color: '#DC2626' }
                : { text: '= Stable', color: '#D97706' };

    const GRADE_NAMES = ['None', 'Mild', 'Moderate', 'Severe', 'Prolif.'];

    return (
        <div className="bg-white rounded-2xl border border-rs-border p-5 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-rs-deep-navy font-display uppercase tracking-wider">Patient History</p>
                <span className="text-xs font-mono text-slate-500">{n} scans recorded</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: '#F8FAFD', borderRadius: 12, border: '1px solid #E2E8F0' }}>
                {/* Gridlines + Y labels */}
                {[0, 1, 2, 3, 4].map(g => (
                    <g key={g}>
                        <line x1={PAD_L} y1={yOf(g)} x2={W - PAD_R} y2={yOf(g)} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />
                        <text x={PAD_L - 6} y={yOf(g) + 3} textAnchor="end" fill="#64748B" fontSize="9" fontFamily="IBM Plex Sans">{GRADE_NAMES[g]}</text>
                    </g>
                ))}
                {/* X axis date labels */}
                {scans.map((s, i) => (
                    <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fill="#64748B" fontSize="8" fontFamily="IBM Plex Mono">
                        {new Date(s.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </text>
                ))}
                {/* Data line */}
                <polyline points={pts} stroke="#0757A8" strokeWidth="2.5" fill="none" />
                {/* Data points */}
                {scans.map((s, i) => (
                    <circle key={i} cx={xOf(i)} cy={yOf(s.grade)} r={i === n - 1 ? 6 : 4.5}
                        fill={GRADE_COLORS[s.grade]}
                        stroke="#ffffff" strokeWidth="2" />
                ))}
                {/* Trend indicator */}
                <text x={W - PAD_R - 5} y={PAD_T - 8} textAnchor="end" fill={trend.color} fontSize="10" fontWeight="600" fontFamily="IBM Plex Sans">
                    {trend.text}
                </text>
            </svg>
        </div>
    );
}
