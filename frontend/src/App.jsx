// App.jsx — Root component of the RetiScan AI PWA. Handles routing, authentication state, sidebar navigation, and service worker updates.
import { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';

import Auth from './components/Auth';
import BackendIndicator from './components/BackendIndicator';
import BusinessModel from './components/BusinessModel';
import CampDashboard from './components/CampDashboard';
import Dashboard from './components/Dashboard';
import DoctorPortal from './components/DoctorPortal';
import OfflineIndicator from './components/OfflineIndicator';
import ResetPassword from './components/ResetPassword';
import ResultsView from './components/ResultsView';
import Scanner from './components/Scanner';
import ValidationMetrics from './components/ValidationMetrics';
import YoloResultsPage from './components/YoloResultsPage';

// --- NEW ONBOARDING & PROFILE COMPONENTS ---
import RoleSelect from './components/RoleSelect';
import DoctorOnboarding from './components/DoctorOnboarding';
import PatientOnboarding from './components/PatientOnboarding';
import FindDoctors from './components/FindDoctors';
import ProfilePage from './components/ProfilePage';
import ScreeningModeToggle from './components/ScreeningModeToggle';
import ExplodeView from './components/ExplodeView';

import { logout } from './utils/auth';
import { flushSyncQueue, syncPatientsFromCloud } from './utils/indexedDB';
import { supabase } from './utils/supabaseClient';
import { loadMode, saveMode } from './utils/screeningMode';
import { ScreeningContext, useScreeningMode } from './utils/screeningContext';
import { autoPrewarmIfOnline } from './utils/offlineModelManager';

/* ── Icons ── */
const IconDashboard = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-1a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5z" /></svg>
);
const IconScan = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
);
const IconRecords = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
);
const IconInsights = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
);
const IconReports = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
);
const IconOutreach = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);
const IconSettings = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);
const IconProfile = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
);
const IconLogout = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
);
const IconBell = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
);
const IconHome = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
);

