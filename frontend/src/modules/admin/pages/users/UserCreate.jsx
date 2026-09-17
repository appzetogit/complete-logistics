import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Loader2,
  Lock,
  Mail,
  Phone,
  Save,
  User,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useImageUpload } from '../../../../shared/hooks/useImageUpload';
import { adminService } from '../../services/adminService';

const initialFormData = {
  name: '',
  gender: '',
  mobile: '',
  email: '',
  password: '',
  confirmPassword: '',
  profileImage: '',
};

const inputClass = 'admin-user-field w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors';
const labelClass = 'block text-xs font-semibold text-black mb-1.5';

const UserCreate = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(initialFormData);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleUploadSuccess = useCallback((url) => {
    setFormData((current) => ({ ...current, profileImage: url }));
  }, []);

  const {
    uploading: imageUploading,
    preview: imagePreview,
    handleFileChange,
  } = useImageUpload({
    folder: 'user-profiles',
    onSuccess: handleUploadSuccess,
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setError('');
  };

  const validate = () => {
    if (!formData.name.trim()) return 'Name is required';
    if (!formData.gender) return 'Select gender';
    if (!formData.mobile.trim()) return 'Mobile number is required';
    if (!/^\d{10}$/.test(formData.mobile.replace(/\D/g, ''))) return 'Enter a valid 10-digit mobile number';
    if (!formData.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) return 'Enter a valid email address';
    if (formData.password.length < 5) return 'Password must be at least 5 characters';
    if (formData.password !== formData.confirmPassword) return 'Passwords do not match';
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const payload = {
        name: formData.name.trim(),
        gender: formData.gender,
        mobile: formData.mobile.replace(/\D/g, ''),
        phone: formData.mobile.replace(/\D/g, ''),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        password_confirmation: formData.confirmPassword,
        profileImage: formData.profileImage,
        active: true,
      };

      const response = await adminService.createUser(payload);

      if (!response.success) {
        throw new Error(response.message || 'Failed to create user');
      }

      setSuccess(true);
      toast.success('Passenger created successfully');
      setTimeout(() => navigate('/admin/users'), 900);
    } catch (submitError) {
      setError(submitError.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Users</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Create User</span>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-xl text-gray-900 font-bold">Add User</h1>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center text-gray-900 border border-yellow-100">
                <User size={18} />
              </div>
              <div>
                <h3 className="text-sm text-gray-900 font-bold">User Details</h3>
                <p className="text-xs text-gray-400">Customer identity and login information</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>
                  <User size={12} className="inline mr-1 text-gray-400" />
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter name"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Users size={12} className="inline mr-1 text-gray-400" />
                  Select Gender *
                </label>
                <select
                  name="gender"
                  required
                  value={formData.gender}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Choose gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  <Phone size={12} className="inline mr-1 text-gray-400" />
                  Mobile *
                </label>
                <input
                  type="tel"
                  name="mobile"
                  required
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="Enter mobile number"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Mail size={12} className="inline mr-1 text-gray-400" />
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Enter email"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Lock size={12} className="inline mr-1 text-gray-400" />
                  Password *
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter password"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <CheckCircle2 size={12} className="inline mr-1 text-gray-400" />
                  Confirm Password *
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm password"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center text-gray-900 border border-yellow-100">
                <ImagePlus size={18} />
              </div>
              <div>
                <h3 className="text-sm text-gray-900 font-bold">Profile Picture</h3>
                <p className="text-xs text-gray-400">Optional user photo</p>
              </div>
            </div>

            <label className="group relative block cursor-pointer">
              <div className="flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-200 bg-gray-50 transition-colors group-hover:border-yellow-400 group-hover:bg-yellow-50">
                {imagePreview || formData.profileImage ? (
                  <img src={imagePreview || formData.profileImage} alt="Profile preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-gray-400">
                    <ImagePlus size={34} strokeWidth={1.5} className="mb-3" />
                    <p className="text-xs font-bold">Upload image</p>
                  </div>
                )}
                {imageUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                    <Loader2 className="animate-spin text-yellow-500" size={28} />
                  </div>
                )}
              </div>
              <input type="file" accept="image/*" onChange={handleFileChange} disabled={imageUploading} className="absolute inset-0 opacity-0" />
            </label>

            <p className="mt-4 text-center text-xs text-gray-400">
              Supported formats: JPG, PNG, WEBP
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 shadow-sm">
            <button
              type="submit"
              disabled={isSubmitting || imageUploading || success}
              className="w-full py-3 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-900 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : success ? <CheckCircle2 size={16} /> : <Save size={16} />}
              {success ? 'User Created' : isSubmitting ? 'Saving...' : 'Create User'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              className="w-full py-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>

            {error && (
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
                <p className="text-sm font-semibold text-rose-600">{error}</p>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default UserCreate;
