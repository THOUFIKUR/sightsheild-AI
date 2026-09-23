import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

/**
 * PatientOnboarding — Form for individuals/patients.
 * Captures required Supabase profile columns.
 */
export default function PatientOnboarding({ userId, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [formData, setFormData] = useState({
    full_name: '',
    age: '',
    gender: 'Male',
    diabetic_history: 'No',
    location: '',
    district: '',
    state: '',
    phone: '',
    contact_number: '',
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
        role: 'patient',
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
      console.error('Patient onboarding failed:', err);
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full bg-rs-ice border border-rs-border rounded-xl px-3.5 py-2.5 text-rs-deep-navy font-normal focus:border-rs-primary focus:bg-white outline-none transition-all text-sm placeholder:text-rs-muted/50 shadow-xs';
  const selectClass = inputClass + ' appearance-none cursor-pointer';
  const labelClass = 'text-xs font-medium text-rs-deep-navy block mb-1';

  return (
    <div className='min-h-screen bg-rs-ice flex flex-col items-center justify-center py-8 px-4 sm:px-6 pb-safe'>
      <div className='max-w-2xl w-full space-y-6 animate-fade-in'>
        <div className='text-center space-y-2'>
          <h1 className='text-2xl md:text-3xl font-semibold text-rs-deep-navy tracking-tight font-display'>
            Personal Health Profile
          </h1>
          <p className='text-rs-muted font-normal text-sm'>
            Please finalize your profile details to track your diagnostic screening history.
          </p>
        </div>

        {error && (
          <div className='bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-rose-800 text-xs font-medium text-center'>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className='bg-white border border-rs-border rounded-2xl p-6 sm:p-8 space-y-5 shadow-rs-sm'>
          <div className='space-y-1'>
            <label className={labelClass}>Full name</label>
            <input required type='text' placeholder='Your full name' className={inputClass}
              value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} />
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5'>
            <div className='space-y-1'>
              <label className={labelClass}>Age</label>
              <input required type='number' placeholder='Age' className={inputClass + ' font-mono'}
                value={formData.age} onChange={e => setFormData({ ...formData, age: e.target.value })} />
            </div>
            <div className='space-y-1'>
              <label className={labelClass}>Gender</label>
              <select className={selectClass}
                value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div className='space-y-1'>
            <label className={labelClass}>Diabetic history</label>
            <select className={selectClass}
              value={formData.diabetic_history} onChange={e => setFormData({ ...formData, diabetic_history: e.target.value })}>
              <option>No</option>
              <option>Yes, Type-1</option>
              <option>Yes, Type-2</option>
              <option>Gestational</option>
              <option>Unknown</option>
            </select>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5'>
            <div className='space-y-1'>
              <label className={labelClass}>City / Location</label>
              <input required type='text' placeholder='Chennai, India' className={inputClass}
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
              <input type='text' placeholder='Tamil Nadu' className={inputClass}
                value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} />
            </div>
            <div className='space-y-1'>
              <label className={labelClass}>Phone number</label>
              <input required type='tel' placeholder='+91 98765 43210' className={inputClass + ' font-mono'}
                value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
            </div>
          </div>

          <div className='space-y-1'>
            <label className={labelClass}>Alternative contact number (Optional)</label>
            <input type='tel' placeholder='Optional alternative phone' className={inputClass + ' font-mono'}
              value={formData.contact_number} onChange={e => setFormData({ ...formData, contact_number: e.target.value })} />
          </div>

          {/* Email from Auth (read-only info) */}
          <div className='space-y-1'>
            <label className={labelClass}>Registered email</label>
            <input type='email' className={inputClass + ' opacity-75 cursor-not-allowed bg-slate-100 font-mono text-xs'} value={email} readOnly />
          </div>

          <button type='submit' disabled={loading}
            className='w-full btn-primary h-11 rounded-xl text-sm font-medium transition-all shadow-rs-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'>
            {loading ? 'Finalizing Profile...' : 'Complete Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
