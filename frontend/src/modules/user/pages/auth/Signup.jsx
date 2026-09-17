import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Camera, Smartphone, LifeBuoy, Gift, Trash2, Sun, Moon, ArrowLeft, ChevronRight } from 'lucide-react';
import { clearLocalUserSession, userAuthService } from '../../services/authService';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';
import { uploadService } from '../../../../shared/services/uploadService';
import yellowTaxiLoginBg from '../../../../assets/images/yellow_taxi_login_bg.png';
import { toast } from 'react-hot-toast';

const PENDING_SIGNUP_PHONE_KEY = 'pendingUserSignupPhone';
const PENDING_SIGNUP_REFERRAL_CODE_KEY = 'pendingUserSignupReferralCode';
const PENDING_SIGNUP_EMPLOYEE_CODE_KEY = 'pendingUserSignupEmployeeCode';

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

const Signup = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { theme, toggleTheme } = useUserTheme();

  const referralCodeFromQuery = new URLSearchParams(location.search).get('ref') || '';
  const employeeCodeFromQuery = new URLSearchParams(location.search).get('emp') || '';
  const preservedPhone = typeof window !== 'undefined' ? sessionStorage.getItem(PENDING_SIGNUP_PHONE_KEY) || '' : '';
  const preservedReferralCode = typeof window !== 'undefined'
    ? sessionStorage.getItem(PENDING_SIGNUP_REFERRAL_CODE_KEY) || ''
    : '';
  const preservedEmployeeCode = typeof window !== 'undefined'
    ? sessionStorage.getItem(PENDING_SIGNUP_EMPLOYEE_CODE_KEY) || ''
    : '';
  const initialPhone = String(location.state?.phone || preservedPhone || '').replace(/\D/g, '').slice(-10);

  const [formData, setFormData] = useState({
    phone: initialPhone,
    name: '',
    email: '',
    gender: 'prefer-not-to-say',
    profileImage: '',
    referralCode: String(location.state?.referralCode || referralCodeFromQuery || preservedReferralCode || '').trim().toUpperCase(),
    employeeCode: String(location.state?.employeeCode || employeeCodeFromQuery || preservedEmployeeCode || '').trim().toUpperCase(),
  });

  const [loading, setLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [error, setError] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const fileInputRef = useRef(null);

  const appName = settings.general?.app_name || 'Appzeto 24';
  const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';

  const isValidPhone = /^\d{10}$/.test(formData.phone);
  const showHelperText = formData.phone.length > 0 && formData.phone.length < 10;
  const hasVerifiedSignupContext = Boolean(location.state?.otpVerified) || Boolean(preservedPhone);
  const [step, setStep] = useState(() => (hasVerifiedSignupContext ? 'profile' : 'phone'));

  const [showPermissions, setShowPermissions] = useState(false);
  const [permissionStep, setPermissionStep] = useState('location');

  useEffect(() => {
    if (step === 'profile' && isValidPhone) {
      sessionStorage.setItem(PENDING_SIGNUP_PHONE_KEY, formData.phone);
    }
  }, [formData.phone, isValidPhone, step]);

  useEffect(() => {
    const normalizedReferralCode = String(formData.referralCode || '').trim().toUpperCase();
    if (normalizedReferralCode) {
      sessionStorage.setItem(PENDING_SIGNUP_REFERRAL_CODE_KEY, normalizedReferralCode);
    } else {
      sessionStorage.removeItem(PENDING_SIGNUP_REFERRAL_CODE_KEY);
    }
  }, [formData.referralCode]);

  useEffect(() => {
    const normalizedEmployeeCode = String(formData.employeeCode || '').trim().toUpperCase();
    if (normalizedEmployeeCode) {
      sessionStorage.setItem(PENDING_SIGNUP_EMPLOYEE_CODE_KEY, normalizedEmployeeCode);
    } else {
      sessionStorage.removeItem(PENDING_SIGNUP_EMPLOYEE_CODE_KEY);
    }
  }, [formData.employeeCode]);

  useEffect(() => {
    if (location.state?.otpVerified) {
      setStep('profile');
    }
  }, [location.state?.otpVerified]);

  const avatarPreviewUrl = useMemo(() => {
    return formData.profileImage || '';
  }, [formData.profileImage]);

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });

  const imageFileToUploadDataUrl = async (file, { maxSize = 1280, quality = 0.82 } = {}) => {
    const dataUrl = await readFileAsDataUrl(file);
    if (!String(dataUrl || '').startsWith('data:image/')) {
      throw new Error('Please choose an image file');
    }

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to process image'));
      img.src = dataUrl;
    });

    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', quality);
  };

  const extractUploadUrl = (uploadPayload) =>
    uploadPayload?.data?.url ||
    uploadPayload?.data?.secureUrl ||
    uploadPayload?.url ||
    uploadPayload?.secureUrl ||
    '';

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoError('');
    setPhotoUploading(true);

    try {
      const dataUrl = await imageFileToUploadDataUrl(file, { maxSize: 900, quality: 0.84 });
      const uploadPayload = await uploadService.uploadImage(dataUrl, 'user-profile');
      const secureUrl = extractUploadUrl(uploadPayload);

      if (!secureUrl) {
        throw new Error('Upload failed');
      }

      setFormData((prev) => ({ ...prev, profileImage: secureUrl }));
      toast.success('Photo uploaded successfully');
    } catch (err) {
      const errMsg = err?.message || 'Photo upload failed';
      setPhotoError(errMsg);
      toast.error(errMsg);
      setFormData((prev) => ({ ...prev, profileImage: '' }));
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const handleStartSignup = async (e) => {
    if (e) e.preventDefault();
    if (!isValidPhone || otpSending) return;

    setOtpSending(true);
    setError('');

    try {
      clearLocalUserSession();
      await userAuthService.startOtp(formData.phone);
      navigate('/taxi/user/verify-otp', {
        state: {
          phone: formData.phone,
          referralCode: formData.referralCode,
          employeeCode: formData.employeeCode,
        },
      });
    } catch (err) {
      const errMsg = err?.message || 'Unable to send OTP. Please try again.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setOtpSending(false);
    }
  };

  const handleSignup = async (e, overrides = {}) => {
    if (e) e.preventDefault();
    if (!formData.name.trim() || !isValidPhone || loading) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await userAuthService.signup({
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        gender: formData.gender,
        profileImage: overrides.profileImage ?? formData.profileImage,
        referralCode: formData.referralCode,
        employeeCode: formData.employeeCode,
      });
      const payload = response?.data || {};

      localStorage.setItem('token', payload.token || '');
      localStorage.setItem('userToken', payload.token || '');
      localStorage.setItem('role', 'user');
      localStorage.setItem('userInfo', JSON.stringify(payload.user || {}));
      notifyAuthReady();
      syncPushTokens();

      sessionStorage.removeItem(PENDING_SIGNUP_PHONE_KEY);
      sessionStorage.removeItem(PENDING_SIGNUP_REFERRAL_CODE_KEY);
      sessionStorage.removeItem(PENDING_SIGNUP_EMPLOYEE_CODE_KEY);

      // Success signup goes to permission sequence
      setTimeout(() => setShowPermissions(true), 800);
    } catch (err) {
      const message = err?.message || 'Signup failed. Please try again.';

      if (message === 'OTP session not found' || message === 'Verify OTP before signup' || message === 'OTP session expired') {
        sessionStorage.removeItem(PENDING_SIGNUP_PHONE_KEY);
        setStep('phone');
        setError('Your verification session expired. Please request a fresh OTP to continue.');
        toast.error('Session expired. Please request OTP again.');
        return;
      }

      setError(message);
      toast.error(message);
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

  const genders = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'prefer-not-to-say', label: 'Skip' }
  ];

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
            {step === 'profile' ? 'Profile Setup' : 'Create Account'}
          </span>
          <h1 className="text-[28px] font-black leading-[1.15] tracking-tight uppercase text-white">
            <span className="login-accent-text">
              {step === 'profile' ? 'Complete Profile' : 'Start Journey'}
            </span> <br />
            Standard with Appzeto
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
            {step === 'phone' ? (
              <motion.form
                key="phone-step"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                onSubmit={handleStartSignup}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h2 className="text-[26px] font-black login-primary-text leading-tight">
                    Create your account
                  </h2>
                  <p className="login-subtitle text-[14px] font-semibold">
                    Start with your mobile number and we will verify it before creating your {appName} account.
                  </p>
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
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      autoFocus
                      placeholder="Enter Mobile Number"
                      className="flex-1 bg-transparent border-none p-0 text-xl font-bold login-primary-text outline-none focus:ring-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 tracking-widest"
                      value={formData.phone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                      required
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
                  type="submit"
                  disabled={!isValidPhone || otpSending}
                  className="login-button flex items-center justify-center gap-3"
                >
                  {otpSending ? (
                    <div className="h-6 w-6 border-4 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Continue</span>
                      <ChevronRight size={24} strokeWidth={4} />
                    </>
                  )}
                </motion.button>

                <div className="space-y-3 text-center">
                  <p className="text-sm font-semibold login-subtitle">
                    Already have an account?{' '}
                    <Link
                      to="/taxi/user/login"
                      state={{ phone: formData.phone }}
                      className="font-bold login-primary-text underline underline-offset-4"
                    >
                      Login
                    </Link>
                  </p>
                </div>
              </motion.form>
            ) : (
              <motion.form
                key="profile-step"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                onSubmit={handleSignup}
                className="space-y-6 max-h-[48dvh] overflow-y-auto pr-1 no-scrollbar"
              >
                {/* Avatar Section */}
                <div className="flex flex-col items-center">
                  <div
                    onClick={() => !photoUploading && fileInputRef.current?.click()}
                    className={`relative group w-20 h-20 rounded-full bg-zinc-100 dark:bg-white/5 border-2 ${photoUploading ? 'border-zinc-300 dark:border-white/10 cursor-not-allowed' : 'border-zinc-300 dark:border-white/10 hover:border-[#FFB300] cursor-pointer'
                      } flex items-center justify-center overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md active:scale-95`}
                  >
                    {avatarPreviewUrl ? (
                      <img src={avatarPreviewUrl} alt="Profile" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <User size={32} className="login-subtitle group-hover:login-primary-text transition-colors" />
                    )}

                    {!photoUploading && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-300">
                        <Camera size={14} className="drop-shadow" />
                        <span className="text-[8px] font-bold uppercase tracking-wider mt-1 drop-shadow">Upload</span>
                      </div>
                    )}

                    {photoUploading && (
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center text-white">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      </div>
                    )}
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    disabled={photoUploading}
                    className="hidden"
                    onChange={handlePhotoChange}
                  />

                  <div className="mt-2.5 text-center">
                    <p className="text-[9px] font-extrabold uppercase tracking-widest login-primary-text">
                      Profile Photo <span className="login-subtitle font-bold">(Optional)</span>
                    </p>
                    {avatarPreviewUrl && (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, profileImage: '' }))}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-black text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <Trash2 size={10} />
                        Remove photo
                      </button>
                    )}
                    {photoError && <p className="text-[10px] font-bold text-rose-500 mt-1">{photoError}</p>}
                  </div>
                </div>

                {/* Form fields */}
                <div className="space-y-4">
                  {/* Phone Verified */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-widest login-subtitle ml-1">Mobile Number *</label>
                    <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-zinc-200/30 bg-zinc-100/20 dark:border-white/5 dark:bg-white/5 opacity-60">
                      <Smartphone size={18} className="login-subtitle" />
                      <span className="text-base font-bold login-subtitle">+91</span>
                      <input
                        type="tel"
                        value={formData.phone}
                        readOnly
                        aria-readonly="true"
                        className="flex-1 bg-transparent border-none p-0 text-base font-bold login-subtitle outline-none cursor-not-allowed"
                      />
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-emerald-500 border border-emerald-500/20">
                        Verified
                      </span>
                    </div>
                  </div>

                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-widest login-subtitle ml-1">Full Name *</label>
                    <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-zinc-200/50 bg-zinc-100/50 dark:border-white/5 dark:bg-white/5 focus-within:border-[#FFB300] focus-within:bg-zinc-50 dark:focus-within:bg-black/30 transition-all">
                      <User size={18} className="login-subtitle" />
                      <input
                        type="text"
                        placeholder="Enter your name"
                        className="flex-1 bg-transparent border-none p-0 text-base font-bold login-primary-text outline-none focus:ring-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-widest login-subtitle ml-1">Email Address (Optional)</label>
                    <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-zinc-200/50 bg-zinc-100/50 dark:border-white/5 dark:bg-white/5 focus-within:border-[#FFB300] focus-within:bg-zinc-50 dark:focus-within:bg-black/30 transition-all">
                      <Mail size={18} className="login-subtitle" />
                      <input
                        type="email"
                        placeholder="Enter email address"
                        className="flex-1 bg-transparent border-none p-0 text-base font-bold login-primary-text outline-none focus:ring-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Gender Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-widest login-subtitle ml-1">Gender (Optional)</label>
                    <div className="flex gap-2.5">
                      {genders.map((g) => (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, gender: g.value })}
                          className={`flex-1 py-3.5 px-4 rounded-2xl font-bold transition-all border-2 text-sm text-center cursor-pointer ${formData.gender === g.value
                            ? 'bg-[#FFB300] border-[#FFB300] text-slate-950 shadow-md shadow-yellow-500/10'
                            : 'border-zinc-200/50 bg-zinc-100/50 dark:border-white/5 dark:bg-white/5 login-primary-text'
                            }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Referral Code */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-widest login-subtitle ml-1">Referral Code (Optional)</label>
                    <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-zinc-200/50 bg-zinc-100/50 dark:border-white/5 dark:bg-white/5 focus-within:border-[#FFB300] focus-within:bg-zinc-50 dark:focus-within:bg-black/30 transition-all">
                      <Gift size={18} className="login-subtitle" />
                      <input
                        type="text"
                        placeholder="Enter referral code"
                        className="flex-1 bg-transparent border-none p-0 text-base font-bold login-primary-text outline-none focus:ring-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 uppercase"
                        value={formData.referralCode}
                        onChange={(e) => setFormData((current) => ({
                          ...current,
                          referralCode: e.target.value.trim().toUpperCase(),
                        }))}
                      />
                    </div>
                  </div>

                  {/* Employee Code */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-widest login-subtitle ml-1">Employee Code (Optional)</label>
                    <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-zinc-200/50 bg-zinc-100/50 dark:border-white/5 dark:bg-white/5 focus-within:border-[#FFB300] focus-within:bg-zinc-50 dark:focus-within:bg-black/30 transition-all">
                      <User size={18} className="login-subtitle" />
                      <input
                        type="text"
                        placeholder="Enter employee code"
                        className="flex-1 bg-transparent border-none p-0 text-base font-bold login-primary-text outline-none focus:ring-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 uppercase"
                        value={formData.employeeCode}
                        onChange={(e) => setFormData((current) => ({
                          ...current,
                          employeeCode: e.target.value.trim().toUpperCase(),
                        }))}
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-400">
                      {error}
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-3">
                  <motion.button
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={!formData.name.trim() || !isValidPhone || loading || photoUploading}
                    className="login-button flex items-center justify-center gap-3 cursor-pointer"
                  >
                    {loading ? (
                      <div className="h-6 w-6 border-4 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Let's Go!</span>
                        <ChevronRight size={24} strokeWidth={4} />
                      </>
                    )}
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => navigate('/taxi/user/support')}
                    className="w-full py-3.5 text-sm font-extrabold login-subtitle hover:text-[#FFB300] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LifeBuoy size={16} />
                    Need Help?
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
};

export default Signup;
