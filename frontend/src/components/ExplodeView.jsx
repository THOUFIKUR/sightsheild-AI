// ExplodeView.jsx — Cinematic retinal visualization for the landing page.
// Pure CSS/SVG animation. No WebGL. No backend API calls.
// 4-second mandatory animation in the beginning with no skip option.

import { useState, useEffect } from 'react';

const TOTAL_DURATION = 4000; // Exact 4-second mandatory animation

// Retinal structure labels with positions timed for 4s sequence
const LABELS = [
  { text: 'RETINAL SURFACE', x: -180, y: -90, delay: 1700 },
  { text: 'VASCULAR NETWORK', x: 170, y: -60, delay: 1900 },
  { text: 'MACULA', x: -160, y: 30, delay: 2100 },
  { text: 'OPTIC DISC', x: 150, y: 60, delay: 2300 },
  { text: 'AI DETECTION', x: -140, y: 110, delay: 2500 },
];

export default function ExplodeView({ onComplete }) {
  const [phase, setPhase] = useState(0); // 0=init, 1=scanning, 2=reveal, 3=explode, 4=detect, 5=converge, 6=done
  const [visible, setVisible] = useState(true);

  // Exact 4-second mandatory animation timeline
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),    // Scanning point ignite
      setTimeout(() => setPhase(2), 800),    // Scan rings expand + retina reveal
      setTimeout(() => setPhase(3), 1700),   // Explode retinal layers + labels
      setTimeout(() => setPhase(4), 2600),   // AI laser sweep + lesion detection
      setTimeout(() => setPhase(5), 3400),   // Converge & calibrate
      setTimeout(() => {
        setPhase(6);                         // Fade out
      }, 3750),
      setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, TOTAL_DURATION),
    ];

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between p-6 sm:p-10 transition-opacity duration-300 ${
        phase === 6 ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ background: 'linear-gradient(135deg, #06284A 0%, #0A3A6B 40%, #0D4D8A 100%)' }}
    >
      {/* Subtle background grid */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, rgba(53,199,244,0.3) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* TOP: Header Branding (Placed safely above the retina) */}
      <div className={`relative z-10 text-center transition-all duration-500 pt-4 sm:pt-6 pointer-events-none ${
        phase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}>
        <h2 className="text-white font-display font-semibold text-2xl sm:text-3xl tracking-tight">
          Reti<span className="text-rs-cyan">Scan</span> <span className="text-white/70 font-normal text-base sm:text-lg">AI</span>
        </h2>
        <p className="text-white/60 text-xs mt-1 font-normal tracking-wide">Autonomous Retinopathy Intelligence</p>
      </div>

      {/* CENTER: Main Retinal Visualization Container (Isolated, No text collisions) */}
      <div className="relative z-10 w-[280px] h-[280px] sm:w-[360px] sm:h-[360px] my-auto flex items-center justify-center">
        
        {/* Phase 1: Scanning Point */}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
          phase >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
        }`}>
          <div className="w-3.5 h-3.5 rounded-full bg-rs-cyan shadow-[0_0_20px_rgba(53,199,244,0.9),0_0_60px_rgba(53,199,244,0.5)]" />
        </div>

        {/* Phase 2: Scan Ring */}
        {phase >= 2 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 rounded-full border-2 border-rs-cyan/70 ev-scan-ring" />
            <div className="absolute w-32 h-32 rounded-full border border-rs-cyan/40 ev-scan-ring" style={{ animationDelay: '0.15s' }} />
            <div className="absolute w-44 h-44 rounded-full border border-rs-cyan/20 ev-scan-ring" style={{ animationDelay: '0.3s' }} />
          </div>
        )}

        {/* Phase 2+: Retinal Structure SVG */}
        <svg 
          viewBox="-200 -200 400 400" 
          className={`absolute inset-0 w-full h-full transition-all duration-700 ${
            phase >= 2 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Outer retinal circle */}
          <circle cx="0" cy="0" r="150" fill="none" stroke="rgba(53,199,244,0.25)" strokeWidth="1.5"
            className={phase >= 2 ? 'ev-vessel-draw' : ''} style={{ strokeDasharray: 950, animationDuration: '1.2s' }} />
          <circle cx="0" cy="0" r="130" fill="none" stroke="rgba(53,199,244,0.15)" strokeWidth="0.8" />
          <circle cx="0" cy="0" r="110" fill="none" stroke="rgba(53,199,244,0.12)" strokeWidth="0.8" />

          {/* Blood vessel network - Layer 1 (main arteries) */}
          <g className={`transition-all duration-700 ${phase >= 3 ? 'opacity-100' : 'opacity-85'}`}
             style={{ 
               transform: phase >= 3 && phase < 5 ? 'translateY(-35px) scale(0.92)' : 'translateY(0) scale(1)',
               transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
               transformOrigin: 'center',
             }}>
            {/* Main vessels */}
            <path d="M0,0 Q-40,-60 -80,-100 Q-100,-120 -130,-110" fill="none" stroke="#35C7F4" strokeWidth="2.5" opacity="0.9"
              className={phase >= 2 ? 'ev-vessel-draw' : ''} style={{ animationDelay: '0.2s' }} />
            <path d="M0,0 Q40,-50 90,-90 Q110,-100 130,-85" fill="none" stroke="#35C7F4" strokeWidth="2.5" opacity="0.9"
              className={phase >= 2 ? 'ev-vessel-draw' : ''} style={{ animationDelay: '0.3s' }} />
            <path d="M0,0 Q-50,40 -100,70 Q-120,80 -125,110" fill="none" stroke="#35C7F4" strokeWidth="2" opacity="0.75"
              className={phase >= 2 ? 'ev-vessel-draw' : ''} style={{ animationDelay: '0.4s' }} />
            <path d="M0,0 Q50,50 100,80 Q115,90 120,115" fill="none" stroke="#35C7F4" strokeWidth="2" opacity="0.75"
              className={phase >= 2 ? 'ev-vessel-draw' : ''} style={{ animationDelay: '0.5s' }} />
            {/* Secondary branches */}
            <path d="M-40,-30 Q-70,-50 -90,-40" fill="none" stroke="#35C7F4" strokeWidth="1.2" opacity="0.6"
              className={phase >= 2 ? 'ev-vessel-draw' : ''} style={{ animationDelay: '0.6s' }} />
            <path d="M40,-25 Q60,-45 85,-55" fill="none" stroke="#35C7F4" strokeWidth="1.2" opacity="0.6"
              className={phase >= 2 ? 'ev-vessel-draw' : ''} style={{ animationDelay: '0.7s' }} />
            <path d="M-30,20 Q-55,35 -75,55" fill="none" stroke="#35C7F4" strokeWidth="1.2" opacity="0.6"
              className={phase >= 2 ? 'ev-vessel-draw' : ''} style={{ animationDelay: '0.8s' }} />
            <path d="M30,30 Q55,50 80,45" fill="none" stroke="#35C7F4" strokeWidth="1.2" opacity="0.6"
              className={phase >= 2 ? 'ev-vessel-draw' : ''} style={{ animationDelay: '0.9s' }} />
          </g>

          {/* Macula - Layer 2 */}
          <g style={{ 
            transform: phase >= 3 && phase < 5 ? 'translateY(-12px) scale(0.96)' : 'translateY(0) scale(1)',
            transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            transformOrigin: 'center',
          }}>
            <circle cx="-30" cy="10" r="26" fill="rgba(255,116,23,0.12)" stroke="rgba(255,116,23,0.5)" strokeWidth="1.5"
              className={`transition-opacity duration-500 ${phase >= 2 ? 'opacity-100' : 'opacity-0'}`} />
            <circle cx="-30" cy="10" r="12" fill="rgba(255,116,23,0.25)" stroke="rgba(255,116,23,0.7)" strokeWidth="1"
              className={`transition-opacity duration-500 ${phase >= 2 ? 'opacity-100' : 'opacity-0'}`} />
          </g>

          {/* Optic disc - Layer 3 */}
          <g style={{ 
            transform: phase >= 3 && phase < 5 ? 'translateY(25px) scale(0.94)' : 'translateY(0) scale(1)',
            transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            transformOrigin: 'center',
          }}>
            <circle cx="50" cy="-5" r="22" fill="rgba(255,176,103,0.15)" stroke="rgba(255,176,103,0.6)" strokeWidth="2"
              className={`transition-opacity duration-500 ${phase >= 2 ? 'opacity-100' : 'opacity-0'}`} />
            <circle cx="50" cy="-5" r="9" fill="rgba(255,176,103,0.4)"
              className={`transition-opacity duration-500 ${phase >= 2 ? 'opacity-100' : 'opacity-0'}`} />
          </g>

          {/* AI Detection dots - Phase 4 */}
          {phase >= 4 && (
            <g>
              {[
                { cx: -60, cy: -50, delay: '0s' },
                { cx: -80, cy: 40, delay: '0.1s' },
                { cx: 70, cy: -60, delay: '0.2s' },
                { cx: 90, cy: 50, delay: '0.3s' },
                { cx: -20, cy: 80, delay: '0.4s' },
              ].map((dot, i) => (
                <g key={i}>
                  <circle cx={dot.cx} cy={dot.cy} r="7" fill="none" stroke="#FF7417" strokeWidth="2" opacity="0.8"
                    className="ev-dot" style={{ animationDelay: dot.delay }} />
                  <circle cx={dot.cx} cy={dot.cy} r="3" fill="#FF7417" opacity="1"
                    className="ev-dot" style={{ animationDelay: dot.delay }} />
                </g>
              ))}
            </g>
          )}

          {/* Scanning beam - Phase 4 */}
          {phase >= 4 && phase < 5 && (
            <rect x="-160" y="-3" width="320" height="6" fill="url(#scanBeamGrad)" rx="3"
              style={{ animation: 'ev-scan-beam 0.8s ease-in-out forwards' }} />
          )}

          <defs>
            <linearGradient id="scanBeamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="30%" stopColor="rgba(53,199,244,0.5)" />
              <stop offset="50%" stopColor="rgba(53,199,244,0.9)" />
              <stop offset="70%" stopColor="rgba(53,199,244,0.5)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
        </svg>

        {/* Labels - Phase 3+ */}
        {phase >= 3 && phase < 5 && (
          <div className="absolute inset-0 pointer-events-none">
            {LABELS.map((label, i) => (
              <div
                key={i}
                className="absolute ev-label"
                style={{
                  left: `calc(50% + ${label.x}px)`,
                  top: `calc(50% + ${label.y}px)`,
                  animationDelay: `${(label.delay - 1700) / 1000}s`,
                  opacity: 0,
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-4 h-px bg-rs-cyan/60" />
                  <span className="text-[9px] font-bold tracking-[0.18em] text-rs-cyan whitespace-nowrap drop-shadow-sm">
                    {label.text}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM SECTION: Workflow Steps + 4s Mandatory Initial Loading Progress Bar */}
      <div className="relative z-10 flex flex-col items-center gap-4 pb-4 sm:pb-6 pointer-events-none">
        {/* WORKFLOW STEPS: Positioned between Retina and Initializing Part */}
        <div className={`transition-all duration-500 ${
          phase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}>
          <div className="flex items-center justify-center gap-2.5 sm:gap-4 px-5 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-xs shadow-inner">
            {['SCAN', 'UNDERSTAND', 'DETECT', 'PROTECT'].map((word, i) => (
              <span key={word} className={`text-[10px] sm:text-[11px] font-mono font-medium tracking-[0.12em] transition-all duration-300 flex items-center gap-2.5 sm:gap-4 ${
                phase >= i + 2 ? 'text-rs-cyan drop-shadow-[0_0_8px_rgba(53,199,244,0.7)]' : 'text-white/35'
              }`}>
                {word}
                {i < 3 && <span className="text-white/20 text-xs font-mono">&rarr;</span>}
              </span>
            ))}
          </div>
        </div>

        {/* 4s Mandatory Initial Loading Progress Bar */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-mono tracking-wider text-rs-cyan font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-rs-cyan animate-ping" />
            INITIALIZING RETINAL AI DIAGNOSTICS &bull; 4.0s
          </div>
          <div className="w-56 sm:w-80 h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/10">
            <div 
              className="h-full bg-gradient-to-r from-rs-cyan via-rs-bright to-rs-orange rounded-full"
              style={{ animation: 'ev-progress 4s linear forwards' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
