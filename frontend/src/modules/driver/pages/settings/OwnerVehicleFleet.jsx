import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Bike,
  Car,
  ChevronRight,
  Edit3,
  FileText,
  LoaderCircle,
  Plus,
  Trash2,
  Truck,
  AlertCircle,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getCurrentDriver,
  getDriverVehicleTypes,
  deleteDriverVehicle,
  getOwnerFleetVehicles,
  updateOwnerFleetVehicle,
  deleteOwnerFleetVehicle,
} from "../../services/registrationService";
import DriverBottomNav from "../../../shared/components/DriverBottomNav";
import { uploadService } from "../../../../shared/services/uploadService";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-orange-300 focus:ring-2 focus:ring-orange-100";
const labelClass = "mb-2 block text-[12px] font-bold text-slate-700";

const unwrap = (response) => response?.data?.data || response?.data || response;

const getVehicleTypes = (response) => {
  const data = unwrap(response);
  return (
    data?.vehicle_types || data?.results || (Array.isArray(data) ? data : [])
  );
};

const getTypeLabel = (type) =>
  type?.name || type?.vehicle_type || type?.label || "Vehicle";

const getVehicleReason = (vehicle = {}) =>
  String(
    vehicle?.reason ||
      vehicle?.rejection_reason ||
      vehicle?.rejectionReason ||
      vehicle?.comment ||
      vehicle?.admin_comment ||
      "",
  ).trim();

const formatTransportType = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "both") return "Ride + Delivery";
  if (!normalized) return "Taxi";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatDispatchType = (value = "") => {
  const normalized = String(value || "normal").trim().toLowerCase();
  if (normalized === "bidding") return "Bidding";
  if (normalized === "pooling") return "Pooling";
  return "Normal";
};

