// ScreeningModeToggle.jsx — Standard/Preventative mode toggle with RetiScan design system
import { useState } from 'react';
import { MODES, MODE_CONFIG } from '../utils/screeningMode';

export default function ScreeningModeToggle({ mode, onToggle }) {
  const [showToast, setShowToast] = useState(false);
  
  const handleToggle = (newMode) => {
    if (newMode !== mode) {
      onToggle(newMode);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const isPreventative = mode === MODES.PREVENTATIVE;

  return (
    <div className="relative">
      <div className="flex flex-col items-center">
        {/* Pill Toggle */}
        <div className="flex items-center bg-rs-ice border border-rs-border rounded-full p-0.5">
          <button
            onClick={() => handleToggle(MODES.STANDARD)}
            className={`px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-[11px] font-medium transition-all ${
              !isPreventative
                ? 'bg-rs-primary text-white shadow-rs-xs'
                : 'text-rs-muted hover:text-rs-deep-navy'
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => handleToggle(MODES.PREVENTATIVE)}
            className={`px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-[11px] font-medium transition-all ${
              isPreventative
                ? 'bg-amber-600 text-white shadow-rs-xs'
                : 'text-rs-muted hover:text-rs-deep-navy'
            }`}
          >
            Preventative
          </button>
        </div>
        
        <span className="text-[10px] text-rs-muted font-normal mt-0.5 hidden sm:block">
          {MODE_CONFIG[mode]?.description || 'Adjusting screening sensitivity'}
        </span>
      </div>

      {/* Toast Banner */}
      {showToast && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-64 p-3 bg-white border border-rs-border rounded-xl shadow-rs-lg z-50 animate-fade-in pointer-events-none">
          <p className="text-xs font-semibold text-rs-text text-center">
            Switched to <span className={isPreventative ? 'text-rs-orange' : 'text-rs-primary'}>{isPreventative ? 'Preventative' : 'Standard'} Mode</span>
          </p>
          <p className="text-[10px] text-rs-text-secondary text-center mt-1">
            {isPreventative ? 'Grade 1+ cases will be flagged.' : 'Normal routing restored.'}
          </p>
        </div>
      )}
    </div>
  );
}
