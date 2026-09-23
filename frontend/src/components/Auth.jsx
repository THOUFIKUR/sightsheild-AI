// Auth.jsx — Authentication portal for medical professionals. Handles login and registration with Supabase.

import { useState } from "react"
import { login, signUp } from "../utils/auth"
import { supabase } from "../utils/supabaseClient"

/**
 * Auth Component
 * Provides a unified interface for medical professionals to sign in or create an account.
 * Features include password visibility toggle, error handling, and responsive split-panel design.
 */
export default function Auth({ onOfflineLogin }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState("login") // 'login' | 'signup' | 'reset'
  const [isLoginMode, setIsLoginMode] = useState(true)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [resetSuccess, setResetSuccess] = useState(false)

  /**
   * Handles the submission of the authentication form.
   * Dispatches to either the login or signUp utility based on the current mode.
   */
  const handleAuthSubmit = async () => {
    setErrorMessage("")
    setIsAuthenticating(true)
    try {
      if (isLoginMode) {
        await login(email, password)
      } else {
        await signUp(email, password)
      }
    } catch (err) {
      setErrorMessage(err.message)
    }
    setIsAuthenticating(false)
  }

  const handleResetPassword = async () => {
    setErrorMessage("")
    setResetSuccess(false)
    setIsAuthenticating(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (error) throw error
      setResetSuccess(true)
    } catch (err) {
      setErrorMessage(err.message)
    }
    setIsAuthenticating(false)
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-rs-ice font-display">
      {/* LEFT PANEL: Branding */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden flex-col justify-between p-12 lg:p-16" style={{
        background: 'linear-gradient(135deg, #06284A 0%, #0A3A6B 40%, #0757A8 100%)',
      }}>
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle, rgba(53,199,244,0.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        
        {/* Decorative gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-rs-cyan/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-rs-orange/5 rounded-full blur-[120px] pointer-events-none" />

        {/* TOP SECTION: Branding & Headline */}
        <div className="z-10 relative">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rs-bright to-rs-cyan flex items-center justify-center shadow-xs">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">RetiScan <span className="text-rs-cyan">AI</span></h1>
          </div>
          <p className="text-white/80 text-xl font-semibold max-w-md leading-snug">
            Clinical Diabetic Retinopathy <span className="text-rs-orange-soft font-semibold">Diagnostics</span>
          </p>
        </div>

        {/* CENTER SECTION: Luminous Retinal Eye Diagnostic Graphic (Dedicated Space, No Text Overlap) */}
        <div className="my-auto py-2 flex items-center justify-center relative z-10 pointer-events-none select-none">
          <div className="w-[280px] h-[280px] lg:w-[320px] lg:h-[320px] xl:w-[350px] xl:h-[350px]">

          <svg viewBox="0 0 500 500" className="w-full h-full drop-shadow-[0_0_35px_rgba(53,199,244,0.35)]">
            <defs>
              {/* Glowing Filters */}
              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="irisGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#020B17" />
                <stop offset="40%" stopColor="#073259" />
                <stop offset="70%" stopColor="#0B5D9E" />
                <stop offset="90%" stopColor="#25B4E8" />
                <stop offset="100%" stopColor="#084E94" />
              </radialGradient>
              <radialGradient id="pupilGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#01060D" />
                <stop offset="75%" stopColor="#030E1C" />
                <stop offset="100%" stopColor="#082A4D" />
              </radialGradient>
              <linearGradient id="eyeOutlineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(53,199,244,0.3)" />
                <stop offset="25%" stopColor="#35C7F4" />
                <stop offset="50%" stopColor="#7DD3FC" />
                <stop offset="75%" stopColor="#1389E8" />
                <stop offset="100%" stopColor="rgba(19,137,232,0.3)" />
              </linearGradient>
            </defs>

            {/* Technical HUD Calibration Scope (Degree ticks & circles) */}
            <circle cx="250" cy="250" r="235" fill="none" stroke="rgba(53,199,244,0.18)" strokeWidth="1" strokeDasharray="3 8" />
            <circle cx="250" cy="250" r="215" fill="none" stroke="rgba(53,199,244,0.25)" strokeWidth="1.2" />
            <circle cx="250" cy="250" r="170" fill="none" stroke="rgba(53,199,244,0.15)" strokeWidth="0.8" strokeDasharray="4 6" />

            {/* Radar Crosshair Axes */}
            <line x1="250" y1="10" x2="250" y2="490" stroke="rgba(53,199,244,0.2)" strokeWidth="1" strokeDasharray="6 6" />
            <line x1="10" y1="250" x2="490" y2="250" stroke="rgba(53,199,244,0.2)" strokeWidth="1" strokeDasharray="6 6" />

            {/* Technical Degree Calibrations */}
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(angle => (
              <line 
                key={angle}
                x1={250 + 215 * Math.cos(angle * Math.PI / 180)}
                y1={250 + 215 * Math.sin(angle * Math.PI / 180)}
                x2={250 + 225 * Math.cos(angle * Math.PI / 180)}
                y2={250 + 225 * Math.sin(angle * Math.PI / 180)}
                stroke="#35C7F4"
                strokeWidth={angle % 90 === 0 ? "2" : "1"}
                opacity={angle % 90 === 0 ? "0.9" : "0.5"}
              />
            ))}

            {/* Human Eye Almond Silhouette & Sclera */}
            <path 
              d="M 35 250 Q 250 80 465 250 Q 250 420 35 250 Z" 
              fill="rgba(6, 32, 60, 0.65)"
              stroke="none"
            />
            {/* Outer Glow Halo on Eyelids */}
            <path 
              d="M 35 250 Q 250 80 465 250" 
              fill="none" 
              stroke="#35C7F4" 
              strokeWidth="6" 
              opacity="0.25" 
              strokeLinecap="round" 
            />
            <path 
              d="M 35 250 Q 250 420 465 250" 
              fill="none" 
              stroke="#1389E8" 
              strokeWidth="6" 
              opacity="0.2" 
              strokeLinecap="round" 
            />
            {/* Crisp Eyelid Contours */}
            <path 
              d="M 35 250 Q 250 80 465 250" 
              fill="none" 
              stroke="url(#eyeOutlineGrad)" 
              strokeWidth="3.5" 
              strokeLinecap="round" 
              filter="url(#neonGlow)"
            />
            <path 
              d="M 35 250 Q 250 420 465 250" 
              fill="none" 
              stroke="url(#eyeOutlineGrad)" 
              strokeWidth="3" 
              strokeLinecap="round" 
            />
            {/* Upper Eyelid Crease */}
            <path 
              d="M 90 205 Q 250 75 410 205" 
              fill="none" 
              stroke="rgba(53,199,244,0.35)" 
              strokeWidth="1.5" 
              strokeDasharray="6 4" 
              strokeLinecap="round" 
            />

            {/* Inner Canthus Details */}
            <circle cx="35" cy="250" r="5" fill="#FF7417" opacity="0.8" />
            <circle cx="465" cy="250" r="3.5" fill="#35C7F4" opacity="0.8" />

            {/* Glowing Iris Container */}
            <circle cx="250" cy="250" r="118" fill="url(#irisGrad)" stroke="#35C7F4" strokeWidth="2.5" filter="url(#neonGlow)" />
            <circle cx="250" cy="250" r="124" fill="none" stroke="rgba(53,199,244,0.7)" strokeWidth="1.5" strokeDasharray="14 6" />

            {/* Iris Radial Fiber Textures */}
            {Array.from({ length: 32 }).map((_, i) => {
              const rad = (i * 360 / 32) * Math.PI / 180;
              return (
                <line 
                  key={i}
                  x1={250 + 58 * Math.cos(rad)}
                  y1={250 + 58 * Math.sin(rad)}
                  x2={250 + 112 * Math.cos(rad)}
                  y2={250 + 112 * Math.sin(rad)}
                  stroke="#38BDF8"
                  strokeWidth="1"
                  opacity={i % 2 === 0 ? "0.6" : "0.3"}
                />
              );
            })}

            {/* Retinal Vasculature Tree (Arteries & Veins) */}
            <g opacity="0.95">
              {/* Optic Disc Core */}
              <circle cx="310" cy="240" r="24" fill="rgba(255,176,103,0.25)" stroke="#FFB067" strokeWidth="2.5" />
              <circle cx="310" cy="240" r="11" fill="#FF7417" opacity="0.9" />

              {/* Superior Temporal Artery */}
              <path d="M 310 240 Q 280 180 220 155 T 140 165" fill="none" stroke="#35C7F4" strokeWidth="2.8" strokeLinecap="round" />
              <path d="M 250 168 Q 220 130 170 120" fill="none" stroke="#35C7F4" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
              
              {/* Inferior Temporal Artery */}
              <path d="M 310 240 Q 285 305 230 330 T 145 320" fill="none" stroke="#35C7F4" strokeWidth="2.8" strokeLinecap="round" />
              <path d="M 260 315 Q 230 360 180 370" fill="none" stroke="#35C7F4" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />

              {/* Superior Nasal & Central Branches */}
              <path d="M 310 240 Q 345 200 395 190" fill="none" stroke="#FF7417" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
              <path d="M 310 240 Q 350 280 400 295" fill="none" stroke="#FF7417" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
              <path d="M 310 240 Q 255 240 205 248" fill="none" stroke="#FF7417" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            </g>

            {/* Macular Foveal Focus Target */}
            <circle cx="210" cy="248" r="22" fill="rgba(255,116,23,0.12)" stroke="#FF7417" strokeWidth="1.8" strokeDasharray="4 4" />
            <circle cx="210" cy="248" r="5" fill="#FF7417" />
            <line x1="195" y1="248" x2="225" y2="248" stroke="#FF7417" strokeWidth="1.5" />
            <line x1="210" y1="233" x2="210" y2="263" stroke="#FF7417" strokeWidth="1.5" />

            {/* High-Tech Biometric Scan Arc */}
            <path 
              d="M 140 200 A 118 118 0 0 1 360 200" 
              fill="none" 
              stroke="#FF7417" 
              strokeWidth="2.5" 
              strokeDasharray="6 6" 
              opacity="0.9" 
            />

            {/* Deep Pupil */}
            <circle cx="250" cy="250" r="54" fill="url(#pupilGrad)" stroke="#38BDF8" strokeWidth="2" />
            <circle cx="250" cy="250" r="50" fill="#020914" />

            {/* Pupil Center Targeting Crosshair */}
            <line x1="238" y1="250" x2="262" y2="250" stroke="#35C7F4" strokeWidth="1.8" />
            <line x1="250" y1="238" x2="250" y2="262" stroke="#35C7F4" strokeWidth="1.8" />

            {/* Realistic Corneal Specular Light Highlight (Brings eye to life) */}
            <ellipse cx="236" cy="234" rx="9" ry="6" fill="#FFFFFF" opacity="0.9" transform="rotate(-30 236 234)" />
            <circle cx="228" cy="242" r="3" fill="#FFFFFF" opacity="0.6" />

            {/* HUD Corner Alignment Brackets */}
            <path d="M 60 70 L 40 70 L 40 90" fill="none" stroke="#35C7F4" strokeWidth="2.5" />
            <path d="M 440 70 L 460 70 L 460 90" fill="none" stroke="#35C7F4" strokeWidth="2.5" />
            <path d="M 60 430 L 40 430 L 40 410" fill="none" stroke="#35C7F4" strokeWidth="2.5" />
            <path d="M 440 430 L 460 430 L 460 410" fill="none" stroke="#35C7F4" strokeWidth="2.5" />

            {/* Biometric HUD Telemetry Text */}
            <text x="270" y="88" fill="#35C7F4" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="1.5">
              AI_SCAN: ACTIVE
            </text>
            <text x="315" y="425" fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="monospace" letterSpacing="1.2">
              FOV 45&deg; &bull; FUNDUS_V3
            </text>
            <text x="60" y="425" fill="#FF7417" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="1.2">
              &bull; RETINAL_GRID: LOCKED
            </text>
          </svg>
          </div>
        </div>

        {/* BOTTOM SECTION: Feature Pills & Runtime Badge */}
        <div className="z-10 relative space-y-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {[
              { label: '94% AI Sensitivity', color: 'bg-rs-cyan' },
              { label: 'Grade 0–4 Classification', color: 'bg-rs-bright' },
              { label: 'Cloud & Offline Sync', color: 'bg-emerald-400' }
            ].map(feat => (
              <div key={feat.label} className="flex items-center gap-2 text-white/80 text-xs font-semibold tracking-wide">
                <span className={`w-2 h-2 rounded-full ${feat.color}`}></span>
                {feat.label}
              </div>
            ))}
          </div>

          <div className="bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 inline-block backdrop-blur-sm shadow-xs">
            <p className="text-rs-cyan text-[10px] font-bold uppercase tracking-[0.2em] mb-0.5">ONNX Runtime Engine</p>
            <p className="text-white/60 text-[10px] font-mono">NEURAL_NET_V3: STATUS_ACTIVE</p>
          </div>
        </div>
      </div>


      {/* RIGHT PANEL: Form Controls */}
      <div className="flex-1 flex flex-col min-h-screen relative overflow-y-auto bg-white">
        {/* Mobile header */}
        <div className="md:hidden absolute top-0 left-0 w-full h-48 bg-gradient-to-b from-rs-primary/5 to-transparent pointer-events-none" />

        <div className="flex-1 flex flex-col justify-center items-center p-6 py-6 md:py-8">
          <div className="w-full max-w-md z-10 space-y-5 sm:space-y-6">
            
            {/* Mobile logo */}
            <div className="md:hidden flex flex-col items-center gap-3 mb-8">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-rs-bright to-rs-cyan flex items-center justify-center shadow-rs-lg">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold text-rs-text tracking-tight font-display">RetiScan <span className="text-rs-bright">AI</span></h1>
            </div>

            <div className="text-center md:text-left space-y-2">
              <h2 className="text-3xl font-extrabold text-rs-text tracking-tight font-display">
                {isLoginMode ? "Welcome Back" : "Create Account"}
              </h2>
              <p className="text-rs-text-secondary text-sm font-medium">
                {isLoginMode ? "Sign in to access your screening portal" : "Register to join the screening network"}
              </p>
            </div>

            {/* Form Card */}
            <div className="space-y-5">
              
              {mode === 'reset' ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-rs-text mb-1.5">Email Address</label>
                    <input
                      type="email"
                      placeholder="doctor@hospital.com"
                      className="input py-3"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErrorMessage(""); setResetSuccess(false); }}
                    />
                  </div>

                  {resetSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-xl text-emerald-600 text-sm font-medium text-center">
                      ✓ Check your email for reset instructions
                    </div>
                  )}

                  <button onClick={handleResetPassword} disabled={isAuthenticating || !email} className="w-full btn-primary py-3 rounded-xl font-semibold text-sm">
                    {isAuthenticating ? 'Sending...' : 'Send Reset Link →'}
                  </button>

                  <div className="text-center">
                    <button onClick={() => { setMode('login'); setErrorMessage(''); setResetSuccess(false); }} className="text-xs font-medium text-rs-text-secondary hover:text-rs-primary transition-colors">
                      ← Back to Sign In
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-rs-text mb-1.5">Email Address</label>
                    <input
                      type="email"
                      placeholder="doctor@hospital.com"
                      autoComplete="email"
                      className="input py-3"
                      onChange={(e) => { setEmail(e.target.value); setErrorMessage(""); }}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-semibold text-rs-text">Password</label>
                      {isLoginMode && (
                        <button type="button" onClick={() => { setMode('reset'); setErrorMessage(''); setResetSuccess(false); }} className="text-[11px] font-medium text-rs-bright hover:text-rs-primary transition-colors">
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={passwordVisible ? "text" : "password"}
                        placeholder="••••••••"
                        className="input py-3 pr-12"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setErrorMessage(""); }}
                      />
                      <button
                        type="button"
                        onClick={() => setPasswordVisible(!passwordVisible)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-rs-text-secondary hover:text-rs-primary transition-colors rounded-lg"
                      >
                        {passwordVisible ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-xl flex items-start gap-2.5 text-red-600 text-sm">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      {errorMessage}
                    </div>
                  )}

                  <button
                    onClick={handleAuthSubmit}
                    disabled={isAuthenticating}
                    className="w-full btn-primary py-3 rounded-xl font-semibold text-sm transition-transform active:scale-[0.98]"
                  >
                    {isAuthenticating ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Verifying...
                      </span>
                    ) : (
                      isLoginMode ? "Sign In →" : "Create Account →"
                    )}
                  </button>

                  {onOfflineLogin && (
                    <div className="space-y-3 pt-1">
                      <div className="relative flex py-1 items-center">
                        <div className="flex-grow border-t border-rs-border"></div>
                        <span className="flex-shrink mx-3 text-[10px] font-medium text-rs-text-secondary">Or continue without account</span>
                        <div className="flex-grow border-t border-rs-border"></div>
                      </div>

                      <button
                        type="button"
                        id="offline-phc-btn"
                        onClick={onOfflineLogin}
                        className="w-full py-3 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold text-xs transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        ⚡ Offline Rural PHC Mode (Instant Demo)
                      </button>
                    </div>
                  )}

                  <div className="text-center pt-1">
                    <p className="text-sm text-rs-text-secondary">
                      {isLoginMode ? "Don't have an account? " : "Already have an account? "}
                      <button
                        onClick={() => { setIsLoginMode(!isLoginMode); setErrorMessage(""); }}
                        className="text-rs-bright hover:text-rs-primary font-semibold transition-colors"
                      >
                        {isLoginMode ? "Sign up" : "Sign in"}
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Impact Bar - Differentiated, high-contrast, premium medical card */}
        <div className="w-full pb-8 flex justify-center px-4 sm:px-6">
          <div className="w-full max-w-xl p-2.5 sm:p-3 rounded-2xl bg-gradient-to-b from-[#EEF4FB] to-[#E3EDF7] border border-[#BDD3E8] shadow-md">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
              
              {/* Metric 1: National Reach */}
              <div className="flex items-center gap-2.5 bg-white px-3 py-2.5 rounded-xl border border-[#D5E3F0] shadow-xs">
                <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200/80 flex items-center justify-center text-[#0757A8] shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="block text-[11px] font-normal text-slate-500">National reach</span>
                  <span className="block text-xs font-semibold text-slate-800 whitespace-nowrap">Deployed in 3 states</span>
                </div>
              </div>

              {/* Metric 2: Clinical Volume */}
              <div className="flex items-center gap-2.5 bg-white px-3 py-2.5 rounded-xl border border-[#D5E3F0] shadow-xs">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-700 shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="block text-[11px] font-normal text-slate-500">Clinical volume</span>
                  <span className="block text-xs font-semibold font-mono text-slate-800 whitespace-nowrap">12,000+ Scans</span>
                </div>
              </div>

              {/* Metric 3: AI Performance */}
              <div className="flex items-center gap-2.5 bg-white px-3 py-2.5 rounded-xl border border-emerald-200 shadow-xs">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="block text-[11px] font-normal text-slate-500">Benchmark</span>
                  <span className="block text-xs font-semibold font-mono text-emerald-800 whitespace-nowrap">94% Accuracy</span>
                </div>
              </div>

            </div>
          </div>
        </div>


      </div>
    </div>
  )
}