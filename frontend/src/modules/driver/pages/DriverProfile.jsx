import React, { useEffect, useMemo, useState } from 'react';
import * as Motion from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import {
    User,
    Car,
    FileText,
    Bell,
    History,
    CreditCard,
    UserPlus,
    ShieldCheck,
    HelpCircle,
    LogOut,
    ArrowRight,
    Star,
    Route,
    ChevronRight,
    CheckCircle2,
    Wallet,
    Info,
    Gift,
    Shield,
    BadgePercent,
    Check,
    Mail,
    HandCoins,
    Phone,
    X,
    Landmark,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import { clearDriverAuthState, getCurrentDriver } from '../services/registrationService';

const unwrapDriver = (response) => response?.data?.data || response?.data || response || null;
const ROUTE_BOOKING_STORAGE_KEY = 'driver_route_booking_preferences';

const readRouteBookingPreferences = () => {
    try {
        const raw = localStorage.getItem(ROUTE_BOOKING_STORAGE_KEY);
        return raw ? JSON.parse(raw) : { enabled: false, coordinates: null, label: '' };
    } catch {
        return { enabled: false, coordinates: null, label: '' };
    }
};

const writeRouteBookingPreferences = (nextValue) => {
    localStorage.setItem(ROUTE_BOOKING_STORAGE_KEY, JSON.stringify(nextValue));
    return nextValue;
};

const formatRouteBookingLabel = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
        return 'Receive requests from your selected area';
    }

    const [lng, lat] = coordinates;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        return 'Receive requests from your selected area';
    }

    return `Selected area ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
};

const normalizeRouteBookingPreferences = (routeBooking = null) => {
    const coordinates = Array.isArray(routeBooking?.coordinates) && routeBooking.coordinates.length === 2
        ? routeBooking.coordinates
        : null;

    return {
        enabled: Boolean(routeBooking?.enabled && coordinates),
        coordinates,
        label: String(routeBooking?.label || (coordinates ? formatRouteBookingLabel(coordinates) : '')).trim(),
        updatedAt: routeBooking?.updatedAt || null,
    };
};

const normalizeBankDetails = (bankDetails = {}) => ({
    accountHolderName: String(bankDetails?.accountHolderName || '').trim(),
    upiId: String(bankDetails?.upiId || '').trim(),
    qrCodeImage: String(bankDetails?.qrCodeImage || '').trim(),
    accountNumber: String(bankDetails?.accountNumber || '').trim(),
    ifsc: String(bankDetails?.ifsc || '').trim().toUpperCase(),
    branchName: String(bankDetails?.branchName || '').trim(),
    updatedAt: bankDetails?.updatedAt || null,
});

const DriverProfile = () => {
    const navigate = useNavigate();
    const [routeBookingPreferences, setRouteBookingPreferences] = useState(() => readRouteBookingPreferences());
    const [isLogoutOpen, setIsLogoutOpen] = useState(false);
    const [legalModal, setLegalModal] = useState(null);
    const [driver, setDriver] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [routeBookingBusy, setRouteBookingBusy] = useState(false);
    const role = localStorage.getItem('role') || 'driver';
    const isOwner = role === 'owner';
    const routePrefix = isOwner ? '/taxi/owner' : '/taxi/driver';

    useEffect(() => {
        let active = true;

        const loadDriver = async () => {
            setIsLoading(true);
            setError('');

            try {
                const response = await getCurrentDriver();
                if (!active) return;
                const nextDriver = unwrapDriver(response);
                setDriver(nextDriver);
                const nextRouteBooking = normalizeRouteBookingPreferences(nextDriver?.routeBooking);
                setRouteBookingPreferences(writeRouteBookingPreferences(nextRouteBooking));
            } catch (err) {
                if (!active) return;
                setError(err?.message || 'Unable to load driver profile');
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };

        loadDriver();

        return () => {
            active = false;
        };
    }, []);

    const openLegal = (type) => {
        const contentMap = {
            driver_app: {
                title: 'Driver Application',
                Icon: UserPlus,
                description: 'Join the Appzeto 24 fleet as a certified driver.',
                content: `Appzeto 24 is always looking for professional, dedicated drivers to join our growing ecosystem. 

