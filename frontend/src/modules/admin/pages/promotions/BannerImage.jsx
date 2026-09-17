import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Filter,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';

const Motion = motion;
const LIST_PATH = '/admin/promotions/banner-image';
const CREATE_PATH = '/admin/promotions/banner-image/create';

const createInitialFormData = () => ({
  image: null,
  image_url: '',
  use_url: false,
});

const BannerImage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isCreateRoute = location.pathname === CREATE_PATH;

  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(createInitialFormData);
  const [imagePreview, setImagePreview] = useState(null);

  const token = localStorage.getItem('adminToken') || '';
  const baseUrl = globalThis.__LEGACY_BACKEND_ORIGIN__ + '/api/v1/admin';

  const resolveImageUrl = useCallback(
    (img) => {
      if (!img) return null;
      if (img.startsWith('data:') || img.startsWith('http')) return img;
      const rootUrl = baseUrl.replace('/api/v1/admin', '');
      return `${rootUrl}/${img.startsWith('/') ? img.slice(1) : img}`;
    },
    [baseUrl],
  );

  const syncBannersToHomeSettings = useCallback(async (bannersList) => {
    if (!token) return;
    try {
      const homeRes = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/general-settings/user-home-management`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!homeRes.ok) return;
      const homeData = await homeRes.json();
      const currentSettings = homeData.settings || {};

      const nextPromos = bannersList.map((b, idx) => ({
        id: b._id || b.id || String(idx + 1),
        title: b.title || 'Experience A New Standard With Appzeto',
        subtitle: b.subtitle || 'A premier private hire service where luxury and reliability converge.',
        imageUrl: b.image || '',
        image: b.image || '',
        route: b.redirect_url || b.external_link || b.deep_link || '/taxi/user/ride/select-location',
        status: b.active !== false ? 'active' : 'inactive',
        order: idx + 1
      }));

      const updatedSettings = {
        ...currentSettings,
        promos: nextPromos
      };

      await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/general-settings/user-home-management`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ settings: updatedSettings })
      });
    } catch (error) {
      console.error('Failed to sync banners to home settings:', error);
    }
  }, [token]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrapRes = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/promotions/bootstrap`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (bootstrapRes.ok) {
        const bootstrapData = await bootstrapRes.json();
        if (bootstrapData.success) {
          const items = bootstrapData.data?.banners || [];
          setBanners(items);
          syncBannersToHomeSettings(items);
          return;
        }
      }

      const res = await fetch(`${baseUrl}/banners`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const items = data.data?.results || (Array.isArray(data.data) ? data.data : data.results || []);
          setBanners(items);
          syncBannersToHomeSettings(items);
        } else {
          setBanners([]);
        }
      } else {
        setBanners([]);
      }
    } catch (error) {
      console.error('Error fetching banners:', error);
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, token, syncBannersToHomeSettings]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isCreateRoute) {
      setFormData(createInitialFormData());
      setImagePreview(null);
    }
  }, [isCreateRoute]);

  const rows = useMemo(() => banners, [banners]);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFormData((current) => ({
      ...current,
      image: file,
      use_url: false,
      image_url: '',
    }));
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!formData.use_url && !formData.image) {
      alert('Please upload a banner image');
      return;
    }

    if (formData.use_url && !formData.image_url.trim()) {
      alert('Please enter an image URL');
      return;
    }

    setSaving(true);
    try {
      let imageData = formData.use_url ? formData.image_url.trim() : '';

      if (!formData.use_url && formData.image instanceof File) {
        imageData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(formData.image);
        });
      }

      const payload = {
        image: imageData,
        image_url: formData.image_url.trim(),
        use_url: formData.use_url,
      };

      const res = await fetch(`${baseUrl}/banners`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setFormData(createInitialFormData());
        setImagePreview(null);
        await fetchData();
        navigate(LIST_PATH);
      } else {
        alert(data.message || 'Failed to save banner');
      }
    } catch (error) {
      console.error('Save banner error:', error);
      alert(`Network Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this banner?')) return;

    try {
      const res = await fetch(`${baseUrl}/banners/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        await fetchData();
      }
    } catch (error) {
      console.error('Delete banner error:', error);
    }
  };

  const toggleStatus = async (item) => {
    const id = item._id || item.id;
    try {
      const res = await fetch(`${baseUrl}/banners/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ active: !item.active }),
      });
      const data = await res.json();
      if (data.success) {
        setBanners((current) => {
          const nextBanners = current.map((banner) => ((banner._id || banner.id) === id ? { ...banner, active: !item.active } : banner));
          syncBannersToHomeSettings(nextBanners);
          return nextBanners;
        });
      }
    } catch (error) {
      console.error('Banner status toggle error:', error);
    }
  };

  return (
    <div className="space-y-6 p-1 animate-in fade-in duration-500 font-sans text-gray-950 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-black text-[#2D3A6E] uppercase tracking-tight italic leading-none mb-1">
            {isCreateRoute ? 'CREATE' : 'BANNER IMAGE'}
          </h1>
          <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest leading-none">
            <span>Banner Image</span>
            <ChevronRight size={12} className="opacity-50" />
            <span className="text-gray-900">{isCreateRoute ? 'Create' : 'Banner Image'}</span>
          </div>
        </div>
        {isCreateRoute ? (
          <button
            type="button"
            onClick={() => navigate(LIST_PATH)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
        ) : null}
      </div>

      <AnimatePresence mode="wait">
        {!isCreateRoute ? (
          <Motion.div
            key="banner-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-[22px] border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>show</span>
                  <select className="bg-white border border-gray-200 rounded-md px-2 py-1 text-[13px] font-medium outline-none">
                    <option>10</option>
                    <option>25</option>
                    <option>50</option>
                  </select>
                  <span>entries</span>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(CREATE_PATH)}
                  className="bg-[#2D3A6E] text-white h-10 px-5 rounded-lg flex items-center gap-2 text-[13px] font-bold hover:bg-[#1d2756] transition-all"
                >
                  <Plus size={16} />
                  Add Banner Image
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr className="text-[13px] font-bold text-gray-700">
                      <th className="px-6 py-4">Icon</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr>
                        <td colSpan="3" className="px-6 py-14 text-center text-sm text-gray-400">
                          Loading banners...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="px-6 py-14 text-center text-sm text-gray-400">
                          No banners found.
                        </td>
                      </tr>
                    ) : (
                      rows.map((item) => (
                        <tr key={item._id || item.id}>
                          <td className="px-6 py-4">
                            <div className="h-10 w-52 overflow-hidden rounded border border-gray-200 bg-white">
                              {item.image ? (
                                <img
                                  src={resolveImageUrl(item.image)}
                                  alt="Banner"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-gray-300">
                                  <ImageIcon size={16} />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => toggleStatus(item)}
                              className={`inline-flex rounded px-2.5 py-1 text-[11px] font-bold uppercase ${
                                item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                              }`}
                            >
                              {item.active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDelete(item._id || item.id)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-rose-600"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-6 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>
                  Showing {rows.length > 0 ? 1 : 0} to {rows.length} of {rows.length} entries
                </span>
                <div className="flex items-center gap-2">
                  <button className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-400" disabled>
                    Prev
                  </button>
                  <button className="px-4 py-2 rounded-lg bg-[#2D3A6E] text-white">1</button>
                  <button className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-400" disabled>
                    Next
                  </button>
                </div>
              </div>
            </div>
          </Motion.div>
        ) : (
          <Motion.form
            key="banner-create"
            onSubmit={handleSave}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-[22px] border border-gray-200 shadow-sm p-8"
          >
            <div className="space-y-6 max-w-3xl">
              <div>
                <label className="block text-[14px] font-semibold text-gray-900 mb-3">
                  Banner Image<span className="text-rose-500">*</span>
                  <span className="text-gray-400 font-medium">(500px x 100px)</span>
                </label>

                <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-4">
                  {imagePreview ? (
                    <div className="space-y-4">
                      <img
                        src={imagePreview}
                        alt="Banner preview"
                        className="h-28 w-full rounded-lg border border-gray-200 object-contain bg-gray-50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview(null);
                          setFormData((current) => ({ ...current, image: null }));
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Remove Image
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-3 py-6 text-center">
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                      <span className="text-[22px] text-gray-500">
                        <Upload size={28} />
                      </span>
                      <div>
                        <p className="text-[15px] font-medium text-gray-900">Upload Image</p>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={formData.use_url}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormData((current) => ({
                        ...current,
                        use_url: checked,
                        image: checked ? null : current.image,
                      }));
                      if (checked) {
                        setImagePreview(null);
                      }
                    }}
                    className="rounded border-gray-300 text-[#2D3A6E] focus:ring-[#2D3A6E]"
                  />
                  <span>Use image URL</span>
                </label>

                {formData.use_url ? (
                  <div>
                    <label className="block text-[14px] font-semibold text-gray-900 mb-2">Image URL</label>
                    <input
                      type="url"
                      value={formData.image_url}
                      onChange={(e) => setFormData((current) => ({ ...current, image_url: e.target.value }))}
                      className="w-full max-w-xl border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                      placeholder="https://example.com/banner.jpg"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="h-10 px-6 bg-[#2D3A6E] text-white rounded-lg text-[13px] font-bold hover:bg-[#1d2756] transition-all inline-flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Save
              </button>
            </div>
          </Motion.form>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BannerImage;
