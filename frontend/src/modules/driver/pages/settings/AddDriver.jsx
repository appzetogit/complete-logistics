import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, UserPlus, CheckCircle2, ChevronRight, Upload, X, ShieldCheck, Mail, Phone, MapPin, IndianRupee } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { createOwnerFleetDriver, getOwnerFleetDrivers, getOwnerFleetVehicles, getOwnerFleetZones, updateOwnerFleetDriver } from '../../services/registrationService';

const AddDriver = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { driverId } = useParams();
    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
    const isEditMode = Boolean(driverId);
    const [submitting, setSubmitting] = useState(false);
    const [loadingDriver, setLoadingDriver] = useState(false);
    const [loadingVehicles, setLoadingVehicles] = useState(false);
    const [loadingZones, setLoadingZones] = useState(false);
    const [error, setError] = useState('');
    const [fleetVehicles, setFleetVehicles] = useState([]);
    const [fleetZones, setFleetZones] = useState([]);
    const [step, setStep] = useState(1); // 1: Details, 2: Documents, 3: Success
    const [formData, setFormData] = useState({
        name: '',
        mobile: '',
        email: '',
        address: '',
        salary: '',
        assignedFleetVehicleId: '',
        zoneId: '',
        adhaarFile: null,
        licenseFile: null
    });

    useEffect(() => {
        if (!isEditMode) return;

        const stateDriver = location.state?.driver;
        if (stateDriver && String(stateDriver.id) === String(driverId)) {
            setFormData((prev) => ({
                ...prev,
                name: stateDriver.name || '',
                mobile: stateDriver.phone || '',
                email: stateDriver.email || '',
                address: stateDriver.address || '',
                salary: stateDriver.salary ? String(stateDriver.salary) : '',
                assignedFleetVehicleId: stateDriver.assignedVehicle?.vehicleId || '',
                zoneId: stateDriver.zone?.zoneId || '',
            }));
            return;
        }

        let active = true;
        setLoadingDriver(true);
        setError('');

        getOwnerFleetDrivers()
            .then((response) => {
                if (!active) return;
                const payload = response?.data?.data || response?.data || response;
                const match = (payload?.results || []).find((item) => String(item.id || item._id) === String(driverId));
                if (!match) {
                    setError('Driver not found.');
                    return;
                }

                setFormData((prev) => ({
                    ...prev,
                    name: match.name || '',
                    mobile: match.phone || '',
                    email: match.email || '',
                    address: match.city || '',
                    salary: match.salary ? String(match.salary) : '',
                    assignedFleetVehicleId: match.assignedVehicle?.vehicleId || '',
                    zoneId: match.zone?.zoneId || '',
                }));
            })
            .catch((err) => {
                if (!active) return;
                setError(err?.message || 'Unable to load driver details');
            })
            .finally(() => {
                if (active) setLoadingDriver(false);
            });

        return () => {
            active = false;
        };
    }, [driverId, isEditMode, location.state]);

    useEffect(() => {
        if (!isEditMode) return;

        let active = true;
        setLoadingVehicles(true);

        getOwnerFleetVehicles()
            .then((response) => {
                if (!active) return;
                const payload = response?.data?.data || response?.data || response;
                setFleetVehicles(Array.isArray(payload?.results) ? payload.results : []);
            })
            .catch((err) => {
                if (!active) return;
                setError((current) => current || err?.message || 'Unable to load owner vehicles');
            })
            .finally(() => {
                if (active) setLoadingVehicles(false);
            });

        return () => {
            active = false;
        };
    }, [isEditMode]);

    useEffect(() => {
        if (!isEditMode) return;

        let active = true;
        setLoadingZones(true);

        getOwnerFleetZones()
            .then((response) => {
                if (!active) return;
                const payload = response?.data?.data || response?.data || response;
                setFleetZones(Array.isArray(payload?.results) ? payload.results : []);
            })
            .catch((err) => {
                if (!active) return;
                setError((current) => current || err?.message || 'Unable to load owner zones');
            })
            .finally(() => {
                if (active) setLoadingZones(false);
            });

        return () => {
            active = false;
        };
    }, [isEditMode]);

    const handleFileUpload = (field, e) => {
        const file = e.target.files[0];
        if (file) setFormData(p => ({ ...p, [field]: file }));
    };

    const returnTo = useMemo(
        () =>
            typeof location.state?.returnTo === 'string' && location.state.returnTo.trim()
                ? location.state.returnTo.trim()
                : `${routePrefix}/manage-drivers`,
        [location.state?.returnTo]
    );

    const availableVehicles = useMemo(
        () =>
            fleetVehicles.filter((vehicle) => {
                const assignedDriverId = vehicle?.assignedDriver?.id;
                return !assignedDriverId || String(assignedDriverId) === String(driverId);
            }),
        [driverId, fleetVehicles]
    );

    const handleSubmit = async () => {
        if (submitting) {
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            const payload = {
                name: formData.name,
                phone: formData.mobile,
                email: formData.email,
                address: formData.address,
                city: formData.address,
                salary: Number(formData.salary || 0),
                assignedFleetVehicleId: formData.assignedFleetVehicleId || '',
                zoneId: formData.zoneId || '',
            };

            if (isEditMode) {
                await updateOwnerFleetDriver(driverId, payload);
            } else {
                await createOwnerFleetDriver(payload);
            }

            setStep(3);

            setTimeout(() => {
                navigate(returnTo, { replace: true });
            }, 5000);
        } catch (err) {
            setError(err?.message || 'Failed to submit driver request');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-white font-sans p-5 pt-8 select-none overflow-x-hidden pb-32">
            <header className="mb-6 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center text-slate-900 active:scale-95 transition-transform">
                    <ArrowLeft size={18} strokeWidth={2.5} />
                </button>
                <div className="flex gap-1">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`w-6 h-1 rounded-full transition-all ${step >= s ? 'bg-slate-900' : 'bg-slate-100'}`} />
                    ))}
                </div>
            </header>

            <main className="max-w-sm mx-auto">
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div 
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="space-y-1.5">
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">{isEditMode ? 'Edit Driver' : 'Driver Details'}</h1>
                                <p className="text-[11px] font-bold text-slate-400 opacity-80 uppercase tracking-widest leading-relaxed">{isEditMode ? 'Update fleet driver information and monthly salary' : 'Register a new driver for your fleet and set monthly salary'}</p>
                            </div>

                            <div className="space-y-4">
                                {loadingDriver ? (
                                    <p className="text-[11px] font-bold text-slate-400">Loading driver details...</p>
                                ) : null}
                                {error ? (
                                    <p className="text-[11px] font-bold text-rose-500">{error}</p>
                                ) : null}
                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Full Name</label>
                                    <input 
                                        value={formData.name}
                                        onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                                        placeholder="Enter driver's name"
                                        className="w-full bg-transparent border-none p-0 text-[13px] font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                    />
                                </div>

                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1.5"><Phone size={8} /> Mobile Number</label>
                                    <input 
                                        value={formData.mobile}
                                        onChange={(e) => setFormData(p => ({ ...p, mobile: e.target.value.replace(/\D/g, '') }))}
                                        placeholder="10-digit mobile number"
                                        maxLength={10}
                                        className="w-full bg-transparent border-none p-0 text-[13px] font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                    />
                                </div>

                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1.5"><Mail size={8} /> Email Address</label>
                                    <input 
                                        value={formData.email}
                                        onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                                        placeholder="driver@example.com"
                                        className="w-full bg-transparent border-none p-0 text-[13px] font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                    />
                                </div>

                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1.5"><MapPin size={8} /> Address</label>
                                    <textarea 
                                        rows={2}
                                        value={formData.address}
                                        onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
                                        placeholder="Full residential address"
                                        className="w-full bg-transparent border-none p-0 text-[13px] font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200 resize-none"
                                    />
                                </div>

                                <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1.5"><IndianRupee size={8} /> Monthly Salary</label>
                                    <input
                                        value={formData.salary}
                                        onChange={(e) => setFormData(p => ({ ...p, salary: e.target.value.replace(/[^\d.]/g, '') }))}
                                        placeholder="Enter monthly salary"
                                        inputMode="decimal"
                                        className="w-full bg-transparent border-none p-0 text-[13px] font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                    />
                                </div>

                                {isEditMode ? (
                                    <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Assigned Vehicle</label>
                                        <select
                                            value={formData.assignedFleetVehicleId}
                                            onChange={(e) => setFormData((p) => ({ ...p, assignedFleetVehicleId: e.target.value }))}
                                            disabled={loadingVehicles}
                                            className="w-full bg-transparent border-none p-0 text-[13px] font-black text-slate-900 focus:outline-none focus:ring-0"
                                        >
                                            <option value="">No vehicle assigned</option>
                                            {availableVehicles.map((vehicle) => {
                                                const optionId = String(vehicle.id || vehicle._id || '');
                                                const optionLabel = [
                                                    vehicle.car_brand,
                                                    vehicle.car_model,
                                                    vehicle.license_plate_number,
                                                ].filter(Boolean);

                                                return (
                                                    <option key={optionId} value={optionId}>
                                                        {optionLabel.join(' - ') || 'Unnamed vehicle'}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                            {loadingVehicles ? 'Loading fleet vehicles...' : 'Only this owner\'s unassigned vehicles are shown here.'}
                                        </p>
                                    </div>
                                ) : null}

                                {isEditMode ? (
                                    <div className="bg-slate-50 p-3.5 rounded-2xl shadow-sm">
                                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Assigned Zone</label>
                                        <select
                                            value={formData.zoneId}
                                            onChange={(e) => setFormData((p) => ({ ...p, zoneId: e.target.value }))}
                                            disabled={loadingZones}
                                            className="w-full bg-transparent border-none p-0 text-[13px] font-black text-slate-900 focus:outline-none focus:ring-0"
                                        >
                                            <option value="">No zone assigned</option>
                                            {fleetZones.map((zone) => {
                                                const optionId = String(zone.id || zone._id || '');
                                                return (
                                                    <option key={optionId} value={optionId}>
                                                        {zone.name || 'Unnamed zone'}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                            {loadingZones ? 'Loading zones...' : 'Only zones under this owner service location are shown here.'}
                                        </p>
                                    </div>
                                ) : null}
                            </div>

                            <div className="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-slate-50">
                                <button 
                                    onClick={() => {
                                        if (isEditMode) {
                                            handleSubmit();
                                            return;
                                        }
                                        setStep(2);
                                    }}
                                    disabled={submitting || loadingDriver || !formData.name || !formData.mobile}
                                    className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-black uppercase tracking-widest shadow-lg transition-all ${
                                        (formData.name && formData.mobile && !loadingDriver) 
                                        ? 'bg-slate-900 text-white shadow-slate-900/10' 
                                        : 'bg-slate-100 text-slate-300 pointer-events-none'
                                    }`}
                                >
                                    {isEditMode ? 'Save Driver' : 'Next: Documents'} {!isEditMode ? <ChevronRight size={16} strokeWidth={3} /> : <UserPlus size={16} strokeWidth={3} />}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div 
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="space-y-1.5">
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">Documents</h1>
                                <p className="text-[11px] font-bold text-slate-400 opacity-80 uppercase tracking-widest leading-relaxed">Identity and License verification</p>
                            </div>

                            <div className="space-y-5">
                                {error ? (
                                    <p className="text-[11px] font-bold text-rose-500">{error}</p>
                                ) : null}
                                {/* Adhaar Card */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Aadhar Card</label>
                                    <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 flex items-center justify-between hover:border-slate-900 transition-colors bg-slate-50/50">
                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFileUpload('adhaarFile', e)} />
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-300"><Upload size={18} /></div>
                                            <p className="text-[12px] font-black text-slate-900 uppercase">{formData.adhaarFile ? 'Aadhar Attached' : 'Select File'}</p>
                                        </div>
                                        {formData.adhaarFile && <ShieldCheck size={18} className="text-emerald-500" />}
                                    </div>
                                </div>

                                {/* Driving License */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Driving License</label>
                                    <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 flex items-center justify-between hover:border-slate-900 transition-colors bg-slate-50/50">
                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFileUpload('licenseFile', e)} />
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-300"><Upload size={18} /></div>
                                            <p className="text-[12px] font-black text-slate-900 uppercase">{formData.licenseFile ? 'License Attached' : 'Select File'}</p>
                                        </div>
                                        {formData.licenseFile && <ShieldCheck size={18} className="text-emerald-500" />}
                                    </div>
                                </div>
                            </div>

                            <div className="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-slate-50">
                                <button 
                                    onClick={handleSubmit}
                                    disabled={submitting || !formData.adhaarFile || !formData.licenseFile}
                                    className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-black uppercase tracking-widest shadow-lg transition-all ${
                                        (formData.adhaarFile && formData.licenseFile)
                                        ? 'bg-slate-900 text-white shadow-slate-900/10' 
                                        : 'bg-slate-100 text-slate-300 pointer-events-none'
                                    }`}
                                >
                                    {submitting ? 'Submitting...' : 'Register Driver'} <UserPlus size={16} strokeWidth={3} />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div 
                            key="step3"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center space-y-8 pt-20"
                        >
                            <div className="w-24 h-24 bg-emerald-500 rounded-[2.5rem] flex items-center justify-center text-white shadow-emerald-500/20 shadow-2xl relative">
                                <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }}><CheckCircle2 size={40} /></motion.div>
                            </div>

                            <div className="text-center space-y-3">
                                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">Pending!</h1>
                                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-relaxed px-10">
                                    {isEditMode ? 'Driver details updated successfully.' : <>Driver details sent to admin. Status will update in <span className="text-slate-900">5 seconds</span>.</>}
                                </p>
                            </div>

                            <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 5, ease: "linear" }}
                                    className="h-full bg-emerald-500"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default AddDriver;
