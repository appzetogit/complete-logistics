import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  Save,
  Plus,
  Trash2,
  Edit2,
  ToggleLeft,
  ToggleRight,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  Sparkles,
  MapPin,
  FileText,
  HelpCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadService } from '../../../../shared/services/uploadService';
import api from '../../../../shared/api/axiosInstance';
import { useSettings } from '../../../../shared/context/SettingsContext';

const STORAGE_KEY = 'Appzeto :admin:user-app-settings';

const defaultSettings = {
  homeSections: {
    enableEverything: true,
    enableExplore: true,
    enablePromo: true,
    enableGoPlaces: true,
    enableFooter: true
  },
  everything: [
    { id: '1', title: 'Parcel', subtitle: 'Send anything', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Bike Taxi', subtitle: 'Beat the traffic', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Book now', subtitle: 'Your everyday rides', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'All Services', subtitle: 'All Services', image: '', route: '', order: 4, status: 'active' }
  ],
  explore: [
    { id: '1', title: 'Parcel on Bike', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Auto', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Cab Economy', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'Bike', image: '', route: '/taxi/user/ride/select-location', order: 4, status: 'active' }
  ],
  promos: [
    { id: '1', title: 'Experience A New Standard With Appzeto', subtitle: 'A premier private hire service where luxury and reliability converge.', image: '', route: '/taxi/user/ride/select-location', order: 1, status: 'active' },
    { id: '2', title: 'Need to Send Packages? Try Parcel!', subtitle: 'Fast and secure delivery across Indore at affordable prices.', image: '', route: '/taxi/user/parcel/type', order: 2, status: 'active' }
  ],
  goPlaces: [
    { id: '1', title: 'Hassle-Free Airport Rides', image: '', route: '/taxi/user/ride/select-location', order: 1, status: 'active' },
    { id: '2', title: 'Quick Rides to Railway Station', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Ride to Bus Terminal', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' }
  ],
  footer: {
    hashtag: '#goAppzeto',
    line1: 'Made for India',
    line2: 'Crafted for riders'
  }
};