const isReverificationPending = (vehicle = {}) => {
  if (String(vehicle.status || "").toLowerCase() !== "pending") {
    return false;
  }

  const createdAt = new Date(vehicle.createdAt || 0).getTime();
  const updatedAt = new Date(vehicle.updatedAt || 0).getTime();

  return Boolean(createdAt && updatedAt && updatedAt > createdAt);
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const iconFor = (iconType = "") => {
  const value = String(iconType).toLowerCase();
  if (value.includes("bike")) return Bike;
  if (
    value.includes("truck") ||
    value.includes("hcv") ||
    value.includes("lcv") ||
    value.includes("mcv")
  ) {
    return Truck;
  }
  return Car;
};

const OwnerVehicleFleet = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { vehicleId } = useParams();
  const routePrefix = useMemo(
    () =>
      location.pathname.startsWith("/taxi/owner")
        ? "/taxi/owner"
        : "/taxi/driver",
    [location.pathname],
  );
  const vehicleFleetRoute = `${routePrefix}/vehicle-fleet`;
  const [vehicles, setVehicles] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData] = useState({
    vehicleTypeId: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleNumber: "",
    vehicleColor: "",
    rcFile: null,
    existingRcUrl: "",
  });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // 'success' or 'error'
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      setMessage("");

      try {
        const [driverResponse, typeResponse, fleetResponse] = await Promise.all(
          [
            getCurrentDriver(),
            getDriverVehicleTypes(),
            getOwnerFleetVehicles(),
          ],
        );

        if (!active) return;

        const driver = unwrap(driverResponse);
        const types = getVehicleTypes(typeResponse);
        const fleetData = unwrap(fleetResponse);
        const fleetVehicles = fleetData?.results || [];

        setVehicleTypes(types);

        // Combine primary vehicle with fleet vehicles
        const allVehicles = [];

        // Add primary vehicle
        if (driver?.vehicleNumber) {
          allVehicles.push({
            _id: driver._id,
            vehicleTypeId: driver.vehicleTypeId,
            vehicleMake: driver.vehicleMake,
            vehicleModel: driver.vehicleModel,
            vehicleNumber: driver.vehicleNumber,
            vehicleColor: driver.vehicleColor,
            vehicleImage: driver.vehicleImage,
            isPrimary: true,
            status: "active",
          });
        }

        // Add fleet vehicles
        if (Array.isArray(fleetVehicles)) {
          fleetVehicles.forEach((fleetVehicle) => {
            allVehicles.push({
              _id: fleetVehicle._id || fleetVehicle.id,
              vehicleTypeId: fleetVehicle.vehicle_type_id,
              vehicleMake: fleetVehicle.car_brand,
              vehicleModel: fleetVehicle.car_model,
              vehicleNumber: fleetVehicle.license_plate_number,
              vehicleColor: fleetVehicle.car_color,
              vehicleImage: "",
              isPrimary: false,
              status: fleetVehicle.status || "pending",
              reason: getVehicleReason(fleetVehicle),
              rcDocument:
                fleetVehicle.rc_document ||
                fleetVehicle.documents?.rc ||
                fleetVehicle.documents?.document ||
                fleetVehicle.documents?.file ||
                "",
              createdAt: fleetVehicle.createdAt,
              updatedAt: fleetVehicle.updatedAt,
              isFleetVehicle: true,
            });
          });
        }

        setVehicles(allVehicles);
      } catch (error) {
        if (active) {
          setMessage(error.message || "Could not load vehicles.");
          setMessageType("error");
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
  }, []);

  const selectedType = useMemo(() => {
    return vehicleTypes.find(
      (type) => String(type._id || type.id) === String(formData.vehicleTypeId),
    );
  }, [formData.vehicleTypeId, vehicleTypes]);

  const ActiveIcon = iconFor(selectedType?.icon_types || selectedType?.name);
  const canSave =
    Boolean(formData.vehicleTypeId) &&
    Boolean(String(formData.vehicleMake || "").trim()) &&
    Boolean(String(formData.vehicleModel || "").trim()) &&
    Boolean(String(formData.vehicleNumber || "").trim()) &&
    Boolean(String(formData.vehicleColor || "").trim());

  const resetEditForm = () => {
    setEditingVehicle(null);
    setFormData({
      vehicleTypeId: "",
      vehicleMake: "",
      vehicleModel: "",
      vehicleNumber: "",
      vehicleColor: "",
      rcFile: null,
      existingRcUrl: "",
    });
  };

  const openEditor = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      vehicleTypeId: String(
        vehicle.vehicleTypeId?._id || vehicle.vehicleTypeId || "",
      ),
      vehicleMake: vehicle.vehicleMake || "",
      vehicleModel: vehicle.vehicleModel || "",
      vehicleNumber: vehicle.vehicleNumber || "",
      vehicleColor: vehicle.vehicleColor || "",
      rcFile: null,
      existingRcUrl: vehicle.rcDocument || "",
    });
    setIsEditing(true);
  };

  const closeEditor = (syncRoute = true) => {
    setIsEditing(false);
    resetEditForm();

    if (syncRoute && vehicleId) {
      navigate(vehicleFleetRoute, { replace: true });
    }
  };

  const handleEdit = (vehicle) => {
    if (!vehicle?._id) {
      openEditor(vehicle);
      return;
    }

    navigate(`${vehicleFleetRoute}/edit/${vehicle._id}`);
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!vehicleId) {
      if (isEditing || editingVehicle) {
        setIsEditing(false);
        resetEditForm();
      }
      return;
    }

    const matchedVehicle = vehicles.find(
      (vehicle) => String(vehicle._id) === String(vehicleId),
    );

    if (!matchedVehicle) {
      setMessage("That vehicle could not be found.");
      setMessageType("error");
      navigate(vehicleFleetRoute, { replace: true });
      return;
    }

    if (String(editingVehicle?._id) !== String(matchedVehicle._id) || !isEditing) {
      openEditor(matchedVehicle);
    }
  }, [
    editingVehicle,
    isEditing,
    isLoading,
    navigate,
    vehicleFleetRoute,
    vehicleId,
    vehicles,
  ]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleRcUpload = (event) => {
    const file = event.target.files?.[0] || null;
    setFormData((prev) => ({ ...prev, rcFile: file }));
  };

  const handleSave = async () => {
    if (!formData.vehicleTypeId) {
      setMessage("Select a vehicle type first.");
      setMessageType("error");
      return;
    }

    setIsSaving(true);
    setMessage("");
    const wasRejected =
      String(editingVehicle?.status || "").toLowerCase() === "rejected";

    try {
      let rcFileUrl = formData.existingRcUrl || "";

      if (formData.rcFile) {
        if (!String(formData.rcFile.type || "").startsWith("image/")) {
          throw new Error("RC upload currently supports image files only.");
        }

        const dataUrl = await fileToDataUrl(formData.rcFile);
        const uploadResult = await uploadService.uploadImage(
          dataUrl,
          "fleet-vehicle-documents",
        );
        rcFileUrl = uploadResult?.url || uploadResult?.secureUrl || "";
      }

      const response = await updateOwnerFleetVehicle(editingVehicle._id, {
        vehicleTypeId: formData.vehicleTypeId,
        vehicleMake: formData.vehicleMake,
        vehicleModel: formData.vehicleModel,
        vehicleNumber: formData.vehicleNumber,
        vehicleColor: formData.vehicleColor,
        rcFile: rcFileUrl || undefined,
      });
      const updated = unwrap(response);

      // Update the vehicle in the list, preserving fleet vehicle status
      setVehicles((prev) =>
        prev.map((v) =>
          v._id === editingVehicle._id
            ? {
                ...v,
                vehicleTypeId: updated.vehicle_type_id || formData.vehicleTypeId,
                vehicleMake: updated.car_brand || formData.vehicleMake,
                vehicleModel: updated.car_model || formData.vehicleModel,
                vehicleNumber: updated.license_plate_number || formData.vehicleNumber,
                vehicleColor: updated.car_color || formData.vehicleColor,
                vehicleImage: updated.vehicleImage || v.vehicleImage,
                // Preserve immutable properties
                isPrimary: v.isPrimary,
                status: updated.status || v.status,
                reason:
                  updated.status === "pending"
                    ? ""
                    : getVehicleReason(updated) || v.reason || "",
                rcDocument:
                  updated.rc_document ||
                  updated.documents?.rc ||
                  rcFileUrl ||
                  v.rcDocument ||
                  "",
                createdAt: updated.createdAt || v.createdAt,
                updatedAt: updated.updatedAt || v.updatedAt,
                isFleetVehicle: v.isFleetVehicle,
              }
            : v,
        ),
      );

      closeEditor();
      setMessage(
        wasRejected
          ? "Corrections saved. The vehicle has been sent again for verification."
          : "Vehicle updated successfully.",
      );
      setMessageType("success");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage(error.message || "Could not update vehicle.");
      setMessageType("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (vehicle) => {
    setDeleteConfirm(null);

    if (vehicles.length === 1) {
      setMessage("Cannot delete the last vehicle. Add another vehicle first.");
      setMessageType("error");
      return;
    }

    try {
      // Use appropriate delete function based on vehicle type
      if (vehicle.isFleetVehicle) {
        await deleteOwnerFleetVehicle(vehicle._id);
      } else {
        await deleteDriverVehicle(vehicle._id);
      }
      setVehicles((prev) => prev.filter((v) => v._id !== vehicle._id));
      setMessage("Vehicle deleted successfully.");
      setMessageType("success");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage(error.message || "Could not delete vehicle.");
      setMessageType("error");
    }
  };

  const handleAddFleetVehicle = () => {
    navigate(`${routePrefix}/add-vehicle`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoaderCircle size={32} className="animate-spin text-indigo-600" />
      </div>
    );
  }

  if (isEditing && editingVehicle) {
    const rejectionReason =
      String(editingVehicle.status || "").toLowerCase() === "rejected"
        ? getVehicleReason(editingVehicle) || "Rejected without a reason."
        : "";

    return (
      <div className="min-h-screen bg-[#f6f7fb] p-4 pb-32 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
                <span>{routePrefix === "/taxi/owner" ? "Owner" : "Driver"}</span>
                <ChevronRight size={12} />
                <span>Vehicle Fleet</span>
                <ChevronRight size={12} />
                <span className="text-slate-700">Edit Vehicle</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Edit Vehicle</h1>
              <p className="mt-1 text-sm text-slate-500">
                Update this fleet vehicle using the same structured form as the add vehicle flow.
              </p>
            </div>
            <button
              onClick={() => closeEditor()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back
            </button>
          </div>

          {message ? (
            <div
              className={`mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${
                messageType === "error"
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {message}
            </div>
          ) : null}

          {rejectionReason ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">
                Rejection Reason
              </p>
              <p className="mt-2 text-sm font-medium leading-6 text-red-700">
                {rejectionReason}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-bold text-slate-900">Vehicle Details</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Adjust the fleet vehicle details and keep them aligned with the approved catalog.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={labelClass}>Vehicle Type *</label>
                  <select
                    value={formData.vehicleTypeId}
                    onChange={(event) =>
                      handleChange("vehicleTypeId", event.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Select Vehicle Type</option>
                    {vehicleTypes.map((type) => (
                      <option key={type._id || type.id} value={type._id || type.id}>
                        {type.name || type.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    Pick the same service class this vehicle should run under.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Car Brand *</label>
                  <input
                    value={formData.vehicleMake}
                    onChange={(event) =>
                      handleChange("vehicleMake", event.target.value)
                    }
                    placeholder="Maruti, Hyundai, Tata..."
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Car Model *</label>
                  <input
                    value={formData.vehicleModel}
                    onChange={(event) =>
                      handleChange("vehicleModel", event.target.value)
                    }
                    placeholder="Swift, WagonR, Nexon..."
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>License Plate Number *</label>
                  <input
                    value={formData.vehicleNumber}
                    onChange={(event) =>
                      handleChange(
                        "vehicleNumber",
                        event.target.value.toUpperCase(),
                      )
                    }
                    placeholder="MP09AB1234"
                    className={`${inputClass} uppercase`}
                  />
                </div>

                <div>
                  <label className={labelClass}>Vehicle Color *</label>
                  <input
                    value={formData.vehicleColor}
                    onChange={(event) =>
                      handleChange("vehicleColor", event.target.value)
                    }
                    placeholder="White"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <h2 className="text-lg font-bold text-slate-900">Selected Vehicle Type</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    This mirrors the current admin vehicle type setup for this fleet entry.
                  </p>
                </div>

                {selectedType ? (
                  <div className="p-6">
                    <div className="rounded-[24px] border border-orange-100 bg-gradient-to-br from-white via-orange-50/40 to-slate-50 p-4 shadow-sm">
                      <div className="mb-4 flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm text-orange-500">
                          <ActiveIcon size={30} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-bold text-slate-900">
                            {selectedType.name || selectedType.label || "Vehicle"}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {selectedType.short_description ||
                              selectedType.description ||
                              "No short description available."}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Transport
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatTransportType(
                              selectedType.transport_type || selectedType.is_taxi,
                            )}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Dispatch
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatDispatchType(
                              selectedType.dispatch_type ||
                                selectedType.trip_dispatch_type,
                            )}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Capacity
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {selectedType.capacity || 0}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            Size
                          </p>
                          <p className="mt-2 text-sm font-semibold capitalize text-slate-900">
                            {selectedType.size || "Standard"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <Users size={16} className="text-orange-500" />
                          Service Notes
                        </div>
                        <div className="space-y-2 text-sm text-slate-600">
                          <p>
                            Share ride:{" "}
                            <span className="font-semibold text-slate-900">
                              {Number(selectedType.is_accept_share_ride || 0) === 1
                                ? "Enabled"
                                : "Not enabled"}
                            </span>
                          </p>
                          <p>
                            Status:{" "}
                            <span className="font-semibold text-slate-900">
                              {selectedType.active !== false &&
                              Number(selectedType.status ?? 1) !== 0
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </p>
                          {selectedType.description ? (
                            <p>{selectedType.description}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <FileText size={16} className="text-orange-500" />
                        Edit Summary
                      </div>
                      <div className="space-y-2 text-sm text-slate-600">
                        <p>
                          Brand & Model:{" "}
                          <span className="font-semibold text-slate-900">
                            {[formData.vehicleMake, formData.vehicleModel]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        </p>
                        <p>
                          Plate Number:{" "}
                          <span className="font-semibold text-slate-900">
                            {formData.vehicleNumber || "-"}
                          </span>
                        </p>
                        <p>
                          Color:{" "}
                          <span className="font-semibold text-slate-900">
                            {formData.vehicleColor || "-"}
                          </span>
                        </p>
                        <p>
                          Current Status:{" "}
                          <span className="font-semibold capitalize text-slate-900">
                            {editingVehicle.status || "pending"}
                          </span>
                        </p>
                        <p>
                          RC Document:{" "}
                          <span className="font-semibold text-slate-900">
                            {formData.rcFile?.name
                              ? `Replacing with ${formData.rcFile.name}`
                              : formData.existingRcUrl
                                ? "Current file attached"
                                : "No file attached"}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-sm">
                        <Car size={24} />
                      </div>
                      <p className="text-base font-semibold text-slate-800">
                        Select a vehicle type to preview it
                      </p>
                      <p className="mt-2 max-w-xs text-sm text-slate-500">
                        You'll see the transport mode, dispatch type, capacity, and service notes here.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5">
                  <h2 className="text-lg font-bold text-slate-900">RC Document</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Keep the vehicle proof up to date by reviewing the current RC file and uploading a replacement when needed.
                  </p>
                </div>

                <div className="space-y-4 p-6">
                  {formData.existingRcUrl ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                        Current RC File
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-emerald-800">
                          A document is already attached for this vehicle.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            window.open(
                              formData.existingRcUrl,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                          className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          View File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      No RC file is attached to this vehicle yet.
                    </div>
                  )}

                  <div>
                    <label className={labelClass}>Replace RC Document</label>
                    <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                      <label className="relative flex min-h-[180px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-slate-50">
                        <input
                          type="file"
                          className="absolute inset-0 cursor-pointer opacity-0"
                          onChange={handleRcUpload}
                          accept="image/*"
                        />
                        <div className="flex flex-col items-center gap-3 text-center">
                          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-sm">
                            <Upload size={20} />
                          </span>
                          <span className="text-sm font-semibold text-slate-700">
                            Upload new RC image
                          </span>
                          <span className="text-xs text-slate-400">
                            JPG, PNG, WEBP
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {formData.rcFile ? (
                    <div className="flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 p-4">
                      <div>
                        <p className="text-sm font-semibold text-orange-800">
                          {formData.rcFile.name}
                        </p>
                        <p className="text-xs text-orange-600">
                          This file will replace the current RC document after save.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            rcFile: null,
                          }))
                        }
                        className="rounded-xl p-2 text-orange-700 transition hover:bg-white hover:text-rose-500"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => closeEditor()}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSave || isSaving}
                  className="flex-1 rounded-2xl bg-[#ff6b4a] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
        <DriverBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 font-sans pb-20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-slate-200/50 shadow-sm">
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`${routePrefix}/profile`)}
                className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 flex items-center justify-center hover:shadow-md transition-all flex-shrink-0">
                <ArrowLeft size={16} className="text-indigo-600" />
              </motion.button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                    My Vehicles
                  </h1>
                  <div className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 flex-shrink-0">
                    <span className="text-[10px] sm:text-xs font-bold text-indigo-600 uppercase tracking-wider">
                      {vehicles.length}
                    </span>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 font-medium leading-tight">
                  Manage your fleet
                </p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleAddFleetVehicle}
              className="hidden sm:inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all"
            >
              <Plus size={16} />
              Add Fleet
            </motion.button>
          </div>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={handleAddFleetVehicle}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all sm:hidden"
          >
            <Plus size={16} />
            Add Fleet Vehicle
          </motion.button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Message Alert */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`mb-6 p-4 rounded-lg border flex items-center gap-3 ${
              messageType === "error"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-green-50 border-green-200 text-green-700"
            }`}>
            <AlertCircle size={18} />
            <p className="text-sm font-medium">{message}</p>
          </motion.div>
        )}

        {/* Vehicles List */}
        {vehicles.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-16 text-center shadow-sm">
            <Car size={48} className="mx-auto mb-4 text-gray-300" />
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              No vehicles yet
            </h3>
            <p className="mx-auto max-w-sm text-sm text-gray-600">
              No fleet vehicles are available right now. Add your first fleet vehicle so it can go into admin verification.
            </p>
            <button
              type="button"
              onClick={handleAddFleetVehicle}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:brightness-105"
            >
              <Plus size={16} />
              Add Fleet Vehicle
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {vehicles.map((vehicle, index) => {
              const VehicleIcon = iconFor(
                vehicleTypes.find(
                  (t) =>
                    String(t._id || t.id) ===
                    String(vehicle.vehicleTypeId?._id || vehicle.vehicleTypeId),
                )?.icon_types || "car",
              );

              const vehicleTypeLabel = getTypeLabel(
                vehicleTypes.find(
                  (t) =>
                    String(t._id || t.id) ===
                    String(vehicle.vehicleTypeId?._id || vehicle.vehicleTypeId),
                ),
              );
              const rejectionReason =
                String(vehicle.status || "").toLowerCase() === "rejected"
                  ? getVehicleReason(vehicle) || "Rejected without a reason."
                  : "";
              const reverificationPending = isReverificationPending(vehicle);
              const pendingLabel = reverificationPending
                ? "Re-verify Pending"
                : "Pending";

              return (
                <motion.div
                  key={vehicle._id || `vehicle-${index}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow flex items-start gap-4">
                  {/* Vehicle Icon */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg flex items-center justify-center border border-indigo-100 flex-shrink-0">
                    {vehicle.vehicleImage ? (
                      <img
                        src={vehicle.vehicleImage}
                        alt={vehicle.vehicleNumber}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <VehicleIcon size={28} className="text-indigo-400" />
                    )}
                  </div>

                  {/* Vehicle Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                        {vehicle.vehicleMake} {vehicle.vehicleModel}
                      </h3>
                      {vehicle.isPrimary && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold flex-shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          Primary
                        </div>
                      )}
                      {vehicle.isFleetVehicle &&
                        vehicle.status === "pending" && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 text-xs font-semibold flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-600 animate-pulse" />
                            {pendingLabel}
                          </div>
                        )}
                      {vehicle.isFleetVehicle &&
                        vehicle.status === "approved" && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Approved
                          </div>
                        )}
                      {vehicle.isFleetVehicle &&
                        vehicle.status === "rejected" && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                            Rejected
                          </div>
                        )}
                    </div>

                    <div className="text-xs sm:text-sm text-gray-600 space-y-0.5">
                      <p>
                        Type:{" "}
                        <span className="font-medium">{vehicleTypeLabel}</span>
                      </p>
                      <p>
                        Plate:{" "}
                        <span className="font-medium">
                          {vehicle.vehicleNumber}
                        </span>
                      </p>
                      <p>
                        Color:{" "}
                        <span className="font-medium capitalize">
                          {vehicle.vehicleColor}
                        </span>
                      </p>
                    </div>
                    {vehicle.isFleetVehicle && vehicle.status === "pending" && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">
                          {reverificationPending
                            ? "Re-Verification"
                            : "Verification Pending"}
                        </p>
                        <p className="mt-1 text-xs sm:text-sm font-medium text-amber-800">
                          {reverificationPending
                            ? "Corrections were submitted and this vehicle is back in the admin review queue."
                            : "This vehicle is waiting for admin approval before it becomes active."}
                        </p>
                      </div>
                    )}
                    {rejectionReason && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                        <p className="text-[11px] font-black uppercase tracking-widest text-red-600">
                          Rejection Reason
                        </p>
                        <p className="mt-1 text-xs sm:text-sm font-medium text-red-700">
                          {rejectionReason}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 flex-shrink-0">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleEdit(vehicle)}
                      className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">
                      <Edit3 size={16} />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setDeleteConfirm(vehicle)}
                      className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
                      <Trash2 size={16} />
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {deleteConfirm && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDeleteConfirm(null)}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mx-auto mb-4">
                  <AlertCircle
                    size={32}
                    className="text-red-600"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="text-center text-xl font-black text-slate-900 mb-2 uppercase">
                  Delete Vehicle?
                </h3>
                <p className="text-center text-slate-600 mb-8 font-semibold">
                  Are you sure? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-4 py-3 bg-slate-100 text-slate-900 rounded-xl font-bold hover:bg-slate-200 transition-colors uppercase">
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleDelete(deleteConfirm)}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors uppercase">
                    Delete
                  </motion.button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <div className="fixed inset-x-0 bottom-[84px] z-20 px-4 sm:hidden">
        <div className="mx-auto max-w-lg">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={handleAddFleetVehicle}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-slate-900 px-4 py-3.5 text-sm font-bold text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)]"
          >
            <Plus size={16} />
            Add Fleet Vehicle
          </motion.button>
        </div>
      </div>

      <DriverBottomNav />
    </div>
  );
};

export default OwnerVehicleFleet;
