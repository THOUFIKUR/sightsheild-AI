import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

/**
 * DoctorOnboarding — Specialist credentialing form for medical professionals.
 * Captures required profile details for clinical screening workflows.
 */
export default function DoctorOnboarding({ userId, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [formData, setFormData] = useState({
    full_name: '',
    age: '',
    registration_id: '',
    specialty: 'Ophthalmology',
    hospital_name: '',
    location: '',
    district: '',
    state: '',
    phone: '',
    contact_number: '',
    url: '',
  });

  // Pull email from Supabase auth automatically
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setEmail(data.user.email);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        id: userId,
        ...formData,
        age: formData.age || null,
        email: email,
        role: 'doctor',
        profile_complete: true,
        updated_at: new Date().toISOString(),
      };
      
      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload)
        .select()
        .single();

      if (error) throw error;
      if (onComplete) onComplete(data);
    } catch (err) {
      console.error('Onboarding failed:', err);
      setError('Registration failed. Please double-check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full bg-rs-ice border border-rs-border rounded-xl px-3.5 py-2.5 text-rs-deep-navy font-normal focus:border-rs-primary focus:bg-white outline-none transition-all text-sm placeholder:text-rs-muted/50 shadow-xs';
  const selectClass = inputClass + ' appearance-none cursor-pointer';
  const labelClass = 'text-xs font-medium text-rs-deep-navy block mb-1';

  return (
    <div className='min-h-screen bg-rs-ice flex flex-col items-center justify-center p-6'>
      <div className='max-w-2xl w-full space-y-6 animate-fade-in'>
        <div className='text-center space-y-2'>
          <h1 className='text-2xl md:text-3xl font-semibold text-rs-deep-navy tracking-tight font-display'>
            Clinical Credentialing
          </h1>
          <p className='text-rs-muted font-normal text-sm'>
            Please finalize your professional credentials to access diagnostic triage tools.
          </p>
        </div>

        {error && (
          <div className='bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-rose-800 text-xs font-medium text-center'>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className='bg-white border border-rs-border rounded-2xl p-6 sm:p-8 space-y-5 shadow-rs-sm'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5'>
            <div className='space-y-1'>
              <label className={labelClass}>Full legal name</label>
              <input required type='text' placeholder='Dr. R. Sharma' className={inputClass}
                value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} />
            </div>
            <div className='space-y-1'>
              <label className={labelClass}>Age</label>
              <input required type='number' placeholder='Age' className={inputClass + ' font-mono'}
                value={formData.age} onChange={e => setFormData({ ...formData, age: e.target.value })} />
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5'>
            <div className='space-y-1'>
              <label className={labelClass}>Medical registration ID (MRN)</label>
              <input required type='text' placeholder='REG-123456' className={inputClass + ' font-mono'}
                value={formData.registration_id} onChange={e => setFormData({ ...formData, registration_id: e.target.value })} />
            </div>
            <div className='space-y-1'>
              <label className={labelClass}>Primary specialization</label>
              <select className={selectClass}
                value={formData.specialty} onChange={e => setFormData({ ...formData, specialty: e.target.value })}>
                <option>Ophthalmology</option>
                <option>Optometry</option>
                <option>Diabetology</option>
                <option>General Practice</option>
              </select>
            </div>
          </div>

          <div className='space-y-1'>
            <label className={labelClass}>Clinic / Hospital name</label>
            <input required type='text' placeholder='City Retina Care Centre' className={inputClass}
              value={formData.hospital_name} onChange={e => setFormData({ ...formData, hospital_name: e.target.value })} />
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5'>
            <div className='space-y-1'>
              <label className={labelClass}>City / Location</label>
              <input required type='text' placeholder='Mumbai, India' className={inputClass}
                value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
            </div>
            <div className='space-y-1'>
              <label className={labelClass}>District</label>
              <input type='text' placeholder='District' className={inputClass}
                value={formData.district} onChange={e => setFormData({ ...formData, district: e.target.value })} />
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5'>
            <div className='space-y-1'>
              <label className={labelClass}>State</label>
              <input type='text' placeholder='Maharashtra' className={inputClass}
                value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} />
            </div>
            <div className='space-y-1'>
              <label className={labelClass}>Phone number</label>
              <input required type='tel' placeholder='+91 98765 43210' className={inputClass + ' font-mono'}
                value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5'>
            <div className='space-y-1'>
              <label className={labelClass}>Clinic contact number (Optional)</label>
              <input type='tel' placeholder='Clinic phone' className={inputClass + ' font-mono'}
                value={formData.contact_number} onChange={e => setFormData({ ...formData, contact_number: e.target.value })} />
            </div>
            <div className='space-y-1'>
              <label className={labelClass}>Website URL (Optional)</label>
              <input type='url' placeholder='https://...' className={inputClass}
                value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })} />
            </div>
          </div>

          {/* Email from Auth (read-only info) */}
          <div className='space-y-1'>
            <label className={labelClass}>Registered email</label>
            <input type='email' className={inputClass + ' opacity-75 cursor-not-allowed bg-slate-100 font-mono text-xs'} value={email} readOnly />
          </div>

          <button type='submit' disabled={loading}
            className='w-full btn-primary h-11 rounded-xl text-sm font-medium transition-all shadow-rs-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'>
            {loading ? 'Validating Credentials...' : 'Register Credentials'}
          </button>
        </form>
      </div>
    </div>
  );
}
