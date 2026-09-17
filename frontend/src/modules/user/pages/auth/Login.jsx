import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ArrowLeft, Sun, Moon } from 'lucide-react';
import { getLocalUserToken, userAuthService } from '../../services/authService';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';
import yellowTaxiLoginBg from '../../../../assets/images/yellow_taxi_login_bg.png';
import { toast } from 'react-hot-toast';

const extractLoginErrorMessage = (error) => {
  if (typeof error === 'string') {
    return error;
  }

  return (
    error?.message ||
    error?.error ||
    error?.details?.message ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    ''
  );
};

const isBlockedAccountMessage = (message) => {
  const normalizedMessage = String(message || '').trim().toLowerCase();

  return (
    normalizedMessage.includes('not active') ||
    normalizedMessage.includes('blocked') ||
    normalizedMessage.includes('inactive')
  );
};

const getFriendlyLoginError = (message) => {
  const normalizedMessage = String(message || '').trim();
  const loweredMessage = normalizedMessage.toLowerCase();

  if (!normalizedMessage) {
    return 'Unable to send OTP. Please try again.';
  }

  if (
    loweredMessage.includes('not active') ||
    loweredMessage.includes('blocked') ||
    loweredMessage.includes('inactive')
  ) {
    return 'Your account has been blocked. Please contact support for help.';
  }

  return normalizedMessage;
};

const Login = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { theme, toggleTheme } = useUserTheme();
  const phoneInputRef = useRef(null);
  const locationError = extractLoginErrorMessage(location.state?.error);

  const [phoneNumber, setPhoneNumber] = useState(() => String(location.state?.phone || '').replace(/\D/g, '').slice(-10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => (
    isBlockedAccountMessage(locationError) ? getFriendlyLoginError(locationError) : ''
  ));
  const [showInput, setShowInput] = useState(false);

  const appName = settings.general?.app_name || 'Appzeto 24';
  const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';

  const userHomeRoute = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '/user'),
    [location.pathname],
  );

  const isValidPhone = phoneNumber.length === 10 && /^\d+$/.test(phoneNumber);
  const showHelperText = phoneNumber.length > 0 && phoneNumber.length < 10;

  useEffect(() => {
    const token = getLocalUserToken();
    if (token) {
      navigate(userHomeRoute, { replace: true });
    }
  }, [navigate, userHomeRoute]);

  useEffect(() => {
    if (!location.state) {
      return;
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!isValidPhone || loading) return;

    setLoading(true);
    setError('');

    try {
      await userAuthService.startOtp(phoneNumber);
      navigate('/taxi/user/verify-otp', {
        state: { phone: phoneNumber },
      });
    } catch (err) {
      const friendlyErr = getFriendlyLoginError(extractLoginErrorMessage(err));
      setError(friendlyErr);
      toast.error(friendlyErr);
    } finally {
      setLoading(false);
    }
  };

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
            Premium Mobility
          </span>
          <h1 className="text-[28px] font-black leading-[1.15] tracking-tight uppercase text-white">
            <span className="login-accent-text">Experience a New</span> <br />
            Standard with Appzeto  <br />
            <span className="login-accent-text">24</span>
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
          <AnimatePresence mode="wait">
            {!showInput ? (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h2 className="text-[26px] font-black login-primary-text leading-tight">
                    Explore new ways to <br />travel with <span className="login-accent-text">{appName}</span>
                  </h2>
                  <p className="login-subtitle text-[14px] font-semibold">Premium rides for India, from Autos to Prime SUVs.</p>
                </div>

                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowInput(true);
                    setTimeout(() => phoneInputRef.current?.focus(), 150);
                  }}
                  className="login-button flex items-center justify-center gap-2 cursor-pointer"
                >
                  Continue with Phone Number →
                </motion.button>

                <p className="text-[11px] login-subtitle font-medium leading-relaxed">
                  By continuing, you agree that you have read and accept our{' '}
                  <Link to="/terms" className="login-primary-text font-bold hover:underline">T&Cs</Link> and{' '}
                  <Link to="/privacy" className="login-primary-text font-bold hover:underline">Privacy Policy</Link>
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                <div className="flex items-center gap-4">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowInput(false)}
                    className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <ArrowLeft size={24} className="login-primary-text" />
                  </motion.button>
                  <h2 className="text-2xl font-black login-primary-text tracking-tight">Enter Phone</h2>
                </div>

                <div className="space-y-4">
                  <div className={`flex items-center gap-4 p-5 rounded-2xl transition-all border-2 ${error
                      ? 'border-rose-500/20 bg-rose-500/5'
                      : 'border-zinc-200/50 bg-zinc-100/50 dark:border-white/5 dark:bg-white/5 focus-within:border-[#FFB300] focus-within:bg-zinc-50 dark:focus-within:bg-black/30 focus-within:shadow-xl'
                    }`}>
                    <div className="flex items-center gap-3 pr-4 border-r border-zinc-200 dark:border-white/10">
                      <img src="https://flagcdn.com/w40/in.png" alt="India" className="w-5 h-3.5 object-cover rounded-sm" />
                      <span className="login-subtitle text-sm font-black">+91</span>
                    </div>
                    <input
                      ref={phoneInputRef}
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      autoFocus
                      value={phoneNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setPhoneNumber(val);
                        if (error) setError('');
                      }}
                      placeholder="Enter Mobile Number"
                      className={`flex-1 bg-transparent border-none p-0 font-bold login-primary-text outline-none focus:ring-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all ${phoneNumber ? 'text-xl tracking-widest' : 'text-base tracking-normal'
                        }`}
                    />
                  </div>

                  {showHelperText && (
                    <p className="text-xs text-rose-500 dark:text-rose-400 font-semibold ml-1">
                      Enter a valid 10 digit mobile number.
                    </p>
                  )}

                  {error && (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-400">
                      {error}
                    </div>
                  )}
                </div>

                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogin}
                  disabled={loading || !isValidPhone}
                  className="login-button flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <div className="h-6 w-6 border-4 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Next Step</span>
                      <ChevronRight size={24} strokeWidth={4} />
                    </>
                  )}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
};

export default Login;
