import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/adminTheme.css';
import { socketService } from '../../../shared/api/socket';
import { useSettings } from '../../../shared/context/SettingsContext';
import { getSupportConversations, markSupportMessagesRead } from '../../shared/chat/chatApi';
import { adminService } from '../services/adminService';
import { hasAdminPermission } from '../constants/adminAccess';
import toast from 'react-hot-toast';
import AdminSplashScreen from './AdminSplashScreen';
import {
  BarChart3,
  Bell,
  Briefcase,
  Car,
  Bus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Globe,
  Home,
  IndianRupee,
  Layers,
  LogOut,
  MapPin,
  MessageCircle,
  Monitor,
  Package,
  PlusCircle,
  Search,
  Settings,
  Settings2,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';

const ADMIN_MODE = 'admin';
const OWNER_MODE = 'owner';
const MODE_STORAGE_KEY = 'adminPanelMode';
const SIDEBAR_EXPANSION_STORAGE_KEY = 'adminSidebarExpandedGroups';
const NOTIFICATION_DISMISS_STORAGE_KEY = 'adminNotificationDismissals';

const pathMatches = (pathname, targetPath) =>
  pathname === targetPath || pathname.startsWith(`${targetPath}/`);

const hasActiveChild = (pathname, items = []) =>
  items.some((item) => {
    if (item.path && pathMatches(pathname, item.path)) return true;
    if (item.subItems) return hasActiveChild(pathname, item.subItems);
    return false;
  });

const flattenItems = (sections = []) =>
  sections.flatMap((section) => section.items ?? []);

const flattenSearchEntries = (items = [], parentLabels = []) =>
  items.flatMap((item) => {
    const currentTrail = [...parentLabels, item.label].filter(Boolean);

    if (item.path) {
      return [
        {
          label: item.label,
          path: item.path,
          trail: parentLabels,
          keywords: currentTrail.join(' ').toLowerCase(),
        },
      ];
    }

    if (item.subItems) {
      return flattenSearchEntries(item.subItems, currentTrail);
    }

    return [];
  });

const readAdminProfile = () => {
  if (typeof window === 'undefined') {
    return { admin_type: 'superadmin', permissions: ['*'], name: 'Admin' };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem('adminInfo') || 'null');
    return parsed || { admin_type: 'superadmin', permissions: ['*'], name: 'Admin' };
  } catch {
    return { admin_type: 'superadmin', permissions: ['*'], name: 'Admin' };
  }
};

const filterSidebarItemsByAccess = (items = [], adminProfile = {}) =>
  items.flatMap((item) => {
    const selfAllowed = !item.permission || hasAdminPermission(adminProfile, item.permission);

    if (item.subItems) {
      const filteredSubItems = filterSidebarItemsByAccess(item.subItems, adminProfile);
      if (!selfAllowed && filteredSubItems.length === 0) {
        return [];
      }
      if (filteredSubItems.length === 0) {
        return [];
      }
      return [{ ...item, subItems: filteredSubItems }];
    }

    return selfAllowed ? [item] : [];
  });

const filterSidebarSectionsByAccess = (sections = [], adminProfile = {}) =>
  sections
    .map((section) => ({
      ...section,
      items: filterSidebarItemsByAccess(section.items || [], adminProfile),
    }))
    .filter((section) => section.items.length > 0);

const NOTIFICATION_PAGE_SIZE = 5;

const readDismissedNotifications = () => {
  if (typeof window === 'undefined') {
    return { ride_requests: [], bookings: [], chats: [] };
  }

  try {
    const saved = window.localStorage.getItem(NOTIFICATION_DISMISS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};

    return {
      ride_requests: Array.isArray(parsed?.ride_requests) ? parsed.ride_requests : [],
      bookings: Array.isArray(parsed?.bookings) ? parsed.bookings : [],
      chats: Array.isArray(parsed?.chats) ? parsed.chats : [],
    };
  } catch {
    return { ride_requests: [], bookings: [], chats: [] };
  }
};

const getNotificationEntryId = (tab, item = {}) => {
  if (tab === 'ride_requests') {
    return String(item.id || item.requestId || '').trim();
  }

  if (tab === 'bookings') {
    return String(item._id || item.id || item.booking_reference || '').trim();
  }

  return String(item.id || '').trim();
};

const dedupeAdminChatNotifications = (items = []) => {
  const seen = new Set();

  return items.filter((item) => {
    const key = String(item.id || '').trim();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const formatRelativeAdminTime = (value) => {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString();
};

const looksLikeCoordinateLabel = (value = '') =>
  /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(String(value || '').trim());

const formatAdminNotificationLocation = (value, fallback) => {
  const text = String(value || '').trim();

  if (!text || looksLikeCoordinateLabel(text)) {
    return fallback;
  }

  return text;
};

const resolvePageTitle = (pathname, sections, appName) => {
  const findLabel = (items = []) => {
    for (const item of items) {
      if (item.path && pathMatches(pathname, item.path)) return item.label;
      if (item.subItems) {
        const nested = findLabel(item.subItems);
        if (nested) return nested;
      }
    }
    return null;
  };

  const label = findLabel(flattenItems(sections));
  if (label) return label;
  if (pathname.includes('/owners')) return 'Owner Management';
  if (pathname.includes('/fleet')) return 'Fleet Management';
  if (pathname.includes('/settings')) return 'Settings';
  if (pathname.includes('/reports')) return 'Reports';
  return `${appName || 'App'} Admin`;
};

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

const getSidebarItemCount = (item, unreadCountsByPath = {}) => {
  if (item?.path) {
    return Math.max(0, Number(unreadCountsByPath[item.path] || 0));
  }

  if (Array.isArray(item?.subItems)) {
    return item.subItems.reduce((sum, child) => sum + getSidebarItemCount(child, unreadCountsByPath), 0);
  }

  return 0;
};

const SidebarBadge = ({ count, isActive = false }) => {
  if (count <= 0) {
    return null;
  }

  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`ml-auto inline-flex min-w-[1.4rem] h-5 items-center justify-center rounded-full px-1.5 text-[9.5px] font-black tracking-tighter transition-colors duration-300 ${isActive
        ? 'bg-white/20 text-white'
        : 'bg-orange-500 text-white shadow-[0_2px_10px_rgba(249,115,22,0.4)]'
        }`}
    >
      {count > 99 ? '99+' : count}
    </motion.span>
  );
};

const NotificationTabBadge = ({ count, isActive = false }) => {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'
        }`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};

const SidebarItem = ({ icon, label, path, isCollapsed, sidebarTextColor, unreadCount = 0 }) => (
  <NavLink
    to={path}
    end
    className={({ isActive }) =>
      `group relative flex items-center gap-3.5 px-4 py-2 rounded-xl transition-all duration-200 ${isActive ? 'text-[#05070D] bg-[#FFC400]' : 'hover:bg-amber-100/50 hover:text-slate-900'
      }`
    }
    style={({ isActive }) => ({
      color: isActive ? '#05070D' : sidebarTextColor,
    })}
  >
    {({ isActive }) => (
      <>
        {React.createElement(icon, {
          size: 20,
          strokeWidth: isActive ? 2.2 : 1.8,
          className: `shrink-0 transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-65 group-hover:opacity-100'}`
        })}
        {!isCollapsed && (
          <span className={`min-w-0 flex-1 text-[13px] tracking-tight transition-all duration-200 ${isActive ? 'font-bold' : 'font-medium opacity-100 group-hover:opacity-100'}`}>
            {label}
          </span>
        )}
        {!isCollapsed && (
          <SidebarBadge count={unreadCount} isActive={isActive} />
        )}
      </>
    )}
  </NavLink>
);

