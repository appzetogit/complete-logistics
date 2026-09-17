import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Lock, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';

const UserModal = ({ isOpen, onClose, onSubmit, editingUser = null, isLoading = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    gender: 'male',
    active: true
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (editingUser) {
      setFormData({
        name: editingUser.name || '',
        email: editingUser.email || '',
        mobile: editingUser.phone || '', // Note: phone is mapped to mobile in UserList
        password: '',
        gender: editingUser.gender || 'male',
        active: editingUser.status === 'Active'
      });
    } else {
      setFormData({
        name: '',
        email: '',
        mobile: '',
        password: '',
        gender: 'male',
        active: true
      });
    }
    setErrors({});
  }, [editingUser, isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const newErrors = {};
    if (!formData.name) newErrors.name = 'Name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    if (!editingUser && !formData.password) newErrors.password = 'Password is required';
    if (!formData.mobile) newErrors.mobile = 'Mobile number is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div 
        className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                {editingUser ? 'Update Passenger' : 'Create New Passenger'}
              </h3>
              <p className="text-sm font-medium text-gray-500 mt-1">
                {editingUser ? `Editing ID: #${editingUser.id.slice(-6)}` : 'Add a new customer to the platform'}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="w-10 h-10 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-950 hover:bg-gray-50 transition-all"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 block px-1">Full Name</label>
                <div className="relative group">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-yellow-500 transition-colors" />
                  <input 
                    type="text" 
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Rahul Sharma"
                    className={`w-full h-14 pl-12 pr-4 bg-gray-50 border ${errors.name ? 'border-rose-200 bg-rose-50/20' : 'border-gray-200'} rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all`}
                  />
                </div>
                {errors.name && <p className="text-[10px] font-bold text-rose-500 px-1">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 block px-1">Email Address</label>
                <div className="relative group">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-yellow-500 transition-colors" />
                  <input 
                    type="email" 
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="rahul@example.com"
                    className={`w-full h-14 pl-12 pr-4 bg-gray-50 border ${errors.email ? 'border-rose-200 bg-rose-50/20' : 'border-gray-200'} rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all`}
                  />
                </div>
                {errors.email && <p className="text-[10px] font-bold text-rose-500 px-1">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 block px-1">Mobile Number</label>
                <div className="relative group">
                  <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-yellow-500 transition-colors" />
                  <input 
                    type="tel" 
                    name="mobile"
                    value={formData.mobile}
                    onChange={handleChange}
                    placeholder="+91 9999999999"
                    className={`w-full h-14 pl-12 pr-4 bg-gray-50 border ${errors.mobile ? 'border-rose-200 bg-rose-50/20' : 'border-gray-200'} rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all`}
                  />
                </div>
                {errors.mobile && <p className="text-[10px] font-bold text-rose-500 px-1">{errors.mobile}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 block px-1">Gender</label>
                <div className="relative">
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select 
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="w-full h-14 pl-4 pr-10 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none appearance-none focus:bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 block px-1">
                  {editingUser ? 'Update Password (Optional)' : 'Password'}
                </label>
                <div className="relative group">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-yellow-500 transition-colors" />
                  <input 
                    type="password" 
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={editingUser ? '••••••••' : 'Enter strong password'}
                    className={`w-full h-14 pl-12 pr-4 bg-gray-50 border ${errors.password ? 'border-rose-200 bg-rose-50/20' : 'border-gray-200'} rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all`}
                  />
                </div>
                {errors.password && <p className="text-[10px] font-bold text-rose-500 px-1">{errors.password}</p>}
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl border border-gray-200 mt-auto h-14">
                <span className="text-sm font-bold text-gray-700">Active Status</span>
                <button 
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, active: !prev.active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.active ? 'bg-emerald-500' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={isLoading}
                className="flex-1 py-4 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-900 transition-all shadow-md flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> 
                    {editingUser ? 'Update Passenger' : 'Submit Passenger'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserModal;
