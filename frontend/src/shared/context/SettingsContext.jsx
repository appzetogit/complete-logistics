import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axiosInstance';
import { BACKEND_ORIGIN } from '../api/runtimeConfig';

// Favicon object URL tracking removed
const SETTINGS_CACHE_KEY = 'appSettingsCache:v1';
const DEFAULT_ADMIN_THEME_COLOR = '#405189';
const DEFAULT_LANDING_THEME_COLOR = '#0ab39c';
const DEFAULT_SIDEBAR_TEXT_COLOR = '#cbd5e1';

export const normalizeAssetUrl = (url = '') => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${BACKEND_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

const DEFAULT_SETTINGS_CONTEXT = {
  settings: {
    general: {
      app_name: 'Appzeto 24 Trawler',
      logo: '',
      favicon: '',
    },
    customization: {
      admin_theme_color: '',
      currency_symbol: '',
    },
    transportRide: {
      enable_bus_service: '0',
    },
    bidRide: {
      bidding_low_percentage: '10',
      bidding_high_percentage: '20',
      bidding_amount_increase_or_decrease: '10',
      user_bidding_low_percentage: '10',
      user_bidding_high_percentage: '20',
      user_bidding_amount_increase_or_decrease: '10',
      user_fare_increase_wait_minutes: '2',
    },
    paymentGateway: null,
    userHomeSettings: {},
  },
  loading: true,
  hasBootstrapSettings: false,
  refreshSettings: () => { },
};
const SettingsContext = createContext(DEFAULT_SETTINGS_CONTEXT);

const normalizeBooleanSetting = (value, fallback = '0') => {
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (typeof value === 'number') {
    return value === 1 ? '1' : '0';
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
    return '1';
  }

  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
    return '0';
  }

  return fallback;
};

const normalizeTransportRideSettings = (settings = {}) => ({
  ...settings,
  enable_bus_service: normalizeBooleanSetting(settings?.enable_bus_service, '0'),
});

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

const hexToRgb = (hex) => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
};

const getReadableTextColor = (hex, dark = '#0F172A', light = '#FFFFFF') => {
  const rgb = hexToRgb(hex);
  if (!rgb) return light;

  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 160 ? dark : light;
};

const ensureHeadLink = (selector, relValue) => {
  let link = document.head.querySelector(selector);
  if (!link) {
    link = document.createElement('link');
    link.rel = relValue;
    document.head.appendChild(link);
  }
  return link;
};

const getFaviconType = (faviconUrl = '') => {
  if (!faviconUrl) return 'image/png';

  if (faviconUrl.startsWith('data:image/')) {
    return faviconUrl.split(';')[0].split(':')[1] || 'image/png';
  }

  const cleanUrl = faviconUrl.split('?')[0].toLowerCase();

  if (cleanUrl.endsWith('.svg')) return 'image/svg+xml';
  if (cleanUrl.endsWith('.png')) return 'image/png';
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (cleanUrl.endsWith('.webp')) return 'image/webp';
  if (cleanUrl.endsWith('.gif')) return 'image/gif';
  if (cleanUrl.endsWith('.ico')) return 'image/x-icon';

  return 'image/png';
};

const buildFaviconHref = (faviconUrl = '') => {
  if (!faviconUrl) {
    return '';
  }

  if (faviconUrl.startsWith('data:')) {
    return faviconUrl;
  }

  const normalized = normalizeAssetUrl(faviconUrl);
  return `${normalized}${normalized.includes('?') ? '&' : '?'}v=${Date.now()}`;
};

const buildSettingsState = (payload = {}) => ({
  general: {
    ...(payload?.general || {}),
    logo: normalizeAssetUrl(payload?.general?.logo),
    favicon: normalizeAssetUrl(payload?.general?.favicon),
  },
  customization: payload?.customization || {},
  transportRide: normalizeTransportRideSettings(payload?.transportRide || {}),
  bidRide: payload?.bidRide || DEFAULT_SETTINGS_CONTEXT.settings.bidRide,
  paymentGateway: payload?.paymentGateway || null,
  userHomeSettings: payload?.userHomeSettings || {},
});