const SectionCard = ({ title, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-8 flex flex-col">
    {title && (
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-xs font-black text-gray-700 font-bold">{title}</h3>
      </div>
    )}
    <div className="p-6 flex-grow">
      {children}
    </div>
  </div>
);

const AdminUserAppManagement = ({ tab: initialTab }) => {
  const [activeTab, setActiveTab] = useState(initialTab || 'home-sections');
  const { refreshSettings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(defaultSettings);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/general-settings/user-home-management');
      const savedSettings = res.data?.settings || {};

      let fetchedPromos = [];
      try {
        const bannersRes = await api.get('/admin/banners');
        const bannersData = bannersRes.data?.data?.results || bannersRes.data?.results || bannersRes.data || [];
        fetchedPromos = bannersData.map((b, idx) => ({
          id: b._id || b.id || String(idx + 1),
          title: b.title || 'Experience A New Standard With Appzeto',
          subtitle: b.subtitle || 'A premier private hire service where luxury and reliability converge.',
          imageUrl: b.image || '',
          image: b.image || '',
          route: b.redirect_url || b.external_link || b.deep_link || '/taxi/user/ride/select-location',
          status: b.active !== false ? 'active' : 'inactive',
          order: idx + 1
        }));
      } catch (e) {
        console.error('Failed to fetch banners list:', e);
      }

      const promosToUse = fetchedPromos.length > 0 ? fetchedPromos : (savedSettings.promos || defaultSettings.promos);

      const nextSettings = {
        ...defaultSettings,
        ...savedSettings,
        homeSections: {
          ...defaultSettings.homeSections,
          ...(savedSettings.homeSections || {})
        },
        everything: savedSettings.everything || defaultSettings.everything,
        explore: savedSettings.explore || defaultSettings.explore,
        promos: promosToUse,
        goPlaces: savedSettings.goPlaces || defaultSettings.goPlaces,
        footer: {
          ...defaultSettings.footer,
          ...(savedSettings.footer || {})
        }
      };

      setSettings(nextSettings);

      // Auto-save settings to DB if we fetched active banners to keep in sync
      if (fetchedPromos.length > 0) {
        await api.patch('/admin/general-settings/user-home-management', { settings: nextSettings });
      }
    } catch (err) {
      console.error('Failed to load user-app-settings from backend:', err);
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          setSettings(JSON.parse(saved));
        }
      } catch (e) {
        console.error(e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const [editItem, setEditItem] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (editItem) {
      setUploadedImageUrl(editItem.uploadedImage || null);
    } else {
      setUploadedImageUrl(null);
    }
  }, [editItem]);

  useEffect(() => {
    if (isAdding) {
      setUploadedImageUrl(null);
    }
  }, [isAdding]);


  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }

    try {
      setUploading(true);
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const response = await uploadService.uploadImage(base64, 'admin-user-app');
      const url = response.secureUrl || response.url || response;
      if (url) {
        setUploadedImageUrl(url);
        toast.success('Image uploaded successfully!');
      } else {
        toast.error('Failed to get uploaded image URL');
      }
    } catch (error) {
      console.error(error);
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const processFooterFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }

    try {
      setUploading(true);
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const response = await uploadService.uploadImage(base64, 'admin-user-app-footer');
      const url = response.secureUrl || response.url || response;
      if (url) {
        handleFooterChange('uploadedImage', url);
        toast.success('Footer image uploaded successfully!');
      } else {
        toast.error('Failed to get uploaded image URL');
      }
    } catch (error) {
      console.error(error);
      toast.error('Footer image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const handleRemoveImage = () => {
    setUploadedImageUrl(null);
    toast.success('Image removed');
  };

  // Sync tab with props changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const fetchHomeSections = fetchSettings;

  const handleSave = async () => {
    try {
      await api.patch('/admin/general-settings/user-home-management', { settings });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      window.dispatchEvent(new Event('storage'));
      if (refreshSettings) {
        await refreshSettings();
      }
      if (typeof fetchHomeSections === 'function') {
        await fetchHomeSections();
      }
      toast.success('User App settings saved successfully!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings to database');
    }
  };

  const updateHomeSectionToggle = (key) => {
    setSettings(prev => ({
      ...prev,
      homeSections: {
        ...prev.homeSections,
        [key]: !prev.homeSections[key]
      }
    }));
  };

  const handleFooterChange = (key, val) => {
    setSettings(prev => ({
      ...prev,
      footer: {
        ...prev.footer,
        [key]: val
      }
    }));
  };

  const getTabItems = () => {
    if (activeTab === 'everything') return settings.everything;
    if (activeTab === 'explore') return settings.explore;
    if (activeTab === 'promos') return settings.promos;
    if (activeTab === 'go-places') return settings.goPlaces;
    return [];
  };

  const updateTabItems = (newItems) => {
    const key = activeTab === 'everything' ? 'everything' :
      activeTab === 'explore' ? 'explore' :
        activeTab === 'promos' ? 'promos' :
          activeTab === 'go-places' ? 'go-places' : '';
    if (!key) return;

    // Convert tab name mapping correctly
    const settingsKey = key === 'go-places' ? 'goPlaces' : key;
    setSettings(prev => ({
      ...prev,
      [settingsKey]: newItems
    }));
  };

  const toggleItemStatus = (id) => {
    const items = getTabItems();
    const nextItems = items.map(item => item.id === id ? { ...item, status: item.status === 'active' ? 'inactive' : 'active' } : item);
    updateTabItems(nextItems);
  };

  const deleteItem = (id) => {
    const items = getTabItems();
    const nextItems = items.filter(item => item.id !== id).map((item, idx) => ({ ...item, order: idx + 1 }));
    updateTabItems(nextItems);
    toast.success('Item deleted');
  };

  const moveItem = (index, direction) => {
    const items = [...getTabItems()];
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = items[index];
    items[index] = items[targetIdx];
    items[targetIdx] = temp;

    // Reassign orders
    const ordered = items.map((item, idx) => ({ ...item, order: idx + 1 }));
    updateTabItems(ordered);
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const title = formData.get('title');
    const subtitle = formData.get('subtitle');
    const image = formData.get('image');
    const route = formData.get('route');
    const status = formData.get('status');
    const rawDisplayMode = formData.get('imageDisplayMode') || 'illustration';
    const imageDisplayMode = rawDisplayMode === 'full-card background' ? 'cover' : rawDisplayMode;
    const imageMode = imageDisplayMode;

    const items = getTabItems();

    if (isAdding) {
      const newItem = {
        id: Date.now().toString(),
        title,
        subtitle: subtitle || '',
        image: image || '',
        uploadedImage: uploadedImageUrl || '',
        route: route || '',
        order: items.length + 1,
        status: status || 'active',
        imageDisplayMode,
        imageMode
      };
      updateTabItems([...items, newItem]);
      setIsAdding(false);
      toast.success('Item added successfully');
    } else if (editItem) {
      const updated = items.map(item => item.id === editItem.id ? {
        ...item,
        title,
        subtitle: subtitle || '',
        image: image || '',
        uploadedImage: uploadedImageUrl || '',
        route: route || '',
        status: status || 'active',
        imageDisplayMode,
        imageMode
      } : item);
      updateTabItems(updated);
      setEditItem(null);
      toast.success('Item updated successfully');
    }
  };

  const tabsConfig = [
    { id: 'home-sections', label: 'Home Sections' },
    { id: 'everything', label: 'Everything In Minutes' },
    { id: 'explore', label: 'Explore Cards' },
    { id: 'promos', label: 'Promo Banners' },
    { id: 'go-places', label: 'Go Places' },
    { id: 'footer', label: 'Footer Content' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#405189] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-gray-500 font-bold">Loading Settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-10 font-sans">
      {/* Header Block */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-[15px] font-black text-gray-800 font-bold">User App Management</h1>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 font-bold">
          <span>Settings</span>
          <ChevronRight size={12} strokeWidth={3} />
          <span className="text-gray-600">User App UI</span>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8 grid-rows-1">
        {/* Left Side: Navigation Tabs */}
        <div className="lg:col-span-1 space-y-2">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-1">
            {tabsConfig.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setEditItem(null);
                  setIsAdding(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-[13px] font-bold transition-all flex items-center justify-between ${activeTab === tab.id
                    ? 'bg-yellow-50 border-l-4 border-yellow-400 text-yellow-900 shadow-md'
                    : 'text-gray-600 hover:bg-gray-50'
                  }`}
              >
                <span>{tab.label}</span>
                <ChevronRight size={14} className={activeTab === tab.id ? 'text-white' : 'text-gray-300'} />
              </button>
            ))}
          </div>

          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-black text-sm font-bold shadow-sm transition-all"
          >
            <Save size={16} /> Save Changes
          </button>
        </div>

        {/* Right Side: Tab Contents Editor */}
        <div className="lg:col-span-3">
          {activeTab === 'home-sections' && (
            <SectionCard title="Homepage Section Toggles">
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-[15px] font-semibold text-gray-800">Everything In Minutes Grid</div>
                    <p className="text-[11px] font-medium text-gray-400 mt-1">Masonry grid displaying main travel & parcel categories.</p>
                  </div>
                  <button
                    onClick={() => updateHomeSectionToggle('enableEverything')}
                    className={`w-12 h-6 rounded-full transition-all duration-300 relative ${settings.homeSections.enableEverything ? 'bg-yellow-400' : 'bg-gray-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings.homeSections.enableEverything ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-[15px] font-semibold text-gray-800">Explore Horizontal Scroll</div>
                    <p className="text-[11px] font-medium text-gray-400 mt-1">Explore all categories and active modules horizontally.</p>
                  </div>
                  <button
                    onClick={() => updateHomeSectionToggle('enableExplore')}
                    className={`w-12 h-6 rounded-full transition-all duration-300 relative ${settings.homeSections.enableExplore ? 'bg-yellow-400' : 'bg-gray-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings.homeSections.enableExplore ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-[15px] font-semibold text-gray-800">Promo Banner</div>
                    <p className="text-[11px] font-medium text-gray-400 mt-1">Super Saver promotional card with action handler.</p>
                  </div>
                  <button
                    onClick={() => updateHomeSectionToggle('enablePromo')}
                    className={`w-12 h-6 rounded-full transition-all duration-300 relative ${settings.homeSections.enablePromo ? 'bg-yellow-400' : 'bg-gray-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings.homeSections.enablePromo ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-[15px] font-semibold text-gray-800">Go Places Section</div>
                    <p className="text-[11px] font-medium text-gray-400 mt-1">Airport, railway station, and outstation fast booking cards.</p>
                  </div>
                  <button
                    onClick={() => updateHomeSectionToggle('enableGoPlaces')}
                    className={`w-12 h-6 rounded-full transition-all duration-300 relative ${settings.homeSections.enableGoPlaces ? 'bg-yellow-400' : 'bg-gray-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings.homeSections.enableGoPlaces ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-[15px] font-semibold text-gray-800">Footer Brand Illustration</div>
                    <p className="text-[11px] font-medium text-gray-400 mt-1">Branded city silhouette footer with custom hashtag text.</p>
                  </div>
                  <button
                    onClick={() => updateHomeSectionToggle('enableFooter')}
                    className={`w-12 h-6 rounded-full transition-all duration-300 relative ${settings.homeSections.enableFooter ? 'bg-yellow-400' : 'bg-gray-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings.homeSections.enableFooter ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            </SectionCard>
          )}

          {activeTab === 'footer' && (
            <SectionCard title="Footer Branding Configuration">
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Footer Hashtag</label>
                  <input
                    type="text"
                    value={settings.footer.hashtag}
                    onChange={(e) => handleFooterChange('hashtag', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-semibold"
                    placeholder="#goAppzeto"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Slogan Line 1</label>
                  <input
                    type="text"
                    value={settings.footer.line1}
                    onChange={(e) => handleFooterChange('line1', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-semibold"
                    placeholder="Made for India"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Slogan Line 2</label>
                  <input
                    type="text"
                    value={settings.footer.line2}
                    onChange={(e) => handleFooterChange('line2', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-semibold"
                    placeholder="Crafted for riders"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Footer Background URL (Optional)</label>
                  <input
                    type="text"
                    value={settings.footer.image || ''}
                    onChange={(e) => handleFooterChange('image', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-semibold"
                    placeholder="e.g. /assets/user-app/city-mask.png"
                  />
                </div>

                {/* Upload Footer Image Section */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Upload Footer Background Image</label>

                  {settings.footer.uploadedImage ? (
                    <div className="relative rounded-2xl border border-gray-200 p-4 bg-gray-50 flex items-center gap-4">
                      <img
                        src={settings.footer.uploadedImage}
                        alt="Uploaded preview"
                        className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white"
                      />
                      <div className="flex-grow min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{settings.footer.uploadedImage}</p>
                        <p className="text-[10px] text-gray-400 font-medium mt-0.5">Uploaded Image URL</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFooterChange('uploadedImage', '')}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-650 rounded-lg text-xs font-bold font-bold transition-all shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragActive(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          await processFooterFile(e.dataTransfer.files[0]);
                        }
                      }}
                      className={`relative rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 ${dragActive
                          ? 'border-[#405189] bg-yellow-50/20'
                          : 'border-gray-300 hover:border-gray-400 bg-white'
                        }`}
                    >
                      <input
                        type="file"
                        id="footer-file-upload"
                        accept="image/*"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            await processFooterFile(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                        disabled={uploading}
                      />
                      <label htmlFor="footer-file-upload" className="cursor-pointer block w-full h-full">
                        {uploading ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs font-bold text-yellow-600 font-bold">Uploading to Cloudinary...</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <Sparkles className="w-7 h-7 text-gray-400 mb-1" />
                            <span className="text-xs font-bold text-gray-700">Drag & drop your footer image here, or <span className="text-yellow-600 hover:underline">browse</span></span>
                            <span className="text-[10px] text-gray-400 font-medium">Supports PNG, JPG, JPEG, GIF</span>
                          </div>
                        )}
                      </label>
                    </div>
                  )}
                </div>

                {/* Image Preview Block */}
                {(settings.footer.uploadedImage || settings.footer.image) && (
                  <div className="rounded-2xl border border-gray-250 p-4 bg-gray-50">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Footer Background Preview</label>
                    <div className="w-full h-32 rounded-xl border border-gray-200 bg-white flex items-center justify-center p-4">
                      <img
                        src={settings.footer.uploadedImage || settings.footer.image}
                        alt="Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {['everything', 'explore', 'promos', 'go-places'].includes(activeTab) && (
            <>
              {/* Items List */}
              {!editItem && !isAdding && (
                <SectionCard title={`${tabsConfig.find(t => t.id === activeTab)?.label} List`}>
                  <div className="mb-4 flex justify-end">
                    <button
                      onClick={() => setIsAdding(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-black rounded-xl text-xs font-bold font-bold transition-all"
                    >
                      <Plus size={14} /> Add New Card
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px] text-left">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-400 font-bold font-bold">
                          <th className="pb-3 pl-2 w-24">Order</th>
                          <th className="pb-3">Title</th>
                          <th className="pb-3">Subtitle</th>
                          <th className="pb-3">Route / Action</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3 text-right pr-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {getTabItems().map((item, index) => (
                          <tr key={item.id} className="hover:bg-gray-50/50">
                            <td className="py-3.5 pl-2">
                              <span className="inline-flex items-center gap-1 text-gray-400">
                                <button onClick={() => moveItem(index, 'up')} disabled={index === 0} className="hover:text-gray-800 disabled:opacity-30">
                                  <ArrowUp size={14} />
                                </button>
                                <button onClick={() => moveItem(index, 'down')} disabled={index === getTabItems().length - 1} className="hover:text-gray-800 disabled:opacity-30">
                                  <ArrowDown size={14} />
                                </button>
                                <span className="ml-1 text-gray-800 font-bold">{item.order}</span>
                              </span>
                            </td>
                            <td className="py-3.5 text-gray-900 font-bold">{item.title}</td>
                            <td className="py-3.5 text-gray-500">{item.subtitle || '-'}</td>
                            <td className="py-3.5 font-mono text-xs text-yellow-600">{item.route || '-'}</td>
                            <td className="py-3.5">
                              <button
                                onClick={() => toggleItemStatus(item.id)}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold font-bold ${item.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-red-50 text-red-700'
                                  }`}
                              >
                                {item.status}
                              </button>
                            </td>
                            <td className="py-3.5 text-right pr-2">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  onClick={() => setEditItem(item)}
                                  className="p-1 text-gray-400 hover:text-yellow-600 rounded"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  className="p-1 text-gray-400 hover:text-red-650 rounded"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {getTabItems().length === 0 && (
                          <tr>
                            <td colSpan="6" className="py-8 text-center text-gray-400 italic">
                              No items configured. Fallbacks will be rendered.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              )}

              {/* Form to Add/Edit Item */}
              {(isAdding || editItem) && (
                <SectionCard title={isAdding ? 'Add New Card' : `Edit: ${editItem.title}`}>
                  <form onSubmit={handleFormSubmit} className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Card Title</label>
                      <input
                        type="text"
                        name="title"
                        required
                        defaultValue={editItem ? editItem.title : ''}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-semibold"
                        placeholder="e.g. Parcel"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Card Subtitle / Description</label>
                      <input
                        type="text"
                        name="subtitle"
                        defaultValue={editItem ? editItem.subtitle : ''}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-semibold"
                        placeholder="e.g. Send anything"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Image URL (Optional)</label>
                      <input
                        type="text"
                        name="image"
                        defaultValue={editItem ? editItem.image : ''}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-semibold"
                        placeholder="e.g. /assets/user-app/bike.png"
                      />
                    </div>

                    {/* Upload Image Section */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Upload Image</label>

                      {uploadedImageUrl ? (
                        <div className="relative rounded-2xl border border-gray-200 p-4 bg-gray-50 flex items-center gap-4">
                          <img
                            src={uploadedImageUrl}
                            alt="Uploaded preview"
                            className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white"
                          />
                          <div className="flex-grow min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{uploadedImageUrl}</p>
                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Uploaded Image URL</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-650 rounded-lg text-xs font-bold font-bold transition-all shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div
                          onDragEnter={handleDrag}
                          onDragOver={handleDrag}
                          onDragLeave={handleDrag}
                          onDrop={handleDrop}
                          className={`relative rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 ${dragActive
                              ? 'border-[#405189] bg-yellow-50/20'
                              : 'border-gray-300 hover:border-gray-400 bg-white'
                            }`}
                        >
                          <input
                            type="file"
                            id="file-upload"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                            disabled={uploading}
                          />
                          <label htmlFor="file-upload" className="cursor-pointer block w-full h-full">
                            {uploading ? (
                              <div className="flex flex-col items-center justify-center gap-2">
                                <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs font-bold text-yellow-600 font-bold">Uploading to Cloudinary...</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1.5">
                                <Sparkles className="w-7 h-7 text-gray-400 mb-1" />
                                <span className="text-xs font-bold text-gray-700">Drag & drop your image here, or <span className="text-yellow-600 hover:underline">browse</span></span>
                                <span className="text-[10px] text-gray-400 font-medium">Supports PNG, JPG, JPEG, GIF</span>
                              </div>
                            )}
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Image Preview Block */}
                    {(uploadedImageUrl || (editItem && editItem.image)) && (
                      <div className="rounded-2xl border border-gray-250 p-4 bg-gray-50">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Image Preview</label>
                        <div className="w-full h-32 rounded-xl border border-gray-200 bg-white flex items-center justify-center p-4">
                          <img
                            src={uploadedImageUrl || editItem.image}
                            alt="Preview"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Action Route / Target</label>
                      <input
                        type="text"
                        name="route"
                        defaultValue={editItem ? editItem.route : ''}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-semibold"
                        placeholder="e.g. /taxi/user/ride/select-location"
                      />
                    </div>

                    {activeTab === 'everything' && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Image Display Mode</label>
                          <select
                            name="imageDisplayMode"
                            defaultValue={editItem ? (editItem.imageMode || editItem.imageDisplayMode || 'illustration') : 'illustration'}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-bold"
                          >
                            <option value="illustration">Illustration (Bottom-right, contain)</option>
                            <option value="cover">Full-card background (Fills card)</option>
                            <option value="full-card background">Full-card background (Legacy)</option>
                          </select>
                        </div>
                        <p className="text-[11px] text-amber-600 font-semibold leading-relaxed">
                          For Everything In Minutes, upload transparent PNG illustration 512x512 for best result. If uploading a full banner/card image, choose Full-card background mode.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Status</label>
                      <select
                        name="status"
                        defaultValue={editItem ? editItem.status : 'active'}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-[#405189] text-[13px] font-bold"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-black rounded-xl text-xs font-bold font-bold transition-all"
                      >
                        {isAdding ? 'Add Item' : 'Update Item'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAdding(false);
                          setEditItem(null);
                        }}
                        className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold font-bold transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </SectionCard>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminUserAppManagement;
