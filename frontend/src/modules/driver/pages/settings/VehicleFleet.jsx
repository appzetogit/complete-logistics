import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Bike, Camera, Car, CheckCircle2, Edit3, ImagePlus, LoaderCircle, Save, Truck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    getCurrentDriver,
    getDriverVehicleTypes,
    updateDriverVehicle,
} from '../../services/registrationService';
import { useImageUpload } from '../../../../shared/hooks/useImageUpload';
import DriverBottomNav from '../../../shared/components/DriverBottomNav';
import OwnerVehicleFleet from './OwnerVehicleFleet';
import CarIcon from '../../../../assets/icons/car.png';
import BikeIcon from '../../../../assets/icons/bike.png';
import AutoIcon from '../../../../assets/icons/auto.png';
import TruckIcon from '../../../../assets/icons/truck.png';
import EhcvIcon from '../../../../assets/icons/ehcv.png';
import HcvIcon from '../../../../assets/icons/hcv.png';
import LcvIcon from '../../../../assets/icons/LCV.png';
import McvIcon from '../../../../assets/icons/mcv.png';
import LuxuryIcon from '../../../../assets/icons/Luxury.png';
import PremiumIcon from '../../../../assets/icons/Premium.png';
import SuvIcon from '../../../../assets/icons/SUV.png';
import ScootyIcon from '../../../../assets/icons/scooty.png';
import HatchbackIcon from '../../../../assets/icons/Hatchback.png';
import BusIcon from '../../../../assets/icons/bus.png';
import MiniBusIcon from '../../../../assets/icons/mini_bus.png';

const unwrap = (response) => response?.data?.data || response?.data || response;
const VEHICLE_FLEET_DRAFT_KEY = 'driver_vehicle_fleet_draft';
const VEHICLE_FLEET_EDITING_KEY = 'driver_vehicle_fleet_editing';
const DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY = 'driver_vehicle_reapproval_pending';

const iconMap = {
    car: CarIcon,
    bike: BikeIcon,
    auto: AutoIcon,
    truck: TruckIcon,
    ehcb: EhcvIcon,
    HCV: HcvIcon,
    LCV: LcvIcon,
    MCV: McvIcon,
    Luxary: LuxuryIcon,
    premium: PremiumIcon,
    suv: SuvIcon,
    scooty: ScootyIcon,
    car_5_seater: HatchbackIcon,
    car_7_seater: SuvIcon,
    bus: BusIcon,
    mini_bus: MiniBusIcon,
};

const ICON_TYPE_ALIASES = {
    motor_bike: 'bike',
    motorbike: 'bike',
    hcv: 'HCV',
    lcv: 'LCV',
    mcv: 'MCV',
    luxary: 'Luxary',
    luxury: 'Luxary',
    mini_truck: 'truck',
    scooty: 'scooty',
    'car 5 seater': 'car_5_seater',
    'car 7 seater': 'car_7_seater',
    bus: 'bus',
    'mini bus': 'mini_bus',
};

const getVehicleTypes = (response) => {
    const data = unwrap(response);
    return data?.vehicle_types || data?.results || data?.data?.results || (Array.isArray(data) ? data : []);
};

const getTypeLabel = (type) => type?.name || type?.vehicle_type || type?.label || 'Vehicle';

const normalizeIconType = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return 'car';
    const lower = raw.toLowerCase();
    if (ICON_TYPE_ALIASES[lower]) return ICON_TYPE_ALIASES[lower];
    const exactKey = Object.keys(iconMap).find((key) => key.toLowerCase() === lower);
    return exactKey || 'car';
};

const getVehicleTypeImage = (type = {}) => (
    type?.image
    || type?.icon
    || type?.map_icon
    || iconMap[normalizeIconType(type?.icon_types || type?.icon_types_for || type?.name)]
    || CarIcon
);

const getDriverVehicleTypeId = (driver) => {
    if (!driver?.vehicleTypeId) {
        return '';
    }

    return String(driver.vehicleTypeId?._id || driver.vehicleTypeId);
};

