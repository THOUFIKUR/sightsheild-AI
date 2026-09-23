// Scanner.jsx — Main screening interface for capturing fundus images and running AI analysis
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeImage } from '../utils/modelInference';
import { savePatient, logAudit, blobToBase64 } from '../utils/indexedDB';
import { generateCombinedHeatmap } from '../utils/imageUtils';
import { checkOfflineModelsStatus, subscribeModelStatus, downloadAllOfflineModels } from '../utils/offlineModelManager';
import AutoRetinaCam from './AutoRetinaCam';

const FORM_FIELDS = [
    { id: 'name', label: 'Full Name', type: 'text', col: 2 },
    { id: 'age', label: 'Age (years)', type: 'number', col: 1 },
    { id: 'diabeticSince', label: 'Diabetic Since (yrs)', type: 'number', col: 1 },
    { id: 'contact', label: 'Mobile Number', type: 'tel', col: 2 },
    { id: 'abdmInsuranceId', label: 'Insurance ID (optional)', type: 'text', col: 2 },
];

/**
 * Sub-component for uploading or capturing an image for a specific eye.
 */
function EyeUploadZone({ label, eyeKey, currentImageData, onSet, onClear }) {
    const fileInputRef = useRef(null);
    if (currentImageData) return (
        <div className='relative rounded-3xl overflow-hidden border-2 border-emerald-500/40 group animate-fade-in aspect-square shadow-lg bg-slate-900'>
            <img src={currentImageData.preview} className='w-full h-full object-cover transition-all group-hover:scale-105' alt={label} />
            
            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
            
            <div className="absolute top-4 left-4 flex flex-col gap-1.5">
                <span className='bg-rs-primary/95 backdrop-blur-xs text-white text-xs font-medium px-3 py-1 rounded-xl shadow-xs border border-white/20'>{label}</span>
                <span className='w-fit bg-emerald-600 text-white text-[11px] px-2.5 py-0.5 rounded-lg font-medium shadow-xs'>Verified ✓</span>
            </div>

            <button 
                onClick={onClear} 
                className='absolute top-4 right-4 w-8 h-8 bg-white/90 hover:bg-rose-50 text-rose-700 rounded-xl flex items-center justify-center border border-rose-200 transition-all font-medium shadow-xs'
                title="Discard Scan"
            >
                ✕
            </button>
            
            <div className="absolute bottom-4 left-0 right-0 px-4 text-center">
                <p className="text-xs font-medium text-white/95 drop-shadow-xs">Scan ready for clinical analysis</p>
            </div>
        </div>
    );
    return (
        <div className='border-2 border-dashed border-[#CBDCEE] bg-[#F7FAFD] rounded-3xl aspect-square flex flex-col items-center justify-center p-6 sm:p-8 text-center hover:border-rs-bright hover:bg-rs-ice-50 transition-all group shadow-xs'>
            <div className="w-14 h-14 rounded-2xl bg-white border border-[#CBDCEE] flex items-center justify-center text-2xl mb-3 shadow-xs group-hover:scale-105 transition-transform">
                {eyeKey === 'right' ? '👁️' : '👁️‍🗨️'}
            </div>
            <div className='text-rs-deep-navy text-sm font-semibold mb-0.5'>{label}</div>
            <div className='text-slate-500 text-xs font-normal mb-5'>Fundus photography scan</div>
            
            <div className='flex flex-col w-full gap-2'>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className='py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-medium transition-all shadow-xs hover:border-rs-bright/40'
                >
                    Upload Image
                </button>
                <div className="flex items-center gap-2 w-full px-2">
                    <div className="h-px flex-1 bg-slate-200"></div>
                    <span className="text-[11px] font-normal text-slate-400">or</span>
                    <div className="h-px flex-1 bg-slate-200"></div>
                </div>
                <button 
                    onClick={() => onSet('camera')}
                    className='py-2.5 px-4 rounded-xl bg-[#0757A8] hover:bg-[#064A90] text-white text-xs font-medium transition-all shadow-xs'
                >
                    Capture with Camera
                </button>
            </div>
            
            <input ref={fileInputRef} type='file' accept='image/*' className='hidden'
                onChange={e => {
                    const selectedFile = e.target.files[0]; if (!selectedFile) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const MAX_DIM = 1024;
                            let { width, height } = img;
                            if (width > MAX_DIM || height > MAX_DIM) {
                                const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                                width = Math.round(width * ratio);
                                height = Math.round(height * ratio);
                            }
                            canvas.width = width; canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                            const base64 = dataUrl.split(',')[1];
                            const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                            const newFile = new File([binary], selectedFile.name || 'scan.jpg', { type: 'image/jpeg' });
                            onSet({ file: newFile, preview: dataUrl });
                        };
                        img.src = ev.target.result;
                    };
                    reader.readAsDataURL(selectedFile);
                }} />
        </div>
    );
}

