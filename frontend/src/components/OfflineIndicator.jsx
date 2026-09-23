/**
 * OfflineIndicator.jsx — Feature 8: Sync Status & Offline AI Readiness Badge
 * Shows Online/Offline status, background model caching progress, and pending sync count.
 */
import { useState, useEffect } from 'react';
import { getQueuedRequests, flushSyncQueue } from '../utils/indexedDB';
import { checkOfflineModelsStatus, subscribeModelStatus, downloadAllOfflineModels } from '../utils/offlineModelManager';

export default function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pending, setPending] = useState(0);
    const [modelStatus, setModelStatus] = useState({ ready: false, isDownloading: false, progress: 0, message: '' });

    useEffect(() => {
        const goOn  = () => setIsOnline(true);
        const goOff = () => setIsOnline(false);
        window.addEventListener('online',  goOn);
        window.addEventListener('offline', goOff);
        return () => { window.removeEventListener('online', goOn); window.removeEventListener('offline', goOff); };
    }, []);

    useEffect(() => {
        // Check initial model status
        checkOfflineModelsStatus().then((s) => {
            setModelStatus(prev => ({ ...prev, ready: s.ready, isDownloading: s.isDownloading }));
        });

        const unsubscribe = subscribeModelStatus((state) => {
            setModelStatus(prev => ({
                ...prev,
                ready: state.status === 'ready',
                isDownloading: state.status === 'downloading',
                progress: state.progress || 0,
                message: state.message || '',
            }));
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        async function check() {
            try {
                if (navigator.onLine) {
                    await flushSyncQueue();
                }
                const q = await getQueuedRequests();
                setPending(Array.isArray(q) ? q.length : 0);
            } catch { setPending(0); }
        }
        check();
        const id = setInterval(check, 10000);
        return () => clearInterval(id);
    }, []);

    // 1. When actively downloading offline AI models
    if (modelStatus.isDownloading) {
        return (
            <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border border-blue-200 bg-blue-50 text-rs-primary animate-pulse"
                title={modelStatus.message || 'Caching offline models into IndexedDB'}
            >
                <span className="w-1.5 h-1.5 rounded-full bg-rs-primary animate-ping" />
                <span className="sm:inline hidden font-sans">Caching</span>
                <span>{modelStatus.progress > 0 ? `${modelStatus.progress}%` : '…'}</span>
            </div>
        );
    }

    // 2. When Offline
    if (!isOnline) {
        return (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border transition-all ${
                modelStatus.ready
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
            title={modelStatus.ready ? 'Device is offline. Local AI inference is fully ready.' : 'Device is offline. AI models are not yet cached.'}
            >
                <span className={`w-1.5 h-1.5 rounded-full ${modelStatus.ready ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                <span className="sm:inline hidden font-sans">
                    {modelStatus.ready ? 'Offline (Ready)' : 'Offline'}
                </span>
                {pending > 0 && <span className="ml-1 bg-black/5 px-1 rounded">{pending} queue</span>}
            </div>
        );
    }

    // 3. Online with pending requests
    if (pending > 0) {
        return (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border border-blue-200 bg-blue-50 text-rs-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-rs-primary animate-pulse" />
                <span className="sm:inline hidden font-sans">Syncing</span>
                <span className="ml-1 bg-rs-primary/10 px-1 rounded">{pending} pending</span>
            </div>
        );
    }

    // 4. Online and models are cached ready for offline
    if (modelStatus.ready) {
        return (
            <div
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border border-emerald-200 bg-emerald-50 text-emerald-700"
                title="AI models cached in IndexedDB. Fully functional offline."
            >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="font-sans">Offline Ready</span>
            </div>
        );
    }

    return null;
}