const readCachedSettings = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return buildSettingsState(parsed);
  } catch {
    return null;
  }
};

const writeCachedSettings = (settings) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Cache writes are best-effort only.
  }
};

export const SettingsProvider = ({ children }) => {
  const cachedSettings = readCachedSettings();
  const [settings, setSettings] = useState(cachedSettings || DEFAULT_SETTINGS_CONTEXT.settings);
  const [loading, setLoading] = useState(true);
  const [hasBootstrapSettings, setHasBootstrapSettings] = useState(Boolean(cachedSettings));
  const [modules, setModules] = useState([]);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/users/bootstrap');
      const data = response?.data?.data || response?.data || {};

      const nextSettings = buildSettingsState({
        general: data.settings?.general || {},
        customization: data.settings?.customization || {},
        transportRide: data.settings?.transportRide || {},
        bidRide: data.settings?.bidRide || DEFAULT_SETTINGS_CONTEXT.settings.bidRide,
        paymentGateway: data.settings?.paymentGateway || null,
        userHomeSettings: data.settings?.userHomeSettings || {},
      });

      setSettings(nextSettings);
      setModules(data.modules || []);
      setHasBootstrapSettings(true);
      writeCachedSettings(nextSettings);
    } catch (err) {
      console.error('[SettingsContext] Failed to fetch bootstrap settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    const refreshOnResume = () => {
      fetchSettings();
    };

    window.addEventListener('pageshow', refreshOnResume);
    window.addEventListener('online', refreshOnResume);
    window.addEventListener('focus', refreshOnResume);

    return () => {
      window.removeEventListener('pageshow', refreshOnResume);
      window.removeEventListener('online', refreshOnResume);
      window.removeEventListener('focus', refreshOnResume);
    };
  }, []);

  useEffect(() => {
    const appName = settings.general?.app_name || 'Appzeto 24 Trawler';
    document.title = appName;

    const favicon = settings.general?.favicon || settings.customization?.favicon;
    if (favicon) {
      const href = buildFaviconHref(favicon);
      const type = getFaviconType(favicon);

      const iconLink = ensureHeadLink("link[rel='icon']", 'icon');
      const shortcutIconLink = ensureHeadLink("link[rel='shortcut icon']", 'shortcut icon');
      const appleTouchIconLink = ensureHeadLink("link[rel='apple-touch-icon']", 'apple-touch-icon');

      [iconLink, shortcutIconLink, appleTouchIconLink].forEach((link) => {
        link.href = href;
        link.type = type;
        link.sizes = '64x64';
      });
    }

    return () => { };
  }, [settings.general?.app_name, settings.general?.favicon, settings.customization?.favicon]);

  useEffect(() => {
    const root = document.documentElement;
    const adminThemeColor = normalizeHexColor(
      settings.customization?.admin_theme_color,
      DEFAULT_ADMIN_THEME_COLOR
    );
    const landingThemeColor = normalizeHexColor(
      settings.customization?.landing_theme_color,
      DEFAULT_LANDING_THEME_COLOR
    );
    const sidebarTextColor = normalizeHexColor(
      settings.customization?.sidebar_text_color,
      DEFAULT_SIDEBAR_TEXT_COLOR
    );
    const rgb = hexToRgb(adminThemeColor) || { r: 64, g: 81, b: 137 };

    root.style.setProperty('--admin-theme-color', adminThemeColor);
    root.style.setProperty('--admin-theme-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    root.style.setProperty('--admin-theme-contrast', getReadableTextColor(adminThemeColor));
    root.style.setProperty('--landing-theme-color', landingThemeColor);
    root.style.setProperty('--admin-sidebar-text-color', sidebarTextColor);
  }, [
    settings.customization?.admin_theme_color,
    settings.customization?.landing_theme_color,
    settings.customization?.sidebar_text_color,
  ]);

  const refreshSettings = () => fetchSettings();

  return (
    <SettingsContext.Provider value={{ settings, modules, loading, hasBootstrapSettings, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  return useContext(SettingsContext);
};