Steps to apply:
1. Ensure you have a valid Commercial Driving License.
2. Visit the Appzeto 24 Driver Onboarding center or use the Mobile App.
3. Submit required documents: Aadhaar, PAN, License, and Police Verification.
4. Complete the Biometric enrollment process at any authorized Service Center.
5. Once approved, you can start accepting rides and managing your earnings via the dashboard.`
            },
            terms: {
                title: 'Terms and Conditions',
                Icon: FileText,
                description: 'General rules for using the Appzeto 24 platform.',
                content: `By using the Appzeto 24 platform, you agree to comply with all applicable transport regulations and our safety standards.

Key Highlights:
• Professionalism: Drivers and Staff must maintain a high standard of service.
• Vehicle Readiness: All vehicles listed must be in active, roadworthy condition.
• Compliance: You must ensure all permits and insurance are valid.
• Platform Fees: Appzeto 24 charges a service fee for every successful booking handled.
• Account Security: You are responsible for keeping your credentials and biometric data secure.`
            },
            privacy: {
                title: 'Privacy Policy',
                Icon: Shield,
                description: 'How we handle your data and biometrics.',
                content: `Appzeto 24 takes data security seriously. We collect specific information to ensure safety and service quality.

Data Collected:
• Biometrics: Fingerprint hashes are stored encrypted (AES-256) for verification only. Raw images are never stored permanently.
• Location: Live GPS tracking is used during active bookings for safety.
• Contact: Phone and email are used for booking updates and support.
• Vehicle Data: Inspection logs and photos are kept for insurance purposes.

We do not share your biometric data with third-party advertising networks.`
            },
            refund: {
                title: 'Refund Policy',
                Icon: HandCoins,
                description: 'Cancellation and refund guidelines.',
                content: `Transparent refund rules for customers and partners.

Booking Cancellations:
• Customer-initiated: Refund varies based on how close the pickup time is.
• Operator-initiated: If a vehicle fails inspection, a full refund is processed to the customer.
• Service Center Fees: Fees for inspections are non-refundable once the inspection report is generated.