/* ── Logo ── */
function RetiScanLogo({ collapsed = false }) {
  return (
    <div className="flex items-center gap-3 px-4 py-5">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rs-bright to-rs-cyan flex items-center justify-center shadow-lg shadow-rs-bright/30 shrink-0 relative">
        {/* Retinal iris icon */}
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        {/* Small accent dot */}
        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rs-orange border-2 border-rs-deep-navy" />
      </div>
      {!collapsed && (
        <div className="flex flex-col min-w-0">
          <span className="text-white font-semibold text-base tracking-tight leading-none font-display">
            RetiScan
          </span>
          <span className="text-rs-cyan/70 text-[10px] font-normal tracking-wide mt-1">
            Clinical Ophthalmology Suite
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Toast notification for service worker updates.
 */
function UpdateToast({ wb, onDismiss }) {
  const handleUpdate = () => {
    if (wb) wb.messageSkipWaiting();
    onDismiss();
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
                    bg-rs-primary text-white text-sm font-semibold px-5 py-3 rounded-2xl
                    shadow-rs-xl border border-rs-bright/30 animate-bounce-once">
      <span>New update available. Refresh to update.</span>
      <button
        onClick={handleUpdate}
        className="ml-1 bg-white text-rs-primary px-3 py-1 rounded-lg text-xs font-bold hover:bg-rs-ice transition-colors"
      >
        Refresh
      </button>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 transition-opacity">✕</button>
    </div>
  );
}

/**
 * Button to trigger PWA installation prompt.
 */
function InstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAlreadyInstalled, setIsAlreadyInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsAlreadyInstalled(true);
        setInstallPrompt(null);
      }
    } else {
      alert("To install RetiScan AI, tap your browser's 'Share' or 'Menu' button and select 'Add to Home Screen'.");
    }
  };

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if (isStandalone || isAlreadyInstalled) return null;
  if (!installPrompt && window.innerWidth < 640) return null;

  return (
    <button
      onClick={handleInstallClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all shrink-0 bg-rs-ice border-rs-border text-rs-text-secondary hover:bg-rs-primary/5 hover:text-rs-primary hover:border-rs-bright/30"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      <span className="hidden sm:inline">
        {isAlreadyInstalled ? 'Installed' : 'Install App'}
      </span>
    </button>
  );
}

/**
 * AppContent Component: Handles the Auth Gate and Main Layout with Sidebar.
 * Must be wrapped in BrowserRouter.
 */
function AppContent({ userSession, setUserSession, userProfile, setUserProfile, profileLoading, sessionChecked, waitingServiceWorker, showUpdateToast, setShowUpdateToast }) {
  const { mode: screeningMode, setMode: setScreeningModeAndSave } = useScreeningMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const isResetPage = location.pathname === '/reset-password';

  const isPatient = userProfile?.role === 'patient';
  const isDoctor = userProfile?.role === 'doctor';

  // Build sidebar navigation based on role
  const sidebarNav = [
    { to: '/', label: 'Dashboard', icon: <IconDashboard /> },
    { to: '/scan', label: 'Scan & Analyze', icon: <IconScan /> },
    { to: '/camp', label: 'Patient Records', icon: <IconRecords /> },
    { to: '/validation', label: 'AI Insights', icon: <IconInsights /> },
    { to: '/business', label: 'Reports', icon: <IconReports /> },
  ];
  
  if (isPatient) {
    sidebarNav.push({ to: '/find-doctors', label: 'Find Doctors', icon: <IconOutreach /> });
  } else if (isDoctor) {
    sidebarNav.push({ to: '/doctor', label: 'Review Cases', icon: <IconOutreach /> });
  }

  sidebarNav.push({ to: '/profile', label: 'Settings', icon: <IconSettings /> });

  // Auth Gate
  if (!userSession && !isResetPage) {
    return (
      <Auth 
        onOfflineLogin={() => {
          const offlineUser = {
            id: 'offline-clinician-phc',
            email: 'field-clinician@rural-phc.gov.in',
            user_metadata: { role: 'doctor' }
          };
          const offlineProfile = {
            id: 'offline-clinician-phc',
            full_name: 'Dr. R. Sharma (Medical Officer)',
            role: 'doctor',
            phone: '+91 98765 43210',
            profile_complete: true,
            offline_mode: true
          };
          setUserSession(offlineUser);
          setUserProfile(offlineProfile);
          sessionStorage.setItem('rs_offline_uid', offlineUser.id);
          sessionStorage.setItem(`rs_offline_profile`, JSON.stringify(offlineProfile));
        }}
      />
    );
  }

  // Show loading spinner while profile loads
  if (userSession && profileLoading) {
    return (
      <div className='min-h-screen bg-rs-ice flex items-center justify-center'>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className='w-12 h-12 border-3 border-rs-border rounded-full' />
            <div className='absolute inset-0 w-12 h-12 border-3 border-rs-bright border-t-transparent rounded-full animate-spin' />
          </div>
          <p className="text-sm text-rs-text-secondary font-medium">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const isEffectivelyComplete = userProfile?.profile_complete || 
    (userProfile?.role && userProfile?.full_name && userProfile?.phone);

  if (userSession && isEffectivelyComplete && location.pathname.startsWith('/onboarding')) {
    return <Navigate to="/" replace />;
  }

  const needsRoleSelection = userSession && !profileLoading &&
    (!userProfile || !userProfile.role);

  const needsOnboarding = userSession && userProfile &&
    userProfile.role && !userProfile.profile_complete;

  if (needsRoleSelection) {
    return <RoleSelect userId={userSession.id}
      onComplete={(profile) => setUserProfile(profile)} />;
  }

  if (needsOnboarding && !location.pathname.startsWith('/onboarding')) {
    const path = userProfile.role === 'doctor' ? '/onboarding/doctor' : '/onboarding/patient';
    return <Navigate to={path} replace />;
  }

  const userName = userProfile?.full_name || 'User';
  const userInitials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-rs-ice flex">
      {/* ═══ SIDEBAR (Desktop) ═══ */}
      <aside className={`rs-sidebar hidden lg:flex transition-all duration-300 ${sidebarCollapsed ? 'w-[68px]' : 'w-[220px]'}`}>
        {/* Logo */}
        <RetiScanLogo collapsed={sidebarCollapsed} />
        
        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1 mt-2 overflow-y-auto scrollbar-hide">
          {sidebarNav.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `rs-sidebar-link ${isActive ? 'active' : ''} ${sidebarCollapsed ? 'justify-center px-0 mx-2' : ''}`
              }
              title={sidebarCollapsed ? label : undefined}
            >
              <span className="shrink-0">{icon}</span>
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className={`border-t border-white/10 p-3 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-8 h-8 rounded-lg bg-rs-bright/20 text-rs-cyan text-xs font-bold flex items-center justify-center shrink-0">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs font-semibold truncate">{userName}</p>
                <p className="text-white/40 text-[10px] truncate">{isDoctor ? 'Doctor' : isPatient ? 'Patient' : 'User'}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all text-xs"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ═══ MAIN CONTENT AREA ═══ */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[220px]'}`}>
        {/* ── TOP HEADER ── */}
        <header className="rs-header pt-safe">
          <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            {/* Left: Search */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="hidden sm:flex items-center gap-2 bg-rs-ice border border-rs-border rounded-xl px-3 py-2 w-full max-w-sm transition-all focus-within:border-rs-bright/40 focus-within:shadow-rs-sm">
                <svg className="w-4 h-4 text-rs-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search patients, scans, reports..."
                  className="bg-transparent border-none outline-none text-sm text-rs-text placeholder:text-rs-text-secondary/50 w-full"
                />
              </div>
              {/* Mobile logo */}
              <div className="flex items-center gap-2 lg:hidden">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rs-bright to-rs-cyan flex items-center justify-center shadow-md">
                  <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <span className="text-rs-deep-navy font-semibold text-sm tracking-tight font-display">RetiScan</span>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <ScreeningModeToggle mode={screeningMode} onToggle={setScreeningModeAndSave} />
              
              <div className="h-6 w-px bg-rs-border hidden sm:block" />
              
              <BackendIndicator />
              <OfflineIndicator />
              <InstallButton />

              <div className="h-6 w-px bg-rs-border hidden sm:block" />

              {/* Notification Bell */}
              <button className="relative p-2 rounded-lg text-rs-text-secondary hover:text-rs-primary hover:bg-rs-primary/5 transition-all hidden sm:flex">
                <IconBell />
              </button>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-rs-border bg-white hover:border-rs-bright/30 hover:shadow-rs-sm transition-all"
                  title="Account Menu"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rs-primary to-rs-bright text-white text-[10px] font-bold flex items-center justify-center">
                    {userInitials}
                  </div>
                  <div className="hidden sm:flex flex-col items-start min-w-0">
                    <span className="text-xs font-semibold text-rs-text truncate max-w-[100px]">{userName}</span>
                    <span className="text-[10px] text-rs-text-secondary">{isDoctor ? 'Ophthalmologist' : 'User'}</span>
                  </div>
                  <svg className="w-3.5 h-3.5 text-rs-text-secondary hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-[90]" 
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-rs-xl border border-rs-border overflow-hidden z-[100] animate-fade-in flex flex-col">
                      <NavLink to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-rs-text hover:bg-rs-ice transition-colors">
                        <IconProfile />
                        My Profile
                      </NavLink>
                      <a href="mailto:support@retinascan.ai?subject=Feedback" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-rs-text hover:bg-rs-ice transition-colors border-t border-rs-border/50">
                        <svg className='w-[18px] h-[18px]' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d='M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' /></svg>
                        Feedback
                      </a>
                      <button onClick={() => { setMenuOpen(false); setShowLogoutConfirm(true); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors border-t border-rs-border">
                        <IconLogout />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-8 pb-safe">
          <Suspense fallback={
            <div className="flex items-center justify-center p-20">
              <div className="relative w-10 h-10">
                <div className="w-10 h-10 border-3 border-rs-border rounded-full" />
                <div className="absolute inset-0 w-10 h-10 border-3 border-rs-bright border-t-transparent rounded-full animate-spin" />
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/scan" element={<Scanner />} />
              <Route path="/results" element={<ResultsView />} />
              <Route path="/camp" element={<CampDashboard />} />
              <Route path="/business" element={<BusinessModel />} />
              <Route path="/validation" element={<ValidationMetrics />} />
              <Route path="/yolo-results" element={<YoloResultsPage />} />
              <Route path="/doctor" element={
                userProfile?.role === 'doctor' 
                  ? <DoctorPortal /> 
                  : <Navigate to="/" replace />
              } />
              <Route path="/reset-password" element={<ResetPassword />} />
              
              <Route path='/onboarding/doctor' element={<DoctorOnboarding userId={userSession?.id} onComplete={setUserProfile} />} />
              <Route path='/onboarding/patient' element={<PatientOnboarding userId={userSession?.id} onComplete={setUserProfile} />} />
              <Route path='/find-doctors' element={<FindDoctors />} />
              <Route path='/profile' element={<ProfilePage userId={userSession?.id} profile={userProfile} onUpdate={setUserProfile} />} />
              
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>

        {/* FOOTER (desktop only) */}
        <footer className="border-t border-rs-border bg-white py-4 text-center hidden lg:block">
          <p className="text-[11px] font-medium text-rs-text-secondary">
            © 2026 RetiScan AI — Precision Diabetic Retinopathy Diagnostics · A Smart India Hackathon Initiative
          </p>
        </footer>
      </div>

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      {(() => {
        const mobileNavItems = isDoctor
          ? [
              { to: '/', label: 'Home', icon: <IconHome /> },
              { to: '/scan', label: 'Scan', icon: <IconScan /> },
              { to: '/doctor', label: 'Review', icon: <IconOutreach /> },
              { to: '/camp', label: 'Records', icon: <IconRecords /> },
              { to: '/profile', label: 'Profile', icon: <IconProfile /> },
            ]
          : isPatient
          ? [
              { to: '/', label: 'Home', icon: <IconHome /> },
              { to: '/scan', label: 'Scan', icon: <IconScan /> },
              { to: '/find-doctors', label: 'Doctors', icon: <IconOutreach /> },
              { to: '/camp', label: 'History', icon: <IconRecords /> },
              { to: '/profile', label: 'Profile', icon: <IconProfile /> },
            ]
          : [
              { to: '/', label: 'Home', icon: <IconHome /> },
              { to: '/scan', label: 'Scan', icon: <IconScan /> },
              { to: '/camp', label: 'Records', icon: <IconRecords /> },
              { to: '/profile', label: 'Profile', icon: <IconProfile /> },
            ];

        return (
          <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white/95 backdrop-blur-lg border-t border-rs-border safe-area-bottom shadow-rs-lg">
            <div className="flex items-center justify-around py-2 px-1">
              {mobileNavItems.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                      isActive ? 'text-rs-bright' : 'text-rs-text-secondary hover:text-rs-primary'
                    }`
                  }
                >
                  <span className="leading-none">{icon}</span>
                  <span className="text-[11px] font-medium tracking-normal leading-none mt-0.5">{label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        );
      })()}

      {showUpdateToast && (
        <UpdateToast wb={waitingServiceWorker} onDismiss={() => setShowUpdateToast(false)} />
      )}

      {/* LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div 
            className="absolute inset-0 bg-rs-deep-navy/40 backdrop-blur-sm" 
            onClick={() => setShowLogoutConfirm(false)}
          />
          <div className="relative w-full max-w-sm bg-white border border-rs-border rounded-2xl p-8 shadow-rs-xl animate-scale-up">
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-2xl mb-5 mx-auto">
              👋
            </div>
            <div className="text-center space-y-2 mb-6">
              <h3 className="text-lg font-semibold text-rs-deep-navy font-display">Sign out?</h3>
              <p className="text-rs-muted text-sm leading-relaxed">
                Are you sure you want to end your session? Your offline data remains safe on this device.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setShowLogoutConfirm(false)}
                className="btn-secondary py-2.5 rounded-xl font-medium text-sm"
              >
                Go Back
              </button>
              <button 
                onClick={() => { setShowLogoutConfirm(false); logout(); }}
                className="btn-danger py-2.5 rounded-xl font-medium text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [showInitialSplash, setShowInitialSplash] = useState(true);
  const [waitingServiceWorker, setWaitingServiceWorker] = useState(null);
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [userSession, setUserSession] = useState(null);
  
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [screeningMode, setScreeningMode] = useState('standard');

  const setScreeningModeAndSave = async (mode) => {
    setScreeningMode(mode);
    if (userSession) {
      await saveMode(userSession.id, mode);
    }
  };

  useEffect(() => {
    if (userSession) {
      loadMode(userSession.id).then(m => setScreeningMode(m));
    }
  }, [userSession]);

  async function loadUserProfile(userId) {
    if (!userId) { setProfileLoading(false); return; }
    setProfileLoading(true); 

    // Attempt local cache first for instant load.
    const cached = localStorage.getItem(`rs_profile_${userId}`);
    if (cached) {
      setUserProfile(JSON.parse(cached));
    }

    const safetyTimeout = setTimeout(() => {
      console.warn('Profile load timed out, falling back to cache');
      setProfileLoading(false);
    }, 5000);
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const { data, error } = await supabase.from('profiles')
        .select('*').eq('id', userId).maybeSingle();
      if (error) throw error;
      if (data) {
        // Auto-repair: if essential fields are filled but profile_complete is false,
        // fix the flag in the database so it never triggers onboarding again.
        if (!data.profile_complete && data.role && data.full_name && data.phone) {
          console.warn('[Profile] Auto-repairing profile_complete flag');
          data.profile_complete = true;
          supabase.from('profiles')
            .update({ profile_complete: true })
            .eq('id', userId)
            .then(() => console.log('[Profile] Repaired successfully'))
            .catch(e => console.warn('[Profile] Repair failed:', e));
        }
        localStorage.setItem(`rs_profile_${userId}`, JSON.stringify(data));
        setUserProfile(data);
      } else if (!cached) {
        setUserProfile(null);
      }
    } catch (e) {
      console.error('Profile fetch failed, using cache:', e.message);
      if (!cached) setUserProfile(null);
    } finally {
      clearTimeout(safetyTimeout);
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Fix 2: persist uid to localStorage for offline IndexedDB scoping
      if (session?.user) {
        localStorage.setItem('rs_uid', session.user.id);
      }
      // Fix 3: read cached profile synchronously before async loads
      const cachedUid = session?.user?.id;
      if (cachedUid) {
        const cached = localStorage.getItem(`rs_profile_${cachedUid}`);
        if (cached) setUserProfile(JSON.parse(cached));
      }
      setUserSession(session?.user ?? null);
      if (session?.user) {
         syncPatientsFromCloud();
         loadUserProfile(session.user.id).then(() => {
           setSessionChecked(true);
         });
      } else {
         // No real Supabase session — show login screen.
         // Do NOT auto-restore any hardcoded offline identity from localStorage.
         setSessionChecked(true);
         setProfileLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Avoid flashing loading state on tab return (TOKEN_REFRESHED)
      if (session?.user) {
         if (_event === 'SIGNED_IN') {
             setProfileLoading(true);
             syncPatientsFromCloud();
             loadUserProfile(session.user.id);
         }
         setUserSession(session.user);
         localStorage.setItem('rs_uid', session.user.id);
      } else {
         // Supabase fired a sign-out event — always clear session state.
         setUserSession(null);
         setUserProfile(null);
         localStorage.removeItem('rs_uid');
         sessionStorage.removeItem('rs_offline_uid');
         sessionStorage.removeItem('rs_offline_profile');
         setProfileLoading(false);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleSWUpdate = (event) => {
      setWaitingServiceWorker(event.detail);
      setShowUpdateToast(true);
    };
    window.addEventListener('sw:update-available', handleSWUpdate);
    return () => window.removeEventListener('sw:update-available', handleSWUpdate);
  }, []);

  useEffect(() => {
    const handleOnlineStatus = () => {
      flushSyncQueue();
      autoPrewarmIfOnline();
    };
    window.addEventListener('online', handleOnlineStatus);
    return () => window.removeEventListener('online', handleOnlineStatus);
  }, []);

  useEffect(() => {
    // Proactively prewarm and cache offline AI models in IndexedDB
    autoPrewarmIfOnline();

    const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
    const ping = () => fetch(`${BACKEND}/health`, { mode: 'no-cors' }).catch(() => {});
    ping();
    const keepAliveTimer = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(keepAliveTimer);
  }, []);

  return (
    <ScreeningContext.Provider value={{ mode: screeningMode, setMode: setScreeningModeAndSave }}>
      {showInitialSplash && (
        <ExplodeView onComplete={() => setShowInitialSplash(false)} />
      )}
      <BrowserRouter>
        <AppContent 
          userSession={userSession}
          setUserSession={setUserSession}
          userProfile={userProfile}
          setUserProfile={setUserProfile}
          profileLoading={profileLoading}
          sessionChecked={sessionChecked}
          waitingServiceWorker={waitingServiceWorker}
          showUpdateToast={showUpdateToast}
          setShowUpdateToast={setShowUpdateToast}
        />
      </BrowserRouter>
    </ScreeningContext.Provider>
  );
}