import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import {
  clearDriverAuthState,
  deleteCurrentDriverAccount,
  getCurrentDriver,
  sendDriverLoginOtp,
  verifyDriverLoginOtp,
} from '../../services/registrationService';

const MotionDiv = motion.div;
const MotionButton = motion.button;

const REASONS = [
  'Low earnings',
  'Too many technical issues',
  'Switching to another platform',
  'Privacy concerns',
  'Taking a break',
  'Other',
];

const CONSEQUENCES = [
  'Your driver account will be marked inactive with a soft delete',
  'You will be logged out on this device',
  'You cannot accept rides with this account after deletion',
  'Completed ride history may still keep trip records for receipts and reports',
];

const DriverDeleteAccount = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const [reason, setReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [driverPhone, setDriverPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [debugOtp, setDebugOtp] = useState('');

  useEffect(() => {
    let active = true;

    const loadDriver = async () => {
      setIsFetching(true);
      setError(null);

      try {
        const response = await getCurrentDriver();
        const driver = response?.data || {};

        if (!active) {
          return;
        }

        setDriverPhone(String(driver.phone || '').replace(/\D/g, '').slice(-10));
        setPendingRequest(driver.deletionRequest || null);
      } catch (requestError) {
        if (active) {
          setError(requestError?.message || 'Unable to load driver account');
        }
      } finally {
        if (active) {
          setIsFetching(false);
        }
      }
    };

    loadDriver();

    return () => {
      active = false;
    };
  }, []);

  const hasPendingRequest = pendingRequest?.status === 'pending';

  const handleSendOtp = async () => {
    if (!driverPhone) {
      setError('Driver phone number is not available. Please login again.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await sendDriverLoginOtp({ phone: driverPhone });
      const session = response?.data?.session || response?.session || {};
      setDebugOtp(session.debugOtp || '');
      setOtp(String(session.debugOtp || '').slice(0, 4));
      setOtpSent(true);
      setSuccess(`OTP sent to +91 ${driverPhone}`);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!/^\d{4}$/.test(otp)) {
      setError('Please enter the 4-digit OTP sent to your phone.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await verifyDriverLoginOtp({ phone: driverPhone, otp });
      await deleteCurrentDriverAccount(reason);
      clearDriverAuthState();
      setSuccess('Your driver account was soft deleted and you have been logged out.');
      setShowConfirm(false);
      window.setTimeout(() => {
        navigate(`${routePrefix}/login`, { replace: true });
      }, 900);
    } catch (requestError) {
      setError(requestError?.message || 'OTP verification or deletion failed. Please try again.');
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-12 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-red-100/40 blur-3xl pointer-events-none" />

      <header className="bg-white/90 backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`${routePrefix}/profile`)} className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-sm active:scale-95 transition-all">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </button>
          <div className="flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-red-400">Danger Zone</p>
            <h1 className="text-[19px] font-black tracking-tight text-red-600">Delete Driver Account</h1>
          </div>
        </div>
      </header>

      <div className="px-5 pt-4 space-y-4">
        <AnimatePresence>
          {success && (
            <MotionDiv initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-[16px] px-4 py-3">
              <p className="text-[12px] font-black text-emerald-600 flex-1">{success}</p>
              <button onClick={() => setSuccess(null)}><X size={13} className="text-emerald-400" /></button>
            </MotionDiv>
          )}
          {error && (
            <MotionDiv initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-[16px] px-4 py-3">
              <AlertTriangle size={14} className="text-red-500 shrink-0" strokeWidth={2.5} />
              <p className="text-[12px] font-black text-red-600 flex-1">{error}</p>
              <button onClick={() => setError(null)}><X size={13} className="text-red-400" /></button>
            </MotionDiv>
          )}
        </AnimatePresence>

        <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-[20px] border-2 border-red-100 bg-red-50/60 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-[12px] bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-red-500" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[14px] font-black text-red-700 leading-tight">Delete driver account</p>
              <p className="text-[11px] font-bold text-red-400">This will soft delete and log you out</p>
            </div>
          </div>
          <ul className="space-y-2">
            {CONSEQUENCES.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                <p className="text-[12px] font-bold text-red-600 leading-relaxed">{item}</p>
              </li>
            ))}
          </ul>
        </MotionDiv>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400 mb-2">Why are you leaving?</p>
          <div className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] overflow-hidden">
            {REASONS.map((item, index) => (
              <button key={item} type="button" onClick={() => !hasPendingRequest && setReason(item)} disabled={hasPendingRequest}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${index < REASONS.length - 1 ? 'border-b border-slate-50' : ''} ${reason === item ? 'bg-red-50/60' : 'active:bg-slate-50'} ${hasPendingRequest ? 'cursor-not-allowed opacity-60' : ''}`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${reason === item ? 'border-red-500 bg-red-500' : 'border-slate-200'}`}>
                  {reason === item && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className={`text-[13px] font-black ${reason === item ? 'text-red-600' : 'text-slate-700'}`}>{item}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          <MotionButton whileTap={hasPendingRequest ? undefined : { scale: 0.97 }}
            onClick={() => setShowConfirm(true)}
            disabled={!reason || hasPendingRequest || isFetching}
            className={`w-full py-4 rounded-[18px] text-[14px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
              reason && !hasPendingRequest && !isFetching ? 'bg-red-500 text-white shadow-[0_6px_20px_rgba(239,68,68,0.25)]' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}>
            <AlertTriangle size={15} strokeWidth={2.5} /> {hasPendingRequest ? 'Request Already Sent' : 'Delete My Account'}
          </MotionButton>
          <button onClick={() => navigate(`${routePrefix}/profile`)}
            className="w-full py-4 rounded-[18px] text-[14px] font-black text-slate-500 uppercase tracking-widest border border-slate-100 bg-white/80">
            Cancel
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showConfirm && (
          <>
            <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowConfirm(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] max-w-lg mx-auto" />
            <MotionDiv initial={{ scale: 0.92, opacity: 0, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 40 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[82%] max-w-sm bg-white rounded-[28px] p-7 z-[101] shadow-2xl text-center">
              <div className="w-16 h-16 bg-red-50 rounded-[20px] flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={30} className="text-red-500" strokeWidth={2} />
              </div>
              <h3 className="text-[18px] font-black text-slate-900 mb-2">Delete this account?</h3>
              <p className="text-[13px] font-bold text-slate-500 mb-1 leading-relaxed">Your driver account will be marked inactive instead of being permanently removed.</p>
              <p className="text-[12px] font-bold text-red-400 mb-5">Verify OTP first. We will then log you out on this device.</p>
              {otpSent ? (
                <div className="mb-5 text-left">
                  <label className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 ml-1">OTP sent to +91 {driverPhone}</label>
                  <div className="mt-2 flex items-center gap-2 rounded-[16px] border-2 border-slate-100 bg-slate-50 px-4 py-3">
                    <ShieldCheck size={16} className="text-slate-400 shrink-0" strokeWidth={2.5} />
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={4}
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="flex-1 bg-transparent text-center text-[20px] font-black tracking-[0.35em] text-slate-900 outline-none"
                      placeholder="0000"
                    />
                  </div>
                  {debugOtp ? (
                    <p className="mt-1 text-center text-[10px] font-black text-slate-400">Dev OTP: {debugOtp}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-2.5">
                <MotionButton whileTap={{ scale: 0.97 }} onClick={otpSent ? handleDelete : handleSendOtp} disabled={loading}
                  className="w-full bg-red-500 text-white py-3.5 rounded-[16px] text-[13px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                  {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : otpSent ? 'Verify OTP & Delete' : 'Send OTP'}
                </MotionButton>
                <button onClick={() => setShowConfirm(false)}
                  className="w-full py-3.5 text-[13px] font-black text-slate-400 uppercase tracking-widest">
                  No, Keep My Account
                </button>
              </div>
            </MotionDiv>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DriverDeleteAccount;
