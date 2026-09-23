import { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Doctor pin — clinical blue/violet pin
const doctorMarkerIcon = L.divIcon({
    html: `<div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(7,87,168,0.2);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="width:14px;height:14px;border-radius:50%;background:#0757A8;border:2.5px solid #fff;box-shadow:0 0 10px rgba(7,87,168,0.6);"></div>
    </div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
});

// User "You are here" pin — blue glow pulse
const userMarkerIcon = L.divIcon({
    html: `<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(30,144,255,0.2);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="position:absolute;width:24px;height:24px;border-radius:50%;background:rgba(30,144,255,0.15);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;animation-delay:0.5s;"></div>
        <div style="width:14px;height:14px;border-radius:50%;background:#0284c7;border:2.5px solid #fff;box-shadow:0 0 12px rgba(2,132,199,0.8);"></div>
    </div>`,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22]
});

// Auto-fit map to show all markers
function FitBounds({ doctors, userPos }) {
    const map = useMap();
    useEffect(() => {
        const points = [];
        if (userPos) points.push(userPos);
        doctors.forEach(d => {
            if (d.lat && d.lng) points.push([d.lat, d.lng]);
        });
        if (points.length > 1) {
            map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
        } else if (points.length === 1) {
            map.setView(points[0], 10);
        }
    }, [doctors, userPos, map]);
    return null;
}

/**
 * FindDoctors — Discovery portal with live map showing your location + doctor locations.
 */
export default function FindDoctors() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userPos, setUserPos] = useState(null);
  const [locationStatus, setLocationStatus] = useState('detecting');

  // Get user's live GPS location
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setLocationStatus('found');
      },
      (err) => {
        console.warn('Geolocation failed:', err.message);
        setLocationStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    async function fetchDoctors() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'doctor')
          .eq('profile_complete', true);

        if (error) throw error;
        
        const docs = data || [];
        const geocodedDocs = [];
        
        for (const doc of docs) {
            let processedDoc = { ...doc };
            if (doc.district || doc.state || doc.location) {
                const queryStr = `${doc.district || doc.location || ''},${doc.state || ''},India`
                  .replace(/^,+|,+$/g, '')
                  .replace(/,+/g, ',');
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryStr)}&format=json`);
                    const results = await res.json();
                    if (results && results.length > 0) {
                        processedDoc.lat = parseFloat(results[0].lat);
                        processedDoc.lng = parseFloat(results[0].lon);
                    }
                } catch (e) {
                    console.warn(`Could not geocode ${queryStr}`, e);
                }
            }
            geocodedDocs.push(processedDoc);
        }

        setDoctors(geocodedDocs);
      } catch (err) {
        console.error('Failed to load doctors:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDoctors();
  }, []);

  const filteredDoctors = doctors.filter(d => {
    const q = search.toLowerCase();
    return (
      d.full_name?.toLowerCase().includes(q) ||
      d.specialty?.toLowerCase().includes(q) ||
      d.location?.toLowerCase().includes(q) ||
      d.district?.toLowerCase().includes(q) ||
      d.state?.toLowerCase().includes(q) ||
      d.hospital_name?.toLowerCase().includes(q)
    );
  });

  const defaultCenter = [13.0827, 80.2707];
  const mapCenter = userPos || defaultCenter;

  return (
    <div className='max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in relative pt-10'>
      {/* Back Button */}
      <button onClick={() => window.history.back()} className="absolute top-0 left-0 flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-rs-border text-rs-deep-navy hover:bg-rs-ice hover:text-rs-primary transition-all group shrink-0 z-10 shadow-rs-xs">
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
      </button>
      
      <div className='flex flex-col md:flex-row md:items-end justify-between gap-4'>
        <div>
          <p className='text-rs-primary text-xs font-medium'>Ophthalmic Referral Network</p>
          <h1 className='text-2xl md:text-3xl font-semibold text-rs-deep-navy font-display tracking-tight leading-tight mt-1'>Find Clinical Specialists</h1>
          <p className='text-rs-muted mt-1 max-w-lg font-normal text-sm'>Connect with certified ophthalmologists and retinal specialists for diagnostic review.</p>
        </div>

        <div className='relative group z-10'>
          <div className='absolute inset-y-0 left-3.5 flex items-center pointer-events-none'>
            <svg className="w-4 h-4 text-slate-400 group-focus-within:text-rs-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by name, specialty, or city..."
            className='w-full md:w-80 bg-white border border-rs-border rounded-xl pl-10 pr-4 py-2.5 text-rs-deep-navy font-normal text-sm placeholder:text-rs-muted/50 focus:border-rs-primary outline-none transition-all shadow-xs'
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Location Status Bar */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {locationStatus === 'found' && (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-normal">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Location detected
          </span>
        )}
        {locationStatus === 'detecting' && (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-normal">
            <div className="w-2.5 h-2.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            Detecting location...
          </span>
        )}
        {locationStatus === 'denied' && (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Location access denied — enable GPS for proximity
          </span>
        )}
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rs-ice border border-rs-border text-rs-deep-navy text-xs font-normal">
          <span className="w-1.5 h-1.5 rounded-full bg-rs-primary"></span>
          <span className="font-mono">{doctors.filter(d => d.lat && d.lng).length}</span> specialists mapped
        </span>
      </div>
      
      {/* MAP VIEW */}
      {!loading && (
        <div className="w-full rounded-2xl overflow-hidden shadow-rs-sm border border-rs-border z-0 h-[280px] md:h-[400px] relative isolate">
          <MapContainer center={mapCenter} zoom={7} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer 
               url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
               attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
               maxZoom={19}
            />

            {/* Auto-fit bounds */}
            <FitBounds doctors={doctors} userPos={userPos} />

            {/* YOUR location */}
            {userPos && (
              <Marker position={userPos} icon={userMarkerIcon}>
                <Popup>
                  <div className="-m-1 text-center font-sans">
                    <p className="text-xs font-semibold text-blue-600 leading-none">Your current position</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Doctor locations */}
            {doctors.filter(d => d.lat && d.lng).map(doctor => (
               <Marker key={`map-${doctor.id}`} position={[doctor.lat, doctor.lng]} icon={doctorMarkerIcon}>
                 <Popup>
                    <div className="-m-1 font-sans" style={{ minWidth: '170px' }}>
                        <p className="text-xs font-semibold mb-0.5 leading-tight text-rs-deep-navy font-display">{doctor.full_name}</p>
                        <p className="text-[11px] text-rs-primary font-medium mb-1.5">{doctor.specialty || 'Ophthalmologist'}</p>
                        <p className="text-[11px] text-rs-muted mb-2">{doctor.hospital_name || doctor.location || 'Clinic'}</p>
                        <button 
                           onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${doctor.lat},${doctor.lng}`)}
                           style={{ width: '100%', background: '#0757A8', color: '#fff', fontSize: '11px', fontWeight: 500, padding: '6px 0', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
                        >
                           Get Directions
                        </button>
                    </div>
                 </Popup>
               </Marker>
            ))}
          </MapContainer>
          
          {/* Map Legend overlay */}
          <div className="absolute bottom-3 left-3 z-[20] flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-rs-border shadow-rs-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
              <span className="text-[11px] text-rs-muted font-normal">You</span>
            </div>
            <div className="w-px h-3 bg-rs-border"></div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rs-primary"></div>
              <span className="text-[11px] text-rs-muted font-normal">Specialists</span>
            </div>
          </div>

          <style>{`
            @keyframes ping {
              75%, 100% { transform: scale(2); opacity: 0; }
            }
            .leaflet-container {
                font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 1 !important;
            }
            .leaflet-popup-content-wrapper {
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
            }
          `}</style>
        </div>
      )}

      {loading ? (
        <div className='flex flex-col items-center justify-center p-16 space-y-3'>
          <div className='w-8 h-8 border-3 border-rs-primary border-t-transparent rounded-full animate-spin' />
          <p className='text-xs font-normal text-rs-muted'>Loading medical directory...</p>
        </div>
      ) : filteredDoctors.length > 0 ? (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2'>
          {filteredDoctors.map(doctor => (
            <div key={doctor.id} className='bg-white border border-rs-border rounded-2xl hover:border-rs-primary/40 hover:shadow-rs-md transition-all p-5 relative flex flex-col justify-between shadow-rs-sm'>
               
               <div>
                 <div className='flex items-center gap-3.5 mb-4 border-b border-rs-border pb-4'>
                    {doctor.avatar_url ? (
                      <img src={doctor.avatar_url} alt={doctor.full_name} className='w-14 h-14 rounded-xl object-cover shrink-0 border border-rs-border' />
                    ) : (
                      <div className='w-14 h-14 rounded-xl bg-rs-ice border border-rs-border flex items-center justify-center shrink-0 text-rs-primary font-display font-semibold text-lg'>
                        {doctor.full_name?.slice(0, 2)?.toUpperCase() || 'DR'}
                      </div>
                    )}
                    
                    <div className='space-y-0.5 flex-1 min-w-0'>
                      <div className="flex items-center gap-1 text-emerald-700 text-[11px] font-medium mb-0.5">
                         <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                         Verified specialist
                      </div>
                      <h3 className='text-base font-semibold text-rs-deep-navy font-display line-clamp-1'>
                         {doctor.full_name}
                      </h3>
                      <p className='text-rs-muted font-normal text-xs truncate'>{doctor.specialty || 'Ophthalmology'}</p>
                    </div>
                 </div>

                 <div className="flex items-center justify-between mb-4 text-xs">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1 font-mono text-rs-deep-navy font-semibold">
                            <span className="text-amber-500">★ 4.9</span>
                            <span className="text-rs-muted text-xs font-normal">(243)</span>
                        </div>
                        <div className="text-[11px] text-rs-muted font-normal">Patient reviews</div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1 text-emerald-700 text-xs font-normal">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Available
                        </div>
                        <div className="text-rs-muted text-xs font-normal truncate max-w-[130px]">
                           {doctor.location || 'Clinical Center'}
                        </div>
                    </div>
                 </div>
               </div>

               <button 
                 onClick={() => {
                   if(doctor.contact_number) window.location.href = `tel:${doctor.contact_number}`;
                   else if(doctor.email) window.location.href = `mailto:${doctor.email}`;
                   else alert('Contact information is currently unavailable for this specialist.');
                 }}
                 className='w-full py-2.5 rounded-xl btn-primary text-xs font-medium transition-all shadow-rs-sm flex items-center justify-center gap-1.5 cursor-pointer'>
                 Contact Specialist
                 <svg className="w-3.5 h-3.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
               </button>
            </div>
          ))}
        </div>
      ) : (
        <div className='bg-white border border-rs-border rounded-2xl flex flex-col items-center justify-center p-12 text-center space-y-3 shadow-rs-sm'>
           <div className='text-3xl'>🔍</div>
           <div className='space-y-1'>
              <h3 className='text-base font-semibold text-rs-deep-navy font-display'>No specialists discovered</h3>
              <p className='text-rs-muted text-xs max-w-sm font-normal'>No clinicians registered under this search criteria. Please adjust your query.</p>
           </div>
           <button onClick={() => setSearch('')} className='text-rs-primary font-medium text-xs hover:underline pt-1'>Reset Search</button>
        </div>
      )}
    </div>
  );
}
