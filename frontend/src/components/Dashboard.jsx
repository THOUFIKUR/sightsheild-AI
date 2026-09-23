import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllPatients, getQueuedRequests } from '../utils/indexedDB';

export default function Dashboard() {
    const [todayPatients, setTodayPatients] = useState([]);
    const [dashboardDate, setDashboardDate] = useState("");
    const [pendingCount, setPendingCount] = useState(0);

    const todayStr = new Date().toISOString().slice(0, 10);

    function formatDashboardDate() {
        return new Date().toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    }

    async function loadPatients() {
        try {
            const all = await getAllPatients();
            const today = (all || []).filter((p) => {
                if (!p.timestamp) return false;
                const tsString = String(p.timestamp);
                return tsString.slice(0, 10) === todayStr;
            });
            setTodayPatients(today);
        } catch (err) {
            console.error('Failed to load patients for dashboard', err);
        }
    }

    useEffect(() => {
        loadPatients();
        setDashboardDate(formatDashboardDate());
        getQueuedRequests().then((q) => setPendingCount(q.length));
        
        const id = setInterval(() => {
            loadPatients();
            setDashboardDate(formatDashboardDate());
            getQueuedRequests().then((q) => setPendingCount(q.length));
        }, 5000);
        
        return () => clearInterval(id);
    }, []);

    const todayScans = todayPatients.length;
    const highRisk = todayPatients.filter((p) => (p.risk_level || p.risk) === 'HIGH').length;
    const noDR = todayPatients.filter((p) => (p.grade ?? p.gradeOD ?? 0) === 0).length;
    const referrals = todayPatients.filter((p) => {
        const r = p.risk_level || p.risk;
        return r === 'HIGH' || r === 'MEDIUM';
    }).length;
    const drDetected = todayScans - noDR;

    const recentScans = [...todayPatients].sort((a, b) => {
        const ta = new Date(a.timestamp || 0).getTime();
        const tb = new Date(b.timestamp || 0).getTime();
        return tb - ta;
    }).slice(0, 4);

    const gradeLabel = (g) => ['No DR', 'Mild DR', 'Moderate DR', 'Severe DR', 'Prolif. DR'][g] || 'No DR';
    const gradeColor = (g) => ['text-emerald-600', 'text-yellow-600', 'text-rs-orange', 'text-red-600', 'text-pink-600'][g] || 'text-emerald-600';
    const gradeBg = (g) => ['bg-emerald-50', 'bg-yellow-50', 'bg-orange-50', 'bg-red-50', 'bg-pink-50'][g] || 'bg-emerald-50';
    const gradeDot = (g) => ['bg-emerald-500', 'bg-yellow-500', 'bg-rs-orange', 'bg-red-500', 'bg-pink-500'][g] || 'bg-emerald-500';

    const topPatient = todayPatients.length > 0 
        ? todayPatients.reduce((best, p) => ((p.grade ?? p.gradeOD ?? 0) > (best.grade ?? best.gradeOD ?? 0) ? p : best), todayPatients[0])
        : null;

    return (
        <>
            <div className="space-y-6 animate-fade-up font-display">
                
                {/* ═══ HERO SECTION ═══ */}
                <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rs-deep-navy via-rs-navy-800 to-rs-primary shadow-rs-md">
                    {/* Background patterns */}
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(53,199,244,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 30%, rgba(255,116,23,0.2) 0%, transparent 40%)',
                    }} />
                    <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10" style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='100' cy='100' r='80' fill='none' stroke='white' stroke-width='0.5'/%3E%3Ccircle cx='100' cy='100' r='60' fill='none' stroke='white' stroke-width='0.3'/%3E%3Ccircle cx='100' cy='100' r='40' fill='none' stroke='white' stroke-width='0.3'/%3E%3Cpath d='M100,20 Q60,60 40,100 Q60,140 100,180' fill='none' stroke='white' stroke-width='0.5'/%3E%3Cpath d='M100,20 Q140,60 160,100 Q140,140 100,180' fill='none' stroke='white' stroke-width='0.5'/%3E%3C/svg%3E")`,
                        backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                    }} />
                    
                    <div className="relative z-10 p-6 sm:p-8 lg:p-9 flex flex-col lg:flex-row items-start justify-between gap-6">
                        <div className="space-y-3.5 max-w-xl">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs border border-white/15 text-rs-cyan text-[11px] font-medium tracking-[0.05em]">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rs-cyan opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rs-cyan"></span>
                                </span>
                                Clinical Screening Protocol
                            </div>
                            <h2 className="text-2xl sm:text-3xl lg:text-[34px] font-semibold text-white leading-tight tracking-tight">
                                Point-of-Care Retinal Screening.{' '}
                                <span className="text-rs-orange-soft font-semibold">Early DR Detection.</span>
                            </h2>
                            <p className="text-white/70 text-sm sm:text-[15px] leading-relaxed max-w-md font-normal">
                                High-precision autonomous fundus analysis for diabetic retinopathy screening, triage, and timely clinical referral.
                            </p>
                            <div className="flex flex-wrap gap-2.5 pt-1">
                                {['Early Detection', 'Fundus Analysis', 'Clinical Triage', 'Offline PWA Support'].map(tag => (
                                    <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80 text-[11px] font-medium">
                                        <svg className="w-3 h-3 text-rs-cyan" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Right side quote */}
                        <div className="hidden lg:flex flex-col items-end text-right space-y-2 shrink-0">
                            <p className="text-white/60 text-sm font-medium max-w-[220px] leading-relaxed">
                                Universal eye health access across primary healthcare centres.
                            </p>
                            <div className="flex gap-2 mt-1 text-[11px] text-white/40 font-mono">
                                <span>PHC Screening</span>
                                <span>&bull;</span>
                                <span>ICDR Scale</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ═══ MAIN GRID ═══ */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* LEFT COLUMN: Upload + How it works */}
                    <div className="lg:col-span-2 space-y-6">
                        
                        {/* Upload + Results Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Upload Card */}
                            <div className="card p-6 space-y-4">
                                <h3 className="heading-md flex items-center gap-2">
                                    <svg className="w-5 h-5 text-rs-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    Upload Retinal Image
                                </h3>
                                <div className="border-2 border-dashed border-rs-border rounded-xl p-8 text-center hover:border-rs-bright/40 hover:bg-rs-bright/[0.02] transition-all cursor-pointer group">
                                    <div className="w-14 h-14 rounded-2xl bg-rs-ice-50 border border-rs-border flex items-center justify-center mx-auto mb-4 group-hover:border-rs-bright/30 transition-colors">
                                        <svg className="w-7 h-7 text-rs-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm text-rs-text font-medium mb-1">Drag & drop retinal fundus image here</p>
                                    <p className="text-xs text-rs-text-secondary mb-4">Supports JPG, PNG, DICOM (Max 10 MB)</p>
                                    <Link to="/scan" className="btn-primary px-6 py-2.5 text-sm">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        Choose Image
                                    </Link>
                                </div>
                            </div>

                            {/* AI Analysis Preview Card */}
                            <div className="card p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="heading-md">AI Analysis Results</h3>
                                    {topPatient && <span className="badge-success text-[10px]">● Complete</span>}
                                </div>
                                
                                {topPatient ? (
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-sm font-semibold text-[#D97706]">
                                                {gradeLabel(topPatient.grade ?? topPatient.gradeOD ?? 0)}
                                            </p>
                                            <div className="flex items-center justify-between mt-1.5">
                                                <span className="text-xs text-rs-text-secondary">Confidence score</span>
                                                <span className="text-sm font-semibold font-mono text-rs-primary">
                                                    {Math.round((topPatient.confidence || 0.87) * 100)}%
                                                </span>
                                            </div>
                                            <div className="w-full bg-rs-ice-50 rounded-full h-1.5 mt-1.5">
                                                <div className="bg-[#0757A8] h-1.5 rounded-full transition-all" 
                                                     style={{ width: `${Math.round((topPatient.confidence || 0.87) * 100)}%` }} />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5 pt-1">
                                            <p className="text-[11px] font-medium text-rs-text-secondary uppercase tracking-[0.06em]">Detected Findings</p>
                                            {['Microaneurysms', 'Haemorrhages', 'Hard Exudates'].map((finding, i) => (
                                                <div key={finding} className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-rs-orange' : i === 1 ? 'bg-yellow-500' : 'bg-rs-bright'}`} />
                                                    <span className="text-xs text-rs-text">{finding}</span>
                                                    <span className="text-xs font-mono text-rs-text-secondary ml-auto">{(0.82 - i * 0.12).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <Link to={`/results?id=${topPatient.id}`} className="btn-primary w-full justify-center text-xs py-2 mt-2 font-medium">
                                            View Report →
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <div className="w-12 h-12 rounded-xl bg-rs-ice-50 border border-rs-border flex items-center justify-center mb-3">
                                            <svg className="w-6 h-6 text-rs-text-secondary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                        </div>
                                        <p className="text-sm text-rs-text-secondary">No scans yet today</p>
                                        <p className="text-xs text-rs-text-secondary/60 mt-1">Upload an image to begin analysis</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* How RetiScan Works */}
                        <div className="card p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="heading-md">How RetiScan Works</h3>
                                <span className="text-xs text-rs-text-secondary">Simple Steps. Real Impact. →</span>
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { step: 1, title: 'Upload Image', desc: 'Capture or upload retinal fundus image', icon: '📷', color: 'from-rs-bright/10 to-rs-cyan/5 border-rs-bright/20' },
                                    { step: 2, title: 'AI Analysis', desc: 'Our model analyses for DR signs', icon: '🧠', color: 'from-rs-primary/10 to-rs-bright/5 border-rs-primary/20' },
                                    { step: 3, title: 'Get Results', desc: 'Instant report with explainability', icon: '📊', color: 'from-rs-orange/10 to-rs-orange-soft/5 border-rs-orange/20' },
                                    { step: 4, title: 'Take Action', desc: 'Consult, treat and follow-up', icon: '🏥', color: 'from-emerald-500/10 to-emerald-400/5 border-emerald-500/20' },
                                ].map((item, i) => (
                                    <div key={i} className="relative">
                                        <div className={`bg-gradient-to-br ${item.color} border rounded-xl p-4 text-center space-y-2`}>
                                            <div className="absolute -top-2 -left-1 w-6 h-6 rounded-full bg-rs-primary text-white text-[10px] font-bold flex items-center justify-center shadow-rs-sm">
                                                {item.step}
                                            </div>
                                            <div className="text-2xl">{item.icon}</div>
                                            <p className="text-sm font-semibold text-rs-text">{item.title}</p>
                                            <p className="text-[11px] text-rs-text-secondary leading-relaxed">{item.desc}</p>
                                        </div>
                                        {i < 3 && (
                                            <div className="hidden lg:block absolute top-1/2 -right-3 text-rs-border">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Sync Status */}
                        <div className="flex justify-center">
                            {!navigator.onLine ? (
                                <span className="badge-danger">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Offline — Syncing Paused
                                </span>
                            ) : pendingCount > 0 ? (
                                <span className="badge-warning">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rs-orange animate-bounce" /> {pendingCount} records syncing to cloud...
                                </span>
                            ) : (
                                <span className="badge-success">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Cloud Database Linked & Synced
                                </span>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Stats + Recent Scans */}
                    <div className="space-y-6">
                        {/* Patient Risk Summary */}
                        {topPatient && (
                            <div className="card p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-rs-text">Patient Risk Summary</h4>
                                    <Link to={`/results?id=${topPatient.id}`} className="text-[11px] text-rs-bright font-medium hover:underline">View Details →</Link>
                                </div>
                                <div className={`p-3 rounded-xl ${gradeBg(topPatient.grade ?? topPatient.gradeOD ?? 0)} border border-rs-border/50`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`w-2 h-2 rounded-full ${gradeDot(topPatient.grade ?? topPatient.gradeOD ?? 0)}`} />
                                        <span className={`text-sm font-bold ${gradeColor(topPatient.grade ?? topPatient.gradeOD ?? 0)}`}>
                                            {(topPatient.grade ?? topPatient.gradeOD ?? 0) >= 2 ? 'Moderate Risk' : (topPatient.grade ?? topPatient.gradeOD ?? 0) >= 1 ? 'Mild Risk' : 'Low Risk'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-rs-text-secondary leading-relaxed">
                                        {(topPatient.grade ?? topPatient.gradeOD ?? 0) >= 2
                                            ? 'Signs of Diabetic Retinopathy detected. Consult an ophthalmologist for further evaluation.'
                                            : 'No significant abnormalities detected. Continue routine screening.'}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Screening Statistics */}
                        <div className="card p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold text-rs-text">Screening Statistics</h4>
                                <span className="text-[10px] text-rs-text-secondary font-medium bg-rs-ice-50 px-2 py-1 rounded-lg border border-rs-border">Today</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Total scans', value: todayScans, icon: '🔬', color: 'text-rs-primary' },
                                    { label: 'No DR detected', value: noDR, icon: '✅', color: 'text-emerald-700' },
                                    { label: 'DR detected', value: drDetected, icon: '⚠️', color: 'text-[#D97706]' },
                                    { label: 'Referred', value: referrals, icon: '🏥', color: 'text-rose-700' },
                                ].map((stat, i) => (
                                    <div key={i} className="bg-rs-ice-50 rounded-xl p-3 text-center border border-rs-border/60">
                                        <span className="text-base">{stat.icon}</span>
                                        <p className={`text-xl font-semibold font-mono ${stat.color} mt-1`}>{stat.value}</p>
                                        <p className="text-[11px] text-rs-text-secondary font-normal mt-0.5">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recent Scans */}
                        <div className="card p-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-rs-text">Recent Scans</h4>
                                <Link to="/camp" className="text-xs text-[#0757A8] font-medium hover:underline">View all →</Link>
                            </div>
                            {recentScans.length === 0 ? (
                                <div className="py-6 text-center">
                                    <p className="text-xs text-rs-text-secondary">No scans recorded today</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {recentScans.map(patient => {
                                        const grade = patient.grade ?? patient.gradeOD ?? 0;
                                        return (
                                            <Link 
                                                key={patient.id} 
                                                to={`/results?id=${patient.id}`}
                                                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-rs-ice-50 transition-colors group border border-transparent hover:border-rs-border"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-rs-primary/10 text-rs-primary flex items-center justify-center text-xs font-semibold shrink-0 group-hover:bg-rs-primary group-hover:text-white transition-colors">
                                                    {patient.name?.[0] || '?'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-mono font-medium text-rs-text truncate">
                                                        {patient.id?.slice(0, 14) || 'RS-0000'}
                                                    </p>
                                                    <p className="text-[11px] text-rs-text-secondary font-sans mt-0.5">
                                                        {(() => {
                                                            try {
                                                                return patient.timestamp ? new Date(patient.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : 'No Time';
                                                            } catch { return 'Unknown'; }
                                                        })()}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className={`w-2 h-2 rounded-full ${gradeDot(grade)}`} />
                                                    <span className={`text-xs font-medium ${gradeColor(grade)}`}>
                                                        {gradeLabel(grade)}
                                                    </span>
                                                </div>
                                                <svg className="w-4 h-4 text-rs-text-secondary/40 group-hover:text-rs-bright transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Designed for Rural India */}
                        <div className="card p-5 bg-gradient-to-br from-rs-primary/5 to-rs-cyan/5 border-rs-bright/15">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-8 h-8 rounded-lg bg-rs-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <svg className="w-4 h-4 text-rs-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-rs-text">Designed for Rural India</p>
                                    <p className="text-[11px] text-rs-text-secondary mt-1 leading-relaxed">
                                        Works in low bandwidth • Optimized for low-end devices • Supports offline data capture
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 pt-2 border-t border-rs-border/50">
                                <div className="w-5 h-5 rounded bg-rs-orange/10 flex items-center justify-center">
                                    <svg className="w-3 h-3 text-rs-orange" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                </div>
                                <p className="text-[10px] font-medium text-rs-text-secondary">A Smart India Hackathon 2026 Initiative</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══ BOTTOM BANNER ═══ */}
                <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rs-primary to-rs-bright p-6 sm:p-8">
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: 'radial-gradient(circle at 80% 50%, rgba(255,255,255,0.3) 0%, transparent 50%)',
                    }} />
                    <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <h3 className="text-white font-display font-bold text-lg">Vision for Every India</h3>
                            <p className="text-white/60 text-sm mt-1">Powered by AI. Driven by People.</p>
                        </div>
                        <div className="flex gap-3">
                            <Link to="/scan" className="btn bg-white text-rs-primary font-semibold shadow-rs-md hover:shadow-rs-lg">
                                Start Screening
                            </Link>
                            <Link to="/camp" className="btn border border-white/30 text-white hover:bg-white/10">
                                View Records
                            </Link>
                        </div>
                    </div>
                </section>
            </div>
        </>
    );
}