const iconFor = (iconType = '') => {
    const value = String(iconType).toLowerCase();

    if (value.includes('bike')) {
        return Bike;
    }

    if (value.includes('truck') || value.includes('hcv') || value.includes('lcv') || value.includes('mcv')) {
        return Truck;
    }

    return Car;
};

const buildForm = (driver) => ({
    vehicleTypeId: getDriverVehicleTypeId(driver),
    vehicleMake: driver?.vehicleMake || '',
    vehicleModel: driver?.vehicleModel || '',
    vehicleNumber: driver?.vehicleNumber || '',
    vehicleColor: driver?.vehicleColor || '',
    vehicleImage: driver?.vehicleImage || '',
});

const buildComparableVehicleSnapshot = (value = {}) => ({
    vehicleTypeId: String(value?.vehicleTypeId || ''),
    vehicleMake: String(value?.vehicleMake || '').trim(),
    vehicleModel: String(value?.vehicleModel || '').trim(),
    vehicleNumber: String(value?.vehicleNumber || '').trim().toUpperCase(),
    vehicleColor: String(value?.vehicleColor || '').trim(),
    vehicleImage: String(value?.vehicleImage || '').trim(),
});

const readVehicleFleetDraft = () => {
    try {
        const raw = sessionStorage.getItem(VEHICLE_FLEET_DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const buildVisibleVehicleTypes = (allTypes, driver) => {
    const driverMode = String(driver?.registerFor || 'taxi').toLowerCase();
    const savedVehicleTypeId = getDriverVehicleTypeId(driver);

    const activeTypes = allTypes.filter((type) => {
        const isActive = type.active !== false && Number(type.status ?? 1) !== 0;
        const transportType = String(type.transport_type || type.is_taxi || 'taxi').toLowerCase();

        if (!isActive) {
            return false;
        }

        if (driverMode === 'both') {
            return true;
        }

        return transportType === driverMode || transportType === 'both' || transportType === 'all';
    });

    const activeMatchingTypes = activeTypes.length ? activeTypes : allTypes.filter((type) => type.active !== false && Number(type.status ?? 1) !== 0);

    if (!savedVehicleTypeId) {
        return activeMatchingTypes;
    }

    const savedType = allTypes.find((type) => String(type._id || type.id) === String(savedVehicleTypeId));

    if (!savedType) {
        return activeMatchingTypes;
    }

    const alreadyIncluded = activeMatchingTypes.some((type) => String(type._id || type.id) === String(savedVehicleTypeId));

    return alreadyIncluded ? activeMatchingTypes : [savedType, ...activeMatchingTypes];
};

const VehicleFleet = () => {
    const navigate = useNavigate();
    const [isOwner] = useState(() => String(localStorage.getItem('role') || 'driver').toLowerCase() === 'owner');
    const [driver, setDriver] = useState(null);
    const [vehicleTypes, setVehicleTypes] = useState([]);
    const [formData, setFormData] = useState(buildForm(null));
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');
    const galleryInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const {
        uploading: imageUploading,
        preview: imagePreview,
        handleFileChange: onVehicleImageChange,
        setPreview: setVehicleImagePreview,
    } = useImageUpload({
        folder: 'driver-vehicles',
        onSuccess: (url) => {
            setFormData((prev) => ({ ...prev, vehicleImage: url }));
        },
    });

    const selectedType = useMemo(() => {
        const selectedId = formData.vehicleTypeId || getDriverVehicleTypeId(driver);
        return vehicleTypes.find((type) => String(type._id || type.id) === String(selectedId));
    }, [driver, formData.vehicleTypeId, vehicleTypes]);

    const ActiveIcon = iconFor(selectedType?.icon_types || driver?.vehicleIconType || driver?.vehicleType);
    const activeVehicleName = getTypeLabel(selectedType) || driver?.vehicleType || 'Vehicle';
    const vehicleModel = [driver?.vehicleMake, driver?.vehicleModel].filter(Boolean).join(' ') || activeVehicleName;

    useEffect(() => {
        if (isOwner) {
            return undefined;
        }

        let active = true;

        const load = async () => {
            setIsLoading(true);
            setMessage('');

            try {
                const [driverResponse, typeResponse] = await Promise.all([
                    getCurrentDriver(),
                    getDriverVehicleTypes(),
                ]);

                if (!active) {
                    return;
                }

                const nextDriver = unwrap(driverResponse);
                const nextTypes = buildVisibleVehicleTypes(getVehicleTypes(typeResponse), nextDriver);

                const savedDraft = readVehicleFleetDraft();
                const wasEditing = sessionStorage.getItem(VEHICLE_FLEET_EDITING_KEY) === 'true';

                setDriver(nextDriver);
                setVehicleTypes(nextTypes);
                setFormData(savedDraft ? { ...buildForm(nextDriver), ...savedDraft } : buildForm(nextDriver));
                setVehicleImagePreview(savedDraft?.vehicleImage || nextDriver?.vehicleImage || null);
                setIsEditing(wasEditing);
            } catch (error) {
                if (active) {
                    setMessage(error.message || 'Could not load vehicle details.');
                }
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };

        load();

        return () => {
            active = false;
        };
    }, [isOwner]);

    useEffect(() => {
        sessionStorage.setItem(VEHICLE_FLEET_DRAFT_KEY, JSON.stringify(formData));
    }, [formData]);

    useEffect(() => {
        sessionStorage.setItem(VEHICLE_FLEET_EDITING_KEY, isEditing ? 'true' : 'false');
    }, [isEditing]);

    const handleChange = (field, value) => {
        setFormData((prev) => {
            if (field === 'vehicleTypeId' && String(prev.vehicleTypeId) !== String(value)) {
                setVehicleImagePreview(null);
                return {
                    vehicleTypeId: value,
                    vehicleMake: '',
                    vehicleModel: '',
                    vehicleNumber: '',
                    vehicleColor: '',
                    vehicleImage: '',
                };
            }

            return { ...prev, [field]: value };
        });
    };

    const handleVehicleImageSelected = (event) => {
        onVehicleImageChange(event);
    };

    const openVehicleGalleryPicker = () => {
        if (imageUploading) {
            return;
        }

        galleryInputRef.current?.click();
    };

    const openVehicleCameraPicker = () => {
        if (imageUploading) {
            return;
        }

        cameraInputRef.current?.click();
    };

    const handleSave = async () => {
        if (!formData.vehicleTypeId) {
            setMessage('Select a vehicle type first.');
            return;
        }

        const requiresReapproval =
            JSON.stringify(buildComparableVehicleSnapshot(buildForm(driver))) !==
            JSON.stringify(buildComparableVehicleSnapshot(formData));

        setIsSaving(true);
        setMessage('');

        try {
            const response = await updateDriverVehicle(formData);
            const nextDriver = unwrap(response);
            setDriver(nextDriver);
            setFormData(buildForm(nextDriver));
            setVehicleImagePreview(nextDriver?.vehicleImage || null);
            setIsEditing(false);
            if (nextDriver?.status === 'pending' || nextDriver?.approve === false || nextDriver?.vehicleApprovalRequested || requiresReapproval) {
                localStorage.setItem(DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY, 'true');
                setMessage(response?.data?.message || 'Vehicle updated and sent to admin for approval. Driver status is now pending.');
                sessionStorage.removeItem(VEHICLE_FLEET_DRAFT_KEY);
                sessionStorage.setItem(VEHICLE_FLEET_EDITING_KEY, 'false');
                navigate('/taxi/driver/registration-status', {
                    replace: true,
                    state: {
                        role: 'driver',
                        statusReason: 'vehicle-update',
                    },
                });
                return;
            } else {
                localStorage.removeItem(DRIVER_VEHICLE_REAPPROVAL_PENDING_KEY);
                setMessage(response?.data?.message || 'Vehicle updated successfully.');
            }
            sessionStorage.removeItem(VEHICLE_FLEET_DRAFT_KEY);
            sessionStorage.setItem(VEHICLE_FLEET_EDITING_KEY, 'false');
        } catch (error) {
            setMessage(error.message || 'Could not update vehicle.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            {isOwner ? (
                <OwnerVehicleFleet />
            ) : (
                <div className="min-h-screen bg-[#f8f9fb] font-sans p-6 pt-14 pb-32 overflow-x-hidden">
            <header className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/taxi/driver/profile')} className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center">
                    <ArrowLeft size={18} className="text-slate-900" />
                </button>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">My Vehicle</h1>
            </header>

            {isLoading ? (
                <div className="min-h-[420px] flex items-center justify-center text-slate-400">
                    <LoaderCircle size={28} className="animate-spin" />
                </div>
            ) : (
                <main className="space-y-6">
                    <div className="bg-slate-900 p-7 rounded-[2.5rem] text-white relative overflow-hidden shadow-xl border border-white/5">
                        <div className="relative z-10 space-y-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1.5 min-w-0 flex-1">
                                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/40">Primary Vehicle</h3>
                                    <p className="text-[22px] font-bold tracking-tight leading-none truncate">{vehicleModel}</p>
                                    <p className="text-[14px] font-semibold tracking-widest text-white/50 truncate uppercase mt-1">{driver?.vehicleNumber || 'Number not set'}</p>
                                    <p className="text-[11px] font-medium text-white/30 truncate">{activeVehicleName} • {driver?.vehicleColor || 'Color not set'}</p>
                                </div>
                                {driver?.vehicleImage ? (
                                    <div className="h-16 w-20 overflow-hidden rounded-2xl border border-white/10 shadow-lg shrink-0 bg-white/5">
                                        <img src={driver.vehicleImage} alt="Vehicle" className="h-full w-full object-cover" />
                                    </div>
                                ) : (
                                    <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white border border-white/10 shadow-lg shrink-0">
                                        <ActiveIcon size={26} />
                                    </div>
                                )}
                            </div>
                            <div className="inline-flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2.5 rounded-2xl">
                                <CheckCircle2 size={15} />
                                <span className="text-[11px] font-semibold uppercase tracking-wider">Map icon linked to selected type</span>
                            </div>
                        </div>
                    </div>

                    {message && (
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">{message}</p>
                    )}

                    <section className="space-y-5">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Configuration</h3>
                            <button
                                onClick={() => {
                                    setFormData(buildForm(driver));
                                    setIsEditing(true);
                                }}
                                className="text-[11px] font-bold text-blue-600 flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg"
                            >
                                <Edit3 size={13} /> Edit Details
                            </button>
                        </div>

                        <div className="bg-amber-50/50 border border-amber-100/50 rounded-2xl px-5 py-4">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-1">Dispatch Matching</p>
                            <p className="text-[12px] font-medium text-slate-500 leading-relaxed">
                                Update the primary vehicle here if requests are not reaching this driver. The system uses the selected vehicle type exactly for job distribution.
                            </p>
                        </div>

                    </section>
                </main>
            )}

            <AnimatePresence>
                {isEditing && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsEditing(false)}
                            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[90]"
                        />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                            className="fixed bottom-0 left-0 right-0 z-[100] max-h-[88vh] overflow-y-auto bg-white rounded-t-[2.5rem] p-6 pb-10 shadow-2xl max-w-lg mx-auto space-y-6"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Settings</p>
                                    <h2 className="text-2xl font-bold text-slate-900">Vehicle Details</h2>
                                </div>
                                <button onClick={() => setIsEditing(false)} className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500">
                                    <X size={22} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">Selection</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {vehicleTypes.map((type) => {
                                            const id = String(type._id || type.id);
                                            const TypeIcon = iconFor(type.icon_types || type.name);
                                            const selected = String(formData.vehicleTypeId) === id;
                                            const typeImage = getVehicleTypeImage(type);

                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    onClick={() => handleChange('vehicleTypeId', id)}
                                                    className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl transition-all min-h-[90px] border-2 ${
                                                        selected
                                                            ? 'bg-slate-950 border-slate-950 text-white shadow-xl shadow-slate-950/20'
                                                            : 'bg-white border-slate-100 text-slate-400 transition-colors hover:border-slate-200'
                                                    }`}
                                                >
                                                    {typeImage ? (
                                                        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                                                            selected ? 'bg-white/14' : 'bg-slate-50'
                                                        }`}>
                                                            <img
                                                                src={typeImage}
                                                                alt={getTypeLabel(type)}
                                                                className="h-8 w-8 object-contain"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <TypeIcon size={20} />
                                                    )}
                                                    <span className="text-[10px] font-bold uppercase tracking-wider leading-none text-center">{getTypeLabel(type)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl focus-within:border-slate-400 transition-colors">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Make</label>
                                        <input value={formData.vehicleMake} onChange={(e) => handleChange('vehicleMake', e.target.value)} placeholder="e.g. Suzuki" className="w-full bg-transparent border-none p-0 text-[15px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300" />
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl focus-within:border-slate-400 transition-colors">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Model</label>
                                        <input value={formData.vehicleModel} onChange={(e) => handleChange('vehicleModel', e.target.value)} placeholder="e.g. WagonR" className="w-full bg-transparent border-none p-0 text-[15px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300" />
                                    </div>
                                </div>

                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl focus-within:border-slate-400 transition-colors">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Plate Number</label>
                                    <input value={formData.vehicleNumber} onChange={(e) => handleChange('vehicleNumber', e.target.value.toUpperCase())} placeholder="e.g. MP 09 AB 1234" className="w-full bg-transparent border-none p-0 text-[15px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300 uppercase" />
                                </div>

                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl focus-within:border-slate-400 transition-colors">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Color</label>
                                    <input value={formData.vehicleColor} onChange={(e) => handleChange('vehicleColor', e.target.value)} placeholder="e.g. White, Black" className="w-full bg-transparent border-none p-0 text-[15px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300" />
                                </div>

                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Vehicle Image</label>
                                    <input
                                        ref={galleryInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={handleVehicleImageSelected}
                                        disabled={imageUploading}
                                    />
                                    <input
                                        ref={cameraInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="sr-only"
                                        onChange={handleVehicleImageSelected}
                                        disabled={imageUploading}
                                    />
                                    <div className="flex items-center gap-3">
                                        <div className="h-16 w-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shrink-0">
                                            {imagePreview || formData.vehicleImage ? (
                                                <img
                                                    src={imagePreview || formData.vehicleImage}
                                                    alt="Vehicle"
                                                    className={`h-full w-full object-cover ${imageUploading ? 'opacity-60' : ''}`}
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-slate-300">
                                                    <ActiveIcon size={22} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-1 flex-col gap-2">
                                            <button
                                                type="button"
                                                onClick={openVehicleGalleryPicker}
                                                disabled={imageUploading}
                                                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {imageUploading ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                                                {imageUploading ? 'Uploading...' : 'Choose From Gallery'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={openVehicleCameraPicker}
                                                disabled={imageUploading}
                                                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {imageUploading ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}
                                                {imageUploading ? 'Uploading...' : 'Use Camera'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={isSaving || imageUploading}
                                className="w-full h-16 bg-slate-950 text-white rounded-[1.5rem] flex items-center justify-center gap-3 text-[14px] font-bold uppercase tracking-widest shadow-xl shadow-slate-950/20 disabled:opacity-50"
                            >
                                {isSaving || imageUploading ? <LoaderCircle size={20} className="animate-spin" /> : <Save size={20} />}
                                Update Vehicle
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            <DriverBottomNav />
            </div>
            )}
        </>
    );
};

export default VehicleFleet;
