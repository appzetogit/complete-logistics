import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, ChevronRight, MessageSquare, Sun, Moon } from 'lucide-react';
import { userAuthService } from '../../services/authService';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';
import yellowTaxiLoginBg from '../../../../assets/images/yellow_taxi_login_bg.png';
import { toast } from 'react-hot-toast';

const unwrap = (response) => response?.data?.data || response?.data || response;
const PENDING_SIGNUP_PHONE_KEY = 'pendingUserSignupPhone';
const PENDING_OTP_PHONE_KEY = 'pendingUserOtpPhone';
const PENDING_SIGNUP_REFERRAL_CODE_KEY = 'pendingUserSignupReferralCode';
const PENDING_SIGNUP_EMPLOYEE_CODE_KEY = 'pendingUserSignupEmployeeCode';
const RESEND_OTP_COOLDOWN_SECONDS = 60;

const syncPushTokens = () => {
  window.__flushNativeFcmToken?.().catch?.(() => { });
  window.__registerBrowserFcmToken?.({ interactive: true }).catch?.(() => { });
};

const notifyAuthReady = () => {
  window.dispatchEvent(new CustomEvent('app:auth-ready', {
    detail: {
      role: 'user',
      hasToken: true,
      source: 'user',
    },
  }));
};

const VerifyOTP = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { theme, toggleTheme } = useUserTheme();
  const inputs = useRef([]);

  const phone = String(
    location.state?.phone ||
    sessionStorage.getItem(PENDING_OTP_PHONE_KEY) ||
    sessionStorage.getItem(PENDING_SIGNUP_PHONE_KEY) ||
    '',
  ).replace(/\D/g, '').slice(-10);

  const referralCode = String(
    location.state?.referralCode ||
    sessionStorage.getItem(PENDING_SIGNUP_REFERRAL_CODE_KEY) ||
    '',
  ).trim().toUpperCase();
  const employeeCode = String(
    location.state?.employeeCode ||
    sessionStorage.getItem(PENDING_SIGNUP_EMPLOYEE_CODE_KEY) ||
    '',
  ).trim().toUpperCase();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(RESEND_OTP_COOLDOWN_SECONDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [permissionStep, setPermissionStep] = useState('location');

  const appName = settings.general?.app_name || 'Appzeto 24';
  const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';

  useEffect(() => {
    if (!phone) {
      navigate('/taxi/user/signup', { replace: true });
      return;
    }
    sessionStorage.setItem(PENDING_OTP_PHONE_KEY, phone);
  }, [navigate, phone]);

  useEffect(() => {
    let interval = null;
    if (timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    if (!showPermissions) {
      const focusTimer = setTimeout(() => {
        inputs.current[0]?.focus();
      }, 300);
      return () => clearTimeout(focusTimer);
    }
  }, [showPermissions]);

  // Auto-verify as soon as 4 digits are typed/filled
  useEffect(() => {
    const enteredOtp = otp.filter(Boolean).join('');
    if (enteredOtp.length === 4 && !loading && !success && !showPermissions) {
      handleVerify(enteredOtp);
    }
  }, [otp]);

  const handleChange = (index, value) => {
    const cleanValue = value.replace(/\D/g, '');
    if (!cleanValue) {
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = cleanValue.substring(cleanValue.length - 1);
    setOtp(newOtp);
    setError('');

    if (index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputs.current[index - 1]?.focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      if (i < pastedData.length) {
        newOtp[i] = pastedData[i];
      }
    }
    setOtp(newOtp);

    const focusIndex = Math.min(pastedData.length, 5);
    inputs.current[focusIndex]?.focus();
  };

  const handleVerify = async (codeToVerify) => {
    const finalCode = codeToVerify || otp.filter(Boolean).join('');
    if (finalCode.length < 4 || loading) return;

    setLoading(true);
    setError('');
    setShake(false);

    try {
      const response = await userAuthService.verifyOtp(phone, finalCode);
      const payload = unwrap(response);

      setSuccess(true);

      if (payload.exists) {
        localStorage.setItem('token', payload.token || '');
        localStorage.setItem('userToken', payload.token || '');
        localStorage.setItem('role', 'user');
        localStorage.setItem('userInfo', JSON.stringify(payload.user || {}));
        notifyAuthReady();
        syncPushTokens();
        sessionStorage.removeItem(PENDING_OTP_PHONE_KEY);

        // Successful login for existing user triggers permissions flow
        setTimeout(() => setShowPermissions(true), 800);
        return;
      }

      // New user goes to Complete Profile screen
      setTimeout(() => navigate('/taxi/user/signup', { state: { phone, otpVerified: true, referralCode, employeeCode } }), 800);
    } catch (err) {
      const errMsg = err?.message || 'Invalid code. Please try again.';
      setError(errMsg);
      toast.error(errMsg);
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      await userAuthService.startOtp(phone);
      setOtp(['', '', '', '', '', '']);
      setTimer(RESEND_OTP_COOLDOWN_SECONDS);
      toast.success('OTP sent successfully');
      inputs.current[0]?.focus();
    } catch (err) {
      const errMsg = err?.message || 'Failed to resend code';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleAllowLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {
          setPermissionStep('notification');
        },
        () => {
          setPermissionStep('notification');
        }
      );
    } else {
      setPermissionStep('notification');
    }
  };

  const handleAllowNotifications = async () => {
    try {
      if (window.__registerBrowserFcmToken) {
        await window.__registerBrowserFcmToken({ interactive: true });
      }
    } catch (e) {
      console.error(e);
    }
    navigate('/taxi/user', { replace: true });
  };

  // Render Post-Login Permission Sequence
  if (showPermissions) {
    return (
      <div className="login-page min-h-screen max-w-lg mx-auto flex flex-col justify-between p-8 relative">


        {/* Ambient Blobs */}
        <div className="absolute top-[-10%] right-[-10%] w-72 h-72 rounded-full bg-[#FFB300]/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-72 h-72 rounded-full bg-[#FFB300]/5 blur-3xl pointer-events-none" />

        <AnimatePresence mode="wait">
          {permissionStep === 'location' ? (
            <motion.div
              key="location"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex-1 flex flex-col items-center justify-center text-center space-y-8 my-auto z-10"
            >
              <div className="w-24 h-24 bg-[#FFB300]/10 rounded-full flex items-center justify-center text-[#FFB300] shadow-xl">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25A7.5 7.5 0 1119.5 10.5z" />
                </svg>
              </div>

              <div className="space-y-3">
                <h2 className="text-[28px] font-black tracking-tight login-primary-text uppercase">
                  Enable Location
                </h2>
                <p className="login-subtitle text-sm font-semibold leading-relaxed px-4">
                  Allow location access to view nearby drivers, accurate pickup points, and track your rides in real-time.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="notification"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex-1 flex flex-col items-center justify-center text-center space-y-8 my-auto z-10"
            >
              <div className="w-24 h-24 bg-[#FFB300]/10 rounded-full flex items-center justify-center text-[#FFB300] shadow-xl">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>

              <div className="space-y-3">
                <h2 className="text-[28px] font-black tracking-tight login-primary-text uppercase">
                  Enable Notifications
                </h2>
                <p className="login-subtitle text-sm font-semibold leading-relaxed px-4">
                  Receive notifications for ride acceptance, driver arrivals, payment confirmations, and exclusive promotions.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-3 w-full pb-8 z-10">
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={permissionStep === 'location' ? handleAllowLocation : handleAllowNotifications}
            className="login-button flex items-center justify-center gap-2 cursor-pointer animate-pulse"
          >
            Allow Permission
          </motion.button>

          <button
            onClick={permissionStep === 'location' ? () => setPermissionStep('notification') : () => navigate('/taxi/user', { replace: true })}
            className="w-full py-4 text-sm font-extrabold uppercase tracking-widest login-subtitle hover:text-white transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page w-full select-none relative">


      {/* Immersive Top Background Image */}
      <div className="login-hero">
        <motion.img
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
          src={yellowTaxiLoginBg}
          alt="Taxi background"
          className="login-hero-img"
        />

        {/* Floating Header Logo */}
        <header className="login-logo flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5 bg-black/40 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 shadow-xl"
          >
            {appLogo ? (
              <img
                src={appLogo}
                alt={appName}
                className="h-6 w-6 object-contain rounded-full bg-slate-950 p-0.5"
              />
            ) : (
              <div className="h-6 w-6 bg-[#FFB300] rounded-full flex items-center justify-center shadow-lg">
                <span className="text-[11px] font-black italic text-slate-950">{appName[0]?.toUpperCase() || 'R'}</span>
              </div>
            )}
            <span className="text-[13px] font-black tracking-wide text-white uppercase">{appName}</span>
          </motion.div>
        </header>

        {/* Floating Title Over Image */}
        <div className="login-hero-text space-y-1.5 pointer-events-none">
          <span className="inline-block text-[9px] font-extrabold uppercase tracking-widest login-accent-text bg-[#FFB300]/10 px-2.5 py-0.5 rounded-full">
            Security Verification
          </span>
          <h1 className="text-[28px] font-black leading-[1.15] tracking-tight uppercase text-white">
            <span className="login-accent-text">Verify Your Number</span> <br />
            Secure Access Setup
          </h1>
        </div>
      </div>

      <main className="flex-1 flex flex-col justify-end">
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="login-card"
        >
          <div className="space-y-8">
            <div className="space-y-2">
              <h2 className="text-[26px] font-black login-primary-text leading-tight">
                Verify Number
              </h2>
              <p className="login-subtitle text-[14px] font-semibold">
                We've sent a code to <span className="login-primary-text font-bold">+91 {phone}</span>
              </p>
            </div>

            {/* OTP Inputs */}
            <div className={`flex justify-between gap-2.5 ${shake ? 'shake-animation' : ''}`}>
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputs.current[index] = el)}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  className="h-14 w-12 rounded-xl text-center text-2xl font-extrabold outline-none otp-input-field"
                />
              ))}
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-400">
                {error}
              </div>
            )}

            <div className="flex flex-col items-center gap-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] login-subtitle">
                Didn't receive the code?
              </p>
              <button
                onClick={handleResend}
                disabled={timer > 0 || loading}
                className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all ${timer > 0
                    ? 'login-subtitle opacity-40'
                    : 'login-primary-text hover:opacity-70 underline underline-offset-4 decoration-2 cursor-pointer'
                  }`}
              >
                <MessageSquare size={14} />
                {timer > 0 ? `Retry in ${timer}s` : 'Resend Code'}
              </button>
            </div>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleVerify()}
              disabled={loading || otp.filter(Boolean).join('').length < 4 || success}
              className="login-button flex items-center justify-center gap-3"
            >
              {loading ? (
                <div className="h-6 w-6 border-4 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
              ) : success ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={24} />
                  <span className="uppercase tracking-[0.1em]">Verified</span>
                </div>
              ) : (
                <>
                  <span className="uppercase tracking-[0.15em]">Verify & Continue</span>
                  <ChevronRight size={24} strokeWidth={4} />
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default VerifyOTP;
