import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Smartphone, Camera, CheckCircle2, Loader2, ImagePlus } from 'lucide-react';
import { userAuthService } from '../../services/authService';
import { useImageUpload } from '../../../../shared/hooks/useImageUpload';
import toast from 'react-hot-toast';

const ProfileSettings = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const navigate = useNavigate();

  const { 
    uploading: photoUploading, 
    preview: photoPreview, 
    handleFileChange: onPhotoFileChange,
  } = useImageUpload({
    folder: 'user-profiles',
    onSuccess: (url) => setProfileImage(url)
  });

  const avatarSrc = useMemo(() => {
    return (
      photoPreview ||
      profileImage ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=E85D04&color=fff`
    );
  }, [name, profileImage, photoPreview]);

  useEffect(() => {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
    } catch {
      stored = {};
    }
    if (stored?.name) setName(stored.name);
    if (stored?.email) setEmail(stored.email);
    if (stored?.phone) setPhone(stored.phone);
    if (stored?.profileImage) setProfileImage(stored.profileImage);

    const loadProfile = async () => {
      try {
        const response = await userAuthService.getCurrentUser();
        const user = response?.data?.user || {};
        setName(user.name || stored?.name || '');
        setEmail(user.email || stored?.email || '');
        setPhone(user.phone || stored?.phone || '');
        setProfileImage(user.profileImage || stored?.profileImage || '');
        localStorage.setItem('userInfo', JSON.stringify(user));
      } catch {
        setName((prev) => prev || '');
        setEmail((prev) => prev || '');
        setPhone((prev) => prev || '');
        setProfileImage((prev) => prev || stored?.profileImage || '');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await userAuthService.updateCurrentUser({
        name,
        email,
        profileImage,
      });
      const user = response?.data?.user || {};
      localStorage.setItem('userInfo', JSON.stringify(user));
      toast.success('Profile updated successfully');
      const basePath = window.location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
      navigate(`${basePath}/profile`);
    } catch (err) {
      setSaveError(err?.message || 'Save failed');
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-white">
           <Loader2 className="animate-spin text-slate-300" size={32} />
        </div>
     );
  }

  return (
    <div className="min-h-screen bg-white max-w-lg mx-auto flex flex-col font-sans relative">
      <header className="bg-white px-5 py-8 flex items-center gap-6 border-b border-gray-50 shadow-sm sticky top-0 z-20">
         <button onClick={() => navigate('/taxi/user/profile')} className="p-2 -ml-2 active:scale-95 transition-all">
            <ArrowLeft size={24} className="text-slate-900" strokeWidth={3} />
         </button>
         <div>
            <h1 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5 opacity-60">Account Settings</h1>
            <h2 className="text-[18px] font-bold text-slate-900 tracking-tight leading-none">Your Profile</h2>
         </div>
      </header>

      <div className="flex-1 p-5 space-y-10 overflow-y-auto no-scrollbar">
         {/* AVATAR EDIT AREA */}
         <div className="flex flex-col items-center gap-4 py-4">
            <div className="relative">
                <div className="w-[110px] h-[110px] rounded-[42px] bg-slate-50 p-1.5 border border-slate-100 shadow-xl overflow-hidden relative">
                    <img 
                        src={avatarSrc} 
                        className={`w-full h-full rounded-[34px] object-cover ${photoUploading ? 'opacity-50 blur-[2px]' : ''}`} 
                        alt="User" 
                    />
                    {photoUploading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="animate-spin text-orange-600" size={28} strokeWidth={3} />
                        </div>
                    )}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-white p-2.5 rounded-2xl shadow-xl border border-slate-50 text-slate-900">
                    <Camera size={18} strokeWidth={2.5} />
                </div>
            </div>
            <div className="mt-1 grid w-full max-w-[280px] grid-cols-2 gap-2">
              <label className={`relative flex h-11 items-center justify-center gap-2 rounded-2xl border text-[11px] font-bold uppercase tracking-wider transition-all ${
                photoUploading
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : 'cursor-pointer border-slate-200 bg-white text-slate-700 active:scale-[0.99]'
              }`}>
                <ImagePlus size={14} />
                Gallery
                <input
                  type="file"
                  accept="image/*"
                  disabled={photoUploading}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Upload profile photo from gallery"
                  onChange={onPhotoFileChange}
                />
              </label>
              <label className={`relative flex h-11 items-center justify-center gap-2 rounded-2xl border text-[11px] font-bold uppercase tracking-wider transition-all ${
                photoUploading
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : 'cursor-pointer border-slate-900 bg-slate-950 text-white active:scale-[0.99]'
              }`}>
                <Camera size={14} />
                Camera
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  disabled={photoUploading}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Capture profile photo"
                  onChange={onPhotoFileChange}
                />
              </label>
            </div>
            <div className="text-center">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                    {photoUploading ? 'Optimizing For WebP...' : 'Change Profile Photo'}
                </p>
            </div>
         </div>

         {/* FORM FIELDS */}
         <div className="space-y-6">
            <div className="space-y-2">
               <label className="text-[11px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Full Name</label>
               <div className="flex items-center gap-4 bg-slate-50/50 border border-slate-100 rounded-[28px] p-4 px-5 focus-within:bg-white focus-within:border-slate-900 transition-all shadow-sm">
                  <User size={18} className="text-slate-400" />
                  <input 
                     type="text" 
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     className="flex-1 bg-transparent border-none text-[15px] font-bold text-slate-900 focus:outline-none"
                     placeholder="Your full name"
                  />
                  {name && <CheckCircle2 size={16} className="text-emerald-500" />}
               </div>
            </div>

            <div className="space-y-2">
               <label className="text-[11px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Email Address</label>
               <div className="flex items-center gap-4 bg-slate-50/50 border border-slate-100 rounded-[28px] p-4 px-5 focus-within:bg-white focus-within:border-slate-900 transition-all shadow-sm">
                  <Mail size={18} className="text-slate-400" />
                  <input 
                     type="email" 
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     className="flex-1 bg-transparent border-none text-[15px] font-bold text-slate-900 focus:outline-none"
                     placeholder="yourname@example.com"
                  />
               </div>
            </div>

            <div className="space-y-2">
               <label className="text-[11px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Phone Number</label>
               <div className="flex items-center gap-4 bg-slate-100/50 border border-slate-50 rounded-[28px] p-4 px-5 shadow-inner opacity-70 cursor-not-allowed">
                  <Smartphone size={18} className="text-slate-400" />
                  <span className="flex-1 bg-transparent border-none text-[15px] font-bold text-slate-400">
                    {phone ? `+91 ${phone}` : '+91'}
                  </span>
                  <div className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider">Verified</div>
               </div>
            </div>
         </div>
         {saveError && <p className="text-sm font-bold text-rose-500 text-center">{saveError}</p>}
      </div>

      <div className="p-6 bg-white border-t border-gray-50 pb-12">
         <button 
            onClick={handleSave}
            disabled={photoUploading || saving}
            className="w-full bg-slate-900 h-15 rounded-[28px] text-[15px] font-bold text-white shadow-xl shadow-slate-900/10 active:scale-98 transition-all disabled:opacity-50"
         >
            {saving ? 'Saving Changes...' : 'Save Profile'}
         </button>
      </div>
    </div>
  );
};

export default ProfileSettings;