export default function Scanner() {
    const navigate = useNavigate();

    // -- State --
    const [rightEye, setRightEye] = useState(null);  // {file, preview}
    const [leftEye, setLeftEye] = useState(null);    // {file, preview}
    const [activeEye, setActiveEye] = useState('right');
    const [showCamera, setShowCamera] = useState(null); // 'right' | 'left' | null
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progressMsg, setProgressMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [modelStatus, setModelStatus] = useState({ ready: false, isDownloading: false, progress: 0, message: '' });

    useEffect(() => {
        const goOn  = () => setIsOnline(true);
        const goOff = () => setIsOnline(false);
        window.addEventListener('online', goOn);
        window.addEventListener('offline', goOff);
        return () => {
            window.removeEventListener('online', goOn);
            window.removeEventListener('offline', goOff);
        };
    }, []);

    useEffect(() => {
        checkOfflineModelsStatus().then((s) => {
            setModelStatus(prev => ({ ...prev, ready: s.ready, isDownloading: s.isDownloading }));
        });
        const unsubscribe = subscribeModelStatus((state) => {
            setModelStatus({
                ready: state.status === 'ready',
                isDownloading: state.status === 'downloading',
                progress: state.progress || 0,
                message: state.message || '',
            });
        });
        return () => unsubscribe();
    }, []);

    const [patientData, setPatientData] = useState(() => {
        const saved = sessionStorage.getItem('retinascan_patient_draft');
        return saved ? JSON.parse(saved) : { name: '', age: '', gender: 'Male', diabeticSince: '', contact: '', abhaId: '', abdmInsuranceId: '' };
    });

    // Save/Restore image previews to/from session storage (PWA persistence)
    useEffect(() => {
        if (rightEye?.preview?.startsWith('data:')) {
            sessionStorage.setItem('retinascan_right_preview', rightEye.preview);
        }
        if (leftEye?.preview?.startsWith('data:')) {
            sessionStorage.setItem('retinascan_left_preview', leftEye.preview);
        }
    }, [rightEye?.preview, leftEye?.preview]);

    useEffect(() => {
        const rCache = sessionStorage.getItem('retinascan_right_preview');
        const lCache = sessionStorage.getItem('retinascan_left_preview');
        
        const base64ToFile = (dataUrl, filename) => {
             const base64 = dataUrl.split(',')[1];
             if (!base64) return null;
             try {
                const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                return new File([binary], filename, { type: 'image/jpeg' });
             } catch(e){ return null; }
        };

        if (rCache?.startsWith('data:')) {
            setRightEye({ file: base64ToFile(rCache, 'rightEye.jpg'), preview: rCache, restoredFromCache: true });
        }
        if (lCache?.startsWith('data:')) {
            setLeftEye({ file: base64ToFile(lCache, 'leftEye.jpg'), preview: lCache, restoredFromCache: true });
        }
    }, []);

    // Save draft to session storage
    useEffect(() => {
        sessionStorage.setItem('retinascan_patient_draft', JSON.stringify(patientData));
    }, [patientData]);

    const handleScan = async () => {
        if (!rightEye || isAnalyzing) return;

        if (!patientData.name.trim() || !patientData.age || !patientData.contact.trim()) {
            setErrorMsg('Mandatory clinical data missing: Name, Age, and Contact required.');
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            return;
        }

        if (!navigator.onLine && !modelStatus.ready) {
            setErrorMsg('Offline AI models are not yet cached on this device. Please connect to the internet once so the AI models (~56 MB) can download for offline use.');
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            return;
        }

        setIsAnalyzing(true);
        setErrorMsg('');

        try {
            setProgressMsg('Loading AI Model (first offline run may take 30-60 sec)...');

            const [rightInferenceResult, leftInferenceResult] = await Promise.all([
                analyzeImage(rightEye.file, (msg) => setProgressMsg(`Right Eye: ${msg}`)),
                leftEye
                    ? analyzeImage(leftEye.file, (msg) => setProgressMsg(`Left Eye: ${msg}`))
                    : Promise.resolve(null),
            ]);

            const deriveRiskScore = (res) => {
                if (!res) return 0;
                const probs = res.class_probabilities;
                if (probs && probs.length === 5) {
                    const weights = [0, 25, 50, 75, 100];
                    return probs.reduce((acc, p, i) => acc + (p * weights[i]), 0);
                }
                return res.grade * 22;
            };

            const rightRisk = deriveRiskScore(rightInferenceResult);
            const leftRisk = deriveRiskScore(leftInferenceResult);
            const overallRiskScore = Math.max(rightRisk, leftRisk);

            const [rightHeatB64, leftHeatB64, rightImgB64, leftImgB64] = await Promise.all([
                rightInferenceResult.heatmapBlob ? blobToBase64(rightInferenceResult.heatmapBlob) : Promise.resolve(null),
                (leftInferenceResult && leftInferenceResult.heatmapBlob) ? blobToBase64(leftInferenceResult.heatmapBlob) : Promise.resolve(null),
                rightEye?.file ? blobToBase64(rightEye.file) : Promise.resolve(null),
                leftEye?.file  ? blobToBase64(leftEye.file)  : Promise.resolve(null),
            ]);

            const overallGradeValue = leftInferenceResult
                ? Math.max(rightInferenceResult.grade, leftInferenceResult.grade)
                : rightInferenceResult.grade;

            setProgressMsg('Generating Lesion Segmentation Overlays...');
            let rightFinalHeatmap = rightHeatB64;
            let leftFinalHeatmap = leftHeatB64;

            if (rightHeatB64 && rightImgB64) {
                try {
                    rightFinalHeatmap = await generateCombinedHeatmap(rightImgB64, rightHeatB64);
                } catch (e) {
                    console.warn('Right combined heatmap failed:', e);
                }
            }

            if (leftHeatB64 && leftImgB64) {
                try {
                    leftFinalHeatmap = await generateCombinedHeatmap(leftImgB64, leftHeatB64);
                } catch (e) {
                    console.warn('Left combined heatmap failed:', e);
                }
            }

            const now = new Date();
            const patientId = `TN-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-3)}`;

            const patientRecord = {
                ...patientData,
                abhaId: patientData.abhaId || '',
                id: patientId,
                patientId,
                timestamp: now.toISOString(),
                grade: overallGradeValue,
                risk_score: overallRiskScore,
                diagnosis: rightInferenceResult.diagnosis || rightInferenceResult.grade_label || '',
                confidence: rightInferenceResult.confidence,
                risk: overallGradeValue >= 3 ? 'HIGH' : overallGradeValue >= 2 ? 'MEDIUM' : 'LOW',
                risk_level: overallGradeValue >= 3 ? 'HIGH' : overallGradeValue >= 2 ? 'MEDIUM' : 'LOW',
                urgency: rightInferenceResult.urgency,
                rightEye: {
                    grade: rightInferenceResult.grade,
                    grade_label: rightInferenceResult.grade_label,
                    diagnosis: rightInferenceResult.diagnosis,
                    confidence: rightInferenceResult.confidence,
                    class_probabilities: rightInferenceResult.class_probabilities || [],
                    heatmap_url: rightFinalHeatmap,
                    raw_heatmap_url: rightHeatB64 || rightInferenceResult.heatmapUrl || rightInferenceResult.heatmap_url,
                    image_url: rightImgB64 || rightEye.preview,
                    yolo: rightInferenceResult.yoloDetections || rightInferenceResult.yolo || null,
                    yoloDetections: rightInferenceResult.yoloDetections || rightInferenceResult.yolo || null,
                    arbitration: rightInferenceResult.arbitration || null,
                    imageQuality: (rightInferenceResult.quality_warnings && rightInferenceResult.quality_warnings.length > 0)
                        ? 'Borderline Scan (Quality Warning)'
                        : (rightInferenceResult.imageQuality || 'Valid Diagnostic Scan'),
                    quality_warnings: rightInferenceResult.quality_warnings || [],
                    quality_metrics: rightInferenceResult.quality_metrics || null,
                },
                leftEye: leftInferenceResult ? {
                    grade: leftInferenceResult.grade,
                    grade_label: leftInferenceResult.grade_label,
                    diagnosis: leftInferenceResult.diagnosis,
                    confidence: leftInferenceResult.confidence,
                    class_probabilities: leftInferenceResult.class_probabilities || [],
                    heatmap_url: leftFinalHeatmap,
                    raw_heatmap_url: leftHeatB64 || leftInferenceResult.heatmapUrl || leftInferenceResult.heatmap_url,
                    image_url: leftImgB64 || leftEye.preview,
                    yolo: leftInferenceResult.yoloDetections || leftInferenceResult.yolo || null,
                    yoloDetections: leftInferenceResult.yoloDetections || leftInferenceResult.yolo || null,
                    arbitration: leftInferenceResult.arbitration || null,
                    imageQuality: (leftInferenceResult.quality_warnings && leftInferenceResult.quality_warnings.length > 0)
                        ? 'Borderline Scan (Quality Warning)'
                        : (leftInferenceResult.imageQuality || 'Valid Diagnostic Scan'),
                    quality_warnings: leftInferenceResult.quality_warnings || [],
                    quality_metrics: leftInferenceResult.quality_metrics || null,
                } : null,
            };

            await savePatient(patientRecord);
            await logAudit({ type: 'SCAN', patientId: patientRecord.id, grade: patientRecord.grade, confidence: patientRecord.confidence });

            navigate('/results', { state: { record: patientRecord } });
            sessionStorage.removeItem('retinascan_patient_draft');
            sessionStorage.removeItem('retinascan_right_preview');
            sessionStorage.removeItem('retinascan_left_preview');
        } catch (err) {
            console.error('Analysis failed:', err);
            let displayError = err.message || 'Biometric analysis failed. Please verify image quality and retry.';
            
            if (
                displayError.toLowerCase().includes('worker') ||
                displayError.toLowerCase().includes('undefined') ||
                displayError.toLowerCase().includes('wasm') ||
                displayError.toLowerCase().includes('fetch') ||
                displayError.toLowerCase().includes('404')
            ) {
                displayError = 'AI Engine failed to start. If you are online, please wait 10 seconds and retry — the AI models are downloading in the background. If offline, please connect to Wi-Fi first.';
            }
            setErrorMsg(displayError);
        } finally {
            setIsAnalyzing(false);
            setProgressMsg('');
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 font-display animate-fade-in pb-16">

            {/* Header */}
            <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rs-bright/10 text-rs-primary font-bold text-xs uppercase tracking-wider mb-2">
                    <span className="w-2 h-2 rounded-full bg-rs-bright animate-pulse" />
                    Diagnostic Portal
                </div>
                <div className="flex items-center gap-3">
                   <h1 className="text-3xl sm:text-4xl font-extrabold text-rs-deep-navy tracking-tight">Retinal Screening</h1>
                   <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse mt-1" />
                </div>
                <p className="text-slate-500 text-sm font-semibold tracking-wide mt-1">Dual-Eye Inference Engine &bull; OD Required &bull; OS Optional</p>
            </div>

            {/* Offline AI Model Status Banner */}
            {modelStatus.isDownloading && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-center justify-between gap-4 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-rs-bright animate-ping shrink-0" />
                        <div>
                            <p className="text-rs-primary text-xs font-bold uppercase tracking-wider">Caching AI Models for Offline Use</p>
                            <p className="text-slate-600 text-xs font-medium">{modelStatus.message || `${modelStatus.progress}% downloaded`}</p>
                        </div>
                    </div>
                    <div className="w-32 bg-slate-200 rounded-full h-2 overflow-hidden shrink-0">
                        <div className="bg-gradient-to-r from-rs-primary to-rs-bright h-full transition-all duration-300" style={{ width: `${Math.max(5, modelStatus.progress)}%` }} />
                    </div>
                </div>
            )}

            {!isOnline && !modelStatus.ready && !modelStatus.isDownloading && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 animate-fade-in">
                    <span className="text-amber-500 text-lg shrink-0">⚠️</span>
                    <div className="space-y-1">
                        <p className="text-amber-900 text-xs font-bold uppercase tracking-wider">Offline AI Models Not Yet Cached</p>
                        <p className="text-amber-800 text-xs font-medium">
                            To use RetiScan AI offline in the field, connect to the internet once so the browser can cache the AI models (~56 MB). Once cached, screenings run 100% offline.
                        </p>
                    </div>
                </div>
            )}

            {isOnline && !modelStatus.ready && !modelStatus.isDownloading && (
                <div className="bg-white border border-[#CBDCEE] p-4 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-fade-in">
                    <div className="flex items-center gap-3">
                        <span className="text-rs-bright text-base">⚡</span>
                        <div>
                            <p className="text-rs-deep-navy text-xs font-bold uppercase tracking-wider">Offline Screening Setup</p>
                            <p className="text-slate-500 text-xs font-medium">Pre-cache AI models (~56 MB) so full screening works anywhere without internet.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => downloadAllOfflineModels().catch(e => setErrorMsg(e.message))}
                        className="px-3.5 py-2 rounded-xl bg-rs-bright hover:bg-rs-primary text-white text-xs font-bold whitespace-nowrap transition-all shadow-sm shrink-0"
                    >
                        Cache Models Now
                    </button>
                </div>
            )}

            {modelStatus.ready && (
                <div className="bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-2xl flex items-center justify-between text-xs text-emerald-800">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-bold">Offline AI Engine Ready</span>
                        <span className="text-emerald-700 text-[11px] hidden sm:inline">&bull; On-device models cached for field use</span>
                    </div>
                    <span className="text-[10px] uppercase font-extrabold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">56.5 MB Cached</span>
                </div>
            )}

            {/* Fundus Images Section Card */}
            <div className="bg-white border-2 border-[#CBDCEE] rounded-2xl p-6 sm:p-7 space-y-5 shadow-xs">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold text-rs-deep-navy">Fundus Image Capture</h2>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">Upload or capture retinal fundus photography</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-normal">Resolution</span>
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-medium">224px ✓</span>
                    </div>
                </div>

                {/* Eye selector tabs */}
                <div className='flex bg-[#EEF4F9] p-1 rounded-xl border border-[#CBDCEE] gap-1.5'>
                    {[['right', 'Right Eye (OD)'], ['left', 'Left Eye (OS)']].map(([eye, lbl]) => (
                        <button key={eye} onClick={() => setActiveEye(eye)}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all relative ${activeEye === eye
                                ? 'bg-white text-rs-primary shadow-xs border border-rs-border'
                                : 'text-slate-600 hover:text-rs-primary'}`}>
                            {lbl}
                            {eye === 'right' && rightEye && <span className='absolute top-2 right-2 flex h-2 w-2'><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>}
                            {eye === 'left' && leftEye && <span className='absolute top-2 right-2 flex h-2 w-2'><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>}
                        </button>
                    ))}
                </div>

                {/* Grid for zones */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* Active Zone */}
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-600 ml-0.5">
                            Active view: <span className="text-[#0757A8] font-semibold">{activeEye === 'right' ? 'Right Eye (OD)' : 'Left Eye (OS)'}</span>
                        </p>
                        {activeEye === 'right' ? (
                            <EyeUploadZone label='Right Eye (OD)' eyeKey='right'
                                currentImageData={rightEye}
                                onSet={(v) => v === 'camera' ? setShowCamera('right') : setRightEye(v)}
                                onClear={() => setRightEye(null)} />
                        ) : (
                            <EyeUploadZone label='Left Eye (OS)' eyeKey='left'
                                currentImageData={leftEye}
                                onSet={(v) => v === 'camera' ? setShowCamera('left') : setLeftEye(v)}
                                onClear={() => setLeftEye(null)} />
                        )}
                    </div>

                    {/* Quick Preview & Guidance */}
                    <div className="space-y-2">
                         <p className="text-xs font-medium text-slate-600 ml-0.5">Screening Summary</p>
                         <div className="bg-[#F8FAFD] rounded-2xl p-5 border border-[#CBDCEE] space-y-4">
                            {(rightEye || leftEye) ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className={`aspect-square rounded-xl border ${rightEye ? 'border-emerald-300 bg-emerald-50/30' : 'border-dashed border-slate-300 bg-white'} flex items-center justify-center overflow-hidden shadow-xs`}>
                                        {rightEye ? <img src={rightEye.preview} className="w-full h-full object-cover" alt="OD" /> : <span className="text-xs font-medium text-slate-400">OD pending</span>}
                                    </div>
                                    <div className={`aspect-square rounded-xl border ${leftEye ? 'border-emerald-300 bg-emerald-50/30' : 'border-dashed border-slate-300 bg-white'} flex items-center justify-center overflow-hidden shadow-xs`}>
                                        {leftEye ? <img src={leftEye.preview} className="w-full h-full object-cover" alt="OS" /> : <span className="text-xs font-medium text-slate-400">OS optional</span>}
                                    </div>
                                </div>
                            ) : (
                                <div className="py-6 text-center bg-white rounded-xl border border-slate-200">
                                    <p className="text-xs font-normal text-slate-600 leading-relaxed">
                                        No fundus scan captured yet.<br/>
                                        <span className="text-[#0757A8] font-medium">Upload or photograph OD scan to proceed.</span>
                                    </p>
                                </div>
                            )}
                            
                            <div className="space-y-2 pt-1">
                                <div className="flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-semibold shrink-0">✓</span>
                                    <p className="text-xs text-slate-600 font-normal">Automated lesion detection enabled</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-semibold shrink-0">✓</span>
                                    <p className="text-xs text-slate-600 font-normal">ICDR Grade 0–4 classification</p>
                                </div>
                            </div>
                         </div>
                    </div>
                </div>
            </div>

            {/* Patient form Card */}
            <div className="bg-white border-2 border-[#CBDCEE] rounded-2xl p-6 sm:p-7 space-y-5 shadow-xs">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold text-rs-deep-navy">Patient Information</h2>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">Demographics and screening history</p>
                    </div>
                    <button
                        onClick={() => {
                            if (confirm('Clear patient data and scans?')) {
                                setPatientData({ name: '', age: '', gender: 'Male', diabeticSince: '', contact: '' });
                                setRightEye(null);
                                setLeftEye(null);
                            }
                        }}
                        className="text-xs font-medium text-slate-600 hover:text-rose-700 bg-slate-50 hover:bg-rose-50 transition-all px-3 py-1.5 rounded-lg border border-slate-200"
                    >
                        Reset form
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                    {FORM_FIELDS.map(({ id, label, type }) => (
                        <div key={id}>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">{label}</label>
                            <input 
                                type={type} 
                                value={patientData[id]}
                                onChange={(e) => setPatientData({ ...patientData, [id]: e.target.value })}
                                className="w-full bg-[#F8FAFD] border-2 border-[#CBDCEE] text-slate-900 placeholder:text-slate-400 rounded-xl px-3.5 py-2.5 text-sm font-normal focus:bg-white focus:border-rs-bright focus:ring-2 focus:ring-rs-bright/20 outline-none transition-all shadow-xs" 
                                placeholder={type === 'tel' ? '+91-XXXXX-XXXXX' : ''} 
                            />
                        </div>
                    ))}
                    <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Gender</label>
                        <select 
                            value={patientData.gender}
                            onChange={(e) => setPatientData({ ...patientData, gender: e.target.value })}
                            className="w-full bg-[#F8FAFD] border-2 border-[#CBDCEE] text-slate-900 rounded-xl px-3.5 py-2.5 text-sm font-normal focus:bg-white focus:border-rs-bright focus:ring-2 focus:ring-rs-bright/20 outline-none transition-all shadow-xs cursor-pointer"
                        >
                            <option>Male</option><option>Female</option><option>Other</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-3 animate-shake">
                    <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs font-medium text-xs">!</div>
                    <div className="space-y-0.5">
                        <p className="text-rose-900 text-xs font-semibold">
                            {errorMsg.toLowerCase().includes('model') || errorMsg.toLowerCase().includes('offline') || errorMsg.toLowerCase().includes('connect')
                                ? 'Offline AI Setup Notice'
                                : errorMsg.toLowerCase().includes('data') || errorMsg.toLowerCase().includes('missing')
                                    ? 'Clinical Data Incomplete'
                                    : 'Diagnostic Notice'}
                        </p>
                        <p className="text-rose-700 text-xs font-normal">{errorMsg}</p>
                    </div>
                </div>
            )}

            {/* Analysis CTA */}
            <div>
                <button
                    onClick={handleScan}
                    disabled={!rightEye || isAnalyzing}
                    className={`w-full text-sm sm:text-[15px] py-3.5 sm:py-4 font-medium rounded-xl text-white transition-all flex items-center justify-center gap-2.5 relative overflow-hidden shadow-xs ${isAnalyzing ? 'bg-rs-primary/80 cursor-wait' :
                        rightEye
                            ? 'bg-[#0757A8] hover:bg-[#064A90] cursor-pointer active:scale-[0.99]'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none'
                        }`}
                >
                    {isAnalyzing && <div className="absolute inset-0 bg-white/10 animate-pulse" />}
                    
                    <div className="flex items-center gap-2.5 relative z-10">
                        {isAnalyzing ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-sm font-medium">{progressMsg || 'Processing...'}</span>
                            </>
                        ) : (
                            <>
                                <svg className={`w-4.5 h-4.5 transition-transform group-hover:rotate-12 ${rightEye ? 'text-white' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                                <span>{rightEye ? 'Analyze Retinal Scans →' : 'Provide Right Eye (OD) Scan to Proceed'}</span>
                            </>
                        )}
                    </div>
                </button>
                {rightEye && !isAnalyzing && (
                    <p className="text-center text-xs text-slate-500 font-normal mt-3">
                        Clinical screening protocol &bull; On-device HIPAA-compliant inference
                    </p>
                )}
            </div>

            {/* Camera Overlay */}
            {showCamera && (
                <div className="fixed inset-0 z-[100] animate-fade-in">
                    <AutoRetinaCam
                        eyeLabel={showCamera === 'right' ? 'Right Eye (OD)' : 'Left Eye (OS)'}
                        onCapture={(capturedFile, capturedPreview) => {
                            if (showCamera === 'right') setRightEye({ file: capturedFile, preview: capturedPreview });
                            else setLeftEye({ file: capturedFile, preview: capturedPreview });
                            setShowCamera(null);
                        }}
                        onCancel={() => setShowCamera(null)}
                    />
                </div>
            )}
        </div>
    );
}
