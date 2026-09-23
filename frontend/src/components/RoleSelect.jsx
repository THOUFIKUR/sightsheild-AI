import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';

/**
 * RoleSelect — Initial classification for new users.
 * Allows choosing between Medical Professional (Doctor) and Patient/Individual.
 */
export default function RoleSelect({ userId, onComplete }) {
  const navigate = useNavigate();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);

  const selectRole = async (role) => {
    setIsUpdating(true);
    setError(null);
    try {
      // Initialize/Update the profile with the selected role
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ 
          id: userId, 
          role: role,
          profile_complete: false // Onboarding still required
        })
        .select()
        .single();

      if (error) throw error;
      if (onComplete) onComplete(data);
      // Navigate to onboarding
      navigate(role === 'doctor' ? '/onboarding/doctor' : '/onboarding/patient');
    } catch (e) {
      console.error('Role selection failed:', e);
      setError('Failed to update profile. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className='min-h-screen bg-rs-ice flex flex-col items-center justify-center p-6'>
      <div className='max-w-2xl w-full space-y-8 animate-fade-in'>
        <div className='text-center space-y-2.5'>
          <div className='inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rs-primary/10 border border-rs-primary/20 text-rs-primary text-xs font-medium'>
            RetiScan AI Workspace
          </div>
          <h1 className='text-2xl md:text-3xl font-semibold text-rs-deep-navy tracking-tight font-display'>
            Select your account type
          </h1>
          <p className='text-rs-muted font-normal text-sm sm:text-base max-w-lg mx-auto'>
            Choose your primary workflow to customize screening tools and diagnostic telemetry.
          </p>
        </div>

        {error && (
          <div className='bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-rose-800 text-xs font-medium text-center'>
            {error}
          </div>
        )}

        <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>
          {/* DOCTOR CARD */}
          <button
            onClick={() => selectRole('doctor')}
            disabled={isUpdating}
            className='group relative flex flex-col p-6 rounded-2xl bg-white border border-rs-border hover:border-rs-primary/40 transition-all text-left shadow-rs-sm hover:shadow-rs-md overflow-hidden cursor-pointer'
          >
            <div className='w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-2xl mb-4 group-hover:scale-105 transition-transform'>
              🩺
            </div>
            <h3 className='text-lg font-semibold text-rs-deep-navy mb-1.5 font-display'>Medical Professional</h3>
            <p className='text-rs-muted text-xs leading-relaxed font-normal'>
              For ophthalmologists, optometrists, and clinic officers reviewing cases and validating AI grades.
            </p>
            <div className='mt-6 flex items-center gap-1.5 text-rs-primary text-xs font-medium'>
              Continue as Doctor <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </div>
          </button>

          {/* PATIENT CARD */}
          <button
            onClick={() => selectRole('patient')}
            disabled={isUpdating}
            className='group relative flex flex-col p-6 rounded-2xl bg-white border border-rs-border hover:border-rs-primary/40 transition-all text-left shadow-rs-sm hover:shadow-rs-md overflow-hidden cursor-pointer'
          >
            <div className='w-12 h-12 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-2xl mb-4 group-hover:scale-105 transition-transform'>
              👤
            </div>
            <h3 className='text-lg font-semibold text-rs-deep-navy mb-1.5 font-display'>Patient / Individual</h3>
            <p className='text-rs-muted text-xs leading-relaxed font-normal'>
              For individuals tracking personal retinal screenings, medical history, and clinical outreach.
            </p>
            <div className='mt-6 flex items-center gap-1.5 text-rs-primary text-xs font-medium'>
              Continue as Patient <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </div>
          </button>
        </div>

        {isUpdating && (
          <div className="flex items-center justify-center gap-2 text-xs text-rs-muted">
            <div className="w-3.5 h-3.5 border-2 border-rs-primary border-t-transparent rounded-full animate-spin" />
            Configuring workspace...
          </div>
        )}
      </div>
    </div>
  );
}
