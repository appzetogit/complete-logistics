import React, { useMemo, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Upload, CheckCircle2, ChevronRight, ShieldCheck, X } from 'lucide-react';
import { uploadService } from '../../../../shared/services/uploadService';

const IS_KYC_DONE = false;

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read selected image'));
    reader.readAsDataURL(file);
  });

const RentalKYC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  if (!state.vehicle) { navigate('/rental'); return null; }

  const existingKycDocuments = useMemo(() => state.rentalKyc?.documents || {}, [state.rentalKyc]);

  const [dlImage, setDlImage] = useState(null);
  const [dlPreview, setDlPreview] = useState(existingKycDocuments.drivingLicense?.imageUrl || null);
  const [aadhaarImage, setAadhaarImage] = useState(null);
  const [aadhaarPreview, setAadhaarPreview] = useState(existingKycDocuments.aadhaarCard?.imageUrl || null);
  
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(
    Boolean(
      existingKycDocuments.drivingLicense?.imageUrl &&
      existingKycDocuments.aadhaarCard?.imageUrl,
    ) || IS_KYC_DONE,
  );
  const [error, setError] = useState('');
  const [uploadedDocuments, setUploadedDocuments] = useState(existingKycDocuments);
  const dlInputRef = useRef();
  const aadhaarInputRef = useRef();

  const handleDlFile = (file) => {
    if (!file) return;
    setDlImage(file);
    setDlPreview(URL.createObjectURL(file));
  };
  
  const handleAadhaarFile = (file) => {
    if (!file) return;
    setAadhaarImage(file);
    setAadhaarPreview(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if ((!dlImage || !aadhaarImage) && !done) return;
    setUploading(true);
    setError('');

    try {
      const nextDocuments = {
        ...uploadedDocuments,
      };

      if (dlImage) {
        const dlDataUrl = await fileToDataUrl(dlImage);
        const drivingLicenseUpload = await uploadService.uploadImage(dlDataUrl, 'rental-kyc');
        const drivingLicenseUrl = drivingLicenseUpload?.url || drivingLicenseUpload?.secureUrl || '';
        if (!drivingLicenseUrl) {
          throw new Error('Driving license upload failed');
        }
        nextDocuments.drivingLicense = {
          imageUrl: drivingLicenseUrl,
          fileName: dlImage.name || 'driving-license',
          uploadedAt: new Date().toISOString(),
        };
      }

      if (aadhaarImage) {
        const aadhaarDataUrl = await fileToDataUrl(aadhaarImage);
        const aadhaarUpload = await uploadService.uploadImage(aadhaarDataUrl, 'rental-kyc');
        const aadhaarUrl = aadhaarUpload?.url || aadhaarUpload?.secureUrl || '';
        if (!aadhaarUrl) {
          throw new Error('Aadhaar upload failed');
        }
        nextDocuments.aadhaarCard = {
          imageUrl: aadhaarUrl,
          fileName: aadhaarImage.name || 'aadhaar-card',
          uploadedAt: new Date().toISOString(),
        };
      }

      setUploadedDocuments(nextDocuments);
      setDlPreview(nextDocuments.drivingLicense?.imageUrl || dlPreview);
      setAadhaarPreview(nextDocuments.aadhaarCard?.imageUrl || aadhaarPreview);
      setDone(true);
      setDlImage(null);
      setAadhaarImage(null);
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload KYC documents');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-[100vh] bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-32 relative overflow-y-auto no-scrollbar">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-orange-100/60 blur-3xl pointer-events-none" />

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-30 w-full"
      >
        <div className="bg-white/85 backdrop-blur-2xl px-5 pt-12 pb-5 border-b border-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.06)] relative overflow-hidden">
          {/* Subtle accent gradients */}
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-orange-400/5 blur-[40px] pointer-events-none" />
          <div className="absolute top-0 left-0 h-24 w-24 rounded-full bg-blue-400/5 blur-[40px] pointer-events-none" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.15)] shrink-0 group transition-all"
              >
                <ArrowLeft size={20} className="text-white group-hover:opacity-80 transition-opacity" strokeWidth={2.5} />
              </motion.button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500/60 leading-none mb-1.5">Step 4 of 5 · KYC Verification</p>
                <h1 className="text-[22px] font-[900] tracking-tight text-slate-950 leading-none truncate max-w-[200px]">
                  Identity Documents
                </h1>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <div className="px-5 pt-5 space-y-6">
        {/* Info */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="flex items-start gap-3 rounded-[16px] border border-white/80 bg-white/90 px-4 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
          <div className="w-8 h-8 rounded-[10px] bg-blue-50 flex items-center justify-center shrink-0">
            <ShieldCheck size={15} className="text-blue-500" strokeWidth={2} />
          </div>
          <p className="text-[12px] font-bold text-slate-500 leading-relaxed">
            Upload clear photos of your valid Driving License and Aadhaar Card. This is a one-time verification.
          </p>
        </motion.div>

        {done ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-emerald-500" strokeWidth={2} />
            </div>
            <p className="text-[15px] font-bold text-slate-900">KYC Verified</p>
            <p className="text-[12px] font-medium text-slate-400">Your documents are on file.</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {/* DL Upload */}
            <div className="space-y-2">
              <label className="text-[14px] font-bold text-slate-900 ml-1">1. Driving License</label>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] overflow-hidden">
                {dlPreview ? (
                  <div className="relative">
                    <img src={dlPreview} alt="DL preview" className="w-full h-40 object-cover" />
                    <button onClick={() => { setDlPreview(null); setDlImage(null); }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                      <X size={14} className="text-white" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => dlInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center py-8 gap-3 border-2 border-dashed border-slate-200 rounded-[20px] active:bg-slate-50 transition-all cursor-pointer">
                    <div className="w-12 h-12 rounded-[14px] bg-slate-50 flex items-center justify-center">
                      <Upload size={20} className="text-slate-400" strokeWidth={2} />
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-bold text-slate-700">Tap to upload DL photo</p>
                      <p className="text-[11px] font-medium text-slate-400 mt-0.5">JPG, PNG · Max 5MB</p>
                    </div>
                  </button>
                )}
                <input ref={dlInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => handleDlFile(e.target.files?.[0])} />
              </motion.div>
            </div>

            {/* Aadhaar Upload */}
            <div className="space-y-2">
              <label className="text-[14px] font-bold text-slate-900 ml-1">2. Aadhaar Card</label>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] overflow-hidden">
                {aadhaarPreview ? (
                  <div className="relative">
                    <img src={aadhaarPreview} alt="Aadhaar preview" className="w-full h-40 object-cover" />
                    <button onClick={() => { setAadhaarPreview(null); setAadhaarImage(null); }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                      <X size={14} className="text-white" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => aadhaarInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center py-8 gap-3 border-2 border-dashed border-slate-200 rounded-[20px] active:bg-slate-50 transition-all cursor-pointer">
                    <div className="w-12 h-12 rounded-[14px] bg-slate-50 flex items-center justify-center">
                      <Upload size={20} className="text-slate-400" strokeWidth={2} />
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-bold text-slate-700">Tap to upload Aadhaar photo</p>
                      <p className="text-[11px] font-medium text-slate-400 mt-0.5">Front side · JPG, PNG · Max 5MB</p>
                    </div>
                  </button>
                )}
                <input ref={aadhaarInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => handleAadhaarFile(e.target.files?.[0])} />
              </motion.div>
            </div>
          </div>
        )}

        {/* Upload button (only if BOTH images selected but not yet verified) */}
        <AnimatePresence>
          {(dlPreview && aadhaarPreview && !done) || ((dlImage || aadhaarImage) && !done) ? (
            <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              whileTap={{ scale: 0.97 }} onClick={handleUpload} disabled={uploading}
              className="w-full bg-blue-600 text-white py-3.5 rounded-[16px] text-[13px] font-bold flex items-center justify-center gap-2 shadow-[0_6px_16px_rgba(37,99,235,0.25)]">
              {uploading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Upload size={14} strokeWidth={2.5} /> Submit Documents</>
              )}
            </motion.button>
          ) : null}
        </AnimatePresence>

        {error ? (
          <p className="text-center text-[12px] font-bold text-rose-500">{error}</p>
        ) : null}
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-6 pt-3 bg-gradient-to-t from-[#EEF2F7] via-[#F3F4F6]/95 to-transparent pointer-events-none z-30">
        <motion.button whileTap={{ scale: 0.98 }} disabled={!done}
          onClick={() => navigate('/rental/deposit', {
            state: {
              ...state,
              rentalKyc: {
                completedAt: new Date().toISOString(),
                documents: uploadedDocuments,
              },
            },
          })}
          className={`pointer-events-auto w-full py-4 rounded-[18px] text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] flex items-center justify-center gap-2 transition-all ${done ? 'bg-slate-900' : 'bg-slate-300'}`}>
          Continue to Deposit <ChevronRight size={17} strokeWidth={2.5} className="opacity-50" />
        </motion.button>
      </div>
    </div>
  );
};

export default RentalKYC;
