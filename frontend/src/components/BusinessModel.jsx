/**
 * BusinessModel.jsx — Section 10: Institutional Economics & Deployment Scale
 * Formatted with clinical high-contrast cards, restrained typography, and IBM Plex font family.
 */
import React, { useState } from 'react';

// -- Revenue Calculator --────
function RevenueCalc() {
    const [scans, setScans] = useState(200);
    const [camps, setCamps] = useState(10);
    const [days,  setDays]  = useState(20);
    const COST_MONTH = 150000;

    const monthlyRev    = scans * camps * days * 10;
    const annualRev     = monthlyRev * 12;
    const monthlyProfit = monthlyRev - COST_MONTH;

    const fmt = v => v >= 1e7 ? `₹${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v/1e5).toFixed(1)}L` : `₹${(v/1000).toFixed(1)}K`;

    const Slider = ({ label, value, setValue, min, max, step, unit }) => (
        <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
                <span className="text-rs-text font-normal">{label}</span>
                <span className="text-rs-deep-navy font-semibold font-mono text-sm">{value} {unit}</span>
            </div>
            <input 
                type="range" 
                min={min} 
                max={max} 
                step={step} 
                value={value}
                onChange={e => setValue(Number(e.target.value))}
                className="w-full accent-rs-primary cursor-pointer h-2 bg-slate-200 rounded-lg" 
            />
        </div>
    );

    return (
        <div className="bg-white border border-rs-border rounded-2xl p-6 sm:p-7 shadow-rs-sm relative overflow-hidden">
            <h3 className="text-lg font-semibold text-rs-deep-navy font-display mb-5 flex items-center gap-2.5">
                <span className="p-2 bg-rs-primary/10 text-rs-primary rounded-lg text-base">🧮</span> Deployment Economics Calculator
            </h3>
            <div className="space-y-5">
                <Slider label="Scans per camp / day" value={scans} setValue={setScans} min={50}  max={500}  step={25} unit="scans" />
                <Slider label="Active screening camps" value={camps} setValue={setCamps} min={1}   max={5000} step={1}  unit="camps" />
                <Slider label="Operational days / month" value={days}  setValue={setDays}  min={5}   max={30}   step={1}  unit="days"  />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-7">
                {[
                    { label: 'Monthly revenue', val: fmt(monthlyRev),    color: 'text-rs-deep-navy', bg: 'bg-rs-ice/60 border-rs-border' },
                    { label: 'Annual revenue',  val: fmt(annualRev),     color: 'text-emerald-700', bg: 'bg-emerald-50/50 border-emerald-200' },
                    { label: 'Monthly net balance', val: fmt(monthlyProfit), color: monthlyProfit >= 0 ? 'text-emerald-700' : 'text-rose-700', bg: monthlyProfit >= 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200' },
                ].map(({ label, val, color, bg }) => (
                    <div key={label} className={`${bg} rounded-xl border p-4 text-center`}>
                        <div className={`text-2xl font-semibold ${color} font-mono mb-1`}>{val}</div>
                        <div className="text-xs text-rs-muted font-normal">{label}</div>
                    </div>
                ))}
            </div>
            <p className="text-xs text-rs-muted mt-4 text-center font-normal">
                Baseline assumptions: ₹10 per completed scan · ₹1.5L / month operational overhead
            </p>
        </div>
    );
}

export default function BusinessModel() {
    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12">

            {/* Header / Value Proposition */}
            <div className="text-center space-y-2.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rs-primary/10 border border-rs-primary/20 text-rs-primary text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-rs-primary animate-pulse"></span>
                    Deployment Framework
                </div>
                <h1 className="text-3xl sm:text-4xl font-semibold text-rs-deep-navy tracking-tight font-display">
                    Public Health Economics & Scale
                </h1>
                <p className="max-w-3xl mx-auto text-sm sm:text-base text-rs-muted leading-relaxed">
                    Over 70 million individuals in India live with diabetes, yet screening coverage remains below 10%.
                    RetiScan supplements capital-intensive desktop fundus cameras with portable, on-device AI screening.
                </p>
            </div>

            {/* Quick Stats Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {[
                    { label: "Estimated TAM", val: "$1.2B+", color: "text-rs-deep-navy", bg: "bg-white border-rs-border" },
                    { label: "Hardware capex", val: "₹0", color: "text-rs-deep-navy", bg: "bg-white border-rs-border" },
                    { label: "Inference cost", val: "₹10", color: "text-rs-primary", bg: "bg-white border-rs-border" },
                    { label: "Public health reach", val: "100k+ PHCs", color: "text-rs-deep-navy", bg: "bg-white border-rs-border" }
                ].map((stat, i) => (
                    <div key={i} className={`p-4 sm:p-5 rounded-2xl border ${stat.bg} text-center shadow-rs-sm`}>
                        <div className={`text-2xl sm:text-3xl font-semibold ${stat.color} mb-1 font-mono`}>{stat.val}</div>
                        <div className="text-xs font-normal text-rs-muted">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Main Sections Grid */}
            <div className="grid md:grid-cols-2 gap-6">

                {/* 1. Target Market */}
                <div className="bg-white border border-rs-border rounded-2xl p-6 sm:p-7 space-y-5 shadow-rs-sm">
                    <h3 className="text-lg font-semibold text-rs-deep-navy font-display mb-3 flex items-center gap-2.5">
                        <span className="p-2 bg-blue-50 text-rs-primary rounded-lg text-base border border-blue-200">🎯</span> Primary Deployments
                    </h3>
                    <ul className="space-y-3.5 text-rs-text text-sm">
                        <li className="flex items-start gap-2.5">
                            <span className="text-rs-primary font-medium text-sm mt-0.5">▸</span>
                            <div>
                                <strong className="text-rs-deep-navy block font-semibold text-sm">Primary Health Centres (PHCs)</strong>
                                Deploying offline-first triage into rural Ayushman Bharat health wellness centres.
                            </div>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <span className="text-rs-primary font-medium text-sm mt-0.5">▸</span>
                            <div>
                                <strong className="text-rs-deep-navy block font-semibold text-sm">Community Outreach Camps</strong>
                                Enabling frontline health personnel to screen hundreds of community members daily without internet.
                            </div>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <span className="text-rs-primary font-medium text-sm mt-0.5">▸</span>
                            <div>
                                <strong className="text-rs-deep-navy block font-semibold text-sm">Tertiary Eye Care Networks</strong>
                                Institutional triage pipelines to prioritize referable cases before clinical ophthalmologist examination.
                            </div>
                        </li>
                    </ul>
                </div>

                {/* 2. Revenue Model */}
                <div className="bg-white border border-rs-border rounded-2xl p-6 sm:p-7 space-y-5 shadow-rs-sm">
                    <h3 className="text-lg font-semibold text-rs-deep-navy font-display mb-3 flex items-center gap-2.5">
                        <span className="p-2 bg-emerald-50 text-emerald-700 rounded-lg text-base border border-emerald-200">💸</span> Revenue Streams
                    </h3>
                    <div className="space-y-3">
                        <div className="p-3.5 bg-rs-ice/60 rounded-xl border border-rs-border">
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="font-semibold text-rs-deep-navy text-sm">Institutional Licensing (B2G / B2B)</h4>
                                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs font-mono font-medium">60%</span>
                            </div>
                            <p className="text-xs text-rs-muted leading-relaxed font-normal">Subscription access to camp management, longitudinal record synchronization, and institutional reporting tools.</p>
                        </div>
                        <div className="p-3.5 bg-rs-ice/60 rounded-xl border border-rs-border">
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="font-semibold text-rs-deep-navy text-sm">Pay-per-Screening API</h4>
                                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs font-mono font-medium">40%</span>
                            </div>
                            <p className="text-xs text-rs-muted leading-relaxed font-normal">Low-overhead per-scan integration fees (₹10/scan) for independent clinical setups and partner platforms.</p>
                        </div>
                    </div>
                </div>

                {/* 3. Competitive Advantage */}
                <div className="bg-white border border-rs-border rounded-2xl p-6 sm:p-7 space-y-5 shadow-rs-sm">
                    <h3 className="text-lg font-semibold text-rs-deep-navy font-display mb-3 flex items-center gap-2.5">
                        <span className="p-2 bg-indigo-50 text-indigo-700 rounded-lg text-base border border-indigo-200">⚡</span> Technical Differentiators
                    </h3>
                    <div className="space-y-4">
                        {[
                            { label: 'Edge inference execution',   sub: 'WebAssembly / ONNX' },
                            { label: 'Zero data egress liability', sub: 'Client compute' },
                            { label: 'Multilingual frontline guidance', sub: 'Regional audio' },
                        ].map(({ label, sub }) => (
                            <div key={label}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-rs-deep-navy">{label}</span>
                                    <span className="text-rs-primary font-mono text-xs font-medium">{sub}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                    <div className="h-full bg-rs-primary w-full rounded-full"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 4. Ecosystem Integration */}
                <div className="bg-white border border-rs-border rounded-2xl p-6 sm:p-7 space-y-5 shadow-rs-sm">
                    <h3 className="text-lg font-semibold text-rs-deep-navy font-display mb-3 flex items-center gap-2.5">
                        <span className="p-2 bg-amber-50 text-amber-700 rounded-lg text-base border border-amber-200">🔗</span> National Health Interoperability
                    </h3>
                    <div className="h-full flex flex-col justify-center">
                        <p className="text-rs-muted mb-4 font-normal text-sm leading-relaxed">
                            Through direct alignment with the <strong className="text-rs-deep-navy font-semibold">Ayushman Bharat Digital Mission (ABDM)</strong>, screening results bind cleanly to each citizen's Ayushman Bharat Health Account (ABHA).
                        </p>
                        <div className="flex items-center gap-3.5 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200">
                            <div className="w-10 h-10 bg-amber-100 text-amber-700 flex items-center justify-center rounded-lg shrink-0 text-lg">
                                🏛️
                            </div>
                            <div>
                                <h4 className="text-amber-900 font-semibold text-sm">Unified Clinical Longitudinal Records</h4>
                                <p className="text-xs text-amber-800/90 mt-0.5 font-normal">Minimizes redundant screenings and integrates findings seamlessly into national e-health systems.</p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Feature 10: Revenue Calculator */}
            <RevenueCalc />
        </div>
    );
}
