import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronRight, 
  Save, 
  Loader2,
  Upload,
  X
} from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';
import { useSettings } from '../../../../shared/context/SettingsContext';
let liveFaviconObjectUrl = '';
const DEFAULT_ADMIN_THEME_COLOR = '#405189';
const DEFAULT_LANDING_THEME_COLOR = '#0AB39C';
const DEFAULT_SIDEBAR_TEXT_COLOR = '#CBD5E1';
const DEFAULT_DISPATCHER_SIDEBAR_COLOR = '#000000';
const DEFAULT_DISPATCHER_TEXT_COLOR = '#000000';

const normalizeHexColor = (value, fallback = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;

  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const shortHexMatch = withHash.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  if (/^#([0-9a-fA-F]{6})$/.test(withHash)) {
    return withHash.toUpperCase();
  }

  return fallback;
};

const SectionCard = ({ title, children, id }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6" id={id}>
    {title && (
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-1 h-5 bg-yellow-400 rounded-full"></div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
    )}
    <div className="p-6">
      {children}
    </div>
  </div>
);

const InputField = ({ label, name, value, onChange, placeholder, info }) => {
  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors shadow-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";
  
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <input
        type="text"
        name={name}
        value={value || ''}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
      {info && (
        <div className="mt-2 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 flex items-center gap-2">
           <span className="text-xs text-gray-500 italic">Example: {info.prefix}</span>
           <span className="text-xs bg-yellow-400 text-black px-2 py-0.5 rounded font-medium">{value || info.default}</span>
        </div>
      )}
    </div>
  );
};

const ColorField = ({ label, name, value, onChange, placeholder, defaultValue }) => {
  const inputClass = "flex-1 border border-gray-200 rounded-r-lg px-3 py-2 text-sm text-gray-900 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors shadow-sm uppercase";
  const normalizedValue = normalizeHexColor(value, normalizeHexColor(defaultValue, '#000000'));

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="flex">
        <div
          className="flex h-[38px] w-12 items-center justify-center overflow-hidden rounded-l-lg border border-r-0 border-gray-200 bg-gray-50 shrink-0 relative"
          style={{ backgroundColor: normalizedValue }}
        >
          <input
            type="color"
            value={normalizedValue}
            onChange={(event) => onChange(name, normalizeHexColor(event.target.value, normalizedValue))}
            className="h-full w-full cursor-pointer absolute inset-0 opacity-0"
            aria-label={label}
          />
        </div>
        <input
          type="text"
          name={name}
          value={value || ''}
          onChange={(event) => onChange(name, event.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">Pick visually or type a hex color.</p>
    </div>
  );
};

const ImageUploadBox = ({ title, size, preview, onUpload, onClear }) => {
  const fileInputRef = useRef(null);
  return (
    <div className="space-y-1 h-full flex flex-col">
       <label className="block text-sm font-medium text-gray-700 mb-1.5">{title} <span className="text-xs text-gray-500 font-normal">({size})</span></label>
       <div className="flex-1 min-h-[160px] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 relative overflow-hidden group hover:border-yellow-400 hover:bg-yellow-50/30 transition-all cursor-pointer flex items-center justify-center" onClick={() => fileInputRef.current?.click()}>
          {preview ? (
            <img src={preview} alt={title} className="w-full h-full object-contain p-4" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-gray-400 group-hover:text-yellow-600 transition-colors">
                <Upload size={24} strokeWidth={1.5} />
                <p className="text-sm font-medium">Upload Image</p>
            </div>
          )}
          
          <div className="absolute top-3 right-3 flex items-center gap-2">
             <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="w-8 h-8 rounded-lg bg-white text-gray-600 shadow-sm border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-yellow-600 hover:border-yellow-400 transition-all">
                <Upload size={14} />
             </button>
             {preview && (
               <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="w-8 h-8 rounded-lg bg-white text-red-500 shadow-sm border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-200 transition-all">
                  <X size={14} />
               </button>
             )}
          </div>
          <input type="file" className="hidden" ref={fileInputRef} onChange={(e) => { if(e.target.files[0]) onUpload(e.target.files[0]); }} />
       </div>
    </div>
  );
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const resizeImageDataUrl = (dataUrl, size = 64) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('Unable to prepare image canvas'));
        return;
      }

      context.clearRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Unable to process image'));
    image.src = dataUrl;
  });

