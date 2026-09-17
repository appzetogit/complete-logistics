import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Camera, User, Phone, Mail, Check, CheckCircle2, Loader2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useImageUpload } from '../../../../shared/hooks/useImageUpload';
import { getCurrentDriver, updateDriverProfile } from '../../services/registrationService';
import toast from 'react-hot-toast';

const Motion = motion;
const NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const normalizeName = (value) => String(value || '').replace(/[^A-Za-z .'-]/g, '').replace(/\s+/g, ' ');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const unwrapDriver = (response) => response?.data?.data || response?.data || response || {};

const EditProfile = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
    const [showSuccess, setShowSuccess] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [driver, setDriver] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: ''
    });
    const [errors, setErrors] = useState({});

    const { 
        uploading: imageUploading, 
        preview: imagePreview, 
        handleFileChange: onImageFileChange
    } = useImageUpload({
        folder: 'driver-profiles',
        onSuccess: (url) => setDriver(prev => ({ ...prev, profileImage: url }))
    });

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await getCurrentDriver();
                const data = unwrapDriver(res);
                setDriver(data);
                setFormData({
                    name: data.name || '',
                    phone: data.phone || '',
                    email: data.email || ''
                });
            } catch (error) {
                console.error('Failed to load profile:', error);
                toast.error('Failed to load profile');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleSave = async () => {
        const nextErrors = {};
        const trimmedName = String(formData.name || '').trim();
        const email = normalizeEmail(formData.email);

        if (!NAME_REGEX.test(trimmedName)) {
            nextErrors.name = 'Full name can contain alphabets only';
        }

        if (email && (!EMAIL_REGEX.test(email) || email.includes('..'))) {
            nextErrors.email = 'Please enter a valid email address, example aa@gmail.com';
        }

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        try {
            setSubmitting(true);
            const payload = {
                ...formData,
                name: trimmedName,
                email,
                profileImage: driver.profileImage
            };
            await updateDriverProfile(payload);
            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                navigate(-1);
            }, 1500);
        } catch (err) {
            toast.error(err.message || 'Failed to update profile');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="animate-spin text-slate-400" size={32} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans p-6 pt-10 overflow-hidden">
            <header className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate(`${routePrefix}/profile`)} className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center active:scale-95 transition-transform">
                    <ArrowLeft size={18} />
                </button>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">Edit Profile</h1>
            </header>

            <AnimatePresence>
                {showSuccess && (
                    <Motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="fixed top-10 left-6 right-6 z-[100] bg-emerald-500 text-white p-4 rounded-2xl flex items-center gap-3 shadow-2xl shadow-emerald-500/20"
                    >
                         <CheckCircle2 size={20} strokeWidth={3} />
                         <p className="text-[13px] font-bold tracking-wide">Profile Updated Successfully</p>
                    </Motion.div>
                )}
            </AnimatePresence>

            <main className="space-y-6 max-w-sm mx-auto">
                {/* Profile Image with Cloudinary Upload */}
                <div className="flex flex-col items-center gap-4 mb-8">
                    <div className="relative group">
                        <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center shadow-lg relative overflow-hidden">
                            {(imagePreview || driver?.profileImage) ? (
                                <img 
                                    src={imagePreview || driver.profileImage} 
                                    className={`w-full h-full object-cover ${imageUploading ? 'opacity-50' : ''}`} 
                                    alt="Profile" 
                                />
                            ) : (
                                <User size={48} className="text-white opacity-20" strokeWidth={1.5} />
                            )}
                            {imageUploading && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Loader2 className="animate-spin text-white" size={24} />
                                </div>
                            )}
                        </div>
                        <label className="absolute bottom-0 right-0 w-9 h-9 bg-white rounded-xl shadow-xl flex items-center justify-center cursor-pointer border-2 border-slate-50 hover:scale-110 active:scale-90 transition-all">
                            <Camera size={16} className="text-slate-900" />
                            <input 
                                type="file" 
                                accept="image/*" 
                                capture="user"
                                className="hidden" 
                                onChange={onImageFileChange}
                                disabled={imageUploading}
                            />
                        </label>
                    </div>
                    <div className="text-center">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                            {imageUploading ? 'Optimizing For WebP...' : 'Profile Photo'}
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    {[
                        { key: 'name', label: 'Full Name', value: formData.name, icon: <User size={16} />, type: 'text' },
                        { key: 'phone', label: 'Mobile Number', value: formData.phone, icon: <Phone size={16} />, type: 'tel', disabled: true },
                        { key: 'email', label: 'Email Address', value: formData.email, icon: <Mail size={16} />, type: 'email' }
                    ].map((field, idx) => (
                        <div key={idx} className={`bg-white p-4 py-5 rounded-2xl border border-slate-100 shadow-sm space-y-2 transition-all ${field.disabled ? 'opacity-70 bg-slate-50 cursor-not-allowed' : 'focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/5'}`}>
                            <div className="flex items-center gap-2 text-slate-400">
                                {field.icon}
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{field.label}</span>
                            </div>
                            <input 
                                type={field.type}
                                value={field.value}
                                disabled={field.disabled}
                                onChange={(e) => {
                                    const value = field.key === 'name'
                                        ? normalizeName(e.target.value)
                                        : field.key === 'email'
                                            ? normalizeEmail(e.target.value)
                                            : e.target.value;
                                    setFormData(prev => ({ ...prev, [field.key]: value }));
                                    setErrors((prev) => ({ ...prev, [field.key]: '' }));
                                }}
                                className="w-full text-[15px] font-semibold text-slate-900 bg-transparent border-none p-0 focus:ring-0 tracking-tight"
                            />
                            {errors[field.key] ? (
                                <p className="text-[11px] font-bold text-rose-500">{errors[field.key]}</p>
                            ) : null}
                        </div>
                    ))}
                </div>

                <div className="pt-6">
                    <Motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSave}
                        disabled={submitting || imageUploading}
                        className="w-full h-15 bg-slate-900 text-white rounded-2xl flex items-center justify-center gap-3 text-[14px] font-bold shadow-xl shadow-slate-900/20 disabled:opacity-50 transition-all"
                    >
                        {submitting ? <Loader2 className="animate-spin" size={20} /> : (
                            <>Save Changes <Check size={18} strokeWidth={3} /></>
                        )}
                    </Motion.button>
                </div>
            </main>
        </div>
    );
};

export default EditProfile;
