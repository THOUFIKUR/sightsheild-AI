import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

/**
 * ProfilePage — Unified identity management with profile picture.
 */
export default function ProfilePage({ userId, profile, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [uploading, setUploading] = useState(false);
  const [email, setEmail] = useState('');

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    age: profile?.age || '',
    gender: profile?.gender || 'Male',
    location: profile?.location || '',
    district: profile?.district || '',
    state: profile?.state || '',
    phone: profile?.phone || '',
    contact_number: profile?.contact_number || '',
    registration_id: profile?.registration_id || '',
    specialty: profile?.specialty || '',
    hospital_name: profile?.hospital_name || '',
    diabetic_history: profile?.diabetic_history || 'No',
    url: profile?.url || '',
  });

  const [initialData, setInitialData] = useState(formData);
  const [initialAvatar, setInitialAvatar] = useState(avatarUrl);
  const isChanged = JSON.stringify(formData) !== JSON.stringify(initialData) || avatarUrl !== initialAvatar;

  // Fetch auth email
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setEmail(data.user.email);
    });
  }, []);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `avatars/${userId}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl + '?t=' + Date.now();
      setAvatarUrl(publicUrl);

      // Save avatar_url in profile
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setMsg({ type: 'error', text: 'Failed to upload photo. Check Supabase storage bucket.' });
    } finally {
      setUploading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const payload = {
        ...formData,
        age: formData.age || null,
        email: email,
        updated_at: new Date().toISOString(),
      };
      if (avatarUrl) payload.avatar_url = avatarUrl;

      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      if (onUpdate) onUpdate(data);
      setInitialData(formData);
      setInitialAvatar(avatarUrl);
      setMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      console.error('Update failed:', err);
      setMsg({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const handleDeleteAccount = async () => {
    if (window.confirm("WARNING: Are you absolutely sure you want to delete your account? This action cannot be undone.")) {
      const confirmText = window.prompt("Type 'delete' to verify full account deletion:");
      if (confirmText?.toLowerCase() === 'delete') {
         setLoading(true);
         try {
           // Delete profile row (which manages all patient linkage and roles natively)
           await supabase.from('profiles').delete().eq('id', userId);
           
           // Clear IndexedDB completely
           const dbName = `RetinaScanDB_${userId}`;
           window.indexedDB.deleteDatabase(dbName);
           window.indexedDB.deleteDatabase('RetinaScanDB');
           
           // Sign out from Supabase which naturally redirects to Auth
           await supabase.auth.signOut();
           window.location.href = '/';
         } catch (err) {
           console.error(err);
           setMsg({ type: 'error', text: 'Failed to delete account. Please contact support.' });
           setLoading(false);
         }
      } else {
         alert("Deletion cancelled. Text did not match 'delete'.");
      }
    }
  };

  const inputClass = 'w-full bg-rs-ice border border-rs-border text-rs-deep-navy font-normal rounded-xl px-3.5 py-2.5 text-sm placeholder:text-rs-muted/50 focus:outline-none focus:ring-2 focus:ring-rs-primary/20 focus:border-rs-primary focus:bg-white transition-all shadow-xs';
  const selectClass = inputClass + ' appearance-none cursor-pointer';
  const labelClass = 'text-xs font-medium text-rs-deep-navy block mb-1';

  return (
    <div className='max-w-4xl mx-auto space-y-6 pb-20 animate-fade-in relative pt-10'>
      {/* Back Button */}
      <button onClick={() => window.history.back()} className="absolute top-0 left-0 flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-rs-border text-rs-deep-navy hover:bg-rs-ice hover:text-rs-primary transition-all group shrink-0 z-10 shadow-rs-xs">
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
      </button>
      
      <div className='flex flex-col md:flex-row md:items-end justify-between gap-4'>
        <div>
          <p className='text-rs-primary text-xs font-medium'>Identity & Profile Management</p>
          <h1 className='text-2xl md:text-3xl font-semibold text-rs-deep-navy font-display tracking-tight leading-tight mt-1'>My Profile</h1>
          <p className='text-rs-muted mt-1 max-w-lg font-normal text-sm'>Manage your personal credentials and institutional affiliations for clinical screening.</p>
        </div>
      </div>

      {msg && (
        <div className={`p-3.5 rounded-xl text-xs font-medium text-center border animate-fade-in ${
          msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleUpdate} className='bg-white border border-rs-border rounded-2xl p-6 md:p-8 space-y-6 shadow-rs-sm'>
        {/* Avatar + Role Badge */}
        <div className='flex flex-col sm:flex-row items-center gap-5 p-5 rounded-xl bg-rs-ice/60 border border-rs-border'>
          {/* Avatar */}
          <div className='relative group'>
            <div className='w-20 h-20 rounded-xl overflow-hidden border border-rs-border bg-rs-deep-navy flex items-center justify-center shadow-rs-sm'>
              {avatarUrl ? (
                <img src={avatarUrl} alt='Profile' className='w-full h-full object-cover' />
              ) : (
                <span className='text-2xl font-semibold text-white font-display'>{getInitials(formData.full_name)}</span>
              )}
            </div>
            <label className='absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity'>
              <input type='file' accept='image/*' className='hidden' onChange={handleAvatarUpload} disabled={uploading} />
              {uploading ? (
                <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
              ) : (
                <svg className='w-5 h-5 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.8} d='M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z' />
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.8} d='M15 13a3 3 0 11-6 0 3 3 0 016 0z' />
                </svg>
              )}
            </label>
          </div>

          <div className='text-center sm:text-left flex-1'>
            <p className='text-xs font-normal text-rs-muted'>Account Role</p>
            <div className='mt-1 flex items-center justify-center sm:justify-start gap-2'>
              <span className='px-2.5 py-0.5 bg-rs-primary/10 border border-rs-primary/20 text-rs-primary rounded-md text-xs font-medium capitalize'>{profile?.role || 'User'}</span>
            </div>
            <p className='text-rs-deep-navy text-xs font-mono mt-2'>{email}</p>
            <p className='text-rs-muted text-[11px] mt-0.5 font-normal'>Hover on photo to update</p>
          </div>
        </div>

        {/* Form Fields */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>
          {/* ───── COMMON FIELDS ───── */}
          <div className='space-y-1'>
            <label className={labelClass}>Full name</label>
            <input required type='text' className={inputClass} placeholder='Your full name'
              value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
          </div>
          <div className='space-y-1'>
            <label className={labelClass}>Email address</label>
            <input type='email' className={inputClass + ' opacity-75 cursor-not-allowed bg-slate-100 font-mono text-xs'} value={email} readOnly title='Email is managed via authentication' />
          </div>
          <div className='space-y-1'>
            <label className={labelClass}>Phone number</label>
            <input type='tel' className={inputClass + ' font-mono'} placeholder='+91 98765 43210'
              value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
          </div>
          <div className='space-y-1'>
            <label className={labelClass}>City / Location</label>
            <input type='text' className={inputClass} placeholder='Chennai, India'
              value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
          </div>
          <div className='space-y-1'>
            <label className={labelClass}>District</label>
            <input type='text' className={inputClass} placeholder='District'
              value={formData.district} onChange={e => setFormData({...formData, district: e.target.value})} />
          </div>
          <div className='space-y-1'>
            <label className={labelClass}>State</label>
            <input type='text' className={inputClass} placeholder='Tamil Nadu'
              value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
          </div>

          {/* ───── DOCTOR SPECIFIC ───── */}
          {profile?.role === 'doctor' && (
            <>
              <div className='space-y-1'>
                <label className={labelClass}>Age</label>
                <input type='number' className={inputClass + ' font-mono'} placeholder='Age'
                  value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} />
              </div>
              <div className='space-y-1'>
                <label className={labelClass}>Medical registration ID (MRN)</label>
                <input type='text' className={inputClass + ' font-mono'} placeholder='REG-123456'
                  value={formData.registration_id} onChange={e => setFormData({...formData, registration_id: e.target.value})} />
              </div>
              <div className='space-y-1'>
                <label className={labelClass}>Clinical specialty</label>
                <select className={selectClass}
                  value={formData.specialty} onChange={e => setFormData({...formData, specialty: e.target.value})}>
                  <option>Ophthalmology</option>
                  <option>Optometry</option>
                  <option>Diabetology</option>
                  <option>General Practice</option>
                </select>
              </div>
              <div className='space-y-1'>
                <label className={labelClass}>Clinic / Hospital</label>
                <input type='text' className={inputClass} placeholder='City Retina Care Centre'
                  value={formData.hospital_name} onChange={e => setFormData({...formData, hospital_name: e.target.value})} />
              </div>
              <div className='space-y-1'>
                <label className={labelClass}>Clinic contact number</label>
                <input type='tel' className={inputClass + ' font-mono'} placeholder='+91 98765 43210'
                  value={formData.contact_number} onChange={e => setFormData({...formData, contact_number: e.target.value})} />
              </div>
              <div className='space-y-1'>
                <label className={labelClass}>Website URL</label>
                <input type='url' className={inputClass} placeholder='https://...'
                  value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} />
              </div>
            </>
          )}

          {/* ───── PATIENT SPECIFIC ───── */}
          {profile?.role === 'patient' && (
            <>
              <div className='space-y-1'>
                <label className={labelClass}>Age</label>
                <input type='number' className={inputClass + ' font-mono'} placeholder='Age'
                  value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} />
              </div>
              <div className='space-y-1'>
                <label className={labelClass}>Gender</label>
                <select className={selectClass}
                  value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
              <div className='space-y-1'>
                <label className={labelClass}>Contact number</label>
                <input type='tel' className={inputClass + ' font-mono'} placeholder='+91 98765 43210'
                  value={formData.contact_number} onChange={e => setFormData({...formData, contact_number: e.target.value})} />
              </div>
              <div className='space-y-1 md:col-span-2'>
                <label className={labelClass}>Diabetic history</label>
                <select className={selectClass}
                  value={formData.diabetic_history} onChange={e => setFormData({...formData, diabetic_history: e.target.value})}>
                  <option>No</option>
                  <option>Yes, Type-1</option>
                  <option>Yes, Type-2</option>
                  <option>Gestational</option>
                  <option>Unknown</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className='pt-2'>
          <button 
            type='submit' 
            disabled={loading || !isChanged} 
            className={isChanged ? 'w-full btn-primary h-11 rounded-xl font-medium text-sm transition-all shadow-rs-sm' : 'w-full bg-rs-ice border border-rs-border text-rs-muted font-normal h-11 rounded-xl transition-all cursor-not-allowed text-sm'}
          >
            {loading ? 'Saving Changes...' : isChanged ? 'Save Profile Changes' : 'Profile Up to Date'}
          </button>
          
          <button type='button' onClick={handleDeleteAccount} disabled={loading} className='w-full mt-2.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50/50 text-rose-700 font-medium text-xs hover:bg-rose-100/60 transition-all'>
            Delete Account
          </button>
        </div>
      </form>
    </div>
  );
}