Processing Time: Refunds are typically credited back to the original payment method within 5-7 working days.`
            }
        };
        setLegalModal(contentMap[type]);
    };

    const handleLogout = () => {
        clearDriverAuthState();
        setIsLogoutOpen(false);
        navigate(`${routePrefix}/login`, { replace: true });
    };

    // Dynamic Section Data with Project-mapped Paths
    const driverName = useMemo(() => {
        if (!driver?.name) return 'Driver';
        return String(driver.name);
    }, [driver?.name]);

    const driverPhone = useMemo(() => driver?.phone || 'N/A', [driver?.phone]);
    const driverEmail = useMemo(() => driver?.email || 'N/A', [driver?.email]);
    const driverVehicle = useMemo(() => {
        const parts = [driver?.registerFor, driver?.vehicleType].filter(Boolean);
        return parts.length > 0 ? parts.join(' - ') : 'N/A';
    }, [driver?.registerFor, driver?.vehicleType]);
    const driverLocation = useMemo(() => driver?.city || 'N/A', [driver?.city]);
    const driverZone = useMemo(() => driver?.zone?.name || 'N/A', [driver?.zone?.name]);
    const driverNumber = useMemo(() => driver?.vehicleNumber || 'N/A', [driver?.vehicleNumber]);
    const driverColor = useMemo(() => driver?.vehicleColor || 'N/A', [driver?.vehicleColor]);
    const driverRating = useMemo(() => Number(driver?.rating || 0), [driver?.rating]);
    const routeBookingSubtitle = useMemo(() => {
        if (!routeBookingPreferences.enabled) {
            return 'Receive requests from your live location';
        }

        return routeBookingPreferences.label || formatRouteBookingLabel(routeBookingPreferences.coordinates);
    }, [routeBookingPreferences.coordinates, routeBookingPreferences.enabled, routeBookingPreferences.label]);
    const bankDetails = useMemo(() => normalizeBankDetails(driver?.bankDetails), [driver?.bankDetails]);
    const bankDetailsSubtitle = useMemo(() => {
        if (bankDetails.accountHolderName) return bankDetails.accountHolderName;
        if (bankDetails.upiId) return bankDetails.upiId;
        if (bankDetails.accountNumber) return `A/C ${bankDetails.accountNumber.slice(-4).padStart(bankDetails.accountNumber.length, '*')}`;
        return 'Add UPI, QR and bank account';
    }, [bankDetails.accountHolderName, bankDetails.accountNumber, bankDetails.upiId]);

    const hasProfileImage = Boolean(driver?.profileImage);

    const openBankDetails = () => {
        navigate(`${routePrefix}/profile/bank-details`);
    };

    const handleRouteBookingToggle = async () => {
        if (routeBookingBusy) {
            return;
        }

        if (routeBookingPreferences.enabled) {
            setRouteBookingBusy(true);
            setError('');
            try {
                const response = await updateDriverProfile({
                    routeBooking: {
                        enabled: false,
                    },
                });
                const nextRouteBooking = normalizeRouteBookingPreferences(
                    unwrapDriver(response)?.routeBooking || { enabled: false },
                );
                setRouteBookingPreferences(writeRouteBookingPreferences(nextRouteBooking));
            } catch (err) {
                setError(err?.response?.data?.message || err?.message || 'Could not update route booking.');
            } finally {
                setRouteBookingBusy(false);
            }
            return;
        }

        if (!navigator.geolocation) {
            setError('Location is not available on this device.');
            return;
        }

        setRouteBookingBusy(true);
        setError('');

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const nextCoordinates = [position.coords.longitude, position.coords.latitude];
                const nextLabel = formatRouteBookingLabel(nextCoordinates);

                try {
                    const response = await updateDriverProfile({
                        routeBooking: {
                            enabled: true,
                            coordinates: nextCoordinates,
                            label: nextLabel,
                        },
                    });
                    const nextRouteBooking = normalizeRouteBookingPreferences(
                        unwrapDriver(response)?.routeBooking || {
                            enabled: true,
                            coordinates: nextCoordinates,
                            label: nextLabel,
                        },
                    );
                    setRouteBookingPreferences(writeRouteBookingPreferences(nextRouteBooking));
                } catch (err) {
                    setError(err?.response?.data?.message || err?.message || 'Could not update route booking.');
                } finally {
                    setRouteBookingBusy(false);
                }
            },
            () => {
                setRouteBookingBusy(false);
                setError('Please allow location permission to enable route booking.');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
        );
    };

    const sections = [
        ...(isOwner ? [{
            title: 'Fleet Management',
            items: [
                { id: 'fleet', label: 'Manage Fleet', icon: <Car size={20} />, path: `${routePrefix}/vehicle-fleet` },
                { id: 'drivers', label: 'Manage Drivers', icon: <UserPlus size={20} />, path: `${routePrefix}/manage-drivers` },
            ]
        }] : []),
        {
            title: 'Your Account',
            items: [
                { id: 'personal', label: 'Personal Information', sub: driverPhone, icon: <User size={20} />, path: `${routePrefix}/edit-profile` },
                { id: 'wallet', label: 'Wallet', icon: <Wallet size={20} />, path: `${routePrefix}/wallet` },
                { id: 'bankDetails', label: 'Bank Details', sub: bankDetailsSubtitle, icon: <Landmark size={20} />, action: openBankDetails },
                ...(!isOwner ? [
                    { id: 'vehicle', label: 'My Vehicle', icon: <Car size={20} />, path: `${routePrefix}/vehicle-fleet` },
                ] : []),
                { id: 'docs', label: 'Documents', icon: <FileText size={20} />, path: `${routePrefix}/documents` },
                { id: 'history', label: 'Ride History', icon: <History size={20} />, path: `${routePrefix}/history` },
                { id: 'notifications', label: 'Notifications', icon: <Bell size={20} />, path: `${routePrefix}/notifications` },
            ]
        },
        {
            title: 'Benefits',
            items: [
                { id: 'refer', label: 'Refer & Earn', icon: <Gift size={20} />, path: `${routePrefix}/referral` },
                { id: 'incentives', label: 'Incentives', icon: <BadgePercent size={20} />, path: `${routePrefix}/incentives` },
                { id: 'sos', label: 'Emergency SOS', icon: <Shield size={20} />, path: `${routePrefix}/security` },
            ]
        },
        {
            title: 'Preferences',
            items: [
                { id: 'routeBooking', label: 'My Route Booking', sub: routeBookingSubtitle, icon: <Route size={20} />, type: 'toggle' },
            ]
        },
        {
            title: 'Legal & Support',
            items: [
                { id: 'driver_app', label: 'Driver Application', icon: <UserPlus size={20} />, action: () => openLegal('driver_app') },
                { id: 'terms', label: 'Terms & Conditions', icon: <FileText size={20} />, action: () => openLegal('terms') },
                { id: 'privacy', label: 'Privacy Policy', icon: <Shield size={20} />, action: () => openLegal('privacy') },
                { id: 'refund', label: 'Refund Policy', icon: <HandCoins size={20} />, action: () => openLegal('refund') },
            ]
        },
        {
            title: 'Danger Zone',
            items: [
                { id: 'deleteAccount', label: 'Delete Account', icon: <LogOut size={20} />, path: `${routePrefix}/delete-account` },
            ]
        }
    ];

    return (
        <div className="min-h-screen bg-white font-sans select-none overflow-x-hidden pb-32">
            {/* Header - Compact & Aligned */}
            <header className="px-5 pt-4 pb-4 border-b border-slate-50 sticky top-0 bg-white z-[60]">
                <div className="flex items-center justify-between mb-4">
                    <div className="w-8" />
                    <button onClick={() => navigate(`${routePrefix}/help-support`)} className="flex items-center gap-1.5 text-[#88B04B] font-bold text-[13px] tracking-wide">
                        <Info size={18} />
                        Help & Support
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <h2 className="text-[22px] font-bold text-slate-900 leading-tight">
                            {isLoading ? 'Loading...' : driverName}
                        </h2>
                        <div className="flex items-center gap-1.5 text-sky-500">
                            <Star size={14} fill="currentColor" />
                            <span className="text-[14px] font-bold">{driverRating.toFixed(1)} Rating</span>
                        </div>
                    </div>
                    {/* Integrated Profile Image */}
                    <div className="relative">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden group ${hasProfileImage ? 'bg-slate-900' : 'bg-slate-100 border border-slate-200'
                            }`}>
                            {hasProfileImage ? (
                                <img
                                    src={driver?.profileImage}
                                    alt={driverName}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <User size={30} className="text-slate-500" strokeWidth={1.8} />
                            )}
                        </div>
                        {hasProfileImage ? (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-lg border-2 border-white flex items-center justify-center shadow-sm">
                                <Check size={12} className="text-white" strokeWidth={4} />
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                    {error ? (
                        <p className="text-[11px] font-medium text-rose-500">{error}</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 text-left">
                            <div>
                                <p className="text-[10px] font-medium text-slate-400">Phone</p>
                                <p className="text-[12px] font-bold text-slate-900">{driverPhone}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-medium text-slate-400">Email</p>
                                <p className="text-[12px] font-bold text-slate-900 break-all">{driverEmail}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-medium text-slate-400">Vehicle Type</p>
                                <p className="text-[12px] font-bold text-slate-900">{driverVehicle}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-medium text-slate-400">City</p>
                                <p className="text-[12px] font-bold text-slate-900">{driverLocation}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-medium text-slate-400">Zone</p>
                                <p className="text-[12px] font-bold text-slate-900">{driverZone}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-medium text-slate-400">Vehicle No.</p>
                                <p className="text-[12px] font-bold text-slate-900">{driverNumber}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-medium text-slate-400">Color</p>
                                <p className="text-[12px] font-bold text-slate-900">{driverColor}</p>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* List Menu */}
            <main className="space-y-1">
                {sections.map((section, sIdx) => (
                    <div key={sIdx} className="pt-5">
                        <h3 className="px-6 text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">{section.title}</h3>
                        <div className="space-y-0">
                            {section.items.map((item) => (
                                <Motion.motion.div
                                    key={item.id}
                                    whileTap={item.type !== 'toggle' ? { backgroundColor: '#F8F9FA' } : {}}
                                    onClick={() => {
                                        if (item.action) item.action();
                                        else if (item.path) navigate(item.path, item.state ? { state: item.state } : undefined);
                                    }}
                                    className="flex items-center justify-between px-6 py-4 group cursor-pointer border-b border-slate-50/50"
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="text-slate-400 group-hover:text-slate-900 transition-colors">
                                            {item.icon}
                                        </div>
                                        <div>
                                            <h4 className="text-[15px] font-medium text-slate-800 tracking-tight">{item.label}</h4>
                                            {item.sub && <p className="text-[11px] text-slate-400 font-medium">{item.sub}</p>}
                                        </div>
                                    </div>
                                    {item.type === 'toggle' ? (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRouteBookingToggle(); }}
                                            disabled={routeBookingBusy}
                                            className={`w-10 h-5.5 rounded-full relative transition-colors duration-300 ${routeBookingPreferences.enabled ? 'bg-slate-900' : 'bg-slate-200'} ${routeBookingBusy ? 'opacity-70' : ''}`}
                                        >
                                            <Motion.motion.div
                                                animate={{ x: routeBookingPreferences.enabled ? 20 : 2 }}
                                                className="absolute top-1 w-3.5 h-3.5 rounded-full bg-white shadow-sm"
                                            />
                                        </button>
                                    ) : (
                                        <ChevronRight size={16} className="text-slate-200" />
                                    )}
                                </Motion.motion.div>
                            ))}
                        </div>
                    </div>
                ))}
            </main>

            {/* Owner Support Section */}
            <div className="px-6 py-4 mt-6">
                <div className="rounded-[28px] border border-slate-100 bg-slate-50/50 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-wider">Owner Support</h3>
                    </div>

                    <div className="space-y-5">
                        <a href="mailto:customercare@Appzeto 24.com" className="flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 transition-colors shadow-sm">
                                <Mail size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Support</p>
                                <p className="text-[14px] font-bold text-slate-800">customercare@Appzeto 24.com</p>
                            </div>
                        </a>

                        <a href="tel:" className="flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-sky-500 transition-colors shadow-sm">
                                <Phone size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Call Owner</p>
                                <p className="text-[14px] font-bold text-slate-800">91-93-911-911</p>
                            </div>
                        </a>
                    </div>
                </div>
            </div>

            {/* Sign Out Section */}
            <div className="px-6 py-6">
                <button
                    onClick={() => setIsLogoutOpen(true)}
                    className="flex items-center gap-3 text-rose-500 font-bold text-[13px] active:translate-x-1 transition-transform"
                >
                    <LogOut size={16} strokeWidth={2.5} />
                    Logout from Account
                </button>
            </div>

            <DriverBottomNav />

            <AnimatePresence>
                {isLogoutOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 px-5 backdrop-blur-sm">
                        <Motion.motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 12 }}
                            className="w-full max-w-xs rounded-[28px] bg-white p-6 shadow-2xl border border-slate-100"
                        >
                            <div className="space-y-2 text-center">
                                <h3 className="text-[18px] font-bold text-slate-900 tracking-tight">Logout</h3>
                                <p className="text-[13px] font-medium text-slate-500">
                                    Are you sure you want to logout?
                                </p>
                            </div>

                            <div className="mt-6 grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setIsLogoutOpen(false)}
                                    className="h-12 rounded-2xl border border-slate-200 text-slate-700 font-bold text-[13px]"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="h-12 rounded-2xl bg-rose-500 text-white font-bold text-[13px]"
                                >
                                    Logout
                                </button>
                            </div>
                        </Motion.motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Legal Modal */}
            <AnimatePresence>
                {legalModal && (
                    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 backdrop-blur-sm px-4 pb-8 sm:items-center sm:pb-0">
                        <Motion.motion.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            className="w-full max-w-lg overflow-hidden rounded-[32px] bg-white shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-8">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-slate-50 text-slate-900 shadow-sm border border-slate-100">
                                        <legalModal.Icon size={28} />
                                    </div>
                                    <button
                                        onClick={() => setLegalModal(null)}
                                        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="mt-6">
                                    <h3 className="text-2xl font-bold text-slate-950">{legalModal.title}</h3>
                                    <p className="mt-1 text-sm font-medium text-slate-500">{legalModal.description}</p>
                                </div>

                                <div className="mt-8 max-h-[40vh] overflow-y-auto pr-2">
                                    <div className="whitespace-pre-line text-sm leading-7 text-slate-700 font-medium">
                                        {legalModal.content}
                                    </div>
                                </div>

                                <button
                                    onClick={() => setLegalModal(null)}
                                    className="mt-8 w-full rounded-2xl bg-slate-950 py-4 text-sm font-bold text-white shadow-xl shadow-slate-200 transition hover:bg-slate-800 active:scale-95"
                                >
                                    Understood
                                </button>
                            </div>
                        </Motion.motion.div>
                        <div className="absolute inset-0 -z-10" onClick={() => setLegalModal(null)} />
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DriverProfile;