const SidebarGroup = ({
  icon,
  label,
  subItems,
  isCollapsed,
  pathname,
  forceOpen = false,
  groupKey,
  expandedGroups,
  setExpandedGroups,
  sidebarTextColor,
  unreadCountsByPath,
}) => {
  const isActive = hasActiveChild(pathname, subItems);
  const isOpen = expandedGroups.includes(groupKey);
  const isExpanded = forceOpen || isOpen;
  const unreadCount = subItems.reduce((sum, item) => sum + getSidebarItemCount(item, unreadCountsByPath), 0);

  const toggleGroup = () => {
    setExpandedGroups((current) => {
      if (current.includes(groupKey)) {
        return current.filter((key) => key !== groupKey);
      }
      const parts = groupKey.split(':');
      const newExpanded = [];
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}:${part}` : part;
        newExpanded.push(currentPath);
      }
      return newExpanded;
    });
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggleGroup}
        className={`group relative w-full flex items-center justify-between px-4 py-2 rounded-xl transition-all duration-200 ${isActive || isExpanded ? 'text-white' : 'hover:bg-white/5'
          }`}
        style={{
          color: (isActive || isExpanded) ? '#FFFFFF' : sidebarTextColor,
          backgroundColor: (isActive || isExpanded) ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
        }}
      >
        <div className="flex min-w-0 items-center gap-3.5">
          {React.createElement(icon, {
            size: 20,
            strokeWidth: (isActive || isExpanded) ? 2.2 : 1.8,
            className: `shrink-0 transition-all duration-300 ${(isActive || isExpanded) ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'}`,
          })}
          {!isCollapsed && (
            <span className={`truncate text-[13px] tracking-tight transition-all duration-200 ${(isActive || isExpanded) ? 'font-bold' : 'font-medium opacity-95 group-hover:opacity-100'}`}>
              {label}
            </span>
          )}
        </div>
        {!isCollapsed && (
          <div className="ml-3 flex items-center gap-2">
            <SidebarBadge count={unreadCount} isActive={isActive || isExpanded} />
            <ChevronRight
              size={12}
              className={`text-white transition-transform duration-300 ease-out ${(isActive || isExpanded) ? 'opacity-100' : 'opacity-95'} ${isExpanded ? 'rotate-90' : ''}`}
            />
          </div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {!isCollapsed && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'linear' }}
            className="overflow-hidden"
          >
            <div className="pl-11 pr-2 py-0.5 space-y-0.5">
              {subItems.map((item) =>
                item.subItems ? (
                  <NestedGroup
                    key={item.label}
                    label={item.label}
                    subItems={item.subItems}
                    pathname={pathname}
                    forceOpen={forceOpen}
                    groupKey={`${groupKey}:${item.label}`}
                    expandedGroups={expandedGroups}
                    setExpandedGroups={setExpandedGroups}
                    sidebarTextColor={sidebarTextColor}
                    unreadCountsByPath={unreadCountsByPath}
                  />
                ) : (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end
                    className={({ isActive: childActive }) =>
                      `group flex items-center gap-3 px-3 py-1.5 rounded-lg text-[12.5px] transition-all duration-200 ${childActive ? 'text-[#05070D] bg-[#FFC400]' : 'hover:text-slate-900 hover:bg-amber-100/50'
                      }`
                    }
                    style={({ isActive: childActive }) => ({
                      color: childActive ? '#05070D' : sidebarTextColor,
                    })}
                  >
                    {({ isActive: childActive }) => (
                      <>
                        <span className={`min-w-0 flex-1 transition-all duration-200 ${childActive ? 'font-bold' : 'font-medium opacity-100 group-hover:opacity-100'}`}>{item.label}</span>
                        <SidebarBadge count={getSidebarItemCount(item, unreadCountsByPath)} isActive={childActive} />
                      </>
                    )}
                  </NavLink>
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NestedGroup = ({
  label,
  subItems,
  pathname,
  forceOpen = false,
  groupKey,
  expandedGroups,
  setExpandedGroups,
  sidebarTextColor,
  unreadCountsByPath,
}) => {
  const isActive = hasActiveChild(pathname, subItems);
  const isOpen = expandedGroups.includes(groupKey);
  const isExpanded = forceOpen || isOpen;
  const unreadCount = subItems.reduce((sum, item) => sum + getSidebarItemCount(item, unreadCountsByPath), 0);

  const toggleGroup = () => {
    setExpandedGroups((current) => {
      if (current.includes(groupKey)) {
        return current.filter((key) => key !== groupKey);
      }

      const parts = groupKey.split(':');
      const newExpanded = [];
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}:${part}` : part;
        newExpanded.push(currentPath);
      }
      return newExpanded;
    });
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggleGroup}
        className={`group w-full flex items-center justify-between px-3 py-1.5 rounded-lg transition-all duration-200 ${isActive || isExpanded ? 'text-white' : 'hover:text-slate-200'
          }`}
        style={{
          color: (isActive || isExpanded) ? '#FFFFFF' : sidebarTextColor,
          backgroundColor: (isActive || isExpanded) ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
        }}
      >
        <span className={`flex min-w-0 items-center gap-3 text-[12.5px] transition-all duration-200 ${(isActive || isExpanded) ? 'font-bold' : 'font-medium opacity-95 group-hover:opacity-100'}`}>
          <div className={`h-1 w-1 shrink-0 rounded-full transition-all duration-300 ${isActive || isExpanded ? 'bg-indigo-400 scale-125' : 'bg-slate-600'}`} />
          <span className="truncate">{label}</span>
        </span>
        <span className="ml-3 flex items-center gap-2">
          <SidebarBadge count={unreadCount} isActive={isActive || isExpanded} />
          <ChevronRight
            size={12}
            className={`text-white transition-transform duration-300 ease-out ${(isActive || isExpanded) ? 'opacity-100' : 'opacity-95'} ${isExpanded ? 'rotate-90' : ''}`}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pl-4 py-0.5 space-y-1 border-l border-white/5 ml-3">
              {subItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  className={({ isActive: childActive }) =>
                    `group flex items-center gap-3 px-3 py-1.5 rounded-lg text-[12px] transition-all duration-200 ${childActive ? 'text-[#05070D]' : 'hover:text-slate-900 hover:bg-amber-100/50'
                    }`
                  }
                  style={({ isActive: childActive }) => ({
                    color: childActive ? '#05070D' : sidebarTextColor,
                    backgroundColor: childActive ? '#FFC400' : 'transparent',
                  })}
                >
                  {({ isActive: childActive }) => (
                    <>
                      <div className={`h-0.5 w-0.5 shrink-0 rounded-full transition-all duration-300 ${childActive ? 'bg-[#05070D] scale-150' : 'bg-slate-700'}`} />
                      <span className={`min-w-0 flex-1 transition-all duration-200 ${childActive ? 'font-bold' : 'font-medium opacity-70 group-hover:opacity-100'}`}>{item.label}</span>
                      <SidebarBadge count={getSidebarItemCount(item, unreadCountsByPath)} isActive={childActive} />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ModeSwitcher = ({ mode, setMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const options = [
    { id: ADMIN_MODE, label: 'Admin Terminal', subtitle: 'Platform Core', icon: Monitor },
    { id: OWNER_MODE, label: 'Fleet Console', subtitle: 'Owner Ops', icon: Briefcase },
  ];

  const active = options.find((o) => o.id === mode) || options[0];

  useEffect(() => {
    const clickOut = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5 transition-all hover:border-slate-300 hover:bg-slate-50"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-white shrink-0">
          {active.id === ADMIN_MODE ? <Monitor size={14} strokeWidth={2} /> : <Briefcase size={14} strokeWidth={2} />}
        </div>
        <div className="text-left hidden sm:flex flex-col justify-center">
          <p className="text-[12px] font-semibold text-slate-900 whitespace-nowrap">{active.label}</p>
          <p className="text-[10px] font-medium text-slate-500 whitespace-nowrap">{active.subtitle}</p>
        </div>
        <ChevronDown size={14} className={`text-slate-400 ml-1 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            <div className="px-3 py-2 border-b border-slate-100 mb-1">
              <p className="text-[10px] font-semibold text-slate-500">Switch Workspace</p>
            </div>
            {options.map((option) => {
              const selected = option.id === mode;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setMode(option.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-all ${selected ? 'bg-slate-900 text-white shadow-md' : 'hover:bg-slate-50 text-slate-600'
                    }`}
                >
                  <div className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : 'bg-slate-300'}`} />
                  <div>
                    <p className={`text-[12px] font-semibold ${selected ? 'text-white' : 'text-slate-900'}`}>{option.label}</p>
                    <p className={`text-[10px] font-medium mt-0.5 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{option.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const adminThemeColor = normalizeHexColor(settings.customization?.admin_theme_color, '#405189');
  const sidebarTextColor = normalizeHexColor(settings.customization?.sidebar_text_color, '#475569');
  const [isSidebarOpen] = useState(true);
  const [isCollapsed, setCollapsed] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [notificationTab, setNotificationTab] = useState('ride_requests');
  const [searchTerm, setSearchTerm] = useState('');
  const [rideRequestFeed, setRideRequestFeed] = useState({
    results: [],
    paginator: { current_page: 1, last_page: 1, total: 0 },
  });
  const [bookingsFeed, setBookingsFeed] = useState([]);
  const [chatNotifications, setChatNotifications] = useState([]);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [rideRequestUnreadTotal, setRideRequestUnreadTotal] = useState(0);
  const [bookingUnreadTotal, setBookingUnreadTotal] = useState(0);
  const [rideRequestPage, setRideRequestPage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState(() => readDismissedNotifications());
  const [expandedSidebarGroups, setExpandedSidebarGroups] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem(SIDEBAR_EXPANSION_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const userMenuRef = useRef(null);
  const notificationsMenuRef = useRef(null);
  const [lastSeenRideRequestCount, setLastSeenRideRequestCount] = useState(() => {
    if (typeof window === 'undefined') return 0;
    return Number(window.localStorage.getItem('adminLastSeenRideRequestCount') || 0);
  });
  const [lastSeenBookingCount, setLastSeenBookingCount] = useState(() => {
    if (typeof window === 'undefined') return 0;
    return Number(window.localStorage.getItem('adminLastSeenBookingCount') || 0);
  });
  const [adminProfile, setAdminProfile] = useState(() => readAdminProfile());
  const isOwnerRoute = location.pathname.startsWith('/admin/owners') || location.pathname.startsWith('/admin/fleet');
  const isAdminChatRoute = pathMatches(location.pathname, '/admin/chat');
  const isTripsRoute = pathMatches(location.pathname, '/admin/trips');
  const isOwnerBookingsRoute = pathMatches(location.pathname, '/admin/owners/bookings');
  const mode = isOwnerRoute ? OWNER_MODE : ADMIN_MODE;

  const appName = settings.general?.app_name || 'App';
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const syncAdminProfile = () => setAdminProfile(readAdminProfile());
    window.addEventListener('storage', syncAdminProfile);
    syncAdminProfile();
    return () => window.removeEventListener('storage', syncAdminProfile);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(NOTIFICATION_DISMISS_STORAGE_KEY, JSON.stringify(dismissedNotifications));
  }, [dismissedNotifications]);

  const dismissedRideRequestSet = useMemo(
    () => new Set((dismissedNotifications.ride_requests || []).map((item) => String(item).trim()).filter(Boolean)),
    [dismissedNotifications.ride_requests],
  );

  const dismissedBookingSet = useMemo(
    () => new Set((dismissedNotifications.bookings || []).map((item) => String(item).trim()).filter(Boolean)),
    [dismissedNotifications.bookings],
  );

  const dismissedChatSet = useMemo(
    () => new Set((dismissedNotifications.chats || []).map((item) => String(item).trim()).filter(Boolean)),
    [dismissedNotifications.chats],
  );

  const visibleRideRequestResults = useMemo(
    () => rideRequestFeed.results.filter((item) => !dismissedRideRequestSet.has(getNotificationEntryId('ride_requests', item))),
    [dismissedRideRequestSet, rideRequestFeed.results],
  );

  const visibleBookingsFeed = useMemo(
    () => bookingsFeed.filter((item) => !dismissedBookingSet.has(getNotificationEntryId('bookings', item))),
    [bookingsFeed, dismissedBookingSet],
  );

  const visibleChatNotifications = useMemo(
    () => chatNotifications.filter((item) => !dismissedChatSet.has(getNotificationEntryId('chats', item))),
    [chatNotifications, dismissedChatSet],
  );

  const dismissNotification = (tab, item) => {
    const id = getNotificationEntryId(tab, item);
    if (!id) return;

    setDismissedNotifications((current) => {
      const existingItems = Array.isArray(current?.[tab]) ? current[tab] : [];
      if (existingItems.includes(id)) {
        return current;
      }

      return {
        ...current,
        [tab]: [id, ...existingItems].slice(0, 500),
      };
    });

    // When dismissing a single item, we also increment the last seen count to keep the badge in sync
    if (tab === 'ride_requests') {
      setLastSeenRideRequestCount((prev) => prev + 1);
    } else if (tab === 'bookings') {
      setLastSeenBookingCount((prev) => prev + 1);
    }
  };

  const dismissCurrentNotifications = () => {
    if (notificationTab === 'ride_requests') {
      visibleRideRequestResults.forEach((item) => dismissNotification('ride_requests', item));
      // Force badge to clear if they clear all visible ones
      setLastSeenRideRequestCount(rideRequestUnreadTotal);
      return;
    }

    if (notificationTab === 'bookings') {
      visibleBookingsFeed.forEach((item) => dismissNotification('bookings', item));
      // Force badge to clear if they clear all visible ones
      setLastSeenBookingCount(bookingUnreadTotal);
      return;
    }

    visibleChatNotifications.forEach((item) => dismissNotification('chats', item));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('adminLastSeenRideRequestCount', lastSeenRideRequestCount.toString());
  }, [lastSeenRideRequestCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('adminLastSeenBookingCount', lastSeenBookingCount.toString());
  }, [lastSeenBookingCount]);

  useEffect(() => {
    if (isTripsRoute && rideRequestUnreadTotal > 0) {
      setLastSeenRideRequestCount(rideRequestUnreadTotal);
    }
  }, [isTripsRoute, rideRequestUnreadTotal]);

  useEffect(() => {
    if (isOwnerBookingsRoute && bookingUnreadTotal > 0) {
      setLastSeenBookingCount(bookingUnreadTotal);
    }
  }, [isOwnerBookingsRoute, bookingUnreadTotal]);

  useEffect(() => {
    if (rideRequestUnreadTotal < lastSeenRideRequestCount) {
      setLastSeenRideRequestCount(rideRequestUnreadTotal);
    }
  }, [rideRequestUnreadTotal, lastSeenRideRequestCount]);

  useEffect(() => {
    if (bookingUnreadTotal < lastSeenBookingCount) {
      setLastSeenBookingCount(bookingUnreadTotal);
    }
  }, [bookingUnreadTotal, lastSeenBookingCount]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SIDEBAR_EXPANSION_STORAGE_KEY,
      JSON.stringify(expandedSidebarGroups)
    );
  }, [expandedSidebarGroups]);

  const adminSections = useMemo(
    () => [
      {
        title: 'Home',
        items: [
          {
            icon: UserCog,
            label: 'Admin Management',
            subItems: [
              { label: 'Admins', path: '/admin/management/admins', permission: 'subadmins.manage' },
            ],
          },
          { icon: Home, label: 'Dashboard', path: '/admin/dashboard', permission: 'dashboard.view' },
          { icon: IndianRupee, label: 'Admin Earnings', path: '/admin/earnings', permission: 'earnings.view' },
          { icon: MessageCircle, label: 'Chat', path: '/admin/chat', permission: 'chat.view' },
          {
            icon: TrendingUp,
            label: 'Promotions Management',
            subItems: [
              { label: 'Promo Code', path: '/admin/promotions/promo-codes', permission: 'promotions.view' },
              { label: 'Push Notifications', path: '/admin/promotions/send-notification', permission: 'promotions.view' },
              //{ label: 'Banner Image', path: '/admin/promotions/banner-image', permission: 'promotions.view' },
            ],
          },
          {
            icon: IndianRupee,
            label: 'Price Management',
            subItems: [
              { label: 'Service Location', path: '/admin/pricing/service-location', permission: 'service_locations.view' },
              { label: 'Zone', path: '/admin/pricing/zone', permission: 'zones.view' },
              { label: 'Airport', path: '/admin/pricing/airport', permission: 'airports.view' },
              { label: 'Set Price', path: '/admin/pricing/set-price', permission: 'set_prices.view' },
              //{ label: 'Goods Types', path: '/admin/pricing/goods-types', permission: 'goods_types.view' },
            ],
          },
          {
            icon: Briefcase,
            label: 'Rental',
            subItems: [
              { label: 'Service Stores', path: '/admin/pricing/service-stores', permission: 'service_stores.view' },
              { label: 'Pending Service Stores', path: '/admin/pricing/service-stores/pending', permission: 'service_stores.view' },
              { label: 'Pending Service Staff', path: '/admin/pricing/service-stores/pending-staff', permission: 'service_stores.view' },
              { label: 'Rental Commission', path: '/admin/pricing/rental-commission', permission: 'rental.view' },
              { label: 'Rental Vehicles', path: '/admin/pricing/rental-vehicles', permission: 'rental.view' },
              { label: 'Track Vehicles', path: '/admin/pricing/rental-tracking', permission: 'rental.view' },
              { label: 'Rental Requests', path: '/admin/pricing/rental-requests', permission: 'rental.view' },
              { label: 'Rental Quote Requests', path: '/admin/pricing/rental-quotes', permission: 'rental.view' },
              { label: 'Rental Package Types', path: '/admin/pricing/rental-packages', permission: 'rental.view' },
              { label: 'Package Pricing', path: '/admin/pricing/package-pricing', permission: 'rental.view' },
            ],
          },
          {
            icon: Bus,
            label: 'Bus Service',
            subItems: [
              { label: 'Fleet Manager', path: '/admin/bus-service', permission: 'bus_service.view' },
              { label: 'Pending Bus Drivers', path: '/admin/bus-service/pending-drivers', permission: 'bus_service.view' },
              { label: 'Bus Commission', path: '/admin/bus-service/commission', permission: 'bus_service.view' },
              { label: 'Bus Bookings', path: '/admin/bus-service/bookings', permission: 'bus_service.view' },
            ],
          },
          {
            icon: Share2,
            label: 'Car Pooling',
            subItems: [
              { label: 'Pending Pooling Drivers', path: '/admin/pooling/pending-drivers', permission: 'pooling.view' },
              { label: 'Pooling Vehicles', path: '/admin/pooling/vehicles', permission: 'pooling.view' },
              { label: 'Pooling Commission', path: '/admin/pooling/commission', permission: 'pooling.view' },
              { label: 'Routes & Stops', path: '/admin/pooling/routes', permission: 'pooling.view' },
              { label: 'Pooling Bookings', path: '/admin/pooling/bookings', permission: 'pooling.view' },
            ],
          },
          {
            icon: MapPin,
            label: 'Geofencing',
            subItems: [
              { label: 'Heat Map', path: '/admin/geo/heatmap', permission: 'geofencing.view' },
              { label: "God's Eye", path: '/admin/geo/gods-eye', permission: 'geofencing.view' },
            ],
          },
          { icon: ShieldAlert, label: 'SOS', path: '/admin/safety', permission: 'dashboard.view' },
          { icon: Car, label: 'Trip Requests', path: '/admin/trips', permission: 'trips.view' },
          { icon: Package, label: 'Delivery Requests', path: '/admin/deliveries', permission: 'deliveries.view' },
          { icon: Clock, label: 'Ongoing Requests', path: '/admin/ongoing', permission: 'ongoing.view' },
        ],
      },
      {
        title: 'Users',
        items: [
          {
            icon: Users,
            label: 'Customer Management',
            subItems: [
              { label: 'User List', path: '/admin/users', permission: 'users.view' },
              { label: 'Subscription Management', path: '/admin/users/subscriptions', permission: 'users.view' },
              { label: 'Delete Request Users', path: '/admin/users/delete-requests', permission: 'users.view' },
              { label: 'User Bulk Upload', path: '/admin/users/bulk-upload', permission: 'users.view' },
            ],
          },
          { icon: Wallet, label: 'Wallet Payment', path: '/admin/wallet/payment', permission: 'wallet.view' },
          {
            icon: Car,
            label: 'Driver Management',
            subItems: [
              { label: 'Pending Drivers', path: '/admin/drivers/pending', permission: 'drivers.view' },
              { label: 'Approved Drivers', path: '/admin/drivers', permission: 'drivers.view' },
              { label: 'Active Drivers', path: '/admin/drivers/active', permission: 'drivers.view' },
              //cd front{ label: 'Subscription', path: '/admin/drivers/subscription', permission: 'drivers.view' },
              { label: 'Drivers Ratings', path: '/admin/drivers/ratings', permission: 'drivers.view' },
              {
                label: 'Driver Wallet',
                subItems: [
                  { label: 'Withdrawal Requests', path: '/admin/drivers/wallet/withdrawals', permission: 'wallet.view' },
                  { label: 'Negative Balance Drivers', path: '/admin/drivers/wallet/negative', permission: 'wallet.view' },
                ],
              },
              { label: 'Delete Request Drivers', path: '/admin/drivers/delete-requests', permission: 'drivers.view' },
              { label: 'Driver Needed Documents', path: '/admin/drivers/documents', permission: 'drivers.view' },
              //  { label: 'Driver Bulk Upload', path: '/admin/drivers/bulk-upload', permission: 'drivers.view' },
              { label: 'Payment Methods', path: '/admin/drivers/payment-methods', permission: 'wallet.view' },
              { label: 'Driver Wallet Managment', path: '/admin/settings/app/wallet', permission: 'settings.view' },
            ],
          },
          {
            icon: Share2,
            label: 'Referral Management',
            subItems: [
              { label: 'Referral Dashboard', path: '/admin/referrals/dashboard', permission: 'referrals.view' },
              { label: 'User Referral Settings', path: '/admin/referrals/user-settings', permission: 'referrals.view' },
              { label: 'Driver Referral Settings', path: '/admin/referrals/driver-settings', permission: 'referrals.view' },
              { label: 'Referral Translation', path: '/admin/referrals/translation', permission: 'referrals.view' },
            ],
          },
          {
            icon: UserCog,
            label: 'Employee Management',
            subItems: [
              { label: 'Employee List', path: '/admin/employees', permission: 'employees.view' },
              { label: 'Add Employee', path: '/admin/employees/create', permission: 'employees.view' },
            ],
          },
          { icon: Briefcase, label: 'Owner Management', path: '/admin/owners/dashboard', permission: 'owners.view' },
          {
            icon: FileText,
            label: 'Report',
            subItems: [
              { label: 'User Report', path: '/admin/reports/user', permission: 'reports.view' },
              { label: 'Driver Report', path: '/admin/reports/driver', permission: 'reports.view' },
              { label: 'Driver Duty Report', path: '/admin/reports/driver-duty', permission: 'reports.view' },
              { label: 'Owner Report', path: '/admin/reports/owner', permission: 'reports.view' },
              { label: 'Finance Report', path: '/admin/reports/finance', permission: 'reports.view' },
              { label: 'Fleet Finance Report', path: '/admin/reports/fleet-finance', permission: 'reports.view' },
            ],
          },
          {
            icon: ShieldCheck,
            label: 'Support Management',
            subItems: [
              { label: 'Ticket Title', path: '/admin/support/ticket-title', permission: 'support.view' },
              { label: 'Support Tickets', path: '/admin/support/tickets', permission: 'support.view' },
            ],
          },
          {
            icon: Briefcase,
            label: 'Careers Management',
            subItems: [
              { label: 'Job Positions', path: '/admin/careers/jobs', permission: 'support.view' },
              { label: 'Applications', path: '/admin/careers/applications', permission: 'support.view' },
            ],
          },
        ],
      },
      {
        title: 'Masters',
        items: [
          { icon: Globe, label: 'Language', path: '/admin/masters/languages', permission: 'settings.view' },
          // { icon: Star, label: 'Preferences', path: '/admin/masters/preferences' },
          // { icon: ShieldCheck, label: 'Roles', path: '/admin/masters/roles' },
        ],
      },
      {
        title: 'Settings',
        items: [
          {
            icon: Settings,
            label: 'Business Settings',
            permission: 'settings.view',
            subItems: [
              { label: 'General Settings', path: '/admin/settings/business/general', permission: 'settings.view' },
              { label: 'Customization Settings', path: '/admin/settings/business/customization', permission: 'settings.view' },
              { label: 'Transport Ride Settings', path: '/admin/settings/business/transport-ride', permission: 'settings.view' },
              { label: 'Bid Ride Settings', path: '/admin/settings/business/bid-ride', permission: 'settings.view' },
            ],
          },
          {
            icon: Smartphone,
            label: 'App Settings',
            permission: 'settings.view',
            subItems: [
              { label: 'Wallet Settings', path: '/admin/settings/app/wallet', permission: 'settings.view' },
              { label: 'Tip Settings', path: '/admin/settings/app/tip', permission: 'settings.view' },
              // { label: 'Mobile App Landing/Onboard Screens Settings', path: '/admin/settings/app/onboard', permission: 'settings.view' },
            ],
          },
          {
            icon: Layers,
            label: 'User App Management',
            permission: 'settings.view',
            subItems: [
              { label: 'App Modules', path: '/admin/pricing/app-modules', permission: 'settings.view' },
              { label: 'Vehicle Type', path: '/admin/pricing/vehicle-type', permission: 'vehicle_types.view' },
              { label: 'Home Sections', path: '/admin/settings/user-app/home-sections', permission: 'settings.view' },
              { label: 'Everything In Minutes', path: '/admin/settings/user-app/everything-in-minutes', permission: 'settings.view' },
              { label: 'Explore Cards', path: '/admin/settings/user-app/explore-cards', permission: 'settings.view' },
              { label: 'Promo Banners', path: '/admin/settings/user-app/promo-banners', permission: 'settings.view' },
              { label: 'Go Places', path: '/admin/settings/user-app/go-places', permission: 'settings.view' },
              { label: 'Footer Content', path: '/admin/settings/user-app/footer-content', permission: 'settings.view' },
            ],
          },
          {
            icon: Settings2,
            label: 'Third-party Settings',
            permission: 'settings.view',
            subItems: [
              { label: 'Payment Gateway Settings', path: '/admin/settings/third-party/payment', permission: 'settings.view' },
              { label: 'Recharge API Setup', path: '/admin/settings/third-party/recharge-api', permission: 'settings.view' },
              // { label: 'SMS Gateway Settings', path: '/admin/settings/third-party/sms', permission: 'settings.view' },
              // { label: 'Firebase Settings', path: '/admin/settings/third-party/firebase', permission: 'settings.view' },
              // { label: 'Map and Map APIs Settings', path: '/admin/settings/third-party/map-apis', permission: 'settings.view' },
              // { label: 'Mail Configuration', path: '/admin/settings/third-party/mail', permission: 'settings.view' },
              // { label: 'Notification Channel', path: '/admin/settings/third-party/notification-channel' },
            ],
          },
          // {
          //   icon: PlusCircle,
          //   label: 'Addons',
          //   subItems: [{ label: 'Dispatcher Addons', path: '/admin/settings/addons/dispatcher' }],
          // },
          // {
          //   icon: Monitor,
          //   label: 'CMS-Landing Website',
          //   permission: 'settings.view',
          //   subItems: [
          //     { label: 'Header-Footer', path: '/admin/settings/cms/header-footer', permission: 'settings.view' },
          //     { label: 'Home', path: '/admin/settings/cms/home', permission: 'settings.view' },
          //     { label: 'About Us', path: '/admin/settings/cms/about', permission: 'settings.view' },
          //     { label: 'Driver', path: '/admin/settings/cms/driver', permission: 'settings.view' },
          //     { label: 'User', path: '/admin/settings/cms/user', permission: 'settings.view' },
          //     { label: 'Contact', path: '/admin/settings/cms/contact', permission: 'settings.view' },
          //     { label: 'Privacy Policy, T&C and DMV', path: '/admin/settings/cms/legal', permission: 'settings.view' },
          //   ],
          // },
        ],
      },
    ],
    []
  );

  const ownerSections = useMemo(
    () => [
      {
        title: 'Owner Mode',
        items: [
          {
            icon: Briefcase,
            label: 'Owner Management',
            subItems: [
              { label: 'Owner Dashboard', path: '/admin/owners/dashboard', permission: 'owners.view' },
              { label: 'Pending Owners', path: '/admin/owners/pending', permission: 'owners.view' },
              { label: 'Manage Owners', path: '/admin/owners', permission: 'owners.view' },
              {
                label: 'Owner Wallet',
                subItems: [{ label: 'Withdrawal Requests', path: '/admin/owners/wallet/withdrawals', permission: 'wallet.view' }],
              },
              {
                label: 'Fleet Management',
                subItems: [
                  { label: 'Fleet Drivers', path: '/admin/fleet/drivers', permission: 'owners.view' },
                  { label: 'Pending Fleet Drivers', path: '/admin/fleet/blocked', permission: 'owners.view' },
                  { label: 'Fleet Needed Document', path: '/admin/fleet/documents', permission: 'owners.view' },
                  { label: 'Manage Fleet', path: '/admin/fleet/manage', permission: 'owners.view' },
                ],
              },
              { label: 'Owner Needed Document', path: '/admin/owners/documents', permission: 'owners.view' },
              { label: 'Deleted Owners', path: '/admin/owners/deleted', permission: 'owners.view' },
              { label: 'Bookings', path: '/admin/owners/bookings', permission: 'owners.view' },
            ],
          },
        ],
      },
    ],
    []
  );

  const sidebarSections = useMemo(
    () => filterSidebarSectionsByAccess(mode === OWNER_MODE ? ownerSections : adminSections, adminProfile),
    [adminProfile, adminSections, mode, ownerSections],
  );
  const rideRequestUnreadCount = Math.max(0, rideRequestUnreadTotal - lastSeenRideRequestCount);
  const bookingUnreadCount = Math.max(0, bookingUnreadTotal - lastSeenBookingCount);
  const effectiveChatUnreadCount = Math.max(0, chatUnreadCount);
  const unreadCountsByPath = useMemo(
    () => ({
      '/admin/trips': rideRequestUnreadCount,
      '/admin/owners/bookings': bookingUnreadCount,
      '/admin/chat': effectiveChatUnreadCount,
    }),
    [bookingUnreadCount, effectiveChatUnreadCount, rideRequestUnreadCount],
  );
  const pageTitle = resolvePageTitle(location.pathname, sidebarSections, appName);
  const searchEntries = useMemo(() => flattenSearchEntries(flattenItems(sidebarSections)), [sidebarSections]);
  const filteredSearchEntries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return searchEntries.slice(0, 10);
    }

    return searchEntries
      .filter((entry) => entry.keywords.includes(query) || entry.path.toLowerCase().includes(query))
      .slice(0, 14);
  }, [searchEntries, searchTerm]);

  const pagedBookings = useMemo(() => {
    const total = visibleBookingsFeed.length;
    const lastPage = Math.max(1, Math.ceil(total / NOTIFICATION_PAGE_SIZE));
    const currentPage = Math.min(bookingPage, lastPage);
    const start = (currentPage - 1) * NOTIFICATION_PAGE_SIZE;

    return {
      results: visibleBookingsFeed.slice(start, start + NOTIFICATION_PAGE_SIZE),
      paginator: {
        current_page: currentPage,
        last_page: lastPage,
        total,
      },
    };
  }, [bookingPage, visibleBookingsFeed]);

  const activeNotificationMeta =
    notificationTab === 'ride_requests'
      ? rideRequestFeed.paginator
      : notificationTab === 'bookings'
        ? pagedBookings.paginator
        : { current_page: 1, last_page: 1, total: chatNotifications.length };

  const totalNotificationItems =
    rideRequestUnreadCount +
    bookingUnreadCount +
    effectiveChatUnreadCount;

  const currentNotificationCount =
    notificationTab === 'ride_requests'
      ? visibleRideRequestResults.length
      : notificationTab === 'bookings'
        ? pagedBookings.results.length
        : visibleChatNotifications.length;

  const setMode = (nextMode) => {
    localStorage.setItem(MODE_STORAGE_KEY, nextMode);

    if (nextMode === OWNER_MODE && !isOwnerRoute) {
      navigate('/admin/owners/dashboard');
    }

    if (nextMode === ADMIN_MODE && isOwnerRoute) {
      navigate('/admin/dashboard');
    }
  };

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false);
      }

      if (!notificationsMenuRef.current?.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };

    const handleCloseDropdowns = () => {
      setIsNotificationsOpen(false);
      setIsUserMenuOpen(false);
    };

    document.addEventListener('mousedown', handleDocumentClick);
    window.addEventListener('admin:closeDropdowns', handleCloseDropdowns);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      window.removeEventListener('admin:closeDropdowns', handleCloseDropdowns);
    };
  }, []);

  useEffect(() => {
    setIsSearchOpen(false);
    setSearchTerm('');
    setIsNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');

    if (!token || mode !== ADMIN_MODE) {
      setChatUnreadCount(0);
      setRideRequestUnreadTotal(0);
      setBookingUnreadTotal(0);
      return undefined;
    }

    let active = true;

    const syncUnreadNotifications = async () => {
      try {
        const [chatResponse, rideRequestsResponse, bookingsResponse] = await Promise.all([
          getSupportConversations(token),
          isTripsRoute
            ? Promise.resolve(null)
            : adminService.getRideRequests({
              page: 1,
              limit: NOTIFICATION_PAGE_SIZE,
              tab: 'all',
              search: '',
            }),
          adminService.getOwnerBookings(),
        ]);

        if (!active) {
          return;
        }

        const rideRequestResults =
          rideRequestsResponse?.data?.results || rideRequestsResponse?.results || [];
        const rideRequestPaginator =
          rideRequestsResponse?.data?.paginator || rideRequestsResponse?.paginator || { current_page: 1, last_page: 1, total: 0 };
        const bookingsResults =
          bookingsResponse?.data?.results || bookingsResponse?.results || [];
        const rideRequestTotal = Math.max(0, Number(rideRequestPaginator?.total || rideRequestResults.length || 0));
        const bookingsTotal = Array.isArray(bookingsResults) ? bookingsResults.length : 0;

        if (!isTripsRoute) {
          setRideRequestFeed({
            results: rideRequestResults,
            paginator: rideRequestPaginator,
          });
        }
        setBookingsFeed(Array.isArray(bookingsResults) ? bookingsResults : []);
        if (!isTripsRoute) {
          setRideRequestUnreadTotal(rideRequestTotal);
        }
        setBookingUnreadTotal(bookingsTotal);

        const response = chatResponse;
        const conversations = response?.data?.conversations || [];
        const unreadTotal = conversations.reduce(
          (sum, conversation) => sum + Math.max(0, Number(conversation?.unreadCount || 0)),
          0,
        );

        if (!active) {
          return;
        }

        if (isAdminChatRoute) {
          const unreadConversationKeys = conversations
            .filter((conversation) => Number(conversation?.unreadCount || 0) > 0)
            .map((conversation) => conversation.conversationKey)
            .filter(Boolean);

          if (unreadConversationKeys.length > 0) {
            await Promise.all(
              unreadConversationKeys.map((conversationKey) => markSupportMessagesRead(conversationKey, token)),
            );
          }

          if (!active) {
            return;
          }

          setChatNotifications([]);
          setChatUnreadCount(0);
          return;
        }

        setChatUnreadCount(unreadTotal);
      } catch (error) {
        if (!active) {
          return;
        }

        console.error('Failed to sync admin notification counts:', error);
      }
    };

    syncUnreadNotifications();
    const intervalId = window.setInterval(syncUnreadNotifications, 30000);

    const handleWindowFocus = () => {
      syncUnreadNotifications();
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isAdminChatRoute, isOwnerBookingsRoute, isTripsRoute, mode]);

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;

    let isMounted = true;

    const fetchNotifications = async () => {
      setNotificationsLoading(true);

      try {
        if (notificationTab === 'ride_requests') {
          if (isTripsRoute) {
            return;
          }

          const response = await adminService.getRideRequests({
            page: rideRequestPage,
            limit: NOTIFICATION_PAGE_SIZE,
            tab: 'all',
            search: '',
          });

          if (!isMounted) return;

          setRideRequestFeed({
            results: response?.data?.results || response?.results || [],
            paginator: response?.data?.paginator || response?.paginator || { current_page: 1, last_page: 1, total: 0 },
          });
          return;
        }

        if (notificationTab === 'chats') {
          return;
        }

        const response = await adminService.getOwnerBookings();
        if (!isMounted) return;

        setBookingsFeed(response?.data?.results || response?.results || []);
      } catch (error) {
        console.error('Failed to load admin notifications:', error);

        if (!isMounted) return;

        if (notificationTab === 'ride_requests') {
          setRideRequestFeed({
            results: [],
            paginator: { current_page: 1, last_page: 1, total: 0 },
          });
        } else if (notificationTab === 'bookings') {
          setBookingsFeed([]);
        }
      } finally {
        if (isMounted) {
          setNotificationsLoading(false);
        }
      }
    };

    fetchNotifications();

    return () => {
      isMounted = false;
    };
  }, [bookingPage, isNotificationsOpen, isTripsRoute, notificationTab, rideRequestPage]);

  useEffect(() => {
    if (!isSearchOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token && !window.location.pathname.includes('/admin/login')) {
      navigate('/admin/login');
      return undefined;
    }

    if (!token) return undefined;

    socketService.connect({ role: 'admin', token });

    socketService.on('new_sos', (data) => {
      console.log('SOS ALERT RECEIVED:', data);
      alert(`SOS ALERT: Driver ${data.driver_name} is in trouble!`);
    });

    socketService.on('new_driver_registration', (data) => {
      console.log('New driver registration:', data);
    });

    const handleSupportChatNotification = (payload = {}) => {
      const senderRole = String(payload.senderRole || payload.sender?.role || '').toLowerCase();
      const receiverRole = String(payload.receiverRole || payload.receiver?.role || '').toLowerCase();
      const messageBody = String(payload.message || payload.body || '').trim();

      if (!messageBody || senderRole === 'admin' || receiverRole !== 'admin') {
        return;
      }

      if (isAdminChatRoute) {
        if (payload.conversationKey) {
          markSupportMessagesRead(payload.conversationKey, token).catch((error) => {
            console.error('Failed to mark live admin chat message as read:', error);
          });
        }

        setChatNotifications([]);
        setChatUnreadCount(0);
        return;
      }

      const senderName =
        String(payload.sender?.name || '').trim() ||
        (senderRole === 'driver' ? 'Driver' : senderRole === 'user' ? 'User' : 'Support contact');

      const nextItem = {
        id: `support-chat:${payload.id || payload._id || payload.conversationKey || `${Date.now()}-${messageBody}`}`,
        title: `${senderName} sent a new chat`,
        body: messageBody,
        senderRole: senderRole || 'user',
        createdAt: payload.createdAt || new Date().toISOString(),
      };

      let wasAdded = false;

      setChatNotifications((current) => {
        const next = dedupeAdminChatNotifications([nextItem, ...current]).slice(0, 25);
        wasAdded = next.some((item) => item.id === nextItem.id) && !current.some((item) => item.id === nextItem.id);
        return next;
      });

      if (wasAdded) {
        setChatUnreadCount((current) => current + 1);
        toast(nextItem.body, {
          duration: 4500,
          className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-sky-50 bg-white',
        });
      }
    };

    socketService.on('chat:message', handleSupportChatNotification);

    return () => {
      socketService.off('new_sos');
      socketService.off('new_driver_registration');
      socketService.off('chat:message', handleSupportChatNotification);
    };
  }, [isAdminChatRoute, navigate]);

  const handleLogout = () => {
    socketService.disconnect();
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminInfo');
    setIsUserMenuOpen(false);
    navigate('/admin/login');
  };

  return (
    <>
      <AnimatePresence>
        {showSplash && <AdminSplashScreen />}
      </AnimatePresence>

      <div className="flex h-screen overflow-hidden bg-[#F8F9FA] font-sans text-gray-900">
      <aside
        className={`relative z-50 flex h-screen flex-col overflow-hidden transition-all bg-[#fffbeb] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isCollapsed ? 'w-20' : 'w-72'
          } ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex h-full flex-col">
          <div className="group/sidebar-head relative mb-2 flex h-14 items-center border-b border-amber-200/50 px-5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-100 p-1.5 transition-all duration-300 group-hover/sidebar-head:scale-105 shadow-sm">
                  {settings.general?.logo || settings.customization?.logo ? (
                    <img src={settings.general?.logo || settings.customization?.logo} alt={appName} className="h-full w-full object-contain" />
                  ) : (
                    <Zap size={20} className="text-amber-600 fill-amber-600" />
                  )}
                </div>
                <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-indigo-900" />
              </div>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col"
                >
                  <h3 className="text-sm font-bold leading-tight text-slate-900 tracking-tight">
                    {mode === OWNER_MODE ? 'Owner Panel' : appName || 'APPZETO'}
                  </h3>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      {mode === OWNER_MODE ? 'Fleet Console' : 'System Hub'}
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="absolute -right-3 top-4 z-[60] hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-sm ring-2 ring-[#0F172A] transition-all duration-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-500 lg:flex group/collapse"
              style={{ '--tw-ring-color': adminThemeColor }}
            >
              {isCollapsed ? (
                <ChevronRight size={12} strokeWidth={3} className="transition-transform group-hover/collapse:translate-x-0.5" />
              ) : (
                <ChevronLeft size={12} strokeWidth={3} className="transition-transform group-hover/collapse:-translate-x-0.5" />
              )}
            </button>
          </div>

          <nav className="no-scrollbar mt-0 flex-1 space-y-4 overflow-y-auto px-3 pb-10 scroll-smooth">
            {sidebarSections.map((section) => (
              <div key={section.title} className="space-y-1">
                {!isCollapsed && (
                  <div className="mb-2 mt-4 px-4 flex items-center">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 whitespace-nowrap">
                      {section.title}
                    </span>
                  </div>
                )}
                {section.items.map((item) =>
                  item.subItems ? (
                    <SidebarGroup
                      key={item.label}
                      {...item}
                      forceOpen={mode === OWNER_MODE}
                      isCollapsed={isCollapsed}
                      pathname={location.pathname}
                      groupKey={`${section.title}:${item.label}`}
                      expandedGroups={expandedSidebarGroups}
                      setExpandedGroups={setExpandedSidebarGroups}
                      sidebarTextColor={sidebarTextColor}
                      unreadCountsByPath={unreadCountsByPath}
                    />
                  ) : (
                    <SidebarItem
                      key={item.path}
                      {...item}
                      isCollapsed={isCollapsed}
                      sidebarTextColor={sidebarTextColor}
                      unreadCount={getSidebarItemCount(item, unreadCountsByPath)}
                    />
                  )
                )}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f0f4f8]">
        <header className="sticky top-0 z-40 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
          <div className="flex flex-1 items-center gap-3">
            <div className="h-4 w-1 rounded-full bg-slate-900" />
            <h2 className="text-lg font-bold tracking-tight text-slate-900 font-serif">{pageTitle}</h2>
          </div>

          <div className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => setIsSearchOpen((current) => !current)}
              className="group flex w-[260px] items-center gap-2 px-3 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-400 transition-all hover:border-slate-300 hover:bg-white text-xs font-medium"
            >
              <Search size={14} className="text-slate-400 group-hover:text-slate-500" />
              <span className="flex-1 text-left text-slate-500">Search dashboard...</span>
              <kbd className="hidden md:inline-flex h-4 select-none items-center gap-0.5 rounded border border-slate-200 bg-white px-1 text-[9px] font-medium text-slate-400">⌘K</kbd>
            </button>
          </div>

          <div className="flex flex-1 items-center justify-end gap-3">
            <div ref={notificationsMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsNotificationsOpen((current) => !current)}
                className="relative group flex items-center justify-center rounded h-9 w-9 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-900"
              >
                <Bell size={20} strokeWidth={2.5} />
                {totalNotificationItems > 0 ? (
                  <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
                ) : null}
              </button>

              <div
                className={`notification-dropdown absolute right-0 top-full z-40 mt-2 w-[280px] max-h-[320px] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl transition-all duration-300 ${isNotificationsOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
                  }`}
              >
                <div className="border-b border-slate-50 px-3 py-2 bg-slate-50/50 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-900">Intelligence Feed</p>
                      <p className="text-[9px] font-medium text-slate-500">
                        Real-time system alerts
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {currentNotificationCount > 0 ? (
                        <button
                          type="button"
                          onClick={dismissCurrentNotifications}
                          className="text-[11px] font-medium text-slate-500 hover:text-rose-600 transition-colors"
                        >
                          Flush
                        </button>
                      ) : null}
                      <div className="h-5 w-px bg-slate-200" />
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-900 px-1.5 text-[10px] font-medium text-white">
                        {totalNotificationItems}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex gap-1 rounded-md bg-white p-0.5 border border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationTab('ride_requests');
                        setRideRequestPage(1);
                      }}
                      className={`flex-1 rounded px-1.5 py-1 text-[9px] font-medium transition-all ${notificationTab === 'ride_requests'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                      Trips
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationTab('bookings');
                        setBookingPage(1);
                      }}
                      className={`flex-1 rounded px-1.5 py-1 text-[9px] font-medium transition-all ${notificationTab === 'bookings'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                      Bookings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationTab('chats');
                      }}
                      className={`flex-1 rounded px-1.5 py-1 text-[9px] font-medium transition-all ${notificationTab === 'chats'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                      Chats
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                  {notificationsLoading ? (
                    <div className="flex items-center justify-center px-4 py-12 text-sm font-semibold text-slate-500">
                      Loading notifications...
                    </div>
                  ) : notificationTab === 'ride_requests' ? (
                    visibleRideRequestResults.length === 0 ? (
                      <div className="px-6 py-12 text-center">
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mx-auto mb-4">
                          <Zap size={24} />
                        </div>
                        <p className="text-[13px] font-black text-slate-900 tracking-tight">Zero Traffic</p>
                        <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">No active ride requests</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {visibleRideRequestResults.map((item) => (
                          <button
                            key={item.id || item.requestId}
                            type="button"
                            onClick={() => {
                              dismissNotification('ride_requests', item);
                              navigate('/admin/trips');
                              setIsNotificationsOpen(false);
                            }}
                            className="relative w-full rounded p-2 text-left transition-all hover:bg-slate-50 group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[10px] font-semibold text-slate-900">
                                  {item.requestId} · {item.userName}
                                </p>
                                <p className="truncate text-[9px] font-medium text-slate-500">
                                  {formatAdminNotificationLocation(item.pickupLabel, 'Pickup...')} → {formatAdminNotificationLocation(item.dropLabel, 'Drop...')}
                                </p>
                              </div>
                              <span className="shrink-0 text-[9px] font-medium text-slate-400 group-hover:text-slate-600">
                                {formatRelativeAdminTime(item.date)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  ) : notificationTab === 'bookings' ? pagedBookings.results.length === 0 ? (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center">
                      <p className="text-sm font-bold text-slate-900">No bookings found</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Recent bookings will show up here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pagedBookings.results.map((item) => (
                        <button
                          key={item._id || item.id || item.booking_reference}
                          type="button"
                          onClick={() => {
                            dismissNotification('bookings', item);
                            navigate('/admin/owners/bookings');
                            setIsNotificationsOpen(false);
                          }}
                          className="relative w-full rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-slate-900">
                                {item.booking_reference || 'Booking'} · {item.customer_name || 'Customer'}
                              </p>
                              <p className="truncate text-[11px] font-medium text-slate-500">
                                {item.pickup_location || 'Pickup'} to {item.dropoff_location || 'Drop'}
                              </p>
                            </div>
                            <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                              {item.booking_status || 'Pending'}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-400">
                            <span>{item.owner_id?.name || item.owner_id?.company_name || 'Owner booking'}</span>
                            <span>{formatRelativeAdminTime(item.trip_date || item.createdAt)}</span>
                          </div>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              dismissNotification('bookings', item);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                dismissNotification('bookings', item);
                              }
                            }}
                            className="absolute right-3 top-3 inline-flex rounded-lg p-1.5 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Delete notification"
                          >
                            <Trash2 size={14} />
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : visibleChatNotifications.length === 0 ? (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-slate-900">No new chats found</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">New user and driver support messages will show up here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {visibleChatNotifications.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            dismissNotification('chats', item);
                            navigate('/admin/chat');
                            setChatNotifications((current) =>
                              current.filter((entry) => entry.id !== item.id),
                            );
                            setIsNotificationsOpen(false);
                          }}
                          className="relative w-full rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-slate-900">{item.title}</p>
                              <p className="truncate text-[11px] font-medium text-slate-500">{item.body}</p>
                            </div>
                            <span className="shrink-0 rounded bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700">
                              {item.senderRole}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-end text-[11px] font-semibold text-slate-400">
                            <span>{formatRelativeAdminTime(item.createdAt)}</span>
                          </div>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              dismissNotification('chats', item);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                dismissNotification('chats', item);
                              }
                            }}
                            className="absolute right-3 top-3 inline-flex rounded-lg p-1.5 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Delete notification"
                          >
                            <Trash2 size={14} />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                  <button
                    type="button"
                    disabled={(activeNotificationMeta?.current_page || 1) <= 1}
                    onClick={() => {
                      if (notificationTab === 'ride_requests') {
                        setRideRequestPage((current) => Math.max(1, current - 1));
                      } else {
                        setBookingPage((current) => Math.max(1, current - 1));
                      }
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  <span className="text-[11px] font-medium text-slate-500">
                    Page {activeNotificationMeta?.current_page || 1} of {activeNotificationMeta?.last_page || 1}
                  </span>

                  <button
                    type="button"
                    disabled={(activeNotificationMeta?.current_page || 1) >= (activeNotificationMeta?.last_page || 1)}
                    onClick={() => {
                      if (notificationTab === 'ride_requests') {
                        setRideRequestPage((current) => current + 1);
                      } else {
                        setBookingPage((current) => current + 1);
                      }
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            <ModeSwitcher mode={mode} setMode={setMode} />
            <div className="h-6 w-px bg-slate-200 mx-1"></div>

            <div ref={userMenuRef} className="relative flex items-center">
              <button
                type="button"
                className="group flex items-center gap-2 rounded border border-transparent px-2 py-1.5 transition-all hover:bg-slate-50"
                onClick={() => setIsUserMenuOpen((current) => !current)}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-white shrink-0">
                  <Users size={14} strokeWidth={2} />
                </div>
                <div className="text-left hidden sm:flex flex-col justify-center">
                  <p className="text-[12px] font-semibold text-slate-900 whitespace-nowrap">{adminProfile?.name || 'Terminal'}</p>
                  <p className="text-[10px] font-medium text-slate-500 whitespace-nowrap">
                    {adminProfile?.admin_type === 'subadmin' ? adminProfile?.role || 'Access Restricted' : 'Master Authority'}
                  </p>
                </div>
                <ChevronDown size={14} className={`text-slate-400 ml-1 transition-all duration-300 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isUserMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 mb-1 bg-slate-50/50 rounded-t-lg">
                      <p className="text-[10px] font-semibold text-slate-500 mb-0.5">Account</p>
                      <p className="text-[12px] font-medium text-slate-900 truncate">{adminProfile?.email || 'root@Appzeto .cloud'}</p>
                    </div>

                    <div className="p-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          navigate('/admin/profile');
                          setIsUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900 group"
                      >
                        <div className="p-1 rounded bg-slate-50 text-slate-400 group-hover:text-slate-900 transition-colors">
                          <Settings2 size={14} strokeWidth={2} />
                        </div>
                        <span className="text-[12px] font-medium">Profile Settings</span>
                      </button>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleLogout();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-rose-600 transition-all hover:bg-rose-50 group"
                      >
                        <div className="p-1 rounded bg-rose-50 text-rose-400 group-hover:text-rose-600 transition-colors">
                          <LogOut size={14} strokeWidth={2} />
                        </div>
                        <span className="text-[12px] font-medium">Log out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {isSearchOpen && (
          <div
            className="fixed inset-0 z-[70] bg-slate-900/10 backdrop-blur-[1px]"
            onClick={() => setIsSearchOpen(false)}
          >
            <div className="mx-auto mt-24 w-full max-w-[500px] px-4">
              <div
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-slate-100 px-3 py-3">
                  <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <Search size={16} className="text-slate-400" />
                    <input
                      autoFocus
                      type="text"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search sidebar options..."
                      className="w-full bg-transparent text-[13px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setIsSearchOpen(false)}
                      className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-200/70"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="max-h-[320px] overflow-y-auto p-2">
                  {filteredSearchEntries.length === 0 ? (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-6 text-center">
                      <p className="text-[13px] font-bold text-slate-900">No sidebar option found</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">Try searching for drivers, trips, pricing, reports, or settings.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredSearchEntries.map((entry) => (
                        <button
                          key={entry.path}
                          type="button"
                          onClick={() => {
                            navigate(entry.path);
                            setIsSearchOpen(false);
                            setSearchTerm('');
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-slate-900">{entry.label}</p>
                            <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
                              {[...entry.trail, entry.path].join(' • ')}
                            </p>
                          </div>
                          <ChevronRight size={16} className="shrink-0 text-slate-300" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="no-scrollbar flex-1 overflow-y-auto p-4 scroll-smooth lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
    </>
  );
};

export default AdminLayout;
