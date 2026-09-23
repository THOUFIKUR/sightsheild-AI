// ResetPassword.jsx — Handles the password reset flow after clicking the email link.
// Supabase auto-parses the token from the URL hash on mount, so we just check for a session.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [hasSession, setHasSession] = useState(null) // null = loading
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)

  // Supabase parses the #access_token hash ASYNCHRONOUSLY after page mount.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasSession(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasSession(true);
      } else if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
        setHasSession(false);
      }
    });

    const fallbackTimer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session === null) setHasSession(false);
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, [])

  const handleSubmit = async () => {
    setErrorMessage('')
    if (!newPassword || !confirmPassword) {
      setErrorMessage('Please fill in both password fields.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please try again.')
      return
    }
    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.')
      return
    }

    setIsSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setSuccessMessage('Password updated successfully.')
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      setErrorMessage(err.message)
    }
    setIsSubmitting(false)
  }

  // ── Loading state ──────────────────────────────
  if (hasSession === null) {
    return (
      <div className="min-h-screen bg-rs-ice flex items-center justify-center">
        <div className="flex items-center gap-3 text-rs-muted">
          <svg className="animate-spin h-5 w-5 text-rs-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm font-medium">Verifying reset authorization...</span>
        </div>
      </div>
    )
  }

  // ── Invalid / expired link ─────────────────────
  if (!hasSession) {
    return (
      <div className="min-h-screen bg-rs-ice flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl bg-rs-primary flex items-center justify-center shadow-rs-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <span className="text-xl font-semibold text-rs-deep-navy font-display">RetiScan</span>
          </div>
          <div className="bg-white border border-rs-border rounded-2xl p-6 sm:p-8 shadow-rs-md text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-rs-deep-navy font-display mb-1.5">Invalid or Expired Link</h2>
            <p className="text-rs-muted text-xs leading-relaxed mb-5">This password reset link has expired or has already been used. Please initiate a new password recovery request.</p>
            <button
              onClick={() => navigate('/')}
              className="w-full btn-primary h-11 rounded-xl text-sm font-medium transition-all shadow-rs-sm"
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Valid session — show set new password form ─
  return (
    <div className="min-h-screen bg-rs-ice flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-rs-primary flex items-center justify-center shadow-rs-sm">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <span className="text-xl font-semibold text-rs-deep-navy font-display">RetiScan</span>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold text-rs-deep-navy tracking-tight font-display">Set New Password</h2>
          <p className="text-rs-muted mt-1 text-xs font-normal">Choose a secure password for your clinical screening account</p>
        </div>

        <div className="bg-white border border-rs-border rounded-2xl p-6 sm:p-8 shadow-rs-md">
          <div className="space-y-4">

            {/* New Password */}
            <div>
              <label className="block text-xs font-medium text-rs-deep-navy mb-1">New password</label>
              <div className="relative">
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-rs-ice border border-rs-border text-rs-deep-navy placeholder:text-rs-muted/50 focus:outline-none focus:ring-2 focus:ring-rs-primary/20 focus:border-rs-primary focus:bg-white transition-all text-sm font-normal"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setErrorMessage('') }}
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible(!passwordVisible)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-rs-muted hover:text-rs-deep-navy transition-colors"
                >
                  {passwordVisible ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-medium text-rs-deep-navy mb-1">Confirm password</label>
              <input
                type={passwordVisible ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-rs-ice border border-rs-border text-rs-deep-navy placeholder:text-rs-muted/50 focus:outline-none focus:ring-2 focus:ring-rs-primary/20 focus:border-rs-primary focus:bg-white transition-all text-sm font-normal"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrorMessage('') }}
              />
            </div>

            {/* Success */}
            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 rounded-xl text-emerald-800 text-xs font-medium">
                ✅ {successMessage} Redirecting...
              </div>
            )}

            {/* Error */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-rose-800 text-xs font-medium">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {errorMessage}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full mt-2 btn-primary h-11 rounded-xl text-sm font-medium transition-all shadow-rs-sm disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? 'Updating Password...' : 'Update Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