const setLiveFavicon = (faviconUrl = '') => {
  const rels = ['icon', 'shortcut icon', 'apple-touch-icon'];

  if (liveFaviconObjectUrl) {
    URL.revokeObjectURL(liveFaviconObjectUrl);
    liveFaviconObjectUrl = '';
  }

  let resolvedHref = 'data:,';

  if (faviconUrl) {
    const [meta, content] = String(faviconUrl).split(',');
    const mimeMatch = meta.match(/data:(.*?)(;base64)?$/i);
    const mime = mimeMatch?.[1] || 'image/png';
    const binary = window.atob(content || '');
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    liveFaviconObjectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
    resolvedHref = liveFaviconObjectUrl;
  }

  rels.forEach((rel) => {
    let link = document.head.querySelector(`link[rel='${rel}']`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }

    if (faviconUrl) {
      link.href = resolvedHref;
      link.type = 'image/png';
      link.sizes = '64x64';
    } else {
      link.href = 'data:,';
      link.removeAttribute('type');
      link.removeAttribute('sizes');
    }
  });
};

const GeneralSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { refreshSettings } = useSettings();
  const [settings, setSettings] = useState({
    general: {},
    customization: {}
  });

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const [genRes, cusRes] = await Promise.all([
        api.get('/admin/general-settings/general'),
        api.get('/admin/general-settings/customize')
      ]);

      setSettings({
        general: genRes.data?.settings || {},
        customization: cusRes.data?.settings || {}
      });
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--admin-theme-color',
      normalizeHexColor(settings.customization?.admin_theme_color, DEFAULT_ADMIN_THEME_COLOR)
    );
    document.documentElement.style.setProperty(
      '--landing-theme-color',
      normalizeHexColor(settings.customization?.landing_theme_color, DEFAULT_LANDING_THEME_COLOR)
    );
    document.documentElement.style.setProperty(
      '--admin-sidebar-text-color',
      normalizeHexColor(settings.customization?.sidebar_text_color, DEFAULT_SIDEBAR_TEXT_COLOR)
    );
  }, [
    settings.customization?.admin_theme_color,
    settings.customization?.landing_theme_color,
    settings.customization?.sidebar_text_color,
  ]);

  const handleUpdate = async () => {
    try {
      setSaving(true);
      const customizationPayload = {
        ...settings.customization,
        admin_theme_color: normalizeHexColor(
          settings.customization?.admin_theme_color,
          DEFAULT_ADMIN_THEME_COLOR
        ),
        landing_theme_color: normalizeHexColor(
          settings.customization?.landing_theme_color,
          DEFAULT_LANDING_THEME_COLOR
        ),
        sidebar_text_color: normalizeHexColor(
          settings.customization?.sidebar_text_color,
          DEFAULT_SIDEBAR_TEXT_COLOR
        ),
        disp_sidebar_bg: normalizeHexColor(
          settings.customization?.disp_sidebar_bg,
          DEFAULT_DISPATCHER_SIDEBAR_COLOR
        ),
        disp_side_text: normalizeHexColor(
          settings.customization?.disp_side_text,
          DEFAULT_DISPATCHER_TEXT_COLOR
        ),
      };

      await Promise.all([
        api.patch('/admin/general-settings/general', { settings: settings.general }),
        api.patch('/admin/general-settings/customize', { settings: customizationPayload })
      ]);
      await refreshSettings();
      toast.success('Configuration saved successfully!');
    } catch (err) {
      console.error('Update settings failed:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (category, name, value) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [name]: value
      }
    }));
  };

  const handleLogoUpload = async (file) => {
    const dataUrl = await fileToDataUrl(file);
    handleChange('general', 'logo', dataUrl);
  };

  const handleFaviconUpload = async (file) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      const resizedFavicon = await resizeImageDataUrl(dataUrl, 64);
      handleChange('general', 'favicon', resizedFavicon);
      setLiveFavicon(resizedFavicon);
      toast.success('Favicon prepared at 64x64');
    } catch (err) {
      console.error('Favicon resize failed:', err);
      toast.error('Failed to prepare favicon');
    }
  };

  const configuredAppName = String(settings.general?.app_name || '').trim() || 'App';

  if (loading) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-gray-50">
         <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
       </div>
     );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 font-sans pb-32 relative">
      
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-end gap-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
           <span>Business Settings</span>
           <ChevronRight size={14} />
           <span className="text-gray-900">General Settings</span>
        </div>
      </div>

      <div className="max-w-6xl space-y-6">
        
        {/* Basic Identification */}
        <SectionCard title="General settings">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ColorField label="Admin Theme Color" name="admin_theme_color" value={settings.customization.admin_theme_color} onChange={(n, v) => handleChange('customization', n, v)} placeholder={DEFAULT_ADMIN_THEME_COLOR} defaultValue={DEFAULT_ADMIN_THEME_COLOR} />
              <ColorField label="Landing Website Theme Color" name="landing_theme_color" value={settings.customization.landing_theme_color} onChange={(n, v) => handleChange('customization', n, v)} placeholder={DEFAULT_LANDING_THEME_COLOR} defaultValue={DEFAULT_LANDING_THEME_COLOR} />
              <ColorField label="Side Text Bar Color" name="sidebar_text_color" value={settings.customization.sidebar_text_color} onChange={(n, v) => handleChange('customization', n, v)} placeholder={DEFAULT_SIDEBAR_TEXT_COLOR} defaultValue={DEFAULT_SIDEBAR_TEXT_COLOR} />
              <InputField label="App Name" name="app_name" value={settings.general.app_name} onChange={(n, v) => handleChange('general', n, v)} placeholder={configuredAppName} />
              <InputField label="Currency Code" name="default_currency_code_for_mobile_app" value={settings.customization.default_currency_code_for_mobile_app} onChange={(n, v) => handleChange('customization', n, v)} placeholder="INR" />
              <InputField label="Currency Symbol" name="currency_symbol" value={settings.customization.currency_symbol} onChange={(n, v) => handleChange('customization', n, v)} placeholder="₹" />
              <InputField label="Contact Us Mobile 1" name="contact_phone_1" value={settings.general.contact_phone_1} onChange={(n, v) => handleChange('general', n, v)} placeholder="0000000000" />
              <InputField label="Contact Us Mobile 2" name="contact_phone_2" value={settings.general.contact_phone_2} onChange={(n, v) => handleChange('general', n, v)} placeholder="0000000000" />
              <InputField label="Default Latitude" name="default_lat" value={settings.general.default_lat} onChange={(n, v) => handleChange('general', n, v)} placeholder="11.21215" />
              <InputField label="Default Longitude" name="default_lng" value={settings.general.default_lng} onChange={(n, v) => handleChange('general', n, v)} placeholder="78.54545" />
           </div>
        </SectionCard>

        {/* Media Assets */}
        <SectionCard title="Image section">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              <ImageUploadBox title="Brand Logo" size="750px x 100px" preview={settings.general.logo || settings.customization.logo || settings.general.brand_logo} onUpload={(file) => handleLogoUpload(file)} onClear={() => handleChange('general', 'logo', '')} />
              <ImageUploadBox
                title="Favicon"
                size="80px x 80px"
                preview={settings.general.favicon || settings.customization.favicon}
                onUpload={(file) => handleFaviconUpload(file)}
                onClear={() => {
                  handleChange('general', 'favicon', '');
                  setLiveFavicon('');
                }}
              />
           </div>
        </SectionCard>

        {/* Extra Metadata */}
        <SectionCard title="Footer section">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <InputField label="Footer Content 1" name="footer_1" value={settings.general.footer_1} onChange={(n, v) => handleChange('general', n, v)} placeholder={`2026 © ${configuredAppName}.`} />
             <InputField label="Footer Content 2" name="footer_2" value={settings.general.footer_2} onChange={(n, v) => handleChange('general', n, v)} placeholder={`Design & Develop by ${configuredAppName}`} />
          </div>
        </SectionCard>

        {/* Operational Styling */}
        <SectionCard title="Dispatcher panel section">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ColorField label="Side Bar Background Color" name="disp_sidebar_bg" value={settings.customization.disp_sidebar_bg} onChange={(n, v) => handleChange('customization', n, v)} placeholder={DEFAULT_DISPATCHER_SIDEBAR_COLOR} defaultValue={DEFAULT_DISPATCHER_SIDEBAR_COLOR} />
              <ColorField label="Side Menu Text Color" name="disp_side_text" value={settings.customization.disp_side_text} onChange={(n, v) => handleChange('customization', n, v)} placeholder={DEFAULT_DISPATCHER_TEXT_COLOR} defaultValue={DEFAULT_DISPATCHER_TEXT_COLOR} />
           </div>
        </SectionCard>

      </div>

      {/* Persistence Controls */}
      <div className="fixed bottom-6 right-6 z-50">
         <button 
            onClick={handleUpdate} 
            disabled={saving} 
            className="bg-yellow-400 text-black px-6 py-3 rounded-full flex items-center justify-center gap-2 font-semibold shadow-lg hover:bg-yellow-500 hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
         >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Saving...' : 'Save settings'}
         </button>
      </div>

    </div>
  );
};

export default GeneralSettings;
