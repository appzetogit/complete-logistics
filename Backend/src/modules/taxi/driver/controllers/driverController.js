import crypto from "node:crypto";
import mongoose from "mongoose";
import QRCode from "qrcode";
import { Env, StandardCheckoutClient, StandardCheckoutPayRequest, PrefillUserLoginDetails } from "@phonepe-pg/pg-sdk-node";
import { env } from "../../../../config/env.js";
import { ApiError } from "../../../../utils/ApiError.js";
import { normalizePoint, toPoint } from "../../../../utils/geo.js";
import { Driver } from "../models/Driver.js";
import { BusDriver } from "../models/BusDriver.js";
import { DriverLoginSession } from "../models/DriverLoginSession.js";
import { WalletTransaction } from "../models/WalletTransaction.js";
import { WithdrawalRequest } from "../../admin/models/WithdrawalRequest.js";
import { Ride } from "../../user/models/Ride.js";
import { BusBooking } from "../../user/models/BusBooking.js";
import { BusSeatHold } from "../../user/models/BusSeatHold.js";
import { Owner } from "../../admin/models/Owner.js";
import { BusService } from "../../admin/models/BusService.js";
import { PoolingVehicle } from "../../admin/models/PoolingVehicle.js";
import { PoolingBooking } from "../../admin/models/PoolingBooking.js";
import { ServiceLocation } from "../../admin/models/ServiceLocation.js";
import { ServiceStore } from "../../admin/models/ServiceStore.js";
import { ServiceCenterStaff } from "../../admin/models/ServiceCenterStaff.js";
import { Vehicle } from "../../admin/models/Vehicle.js";
import { RentalVehicleType } from "../../admin/models/RentalVehicleType.js";
import { RentalBookingRequest } from "../../admin/models/RentalBookingRequest.js";
import { CustomerBiometricProfile } from "../../admin/models/CustomerBiometricProfile.js";
import { AdminBusinessSetting } from "../../admin/models/AdminBusinessSetting.js";
import { Notification } from "../../admin/promotions/models/Notification.js";
import { FleetVehicle } from "../../admin/models/FleetVehicle.js";
import { Zone } from "../models/Zone.js";
import { uploadDataUrlToCloudinary } from "../../../../utils/cloudinaryUpload.js";
import {
  comparePassword,
  hashPassword,
  signAccessToken,
} from "../services/authService.js";
import { cancelScheduledRideByDriver, emitToDriver } from "../../services/dispatchService.js";
import { notifyLateAvailableDriver } from "../../services/dispatchService.js";
import { findZoneByPickup } from "../services/locationService.js";
import { listDriverServiceLocations } from "../services/serviceLocationService.js";
import {
  applyDriverWalletAdjustment,
  ensureDriverWalletCanAcceptRide,
  serializeDriverWallet,
  topUpDriverWallet,
} from "../services/walletService.js";
import {
  startDriverLoginOtp,
  verifyDriverLoginOtp,
} from "../services/loginOtpService.js";
import {
  completePoolingDriverOnboarding,
  getPoolingDriverOnboardingSession,
  savePoolingDriverOnboardingDetails,
  startPoolingDriverOnboarding,
  verifyPoolingDriverOnboardingOtp,
} from "../services/poolingOnboardingService.js";
import { verifyAccessToken } from "../../services/tokenService.js";
import { clearDriverActiveRideIfStale } from "../../services/rideService.js";
import { getWalletSettings } from "../../services/appSettingsService.js";
import { RIDE_LIVE_STATUS, RIDE_STATUS } from "../../constants/index.js";
import {
  createRentalVehicleType,
  createBusService,
  deleteBusService,
  deleteRentalVehicleType,
  ensureThirdPartySettings,
  listDriverNeededDocuments,
  listDriverVehicleFieldTemplates,
  listBusServices,
  listOwnerNeededDocuments,
  listRentalVehicleTypes,
  updateBusService,
  updateRentalVehicleType,
} from "../../admin/services/adminService.js";
import { resolveConfiguredGatewayCredentials } from "../../services/paymentGatewayService.js";
import { assignPushTokenToEntity } from "../../services/pushTokenService.js";
import {
  completeDriverOnboarding,
  getDriverOnboardingSession,
  getDriverOnboardingSignupOptions,
  saveDriverDocuments,
  verifyDriverOnboardingLicenseDocument,
  saveDriverRoleDetails,
  setDriverOnboardingRole,
  saveDriverPersonalDetails,
  saveDriverReferral,
  saveDriverVehicle,
  verifyDriverVehicleRc,
  startDriverOnboarding,
  verifyDriverOtp,
} from "../services/onboardingService.js";
import {
  buildDriverTodaySummaryFromDocument,
  syncDriverTodaySummaryDocument,
} from "../services/driverTodaySummaryService.js";
import {
  buildPaymentRequestContext,
  logPaymentDiagnostic,
  summarizeCheckoutUrl,
  summarizePhonePeCredentialMeta,
  summarizePhonePePayload,
  summarizePhonePeRequestBody,
} from "../../services/paymentDiagnostics.js";
import { verifyBankAccountWithRecharge, verifyDrivingLicenseWithRecharge, verifyGstinWithRecharge, verifyPanWithRecharge, verifyRcWithRecharge, verifyUpiWithRecharge } from "../../services/rechargeVerificationService.js";

const generateDriverReferralCode = (driver) => {
  const idPart = String(driver?._id || "")
    .slice(-6)
    .toUpperCase();
  const phonePart = String(driver?.phone || "").slice(-4);
  return `DRV${phonePart}${idPart}`.replace(/\W/g, "");
};

const MAX_EMERGENCY_CONTACTS = 5;
const EMERGENCY_CONTACT_NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const DRIVER_NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RAZORPAY_QR_MAX_AMOUNT = 500000;
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BUS_DAY_OPTIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BUS_DRIVER_SCHEDULE_DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BUS_LIVE_TRAIL_MAX_DISTANCE_KM = 2.5;
const BUS_LIVE_TRAIL_MAX_POINTS = 80;
const BIOMETRIC_FINGER_CODES = [
  "LEFT_THUMB",
  "LEFT_INDEX",
  "LEFT_MIDDLE",
  "LEFT_RING",
  "LEFT_LITTLE",
  "RIGHT_THUMB",
  "RIGHT_INDEX",
  "RIGHT_MIDDLE",
  "RIGHT_RING",
  "RIGHT_LITTLE",
];
const BIOMETRIC_CAPTURE_SOURCES = ["phone_sensor", "usb_scanner", "bluetooth_scanner", "manual", "unknown"];
const BIOMETRIC_ENROLLMENT_MODES = ["thumbs_only", "optional", "all_ten"];
const BIOMETRIC_STATUSES = ["not_started", "in_progress", "completed", "verified"];

const resolveRechargeVerificationState = (providerResponse = {}, fallbackMessage = "") => {
  const normalizedStatus = String(providerResponse?.status ?? "").trim().toLowerCase();
  const message = String(
    providerResponse?.cardData?.response?.message ||
    providerResponse?.cardData?.message ||
    providerResponse?.msg ||
    providerResponse?.message ||
    fallbackMessage ||
    "",
  ).trim();
  const lowerMessage = message.toLowerCase();
  const explicitPending =
    ["pending", "processing", "queued", "in_progress", "in progress"].includes(normalizedStatus) ||
    lowerMessage.includes("pending") ||
    lowerMessage.includes("processing") ||
    lowerMessage.includes("try after sometime") ||
    lowerMessage.includes("please try after sometime");
  const succeeded = normalizedStatus === "1" || normalizedStatus === "success" || normalizedStatus === "verified" || Number(providerResponse?.status || 0) === 1;

  return {
    succeeded,
    status: succeeded ? "verified" : explicitPending ? "pending" : "failed",
    message,
  };
};
const BIOMETRIC_MIN_MATCH_SCORE = 80;

const toIstDayKey = (value = new Date()) =>
  new Date(new Date(value).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const toCleanString = (value = "") => String(value || "").trim();
const normalizeBoolean = (value) => value === true || value === "true" || value === 1 || value === "1";
const normalizeBiometricMatchScore = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  if (numericValue > 0 && numericValue <= 1) {
    return Number((numericValue * 100).toFixed(2));
  }

  return numericValue;
};
const normalizeBusPassengerPhone = (value = "") =>
  String(value || "")
    .replace(/\D/g, "")
    .trim()
    .slice(-10);
const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase();
const BUS_DRIVER_NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;

const normalizeFleetVehicleDocumentValue = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const url = String(value || "").trim();
    if (!url) {
      return null;
    }

    return {
      previewUrl: url,
      secureUrl: url,
      uploaded: true,
    };
  }

  if (typeof value !== "object") {
    return null;
  }

  const previewUrl = String(
    value.previewUrl ||
      value.secureUrl ||
      value.url ||
      value.imageUrl ||
      value.image ||
      value.fileUrl ||
      value.document ||
      value.file ||
      "",
  ).trim();

  if (!previewUrl) {
    return null;
  }

  return {
    ...value,
    previewUrl,
    secureUrl: String(value.secureUrl || previewUrl).trim(),
    uploaded: value.uploaded ?? true,
  };
};

const normalizeFleetVehicleDocuments = (documents = {}, rcFile = "") => {
  const normalizedDocuments = {};

  if (documents && typeof documents === "object" && !Array.isArray(documents)) {
    for (const [key, value] of Object.entries(documents)) {
      const normalizedValue = normalizeFleetVehicleDocumentValue(value);
      if (normalizedValue) {
        normalizedDocuments[String(key).trim()] = normalizedValue;
      }
    }
  }

  const normalizedRcFile = String(rcFile || "").trim();
  if (normalizedRcFile && !normalizedDocuments.rc) {
    normalizedDocuments.rc = normalizeFleetVehicleDocumentValue(normalizedRcFile);
  }

  return normalizedDocuments;
};

const serializeDriverRouteBooking = (routeBooking = {}) => {
  const coordinates = Array.isArray(routeBooking?.anchorLocation?.coordinates)
    ? routeBooking.anchorLocation.coordinates
    : [];

  return {
    enabled: Boolean(routeBooking?.enabled && coordinates.length === 2),
    coordinates: coordinates.length === 2 ? coordinates : null,
    label: String(routeBooking?.label || "").trim(),
    updatedAt: routeBooking?.updatedAt || null,
  };
};

const serializeDriverBankDetails = (bankDetails = {}) => ({
  accountHolderName: String(bankDetails?.accountHolderName || "").trim(),
  upiId: String(bankDetails?.upiId || "").trim(),
  qrCodeImage: String(bankDetails?.qrCodeImage || "").trim(),
  accountNumber: String(bankDetails?.accountNumber || "").trim(),
  ifsc: String(bankDetails?.ifsc || "").trim().toUpperCase(),
  branchName: String(bankDetails?.branchName || "").trim(),
  verificationStatus: String(bankDetails?.verificationStatus || "").trim(),
  verificationMode: String(bankDetails?.verificationMode || "").trim(),
  verificationMessage: String(bankDetails?.verificationMessage || "").trim(),
  verificationReferenceId: String(bankDetails?.verificationReferenceId || "").trim(),
  verifiedBankName: String(bankDetails?.verifiedBankName || "").trim(),
  verifiedBranchName: String(bankDetails?.verifiedBranchName || "").trim(),
  verifiedAccountHolderName: String(bankDetails?.verifiedAccountHolderName || "").trim(),
  verifiedAt: bankDetails?.verifiedAt || null,
  upiVerificationStatus: String(bankDetails?.upiVerificationStatus || "").trim(),
  upiVerificationMode: String(bankDetails?.upiVerificationMode || "").trim(),
  upiVerificationMessage: String(bankDetails?.upiVerificationMessage || "").trim(),
  upiVerificationReferenceId: String(bankDetails?.upiVerificationReferenceId || "").trim(),
  upiVerifiedName: String(bankDetails?.upiVerifiedName || "").trim(),
  upiAccountIfsc: String(bankDetails?.upiAccountIfsc || "").trim(),
  upiAccountType: String(bankDetails?.upiAccountType || "").trim(),
  upiVerifiedAt: bankDetails?.upiVerifiedAt || null,
  updatedAt: bankDetails?.updatedAt || null,
});

const normalizeDriverBankDetails = (payload = {}, existing = {}) => {
  const next = serializeDriverBankDetails(existing);
  let shouldResetVerification = false;

  if (Object.prototype.hasOwnProperty.call(payload, "accountHolderName")) {
    const accountHolderName = String(payload.accountHolderName || "").trim().slice(0, 120);
    shouldResetVerification = shouldResetVerification || accountHolderName !== next.accountHolderName;
    next.accountHolderName = accountHolderName;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "upiId")) {
    const upiId = String(payload.upiId || "").trim().toLowerCase();
    if (upiId && !/^[a-z0-9.\-_]{2,}@[a-z0-9.\-_]{2,}$/i.test(upiId)) {
      throw new ApiError(400, "Enter a valid UPI ID");
    }
    if (upiId !== next.upiId) {
      next.upiVerificationStatus = "";
      next.upiVerificationMode = "";
      next.upiVerificationMessage = "";
      next.upiVerificationReferenceId = "";
      next.upiVerifiedName = "";
      next.upiAccountIfsc = "";
      next.upiAccountType = "";
      next.upiVerifiedAt = null;
    }
    next.upiId = upiId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "qrCodeImage")) {
    next.qrCodeImage = String(payload.qrCodeImage || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, "accountNumber")) {
    const accountNumber = String(payload.accountNumber || "").replace(/\s/g, "");
    if (accountNumber && !/^\d{6,20}$/.test(accountNumber)) {
      throw new ApiError(400, "Account number must be 6 to 20 digits");
    }
    shouldResetVerification = shouldResetVerification || accountNumber !== next.accountNumber;
    next.accountNumber = accountNumber;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "ifsc")) {
    const ifsc = String(payload.ifsc || "").trim().toUpperCase();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      throw new ApiError(400, "Enter a valid IFSC code");
    }
    shouldResetVerification = shouldResetVerification || ifsc !== next.ifsc;
    next.ifsc = ifsc;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "branchName")) {
    next.branchName = String(payload.branchName || "").trim().slice(0, 120);
  }

  if (shouldResetVerification) {
    next.verificationStatus = "";
    next.verificationMode = "";
    next.verificationMessage = "";
    next.verificationReferenceId = "";
    next.verifiedBankName = "";
    next.verifiedBranchName = "";
    next.verifiedAccountHolderName = "";
    next.verifiedAt = null;
  }

  next.updatedAt = new Date();
  return next;
};

const buildDriverBankVerificationRequestId = (driver) =>
  `BANK-${String(driver?._id || "").slice(-6)}-${Date.now()}`;

const buildDriverLicenseVerificationRequestId = (driver) =>
  `DL-${String(driver?._id || "").slice(-6)}-${Date.now()}`;

const buildDriverPanVerificationRequestId = (driver) =>
  `PAN-${String(driver?._id || "").slice(-6)}-${Date.now()}`;

const buildDriverUpiVerificationRequestId = (driver) =>
  `UPI-${String(driver?._id || "").slice(-6)}-${Date.now()}`;

const buildDriverGstinVerificationRequestId = (driver) =>
  `GST-${String(driver?._id || "").slice(-6)}-${Date.now()}`;

const buildDriverRcVerificationRequestId = (driver) =>
  `RC-${String(driver?._id || "").slice(-6)}-${Date.now()}`;

const validateBusPassengerName = (value = "") => {
  if (!BUS_DRIVER_NAME_REGEX.test(String(value || "").trim())) {
    throw new ApiError(400, "Passenger name is required");
  }
};

const validateBusPassengerPhone = (value = "") => {
  if (!/^\d{10}$/.test(String(value || "").trim())) {
    throw new ApiError(400, "Passenger phone must be a valid 10-digit number");
  }
};

const validateBusPassengerEmail = (value = "") => {
  if (value && !EMAIL_REGEX.test(String(value || "").trim())) {
    throw new ApiError(400, "Passenger email is invalid");
  }
};

const normalizeBusDriverSchedule = (schedule = {}, index = 0) => ({
  id: toCleanString(schedule.id) || `schedule-${Date.now()}-${index}`,
  label: toCleanString(schedule.label),
  departureTime: toCleanString(schedule.departureTime),
  arrivalTime: toCleanString(schedule.arrivalTime),
  activeDays: Array.isArray(schedule.activeDays)
    ? [...new Set(schedule.activeDays.map((day) => toCleanString(day)).filter((day) => BUS_DRIVER_SCHEDULE_DAY_OPTIONS.includes(day)))]
    : [],
  status: ["active", "paused", "draft"].includes(toCleanString(schedule.status))
    ? toCleanString(schedule.status)
    : "active",
});

const validateBusDriverSchedules = (schedules = []) => {
  if (!Array.isArray(schedules) || schedules.length === 0) {
    throw new ApiError(400, "At least one schedule is required");
  }

  const ids = new Set();

  schedules.forEach((schedule, index) => {
    if (!schedule.id) {
      throw new ApiError(400, `Schedule ${index + 1} is missing an id`);
    }

    if (ids.has(schedule.id)) {
      throw new ApiError(400, "Schedule ids must be unique");
    }
    ids.add(schedule.id);

    if (!schedule.label) {
      throw new ApiError(400, `Schedule ${index + 1} label is required`);
    }

    if (!/^\d{2}:\d{2}$/.test(schedule.departureTime)) {
      throw new ApiError(400, `Schedule ${index + 1} departure time is invalid`);
    }

    if (!/^\d{2}:\d{2}$/.test(schedule.arrivalTime)) {
      throw new ApiError(400, `Schedule ${index + 1} arrival time is invalid`);
    }
  });
};

const normalizeBusTravelDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new ApiError(400, "Travel date is required");
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "Travel date is invalid");
  }

  return parsed.toISOString().slice(0, 10);
};

const normalizeFiniteNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBusTrackingPoint = (value, fieldName = "location") => {
  const lat = normalizeFiniteNumber(value?.lat ?? value?.latitude);
  const lng = normalizeFiniteNumber(value?.lng ?? value?.longitude ?? value?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(400, `${fieldName} must include valid lat and lng values`);
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ApiError(400, `${fieldName} coordinates are out of range`);
  }

  const heading = normalizeFiniteNumber(value?.heading);
  const accuracyMeters = normalizeFiniteNumber(value?.accuracyMeters ?? value?.accuracy);
  const rawSpeedKmph = normalizeFiniteNumber(value?.speedKmph);
  const rawSpeedMs = normalizeFiniteNumber(value?.speed);
  const speedKmph =
    rawSpeedKmph !== null
      ? rawSpeedKmph
      : rawSpeedMs !== null
        ? Number(rawSpeedMs * 3.6)
        : null;

  return {
    lat,
    lng,
    recordedAt: value?.recordedAt ? new Date(value.recordedAt) : new Date(),
    accuracyMeters,
    heading,
    speedKmph,
  };
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceKm = (pointA, pointB) => {
  if (!pointA || !pointB) {
    return 0;
  }

  const lat1 = normalizeFiniteNumber(pointA.lat);
  const lng1 = normalizeFiniteNumber(pointA.lng);
  const lat2 = normalizeFiniteNumber(pointB.lat);
  const lng2 = normalizeFiniteNumber(pointB.lng);

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const trimBusLiveTrail = (points = []) => {
  const normalized = (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
    .slice(-BUS_LIVE_TRAIL_MAX_POINTS);

  if (normalized.length <= 2) {
    return normalized;
  }

  const kept = [normalized[normalized.length - 1]];
  let distanceKm = 0;

  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    const candidate = normalized[index];
    const nextPoint = kept[kept.length - 1];
    distanceKm += calculateDistanceKm(candidate, nextPoint);

    if (distanceKm > BUS_LIVE_TRAIL_MAX_DISTANCE_KM) {
      break;
    }

    kept.push(candidate);
  }

  return kept.reverse();
};

const serializeBusLiveTracking = (liveTracking = {}) => {
  const serializePoint = (point) =>
    point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))
      ? {
          lat: Number(point.lat),
          lng: Number(point.lng),
          recordedAt: point.recordedAt || null,
          accuracyMeters:
            point.accuracyMeters === null || point.accuracyMeters === undefined
              ? null
              : Number(point.accuracyMeters),
          heading:
            point.heading === null || point.heading === undefined ? null : Number(point.heading),
          speedKmph:
            point.speedKmph === null || point.speedKmph === undefined
              ? null
              : Number(point.speedKmph),
        }
      : null;

  return {
    status: String(liveTracking?.status || "idle"),
    scheduleId: String(liveTracking?.scheduleId || "").trim(),
    travelDate: String(liveTracking?.travelDate || "").trim(),
    startedAt: liveTracking?.startedAt || null,
    endedAt: liveTracking?.endedAt || null,
    lastUpdatedAt: liveTracking?.lastUpdatedAt || null,
    currentLocation: serializePoint(liveTracking?.currentLocation),
    recentPath: (Array.isArray(liveTracking?.recentPath) ? liveTracking.recentPath : [])
      .map(serializePoint)
      .filter(Boolean),
    totalDistanceKm: Number(liveTracking?.totalDistanceKm || 0),
  };
};

const ensureBusDriverAssignment = async (driverId) => {
  const busDriver = await BusDriver.findById(driverId);

  if (!busDriver) {
    throw new ApiError(404, "Bus driver not found");
  }

  if (!busDriver.assignedBusServiceId) {
    throw new ApiError(404, "No bus is assigned to this driver");
  }

  return busDriver;
};

const getBusTrackingContext = async (driverId) => {
  const busDriver = await ensureBusDriverAssignment(driverId);
  const busService = await BusService.findById(busDriver.assignedBusServiceId);

  if (!busService) {
    throw new ApiError(404, "Assigned bus service not found");
  }

  return { busDriver, busService };
};

const getBusTravelDayLabel = (travelDate) => BUS_DAY_OPTIONS[new Date(travelDate).getUTCDay()] || "Mon";

const findBusSchedule = (busService, scheduleId) => {
  const schedules = Array.isArray(busService?.schedules) ? busService.schedules : [];
  return schedules.find((item) => String(item?.id || "") === String(scheduleId || ""));
};

const isScheduleAvailableOnDate = (schedule, travelDate) => {
  if (!schedule || String(schedule.status || "draft") !== "active") {
    return false;
  }

  const activeDays = Array.isArray(schedule.activeDays) ? schedule.activeDays : [];
  if (activeDays.length === 0) {
    return true;
  }

  return activeDays.includes(getBusTravelDayLabel(travelDate));
};

const flattenBusBlueprintSeats = (blueprint = {}) =>
  ["lowerDeck", "upperDeck"].flatMap((deckKey) =>
    (Array.isArray(blueprint?.[deckKey]) ? blueprint[deckKey] : []).flatMap((row) =>
      (Array.isArray(row) ? row : []).filter((cell) => String(cell?.kind || "") === "seat"),
    ),
  );

const buildOwnerBusMonthWindow = (value) => {
  const normalizedMonth = toCleanString(value);
  if (/^\d{4}-\d{2}$/.test(normalizedMonth)) {
    const [year, month] = normalizedMonth.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return {
      month: normalizedMonth,
      startDate: start.toISOString().slice(0, 10),
      endDateExclusive: end.toISOString().slice(0, 10),
    };
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  return {
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  };
};

const serializeOwnerBusBooking = (booking = {}) => {
  const cancelledSeats = Array.isArray(booking.cancelledSeats) ? booking.cancelledSeats : [];
  const cancelledSeatIdSet = new Set(
    cancelledSeats.map((item) => toCleanString(item?.seatId)).filter(Boolean),
  );
  const originalSeatIds = Array.isArray(booking.seatIds) ? booking.seatIds : [];
  const originalSeatLabels = Array.isArray(booking.seatLabels) ? booking.seatLabels : [];
  const activeSeats = originalSeatIds
    .map((seatId, index) => ({
      seatId,
      seatLabel: originalSeatLabels[index] || seatId,
    }))
    .filter((item) => !cancelledSeatIdSet.has(toCleanString(item.seatId)));

  return {
    id: String(booking._id || ""),
    bookingCode: booking.bookingCode || "",
    status: booking.status || "pending",
    bookingSource: booking.bookingSource || "user",
    travelDate: booking.travelDate || "",
    scheduleId: booking.scheduleId || "",
    amount: Number(booking.amount || 0),
    currency: booking.currency || "INR",
    createdAt: booking.createdAt || null,
    updatedAt: booking.updatedAt || null,
    passenger: booking.passenger || {},
    payment: {
      provider: booking.payment?.provider || "",
      orderId: booking.payment?.orderId || "",
      paymentId: booking.payment?.paymentId || "",
      status: booking.payment?.status || "pending",
      paidAt: booking.payment?.paidAt || null,
    },
    cancellation: booking.cancellation || {},
    routeSnapshot: booking.routeSnapshot || {},
    user: booking.userId
      ? {
          id: String(booking.userId?._id || booking.userId),
          name: booking.userId?.name || "",
          phone: booking.userId?.phone || "",
          email: booking.userId?.email || "",
        }
      : null,
    busService: booking.busServiceId
      ? {
          id: String(booking.busServiceId?._id || booking.busServiceId),
          busName: booking.busServiceId?.busName || booking.routeSnapshot?.busName || "",
          operatorName: booking.busServiceId?.operatorName || booking.routeSnapshot?.operatorName || "",
          serviceNumber: booking.busServiceId?.serviceNumber || "",
          coachType: booking.busServiceId?.coachType || booking.routeSnapshot?.coachType || "",
          busCategory: booking.busServiceId?.busCategory || booking.routeSnapshot?.busCategory || "",
          status: booking.busServiceId?.status || "draft",
          route: booking.busServiceId?.route || null,
        }
      : null,
    seatSummary: {
      total: originalSeatIds.length,
      active: activeSeats.length,
      cancelled: cancelledSeats.length,
    },
    activeSeats,
    cancelledSeats: cancelledSeats.map((item) => ({
      seatId: item?.seatId || "",
      seatLabel: item?.seatLabel || "",
      cancelledAt: item?.cancelledAt || null,
      refundAmount: Number(item?.refundAmount || 0),
      chargeAmount: Number(item?.chargeAmount || 0),
      refundStatus: item?.refundStatus || "",
      notes: item?.notes || "",
    })),
  };
};

const resolveOwnerBusSeatPrice = (busService = {}, seat = {}) => {
  const variantPricing = busService?.variantPricing || {};
  const defaultPrice = Number(busService?.seatPrice || 0);
  const variantKey = String(seat?.variant || "seat").trim().toLowerCase();
  const resolvedPrice = variantPricing?.[variantKey] ?? variantPricing?.seat ?? defaultPrice;

  return Number.isFinite(Number(resolvedPrice)) ? Number(resolvedPrice) : defaultPrice;
};

const parseOwnerBusDateTime = (travelDate, timeValue) => {
  const date = toCleanString(travelDate);
  const rawTime = toCleanString(timeValue);

  if (!date || !rawTime) {
    return null;
  }

  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const monthIndex = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const createIstDate = (hours, minutes) => {
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthIndex) ||
      !Number.isInteger(day) ||
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes)
    ) {
      return null;
    }

    const utcMillis = Date.UTC(year, monthIndex, day, hours, minutes) - ((5 * 60) + 30) * 60 * 1000;
    const parsed = new Date(utcMillis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const time24Match = rawTime.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match) {
    const hours = Number(time24Match[1]);
    const minutes = Number(time24Match[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return createIstDate(hours, minutes);
    }
  }

  const time12Match = rawTime.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (time12Match) {
    let hours = Number(time12Match[1]);
    const minutes = Number(time12Match[2]);
    const meridiem = time12Match[3].toUpperCase();
    if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      if (meridiem === "PM" && hours !== 12) hours += 12;
      if (meridiem === "AM" && hours === 12) hours = 0;
      return createIstDate(hours, minutes);
    }
  }

  return null;
};

const normalizeOwnerBusCancellationRules = (rules = []) =>
  (Array.isArray(rules) ? rules : [])
    .map((rule, index) => ({
      id: toCleanString(rule?.id) || `rule-${index + 1}`,
      label: toCleanString(rule?.label) || `Rule ${index + 1}`,
      hoursBeforeDeparture: Math.max(0, Number(rule?.hoursBeforeDeparture || 0)),
      refundType: ["percentage", "fixed", "none"].includes(String(rule?.refundType || "").toLowerCase())
        ? String(rule.refundType).toLowerCase()
        : "none",
      refundValue: Math.max(0, Number(rule?.refundValue || 0)),
      notes: toCleanString(rule?.notes),
    }))
    .sort((a, b) => b.hoursBeforeDeparture - a.hoursBeforeDeparture);

const buildOwnerBusPartialCancellationQuote = ({
  booking,
  busService,
  seatIds = [],
  travelDateOverride = "",
  now = new Date(),
}) => {
  const bookingSnapshot =
    booking && typeof booking.toObject === "function" ? booking.toObject() : booking;
  const selectedSeatIds = [...new Set((Array.isArray(seatIds) ? seatIds : []).map((item) => toCleanString(item)).filter(Boolean))];
  const totalSeatIds = Array.isArray(bookingSnapshot?.seatIds)
    ? bookingSnapshot.seatIds.map((item) => toCleanString(item)).filter(Boolean)
    : [];
  const seatCount = totalSeatIds.length;
  const selectedCount = selectedSeatIds.length;

  if (seatCount === 0 || selectedCount === 0) {
    return {
      allowed: false,
      reason: "No seats selected for cancellation",
      departureDateTime: null,
      hoursBeforeDeparture: null,
      appliedRuleId: "",
      appliedRuleLabel: "",
      refundType: "none",
      refundValue: 0,
      refundAmount: 0,
      chargeAmount: 0,
      notes: "",
    };
  }

  const perSeatAmount = Math.round((Number(bookingSnapshot?.amount || 0) / seatCount) * 100) / 100;
  const partialAmount = Math.round(perSeatAmount * selectedCount * 100) / 100;
  const schedule = findBusSchedule(busService, booking?.scheduleId);
  const departureTime = schedule?.departureTime || booking?.routeSnapshot?.departureTime || "";
  const resolvedTravelDate = toCleanString(travelDateOverride || booking?.travelDate);
  const departureDateTime = parseOwnerBusDateTime(resolvedTravelDate, departureTime);
  const rules = normalizeOwnerBusCancellationRules(busService?.cancellationRules);
  const amount = Math.max(0, partialAmount);

  if (!departureDateTime || Number.isNaN(departureDateTime.getTime())) {
    return {
      allowed: false,
      reason: "Departure time is unavailable",
      departureDateTime: null,
      hoursBeforeDeparture: null,
      appliedRuleId: "",
      appliedRuleLabel: "",
      refundType: "none",
      refundValue: 0,
      refundAmount: 0,
      chargeAmount: amount,
      notes: "",
    };
  }

  const hoursBeforeDeparture = Math.round((((departureDateTime.getTime() - now.getTime()) / 3600000) + Number.EPSILON) * 100) / 100;
  if (hoursBeforeDeparture <= 0) {
    return {
      allowed: false,
      reason: "Bus departure time has passed",
      departureDateTime,
      hoursBeforeDeparture,
      appliedRuleId: "",
      appliedRuleLabel: "",
      refundType: "none",
      refundValue: 0,
      refundAmount: 0,
      chargeAmount: amount,
      notes: "",
    };
  }

  const matchedRule = rules.find((rule) => hoursBeforeDeparture >= rule.hoursBeforeDeparture) || null;
  let refundAmount = 0;
  if (matchedRule) {
    if (matchedRule.refundType === "percentage") {
      refundAmount = Math.round(amount * Math.min(100, matchedRule.refundValue) / 100 * 100) / 100;
    } else if (matchedRule.refundType === "fixed") {
      refundAmount = Math.min(amount, Math.round(matchedRule.refundValue * 100) / 100);
    }
  }

  const chargeAmount = Math.max(0, Math.round((amount - refundAmount) * 100) / 100);

  return {
    allowed: true,
    reason: "",
    departureDateTime,
    hoursBeforeDeparture,
    appliedRuleId: matchedRule?.id || "",
    appliedRuleLabel: matchedRule?.label || "",
    refundType: matchedRule?.refundType || "none",
    refundValue: matchedRule?.refundValue || 0,
    refundAmount,
    chargeAmount,
    notes: matchedRule?.notes || "",
  };
};

const resolveOwnerRazorpayCredentials = async () => {
  return resolveConfiguredGatewayCredentials("razor_pay");
};

const ownerRazorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.description || payload?.error?.message || "Razorpay request failed");
  }

  return payload;
};

const resolveOwnerScopedBusDriverDetails = async (owner, payload = {}, existing = {}) => {
  const requestedOwnerDriverId = toCleanString(payload.ownerDriverId || existing.ownerDriverId);
  if (!requestedOwnerDriverId) {
    return {
      ownerDriverId: null,
      driverName: toCleanString(payload.driverName || existing.driverName || ""),
      driverPhone: normalizePhone(payload.driverPhone || existing.driverPhone || ""),
    };
  }

  if (!mongoose.Types.ObjectId.isValid(requestedOwnerDriverId)) {
    throw new ApiError(400, "Valid owner driver is required");
  }

  const ownerDriver = await Driver.findOne({
    _id: requestedOwnerDriverId,
    owner_id: owner._id,
    deletedAt: null,
  })
    .select("name phone status approve")
    .lean();

  if (!ownerDriver) {
    throw new ApiError(404, "Selected fleet driver was not found");
  }

  return {
    ownerDriverId: ownerDriver._id,
    driverName: toCleanString(ownerDriver.name),
    driverPhone: normalizePhone(ownerDriver.phone),
  };
};

const buildBusDriverSeatLayout = async ({ busService, scheduleId, travelDate }) => {
  const activeHolds = await BusSeatHold.find({
    busServiceId: busService._id,
    scheduleId,
    travelDate,
    status: { $in: ["held", "booked"] },
  })
    .select("seatId")
    .lean();

  const reservedSeatIds = new Set(activeHolds.map((item) => String(item.seatId || "")));

  const normalizeDeck = (deckRows = []) =>
    (Array.isArray(deckRows) ? deckRows : []).map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => {
        if (String(cell?.kind || "") !== "seat") {
          return {
            kind: "aisle",
            id: "",
            label: "",
            variant: "seat",
            status: "available",
          };
        }

        const seatId = String(cell.id || "");
        const isBlocked = String(cell.status || "available") === "blocked";
        const isReserved = reservedSeatIds.has(seatId);

        return {
          ...cell,
          status: isBlocked || isReserved ? "booked" : "available",
        };
      }),
    );

  const blueprint = {
    templateKey: busService.blueprint?.templateKey || "seater_2_2",
    lowerDeck: normalizeDeck(busService.blueprint?.lowerDeck || []),
    upperDeck: normalizeDeck(busService.blueprint?.upperDeck || []),
  };

  const availableSeats = flattenBusBlueprintSeats(blueprint).filter(
    (seat) => String(seat.status || "available") === "available",
  ).length;

  return {
    busServiceId: String(busService._id),
    scheduleId,
    travelDate,
    availableSeats,
    blueprint,
  };
};

const serializeBusDriverBooking = (booking = {}) => ({
  id: String(booking._id || ""),
  bookingCode: booking.bookingCode || "",
  status: booking.status || "pending",
  bookingSource: booking.bookingSource || "user",
  travelDate: booking.travelDate || "",
  scheduleId: booking.scheduleId || "",
  seatIds: Array.isArray(booking.seatIds) ? booking.seatIds : [],
  seatLabels: Array.isArray(booking.seatLabels) ? booking.seatLabels : [],
  amount: Number(booking.amount || 0),
  currency: booking.currency || "INR",
  passenger: booking.passenger || {},
  notes: booking.notes || "",
  payment: booking.payment || {},
  routeSnapshot: booking.routeSnapshot || {},
  createdAt: booking.createdAt || null,
});

const serializeBusDriverProfile = async (busDriver) => {
  const assignedBusServiceId = busDriver.assignedBusServiceId
    ? String(busDriver.assignedBusServiceId)
    : "";
  const busService = assignedBusServiceId
    ? await BusService.findById(assignedBusServiceId).lean()
    : null;

  const upcomingBookingsCount = assignedBusServiceId
    ? await BusBooking.countDocuments({
        busServiceId: assignedBusServiceId,
        status: { $in: ["pending", "confirmed"] },
      })
    : 0;

  const recentBookings = assignedBusServiceId
    ? await BusBooking.find({ busServiceId: assignedBusServiceId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    : [];

  return {
    id: busDriver._id,
    accountType: "bus_driver",
    name: busDriver.name || "",
    phone: busDriver.phone || "",
    email: busDriver.email || "",
    approve: busDriver.approve,
    active: busDriver.active,
    status: busDriver.status || "approved",
    assignedBusServiceId,
    busService: busService
      ? {
          id: String(busService._id),
          operatorName: busService.operatorName || "",
          busName: busService.busName || "",
          serviceNumber: busService.serviceNumber || "",
          registrationNumber: busService.registrationNumber || "",
          coachType: busService.coachType || "",
          busCategory: busService.busCategory || "",
          seatPrice: Number(busService.seatPrice || 0),
          fareCurrency: busService.fareCurrency || "INR",
          driverName: busService.driverName || "",
          driverPhone: busService.driverPhone || "",
          route: busService.route || {},
          schedules: Array.isArray(busService.schedules) ? busService.schedules : [],
          amenities: Array.isArray(busService.amenities) ? busService.amenities : [],
          liveTracking: serializeBusLiveTracking(busService.liveTracking || {}),
          capacity: Number(busService.capacity || 0),
          status: busService.status || "draft",
        }
      : null,
    metrics: {
      upcomingBookings: upcomingBookingsCount,
      totalSchedules: Array.isArray(busService?.schedules) ? busService.schedules.length : 0,
      totalCapacity: Number(busService?.capacity || 0),
    },
    recentBookings: recentBookings.map(serializeBusDriverBooking),
  };
};

const getIstDayStart = (value = new Date()) => {
  const timestamp = new Date(value).getTime();
  const shifted = timestamp + IST_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(dayStartShifted - IST_OFFSET_MS);
};

const getIstWeekKey = (value = new Date()) => {
  const dayStart = getIstDayStart(value);
  const shifted = dayStart.getTime() + IST_OFFSET_MS;
  const shiftedDate = new Date(shifted);
  const day = shiftedDate.getUTCDay();
  const mondayDistance = day === 0 ? 6 : day - 1;
  const weekStart = new Date(dayStart.getTime() - mondayDistance * DAY_MS);
  return toIstDayKey(weekStart);
};

const getIstMonthKey = (value = new Date()) => {
  const shifted = new Date(new Date(value).getTime() + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const getConfiguredAppName = async () => {
  try {
    const settings = await AdminBusinessSetting.findOne({ scope: "default" })
      .select("general.app_name")
      .lean();

    return String(settings?.general?.app_name || "").trim() || "App";
  } catch {
    return "App";
  }
};

const pruneDailyActivity = (items = []) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => item?.date)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .slice(-120);

const pruneClaimedRewards = (items = []) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => item?.rewardType && item?.rewardKey)
    .sort((left, right) => new Date(left.claimedAt || 0) - new Date(right.claimedAt || 0))
    .slice(-200);

const appendDailyActivityMinutes = (dailyActivity = [], dateKey, minutes) => {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  if (!dateKey || safeMinutes <= 0) {
    return pruneDailyActivity(dailyActivity);
  }

  const next = [...(Array.isArray(dailyActivity) ? dailyActivity : [])];
  const index = next.findIndex((item) => item?.date === dateKey);

  if (index >= 0) {
    next[index] = {
      ...next[index],
      activeMinutes: Math.round((Number(next[index]?.activeMinutes || 0) + safeMinutes) * 100) / 100,
    };
  } else {
    next.push({
      date: dateKey,
      activeMinutes: Math.round(safeMinutes * 100) / 100,
    });
  }

  return pruneDailyActivity(next);
};

const mergeOnlineSessionIntoTracking = (tracking = {}, sessionStart, sessionEnd = new Date()) => {
  const start = sessionStart ? new Date(sessionStart) : null;
  const end = sessionEnd ? new Date(sessionEnd) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return {
      ...tracking,
      dailyActivity: pruneDailyActivity(tracking?.dailyActivity),
    };
  }

  let cursor = new Date(start);
  let nextDailyActivity = Array.isArray(tracking?.dailyActivity) ? [...tracking.dailyActivity] : [];

  while (cursor < end) {
    const nextDayStart = new Date(getIstDayStart(cursor).getTime() + DAY_MS);
    const segmentEnd = nextDayStart < end ? nextDayStart : end;
    const minutes = (segmentEnd.getTime() - cursor.getTime()) / 60000;
    nextDailyActivity = appendDailyActivityMinutes(nextDailyActivity, toIstDayKey(cursor), minutes);
    cursor = segmentEnd;
  }

  return {
    ...tracking,
    dailyActivity: nextDailyActivity,
  };
};

const collectWeekWindows = (count = 1, fromDate = new Date()) => {
  const total = Math.max(1, Number(count || 1));
  const windows = [];
  const currentDayStart = getIstDayStart(fromDate);
  const shifted = currentDayStart.getTime() + IST_OFFSET_MS;
  const shiftedDate = new Date(shifted);
  const day = shiftedDate.getUTCDay();
  const mondayDistance = day === 0 ? 6 : day - 1;
  const currentWeekStart = new Date(currentDayStart.getTime() - mondayDistance * DAY_MS);

  for (let index = 0; index < total; index += 1) {
    const start = new Date(currentWeekStart.getTime() - index * 7 * DAY_MS);
    const end = new Date(start.getTime() + 7 * DAY_MS);
    windows.unshift({
      key: toIstDayKey(start),
      start,
      end,
    });
  }

  return windows;
};

const countCompletedRidesInRange = (rides = [], start, end) =>
  rides.filter((ride) => {
    const status = String(ride?.status || "").toLowerCase();
    const liveStatus = String(ride?.liveStatus || "").toLowerCase();
    if (!["completed", "delivered"].includes(status) && !["completed", "delivered"].includes(liveStatus)) {
      return false;
    }

    const rideDate = new Date(ride?.completedAt || ride?.updatedAt || ride?.createdAt || 0);
    return rideDate >= start && rideDate < end;
  }).length;

const countPeakHourTripsInRange = (rides = [], start, end) =>
  rides.filter((ride) => {
    const status = String(ride?.status || "").toLowerCase();
    const liveStatus = String(ride?.liveStatus || "").toLowerCase();
    if (!["completed", "delivered"].includes(status) && !["completed", "delivered"].includes(liveStatus)) {
      return false;
    }
    const rideDate = new Date(ride?.completedAt || ride?.updatedAt || ride?.createdAt || 0);
    if (!(rideDate >= start && rideDate < end)) {
      return false;
    }
    const hour = new Date(rideDate.getTime() + IST_OFFSET_MS).getUTCHours();
    return (hour >= 7 && hour < 11) || (hour >= 17 && hour < 21);
  }).length;

const getCurrentActiveStreak = (dailyActivity = [], minimumMinutes = 1) => {
  const activityMap = new Map((Array.isArray(dailyActivity) ? dailyActivity : []).map((item) => [item.date, Number(item.activeMinutes || 0)]));
  let streak = 0;
  let cursor = getIstDayStart(new Date());

  while (true) {
    const key = toIstDayKey(cursor);
    const minutes = Number(activityMap.get(key) || 0);
    if (minutes < minimumMinutes) {
      break;
    }
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  return streak;
};

const hasClaimedReward = (claimedRewards = [], rewardType, rewardKey, periodKey) =>
  (Array.isArray(claimedRewards) ? claimedRewards : []).some((item) =>
    item?.rewardType === rewardType &&
    item?.rewardKey === rewardKey &&
    item?.periodKey === periodKey,
  );

const buildDriverIncentiveSnapshot = ({ driver, settings, rides }) => {
  const tracking = driver?.incentiveTracking || {};
  const dailyActivity = Array.isArray(tracking.dailyActivity) ? tracking.dailyActivity : [];
  const claimedRewards = Array.isArray(tracking.claimedRewards) ? tracking.claimedRewards : [];
  const milestonePrograms = Array.isArray(settings?.milestone_programs) ? settings.milestone_programs : [];
  const rewardFeatures = Array.isArray(settings?.reward_features) ? settings.reward_features : [];
  const dailyActivityMap = new Map(dailyActivity.map((item) => [item.date, Number(item.activeMinutes || 0)]));

  const milestones = milestonePrograms.map((item, index) => {
    const requiredWeeks = Math.max(1, Number(item.required_weeks || 1));
    const requiredHours = Math.max(0, Number(item.active_hours_per_day || 0));
    const minTripsPerWeek = Math.max(0, Number(item.min_trips_per_week || 0));
    const weekWindows = collectWeekWindows(requiredWeeks, new Date());
    const qualifyingWeeks = weekWindows.filter((week) => {
      const tripCount = countCompletedRidesInRange(rides, week.start, week.end);
      return tripCount >= minTripsPerWeek;
    }).length;

    const targetDays = requiredWeeks * 7;
    let qualifyingDays = 0;
    for (let offset = 0; offset < targetDays; offset += 1) {
      const day = new Date(getIstDayStart(new Date()).getTime() - offset * DAY_MS);
      const dayKey = toIstDayKey(day);
      if ((Number(dailyActivityMap.get(dayKey) || 0) / 60) >= requiredHours) {
        qualifyingDays += 1;
      }
    }

    const periodKey = `milestone:${item.id || index}`;
    const eligible = Boolean(item.enabled) && qualifyingWeeks >= requiredWeeks && qualifyingDays >= targetDays;

    return {
      ...item,
      periodKey,
      progress: {
        qualifyingWeeks,
        targetWeeks: requiredWeeks,
        qualifyingDays,
        targetDays,
      },
      isEligible: eligible,
      isClaimed: hasClaimedReward(claimedRewards, "milestone", item.id || String(index), periodKey),
    };
  });

  const currentWeekWindow = collectWeekWindows(1, new Date())[0];
  const currentWeekTrips = currentWeekWindow ? countCompletedRidesInRange(rides, currentWeekWindow.start, currentWeekWindow.end) : 0;
  const currentPeakTrips = currentWeekWindow ? countPeakHourTripsInRange(rides, currentWeekWindow.start, currentWeekWindow.end) : 0;
  const currentStreak = getCurrentActiveStreak(dailyActivity, 1);
  const weekendCount = collectWeekWindows(4, new Date()).reduce((total, week) => {
    const saturday = new Date(week.start.getTime() + 5 * DAY_MS);
    const sunday = new Date(week.start.getTime() + 6 * DAY_MS);
    const weekendTrips = countCompletedRidesInRange(rides, saturday, new Date(sunday.getTime() + DAY_MS));
    return total + (weekendTrips > 0 ? 1 : 0);
  }, 0);
  const currentMonthKey = getIstMonthKey(new Date());
  const monthStart = new Date(`${currentMonthKey}-01T00:00:00.000Z`);
  const monthCompleted = rides.filter((ride) => {
    const status = String(ride?.status || "").toLowerCase();
    const liveStatus = String(ride?.liveStatus || "").toLowerCase();
    if (!["completed", "delivered"].includes(status) && !["completed", "delivered"].includes(liveStatus)) {
      return false;
    }
    const rideDate = new Date(ride?.completedAt || ride?.updatedAt || ride?.createdAt || 0);
    return getIstMonthKey(rideDate) === currentMonthKey;
  }).length;
  const monthCancelled = rides.filter((ride) => {
    const status = String(ride?.status || "").toLowerCase();
    return status === "cancelled" && getIstMonthKey(new Date(ride?.updatedAt || ride?.createdAt || 0)) === currentMonthKey;
  }).length;
  const cancellationRate = monthCompleted + monthCancelled > 0
    ? Number(((monthCancelled / (monthCompleted + monthCancelled)) * 100).toFixed(2))
    : 0;

  const features = rewardFeatures.map((item, index) => {
    const key = item.key || item.id || `feature_${index + 1}`;
    let currentValue = 0;
    let periodKey = key;

    switch (key) {
      case "daily_active_streak":
        currentValue = currentStreak;
        periodKey = `${key}:${getIstWeekKey(new Date())}`;
        break;
      case "weekly_trip_quest":
        currentValue = currentWeekTrips;
        periodKey = `${key}:${getIstWeekKey(new Date())}`;
        break;
      case "peak_hour_booster":
        currentValue = currentPeakTrips;
        periodKey = `${key}:${getIstWeekKey(new Date())}`;
        break;
      case "weekend_warrior":
        currentValue = weekendCount;
        periodKey = `${key}:${currentMonthKey}`;
        break;
      case "rating_guard":
        currentValue = Number(driver?.rating || 0);
        periodKey = `${key}:${currentMonthKey}`;
        break;
      case "cancellation_guard":
        currentValue = cancellationRate;
        periodKey = `${key}:${currentMonthKey}`;
        break;
      default:
        currentValue = Number(item.target_value || 0);
        periodKey = `${key}:${currentMonthKey}`;
        break;
    }

    const target = Number(item.target_value || 0);
    const isEligible = key === "cancellation_guard"
      ? currentValue <= target
      : currentValue >= target;

    return {
      ...item,
      key,
      periodKey,
      currentValue,
      targetValue: target,
      isEligible: Boolean(item.enabled) && isEligible,
      isClaimed: hasClaimedReward(claimedRewards, "feature", key, periodKey),
    };
  });

  return {
    settings: {
      enabled: Boolean(settings?.enabled),
      milestone_program_enabled: Boolean(settings?.milestone_program_enabled),
      type: settings?.type || "instant_referrer",
    },
    summary: {
      streakDays: currentStreak,
      currentWeekTrips,
      currentPeakTrips,
      weekendCount,
      monthCancellationRate: cancellationRate,
      totalClaimedRewards: claimedRewards.length,
    },
    milestones,
    features,
    claimedRewards,
    walletBalance: Number(driver?.wallet?.balance || 0),
  };
};

const buildDriverTodaySummary = async (driver) => buildDriverTodaySummaryFromDocument(driver);

const normalizePaymentAmount = (value) => {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "amount must be a positive number");
  }

  if (amount > RAZORPAY_QR_MAX_AMOUNT) {
    throw new ApiError(400, "amount is too large for QR collection");
  }

  return Math.round(amount * 100);
};

const razorpayRequest = async ({ method, path, body }) => {
  const { keyId, keySecret } = await resolveConfiguredGatewayCredentials("razor_pay");
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status || 502,
      payload?.error?.description ||
        payload?.error?.message ||
        "Razorpay QR request failed",
      {
        provider: "razorpay",
        path,
        code: payload?.error?.code || null,
      },
    );
  }

  return payload;
};

const shouldFallbackToPaymentLinkQr = (error) => {
  const message = String(error?.message || "").toLowerCase();

  return (
    error?.statusCode === 404 ||
    message.includes("requested url was not found") ||
    message.includes("qr") && message.includes("not") && message.includes("enabled")
  );
};

const shouldFallbackToStandardPaymentLink = (error) => {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("upi payment links are not supported in test mode") ||
    message.includes("upi payment link") && message.includes("test mode")
  );
};

const buildPaymentLinkBody = ({ amountInPaise, rideId, driverId, serviceType, expireBy, referenceId, upiLink }) => ({
  ...(upiLink ? { upi_link: true } : {}),
  amount: amountInPaise,
  currency: "INR",
  accept_partial: false,
  expire_by: expireBy,
  reference_id: referenceId,
  description: `Taxi fare for ride ${rideId}`,
  reminder_enable: false,
  notes: {
    rideId: String(rideId),
    driverId: String(driverId),
    serviceType: serviceType || "ride",
    source: "driver_collect_amount",
    fallback: upiLink ? "upi_payment_link_qr" : "standard_payment_link_qr",
  },
});

const createPaymentLinkQr = async ({ amountInPaise, rideId, driverId, serviceType }) => {
  const referenceId = `ride_${String(rideId).slice(-18)}_${Date.now().toString(36)}`.slice(0, 40);
  const expireBy = Math.floor(Date.now() / 1000) + 30 * 60;
  let providerMode = "upi_payment_link_qr";
  let paymentLink;

  try {
    paymentLink = await razorpayRequest({
      method: "POST",
      path: "/payment_links",
      body: buildPaymentLinkBody({
        amountInPaise,
        rideId,
        driverId,
        serviceType,
        expireBy,
        referenceId,
        upiLink: true,
      }),
    });
  } catch (error) {
    if (!shouldFallbackToStandardPaymentLink(error)) {
      throw error;
    }

    providerMode = "standard_payment_link_qr";
    paymentLink = await razorpayRequest({
      method: "POST",
      path: "/payment_links",
      body: buildPaymentLinkBody({
        amountInPaise,
        rideId,
        driverId,
        serviceType,
        expireBy,
        referenceId: `${referenceId}_std`.slice(0, 40),
        upiLink: false,
      }),
    });
  }

  const paymentUrl = paymentLink.short_url || paymentLink.shortUrl || paymentLink.url;

  if (!paymentUrl) {
    throw new ApiError(502, "Razorpay payment link was created without a payment URL");
  }

  const imageUrl = await QRCode.toDataURL(paymentUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 8,
  });

  return {
    id: paymentLink.id,
    entity: paymentLink.entity || "payment_link",
    status: paymentLink.status || "created",
    imageUrl,
    linkUrl: paymentUrl,
    amount: amountInPaise / 100,
    currency: "INR",
    description: paymentLink.description,
    closeBy: paymentLink.expire_by || expireBy,
    rawStatus: paymentLink.status || "created",
    providerMode,
  };
};

const PAYMENT_PAID_STATUSES = new Set(["paid", "captured", "completed"]);
const PAYMENT_OPEN_STATUSES = new Set(["created", "active", "issued", "partially_paid"]);

const normalizeCollectionStatus = (status) => {
  const normalized = String(status || "").toLowerCase();

  if (PAYMENT_PAID_STATUSES.has(normalized)) {
    return "paid";
  }

  if (PAYMENT_OPEN_STATUSES.has(normalized)) {
    return normalized === "partially_paid" ? "active" : normalized;
  }

  if (normalized === "closed") {
    return "closed";
  }

  if (["cancelled", "canceled", "expired", "failed"].includes(normalized)) {
    return normalized === "canceled" ? "cancelled" : normalized;
  }

  return normalized || "pending";
};

const getPaymentCollectionPath = ({ providerId, providerMode }) => {
  if (!providerId) {
    throw new ApiError(400, "payment collection id is required");
  }

  if (String(providerMode || "").includes("payment_link")) {
    return `/payment_links/${providerId}`;
  }

  return `/payments/qr_codes/${providerId}`;
};

const serializeDriverPaymentCollection = (collection = {}) => {
  const status = normalizeCollectionStatus(collection.status);

  return {
    provider: collection.provider || "razorpay",
    id: collection.providerId || collection.id || "",
    providerMode: collection.providerMode || "",
    status,
    paid: PAYMENT_PAID_STATUSES.has(status),
    amount: Number(collection.amount || 0),
    currency: collection.currency || "INR",
    linkUrl: collection.linkUrl || "",
    paidAt: collection.paidAt || null,
    updatedAt: collection.updatedAt || null,
  };
};

const refreshDriverPaymentCollection = async (ride) => {
  const collection = ride?.driverPaymentCollection || {};
  const providerId = String(collection.providerId || "").trim();

  if (!providerId) {
    return serializeDriverPaymentCollection(collection);
  }

  const providerMode = collection.providerMode || "";
  const providerPayload = await razorpayRequest({
    method: "GET",
    path: getPaymentCollectionPath({ providerId, providerMode }),
  });
  const receivedAmount = Number(
    providerPayload?.amount_paid ||
      providerPayload?.amount_paid_total ||
      providerPayload?.payments_amount_received ||
      providerPayload?.amount_received ||
      0,
  );
  const expectedAmount = Number(collection.amount || 0) * 100;
  const isProviderAmountPaid = expectedAmount > 0 && receivedAmount >= expectedAmount;
  const providerStatus = normalizeCollectionStatus(providerPayload?.status);
  const isPaid = PAYMENT_PAID_STATUSES.has(providerStatus) || isProviderAmountPaid;
  const nextStatus = isPaid ? "paid" : providerStatus;
  const nextCollection = {
    provider: "razorpay",
    providerId,
    providerMode,
    status: nextStatus,
    amount: Number(collection.amount || 0),
    currency: collection.currency || "INR",
    linkUrl: collection.linkUrl || providerPayload?.short_url || providerPayload?.url || "",
    paidAt: isPaid ? collection.paidAt || new Date() : collection.paidAt || null,
    updatedAt: new Date(),
  };

  ride.driverPaymentCollection = nextCollection;
  await ride.save();

  return serializeDriverPaymentCollection(nextCollection);
};

const sanitizeEmergencyPhone = (value) =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(-10);

const serializeEmergencyContact = (contact = {}) => ({
  id: String(contact._id || contact.id || ""),
  name: String(contact.name || "").trim(),
  phone: sanitizeEmergencyPhone(contact.phone),
  source:
    String(contact.source || "manual").toLowerCase() === "device"
      ? "device"
      : "manual",
});

const resolveVehicleMapIcon = async (vehicleTypeId) => {
  if (!vehicleTypeId) {
    return "";
  }

  const vehicle = await Vehicle.findById(vehicleTypeId).select("icon map_icon image").lean();
  return vehicle?.map_icon || vehicle?.icon || vehicle?.image || "";
};

const normalizePhone = (value) =>
  String(value || "")
    .replace(/\D/g, "")
    .trim();

const isOwnerApproved = (owner) =>
  Boolean(owner) &&
  owner.active !== false &&
  (owner.approve === true ||
    String(owner.status || "").toLowerCase() === "approved");

const resolveOwnerForFleet = async (requester = {}) => {
  const onboardingRole = String(
    requester?.onboarding?.role || "",
  ).toLowerCase();
  const convertedOwnerId = requester?.onboarding?.convertedOwnerId || null;

  if (onboardingRole === "owner" && convertedOwnerId) {
    const owner = await Owner.findById(convertedOwnerId)
      .select("service_location_id active approve status")
      .lean();
    if (isOwnerApproved(owner)) return owner;
  }

  const mobile = String(requester?.phone || "").trim();
  const email = String(requester?.email || "")
    .trim()
    .toLowerCase();

  if (!mobile && !email) {
    return null;
  }

  const owner = await Owner.findOne({
    $or: [...(mobile ? [{ mobile }] : []), ...(email ? [{ email }] : [])],
  })
    .select("service_location_id active approve status")
    .lean();

  return isOwnerApproved(owner) ? owner : null;
};

const resolveAuthenticatedOwner = async (req) => {
  if (String(req.auth?.role || "").toLowerCase() === "owner") {
    const owner = await Owner.findById(req.auth?.sub)
      .select("name company_name owner_name mobile phone email city transport_type service_location_id active approve status wallet")
      .lean();
    return isOwnerApproved(owner) ? owner : null;
  }

  const requester = await Driver.findById(req.auth?.sub)
    .select("onboarding phone email service_location_id")
    .lean();

  if (!requester) {
    return null;
  }

  return resolveOwnerForFleet(requester);
};

const serializeOwnerProfile = (owner = {}) => ({
  id: owner._id,
  name: owner.owner_name || owner.name || owner.company_name || "Owner",
  phone: owner.mobile || owner.phone || "",
  email: owner.email || "",
  profileImage: "",
  gender: "",
  vehicleType: owner.transport_type || "taxi",
  vehicleTypeId: null,
  vehicleIconType: owner.transport_type || "taxi",
  vehicleIconUrl: "",
  vehicleMake: owner.company_name || "",
  vehicleModel: "",
  registerFor: owner.transport_type || "taxi",
  vehicleNumber: "",
  vehicleColor: "",
  vehicleImage: "",
  city: owner.city || "",
  approve: owner.approve,
  status: owner.status || "approved",
  rating: 0,
  wallet: {
    balance: Number(owner.wallet?.balance || 0),
    currency: "INR",
  },
  referralCode: "",
  deletionRequest: owner.deletionRequest || { status: "none" },
  isOnline: false,
  isOnRide: false,
  onlineSelfie: {},
  location: null,
  zoneId: null,
  documents: {},
  emergencyContacts: [],
  onboarding: {
    role: "owner",
    convertedOwnerId: String(owner._id || ""),
  },
});

const serializeServiceCenterProfile = (center = {}) => ({
  id: center._id,
  name: center.name || "Service Center",
  phone: center.owner_phone || "",
  email: "",
  profileImage: "",
  gender: "",
  vehicleType: "rental",
  vehicleTypeId: null,
  vehicleIconType: "car",
  vehicleIconUrl: "",
  vehicleMake: center.name || "",
  vehicleModel: "",
  registerFor: "service_center",
  vehicleNumber: "",
  vehicleColor: "",
  vehicleImage: "",
  city: center.service_location_id?.name || center.service_location_id?.service_location_name || "",
  approve: true,
  status: center.status || "active",
  rating: 0,
  wallet: {
    balance: 0,
    currency: "INR",
  },
  referralCode: "",
  deletionRequest: { status: "none" },
  isOnline: false,
  isOnRide: false,
  onlineSelfie: {},
  location:
    Number.isFinite(Number(center.longitude)) && Number.isFinite(Number(center.latitude))
      ? {
          type: "Point",
          coordinates: [Number(center.longitude), Number(center.latitude)],
        }
      : null,
  zoneId: center.zone_id?._id || center.zone_id || null,
  documents: {},
  emergencyContacts: [],
  ownerName: center.owner_name || "",
  ownerPhone: center.owner_phone || "",
  address: center.address || "",
  latitude: Number(center.latitude ?? 0),
  longitude: Number(center.longitude ?? 0),
  zone: center.zone_id
    ? {
        id: center.zone_id._id || center.zone_id,
        name: center.zone_id.name || "",
      }
    : null,
  serviceLocation: center.service_location_id
    ? {
        id: center.service_location_id._id || center.service_location_id,
        name: center.service_location_id.service_location_name || center.service_location_id.name || "",
        country: center.service_location_id.country || "",
      }
    : null,
  onboarding: {
    role: "service_center",
  },
});

const serializeServiceCenterStaffProfile = (staff = {}, center = null) => ({
  id: staff._id,
  name: staff.name || "Service Center Staff",
  phone: staff.phone || "",
  email: "",
  profileImage: "",
  gender: "",
  vehicleType: "rental",
  vehicleTypeId: null,
  vehicleIconType: "car",
  vehicleIconUrl: "",
  vehicleMake: center?.name || "",
  vehicleModel: "",
  registerFor: "service_center_staff",
  vehicleNumber: "",
  vehicleColor: "",
  vehicleImage: "",
  city: center?.service_location_id?.name || center?.service_location_id?.service_location_name || "",
  approve: true,
  status: staff.status || "active",
  rating: 0,
  wallet: {
    balance: 0,
    currency: "INR",
  },
  referralCode: "",
  deletionRequest: { status: "none" },
  isOnline: false,
  isOnRide: false,
  onlineSelfie: {},
  location: null,
  zoneId: center?.zone_id?._id || center?.zone_id || null,
  documents: {},
  emergencyContacts: [],
  ownerName: center?.owner_name || "",
  ownerPhone: center?.owner_phone || "",
  address: center?.address || "",
  latitude: Number(center?.latitude ?? 0),
  longitude: Number(center?.longitude ?? 0),
  zone: center?.zone_id
    ? {
        id: center.zone_id._id || center.zone_id,
        name: center.zone_id.name || "",
      }
    : null,
  serviceLocation: center?.service_location_id
    ? {
        id: center.service_location_id._id || center.service_location_id,
        name: center.service_location_id.service_location_name || center.service_location_id.name || "",
        country: center.service_location_id.country || "",
      }
    : null,
  serviceCenterId: center?._id ? String(center._id) : "",
  onboarding: {
    role: "service_center_staff",
  },
});

const serializePoolingDriverProfile = (vehicle = {}) => ({
  id: vehicle._id,
  name: vehicle.driverName || "Pooling Driver",
  phone: vehicle.driverPhone || "",
  email: "",
  profileImage: "",
  gender: "",
  vehicleType: vehicle.vehicleType || "sedan",
  vehicleTypeId: null,
  vehicleIconType: vehicle.vehicleType || "sedan",
  vehicleIconUrl: Array.isArray(vehicle.images) && vehicle.images.length > 0 ? vehicle.images[0] : "",
  vehicleMake: vehicle.name || "",
  vehicleModel: vehicle.vehicleModel || "",
  registerFor: "pooling",
  vehicleNumber: vehicle.vehicleNumber || "",
  vehicleColor: vehicle.color || "",
  vehicleImage: Array.isArray(vehicle.images) && vehicle.images.length > 0 ? vehicle.images[0] : "",
  city: "",
  status: vehicle.status || (vehicle.approve === false ? "pending" : "active"),
  rating: 0,
  wallet: {
    balance: 0,
    currency: "INR",
  },
  referralCode: "",
  deletionRequest: { status: "none" },
  isOnline: false,
  isOnRide: false,
  onlineSelfie: {},
  location: null,
  zoneId: null,
  documents: {},
  emergencyContacts: [],
  poolingVehicle: vehicle,
  approve: vehicle.approve !== false,
  onboarding: {
    role: "pooling_driver",
  },
});

const serializePoolingDriverBooking = (booking = {}) => ({
  id: String(booking._id || ""),
  bookingId: String(booking.bookingId || ""),
  seatsBooked: Number(booking.seatsBooked || 0),
  fare: Number(booking.fare || 0),
  baseFare: Number(booking.baseFare || 0),
  serviceTaxPercentage: Number(booking.serviceTaxPercentage || 0),
  serviceTaxAmount: Number(booking.serviceTaxAmount || 0),
  driverCommissionPercentage: Number(booking.driverCommissionPercentage || 0),
  driverCommissionAmount: Number(booking.driverCommissionAmount || 0),
  ownerCommissionPercentage: Number(booking.ownerCommissionPercentage || 0),
  ownerCommissionAmount: Number(booking.ownerCommissionAmount || 0),
  currency: String(booking.currency || "INR"),
  paymentStatus: String(booking.paymentStatus || booking.payment?.status || "pending"),
  bookingStatus: String(booking.bookingStatus || "confirmed"),
  selectedSeats: Array.isArray(booking.selectedSeats) ? booking.selectedSeats : [],
  pickupLabel: String(booking.pickupLabel || ""),
  dropLabel: String(booking.dropLabel || ""),
  scheduleId: String(booking.scheduleId || ""),
  otp: String(booking.otp || ""),
  travelDate: booking.travelDate || null,
  createdAt: booking.createdAt || null,
  updatedAt: booking.updatedAt || null,
  user: booking.user
    ? {
        id: String(booking.user._id || booking.user),
        name: String(booking.user.name || ""),
        phone: String(booking.user.phone || ""),
        email: String(booking.user.email || ""),
      }
    : null,
  route: booking.route
    ? {
        id: String(booking.route._id || booking.route),
        routeName: String(booking.route.routeName || ""),
        originLabel: String(booking.route.originLabel || ""),
        destinationLabel: String(booking.route.destinationLabel || ""),
      }
    : null,
});

const serializeServiceCenterStaff = (staff = {}, bookingCount = 0) => ({
  id: String(staff._id || ""),
  _id: staff._id,
  name: staff.name || "",
  phone: staff.phone || "",
  active: staff.active !== false,
  status: staff.status || "active",
  biometrics: {
    enrolledFingerCount: Array.isArray(staff.biometrics) ? staff.biometrics.length : 0,
    enrolledFingerCodes: Array.isArray(staff.biometrics)
      ? staff.biometrics.map((item) => String(item?.fingerCode || "")).filter(Boolean)
      : [],
    updatedAt: Array.isArray(staff.biometrics) && staff.biometrics.length > 0
      ? staff.biometrics.reduce((latest, item) => {
          const candidate = item?.lastUpdated ? new Date(item.lastUpdated) : null;
          return !latest || (candidate && candidate > latest) ? candidate : latest;
        }, null)
      : null,
  },
  bookingCount: Number(bookingCount || 0),
  createdAt: staff.createdAt || null,
  updatedAt: staff.updatedAt || null,
});

const serializeInspectionPhotoMetadata = (item = {}) => ({
  imageUrl: String(item?.imageUrl || "").trim(),
  capturedAt: item?.capturedAt || null,
  latitude:
    item?.latitude === null || item?.latitude === undefined || item?.latitude === ""
      ? null
      : Number(item.latitude),
  longitude:
    item?.longitude === null || item?.longitude === undefined || item?.longitude === ""
      ? null
      : Number(item.longitude),
  address: String(item?.address || "").trim(),
  source: String(item?.source || "").trim(),
  fileName: String(item?.fileName || "").trim(),
  mimeType: String(item?.mimeType || "").trim(),
  deviceModel: String(item?.deviceModel || "").trim(),
  watermarkText: String(item?.watermarkText || "").trim(),
  exif: item?.exif && typeof item.exif === "object" ? item.exif : {},
});

const normalizeInspectionPhotoMetadataInput = (item = {}) => {
  const imageUrl = String(item?.imageUrl || item?.url || "").trim();
  const capturedAtValue = item?.capturedAt || item?.timestamp || item?.dateTime || null;
  const capturedAtDate = capturedAtValue ? new Date(capturedAtValue) : null;
  const latitude = item?.latitude ?? item?.lat ?? item?.location?.latitude ?? item?.gps?.latitude ?? null;
  const longitude = item?.longitude ?? item?.lng ?? item?.location?.longitude ?? item?.gps?.longitude ?? null;

  return {
    imageUrl,
    capturedAt:
      capturedAtDate && !Number.isNaN(capturedAtDate.getTime())
        ? capturedAtDate
        : null,
    latitude:
      latitude === null || latitude === undefined || latitude === "" || Number.isNaN(Number(latitude))
        ? null
        : Number(latitude),
    longitude:
      longitude === null || longitude === undefined || longitude === "" || Number.isNaN(Number(longitude))
        ? null
        : Number(longitude),
    address: String(item?.address || item?.locationName || item?.formattedAddress || "").trim(),
    source: String(item?.source || item?.captureSource || "").trim(),
    fileName: String(item?.fileName || "").trim(),
    mimeType: String(item?.mimeType || item?.type || "").trim(),
    deviceModel: String(item?.deviceModel || item?.deviceName || item?.deviceLabel || "").trim(),
    watermarkText: String(item?.watermarkText || "").trim(),
    exif: item?.exif && typeof item.exif === "object" ? item.exif : {},
  };
};

const serializeServiceCenterStaffBiometrics = (staff = {}) => {
  const biometrics = Array.isArray(staff?.biometrics) ? staff.biometrics : [];

  return {
    staffId: String(staff?._id || ""),
    enrolledFingerCount: biometrics.length,
    enrolledFingerCodes: biometrics.map((item) => String(item?.fingerCode || "")).filter(Boolean),
    fingers: biometrics.map((item) => ({
      fingerCode: String(item?.fingerCode || "").toUpperCase(),
      displayName: item?.displayName || getBiometricFingerDisplayName(item?.fingerCode),
      source: item?.source || "unknown",
      templateFormat: item?.templateFormat || "vendor-template",
      qualityScore: Number(item?.qualityScore || 0) || null,
      lastUpdated: item?.lastUpdated || null,
      lastVerifiedAt: item?.lastVerifiedAt || null,
      verificationCount: Number(item?.verificationCount || 0),
      templateStored: Boolean(item?.templateEncrypted),
      templateHashPreview: item?.templateHash ? String(item.templateHash).slice(0, 10) : "",
    })),
  };
};

const getBiometricFingerDisplayName = (fingerCode = "") =>
  String(fingerCode || "")
    .trim()
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getBiometricFingerHand = (fingerCode = "") => {
  const normalized = String(fingerCode || "").trim().toUpperCase();
  if (normalized.startsWith("LEFT_")) return "left";
  if (normalized.startsWith("RIGHT_")) return "right";
  return "unknown";
};

const getBiometricEncryptionKey = () =>
  crypto.createHash("sha256").update(String(env.jwtSecret || "appzeto-biometric-secret")).digest();

const encryptBiometricTemplate = (template = "") => {
  const raw = String(template || "");
  if (!raw) {
    return "";
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getBiometricEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

const decryptBiometricTemplate = (encrypted = "") => {
  const raw = String(encrypted || "").trim();
  if (!raw) return "";
  try {
    const parts = raw.split(":");
    if (parts.length < 3) return "";
    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const data = Buffer.from(parts[2], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getBiometricEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, "utf8") + decipher.final("utf8");
  } catch {
    return "";
  }
};

const buildBiometricTemplateHash = (template = "") =>
  crypto.createHash("sha256").update(String(template || "")).digest("hex");

const isValidBiometricTemplate = (template) => {
  const s = String(template || "").trim();
  if (!s || s.length < 20) return false;
  const lower = s.toLowerCase();
  if (lower.includes("[object object]") || lower === "undefined" || lower === "null") return false;
  if (["success", "ok", "true", "false", "matched", "verified"].includes(lower)) return false;
  return true;
};

const isRdServiceTemplateFormat = (templateFormat = "") =>
  ["uidai-pid-xml", "rd-pid-xml", "rd_service_pid_xml"].includes(
    String(templateFormat || "").trim().toLowerCase(),
  );

const normalizeBiometricPreviewImage = (value = "") => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 120) {
    return `data:image/png;base64,${trimmed}`;
  }
  return trimmed;
};

const buildGeneratedBiometricPreview = (finger = {}) => {
  const seed = String(finger?.templateHash || finger?.fingerCode || "fingerprint").replace(/[^a-fA-F0-9]/g, "") || "fingerprint";
  const label = String(finger?.displayName || getBiometricFingerDisplayName(finger?.fingerCode) || "Fingerprint").trim();
  const accent = `#${seed.slice(0, 6).padEnd(6, "8")}`;
  const accentSoft = `#${seed.slice(6, 12).padEnd(6, "c")}`;
  const lineOne = Number.parseInt(seed.slice(0, 2) || "18", 16) % 18;
  const lineTwo = Number.parseInt(seed.slice(2, 4) || "24", 16) % 18;
  const lineThree = Number.parseInt(seed.slice(4, 6) || "30", 16) % 18;
  const ridgeA = Number.parseInt(seed.slice(6, 8) || "12", 16) % 14;
  const ridgeB = Number.parseInt(seed.slice(8, 10) || "8", 16) % 14;
  const ridgeC = Number.parseInt(seed.slice(10, 12) || "4", 16) % 14;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#e2e8f0" />
    </linearGradient>
    <linearGradient id="ink" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent}" />
      <stop offset="100%" stop-color="${accentSoft}" />
    </linearGradient>
  </defs>
  <rect width="320" height="320" rx="28" fill="url(#bg)" />
  <ellipse cx="160" cy="158" rx="${76 + lineOne}" ry="${102 + lineTwo}" fill="none" stroke="url(#ink)" stroke-width="6" opacity="0.95" />
  <ellipse cx="160" cy="160" rx="${60 + lineTwo}" ry="${84 + lineThree}" fill="none" stroke="url(#ink)" stroke-width="5" opacity="0.88" />
  <ellipse cx="160" cy="162" rx="${44 + lineThree}" ry="${66 + lineOne}" fill="none" stroke="url(#ink)" stroke-width="4.5" opacity="0.82" />
  <path d="M88 ${124 + ridgeA} C112 ${88 + ridgeB}, 142 ${72 + ridgeC}, 160 94 C178 ${72 + ridgeA}, 208 ${88 + ridgeC}, 232 ${124 + ridgeB}" fill="none" stroke="url(#ink)" stroke-width="4" stroke-linecap="round" opacity="0.9" />
  <path d="M96 ${150 + ridgeB} C118 ${124 + ridgeC}, 144 ${110 + ridgeA}, 160 126 C176 ${110 + ridgeB}, 202 ${124 + ridgeA}, 224 ${150 + ridgeC}" fill="none" stroke="url(#ink)" stroke-width="4" stroke-linecap="round" opacity="0.85" />
  <path d="M108 ${182 + ridgeC} C126 ${162 + ridgeA}, 148 ${150 + ridgeB}, 160 162 C172 ${150 + ridgeC}, 194 ${162 + ridgeB}, 212 ${182 + ridgeA}" fill="none" stroke="url(#ink)" stroke-width="3.5" stroke-linecap="round" opacity="0.8" />
  <circle cx="160" cy="160" r="10" fill="${accent}" opacity="0.14" />
  <text x="160" y="286" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${label}</text>
</svg>`.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const normalizePhoneDigits = (value = "") =>
  String(value || "").replace(/\D/g, "").slice(-10);

const buildDefaultThumbParticipantKey = (participantType = "", linkedId = "", fallback = "") => {
  const normalizedType = String(participantType || "other").trim().toLowerCase() || "other";
  const normalizedId = String(linkedId || "").trim();
  return normalizedId ? `${normalizedType}:${normalizedId}` : `${normalizedType}:${String(fallback || "manual").trim()}`;
};

const getDefaultThumbParticipantsForBooking = (booking = {}) => {
  const customerId = booking?.userId?._id || booking?.userId || "";
  const participants = [
    {
      participantKey: buildDefaultThumbParticipantKey("customer", customerId, booking?._id || "booking"),
      participantType: "customer",
      participantLabel: "Customer",
      userType: "customer",
      name: booking?.userId?.name || booking?.contactName || "",
      phone: booking?.userId?.phone || booking?.contactPhone || "",
      linkedUserId: customerId || null,
      linkedStaffId: null,
      isPrimary: true,
      sortOrder: 0,
    },
  ];

  if (booking?.assignedStaffId || booking?.assignedStaffName || booking?.assignedStaffPhone) {
    participants.push({
      participantKey: buildDefaultThumbParticipantKey("employee", booking?.assignedStaffId || "", booking?._id || "employee"),
      participantType: "employee",
      participantLabel: "Employee",
      userType: "employee",
      name: booking?.assignedStaffName || "Service Center Staff",
      phone: booking?.assignedStaffPhone || "",
      linkedUserId: null,
      linkedStaffId: booking?.assignedStaffId || null,
      isPrimary: false,
      sortOrder: 1,
    });
  }

  return participants;
};

const mergeThumbParticipantsForBooking = (profile = {}, booking = {}) => {
  const next = [];
  const seen = new Set();
  const entries = [
    ...getDefaultThumbParticipantsForBooking(booking),
    ...(Array.isArray(profile?.thumbParticipants) ? profile.thumbParticipants : []),
  ];

  entries.forEach((item, index) => {
    const participantKey = String(
      item?.participantKey ||
      buildDefaultThumbParticipantKey(
        item?.participantType,
        item?.linkedUserId || item?.linkedStaffId,
        `${booking?._id || "booking"}-${index}`,
      ),
    ).trim();

    if (!participantKey || seen.has(participantKey)) {
      return;
    }

    seen.add(participantKey);
    next.push({
      participantKey,
      participantType: String(item?.participantType || "other").trim().toLowerCase() || "other",
      participantLabel: String(item?.participantLabel || item?.name || "Participant").trim(),
      userType: String(item?.userType || item?.participantType || "participant").trim().toLowerCase(),
      name: String(item?.name || "").trim(),
      phone: normalizePhoneDigits(item?.phone || ""),
      linkedUserId: item?.linkedUserId || null,
      linkedStaffId: item?.linkedStaffId || null,
      isPrimary: item?.isPrimary === true,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    });
  });

  return next.sort((first, second) => Number(first.sortOrder || 0) - Number(second.sortOrder || 0));
};

const normalizeThumbCode = (value = "") => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "LEFT_THUMB" || normalized === "RIGHT_THUMB" ? normalized : "UNKNOWN_THUMB";
};

const normalizeThumbImageMimeType = (value = "", fallbackUrl = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["image/png", "image/jpeg", "image/jpg", "image/bmp", "image/webp"].includes(normalized)) {
    return normalized === "image/jpg" ? "image/jpeg" : normalized;
  }

  const rawUrl = String(fallbackUrl || "").toLowerCase();
  if (rawUrl.includes(".bmp")) return "image/bmp";
  if (rawUrl.includes(".jpg") || rawUrl.includes(".jpeg")) return "image/jpeg";
  if (rawUrl.includes(".webp")) return "image/webp";
  return "image/png";
};

const normalizeThumbCaptureRecord = (item = {}, participantMap = new Map(), index = 0) => {
  const participantKey = String(item?.participantKey || "").trim();
  const participant = participantMap.get(participantKey) || {};
  const imageUrl = normalizeBiometricPreviewImage(item?.imageUrl || item?.previewImage || "");

  return {
    captureId: String(item?.captureId || `capture-${Date.now()}-${index}`).trim(),
    participantKey,
    participantType: String(item?.participantType || participant?.participantType || "other").trim().toLowerCase() || "other",
    participantLabel: String(item?.participantLabel || participant?.participantLabel || participant?.name || "Participant").trim(),
    userType: String(item?.userType || participant?.userType || participant?.participantType || "participant").trim().toLowerCase(),
    thumbCode: normalizeThumbCode(item?.thumbCode || item?.fingerCode),
    imageUrl,
    fileName: String(item?.fileName || "").trim(),
    mimeType: normalizeThumbImageMimeType(item?.mimeType, imageUrl),
    captureSource: String(item?.captureSource || "unknown").trim().toLowerCase() || "unknown",
    deviceLabel: String(item?.deviceLabel || "").trim(),
    scannerSerial: String(item?.scannerSerial || "").trim(),
    notes: String(item?.notes || "").trim(),
    capturedAt: item?.capturedAt || new Date(),
    updatedAt: item?.updatedAt || new Date(),
  };
};

const serializeBiometricProfile = (profile = {}) => {
  const fingers = Array.isArray(profile?.fingers) ? profile.fingers : [];
  const thumbParticipants = Array.isArray(profile?.thumbParticipants) ? profile.thumbParticipants : [];
  const thumbCaptures = Array.isArray(profile?.thumbCaptures) ? profile.thumbCaptures : [];
  const normalizedRequiredFingerCount = Number(profile?.requiredFingerCount);
  return {
    id: String(profile?._id || ""),
    status: profile?.status || "not_started",
    consentAccepted: profile?.consentAccepted === true,
    consentAcceptedAt: profile?.consentAcceptedAt || null,
    consentNotes: profile?.consentNotes || "",
    enrollmentMode: profile?.enrollmentMode || "optional",
    requiredFingerCount: Number.isInteger(normalizedRequiredFingerCount) && normalizedRequiredFingerCount >= 0 ? normalizedRequiredFingerCount : 0,
    enrolledFingerCount: fingers.length,
    enrolledFingerCodes: fingers.map((item) => String(item?.fingerCode || "")).filter(Boolean),
    thumbParticipantCount: thumbParticipants.length,
    thumbCaptureCount: thumbCaptures.length,
    notes: profile?.notes || "",
    verificationSummary: {
      lastVerifiedAt: profile?.verificationSummary?.lastVerifiedAt || null,
      lastVerificationStatus: profile?.verificationSummary?.lastVerificationStatus || "",
      lastVerifiedFingerCode: profile?.verificationSummary?.lastVerifiedFingerCode || "",
      lastMatchScore: Number(profile?.verificationSummary?.lastMatchScore || 0) || null,
    },
    updatedAt: profile?.updatedAt || null,
    createdAt: profile?.createdAt || null,
    thumbParticipants: thumbParticipants.map((item, index) => ({
      participantKey: String(item?.participantKey || "").trim() || `participant-${index + 1}`,
      participantType: String(item?.participantType || "other").trim().toLowerCase() || "other",
      participantLabel: item?.participantLabel || item?.name || "Participant",
      userType: item?.userType || item?.participantType || "participant",
      name: item?.name || "",
      phone: item?.phone || "",
      linkedUserId: item?.linkedUserId ? String(item.linkedUserId) : "",
      linkedStaffId: item?.linkedStaffId ? String(item.linkedStaffId) : "",
      isPrimary: item?.isPrimary === true,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    })),
    thumbCaptures: thumbCaptures.map((item, index) => ({
      captureId: String(item?.captureId || `capture-${index + 1}`).trim(),
      participantKey: String(item?.participantKey || "").trim(),
      participantType: String(item?.participantType || "other").trim().toLowerCase() || "other",
      participantLabel: item?.participantLabel || "Participant",
      userType: item?.userType || item?.participantType || "participant",
      thumbCode: normalizeThumbCode(item?.thumbCode || item?.fingerCode),
      imageUrl: normalizeBiometricPreviewImage(item?.imageUrl || item?.previewImage || ""),
      previewImage: normalizeBiometricPreviewImage(item?.imageUrl || item?.previewImage || ""),
      fileName: item?.fileName || "",
      mimeType: normalizeThumbImageMimeType(item?.mimeType, item?.imageUrl || item?.previewImage || ""),
      captureSource: item?.captureSource || "unknown",
      deviceLabel: item?.deviceLabel || "",
      scannerSerial: item?.scannerSerial || "",
      notes: item?.notes || "",
      capturedAt: item?.capturedAt || null,
      updatedAt: item?.updatedAt || null,
    })),
    fingers: fingers.map((item) => ({
      fingerCode: String(item?.fingerCode || "").toUpperCase(),
      displayName: item?.displayName || getBiometricFingerDisplayName(item?.fingerCode),
      hand: item?.hand || getBiometricFingerHand(item?.fingerCode),
      templateFormat: item?.templateFormat || "vendor-template",
      qualityScore: Number(item?.qualityScore || 0) || null,
      previewImage: normalizeBiometricPreviewImage(item?.previewImage || "") || buildGeneratedBiometricPreview(item),
      captureSource: item?.captureSource || "unknown",
      deviceLabel: item?.deviceLabel || "",
      scannerSerial: item?.scannerSerial || "",
      sampleCount: Number(item?.sampleCount || 1),
      notes: item?.notes || "",
      capturedAt: item?.capturedAt || null,
      lastVerifiedAt: item?.lastVerifiedAt || null,
      verificationCount: Number(item?.verificationCount || 0),
      templateStored: Boolean(item?.templateEncrypted),
      templateHash: item?.templateHash || "",
      templateHashPreview: item?.templateHash ? String(item.templateHash).slice(0, 10) : "",
    })),
    auditLogs: (Array.isArray(profile?.auditLogs) ? profile.auditLogs : [])
      .slice(-10)
      .reverse()
      .map((log) => ({
        action: log?.action || "",
        fingerCode: log?.fingerCode || "",
        actorId: log?.actorId ? String(log.actorId) : "",
        actorRole: log?.actorRole || "",
        notes: log?.notes || "",
        matchScore: Number(log?.matchScore || 0) || null,
        verificationStatus: log?.verificationStatus || "",
        createdAt: log?.createdAt || null,
      })),
  };
};

const serializeServiceCenterBooking = (item = {}, biometricProfile = null) => ({
  id: String(item._id || item.id || ""),
  _id: item._id,
  bookingReference: item.bookingReference || "",
  customer: {
    id: item.userId?._id ? String(item.userId._id) : "",
    name: item.userId?.name || item.contactName || "",
    phone: item.userId?.phone || item.contactPhone || "",
    email: item.userId?.email || item.contactEmail || "",
  },
  customerDocuments: {
    drivingLicense: {
      imageUrl: item.kycDocuments?.drivingLicense?.imageUrl || "",
      fileName: item.kycDocuments?.drivingLicense?.fileName || "",
      uploadedAt: item.kycDocuments?.drivingLicense?.uploadedAt || null,
    },
    aadhaarCard: {
      imageUrl: item.kycDocuments?.aadhaarCard?.imageUrl || "",
      fileName: item.kycDocuments?.aadhaarCard?.fileName || "",
      uploadedAt: item.kycDocuments?.aadhaarCard?.uploadedAt || null,
    },
  },
  vehicleName: item.vehicleName || item.vehicleTypeId?.name || "",
  vehicleCategory: item.vehicleCategory || item.vehicleTypeId?.vehicleCategory || "",
  vehicleImage: item.vehicleImage || item.vehicleTypeId?.image || "",
  vehicleCoverImage: item.vehicleTypeId?.coverImage || "",
  vehicleGalleryImages: Array.isArray(item.vehicleTypeId?.galleryImages)
    ? item.vehicleTypeId.galleryImages.filter(Boolean)
    : [],
  vehicleAmenities: Array.isArray(item.vehicleTypeId?.amenities)
    ? item.vehicleTypeId.amenities.filter(Boolean)
    : [],
  selectedPackage: {
    packageId: item.selectedPackage?.packageId || "",
    label: item.selectedPackage?.label || "",
    durationHours: Number(item.selectedPackage?.durationHours || 0),
    price: Number(item.selectedPackage?.price || 0),
  },
  serviceLocation: {
    locationId: item.serviceLocation?.locationId || "",
    name: item.serviceLocation?.name || "",
    address: item.serviceLocation?.address || "",
    city: item.serviceLocation?.city || "",
  },
  pickupDateTime: item.pickupDateTime || null,
  returnDateTime: item.returnDateTime || null,
  requestedHours: Number(item.requestedHours || 0),
  totalCost: Number(item.totalCost || 0),
  payableNow: Number(item.payableNow || 0),
  paymentStatus: item.paymentStatus || "pending",
  assignedVehicle: {
    vehicleId: item.assignedVehicle?.vehicleId ? String(item.assignedVehicle.vehicleId) : "",
    name: item.assignedVehicle?.name || "",
    vehicleCategory: item.assignedVehicle?.vehicleCategory || "",
    image: item.assignedVehicle?.image || "",
  },
  serviceCenterIds: Array.isArray(item.serviceCenterIds)
    ? item.serviceCenterIds.map((centerId) => String(centerId))
    : [],
  assignedStaff: {
    id: item.assignedStaffId ? String(item.assignedStaffId) : "",
    name: item.assignedStaffName || "",
    phone: item.assignedStaffPhone || "",
  },
  rentalInspection: {
    beforeHandover: {
      exteriorOk: item.rentalInspection?.beforeHandover?.exteriorOk === true,
      interiorOk: item.rentalInspection?.beforeHandover?.interiorOk === true,
      dashboardOk: item.rentalInspection?.beforeHandover?.dashboardOk === true,
      tyresOk: item.rentalInspection?.beforeHandover?.tyresOk === true,
      fuelOk: item.rentalInspection?.beforeHandover?.fuelOk === true,
      documentsOk: item.rentalInspection?.beforeHandover?.documentsOk === true,
    },
    afterReturn: {
      exteriorChecked: item.rentalInspection?.afterReturn?.exteriorChecked === true,
      interiorChecked: item.rentalInspection?.afterReturn?.interiorChecked === true,
      dashboardChecked: item.rentalInspection?.afterReturn?.dashboardChecked === true,
      fuelChecked: item.rentalInspection?.afterReturn?.fuelChecked === true,
      tyresChecked: item.rentalInspection?.afterReturn?.tyresChecked === true,
      damageReviewed: item.rentalInspection?.afterReturn?.damageReviewed === true,
    },
    pickupNotes: item.rentalInspection?.pickupNotes || "",
    returnNotes: item.rentalInspection?.returnNotes || "",
    pickupMeterReading:
      item.rentalInspection?.pickupMeterReading === null ||
      item.rentalInspection?.pickupMeterReading === undefined
        ? null
        : Number(item.rentalInspection.pickupMeterReading),
    returnMeterReading:
      item.rentalInspection?.returnMeterReading === null ||
      item.rentalInspection?.returnMeterReading === undefined
        ? null
        : Number(item.rentalInspection.returnMeterReading),
    pickupFuelLevel: item.rentalInspection?.pickupFuelLevel || "",
    returnFuelLevel: item.rentalInspection?.returnFuelLevel || "",
    beforeConditionImages: Array.isArray(item.rentalInspection?.beforeConditionImages)
      ? item.rentalInspection.beforeConditionImages.filter(Boolean)
      : [],
    afterConditionImages: Array.isArray(item.rentalInspection?.afterConditionImages)
      ? item.rentalInspection.afterConditionImages.filter(Boolean)
      : [],
    beforeConditionImageDetails: Array.isArray(item.rentalInspection?.beforeConditionImageDetails)
      ? item.rentalInspection.beforeConditionImageDetails
          .map((detail) => serializeInspectionPhotoMetadata(detail))
          .filter((detail) => detail.imageUrl)
      : [],
    afterConditionImageDetails: Array.isArray(item.rentalInspection?.afterConditionImageDetails)
      ? item.rentalInspection.afterConditionImageDetails
          .map((detail) => serializeInspectionPhotoMetadata(detail))
          .filter((detail) => detail.imageUrl)
      : [],
  },
  serviceCenterNote: item.serviceCenterNote || "",
  status: item.status || "pending",
  biometrics: biometricProfile
    ? serializeBiometricProfile(biometricProfile)
    : {
        id: "",
        status: "not_started",
        consentAccepted: false,
        consentAcceptedAt: null,
        consentNotes: "",
        enrollmentMode: "optional",
        requiredFingerCount: 0,
        enrolledFingerCount: 0,
        enrolledFingerCodes: [],
        thumbParticipantCount: 0,
        thumbCaptureCount: 0,
        notes: "",
        verificationSummary: {
          lastVerifiedAt: null,
          lastVerificationStatus: "",
          lastVerifiedFingerCode: "",
          lastMatchScore: null,
        },
        updatedAt: null,
        createdAt: null,
        thumbParticipants: [],
        thumbCaptures: [],
        fingers: [],
        auditLogs: [],
      },
  assignedAt: item.assignedAt || null,
  completedAt: item.completedAt || null,
  createdAt: item.createdAt || null,
  updatedAt: item.updatedAt || null,
});

const mapBiometricProfilesByBookingId = (profiles = []) =>
  new Map(
    (Array.isArray(profiles) ? profiles : [])
      .filter((item) => item?.bookingId)
      .map((item) => [String(item.bookingId), item]),
  );

const buildSerializedServiceCenterBookings = (bookings = [], biometricProfiles = []) => {
  const profileMap = mapBiometricProfilesByBookingId(biometricProfiles);
  return (Array.isArray(bookings) ? bookings : []).map((item) =>
    serializeServiceCenterBooking(item, profileMap.get(String(item?._id || item?.id || "")) || null),
  );
};

const resolveAuthenticatedServiceCenter = async (req) => {
  if (String(req.auth?.role || "").toLowerCase() !== "service_center") {
    return null;
  }

  const center = await ServiceStore.findById(req.auth?.sub)
    .populate("zone_id", "name")
    .populate("service_location_id", "name service_location_name country")
    .lean();

  if (!center || center.active === false || String(center.status || "").toLowerCase() === "inactive") {
    return null;
  }

  return center;
};

const resolveAuthenticatedServiceCenterAccess = async (req) => {
  const role = String(req.auth?.role || "").toLowerCase();

  if (role === "service_center") {
    const center = await resolveAuthenticatedServiceCenter(req);
    if (!center) return null;
    return {
      role,
      center,
      staff: null,
      canManageStaff: true,
      canManageVehicles: true,
      canAssignBookings: true,
    };
  }

  if (role !== "service_center_staff") {
    return null;
  }

  const staff = await ServiceCenterStaff.findById(req.auth?.sub).lean();
  if (!staff || staff.active === false || String(staff.status || "").toLowerCase() === "inactive") {
    return null;
  }

  const center = await ServiceStore.findById(staff.serviceCenterId)
    .populate("zone_id", "name")
    .populate("service_location_id", "name service_location_name country")
    .lean();

  if (!center || center.active === false || String(center.status || "").toLowerCase() === "inactive") {
    return null;
  }

  return {
    role,
    center,
    staff,
    canManageStaff: false,
    canManageVehicles: false,
    canAssignBookings: false,
  };
};

const ensureServiceCenterStaffTargetAccess = async (req, staffId = "") => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id) {
    throw new ApiError(403, "Service center access is required");
  }

  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    throw new ApiError(400, "Valid staff id is required");
  }

  const staff = await ServiceCenterStaff.findOne({
    _id: staffId,
    serviceCenterId: center._id,
  });

  if (!staff) {
    throw new ApiError(404, "Service center staff member not found");
  }

  if (
    access.role === "service_center_staff" &&
    String(access.staff?._id || "") !== String(staff._id || "")
  ) {
    throw new ApiError(403, "Staff can only manage their own biometric profile");
  }

  return { access, center, staff };
};

const serializeDriverNotification = (item = {}) => ({
  id: String(item._id || ""),
  title: String(item.push_title || "").trim(),
  body: String(item.message || "").trim(),
  image: String(item.image || "").trim(),
  sendTo: String(item.send_to || "all").trim(),
  serviceLocationName: String(item.service_location_name || "").trim(),
  sentAt: item.sent_at || item.createdAt || null,
  createdAt: item.createdAt || null,
});

const serializeDriverScheduledRide = (ride = {}, currentDriverId = "") => ({
  rideId: String(ride._id || ""),
  type: ride.serviceType || "ride",
  serviceType: ride.serviceType || "ride",
  status: ride.status || RIDE_STATUS.SEARCHING,
  liveStatus: ride.liveStatus || RIDE_LIVE_STATUS.SEARCHING,
  fare: Number(ride.fare || 0),
  baseFare: Number(ride.baseFare || ride.fare || 0),
  bookingMode: ride.bookingMode || "normal",
  estimatedDistanceMeters: Number(ride.estimatedDistanceMeters || 0),
  estimatedDurationMinutes: Number(ride.estimatedDurationMinutes || 0),
  paymentMethod: ride.paymentMethod || "cash",
  pickupLocation: ride.pickupLocation || null,
  pickupAddress: ride.pickupAddress || "",
  dropLocation: ride.dropLocation || null,
  dropAddress: ride.dropAddress || "",
  scheduledAt: ride.scheduledAt || null,
  parcel: ride.parcel || null,
  intercity: ride.intercity || null,
  driverId: ride.driverId ? String(ride.driverId) : null,
  isAssignedToCurrentDriver:
    Boolean(ride.driverId) && String(ride.driverId) === String(currentDriverId || ""),
  vehicleTypeId: ride.vehicleTypeId ? String(ride.vehicleTypeId) : null,
  vehicleTypeIds: Array.isArray(ride.dispatchVehicleTypeIds)
    ? ride.dispatchVehicleTypeIds.map((item) => String(item))
    : [],
  serviceLocationId: ride.service_location_id ? String(ride.service_location_id) : null,
  transportType: ride.transport_type || "taxi",
  user: ride.userId
    ? {
        id: String(ride.userId._id || ""),
        name: ride.userId.name || "Customer",
        phone: ride.userId.phone || "",
        countryCode: ride.userId.countryCode || "",
      }
    : null,
  createdAt: ride.createdAt || null,
  updatedAt: ride.updatedAt || null,
});

export const registerDriver = async (req, res) => {
  const { name, phone, password, vehicleType, location } = req.body;

  if (!name || !phone || !password || !vehicleType || !location) {
    throw new ApiError(
      400,
      "name, phone, password, vehicleType and location are required",
    );
  }

  const existingDriver = await Driver.findOne({ phone });

  if (existingDriver) {
    throw new ApiError(409, "Phone number is already registered");
  }

  const coordinates = normalizePoint(location, "location");
  const zone = await findZoneByPickup(coordinates);

  const driver = await Driver.create({
    name,
    phone,
    password: await hashPassword(password),
    vehicleType,
    approve: true,
    status: "approved",
    zoneId: zone?._id || null,
    location: toPoint(coordinates, "location"),
  });

  const token = signAccessToken({ sub: String(driver._id), role: "driver" });

  res.status(201).json({
    success: true,
    data: {
      token,
      driver: {
        id: driver._id,
        name: driver.name,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        rating: driver.rating,
        status: driver.status,
      },
    },
  });
};

export const loginDriver = async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    throw new ApiError(400, "phone and password are required");
  }

  const driver = await Driver.findOne({ phone }).select("+password");

  if (!driver || !(await comparePassword(password, driver.password))) {
    throw new ApiError(401, "Invalid phone or password");
  }

  if (
    driver.approve === false ||
    String(driver.status || "").toLowerCase() === "pending"
  ) {
    throw new ApiError(403, "Driver account is pending approval");
  }

  await clearDriverActiveRideIfStale(driver);

  const token = signAccessToken({ sub: String(driver._id), role: "driver" });

  res.json({
    success: true,
    data: {
      token,
      driver: {
        id: driver._id,
        name: driver.name,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        isOnline: driver.isOnline,
        isOnRide: driver.isOnRide,
        status: driver.status,
      },
    },
  });
};

export const goOnline = async (req, res) => {
  const { location, selfieImageUrl } = req.body;

  const coordinates = normalizePoint(location, "location");
  const zone = await findZoneByPickup(coordinates);
  const existingDriver = await Driver.findById(req.auth.sub);

  if (!existingDriver) {
    throw new ApiError(404, "Driver not found");
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const hasTodaySelfie =
    String(existingDriver.onlineSelfie?.forDate || "") === todayKey &&
    String(existingDriver.onlineSelfie?.imageUrl || "").trim();

  if (!hasTodaySelfie && !String(selfieImageUrl || "").trim()) {
    throw new ApiError(400, "A selfie is required before going online today");
  }

  if (!existingDriver.owner_id) {
    await ensureDriverWalletCanAcceptRide(existingDriver);
  }
  await clearDriverActiveRideIfStale(existingDriver);
  const trackingBeforeOnline = mergeOnlineSessionIntoTracking(
    existingDriver.incentiveTracking || {},
    existingDriver.incentiveTracking?.currentOnlineStartedAt,
    new Date(),
  );
  const nextTodaySummary = buildDriverTodaySummaryFromDocument(existingDriver);

  const nextOnlineSelfie =
    hasTodaySelfie && !String(selfieImageUrl || "").trim()
      ? existingDriver.onlineSelfie
      : {
          imageUrl: String(selfieImageUrl || "").trim(),
          capturedAt: new Date(),
          uploadedAt: new Date(),
          forDate: todayKey,
        };

  const driver = await Driver.findByIdAndUpdate(
    req.auth.sub,
    {
      isOnline: true,
      zoneId: zone?._id || null,
      ...(existingDriver.owner_id ? { 'wallet.isBlocked': false } : {}),
      location: toPoint(coordinates, "location"),
      onlineSelfie: nextOnlineSelfie,
      incentiveTracking: {
        ...trackingBeforeOnline,
        currentOnlineStartedAt: new Date(),
        claimedRewards: pruneClaimedRewards(trackingBeforeOnline?.claimedRewards),
      },
      todaySummary: nextTodaySummary,
    },
    { returnDocument: 'after' },
  );

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const vehicleIconUrl = await resolveVehicleMapIcon(driver.vehicleTypeId);

  res.json({
    success: true,
    data: {
      ...driver.toObject(),
      vehicleIconUrl,
      onlineSelfie: driver.onlineSelfie || {},
    },
  });

  notifyLateAvailableDriver(driver._id).catch((error) => {
    console.error("Failed to notify late-available driver on goOnline", error);
  });
};

export const getCurrentDriver = async (req, res) => {
  if (String(req.auth?.role || "").toLowerCase() === "service_center_staff") {
    const access = await resolveAuthenticatedServiceCenterAccess(req);

    if (!access?.staff || !access?.center) {
      throw new ApiError(404, "Service center staff not found");
    }

    res.json({
      success: true,
      data: serializeServiceCenterStaffProfile(access.staff, access.center),
    });
    return;
  }

  if (String(req.auth?.role || "").toLowerCase() === "service_center") {
    const center = await resolveAuthenticatedServiceCenter(req);

    if (!center) {
      throw new ApiError(404, "Service center not found");
    }

    res.json({
      success: true,
      data: serializeServiceCenterProfile(center),
    });
    return;
  }

  if (String(req.auth?.role || "").toLowerCase() === "owner") {
    const owner = await Owner.findById(req.auth.sub);

    if (!owner) {
      throw new ApiError(404, "Owner not found");
    }

    res.json({
      success: true,
      data: serializeOwnerProfile(owner.toObject()),
    });
    return;
  }

  if (String(req.auth?.role || "").toLowerCase() === "bus_driver") {
    const busDriver = await BusDriver.findById(req.auth.sub);

    if (!busDriver) {
      throw new ApiError(404, "Bus driver not found");
    }

    res.json({
      success: true,
      data: await serializeBusDriverProfile(busDriver),
    });
    return;
  }

  if (String(req.auth?.role || "").toLowerCase() === "pooling_driver") {
    const poolingVehicle = await PoolingVehicle.findById(req.auth.sub).lean();

    if (!poolingVehicle) {
      throw new ApiError(404, "Pooling driver not found");
    }

    res.json({
      success: true,
      data: serializePoolingDriverProfile(poolingVehicle),
    });
    return;
  }

  const driver = await Driver.findById(req.auth.sub)
    .populate("zoneId", "name service_location_id");

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  if (!String(driver.referralCode || "").trim()) {
    driver.referralCode = generateDriverReferralCode(driver);
    await driver.save();
  }

  await clearDriverActiveRideIfStale(driver);
  const vehicleIconUrl = await resolveVehicleMapIcon(driver.vehicleTypeId);
  const todaySummary = await syncDriverTodaySummaryDocument(driver);

  res.json({
    success: true,
    data: {
      id: driver._id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      owner_id: driver.owner_id || null,
      salary: Number(driver.salary || 0),
      profileImage: driver.profileImage || "",
      gender: driver.gender,
      vehicleType: driver.vehicleType,
      vehicleTypeId: driver.vehicleTypeId,
      vehicleIconType: driver.vehicleIconType,
      vehicleIconUrl,
      vehicleMake: driver.vehicleMake,
      vehicleModel: driver.vehicleModel,
      registerFor: driver.registerFor,
      vehicleNumber: driver.vehicleNumber,
      vehicleColor: driver.vehicleColor,
      vehicleImage: driver.vehicleImage || "",
      city: driver.city,
      approve: driver.approve,
      status: driver.status,
      rating: driver.rating,
      wallet: await serializeDriverWallet(driver),
      bankDetails: serializeDriverBankDetails(driver.bankDetails),
      referralCode: driver.referralCode || "",
      deletionRequest: driver.deletionRequest || { status: "none" },
      isOnline: driver.isOnline,
      isOnRide: driver.isOnRide,
      onlineSelfie: driver.onlineSelfie || {},
      location: driver.location,
      zoneId: driver.zoneId?._id || driver.zoneId || null,
      zone: driver.zoneId
        ? {
            id: String(driver.zoneId._id || driver.zoneId),
            name: driver.zoneId.name || "",
            service_location_id: driver.zoneId.service_location_id
              ? String(driver.zoneId.service_location_id)
              : "",
          }
        : null,
      routeBooking: serializeDriverRouteBooking(driver.routeBooking),
      documents: driver.documents || {},
      emergencyContacts: Array.isArray(driver.emergencyContacts)
        ? driver.emergencyContacts.map(serializeEmergencyContact)
        : [],
      onboarding: driver.onboarding || {},
      todaySummary: todaySummary || buildDriverTodaySummaryFromDocument(driver),
    },
  });
};

export const getPoolingDriverBookings = async (req, res) => {
  if (String(req.auth?.role || "").toLowerCase() !== "pooling_driver") {
    throw new ApiError(403, "Pooling driver access is required");
  }

  const bookings = await PoolingBooking.find({ vehicle: req.auth.sub })
    .populate("user", "name phone email")
    .populate("route", "routeName originLabel destinationLabel")
    .sort({ travelDate: -1, createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: bookings.map(serializePoolingDriverBooking),
  });
};

export const getDriverEmergencyContacts = async (req, res) => {
  const driver = await Driver.findById(req.auth.sub).lean();

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  res.json({
    success: true,
    data: {
      results: Array.isArray(driver.emergencyContacts)
        ? driver.emergencyContacts.map(serializeEmergencyContact)
        : [],
      limit: MAX_EMERGENCY_CONTACTS,
    },
  });
};

export const getDriverNotifications = async (req, res) => {
  const driver = await Driver.findById(req.auth.sub).lean();

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const serviceLocationId = driver.service_location_id || null;
  const query = {
    status: "sent",
    send_to: { $in: ["all", "drivers"] },
  };

  if (serviceLocationId) {
    query.$or = [
      { service_location_id: serviceLocationId },
      { send_to: "all" },
      { send_to: "drivers" },
    ];
  }

  const notifications = await Notification.find(query)
    .sort({ sent_at: -1, createdAt: -1 })
    .limit(100)
    .lean();

  res.json({
    success: true,
    data: {
      results: notifications.map(serializeDriverNotification),
    },
  });
};

export const getDriverScheduledRides = async (req, res) => {
  const driver = await Driver.findById(req.auth.sub)
    .select("service_location_id vehicleTypeId")
    .lean();

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const safePage = Math.max(1, Number(req.query?.page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(req.query?.limit) || 20));
  const openScheduledRideQuery = {
    driverId: null,
    status: RIDE_STATUS.SEARCHING,
    liveStatus: RIDE_LIVE_STATUS.SEARCHING,
    ...(driver.service_location_id ? { service_location_id: driver.service_location_id } : {}),
  };

  if (driver.vehicleTypeId) {
    openScheduledRideQuery.$or = [
      { vehicleTypeId: driver.vehicleTypeId },
      { dispatchVehicleTypeIds: driver.vehicleTypeId },
    ];
  }

  const query = {
    scheduledAt: { $ne: null, $gte: new Date() },
    $or: [
      openScheduledRideQuery,
      {
        driverId: req.auth.sub,
        status: { $in: [RIDE_STATUS.SEARCHING, RIDE_STATUS.ACCEPTED] },
        liveStatus: {
          $in: [
            RIDE_LIVE_STATUS.SEARCHING,
            RIDE_LIVE_STATUS.ACCEPTED,
            RIDE_LIVE_STATUS.ARRIVING,
          ],
        },
      },
    ],
  };

  const [rides, totalCount] = await Promise.all([
    Ride.find(query)
      .sort({ scheduledAt: 1, createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .select([
        "serviceType",
        "status",
        "liveStatus",
        "fare",
        "baseFare",
        "bookingMode",
        "estimatedDistanceMeters",
        "estimatedDurationMinutes",
        "paymentMethod",
        "pickupLocation",
        "pickupAddress",
        "dropLocation",
        "dropAddress",
        "scheduledAt",
        "driverId",
        "parcel",
        "intercity",
        "vehicleTypeId",
        "dispatchVehicleTypeIds",
        "service_location_id",
        "transport_type",
        "userId",
        "createdAt",
        "updatedAt",
      ].join(" "))
      .populate("userId", "name phone countryCode")
      .lean(),
    Ride.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      results: rides.map((ride) => serializeDriverScheduledRide(ride, req.auth.sub)),
      totalCount,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / safeLimit)),
        hasNextPage: safePage * safeLimit < totalCount,
        hasPrevPage: safePage > 1,
      },
    },
  });
};

export const cancelDriverScheduledRide = async (req, res) => {
  const rideId = toCleanString(req.params?.rideId);

  if (!rideId) {
    throw new ApiError(400, "Ride id is required");
  }

  const ride = await cancelScheduledRideByDriver({
    rideId,
    driverId: req.auth.sub,
  });

  if (!ride) {
    throw new ApiError(404, "Scheduled ride not found for this driver");
  }

  res.json({
    success: true,
    message: "Scheduled ride cancelled successfully",
    data: {
      rideId: String(ride._id || ""),
      status: ride.status || RIDE_STATUS.CANCELLED,
      liveStatus: ride.liveStatus || RIDE_LIVE_STATUS.CANCELLED,
    },
  });
};

const DRIVER_PUSH_ROLE_MODEL_MAP = {
  driver: Driver,
  owner: Owner,
  pooling_driver: PoolingVehicle,
  bus_driver: BusDriver,
  service_center: ServiceStore,
  service_center_staff: ServiceCenterStaff,
};

const resolvePushTokenEntityForRole = async (req) => {
  const role = String(req.auth?.role || "").toLowerCase();
  const Model = DRIVER_PUSH_ROLE_MODEL_MAP[role];

  if (!Model) {
    throw new ApiError(403, "Unsupported role for driver push notifications");
  }

  const entity = await Model.findById(req.auth?.sub);

  if (!entity) {
    throw new ApiError(404, "Authenticated account not found");
  }

  if (
    role === "service_center" &&
    (entity.active === false ||
      String(entity.status || "").toLowerCase() === "inactive")
  ) {
    throw new ApiError(403, "Service center account is inactive");
  }

  if (
    role === "service_center_staff" &&
    (entity.active === false ||
      String(entity.status || "").toLowerCase() === "inactive")
  ) {
    throw new ApiError(403, "Service center staff account is inactive");
  }

  return entity;
};

export const saveDriverFcmToken = async (req, res) => {
  const entity = await resolvePushTokenEntityForRole(req);

  const saved = assignPushTokenToEntity(entity, {
    token: req.body?.token,
    platform: req.body?.platform,
  });

  await entity.save();

  res.json({
    success: true,
    data: {
      message: "FCM token saved successfully",
      platform: saved.platform,
      field: saved.fieldName,
      role: String(req.auth?.role || "").toLowerCase(),
    },
  });
};

export const addDriverEmergencyContact = async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const phone = sanitizeEmergencyPhone(req.body?.phone);
  const source =
    String(req.body?.source || "manual").toLowerCase() === "device"
      ? "device"
      : "manual";

  if (!name) {
    throw new ApiError(400, "Contact name is required");
  }

  if (!EMERGENCY_CONTACT_NAME_REGEX.test(name)) {
    throw new ApiError(400, "Contact name can contain alphabets only");
  }

  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, "A valid 10-digit contact number is required");
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const existingContacts = Array.isArray(driver.emergencyContacts)
    ? driver.emergencyContacts
    : [];

  if (existingContacts.length >= MAX_EMERGENCY_CONTACTS) {
    throw new ApiError(
      400,
      `You can add up to ${MAX_EMERGENCY_CONTACTS} emergency contacts`,
    );
  }

  if (
    existingContacts.some(
      (contact) => sanitizeEmergencyPhone(contact.phone) === phone,
    )
  ) {
    throw new ApiError(409, "This contact number is already added");
  }

  driver.emergencyContacts = [
    ...existingContacts,
    {
      name: name.slice(0, 80),
      phone,
      source,
    },
  ];

  await driver.save();

  const addedContact =
    driver.emergencyContacts[driver.emergencyContacts.length - 1];

  res.status(201).json({
    success: true,
    data: serializeEmergencyContact(addedContact),
  });
};

export const deleteDriverEmergencyContact = async (req, res) => {
  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const existingContacts = Array.isArray(driver.emergencyContacts)
    ? driver.emergencyContacts
    : [];
  const nextContacts = existingContacts.filter(
    (contact) => String(contact._id) !== String(req.params.contactId),
  );

  if (nextContacts.length === existingContacts.length) {
    throw new ApiError(404, "Emergency contact not found");
  }

  driver.emergencyContacts = nextContacts;
  await driver.save();

  res.json({
    success: true,
    data: {
      deleted: true,
      results: driver.emergencyContacts.map(serializeEmergencyContact),
    },
  });
};

export const updateCurrentDriver = async (req, res) => {
  if (String(req.auth?.role || "").toLowerCase() === "owner") {
    throw new ApiError(403, "Owner profile editing is not available from this screen");
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
    const name = String(req.body.name || "").trim();
    if (!DRIVER_NAME_REGEX.test(name)) {
      throw new ApiError(400, "Full name can contain alphabets only");
    }
    driver.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "email")) {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    if (email && !EMAIL_REGEX.test(email)) {
      throw new ApiError(400, "Enter a valid email address");
    }
    driver.email = email;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "profileImage")) {
    driver.profileImage = String(req.body.profileImage || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "routeBooking")) {
    const routeBookingPayload = req.body?.routeBooking || {};
    const enabled = Boolean(routeBookingPayload?.enabled);

    if (!enabled) {
      driver.routeBooking = {
        enabled: false,
        anchorLocation: null,
        label: "",
        updatedAt: new Date(),
      };
    } else {
      const coordinates = normalizePoint(
        routeBookingPayload?.coordinates || routeBookingPayload?.anchorLocation,
        "routeBooking.coordinates",
      );

      driver.routeBooking = {
        enabled: true,
        anchorLocation: toPoint(coordinates, "routeBooking.coordinates"),
        label: String(routeBookingPayload?.label || "").trim(),
        updatedAt: new Date(),
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "bankDetails")) {
    driver.bankDetails = normalizeDriverBankDetails(
      req.body?.bankDetails || {},
      driver.bankDetails || {},
    );
  }

  await driver.save();

  res.json({
    success: true,
    data: {
      id: driver._id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      profileImage: driver.profileImage || "",
      routeBooking: serializeDriverRouteBooking(driver.routeBooking),
      bankDetails: serializeDriverBankDetails(driver.bankDetails),
    },
  });
};

export const verifyCurrentDriverBankDetails = async (req, res) => {
  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const mode = String(req.body?.mode || "penny_less").trim().toLowerCase();
  const bankDetails = serializeDriverBankDetails(driver.bankDetails || {});

  if (!bankDetails.accountNumber) {
    throw new ApiError(400, "Please save your account number first");
  }

  if (!bankDetails.ifsc) {
    throw new ApiError(400, "Please save your IFSC code first");
  }

  if (mode !== "v3" && !bankDetails.accountHolderName) {
    throw new ApiError(400, "Please save account holder name first");
  }

  const providerResponse = await verifyBankAccountWithRecharge({
    accountNumber: bankDetails.accountNumber,
    ifscCode: bankDetails.ifsc,
    accountHolderName: bankDetails.accountHolderName,
    partnerRequestId: buildDriverBankVerificationRequestId(driver),
    mode,
  });

  const accountDetails = providerResponse?.cardData?.response?.account_details || {};
  const verification = resolveRechargeVerificationState(providerResponse);

  driver.bankDetails = {
    ...(driver.bankDetails?.toObject?.() || driver.bankDetails || {}),
    verificationStatus: verification.status,
    verificationMode: mode,
    verificationMessage: verification.message,
    verificationReferenceId: String(
      providerResponse?.orderid
      || providerResponse?.optransid
      || providerResponse?.cardData?.request_id
      || providerResponse?.data?.requestId
      || "",
    ).trim(),
    verifiedBankName: String(accountDetails?.bank_name || "").trim(),
    verifiedBranchName: String(accountDetails?.branch_name || "").trim(),
    verifiedAccountHolderName: String(accountDetails?.beneficiary_name || "").trim(),
    verifiedAt: verification.succeeded ? new Date() : driver.bankDetails?.verifiedAt || null,
    updatedAt: driver.bankDetails?.updatedAt || new Date(),
  };

  await driver.save();

  res.json({
    success: true,
    data: {
      bankDetails: serializeDriverBankDetails(driver.bankDetails),
      verification: providerResponse,
    },
  });
};

export const verifyCurrentDriverUpiDetails = async (req, res) => {
  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const bankDetails = serializeDriverBankDetails(driver.bankDetails || {});
  const mode = String(req.body?.mode || "basic").trim().toLowerCase();

  if (!bankDetails.upiId) {
    throw new ApiError(400, "Please save your UPI ID first");
  }

  const providerResponse = await verifyUpiWithRecharge({
    upiId: bankDetails.upiId,
    partnerRequestId: buildDriverUpiVerificationRequestId(driver),
    mode,
  });

  const result = providerResponse?.cardData?.result || {};
  const vpaDetails = result?.vpa_details || {};
  const accountDetails = result?.account_details || {};
  const verification = resolveRechargeVerificationState(providerResponse);

  driver.bankDetails = {
    ...(driver.bankDetails?.toObject?.() || driver.bankDetails || {}),
    upiVerificationStatus: verification.status,
    upiVerificationMode: mode,
    upiVerificationMessage: verification.message,
    upiVerificationReferenceId: String(
      providerResponse?.orderid ||
      providerResponse?.cardData?.request_id ||
      providerResponse?.cardData?.client_ref_num ||
      "",
    ).trim(),
    upiVerifiedName: String(vpaDetails?.account_holder_name || "").trim(),
    upiAccountIfsc: String(accountDetails?.account_ifsc || "").trim(),
    upiAccountType: String(accountDetails?.account_type || "").trim(),
    upiVerifiedAt: verification.succeeded ? new Date() : driver.bankDetails?.upiVerifiedAt || null,
    updatedAt: driver.bankDetails?.updatedAt || new Date(),
  };

  await driver.save();

  res.json({
    success: true,
    data: {
      bankDetails: serializeDriverBankDetails(driver.bankDetails),
      verification: providerResponse,
    },
  });
};

export const verifyCurrentDriverLicenseDocument = async (req, res) => {
  const documentKey = String(req.params.documentKey || "").trim();

  if (!documentKey) {
    throw new ApiError(400, "Document key is required");
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const existingDocument = driver.documents?.[documentKey] || {};
  const licenseNumber = String(
    existingDocument.identifyNumber ||
    existingDocument.identify_number ||
    existingDocument.documentNumber ||
    existingDocument.document_number ||
    req.body?.licenseNumber ||
    req.body?.license_no ||
    "",
  ).trim().toUpperCase();
  const birthDate = String(
    existingDocument.birthDate ||
    existingDocument.birth_date ||
    req.body?.birthDate ||
    req.body?.birth_date ||
    "",
  ).trim();
  const requestNumber = String(
    existingDocument.requestNumber ||
    existingDocument.request_no ||
    req.body?.requestNumber ||
    req.body?.request_no ||
    "",
  ).trim();

  if (!licenseNumber) {
    throw new ApiError(400, "Driving license number is required before verification");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) && !/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate)) {
    throw new ApiError(400, "Birth date must use YYYY-MM-DD or DD/MM/YYYY format before verification");
  }

  const providerResponse = await verifyDrivingLicenseWithRecharge({
    licenseNumber,
    birthDate,
    partnerRequestId: buildDriverLicenseVerificationRequestId(driver),
    requestNumber,
  });

  const result = providerResponse?.cardData?.result || {};
  const licenseDetails = result?.details_of_driving_licence || {};
  const nonTransportValidity = result?.dl_validity?.non_transport || {};
  const badgeDetails = Array.isArray(result?.badge_details) ? result.badge_details : [];
  const firstBadge = badgeDetails[0] || {};
  const verification = resolveRechargeVerificationState(
    providerResponse,
    String(licenseDetails?.status || "").trim(),
  );
  const verificationMessage = verification.message;

  const updatedDocument = {
    ...(typeof existingDocument === "object" ? existingDocument : {}),
    key: documentKey,
    identifyNumber: licenseNumber,
    identify_number: licenseNumber,
    documentNumber: licenseNumber,
    document_number: licenseNumber,
    birthDate,
    birth_date: birthDate,
    requestNumber: String(
      providerResponse?.partnerreqid ||
      providerResponse?.cardData?.request_id ||
      providerResponse?.orderid ||
      requestNumber,
    ).trim(),
    request_no: String(
      providerResponse?.partnerreqid ||
      providerResponse?.cardData?.request_id ||
      providerResponse?.orderid ||
      requestNumber,
    ).trim(),
    verificationStatus: verification.status,
    verifiedAt: verification.succeeded ? new Date().toISOString() : existingDocument.verifiedAt || null,
    verificationMessage,
    verificationReferenceId: String(
      providerResponse?.orderid ||
      providerResponse?.partnerreqid ||
      providerResponse?.cardData?.request_id ||
      "",
    ).trim(),
    verifiedName: String(licenseDetails?.name || "").trim(),
    verifiedDob: String(result?.dob || birthDate).trim(),
    dlStatus: String(licenseDetails?.status || "").trim(),
    issuingRtoName: "",
    relativeName: String(licenseDetails?.father_or_husband_name || "").trim(),
    dlNumber: String(result?.dl_number || licenseNumber).trim(),
    nonTransportValidFrom: String(nonTransportValidity?.from || "").trim(),
    nonTransportValidTo: String(nonTransportValidity?.to || "").trim(),
    transportValidFrom: String(result?.dl_validity?.transport?.from || "").trim(),
    transportValidTo: String(result?.dl_validity?.transport?.to || "").trim(),
    badgeNumber: String(firstBadge?.badge_no || "").trim(),
    badgeIssueDate: String(firstBadge?.badge_issue_date || "").trim(),
    classOfVehicle: Array.isArray(firstBadge?.class_of_vehicle) ? firstBadge.class_of_vehicle : [],
    verificationResponse: providerResponse,
  };

  driver.documents = {
    ...(driver.documents || {}),
    [documentKey]: updatedDocument,
  };

  driver.markModified("documents");
  await driver.save();

  res.json({
    success: true,
    data: {
      document: updatedDocument,
      documents: driver.documents || {},
      verification: providerResponse,
    },
  });
};

export const verifyCurrentDriverPanDocument = async (req, res) => {
  const documentKey = String(req.params.documentKey || "").trim();

  if (!documentKey) {
    throw new ApiError(400, "Document key is required");
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const existingDocument = driver.documents?.[documentKey] || {};
  const panNumber = String(
    existingDocument.identifyNumber ||
    existingDocument.identify_number ||
    existingDocument.documentNumber ||
    existingDocument.document_number ||
    req.body?.panNumber ||
    req.body?.pan_no ||
    "",
  ).trim().toUpperCase();

  const providerResponse = await verifyPanWithRecharge({
    panNumber,
    partnerRequestId: buildDriverPanVerificationRequestId(driver),
  });

  const cardData = providerResponse?.cardData || {};
  const verification = resolveRechargeVerificationState(providerResponse);
  const verificationMessage = verification.message;

  const updatedDocument = {
    ...(typeof existingDocument === "object" ? existingDocument : {}),
    key: documentKey,
    identifyNumber: panNumber,
    identify_number: panNumber,
    documentNumber: panNumber,
    document_number: panNumber,
    verificationStatus: verification.status,
    verifiedAt: verification.succeeded ? new Date().toISOString() : existingDocument.verifiedAt || null,
    verificationMessage,
    verificationReferenceId: String(
      providerResponse?.orderid ||
      providerResponse?.optransid ||
      cardData?.reference_id ||
      "",
    ).trim(),
    panType: String(cardData?.type || "").trim(),
    verifiedName: String(cardData?.registered_name || "").trim(),
    fatherName: String(cardData?.father_name || "").trim(),
    panValid: String(cardData?.valid || "").trim(),
    verificationResponse: providerResponse,
  };

  driver.documents = {
    ...(driver.documents || {}),
    [documentKey]: updatedDocument,
  };

  driver.markModified("documents");
  await driver.save();

  res.json({
    success: true,
    data: {
      document: updatedDocument,
      documents: driver.documents || {},
      verification: providerResponse,
    },
  });
};

export const verifyCurrentDriverGstinDocument = async (req, res) => {
  const documentKey = String(req.params.documentKey || "").trim();

  if (!documentKey) {
    throw new ApiError(400, "Document key is required");
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const existingDocument = driver.documents?.[documentKey] || {};
  const gstin = String(
    existingDocument.identifyNumber ||
    existingDocument.identify_number ||
    existingDocument.documentNumber ||
    existingDocument.document_number ||
    req.body?.gstin ||
    req.body?.GSTIN ||
    "",
  ).trim().toUpperCase();

  const providerResponse = await verifyGstinWithRecharge({
    gstin,
    partnerRequestId: buildDriverGstinVerificationRequestId(driver),
  });

  const result = providerResponse?.cardData?.result || {};
  const taxpayerDetails = result?.taxpayerDetails || {};
  const verification = resolveRechargeVerificationState(providerResponse);
  const verificationMessage = verification.message;

  const updatedDocument = {
    ...(typeof existingDocument === "object" ? existingDocument : {}),
    key: documentKey,
    identifyNumber: gstin,
    identify_number: gstin,
    documentNumber: gstin,
    document_number: gstin,
    verificationStatus: verification.status,
    verifiedAt: verification.succeeded ? new Date().toISOString() : existingDocument.verifiedAt || null,
    verificationMessage,
    verificationReferenceId: String(
      providerResponse?.orderid ||
      providerResponse?.optransid ||
      providerResponse?.cardData?.request_id ||
      "",
    ).trim(),
    verifiedName: String(taxpayerDetails?.lgnm || taxpayerDetails?.tradeNam || "").trim(),
    gstStatus: String(taxpayerDetails?.sts || "").trim(),
    gstType: String(taxpayerDetails?.dty || "").trim(),
    gstConstitution: String(taxpayerDetails?.ctb || "").trim(),
    verificationResponse: providerResponse,
  };

  driver.documents = {
    ...(driver.documents || {}),
    [documentKey]: updatedDocument,
  };

  driver.markModified("documents");
  await driver.save();

  res.json({
    success: true,
    data: {
      document: updatedDocument,
      documents: driver.documents || {},
      verification: providerResponse,
    },
  });
};

export const verifyCurrentDriverRcDocument = async (req, res) => {
  const documentKey = String(req.params.documentKey || "").trim();

  if (!documentKey) {
    throw new ApiError(400, "Document key is required");
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const existingDocument = driver.documents?.[documentKey] || {};
  const rcNumber = String(
    existingDocument.identifyNumber ||
    existingDocument.identify_number ||
    existingDocument.documentNumber ||
    existingDocument.document_number ||
    req.body?.rcNumber ||
    req.body?.rc_no ||
    "",
  ).trim().toUpperCase();

  const providerResponse = await verifyRcWithRecharge({
    rcNumber,
    partnerRequestId: buildDriverRcVerificationRequestId(driver),
  });

  const result = providerResponse?.cardData?.result || {};
  const verification = resolveRechargeVerificationState(providerResponse);
  const verificationMessage = verification.message;

  const updatedDocument = {
    ...(typeof existingDocument === "object" ? existingDocument : {}),
    key: documentKey,
    identifyNumber: rcNumber,
    identify_number: rcNumber,
    documentNumber: rcNumber,
    document_number: rcNumber,
    verificationStatus: verification.status,
    verifiedAt: verification.succeeded ? new Date().toISOString() : existingDocument.verifiedAt || null,
    verificationMessage,
    verificationReferenceId: String(
      providerResponse?.orderid ||
      providerResponse?.optransid ||
      providerResponse?.cardData?.request_id ||
      "",
    ).trim(),
    verifiedName: String(result?.owner_name || "").trim(),
    rcStatus: String(result?.status || "").trim(),
    vehicleModel: String(result?.model || "").trim(),
    vehicleManufacturer: String(result?.vehicle_manufacturer_name || "").trim(),
    vehicleRegistrationDate: String(result?.reg_date || "").trim(),
    vehicleInsuranceUpto: String(result?.vehicle_insurance_upto || "").trim(),
    vehicleFitnessUpto: String(result?.fitness_upto || result?.vehicle_fitness_upto || "").trim(),
    permitNumber: String(result?.permit_no || result?.permit_number || "").trim(),
    permitValidUpto: String(result?.permit_valid_upto || result?.permit_upto || "").trim(),
    pucNumber: String(
      result?.vehicle_pucc_number ||
      result?.pucc_number ||
      result?.pucc_no ||
      result?.puc_number ||
      result?.puc_no ||
      "",
    ).trim(),
    pucValidUpto: String(
      result?.vehicle_pucc_upto ||
      result?.pucc_upto ||
      result?.puc_valid_upto ||
      result?.puc_upto ||
      "",
    ).trim(),
    verificationResponse: providerResponse,
  };

  driver.documents = {
    ...(driver.documents || {}),
    [documentKey]: updatedDocument,
  };

  driver.markModified("documents");
  await driver.save();

  res.json({
    success: true,
    data: {
      document: updatedDocument,
      documents: driver.documents || {},
      verification: providerResponse,
    },
  });
};

export const verifyCurrentDriverBankDocument = async (req, res) => {
  const documentKey = String(req.params.documentKey || "").trim();

  if (!documentKey) {
    throw new ApiError(400, "Document key is required");
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const existingDocument = driver.documents?.[documentKey] || {};
  const accountNumber = String(
    existingDocument.identifyNumber ||
    existingDocument.identify_number ||
    existingDocument.documentNumber ||
    existingDocument.document_number ||
    req.body?.accountNumber ||
    req.body?.bank_account ||
    "",
  ).trim().replace(/\s/g, "");
  const ifscCode = String(
    existingDocument.ifsc ||
    existingDocument.ifscCode ||
    existingDocument.ifsc_code ||
    req.body?.ifsc ||
    req.body?.ifscCode ||
    req.body?.ifsc_code ||
    "",
  ).trim().toUpperCase();
  const accountHolderName = String(
    existingDocument.accountHolderName ||
    existingDocument.account_holder_name ||
    existingDocument.beneficiaryName ||
    existingDocument.benificiary_name ||
    req.body?.accountHolderName ||
    req.body?.account_holder_name ||
    req.body?.beneficiaryName ||
    req.body?.benificiary_name ||
    driver.bankDetails?.accountHolderName ||
    "",
  ).trim();
  const mode = String(req.body?.mode || "penny_less").trim().toLowerCase();

  if (!accountNumber) {
    throw new ApiError(400, "Bank account number is required before verification");
  }

  if (!ifscCode) {
    throw new ApiError(400, "IFSC code is required before verification");
  }

  if (mode !== "v3" && !accountHolderName) {
    throw new ApiError(400, "Account holder name is required before verification");
  }

  const providerResponse = await verifyBankAccountWithRecharge({
    accountNumber,
    ifscCode,
    accountHolderName,
    partnerRequestId: buildDriverBankVerificationRequestId(driver),
    mode,
  });

  const accountDetails = providerResponse?.cardData?.response?.account_details || {};
  const verification = resolveRechargeVerificationState(providerResponse);
  const verificationMessage = verification.message;

  const updatedDocument = {
    ...(typeof existingDocument === "object" ? existingDocument : {}),
    key: documentKey,
    identifyNumber: accountNumber,
    identify_number: accountNumber,
    documentNumber: accountNumber,
    document_number: accountNumber,
    ifsc: ifscCode,
    ifscCode,
    ifsc_code: ifscCode,
    accountHolderName,
    account_holder_name: accountHolderName,
    beneficiaryName: accountHolderName,
    benificiary_name: accountHolderName,
    verificationStatus: verification.status,
    verifiedAt: verification.succeeded ? new Date().toISOString() : existingDocument.verifiedAt || null,
    verificationMode: mode,
    verificationMessage,
    verificationReferenceId: String(
      providerResponse?.orderid ||
      providerResponse?.optransid ||
      providerResponse?.cardData?.request_id ||
      providerResponse?.data?.requestId ||
      "",
    ).trim(),
    verifiedName: String(accountDetails?.beneficiary_name || accountHolderName).trim(),
    verifiedBankName: String(accountDetails?.bank_name || "").trim(),
    verifiedBranchName: String(accountDetails?.branch_name || "").trim(),
    verificationResponse: providerResponse,
  };

  driver.documents = {
    ...(driver.documents || {}),
    [documentKey]: updatedDocument,
  };

  driver.markModified("documents");
  await driver.save();

  res.json({
    success: true,
    data: {
      document: updatedDocument,
      documents: driver.documents || {},
      verification: providerResponse,
    },
  });
};

export const requestDriverAccountDeletion = async (req, res) => {
  const driverId = req.auth?.sub;
  const reason = String(req.body?.reason || "").trim();

  if (!reason) {
    throw new ApiError(400, "Deletion reason is required");
  }

  const driver = await Driver.findById(driverId);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  if (
    driver.deletedAt ||
    driver.approve === false ||
    String(driver.status || "").toLowerCase() === "inactive"
  ) {
    throw new ApiError(400, "Account is already inactive");
  }

  if (driver.deletionRequest?.status === "pending") {
    res.json({
      success: true,
      data: {
        deletionRequestStatus: "pending",
        requestedAt: driver.deletionRequest.requestedAt || null,
      },
      message: "Deletion request is already pending admin review",
    });
    return;
  }

  driver.deletionRequest = {
    status: "pending",
    reason: reason.slice(0, 300),
    requestedAt: new Date(),
    reviewedAt: null,
    reviewedBy: null,
    adminNote: "",
  };

  await driver.save();

  res.status(201).json({
    success: true,
    data: {
      deletionRequestStatus: driver.deletionRequest.status,
      requestedAt: driver.deletionRequest.requestedAt,
    },
  });
};

export const updateCurrentDriverDocument = async (req, res) => {
  const documentKey = String(req.params.documentKey || "").trim();
  const document = req.body?.document || {};

  if (!documentKey) {
    throw new ApiError(400, "Document key is required");
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const existingDocument = driver.documents?.[documentKey] || {};
  const previewUrl = String(
    document.previewUrl || document.secureUrl || document.url || existingDocument.previewUrl || existingDocument.secureUrl || existingDocument.url || "",
  ).trim();

  if (!previewUrl) {
    throw new ApiError(400, "Uploaded document image URL is required");
  }

  const existingStatus = String(
    existingDocument.status ||
    existingDocument.verificationStatus ||
    existingDocument.approvalStatus ||
    existingDocument.reviewStatus ||
    "",
  ).trim().toLowerCase();

  const updatedDocument = {
    ...(typeof existingDocument === "object" ? existingDocument : {}),
    ...(typeof document === "object" ? document : {}),
    key: documentKey,
    fileName: String(document.fileName || documentKey).trim(),
    fileNames: [String(document.fileName || documentKey).trim()],
    uploaded: true,
    uploadedAt: new Date().toISOString(),
    previewUrl,
    secureUrl: String(document.secureUrl || previewUrl).trim(),
    imageUrl: previewUrl,
    images: [previewUrl],
    identifyNumber: String(
      document.identifyNumber ||
      document.identify_number ||
      document.documentNumber ||
      document.document_number ||
      existingDocument.identifyNumber ||
      existingDocument.identify_number ||
      existingDocument.documentNumber ||
      existingDocument.document_number ||
      "",
    ).trim().toUpperCase(),
    identify_number: String(
      document.identifyNumber ||
      document.identify_number ||
      document.documentNumber ||
      document.document_number ||
      existingDocument.identifyNumber ||
      existingDocument.identify_number ||
      existingDocument.documentNumber ||
      existingDocument.document_number ||
      "",
    ).trim().toUpperCase(),
    documentNumber: String(
      document.identifyNumber ||
      document.identify_number ||
      document.documentNumber ||
      document.document_number ||
      existingDocument.identifyNumber ||
      existingDocument.identify_number ||
      existingDocument.documentNumber ||
      existingDocument.document_number ||
      "",
    ).trim().toUpperCase(),
    document_number: String(
      document.identifyNumber ||
      document.identify_number ||
      document.documentNumber ||
      document.document_number ||
      existingDocument.identifyNumber ||
      existingDocument.identify_number ||
      existingDocument.documentNumber ||
      existingDocument.document_number ||
      "",
    ).trim().toUpperCase(),
    birthDate: String(document.birthDate || document.birth_date || existingDocument.birthDate || existingDocument.birth_date || "").trim(),
    birth_date: String(document.birthDate || document.birth_date || existingDocument.birthDate || existingDocument.birth_date || "").trim(),
    expiryDate: String(document.expiryDate || document.expiry_date || existingDocument.expiryDate || existingDocument.expiry_date || "").trim(),
    expiry_date: String(document.expiryDate || document.expiry_date || existingDocument.expiryDate || existingDocument.expiry_date || "").trim(),
    expiresAt: String(document.expiryDate || document.expiry_date || existingDocument.expiryDate || existingDocument.expiry_date || "").trim(),
    status: document.status ? String(document.status).trim() : "pending",
    verificationStatus: document.verificationStatus ? String(document.verificationStatus).trim() : "pending",
    reviewStatus: document.reviewStatus ? String(document.reviewStatus).trim() : "pending",
    comment: document.comment !== undefined ? String(document.comment || "").trim() : "",
    remarks: document.remarks !== undefined ? String(document.remarks || "").trim() : "",
    reason: document.reason !== undefined ? String(document.reason || "").trim() : "",
    admin_comment: document.admin_comment !== undefined ? String(document.admin_comment || "").trim() : "",
    rejection_reason: document.rejection_reason !== undefined ? String(document.rejection_reason || "").trim() : "",
    reviewedAt: null,
    reverificationRequestedAt: new Date().toISOString(),
  };

  driver.documents = {
    ...(driver.documents || {}),
    [documentKey]: updatedDocument,
  };

  driver.markModified("documents");
  await driver.save();

  res.json({
    success: true,
    data: {
      document: updatedDocument,
      documents: driver.documents || {},
    },
  });
};

export const deleteCurrentDriverAccount = async (req, res) => {
  const driverId = req.auth?.sub;
  const authRole = String(req.auth?.role || "").toLowerCase();
  const reason = String(req.body?.reason || "").trim();

  if (authRole === "owner") {
    const owner = await Owner.findById(driverId);

    if (!owner) {
      throw new ApiError(404, "Owner not found");
    }

    if (owner.deletedAt) {
      res.json({
        success: true,
        data: {
          deleted: true,
          softDeleted: true,
          ownerId: String(owner._id),
        },
        message: "Owner account already deleted",
      });
      return;
    }

    const deletionReason =
      reason ||
      owner.deletionRequest?.reason ||
      owner.deletion_reason ||
      "Deleted by account owner";
    const now = new Date();

    owner.deletedAt = now;
    owner.deletion_reason = deletionReason.slice(0, 300);
    owner.active = false;
    owner.approve = false;
    owner.status = "inactive";
    owner.deletionRequest = {
      ...(owner.deletionRequest || {}),
      status: "approved",
      reason: deletionReason.slice(0, 300),
      requestedAt: owner.deletionRequest?.requestedAt || now,
      reviewedAt: now,
      reviewedBy: null,
      adminNote: "",
    };

    await owner.save();

    await DriverLoginSession.deleteMany({
      $or: [{ driverId: owner._id }, { phone: owner.mobile }, { phone: owner.phone }],
    });

    res.json({
      success: true,
      data: {
        deleted: true,
        softDeleted: true,
        ownerId: String(owner._id),
      },
      message: "Owner account deleted successfully",
    });
    return;
  }

  const activeRide = await Ride.findOne({
    driverId,
    status: { $in: [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] },
  }).select("_id status");

  if (activeRide) {
    throw new ApiError(409, "Complete or cancel your active ride before deleting your account");
  }

  const driver = await Driver.findById(driverId);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  if (driver.deletedAt) {
    res.json({
      success: true,
      data: {
        deleted: true,
        softDeleted: true,
        driverId: String(driver._id),
      },
      message: "Driver account already deleted",
    });
    return;
  }

  const deletionReason = reason || driver.deletionRequest?.reason || driver.deletion_reason || "Deleted by account owner";
  const now = new Date();

  driver.deletedAt = now;
  driver.deletion_reason = deletionReason.slice(0, 300);
  driver.approve = false;
  driver.status = "inactive";
  driver.isOnline = false;
  driver.isOnRide = false;
  driver.socketId = null;
  driver.deletionRequest = {
    ...(driver.deletionRequest || {}),
    status: "approved",
    reason: deletionReason.slice(0, 300),
    requestedAt: driver.deletionRequest?.requestedAt || now,
    reviewedAt: now,
    reviewedBy: null,
    adminNote: "",
  };

  await driver.save();

  await DriverLoginSession.deleteMany({
    $or: [
      { driverId: driver._id },
      { phone: driver.phone },
    ],
  });

  res.json({
    success: true,
    data: {
      deleted: true,
      softDeleted: true,
      driverId: String(driver._id),
    },
    message: "Driver account deleted successfully",
  });
};

export const getMyWallet = async (req, res) => {
  if (String(req.auth?.role || "").toLowerCase() === "owner") {
    const owner = await Owner.findById(req.auth.sub).lean();

    if (!owner) {
      throw new ApiError(404, "Owner not found");
    }

    res.json({
      success: true,
      data: {
        wallet: {
          balance: Number(owner.wallet?.balance || 0),
          currency: "INR",
        },
        transactions: [],
        withdrawalRequests: [],
        settings: await getWalletSettings(),
      },
    });
    return;
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const transactions = await WalletTransaction.find({ driverId: req.auth.sub })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  const withdrawalRequests = await WithdrawalRequest.find({ driver_id: req.auth.sub })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  const walletSettings = await getWalletSettings();

  res.json({
    success: true,
    data: {
      wallet: await serializeDriverWallet(driver),
      transactions,
      withdrawalRequests,
      settings: walletSettings,
    },
  });
};

export const getServiceCenterVehicles = async (req, res) => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id) {
    throw new ApiError(403, "Service center access is required");
  }

  const items = await listRentalVehicleTypes();
  const centerId = String(center._id);
  const results = items.filter((item) =>
    Array.isArray(item.serviceStoreIds) && item.serviceStoreIds.includes(centerId),
  );

  res.json({
    success: true,
    data: {
      serviceCenter: {
        id: centerId,
        name: center.name || "",
      },
      results,
    },
  });
};

export const createServiceCenterVehicle = async (req, res) => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id || !access?.canManageVehicles) {
    throw new ApiError(403, "Service center access is required");
  }

  const payload = {
    ...req.body,
    transport_type: "rental",
    serviceStoreIds: [String(center._id)],
    status: req.body?.status === "inactive" ? "inactive" : "active",
  };

  const created = await createRentalVehicleType(payload);

  res.json({
    success: true,
    data: created,
  });
};

export const deleteServiceCenterVehicle = async (req, res) => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id || !access?.canManageVehicles) {
    throw new ApiError(403, "Service center access is required");
  }

  const vehicle = await RentalVehicleType.findById(req.params.vehicleId).lean();

  if (!vehicle) {
    throw new ApiError(404, "Rental vehicle type not found");
  }

  const storeIds = Array.isArray(vehicle.serviceStoreIds)
    ? vehicle.serviceStoreIds.map((item) => String(item))
    : [];

  if (!storeIds.includes(String(center._id))) {
    throw new ApiError(403, "You can only manage vehicles assigned to your service center");
  }

  await deleteRentalVehicleType(req.params.vehicleId);

  res.json({
    success: true,
    data: true,
  });
};

export const updateServiceCenterVehicle = async (req, res) => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id || !access?.canManageVehicles) {
    throw new ApiError(403, "Service center access is required");
  }

  const vehicle = await RentalVehicleType.findById(req.params.vehicleId).lean();

  if (!vehicle) {
    throw new ApiError(404, "Rental vehicle type not found");
  }

  const storeIds = Array.isArray(vehicle.serviceStoreIds)
    ? vehicle.serviceStoreIds.map((item) => String(item))
    : [];

  if (!storeIds.includes(String(center._id))) {
    throw new ApiError(403, "You can only manage vehicles assigned to your service center");
  }

  const updated = await updateRentalVehicleType(req.params.vehicleId, {
    ...req.body,
    transport_type: "rental",
    serviceStoreIds: [String(center._id)],
  });

  res.json({
    success: true,
    data: updated,
  });
};

export const getServiceCenterStaffMembers = async (req, res) => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id || !access?.canManageStaff) {
    throw new ApiError(403, "Only service center owners can manage staff");
  }

  const [staffItems, bookingCounts] = await Promise.all([
    ServiceCenterStaff.find({ serviceCenterId: center._id }).sort({ createdAt: -1 }).lean(),
    RentalBookingRequest.aggregate([
      {
        $match: {
          assignedStaffId: { $ne: null },
          serviceCenterIds: center._id,
          status: { $in: ["pending", "confirmed", "assigned", "end_requested"] },
        },
      },
      {
        $group: {
          _id: "$assignedStaffId",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const countMap = new Map(bookingCounts.map((item) => [String(item._id), Number(item.count || 0)]));

  res.json({
    success: true,
    data: {
      serviceCenter: {
        id: String(center._id),
        name: center.name || "",
      },
      results: staffItems.map((item) => serializeServiceCenterStaff(item, countMap.get(String(item._id)) || 0)),
    },
  });
};

export const createServiceCenterStaffMember = async (req, res) => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id || !access?.canManageStaff) {
    throw new ApiError(403, "Only service center owners can manage staff");
  }

  const name = String(req.body?.name || "").trim();
  const phone = String(req.body?.phone || "").replace(/\D/g, "").slice(-10);

  if (!name) {
    throw new ApiError(400, "Staff name is required");
  }

  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, "Staff login number must be a valid 10-digit number");
  }

  const existing = await ServiceCenterStaff.findOne({ phone }).lean();
  if (existing) {
    throw new ApiError(409, "A staff account already exists with this number");
  }

  const created = await ServiceCenterStaff.create({
    serviceCenterId: center._id,
    name,
    phone,
    active: true,
    status: "active",
  });

  res.json({
    success: true,
    data: serializeServiceCenterStaff(created.toObject(), 0),
  });
};

export const updateServiceCenterStaffMember = async (req, res) => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id || !access?.canManageStaff) {
    throw new ApiError(403, "Only service center owners can manage staff");
  }

  const staffId = String(req.params?.staffId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    throw new ApiError(400, "Valid staff id is required");
  }

  const staff = await ServiceCenterStaff.findOne({
    _id: staffId,
    serviceCenterId: center._id,
  });

  if (!staff) {
    throw new ApiError(404, "Service center staff member not found");
  }

  if (req.body?.name !== undefined) {
    const name = String(req.body.name || "").trim();
    if (!name) {
      throw new ApiError(400, "Staff name is required");
    }
    staff.name = name;
  }

  if (req.body?.phone !== undefined) {
    const phone = String(req.body.phone || "").replace(/\D/g, "").slice(-10);
    if (!/^\d{10}$/.test(phone)) {
      throw new ApiError(400, "Staff login number must be a valid 10-digit number");
    }

    const existing = await ServiceCenterStaff.findOne({
      phone,
      _id: { $ne: staff._id },
    }).lean();

    if (existing) {
      throw new ApiError(409, "A staff account already exists with this number");
    }

    staff.phone = phone;
  }

  if (req.body?.active !== undefined || req.body?.status !== undefined) {
    const nextActive = req.body?.active !== undefined ? Boolean(req.body.active) : staff.active !== false;
    const nextStatus = String(req.body?.status || (nextActive ? "active" : "inactive")).trim().toLowerCase();

    staff.active = nextActive;
    staff.status = nextStatus === "inactive" ? "inactive" : "active";
  }

  await staff.save();

  const bookingCount = await RentalBookingRequest.countDocuments({
    assignedStaffId: staff._id,
    serviceCenterIds: center._id,
    status: { $in: ["pending", "confirmed", "assigned", "end_requested"] },
  });

  res.json({
    success: true,
    data: serializeServiceCenterStaff(staff.toObject(), bookingCount),
  });
};

export const deleteServiceCenterStaffMember = async (req, res) => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id || !access?.canManageStaff) {
    throw new ApiError(403, "Only service center owners can manage staff");
  }

  const staffId = String(req.params?.staffId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    throw new ApiError(400, "Valid staff id is required");
  }

  const staff = await ServiceCenterStaff.findOne({
    _id: staffId,
    serviceCenterId: center._id,
  }).lean();

  if (!staff) {
    throw new ApiError(404, "Service center staff member not found");
  }

  await RentalBookingRequest.updateMany(
    {
      assignedStaffId: staff._id,
      serviceCenterIds: center._id,
    },
    {
      $set: {
        assignedStaffId: null,
        assignedStaffName: "",
        assignedStaffPhone: "",
      },
    },
  );

  await ServiceCenterStaff.deleteOne({ _id: staff._id });

  res.json({
    success: true,
    data: true,
  });
};

export const getServiceCenterStaffBiometrics = async (req, res) => {
  const { staff } = await ensureServiceCenterStaffTargetAccess(
    req,
    String(req.params?.staffId || "").trim(),
  );

  res.json({
    success: true,
    data: {
      staff: serializeServiceCenterStaff(staff.toObject(), 0),
      biometrics: serializeServiceCenterStaffBiometrics(staff.toObject()),
    },
  });
};

export const enrollServiceCenterStaffBiometric = async (req, res) => {
  const requestedStaffId = String(req.body?.staffId || req.params?.staffId || "").trim();
  const { access, staff } = await ensureServiceCenterStaffTargetAccess(req, requestedStaffId);

  const fingerCode = String(req.body?.fingerCode || req.body?.fingerName || "").trim().toUpperCase();
  const templateData = String(req.body?.template || req.body?.templateData || "").trim();
  const source = String(req.body?.source || "unknown").trim().toLowerCase();
  const templateFormat = String(req.body?.templateFormat || "vendor-template").trim();
  const previewImage = normalizeBiometricPreviewImage(req.body?.previewImage || req.body?.imageBase64 || "");
  const qualityScore = req.body?.qualityScore === undefined || req.body?.qualityScore === null
    ? null
    : Number(req.body.qualityScore);

  if (!BIOMETRIC_FINGER_CODES.includes(fingerCode)) {
    throw new ApiError(400, "Valid fingerCode is required");
  }

  if (!templateData) {
    throw new ApiError(400, "template is required");
  }

  if (!BIOMETRIC_CAPTURE_SOURCES.includes(source)) {
    throw new ApiError(400, "Invalid source");
  }

  if (qualityScore !== null && (!Number.isFinite(qualityScore) || qualityScore < 0)) {
    throw new ApiError(400, "qualityScore must be a positive number");
  }

  staff.biometrics = Array.isArray(staff.biometrics) ? staff.biometrics : [];
  const existingIndex = staff.biometrics.findIndex(
    (item) => String(item?.fingerCode || "").trim().toUpperCase() === fingerCode,
  );

  const nextBiometric = {
    fingerCode,
    displayName: getBiometricFingerDisplayName(fingerCode),
    templateEncrypted: encryptBiometricTemplate(templateData),
    templateHash: buildBiometricTemplateHash(templateData),
    templateFormat,
    source,
    qualityScore,
    lastUpdated: new Date(),
    lastVerifiedAt: existingIndex >= 0 ? staff.biometrics[existingIndex]?.lastVerifiedAt || null : null,
    verificationCount: existingIndex >= 0 ? Number(staff.biometrics[existingIndex]?.verificationCount || 0) : 0,
  };

  if (existingIndex >= 0) {
    staff.biometrics.splice(existingIndex, 1, nextBiometric);
  } else {
    staff.biometrics.push(nextBiometric);
  }

  await staff.save();

  res.status(201).json({
    success: true,
    data: {
      enrolledByRole: access.role,
      staff: serializeServiceCenterStaff(staff.toObject(), 0),
      biometrics: serializeServiceCenterStaffBiometrics(staff.toObject()),
    },
  });
};

const ensureServiceCenterBookingAccess = async (req, bookingId = "") => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id) {
    throw new ApiError(403, "Service center access is required");
  }

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, "Valid booking id is required");
  }

  const booking = await RentalBookingRequest.findById(bookingId)
    .populate("userId", "name phone email")
    .populate("vehicleTypeId", "name vehicleCategory image coverImage galleryImages amenities");

  if (!booking) {
    throw new ApiError(404, "Rental booking request not found");
  }

  const centerIds = Array.isArray(booking.serviceCenterIds)
    ? booking.serviceCenterIds.map((item) => String(item))
    : [];

  if (!centerIds.includes(String(center._id))) {
    throw new ApiError(403, "This booking is not assigned to your service center");
  }

  if (access.staff?._id && String(booking.assignedStaffId || "") !== String(access.staff._id)) {
    throw new ApiError(403, "Staff can only manage biometrics for bookings assigned to them");
  }

  return { access, center, booking };
};

const ensureBiometricProfileForBooking = async ({ booking, center, access }) => {
  let profile = await CustomerBiometricProfile.findOne({ bookingId: booking._id });

  if (!profile) {
    profile = await CustomerBiometricProfile.create({
      bookingId: booking._id,
      userId: booking.userId?._id || booking.userId || null,
      serviceCenterId: center._id,
      capturedByStaffId: access.staff?._id || null,
      status: "not_started",
      thumbParticipants: getDefaultThumbParticipantsForBooking(booking.toObject ? booking.toObject() : booking),
    });
  }

  const mergedParticipants = mergeThumbParticipantsForBooking(
    profile.toObject ? profile.toObject() : profile,
    booking.toObject ? booking.toObject() : booking,
  );
  const currentParticipants = Array.isArray(profile.thumbParticipants) ? profile.thumbParticipants : [];
  if (JSON.stringify(currentParticipants) !== JSON.stringify(mergedParticipants)) {
    profile.thumbParticipants = mergedParticipants;
  }

  return profile;
};

const appendBiometricAuditLog = (profile, log = {}) => {
  profile.auditLogs = Array.isArray(profile.auditLogs) ? profile.auditLogs : [];
  profile.auditLogs.push({
    action: log.action || "updated",
    fingerCode: String(log.fingerCode || "").trim().toUpperCase(),
    actorId: log.actorId || null,
    actorRole: log.actorRole || "",
    notes: log.notes || "",
    matchScore: Number(log.matchScore || 0) || null,
    verificationStatus: log.verificationStatus || "",
    createdAt: new Date(),
  });

  if (profile.auditLogs.length > 50) {
    profile.auditLogs = profile.auditLogs.slice(-50);
  }
};

export const getServiceCenterBookings = async (req, res) => {
  const access = await resolveAuthenticatedServiceCenterAccess(req);
  const center = access?.center;

  if (!center?._id) {
    throw new ApiError(403, "Service center access is required");
  }

  const query = {
    serviceCenterIds: center._id,
  };

  if (access.staff?._id) {
    query.assignedStaffId = access.staff._id;
  }

  const bookings = await RentalBookingRequest.find(query)
    .populate("userId", "name phone email")
    .populate("vehicleTypeId", "name vehicleCategory image coverImage galleryImages amenities")
    .sort({ createdAt: -1 })
    .lean();

  const staffItems = access.canManageStaff
    ? await ServiceCenterStaff.find({ serviceCenterId: center._id, active: true, status: "active" })
        .sort({ name: 1 })
        .lean()
    : [];
  const biometricProfiles = await CustomerBiometricProfile.find({
    bookingId: {
      $in: bookings.map((item) => item._id).filter(Boolean),
    },
  }).lean();

  res.json({
    success: true,
    data: {
      permissions: {
        canManageStaff: access.canManageStaff,
        canManageVehicles: access.canManageVehicles,
        canAssignBookings: access.canAssignBookings,
      },
      results: buildSerializedServiceCenterBookings(bookings, biometricProfiles),
      staff: staffItems.map((item) => serializeServiceCenterStaff(item, 0)),
    },
  });
};

export const getServiceCenterBookingBiometrics = async (req, res) => {
  const { booking, center, access } = await ensureServiceCenterBookingAccess(
    req,
    String(req.params?.bookingId || "").trim(),
  );

  const profile = await ensureBiometricProfileForBooking({ booking, center, access });

  res.json({
    success: true,
    data: {
      booking: serializeServiceCenterBooking(booking.toObject(), profile.toObject()),
      biometrics: serializeBiometricProfile(profile.toObject()),
    },
  });
};

export const updateServiceCenterBookingBiometrics = async (req, res) => {
  const { booking, center, access } = await ensureServiceCenterBookingAccess(
    req,
    String(req.params?.bookingId || "").trim(),
  );
  const profile = await ensureBiometricProfileForBooking({ booking, center, access });

  if (req.body?.consentAccepted !== undefined) {
    profile.consentAccepted = normalizeBoolean(req.body.consentAccepted);
    profile.consentAcceptedAt = profile.consentAccepted ? new Date() : null;
  }

  if (req.body?.consentNotes !== undefined) {
    profile.consentNotes = String(req.body.consentNotes || "").trim();
  }

  if (req.body?.enrollmentMode !== undefined) {
    const enrollmentMode = String(req.body.enrollmentMode || "").trim().toLowerCase();
    if (!BIOMETRIC_ENROLLMENT_MODES.includes(enrollmentMode)) {
      throw new ApiError(400, "Invalid enrollment mode");
    }
    profile.enrollmentMode = enrollmentMode;
  }

  if (req.body?.requiredFingerCount !== undefined) {
    const requiredFingerCount = Number(req.body.requiredFingerCount);
    if (!Number.isInteger(requiredFingerCount) || requiredFingerCount < 0 || requiredFingerCount > 10) {
      throw new ApiError(400, "requiredFingerCount must be between 0 and 10");
    }
    profile.requiredFingerCount = requiredFingerCount;
  }

  if (req.body?.notes !== undefined) {
    profile.notes = String(req.body.notes || "").trim();
  }

  if (req.body?.thumbParticipants !== undefined) {
    if (!Array.isArray(req.body.thumbParticipants)) {
      throw new ApiError(400, "thumbParticipants must be an array");
    }

    const nextParticipants = req.body.thumbParticipants.map((item, index) => ({
      participantKey: String(
        item?.participantKey ||
        buildDefaultThumbParticipantKey(
          item?.participantType,
          item?.linkedUserId || item?.linkedStaffId,
          `${booking._id}-${index}`,
        ),
      ).trim(),
      participantType: String(item?.participantType || "other").trim().toLowerCase() || "other",
      participantLabel: String(item?.participantLabel || item?.name || "Participant").trim(),
      userType: String(item?.userType || item?.participantType || "participant").trim().toLowerCase(),
      name: String(item?.name || "").trim(),
      phone: normalizePhoneDigits(item?.phone || ""),
      linkedUserId: item?.linkedUserId && mongoose.Types.ObjectId.isValid(item.linkedUserId) ? item.linkedUserId : null,
      linkedStaffId: item?.linkedStaffId && mongoose.Types.ObjectId.isValid(item.linkedStaffId) ? item.linkedStaffId : null,
      isPrimary: item?.isPrimary === true,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    })).filter((item) => item.participantKey);

    profile.thumbParticipants = mergeThumbParticipantsForBooking(
      { thumbParticipants: nextParticipants },
      booking.toObject(),
    );
  }

  if (req.body?.thumbCaptures !== undefined) {
    if (!Array.isArray(req.body.thumbCaptures)) {
      throw new ApiError(400, "thumbCaptures must be an array");
    }

    const participantMap = new Map(
      (Array.isArray(profile.thumbParticipants) ? profile.thumbParticipants : []).map((item) => [String(item?.participantKey || "").trim(), item]),
    );

    const nextCaptures = [];
    for (const [index, item] of req.body.thumbCaptures.entries()) {
      const rawImage = String(
        item?.imageUrl ||
        item?.previewImage ||
        item?.imageBase64 ||
        item?.base64Image ||
        "",
      ).trim();

      let imageUrl = normalizeBiometricPreviewImage(rawImage);
      if (imageUrl.startsWith("data:image/")) {
        const uploaded = await uploadDataUrlToCloudinary({
          dataUrl: imageUrl,
          folder: `${env.cloudinary.folder}/service-center/booking-${String(booking._id || "").trim()}/thumbs`,
          publicIdPrefix: `thumb-${String(item?.participantKey || "participant").replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}-${String(item?.thumbCode || "thumb").toLowerCase()}`,
        });
        imageUrl = uploaded.secureUrl;
      }

      const normalized = normalizeThumbCaptureRecord(
        {
          ...item,
          imageUrl,
          updatedAt: new Date(),
        },
        participantMap,
        index,
      );

      if (!normalized.participantKey) {
        throw new ApiError(400, "Each thumb capture must include participantKey");
      }

      if (!normalized.imageUrl) {
        throw new ApiError(400, "Each thumb capture must include an image");
      }

      nextCaptures.push(normalized);
    }

    profile.thumbCaptures = nextCaptures;
  }

  if (req.body?.status !== undefined) {
    const nextStatus = String(req.body.status || "").trim().toLowerCase();
    if (!BIOMETRIC_STATUSES.includes(nextStatus)) {
      throw new ApiError(400, "Invalid biometric status");
    }
    profile.status = nextStatus;
  } else if (req.body?.thumbCaptures !== undefined) {
    const thumbCaptureCount = Array.isArray(profile.thumbCaptures) ? profile.thumbCaptures.length : 0;
    const requiredFingerCount = Number(profile.requiredFingerCount);
    const normalizedRequiredFingerCount =
      Number.isInteger(requiredFingerCount) && requiredFingerCount >= 0 ? requiredFingerCount : 0;

    if (thumbCaptureCount === 0) {
      profile.status = "not_started";
    } else if (normalizedRequiredFingerCount > 0 && thumbCaptureCount >= normalizedRequiredFingerCount) {
      profile.status = "completed";
    } else {
      profile.status = "in_progress";
    }
  }

  if (access.staff?._id) {
    profile.capturedByStaffId = access.staff._id;
  }

  appendBiometricAuditLog(profile, {
    action: "profile_updated",
    actorId: access.staff?._id || center._id,
    actorRole: access.role,
    notes: "Biometric enrollment settings updated",
  });

  await profile.save();

  res.json({
    success: true,
    data: {
      booking: serializeServiceCenterBooking(booking.toObject(), profile.toObject()),
      biometrics: serializeBiometricProfile(profile.toObject()),
    },
  });
};

export const captureServiceCenterBookingFingerprint = async (req, res) => {
  const { booking, center, access } = await ensureServiceCenterBookingAccess(
    req,
    String(req.params?.bookingId || "").trim(),
  );
  const profile = await ensureBiometricProfileForBooking({ booking, center, access });

  if (!profile.consentAccepted) {
    throw new ApiError(400, "Customer consent is required before capturing fingerprints");
  }

  const fingerCode = String(req.body?.fingerCode || "").trim().toUpperCase();
  const templateData = String(req.body?.templateData || "").trim();
  const templateFormat = String(req.body?.templateFormat || "vendor-template").trim();
  const previewImage = normalizeBiometricPreviewImage(
    req.body?.previewImage ||
    req.body?.imageBase64 ||
    req.body?.base64Image ||
    req.body?.previewBase64 ||
    req.body?.bitmap ||
    req.body?.bitmapBase64 ||
    req.body?.bmpBase64 ||
    req.body?.imageData ||
    req.body?.fingerprintImage ||
    req.body?.fingerImage ||
    req.body?.image ||
    req.body?.imageUrl ||
    "",
  );
  const qualityScore = req.body?.qualityScore === undefined || req.body?.qualityScore === null
    ? null
    : Number(req.body.qualityScore);
  const captureSource = String(req.body?.captureSource || "unknown").trim().toLowerCase();
  const deviceLabel = String(req.body?.deviceLabel || "").trim();
  const scannerSerial = String(req.body?.scannerSerial || "").trim();
  const sampleCount = Number(req.body?.sampleCount || 1);
  const notes = String(req.body?.notes || "").trim();

  if (!BIOMETRIC_FINGER_CODES.includes(fingerCode)) {
    throw new ApiError(400, "Valid fingerCode is required");
  }

  if (!templateData) {
    throw new ApiError(400, "templateData is required");
  }

  if (!isValidBiometricTemplate(templateData)) {
    throw new ApiError(400, "The captured fingerprint data is invalid or too short. Ensure the scanner bridge is returning raw template data.");
  }

  if (!BIOMETRIC_CAPTURE_SOURCES.includes(captureSource)) {
    throw new ApiError(400, "Invalid capture source");
  }

  if (qualityScore !== null && (!Number.isFinite(qualityScore) || qualityScore < 0)) {
    throw new ApiError(400, "qualityScore must be a positive number");
  }

  if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 10) {
    throw new ApiError(400, "sampleCount must be between 1 and 10");
  }

  profile.fingers = Array.isArray(profile.fingers) ? profile.fingers : [];
  const existingIndex = profile.fingers.findIndex(
    (item) => String(item?.fingerCode || "").trim().toUpperCase() === fingerCode,
  );

  const nextFinger = {
    fingerCode,
    displayName: getBiometricFingerDisplayName(fingerCode),
    hand: getBiometricFingerHand(fingerCode),
    templateFormat,
    templateEncrypted: encryptBiometricTemplate(templateData),
    templateHash: buildBiometricTemplateHash(templateData),
    previewImage,
    qualityScore,
    captureSource,
    deviceLabel,
    scannerSerial,
    sampleCount,
    notes,
    capturedAt: new Date(),
    lastVerifiedAt: existingIndex >= 0 ? profile.fingers[existingIndex]?.lastVerifiedAt || null : null,
    verificationCount: existingIndex >= 0 ? Number(profile.fingers[existingIndex]?.verificationCount || 0) : 0,
  };

  if (existingIndex >= 0) {
    profile.fingers.splice(existingIndex, 1, nextFinger);
  } else {
    profile.fingers.push(nextFinger);
  }

  const requiredFingerCount = Number(profile.requiredFingerCount);
  const normalizedRequiredFingerCount = Number.isInteger(requiredFingerCount) && requiredFingerCount >= 0 ? requiredFingerCount : 0;
  profile.status = profile.fingers.length >= normalizedRequiredFingerCount ? "completed" : "in_progress";
  if (access.staff?._id) {
    profile.capturedByStaffId = access.staff._id;
  }

  appendBiometricAuditLog(profile, {
    action: "finger_captured",
    fingerCode,
    actorId: access.staff?._id || center._id,
    actorRole: access.role,
    notes: notes || `Fingerprint captured for ${getBiometricFingerDisplayName(fingerCode)}`,
  });

  await profile.save();

  res.status(201).json({
    success: true,
    data: {
      booking: serializeServiceCenterBooking(booking.toObject(), profile.toObject()),
      biometrics: serializeBiometricProfile(profile.toObject()),
    },
  });
};

export const deleteServiceCenterBookingFingerprint = async (req, res) => {
  const { booking, center, access } = await ensureServiceCenterBookingAccess(
    req,
    String(req.params?.bookingId || "").trim(),
  );
  const profile = await ensureBiometricProfileForBooking({ booking, center, access });

  const fingerCode = String(req.params?.fingerCode || req.body?.fingerCode || "").trim().toUpperCase();

  if (!BIOMETRIC_FINGER_CODES.includes(fingerCode)) {
    throw new ApiError(400, "Valid fingerCode is required");
  }

  const currentFingers = Array.isArray(profile.fingers) ? profile.fingers : [];
  const nextFingers = currentFingers.filter(
    (item) => String(item?.fingerCode || "").trim().toUpperCase() !== fingerCode,
  );

  if (nextFingers.length === currentFingers.length) {
    throw new ApiError(404, "This finger has not been enrolled for the booking");
  }

  profile.fingers = nextFingers;
  profile.verificationSummary = {
    lastVerifiedAt: profile?.verificationSummary?.lastVerifiedFingerCode === fingerCode
      ? null
      : profile?.verificationSummary?.lastVerifiedAt || null,
    lastVerificationStatus: profile?.verificationSummary?.lastVerifiedFingerCode === fingerCode
      ? ""
      : profile?.verificationSummary?.lastVerificationStatus || "",
    lastVerifiedFingerCode: profile?.verificationSummary?.lastVerifiedFingerCode === fingerCode
      ? ""
      : profile?.verificationSummary?.lastVerifiedFingerCode || "",
    lastMatchScore: profile?.verificationSummary?.lastVerifiedFingerCode === fingerCode
      ? null
      : profile?.verificationSummary?.lastMatchScore ?? null,
  };

  const requiredFingerCount = Number(profile.requiredFingerCount);
  const normalizedRequiredFingerCount =
    Number.isInteger(requiredFingerCount) && requiredFingerCount >= 0 ? requiredFingerCount : 0;
  if (profile.fingers.length === 0) {
    profile.status = "not_started";
  } else if (profile.fingers.length >= normalizedRequiredFingerCount) {
    profile.status = "completed";
  } else {
    profile.status = "in_progress";
  }

  appendBiometricAuditLog(profile, {
    action: "finger_deleted",
    fingerCode,
    actorId: access.staff?._id || center._id,
    actorRole: access.role,
    notes: `Fingerprint deleted for ${getBiometricFingerDisplayName(fingerCode)}`,
  });

  await profile.save();

  res.json({
    success: true,
    data: {
      booking: serializeServiceCenterBooking(booking.toObject(), profile.toObject()),
      biometrics: serializeBiometricProfile(profile.toObject()),
    },
  });
};

export const verifyServiceCenterBookingFingerprint = async (req, res) => {
  const { booking, center, access } = await ensureServiceCenterBookingAccess(
    req,
    String(req.params?.bookingId || "").trim(),
  );
  const profile = await ensureBiometricProfileForBooking({ booking, center, access });

  const fingerCode = String(req.body?.fingerCode || "").trim().toUpperCase();
  const verificationStatus = String(req.body?.verificationStatus || req.body?.status || "")
    .trim()
    .toLowerCase();
  const notes = String(req.body?.notes || "").trim();
  const matchScore = normalizeBiometricMatchScore(req.body?.matchScore);
  const templateData = String(req.body?.templateData || req.body?.template || "").trim();
  const isTemplateValid = isValidBiometricTemplate(templateData);
  const previewImage = normalizeBiometricPreviewImage(
    req.body?.previewImage ||
    req.body?.imageBase64 ||
    req.body?.base64Image ||
    req.body?.previewBase64 ||
    req.body?.bitmap ||
    req.body?.bitmapBase64 ||
    req.body?.bmpBase64 ||
    req.body?.imageData ||
    req.body?.fingerprintImage ||
    req.body?.fingerImage ||
    req.body?.image ||
    req.body?.imageUrl ||
    "",
  );
  const captureSource = String(req.body?.captureSource || req.body?.source || "").trim().toLowerCase();
  const localMatch = req.body?.localMatch === undefined
    ? null
    : normalizeBoolean(req.body.localMatch);
  const referenceTemplateHash = String(
    req.body?.referenceTemplateHash ||
    req.body?.enrolledTemplateHash ||
    req.body?.referenceHash ||
    "",
  ).trim();
  const matchedTemplateHash = String(
    req.body?.matchedTemplateHash ||
    req.body?.templateHash ||
    req.body?.matchedHash ||
    "",
  ).trim();
  const matchedFingerCode = String(
    req.body?.matchedFingerCode ||
    req.body?.comparedFingerCode ||
    "",
  ).trim().toUpperCase();

  if (!BIOMETRIC_FINGER_CODES.includes(fingerCode)) {
    throw new ApiError(400, "Valid fingerCode is required");
  }

  const fingerIndex = Array.isArray(profile.fingers)
    ? profile.fingers.findIndex((item) => String(item?.fingerCode || "").trim().toUpperCase() === fingerCode)
    : -1;

  if (fingerIndex < 0) {
    throw new ApiError(404, "This finger has not been enrolled for the booking");
  }

  let resolvedVerificationStatus = verificationStatus;
  const enrolledFinger = profile.fingers[fingerIndex];
  if (isRdServiceTemplateFormat(enrolledFinger?.templateFormat)) {
    throw new ApiError(
      400,
      "This finger was enrolled through RD Service PID XML capture. Local fingerprint re-verification is not supported in this flow.",
    );
  }
  const hasNumericMatchScore = Number.isFinite(matchScore) && matchScore >= 0;
  const hasTemplateData = Boolean(templateData);
  const templateHashMatched =
    hasTemplateData && isTemplateValid && buildBiometricTemplateHash(templateData) === String(enrolledFinger?.templateHash || "");

  // Server-side template comparison: decrypt the enrolled template and compare directly
  let serverSideTemplateMatched = false;
  if (hasTemplateData && isTemplateValid && !templateHashMatched && enrolledFinger?.templateEncrypted) {
    const enrolledTemplate = decryptBiometricTemplate(enrolledFinger.templateEncrypted);
    if (enrolledTemplate && enrolledTemplate === templateData) {
      serverSideTemplateMatched = true;
    }
  }
  const templateMatched = templateHashMatched || serverSideTemplateMatched;
  const enrolledTemplateHash = String(enrolledFinger?.templateHash || "").trim();
  const referenceMatchesEnrolled = Boolean(referenceTemplateHash && enrolledTemplateHash && referenceTemplateHash === enrolledTemplateHash);
  const matchedHashAllowsFinger = !matchedTemplateHash || matchedTemplateHash === enrolledTemplateHash;
  const matchedFingerAllowsFinger = !matchedFingerCode || matchedFingerCode === fingerCode;
  const bridgeScoreMatchesEnrolled =
    hasNumericMatchScore &&
    matchScore >= BIOMETRIC_MIN_MATCH_SCORE &&
    referenceMatchesEnrolled &&
    matchedHashAllowsFinger &&
    matchedFingerAllowsFinger;

  if (captureSource === "phone_sensor" && localMatch !== null) {
    resolvedVerificationStatus = localMatch ? "matched" : "failed";
  } else if (captureSource === "usb_scanner" || captureSource === "bluetooth_scanner") {
    if (hasTemplateData) {
      // USB scanner re-captured a template — compare server-side
      // If template is invalid/generic, we reject it immediately
      resolvedVerificationStatus = (isTemplateValid && templateMatched) ? "matched" : "failed";
    } else if (hasNumericMatchScore) {
      resolvedVerificationStatus = bridgeScoreMatchesEnrolled ? "matched" : "failed";
    } else if (localMatch !== null || verificationStatus) {
      resolvedVerificationStatus = "failed";
    }
  } else if (templateMatched) {
    resolvedVerificationStatus =
      "matched";
  } else if (hasTemplateData) {
    resolvedVerificationStatus = "failed";
  }

  if (!["matched", "failed", "low_quality"].includes(resolvedVerificationStatus)) {
    throw new ApiError(
      400,
      `verificationStatus must be matched, failed, or low_quality. USB verification should send matchScore or templateData.`,
    );
  }

  const now = new Date();
  if (previewImage) {
    profile.fingers[fingerIndex].previewImage = previewImage;
  }
  profile.fingers[fingerIndex].lastVerifiedAt = now;
  profile.fingers[fingerIndex].verificationCount =
    Number(profile.fingers[fingerIndex].verificationCount || 0) + 1;
  profile.verificationSummary = {
    lastVerifiedAt: now,
    lastVerificationStatus: resolvedVerificationStatus,
    lastVerifiedFingerCode: fingerCode,
    lastMatchScore: matchScore,
  };
  profile.status = resolvedVerificationStatus === "matched" ? "verified" : "completed";

  appendBiometricAuditLog(profile, {
    action: "finger_verified",
    fingerCode,
    actorId: access.staff?._id || center._id,
    actorRole: access.role,
    notes,
    matchScore,
    verificationStatus: resolvedVerificationStatus,
  });

  await profile.save();

  res.json({
    success: true,
    data: {
      booking: serializeServiceCenterBooking(booking.toObject(), profile.toObject()),
      biometrics: serializeBiometricProfile(profile.toObject()),
      verification: {
        source: captureSource || enrolledFinger?.captureSource || "unknown",
        localMatch: localMatch === true,
        referenceTemplateHashMatched: referenceMatchesEnrolled,
        matchedFingerCode: matchedFingerCode || null,
        usedTemplateComparison:
          (captureSource === "usb_scanner" || captureSource === "bluetooth_scanner" || !captureSource) && hasTemplateData,
        minimumMatchScore: BIOMETRIC_MIN_MATCH_SCORE,
        matchScore,
        verificationStatus: resolvedVerificationStatus,
        isMatch: resolvedVerificationStatus === "matched",
        message: (() => {
          const isMatch = resolvedVerificationStatus === "matched";
          if (isMatch) {
            if (captureSource === "phone_sensor") return "Matched via phone sensor";
            if (hasNumericMatchScore) return `Matched via bridge score (${matchScore})`;
            if (localMatch === true) return "Matched via bridge local decision";
            if (templateHashMatched) return "Matched via template hash";
            if (serverSideTemplateMatched) return "Matched via server-side template comparison";
            return "Verified successfully";
          }
          if (resolvedVerificationStatus === "failed") {
            if (hasNumericMatchScore && matchScore < BIOMETRIC_MIN_MATCH_SCORE) return `Failed: low match score (${matchScore})`;
            if (hasNumericMatchScore && !referenceMatchesEnrolled) return "Failed: scanner score was not tied to the enrolled fingerprint";
            if (hasNumericMatchScore && !matchedFingerAllowsFinger) return "Failed: scanner matched a different finger";
            if (hasNumericMatchScore && !matchedHashAllowsFinger) return "Failed: scanner matched a different enrolled template";
            if (localMatch === false) return "Failed: bridge reported no match";
            if (localMatch === true && (captureSource === "usb_scanner" || captureSource === "bluetooth_scanner")) {
              return "Failed: scanner returned only a generic local match, not enrolled fingerprint evidence";
            }
            if (hasTemplateData && !templateMatched) return "Failed: template data mismatch";
            return "Fingerprint did not match";
          }
          if (resolvedVerificationStatus === "low_quality") return "Scan quality too low, please try again";
          return "";
        })(),
      },
    },
  });
};

export const updateServiceCenterBooking = async (req, res) => {
  const bookingId = String(req.params?.bookingId || "").trim();
  const { access, center, booking } = await ensureServiceCenterBookingAccess(req, bookingId);

  if (req.body?.assignedStaffId !== undefined) {
    const assignedStaffId = String(req.body.assignedStaffId || "").trim();
    const currentAssignedStaffId = String(booking.assignedStaffId || "").trim();

    if (!access.canAssignBookings && assignedStaffId !== currentAssignedStaffId) {
      throw new ApiError(403, "Only service center owners can assign staff");
    }

    if (!access.canAssignBookings) {
      // Staff form submissions may carry the current assignment value; keep that as a no-op.
    } else if (!assignedStaffId) {
      booking.assignedStaffId = null;
      booking.assignedStaffName = "";
      booking.assignedStaffPhone = "";
    } else {
      const staff = await ServiceCenterStaff.findOne({
        _id: assignedStaffId,
        serviceCenterId: center._id,
        active: true,
        status: "active",
      }).lean();

      if (!staff) {
        throw new ApiError(404, "Assigned staff member not found");
      }

      booking.assignedStaffId = staff._id;
      booking.assignedStaffName = staff.name || "";
      booking.assignedStaffPhone = staff.phone || "";

      if (String(booking.status || "") === "pending") {
        booking.status = "assigned";
      }
    }
  }

  if (req.body?.serviceCenterNote !== undefined) {
    booking.serviceCenterNote = String(req.body.serviceCenterNote || "").trim();
  }

  if (req.body?.rentalInspection && typeof req.body.rentalInspection === "object") {
    const inspection = req.body.rentalInspection;

    if (inspection.beforeHandover && typeof inspection.beforeHandover === "object") {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.beforeHandover = booking.rentalInspection.beforeHandover || {};

      const beforeKeys = [
        "exteriorOk",
        "interiorOk",
        "dashboardOk",
        "tyresOk",
        "fuelOk",
        "documentsOk",
      ];

      beforeKeys.forEach((key) => {
        if (inspection.beforeHandover[key] !== undefined) {
          booking.rentalInspection.beforeHandover[key] = inspection.beforeHandover[key] === true;
        }
      });
    }

    if (inspection.afterReturn && typeof inspection.afterReturn === "object") {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.afterReturn = booking.rentalInspection.afterReturn || {};

      const afterKeys = [
        "exteriorChecked",
        "interiorChecked",
        "dashboardChecked",
        "fuelChecked",
        "tyresChecked",
        "damageReviewed",
      ];

      afterKeys.forEach((key) => {
        if (inspection.afterReturn[key] !== undefined) {
          booking.rentalInspection.afterReturn[key] = inspection.afterReturn[key] === true;
        }
      });
    }

    if (inspection.pickupNotes !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.pickupNotes = String(inspection.pickupNotes || "").trim();
    }

    if (inspection.returnNotes !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.returnNotes = String(inspection.returnNotes || "").trim();
    }

    if (inspection.pickupMeterReading !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      const value = String(inspection.pickupMeterReading ?? "").trim();
      booking.rentalInspection.pickupMeterReading = value ? Number(value) : null;
    }

    if (inspection.returnMeterReading !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      const value = String(inspection.returnMeterReading ?? "").trim();
      booking.rentalInspection.returnMeterReading = value ? Number(value) : null;
    }

    if (inspection.pickupFuelLevel !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.pickupFuelLevel = String(inspection.pickupFuelLevel || "").trim();
    }

    if (inspection.returnFuelLevel !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.returnFuelLevel = String(inspection.returnFuelLevel || "").trim();
    }

    if (inspection.beforeConditionImages !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.beforeConditionImages = Array.isArray(inspection.beforeConditionImages)
        ? inspection.beforeConditionImages.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    }

    if (inspection.afterConditionImages !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.afterConditionImages = Array.isArray(inspection.afterConditionImages)
        ? inspection.afterConditionImages.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    }

    if (inspection.beforeConditionImageDetails !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.beforeConditionImageDetails = Array.isArray(inspection.beforeConditionImageDetails)
        ? inspection.beforeConditionImageDetails
            .map((item) => normalizeInspectionPhotoMetadataInput(item))
            .filter((item) => item.imageUrl)
        : [];

      booking.rentalInspection.beforeConditionImages = booking.rentalInspection.beforeConditionImageDetails.map(
        (item) => item.imageUrl,
      );
    }

    if (inspection.afterConditionImageDetails !== undefined) {
      booking.rentalInspection = booking.rentalInspection || {};
      booking.rentalInspection.afterConditionImageDetails = Array.isArray(inspection.afterConditionImageDetails)
        ? inspection.afterConditionImageDetails
            .map((item) => normalizeInspectionPhotoMetadataInput(item))
            .filter((item) => item.imageUrl)
        : [];

      booking.rentalInspection.afterConditionImages = booking.rentalInspection.afterConditionImageDetails.map(
        (item) => item.imageUrl,
      );
    }
  }

  if (req.body?.status !== undefined) {
    const nextStatus = String(req.body.status || "").trim();
    const allowedStatuses = ["pending", "confirmed", "assigned", "completed", "cancelled", "end_requested"];
    if (!allowedStatuses.includes(nextStatus)) {
      throw new ApiError(400, "Invalid booking status");
    }

    if (access.staff?._id) {
      if (String(booking.assignedStaffId || "") !== String(access.staff._id)) {
        throw new ApiError(403, "Staff can only update bookings assigned to them");
      }
      if (!["assigned", "confirmed", "completed", "end_requested"].includes(nextStatus)) {
        throw new ApiError(403, "Staff have limited status update access");
      }
    }

    if (nextStatus === "completed") {
      const returnMeterReading = Number(booking.rentalInspection?.returnMeterReading);
      const returnFuelLevel = String(booking.rentalInspection?.returnFuelLevel || "").trim();
      const returnNotes = String(booking.rentalInspection?.returnNotes || "").trim();
      const afterConditionImages = Array.isArray(booking.rentalInspection?.afterConditionImages)
        ? booking.rentalInspection.afterConditionImages.filter(Boolean)
        : [];

      if (!Number.isFinite(returnMeterReading) || returnMeterReading < 0) {
        throw new ApiError(400, "Return meter reading is required before completing the booking");
      }

      if (!returnFuelLevel) {
        throw new ApiError(400, "Return fuel level is required before completing the booking");
      }

      if (!afterConditionImages.length) {
        throw new ApiError(400, "At least one after-condition photo is required before completing the booking");
      }

      if (!returnNotes) {
        throw new ApiError(400, "Return condition notes are required before completing the booking");
      }
    }

    booking.status = nextStatus;
    if (nextStatus === "assigned" && !booking.assignedAt) {
      booking.assignedAt = new Date();
    }
    if (nextStatus === "completed" && !booking.completedAt) {
      booking.completedAt = new Date();
    }
    if (nextStatus === "cancelled" && !booking.cancelledAt) {
      booking.cancelledAt = new Date();
    }
  }

  await booking.save();

  const populated = await RentalBookingRequest.findById(booking._id)
    .populate("userId", "name phone email")
    .populate("vehicleTypeId", "name vehicleCategory image coverImage galleryImages amenities")
    .lean();
  const biometricProfile = await CustomerBiometricProfile.findOne({ bookingId: booking._id }).lean();

  res.json({
    success: true,
    data: serializeServiceCenterBooking(populated, biometricProfile),
  });
};

export const getBusDriverSeatLayout = async (req, res) => {
  const busDriver = await BusDriver.findById(req.auth.sub).lean();

  if (!busDriver) {
    throw new ApiError(404, "Bus driver not found");
  }

  if (!busDriver.assignedBusServiceId) {
    throw new ApiError(404, "No bus is assigned to this driver");
  }

  const busService = await BusService.findById(busDriver.assignedBusServiceId).lean();
  if (!busService) {
    throw new ApiError(404, "Assigned bus service not found");
  }

  const scheduleId = toCleanString(req.query?.scheduleId);
  const travelDate = normalizeBusTravelDate(req.query?.date || req.query?.travelDate || new Date());
  const schedule = findBusSchedule(busService, scheduleId);

  if (!isScheduleAvailableOnDate(schedule, travelDate)) {
    throw new ApiError(404, "Bus schedule not found for the selected date");
  }

  res.json({
    success: true,
    data: {
      ...(await buildBusDriverSeatLayout({ busService, scheduleId, travelDate })),
      bus: {
        operatorName: busService.operatorName || "",
        busName: busService.busName || "",
        routeName: busService.route?.routeName || "",
        fromCity: busService.route?.originCity || "",
        toCity: busService.route?.destinationCity || "",
        departureTime: schedule?.departureTime || "",
        arrivalTime: schedule?.arrivalTime || "",
      },
    },
  });
};

export const listBusDriverBookings = async (req, res) => {
  const busDriver = await BusDriver.findById(req.auth.sub).lean();

  if (!busDriver) {
    throw new ApiError(404, "Bus driver not found");
  }

  if (!busDriver.assignedBusServiceId) {
    throw new ApiError(404, "No bus is assigned to this driver");
  }

  const query = {
    busServiceId: busDriver.assignedBusServiceId,
  };

  const travelDate = toCleanString(req.query?.date || req.query?.travelDate);
  const scheduleId = toCleanString(req.query?.scheduleId);
  const status = toCleanString(req.query?.status);

  if (travelDate) {
    query.travelDate = normalizeBusTravelDate(travelDate);
  }

  if (scheduleId) {
    query.scheduleId = scheduleId;
  }

  if (status) {
    query.status = status;
  }

  const items = await BusBooking.find(query).sort({ travelDate: 1, createdAt: -1 }).lean();

  res.json({
    success: true,
    results: items.map(serializeBusDriverBooking),
  });
};

export const createBusDriverReservation = async (req, res) => {
  const busDriver = await BusDriver.findById(req.auth.sub).lean();

  if (!busDriver) {
    throw new ApiError(404, "Bus driver not found");
  }

  if (!busDriver.assignedBusServiceId) {
    throw new ApiError(404, "No bus is assigned to this driver");
  }

  const busService = await BusService.findById(busDriver.assignedBusServiceId).lean();
  if (!busService || String(busService.status || "") !== "active") {
    throw new ApiError(404, "Assigned bus service not found");
  }

  const scheduleId = toCleanString(req.body?.scheduleId);
  const travelDate = normalizeBusTravelDate(req.body?.travelDate || req.body?.date);
  const seatIds = Array.isArray(req.body?.seatIds)
    ? [...new Set(req.body.seatIds.map((item) => toCleanString(item)).filter(Boolean))]
    : [];
  const passenger = {
    name: toCleanString(req.body?.passenger?.name),
    age: Number(req.body?.passenger?.age || 0),
    gender: toCleanString(req.body?.passenger?.gender),
    phone: normalizeBusPassengerPhone(req.body?.passenger?.phone),
    email: normalizeEmail(req.body?.passenger?.email),
  };
  const notes = toCleanString(req.body?.notes);

  if (!scheduleId || seatIds.length === 0) {
    throw new ApiError(400, "scheduleId and seatIds are required");
  }

  validateBusPassengerName(passenger.name);
  validateBusPassengerPhone(passenger.phone);
  validateBusPassengerEmail(passenger.email);

  if (!Number.isFinite(passenger.age) || passenger.age < 1 || passenger.age > 120) {
    throw new ApiError(400, "Passenger age must be valid");
  }

  const schedule = findBusSchedule(busService, scheduleId);
  if (!isScheduleAvailableOnDate(schedule, travelDate)) {
    throw new ApiError(404, "Bus schedule not found for the selected date");
  }

  const seatLayout = await buildBusDriverSeatLayout({ busService, scheduleId, travelDate });
  const availableSeatMap = new Map(
    flattenBusBlueprintSeats(seatLayout.blueprint)
      .filter((seat) => String(seat.status || "available") === "available")
      .map((seat) => [String(seat.id || ""), seat]),
  );

  const invalidSeat = seatIds.find((seatId) => !availableSeatMap.has(seatId));
  if (invalidSeat) {
    throw new ApiError(409, `Seat ${invalidSeat} is not available`);
  }

  const amount = Math.round(Number(busService.seatPrice || 0) * seatIds.length * 100) / 100;
  const booking = await BusBooking.create({
    userId: busDriver._id,
    busServiceId: busService._id,
    bookingCode: `BDR${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    scheduleId,
    travelDate,
    seatIds,
    seatLabels: seatIds.map((seatId) => availableSeatMap.get(seatId)?.label || seatId),
    passenger,
    amount,
    bookingSource: "bus_driver",
    reservedByDriverId: busDriver._id,
    currency: busService.fareCurrency || "INR",
    status: "confirmed",
    expiresAt: null,
    routeSnapshot: {
      originCity: busService.route?.originCity || "",
      destinationCity: busService.route?.destinationCity || "",
      departureTime: schedule?.departureTime || "",
      arrivalTime: schedule?.arrivalTime || "",
      durationHours: busService.route?.durationHours || "",
      busName: busService.busName || "",
      operatorName: busService.operatorName || "",
      coachType: busService.coachType || "",
      busCategory: busService.busCategory || "",
    },
    payment: {
      provider: "manual",
      orderId: "",
      paymentId: "",
      signature: "",
      status: "manual_reserved",
      paidAt: new Date(),
    },
    notes,
  });

  try {
    await BusSeatHold.insertMany(
      seatIds.map((seatId) => ({
        busServiceId: busService._id,
        bookingId: booking._id,
        userId: busDriver._id,
        scheduleId,
        travelDate,
        seatId,
        holdToken: booking.bookingCode,
        status: "booked",
        expiresAt: null,
      })),
      { ordered: true },
    );
  } catch (error) {
    await BusBooking.deleteOne({ _id: booking._id });
    if (error?.code === 11000) {
      throw new ApiError(409, "One or more selected seats were just booked");
    }
    throw error;
  }

  res.status(201).json({
    success: true,
    data: serializeBusDriverBooking(booking),
  });
};

export const updateBusDriverSchedules = async (req, res) => {
  const busDriver = await BusDriver.findById(req.auth.sub);

  if (!busDriver) {
    throw new ApiError(404, "Bus driver not found");
  }

  if (!busDriver.assignedBusServiceId) {
    throw new ApiError(404, "No bus is assigned to this driver");
  }

  const busService = await BusService.findById(busDriver.assignedBusServiceId);
  if (!busService) {
    throw new ApiError(404, "Assigned bus service not found");
  }

  const schedules = Array.isArray(req.body?.schedules)
    ? req.body.schedules.map((schedule, index) => normalizeBusDriverSchedule(schedule, index))
    : [];

  validateBusDriverSchedules(schedules);

  busService.schedules = schedules;
  await busService.save();

  res.json({
    success: true,
    data: {
      busServiceId: String(busService._id),
      schedules: Array.isArray(busService.schedules) ? busService.schedules : [],
      updatedAt: busService.updatedAt,
    },
  });
};

export const getBusDriverLiveTrip = async (req, res) => {
  const { busService } = await getBusTrackingContext(req.auth.sub);
  const liveTracking = serializeBusLiveTracking(busService.liveTracking || {});

  res.json({
    success: true,
    data: {
      busServiceId: String(busService._id),
      busName: busService.busName || "",
      route: busService.route || {},
      schedules: Array.isArray(busService.schedules) ? busService.schedules : [],
      liveTracking,
    },
  });
};

export const startBusDriverLiveTrip = async (req, res) => {
  const { busService } = await getBusTrackingContext(req.auth.sub);
  const scheduleId = toCleanString(req.body?.scheduleId);
  const travelDate = normalizeBusTravelDate(req.body?.travelDate || req.body?.date || new Date());
  const schedule = findBusSchedule(busService, scheduleId);

  if (!isScheduleAvailableOnDate(schedule, travelDate)) {
    throw new ApiError(404, "Bus schedule not found for the selected date");
  }

  const initialLocation = req.body?.location
    ? normalizeBusTrackingPoint(req.body.location, "location")
    : null;
  const existingLiveTracking = serializeBusLiveTracking(busService.liveTracking || {});
  const status = String(existingLiveTracking.status || "idle");
  const now = new Date();

  const nextCurrentLocation =
    initialLocation ||
    existingLiveTracking.currentLocation ||
    (busService.route?.originCoords?.lat !== null && busService.route?.originCoords?.lng !== null
      ? {
          lat: Number(busService.route.originCoords.lat),
          lng: Number(busService.route.originCoords.lng),
          recordedAt: now,
          accuracyMeters: null,
          heading: null,
          speedKmph: null,
        }
      : null);

  busService.liveTracking = {
    status:
      status === "paused" &&
      existingLiveTracking.scheduleId === scheduleId &&
      existingLiveTracking.travelDate === travelDate
        ? "in_progress"
        : "in_progress",
    scheduleId,
    travelDate,
    startedAt:
      existingLiveTracking.scheduleId === scheduleId &&
      existingLiveTracking.travelDate === travelDate &&
      existingLiveTracking.startedAt
        ? existingLiveTracking.startedAt
        : now,
    endedAt: null,
    lastUpdatedAt: now,
    currentLocation: nextCurrentLocation,
    recentPath: nextCurrentLocation
      ? trimBusLiveTrail([
          ...(existingLiveTracking.scheduleId === scheduleId &&
          existingLiveTracking.travelDate === travelDate &&
          status === "paused"
            ? existingLiveTracking.recentPath
            : []),
          nextCurrentLocation,
        ])
      : [],
    totalDistanceKm:
      existingLiveTracking.scheduleId === scheduleId &&
      existingLiveTracking.travelDate === travelDate
        ? Number(existingLiveTracking.totalDistanceKm || 0)
        : 0,
  };

  await busService.save();

  res.json({
    success: true,
    data: {
      busServiceId: String(busService._id),
      liveTracking: serializeBusLiveTracking(busService.liveTracking || {}),
    },
  });
};

export const updateBusDriverLiveLocation = async (req, res) => {
  const { busService } = await getBusTrackingContext(req.auth.sub);
  const liveTracking = serializeBusLiveTracking(busService.liveTracking || {});

  if (!liveTracking.scheduleId || !liveTracking.travelDate) {
    throw new ApiError(409, "Start the journey before sending live location updates");
  }

  if (!["in_progress", "paused"].includes(String(liveTracking.status || ""))) {
    throw new ApiError(409, "Live tracking is not active for this bus");
  }

  const scheduleId = toCleanString(req.body?.scheduleId || liveTracking.scheduleId);
  const travelDate = normalizeBusTravelDate(req.body?.travelDate || req.body?.date || liveTracking.travelDate);
  if (scheduleId !== liveTracking.scheduleId || travelDate !== liveTracking.travelDate) {
    throw new ApiError(409, "This live trip belongs to a different schedule or travel date");
  }

  const nextPoint = normalizeBusTrackingPoint(req.body?.location, "location");
  const previousPoint = liveTracking.currentLocation;
  const additionalDistanceKm = calculateDistanceKm(previousPoint, nextPoint);
  const nextPath = trimBusLiveTrail([...liveTracking.recentPath, nextPoint]);

  busService.liveTracking = {
    ...busService.liveTracking?.toObject?.(),
    status: "in_progress",
    scheduleId,
    travelDate,
    currentLocation: nextPoint,
    recentPath: nextPath,
    lastUpdatedAt: new Date(),
    totalDistanceKm: Math.round((Number(liveTracking.totalDistanceKm || 0) + additionalDistanceKm) * 1000) / 1000,
  };

  await busService.save();

  res.json({
    success: true,
    data: {
      busServiceId: String(busService._id),
      liveTracking: serializeBusLiveTracking(busService.liveTracking || {}),
    },
  });
};

export const updateBusDriverLiveTripStatus = async (req, res) => {
  const { busService } = await getBusTrackingContext(req.auth.sub);
  const action = toCleanString(req.body?.action).toLowerCase();
  const liveTracking = serializeBusLiveTracking(busService.liveTracking || {});

  if (!["pause", "resume", "complete", "reset"].includes(action)) {
    throw new ApiError(400, "A valid live trip action is required");
  }

  if (action === "reset") {
    busService.liveTracking = {
      status: "idle",
      scheduleId: "",
      travelDate: "",
      startedAt: null,
      endedAt: null,
      lastUpdatedAt: new Date(),
      currentLocation: null,
      recentPath: [],
      totalDistanceKm: 0,
    };

    await busService.save();

    res.json({
      success: true,
      data: {
        busServiceId: String(busService._id),
        liveTracking: serializeBusLiveTracking(busService.liveTracking || {}),
      },
    });
    return;
  }

  if (!liveTracking.scheduleId || !liveTracking.travelDate) {
    throw new ApiError(409, "No active bus journey exists yet");
  }

  if (action === "pause") {
    busService.liveTracking.status = "paused";
    busService.liveTracking.lastUpdatedAt = new Date();
  } else if (action === "resume") {
    busService.liveTracking.status = "in_progress";
    busService.liveTracking.lastUpdatedAt = new Date();
    if (!busService.liveTracking.startedAt) {
      busService.liveTracking.startedAt = new Date();
    }
  } else if (action === "complete") {
    busService.liveTracking.status = "completed";
    busService.liveTracking.endedAt = new Date();
    busService.liveTracking.lastUpdatedAt = new Date();
  }

  await busService.save();

  res.json({
    success: true,
    data: {
      busServiceId: String(busService._id),
      liveTracking: serializeBusLiveTracking(busService.liveTracking || {}),
    },
  });
};

export const createDriverWithdrawalRequest = async (req, res) => {
  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const wallet = await serializeDriverWallet(driver);
  const walletSettings = await getWalletSettings();
  const isTransferEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(walletSettings.enable_wallet_transfer_driver ?? '1').trim().toLowerCase(),
  );
  const minimumTransferAmount = Number(wallet.minimumTransferAmount ?? walletSettings.minimum_wallet_amount_for_transfer ?? 0);
  const amount = Number(req.body?.amount);
  const paymentMethod = String(req.body?.payment_method || req.body?.paymentMethod || 'bank_transfer').trim().toLowerCase() || 'bank_transfer';

  if (!isTransferEnabled) {
    throw new ApiError(403, "Withdrawals are disabled by admin");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "amount must be greater than zero");
  }

  if (minimumTransferAmount > 0 && amount < minimumTransferAmount) {
    throw new ApiError(400, `amount must be at least ${minimumTransferAmount}`);
  }

  if (amount > Number(wallet.balance || 0)) {
    throw new ApiError(400, "Withdrawal amount cannot exceed current balance");
  }

  const pendingRequest = await WithdrawalRequest.findOne({
    driver_id: req.auth.sub,
    amount,
    status: 'pending',
  })
    .sort({ createdAt: -1 })
    .lean();

  if (pendingRequest && (Date.now() - new Date(pendingRequest.createdAt).getTime()) < 60 * 1000) {
    throw new ApiError(409, "A similar withdrawal request was just submitted");
  }

  const created = await WithdrawalRequest.create({
    transactionId: `wdr_${Date.now().toString(36)}`,
    driver_id: req.auth.sub,
    amount: Math.round(amount * 100) / 100,
    payment_method: paymentMethod,
    bank_details_snapshot: serializeDriverBankDetails(driver.bankDetails || {}),
    status: 'pending',
  });

  res.status(201).json({
    success: true,
    data: {
      request: created,
      wallet,
    },
    message: "Withdrawal request sent to admin",
  });
};

export const topUpMyWallet = async (req, res) => {
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "amount must be greater than zero");
  }

  const result = await topUpDriverWallet({
    driverId: req.auth.sub,
    amount,
    metadata: {
      source: req.body.source || "manual",
      referenceId: req.body.referenceId || null,
    },
  });

  const payload = {
    wallet: result.wallet,
    transaction: result.transaction,
  };

  emitToDriver(req.auth.sub, "driver:wallet:updated", payload);

  res.json({
    success: true,
    data: payload,
  });
};

export const createDriverPaymentQr = async (req, res) => {
  const amountInPaise = normalizePaymentAmount(req.body.amount);
  const rideId = String(req.body.rideId || "").trim();

  if (!rideId) {
    throw new ApiError(400, "rideId is required");
  }

  const ride = await Ride.findOne({
    _id: rideId,
    driverId: req.auth.sub,
  })
    .select("_id fare paymentMethod serviceType driverPaymentCollection");

  if (!ride) {
    throw new ApiError(404, "Ride not found for this driver");
  }

  let payload;

  try {
    const appName = await getConfiguredAppName();
    const qr = await razorpayRequest({
      method: "POST",
      path: "/payments/qr_codes",
      body: {
        type: "upi_qr",
        name: `${appName} Taxi Fare`,
        usage: "single_use",
        fixed_amount: true,
        payment_amount: amountInPaise,
        description: `Taxi fare for ride ${rideId}`,
        close_by: Math.floor(Date.now() / 1000) + 30 * 60,
        notes: {
          rideId,
          driverId: String(req.auth.sub),
          serviceType: ride.serviceType || "ride",
          source: "driver_collect_amount",
        },
      },
    });

    payload = {
      id: qr.id,
      entity: qr.entity,
      status: qr.status,
      imageUrl: qr.image_url,
      linkUrl: qr.image_url,
      amount: amountInPaise / 100,
      currency: "INR",
      description: qr.description,
      closeBy: qr.close_by || null,
      rawStatus: qr.status,
      providerMode: "razorpay_qr",
    };
  } catch (error) {
    if (!shouldFallbackToPaymentLinkQr(error)) {
      throw error;
    }

    payload = await createPaymentLinkQr({
      amountInPaise,
      rideId,
      driverId: req.auth.sub,
      serviceType: ride.serviceType,
    });
  }

  ride.driverPaymentCollection = {
    provider: "razorpay",
    providerId: payload.id,
    providerMode: payload.providerMode,
    status: normalizeCollectionStatus(payload.rawStatus || payload.status),
    amount: payload.amount,
    currency: payload.currency || "INR",
    linkUrl: payload.linkUrl || "",
    paidAt: null,
    updatedAt: new Date(),
  };
  await ride.save();

  res.json({
    success: true,
    data: payload,
  });
};

const resolveRazorpayCredentials = async () => {
  return resolveConfiguredGatewayCredentials("razor_pay");
};

const resolvePhonePeCredentials = async () => {
  return resolveConfiguredGatewayCredentials("phone_pay");
};

const normalizeOriginCandidate = (value = "") => {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue || trimmedValue === "*") {
    return "";
  }

  try {
    return new URL(trimmedValue).origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
};

const isPublicWebOrigin = (value = "") => {
  const origin = normalizeOriginCandidate(value);
  if (!origin) {
    return false;
  }

  try {
    const { protocol, hostname } = new URL(origin);
    if (!["http:", "https:"].includes(protocol)) {
      return false;
    }

    return !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
  } catch {
    return false;
  }
};

const getFrontendBaseUrl = (req) => {
  const configuredOrigins = [
    env.phonePeRedirectBaseUrl,
    env.publicFrontendUrl,
    ...String(env.corsOrigin || "")
      .split(",")
      .map((value) => value.trim()),
  ]
    .map(normalizeOriginCandidate)
    .filter(Boolean);

  const requestCandidates = [
    normalizeOriginCandidate(req?.get?.("origin")),
    normalizeOriginCandidate(req?.get?.("referer")),
    (() => {
      const forwardedProto = String(req?.get?.("x-forwarded-proto") || "").trim();
      const forwardedHost = String(req?.get?.("x-forwarded-host") || "").trim();
      if (!forwardedProto || !forwardedHost) {
        return "";
      }
      return normalizeOriginCandidate(`${forwardedProto}://${forwardedHost}`);
    })(),
    (() => {
      const host = String(req?.get?.("host") || "").trim();
      const proto =
        String(req?.protocol || "").trim() ||
        String(req?.get?.("x-forwarded-proto") || "").trim() ||
        "http";
      if (!host) {
        return "";
      }
      return normalizeOriginCandidate(`${proto}://${host}`);
    })(),
  ].filter(Boolean);

  const preferredPublicOrigin =
    configuredOrigins.find(isPublicWebOrigin) ||
    requestCandidates.find(isPublicWebOrigin);

  if (preferredPublicOrigin) {
    return preferredPublicOrigin;
  }

  return (
    configuredOrigins[0] ||
    requestCandidates[0] ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");
};

const getPhonePeApiBaseUrl = (environment = "test") =>
  String(environment).trim().toLowerCase() === "production"
    ? "https://api.phonepe.com/apis/pg"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox";

const getPhonePeAuthUrl = (environment = "test") =>
  String(environment).trim().toLowerCase() === "production"
    ? "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";

const phonePeAccessTokenCache = new Map();
const phonePeClientCache = new Map();

const getPhonePeCheckoutClient = ({
  clientId,
  clientSecret,
  clientVersion,
  environment,
}) => {
  const normalizedEnvironment = String(environment || "test").trim().toLowerCase();
  const normalizedVersion = Number.parseInt(String(clientVersion || "1"), 10) || 1;
  const cacheKey = `${normalizedEnvironment}::${clientId}::${normalizedVersion}`;

  if (phonePeClientCache.has(cacheKey)) {
    return phonePeClientCache.get(cacheKey);
  }

  const client = StandardCheckoutClient.getInstance(
    clientId,
    clientSecret,
    normalizedVersion,
    normalizedEnvironment === "production" ? Env.PRODUCTION : Env.SANDBOX,
  );

  phonePeClientCache.set(cacheKey, client);
  return client;
};

const getPhonePeAccessToken = async ({
  clientId,
  clientSecret,
  clientVersion,
  environment,
}) => {
  const cacheKey = `${String(environment).trim().toLowerCase()}::${clientId}::${clientVersion}`;
  const cachedToken = phonePeAccessTokenCache.get(cacheKey);
  const nowEpochSeconds = Math.floor(Date.now() / 1000);

  if (cachedToken?.accessToken && Number(cachedToken.expiresAt || 0) - 60 > nowEpochSeconds) {
    logPaymentDiagnostic({
      provider: "phonepe",
      scope: "driver",
      stage: "auth-cache-hit",
      ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
    });
    return cachedToken.accessToken;
  }

  const requestBody = new URLSearchParams({
    client_id: clientId,
    client_version: clientVersion,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  logPaymentDiagnostic({
    provider: "phonepe",
    scope: "driver",
    stage: "auth-request",
    ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
  });

  const response = await fetch(getPhonePeAuthUrl(environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: requestBody.toString(),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    logPaymentDiagnostic({
      provider: "phonepe",
      scope: "driver",
      stage: "auth-failed",
      level: "error",
      statusCode: response.status || 502,
      ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
      response: summarizePhonePePayload(payload || {}),
    });
    throw new ApiError(
      response.status || 502,
      payload?.message || payload?.error_description || payload?.error || "PhonePe authorization failed",
    );
  }

  logPaymentDiagnostic({
    provider: "phonepe",
    scope: "driver",
    stage: "auth-success",
    statusCode: response.status || 200,
    expiresAt: Number(payload.expires_at || nowEpochSeconds + 300),
    ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
  });

  phonePeAccessTokenCache.set(cacheKey, {
    accessToken: String(payload.access_token),
    expiresAt: Number(payload.expires_at || nowEpochSeconds + 300),
  });

  return String(payload.access_token);
};

const phonePeRequest = async ({
  method,
  path,
  body,
  clientId,
  clientSecret,
  clientVersion,
  environment,
}) => {
  const normalizedMethod = String(method || "GET").trim().toUpperCase();
  logPaymentDiagnostic({
    provider: "phonepe",
    scope: "driver",
    stage: "api-request",
    method: normalizedMethod,
    path,
    ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
    request: summarizePhonePeRequestBody(body || {}),
  });
  const client = getPhonePeCheckoutClient({
    clientId,
    clientSecret,
    clientVersion,
    environment,
  });

  try {
    let payload = null;

    if (normalizedMethod === "POST" && path === "/checkout/v2/pay") {
      const merchantOrderId = String(body?.merchantOrderId || "").trim();
      const amount = Number(body?.amount || 0);
      const redirectUrl = String(body?.paymentFlow?.merchantUrls?.redirectUrl || "").trim();

      if (!merchantOrderId || !amount || !redirectUrl) {
        throw new ApiError(400, "PhonePe merchant order id, amount, and redirect URL are required");
      }

      const builder = StandardCheckoutPayRequest.builder()
        .merchantOrderId(merchantOrderId)
        .amount(amount)
        .redirectUrl(redirectUrl);

      if (body?.paymentFlow?.message) {
        builder.message(String(body.paymentFlow.message));
      }
      if (body?.expireAfter) {
        builder.expireAfter(Number(body.expireAfter));
      }
      if (body?.prefillUserLoginDetails?.phoneNumber) {
        const prefill = PrefillUserLoginDetails.builder()
          .phoneNumber(String(body.prefillUserLoginDetails.phoneNumber))
          .build();
        builder.prefillUserLoginDetails(prefill);
      }
      if (body?.metaInfo) {
        builder.metaInfo(body.metaInfo);
      }

      const request = builder.build();
      payload = await client.pay(request);
    } else if (normalizedMethod === "GET" && path.includes("/checkout/v2/order/")) {
      const orderMatch = path.match(/\/checkout\/v2\/order\/([^/]+)\/status/i);
      const merchantOrderId = decodeURIComponent(orderMatch?.[1] || "").trim();

      if (!merchantOrderId) {
        throw new ApiError(400, "PhonePe merchant order id is required");
      }

      payload = await client.getOrderStatus(merchantOrderId);
    } else {
      throw new ApiError(400, `Unsupported PhonePe operation: ${normalizedMethod} ${path}`);
    }

    logPaymentDiagnostic({
      provider: "phonepe",
      scope: "driver",
      stage: "api-success",
      method: normalizedMethod,
      path,
      statusCode: 200,
      ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
      response: summarizePhonePePayload(payload || {}),
    });

    return payload;
  } catch (error) {
    const payload = error?.response || error?.payload || error?.data || null;
    const statusCode = Number(error?.statusCode || error?.status || 502);

    logPaymentDiagnostic({
      provider: "phonepe",
      scope: "driver",
      stage: "api-failed",
      level: "error",
      method: normalizedMethod,
      path,
      statusCode,
      ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
      response: summarizePhonePePayload(payload || {}),
      providerMessage:
        error?.message ||
        payload?.message ||
        payload?.responseCodeDescription ||
        payload?.detailedErrorCode ||
        "",
    });
    throw new ApiError(
      statusCode,
      error?.message || payload?.message || payload?.code || "PhonePe request failed",
    );
  }
};

const fetchRazorpay = async ({ method, path, body, keyId, keySecret }) => {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status || 502,
      payload?.error?.description ||
        payload?.error?.message ||
        "Razorpay request failed",
    );
  }

  return payload;
};

export const createDriverWalletTopupOrder = async (req, res) => {
  const settings = await getWalletSettings();
  const minTopUp = Number(settings.minimum_amount_added_to_wallet || 0);
  const amount = Math.round(Number(req.body.amount) * 100) / 100;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Invalid top-up amount");
  }

  if (amount < minTopUp) {
    throw new ApiError(400, `Minimum top-up amount is Rs ${minTopUp}`);
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();

  const amountPaise = Math.round(amount * 100);
  const driverId = String(req.auth?.sub || "");
  const compactDriverId = driverId.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "drv";
  const receipt = `dwal_${compactDriverId}_${Date.now().toString(36)}`;

  // Build the callback URL that Razorpay will redirect to after payment.
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
  const backendOrigin = `${proto}://${host}`;
  const callbackUrl = `${backendOrigin}/api/v1/drivers/wallet/top-up/razorpay/callback`;

  const userAgent = String(req.headers["user-agent"] || "");
  const isWebView = /; wv\)/i.test(userAgent) || /Version\/[\d.]+/i.test(userAgent) || req.body.usePaymentLink === true;

  if (isWebView) {
    const driver = driverId ? await Driver.findById(driverId).select("name phone email").lean() : null;
    const cleanedPhone = String(driver?.phone || "").replace(/\D/g, "");
    const customerPhone = cleanedPhone.length === 10 ? `+91${cleanedPhone}` : (cleanedPhone.length === 12 && cleanedPhone.startsWith("91")) ? `+${cleanedPhone}` : "";

    const paymentLink = await razorpayRequest({
      method: "POST",
      path: "/payment_links",
      body: {
        amount: amountPaise,
        currency: "INR",
        accept_partial: false,
        expire_by: Math.floor(Date.now() / 1000) + 20 * 60,
        reference_id: receipt,
        description: "Driver Wallet Topup",
        callback_url: callbackUrl,
        callback_method: "get",
        customer: {
          name: driver?.name || "Driver",
          email: driver?.email || "",
          contact: customerPhone || undefined,
        },
        notes: {
          driverId,
          source: "driver_wallet_topup",
        },
      },
      keyId,
      keySecret,
    });

    const checkoutUrl = paymentLink.short_url || paymentLink.shortUrl || paymentLink.url;

    res.status(201).json({
      success: true,
      data: {
        keyId,
        checkoutUrl,
        amount: amountPaise,
        currency: "INR",
        callbackUrl,
      },
    });
    return;
  }

  const order = await fetchRazorpay({
    method: "POST",
    path: "/orders",
    body: {
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: { driverId },
    },
    keyId,
    keySecret,
  });

  res.status(201).json({
    success: true,
    data: {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || "INR",
      callbackUrl,
    },
  });
};

const DRIVER_RAZORPAY_PAYMENT_SUCCESS_STATUSES = new Set(["authorized", "captured", "paid"]);
const DRIVER_RAZORPAY_LINK_SUCCESS_STATUSES = new Set(["paid"]);

const verifyAndApplyDriverRazorpayWalletTopup = async ({
  orderId,
  paymentId,
  signature,
  paymentLinkId = "",
  paymentLinkReferenceId = "",
  paymentLinkStatus = "",
  driverId: requestedDriverId = "",
} = {}) => {
  const normalizedOrderId = String(orderId || "").trim();
  const normalizedPaymentId = String(paymentId || "").trim();
  const normalizedSignature = String(signature || "").trim();
  const normalizedPaymentLinkId = String(paymentLinkId || "").trim();
  const normalizedPaymentLinkReferenceId = String(paymentLinkReferenceId || "").trim();
  const normalizedPaymentLinkStatus = String(paymentLinkStatus || "").trim().toLowerCase();

  if (!normalizedPaymentId) {
    throw new ApiError(400, "Payment verification fields are required");
  }

  if (!normalizedOrderId && !normalizedPaymentLinkId) {
    throw new ApiError(400, "Payment verification fields are required");
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();

  let effectiveOrderId = normalizedOrderId;
  let amountPaise = 0;
  let resolvedDriverId = "";

  if (effectiveOrderId) {
    if (!normalizedSignature) {
      throw new ApiError(400, "Payment verification signature is required");
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${effectiveOrderId}|${normalizedPaymentId}`)
      .digest("hex");

    if (expectedSignature !== normalizedSignature) {
      throw new ApiError(400, "Invalid payment signature");
    }

    const order = await fetchRazorpay({
      method: "GET",
      path: `/orders/${encodeURIComponent(effectiveOrderId)}`,
      keyId,
      keySecret,
    });

    amountPaise = Number(order?.amount);
    resolvedDriverId = String(order?.notes?.driverId || "").trim();
  } else {
    const [payment, paymentLink] = await Promise.all([
      fetchRazorpay({
        method: "GET",
        path: `/payments/${encodeURIComponent(normalizedPaymentId)}`,
        keyId,
        keySecret,
      }),
      fetchRazorpay({
        method: "GET",
        path: `/payment_links/${encodeURIComponent(normalizedPaymentLinkId)}`,
        keyId,
        keySecret,
      }),
    ]);

    const paymentStatus = String(payment?.status || "").trim().toLowerCase();
    const linkStatus = String(paymentLink?.status || normalizedPaymentLinkStatus || "").trim().toLowerCase();
    const linkPaymentId = String(
      paymentLink?.payments?.[0]?.payment_id ||
      paymentLink?.payment_id ||
      payment?.id ||
      "",
    ).trim();

    if (!DRIVER_RAZORPAY_PAYMENT_SUCCESS_STATUSES.has(paymentStatus)) {
      throw new ApiError(400, "Razorpay payment is not successful yet");
    }

    if (linkStatus && !DRIVER_RAZORPAY_LINK_SUCCESS_STATUSES.has(linkStatus)) {
      throw new ApiError(400, "Razorpay payment link is not marked as paid");
    }

    if (linkPaymentId && linkPaymentId !== normalizedPaymentId) {
      throw new ApiError(400, "Payment link callback does not match the payment id");
    }

    if (
      normalizedPaymentLinkReferenceId &&
      paymentLink?.reference_id &&
      String(paymentLink.reference_id).trim() !== normalizedPaymentLinkReferenceId
    ) {
      throw new ApiError(400, "Payment link callback reference did not match");
    }

    effectiveOrderId = String(payment?.order_id || "").trim();
    amountPaise = Number(payment?.amount || paymentLink?.amount_paid || paymentLink?.amount || 0);
    resolvedDriverId = String(paymentLink?.notes?.driverId || payment?.notes?.driverId || "").trim();
  }

  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new ApiError(400, "Invalid order amount");
  }

  const effectiveDriverId = String(requestedDriverId || resolvedDriverId).trim();

  if (!effectiveDriverId) {
    throw new ApiError(400, "Driver reference is missing from this Razorpay order");
  }

  if (requestedDriverId && resolvedDriverId && requestedDriverId !== resolvedDriverId) {
    throw new ApiError(403, "This Razorpay order does not belong to the authenticated driver");
  }

  const amount = Math.round(amountPaise) / 100;
  const alreadyCredited = await WalletTransaction.findOne({
    driverId: effectiveDriverId,
    "metadata.providerPaymentId": normalizedPaymentId,
  })
    .select("_id")
    .lean();

  if (alreadyCredited) {
    const driver = await Driver.findById(effectiveDriverId);
    return {
      driverId: effectiveDriverId,
      wallet: driver ? await serializeDriverWallet(driver) : null,
      transaction: null,
      alreadyCredited: true,
    };
  }

  const result = await topUpDriverWallet({
    driverId: effectiveDriverId,
    amount,
    metadata: {
      source: "razorpay",
      provider: "razorpay",
      providerOrderId: effectiveOrderId,
      providerPaymentId: normalizedPaymentId,
      providerPaymentLinkId: normalizedPaymentLinkId,
    },
  });

  const payload = {
    wallet: result.wallet,
    transaction: result.transaction,
  };

  emitToDriver(effectiveDriverId, "driver:wallet:updated", payload);

  return {
    driverId: effectiveDriverId,
    ...payload,
    alreadyCredited: false,
  };
};

export const handleDriverRazorpayWalletTopupCallback = async (req, res) => {
  const frontendBaseUrl = getFrontendBaseUrl(req);
  const redirectUrl = new URL(`${frontendBaseUrl}/razorpay/status`);
  redirectUrl.searchParams.set("flow", "driver-wallet");
  const callbackPayload = {
    razorpay_order_id: req.body?.razorpay_order_id || req.query?.razorpay_order_id,
    razorpay_payment_id: req.body?.razorpay_payment_id || req.query?.razorpay_payment_id,
    razorpay_signature: req.body?.razorpay_signature || req.query?.razorpay_signature,
    razorpay_payment_link_id: req.body?.razorpay_payment_link_id || req.query?.razorpay_payment_link_id,
    razorpay_payment_link_reference_id:
      req.body?.razorpay_payment_link_reference_id || req.query?.razorpay_payment_link_reference_id,
    razorpay_payment_link_status:
      req.body?.razorpay_payment_link_status || req.query?.razorpay_payment_link_status,
  };

  try {
    const errorCode = String(
      req.body?.error?.code || req.body?.error?.reason || req.query?.error_code || "",
    ).trim();
    const errorDescription = String(
      req.body?.error?.description || req.query?.error_description || "",
    ).trim();

    if (errorCode || errorDescription) {
      redirectUrl.searchParams.set("status", "failure");
      if (errorCode) {
        redirectUrl.searchParams.set("error_code", errorCode);
      }
      if (errorDescription) {
        redirectUrl.searchParams.set("error_description", errorDescription);
      }
      res.redirect(302, redirectUrl.toString());
      return;
    }

    await verifyAndApplyDriverRazorpayWalletTopup({
      orderId: callbackPayload.razorpay_order_id,
      paymentId: callbackPayload.razorpay_payment_id,
      signature: callbackPayload.razorpay_signature,
      paymentLinkId: callbackPayload.razorpay_payment_link_id,
      paymentLinkReferenceId: callbackPayload.razorpay_payment_link_reference_id,
      paymentLinkStatus: callbackPayload.razorpay_payment_link_status,
    });

    redirectUrl.searchParams.set("status", "success");
  } catch (error) {
    redirectUrl.searchParams.set("status", "failure");
    redirectUrl.searchParams.set(
      "error_description",
      String(error?.message || "Payment verification failed."),
    );
  }

  res.redirect(302, redirectUrl.toString());
};

export const createDriverPhonePeWalletTopupOrder = async (req, res) => {
  const settings = await getWalletSettings();
  const minTopUp = Number(settings.minimum_amount_added_to_wallet || 0);
  const amount = Math.round(Number(req.body.amount) * 100) / 100;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Invalid top-up amount");
  }

  if (amount < minTopUp) {
    throw new ApiError(400, `Minimum top-up amount is Rs ${minTopUp}`);
  }

  const { clientId, clientSecret, clientVersion, environment } = await resolvePhonePeCredentials();
  const driverId = String(req.auth?.sub || "");
  const compactDriverId = driverId.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "drv";
  const merchantTransactionId = `DWAL${Date.now()}${compactDriverId}`.slice(0, 34);
  const frontendBaseUrl = getFrontendBaseUrl(req);
  const redirectUrl = `${frontendBaseUrl}/phonepe/status?flow=driver-wallet&phonepe_txn=${encodeURIComponent(merchantTransactionId)}`;
  const driver = driverId ? await Driver.findById(driverId).select("phone").lean() : null;
  logPaymentDiagnostic({
    provider: "phonepe",
    scope: "driver-wallet",
    stage: "create-order-start",
    merchantTransactionId,
    amountRupees: amount,
    request: buildPaymentRequestContext(req),
    metadata: {
      redirectUrl: summarizeCheckoutUrl(redirectUrl),
    },
  });
  const payload = await phonePeRequest({
    method: "POST",
    path: "/checkout/v2/pay",
    body: {
      merchantOrderId: merchantTransactionId,
      amount: Math.round(amount * 100),
      expireAfter: 1200,
      paymentFlow: {
        type: "PG_CHECKOUT",
        merchantUrls: {
          redirectUrl,
        },
        message: "Wallet top-up",
      },
      prefillUserLoginDetails: (() => {
        const cleaned = String(driver?.phone || "").replace(/\D/g, "");
        const finalPhone = (cleaned.length === 12 && cleaned.startsWith("91")) ? cleaned.slice(2) : cleaned;
        return finalPhone.length === 10 ? { phoneNumber: finalPhone } : undefined;
      })(),
    },
    clientId,
    clientSecret,
    clientVersion,
    environment,
  });

  const checkoutUrl = payload?.redirectUrl || "";
  if (!checkoutUrl) {
    logPaymentDiagnostic({
      provider: "phonepe",
      scope: "driver-wallet",
      stage: "create-order-missing-checkout-url",
      level: "error",
      merchantTransactionId,
      response: summarizePhonePePayload(payload || {}),
    });
    throw new ApiError(502, "PhonePe payment URL was not returned");
  }

  logPaymentDiagnostic({
    provider: "phonepe",
    scope: "driver-wallet",
    stage: "create-order-success",
    merchantTransactionId,
    amountPaise: Math.round(amount * 100),
    checkoutUrl: summarizeCheckoutUrl(checkoutUrl),
    response: summarizePhonePePayload(payload || {}),
  });

  res.status(201).json({
    success: true,
    data: {
      gateway: "phonepe",
      merchantTransactionId,
      amount: Math.round(amount * 100),
      currency: "INR",
      checkoutUrl,
    },
  });
};

export const verifyDriverWalletTopup = async (req, res) => {
  const payload = await verifyAndApplyDriverRazorpayWalletTopup({
    orderId: req.body?.razorpay_order_id,
    paymentId: req.body?.razorpay_payment_id,
    signature: req.body?.razorpay_signature,
    driverId: req.auth?.sub,
  });

  res.json({
    success: true,
    data: {
      wallet: payload.wallet,
      ...(payload.transaction ? { transaction: payload.transaction } : {}),
    },
  });
};

export const verifyDriverPhonePeWalletTopup = async (req, res) => {
  const merchantTransactionId = toCleanString(
    req.params?.merchantTransactionId || req.query?.merchantTransactionId || req.query?.transactionId,
  );

  if (!merchantTransactionId) {
    throw new ApiError(400, "merchantTransactionId is required");
  }

  logPaymentDiagnostic({
    provider: "phonepe",
    scope: "driver-wallet",
    stage: "verify-start",
    merchantTransactionId,
    request: buildPaymentRequestContext(req),
  });

  const { clientId, clientSecret, clientVersion, environment } = await resolvePhonePeCredentials();
  const payload = await phonePeRequest({
    method: "GET",
    path: `/checkout/v2/order/${encodeURIComponent(merchantTransactionId)}/status?details=false`,
    clientId,
    clientSecret,
    clientVersion,
    environment,
  });

  const paymentDetails = Array.isArray(payload?.paymentDetails) ? payload.paymentDetails : [];
  const latestPayment = paymentDetails[0] || {};
  const paymentState = String(payload?.state || latestPayment?.state || "").trim().toUpperCase();
  const paymentId = toCleanString(latestPayment?.transactionId || latestPayment?.paymentTransactionId || merchantTransactionId);
  const amount = Math.round(Number(payload?.amount || latestPayment?.amount || 0)) / 100;
  const driverId = req.auth?.sub;

  logPaymentDiagnostic({
    provider: "phonepe",
    scope: "driver-wallet",
    stage: "verify-response",
    merchantTransactionId,
    driverId,
    paymentState,
    paymentId,
    amountRupees: amount,
    response: summarizePhonePePayload(payload || {}),
  });

  if (paymentState === "COMPLETED") {
    const alreadyCredited = await WalletTransaction.findOne({
      driverId,
      $or: [
        { "metadata.providerPaymentId": paymentId },
        { "metadata.providerOrderId": merchantTransactionId },
      ],
    })
      .select("_id")
      .lean();

    let result = null;
    if (!alreadyCredited) {
      result = await topUpDriverWallet({
        driverId,
        amount,
        metadata: {
          source: "phonepe",
          provider: "phonepe",
          providerOrderId: merchantTransactionId,
          providerPaymentId: paymentId,
        },
      });
    }

    const driver = await Driver.findById(driverId);
    logPaymentDiagnostic({
      provider: "phonepe",
      scope: "driver-wallet",
      stage: "verify-paid",
      merchantTransactionId,
      driverId,
      paymentId,
      amountRupees: amount,
      alreadyCredited: Boolean(alreadyCredited),
    });
    res.json({
      success: true,
      data: {
        status: "paid",
        gateway: "phonepe",
        merchantTransactionId,
        transactionId: paymentId,
        wallet: result?.wallet || await serializeDriverWallet(driver),
        transaction: result?.transaction || null,
      },
    });
    return;
  }

  if (paymentState === "PENDING") {
    logPaymentDiagnostic({
      provider: "phonepe",
      scope: "driver-wallet",
      stage: "verify-pending",
      merchantTransactionId,
      driverId,
      paymentId,
      amountRupees: amount,
    });
    res.json({
      success: true,
      data: {
        status: "pending",
        gateway: "phonepe",
        merchantTransactionId,
        transactionId: paymentId,
      },
      message: payload?.message || "PhonePe payment is still pending",
    });
    return;
  }

  logPaymentDiagnostic({
    provider: "phonepe",
    scope: "driver-wallet",
    stage: "verify-failed",
    level: "warn",
    merchantTransactionId,
    driverId,
    paymentId,
    paymentState,
    amountRupees: amount,
    code: payload?.code || latestPayment?.responseCode || "",
    providerMessage:
      payload?.message ||
      latestPayment?.responseCodeDescription ||
      latestPayment?.detailedErrorCode ||
      "",
    response: summarizePhonePePayload(payload || {}),
  });
  const driverProviderCode = payload?.code || latestPayment?.responseCode || "";
  const driverProviderMessage =
    payload?.message ||
    latestPayment?.responseCodeDescription ||
    latestPayment?.detailedErrorCode ||
    "PhonePe payment was not completed";
  res.json({
    success: true,
    data: {
      status: "failed",
      gateway: "phonepe",
      merchantTransactionId,
      transactionId: paymentId,
      code: driverProviderCode,
      state: paymentState,
      providerMessage: driverProviderMessage,
    },
    message: driverProviderMessage,
  });
};


export const getDriverPaymentQrStatus = async (req, res) => {
  const rideId = String(req.query.rideId || req.params.rideId || "").trim();

  if (!rideId) {
    throw new ApiError(400, "rideId is required");
  }

  const ride = await Ride.findOne({
    _id: rideId,
    driverId: req.auth.sub,
  }).select("_id driverPaymentCollection");

  if (!ride) {
    throw new ApiError(404, "Ride not found for this driver");
  }

  if (!ride.driverPaymentCollection?.providerId) {
    res.json({
      success: true,
      data: serializeDriverPaymentCollection(ride.driverPaymentCollection),
    });
    return;
  }

  const collection = await refreshDriverPaymentCollection(ride);

  res.json({
    success: true,
    data: collection,
  });
};

const getGenericVehicleType = (vehicle = {}) => {
  const value = String(vehicle.icon_types || vehicle.name || "").toLowerCase();

  if (value.includes("bike")) {
    return "bike";
  }

  if (value.includes("auto")) {
    return "auto";
  }

  return "car";
};

export const updateDriverVehicle = async (req, res) => {
  const {
    vehicleTypeId,
    vehicleNumber,
    vehicleColor,
    vehicleMake,
    vehicleModel,
    vehicleImage,
  } = req.body;

  let selectedVehicle = null;

  if (vehicleTypeId) {
    selectedVehicle = await Vehicle.findById(vehicleTypeId);

    if (
      !selectedVehicle ||
      selectedVehicle.active === false ||
      Number(selectedVehicle.status) === 0
    ) {
      throw new ApiError(404, "Active vehicle type not found");
    }
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const update = {};
  let vehicleChanged = false;

  if (selectedVehicle) {
    const nextVehicleType = getGenericVehicleType(selectedVehicle);
    const nextVehicleIconType = selectedVehicle.icon_types || nextVehicleType;

    update.vehicleTypeId = selectedVehicle._id;
    update.vehicleType = nextVehicleType;
    update.vehicleIconType = nextVehicleIconType;

    if (
      String(driver.vehicleTypeId || "") !== String(selectedVehicle._id || "") ||
      String(driver.vehicleType || "") !== String(nextVehicleType) ||
      String(driver.vehicleIconType || "") !== String(nextVehicleIconType)
    ) {
      vehicleChanged = true;
    }
  }

  if (vehicleNumber !== undefined) {
    const normalizedVehicleNumber = String(vehicleNumber || "")
      .trim()
      .toUpperCase();
    update.vehicleNumber = normalizedVehicleNumber;
    if (String(driver.vehicleNumber || "") !== normalizedVehicleNumber) {
      vehicleChanged = true;
    }
  }
  if (vehicleColor !== undefined) {
    const normalizedVehicleColor = String(vehicleColor || "").trim();
    update.vehicleColor = normalizedVehicleColor;
    if (String(driver.vehicleColor || "") !== normalizedVehicleColor) {
      vehicleChanged = true;
    }
  }
  if (vehicleMake !== undefined) {
    const normalizedVehicleMake = String(vehicleMake || "").trim();
    update.vehicleMake = normalizedVehicleMake;
    if (String(driver.vehicleMake || "") !== normalizedVehicleMake) {
      vehicleChanged = true;
    }
  }
  if (vehicleModel !== undefined) {
    const normalizedVehicleModel = String(vehicleModel || "").trim();
    update.vehicleModel = normalizedVehicleModel;
    if (String(driver.vehicleModel || "") !== normalizedVehicleModel) {
      vehicleChanged = true;
    }
  }
  if (vehicleImage !== undefined) {
    const normalizedVehicleImage = String(vehicleImage || "").trim();
    update.vehicleImage = normalizedVehicleImage;
    if (String(driver.vehicleImage || "") !== normalizedVehicleImage) {
      vehicleChanged = true;
    }
  }

  if (vehicleChanged) {
    update.approve = false;
    update.status = "pending";
    update.isOnline = false;
  }

  const updatedDriver = await Driver.findByIdAndUpdate(req.auth.sub, update, {
    returnDocument: 'after',
  });

  const vehicleIconUrl = await resolveVehicleMapIcon(updatedDriver.vehicleTypeId);

  res.json({
    success: true,
    message: vehicleChanged
      ? "Vehicle updated and sent to admin for approval"
      : "Vehicle updated successfully",
    data: {
      id: updatedDriver._id,
      name: updatedDriver.name,
      phone: updatedDriver.phone,
      vehicleType: updatedDriver.vehicleType,
      vehicleTypeId: updatedDriver.vehicleTypeId,
      vehicleIconType: updatedDriver.vehicleIconType,
      vehicleIconUrl,
      vehicleMake: updatedDriver.vehicleMake,
      vehicleModel: updatedDriver.vehicleModel,
      vehicleNumber: updatedDriver.vehicleNumber,
      vehicleColor: updatedDriver.vehicleColor,
      vehicleImage: updatedDriver.vehicleImage || "",
      registerFor: updatedDriver.registerFor,
      approve: updatedDriver.approve,
      status: updatedDriver.status,
      isOnline: updatedDriver.isOnline,
      isOnRide: updatedDriver.isOnRide,
      vehicleApprovalRequested: vehicleChanged,
    },
  });
};

export const getDriverApprovalStatus = async (req, res) => {
  const authorization = req.headers.authorization || "";
  const [, token] = authorization.split(" ");

  if (!token) {
    throw new ApiError(401, "Authorization token is required");
  }

  const payload = verifyAccessToken(token);

  const normalizedRole = String(payload.role || "").toLowerCase();

  if (!["driver", "owner", "bus_driver", "pooling_driver", "service_center", "service_center_staff"].includes(normalizedRole)) {
    throw new ApiError(403, "Insufficient permissions for this resource. Role: " + normalizedRole);
  }

  if (normalizedRole === "owner") {
    const owner = await Owner.findById(payload.sub);

    if (!owner) {
      throw new ApiError(404, "Owner not found");
    }

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.json({
      success: true,
      data: {
        id: owner._id,
        name: owner.owner_name || owner.name || owner.company_name || "",
        phone: owner.mobile || owner.phone || "",
        approve: owner.approve,
        status: owner.status,
        documents: owner.documents || {},
        onboarding: owner.onboarding || {},
        isOnline: false,
        isOnRide: false,
      },
    });
    return;
  }

  if (normalizedRole === "bus_driver") {
    const busDriver = await BusDriver.findById(payload.sub);

    if (!busDriver) {
      throw new ApiError(404, "Bus driver not found");
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.json({
      success: true,
      data: {
        id: busDriver._id,
        name: busDriver.name || "",
        phone: busDriver.phone || "",
        approve: busDriver.approve,
        status: busDriver.status,
        documents: {},
        onboarding: busDriver.onboarding || {},
        rejectionReason: busDriver.rejectionReason || "",
        isOnline: false,
        isOnRide: false,
      },
    });
    return;
  }

  if (normalizedRole === "service_center") {
    const center = await ServiceStore.findById(payload.sub);

    if (!center) {
      throw new ApiError(404, "Service center not found");
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.json({
      success: true,
      data: {
        id: center._id,
        name: center.name || "",
        phone: center.owner_phone || "",
        approve: center.approve,
        status: center.approve === false ? "pending" : center.status,
        documents: {},
        onboarding: center.onboarding || {},
        rejectionReason: center.rejectionReason || "",
        isOnline: false,
        isOnRide: false,
      },
    });
    return;
  }

  if (normalizedRole === "service_center_staff") {
    const staff = await ServiceCenterStaff.findById(payload.sub);

    if (!staff) {
      throw new ApiError(404, "Service staff not found");
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.json({
      success: true,
      data: {
        id: staff._id,
        name: staff.name || "",
        phone: staff.phone || "",
        approve: staff.approve,
        status: staff.approve === false ? "pending" : staff.status,
        documents: {},
        onboarding: staff.onboarding || {},
        rejectionReason: staff.rejectionReason || "",
        isOnline: false,
        isOnRide: false,
      },
    });
    return;
  }

  if (normalizedRole === "pooling_driver") {
    const poolingVehicle = await PoolingVehicle.findById(payload.sub).lean();

    if (!poolingVehicle) {
      throw new ApiError(404, "Pooling driver not found");
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.json({
      success: true,
      data: {
        id: poolingVehicle._id,
        name: poolingVehicle.driverName || "",
        phone: poolingVehicle.phone || "",
        approve: poolingVehicle.approve,
        status: poolingVehicle.status,
        documents: poolingVehicle.documents || {},
        onboarding: poolingVehicle.onboarding || {},
        rejectionReason: poolingVehicle.rejectionReason || "",
        isOnline: poolingVehicle.isOnline || false,
        isOnRide: poolingVehicle.isOnRide || false,
      },
    });
    return;
  }

  const driver = await Driver.findById(payload.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  res.json({
    success: true,
    data: {
      id: driver._id,
      name: driver.name,
      phone: driver.phone,
      approve: driver.approve,
      status: driver.status,
      documents: driver.documents || {},
      onboarding: driver.onboarding || {},
      isOnline: driver.isOnline,
      isOnRide: driver.isOnRide,
    },
  });
};

export const getServiceLocations = async (_req, res) => {
  const results = await listDriverServiceLocations();

  res.json({
    success: true,
    data: { results },
  });
};

export const getDriverDocumentTemplates = async (_req, res) => {
  const requestedRole = String(_req.query?.role || "driver").trim().toLowerCase();
  const isOwnerRequest = requestedRole === "owner";
  const isFleetRequest =
    requestedRole === "fleet" ||
    requestedRole === "owner_vehicle" ||
    requestedRole === "owner-vehicle";
  const results = isFleetRequest
    ? await listDriverNeededDocuments({
        activeOnly: true,
        includeFields: true,
      })
    : isOwnerRequest
    ? await listOwnerNeededDocuments()
    : await listDriverNeededDocuments({
        activeOnly: true,
        includeFields: true,
      });

  res.json({
    success: true,
    data: {
      results: isOwnerRequest ? results.filter((item) => item.active !== false).map((item) => ({
        ...item,
        fields:
          item.image_type === "front_back"
            ? [
                {
                  key: `${String(item.name || "owner_document").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "owner_document"}_${String(item._id || "").replace(/[^a-zA-Z0-9]/g, "")}_front`,
                  label: `${item.name} Front`,
                  side: "front",
                  required: item.is_required !== false,
                },
                {
                  key: `${String(item.name || "owner_document").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "owner_document"}_${String(item._id || "").replace(/[^a-zA-Z0-9]/g, "")}_back`,
                  label: `${item.name} Back`,
                  side: "back",
                  required: item.is_required !== false,
                },
              ]
            : [
                {
                  key: `${String(item.name || "owner_document").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "owner_document"}_${String(item._id || "").replace(/[^a-zA-Z0-9]/g, "")}`,
                  label:
                    item.image_type === "front"
                      ? `${item.name} Front`
                      : item.image_type === "back"
                        ? `${item.name} Back`
                        : item.name,
                  side: item.image_type === "front" ? "front" : item.image_type === "back" ? "back" : "single",
                  required: item.is_required !== false,
                },
              ],
      }))
      : isFleetRequest
        ? results
      : results,
    },
  });
};

export const getDriverVehicleFieldTemplates = async (req, res) => {
  const requestedRole = String(req.query?.role || "driver").trim().toLowerCase();
  const results = await listDriverVehicleFieldTemplates({ activeOnly: true });
  const matchesAccountType = (accountType) => {
    const rawAccountType = String(accountType || "").trim().toLowerCase();
    const normalizedAccountType = rawAccountType || "individual";

    if (requestedRole === "owner") {
      if (!rawAccountType) {
        return false;
      }

      return [
        "fleet_drivers",
        "fleet drivers",
        "owner",
        "owners",
        "fleet_owner",
        "fleet_owners",
        "fleet owner",
        "fleet owners",
      ].includes(normalizedAccountType);
    }

    if (normalizedAccountType === "both") {
      return true;
    }

    return normalizedAccountType === "individual";
  };

  res.json({
    success: true,
    data: {
      results: results.filter((item) => matchesAccountType(item.account_type)),
    },
  });
};

export const addOwnerVehicle = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Vehicle addition is only available for owner accounts",
    );
  }

  const { vehicleTypeId, make, model, number, color, rcFile, documents } = req.body;

  if (!make?.trim()) {
    throw new ApiError(400, "Car brand/make is required");
  }

  if (!model?.trim()) {
    throw new ApiError(400, "Car model is required");
  }

  if (!number?.trim()) {
    throw new ApiError(400, "License plate number is required");
  }

  if (!color?.trim()) {
    throw new ApiError(400, "Car color is required");
  }

  const normalizedPlate = String(number).trim().toUpperCase();

  const normalizedDocuments = normalizeFleetVehicleDocuments(documents, rcFile);
  const configuredFleetDocuments = await listDriverNeededDocuments({
    activeOnly: true,
    includeFields: true,
  });
  const requiredFleetDocumentKeys = configuredFleetDocuments.flatMap((template) =>
    (Array.isArray(template.fields) ? template.fields : [])
      .filter((field) => (field.required ?? template.is_required ?? false))
      .map((field) => String(field.key || "").trim())
      .filter(Boolean),
  );
  const missingFleetDocuments = requiredFleetDocumentKeys.filter(
    (key) => !normalizedDocuments[key],
  );

  if (missingFleetDocuments.length > 0) {
    throw new ApiError(
      400,
      `Missing required fleet documents: ${missingFleetDocuments.join(", ")}`,
    );
  }

  // Check for duplicate license plate for this owner
  const existing = await FleetVehicle.findOne({
    owner_id: owner._id,
    license_plate_number: normalizedPlate,
  }).lean();

  if (existing) {
    throw new ApiError(
      409,
      "Fleet vehicle with this license plate already exists for this owner",
    );
  }

  // Get service location from owner or use first available
  let serviceLocationId = owner.service_location_id;
  if (!serviceLocationId) {
    const defaultLocation = await ServiceLocation.findOne({ active: true })
      .select("_id")
      .lean();
    if (!defaultLocation) {
      throw new ApiError(400, "No service location available");
    }
    serviceLocationId = defaultLocation._id;
  }

  const vehicle = await FleetVehicle.create({
    owner_id: owner._id,
    service_location_id: serviceLocationId,
    transport_type: "taxi",
    vehicle_type_id:
      vehicleTypeId && String(vehicleTypeId).trim() ? vehicleTypeId : null,
    car_brand: String(make).trim(),
    car_model: String(model).trim(),
    license_plate_number: normalizedPlate,
    car_color: String(color).trim(),
    status: "pending",
    active: true,
    documents: normalizedDocuments,
  });

  const populated = await FleetVehicle.findById(vehicle._id)
    .populate("owner_id", "company_name owner_name name email mobile")
    .populate("service_location_id", "service_location_name name country")
    .populate("vehicle_type_id", "name type_name transport_type icon_types")
    .lean();

  res.status(201).json({
    success: true,
    message: "Vehicle added successfully and is pending approval",
    data: {
      id: String(populated._id),
      owner_id: String(populated.owner_id?._id || ""),
      owner_name:
        populated.owner_id?.company_name ||
        populated.owner_id?.owner_name ||
        populated.owner_id?.name ||
        "",
      service_location_id: String(populated.service_location_id?._id || ""),
      service_location_name:
        populated.service_location_id?.service_location_name ||
        populated.service_location_id?.name ||
        "",
      transport_type: populated.transport_type,
      vehicle_type_id: String(populated.vehicle_type_id?._id || ""),
      vehicle_type_name:
        populated.vehicle_type_id?.name ||
        populated.vehicle_type_id?.type_name ||
        "",
      car_brand: populated.car_brand,
      car_model: populated.car_model,
      license_plate_number: populated.license_plate_number,
      car_color: populated.car_color,
      status: populated.status,
      active: populated.active,
      createdAt: populated.createdAt,
    },
  });
};

export const getOwnerFleetVehicles = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Fleet vehicle access is only available for owner accounts",
    );
  }

  const vehicles = await FleetVehicle.find({
    owner_id: owner._id,
    active: true,
  })
    .populate("vehicle_type_id", "name type_name transport_type icon_types")
    .sort({ createdAt: -1 })
    .lean();

  const assignedDrivers = await Driver.find({
    owner_id: owner._id,
    deletedAt: null,
    assignedFleetVehicleId: { $ne: null },
  })
    .select("name phone assignedFleetVehicleId")
    .lean();

  const assignedVehicleMap = new Map(
    assignedDrivers
      .filter((driver) => driver.assignedFleetVehicleId)
      .map((driver) => [
        String(driver.assignedFleetVehicleId),
        {
          id: String(driver._id),
          name: driver.name || "",
          phone: driver.phone || "",
        },
      ]),
  );

  res.json({
    success: true,
    data: {
      results: vehicles.map((vehicle) => ({
        _id: String(vehicle._id),
        id: String(vehicle._id),
        vehicle_type_id: vehicle.vehicle_type_id?._id || null,
        vehicle_type_name:
          vehicle.vehicle_type_id?.name ||
          vehicle.vehicle_type_id?.type_name ||
          "",
        car_brand: vehicle.car_brand || "",
        car_model: vehicle.car_model || "",
        license_plate_number: vehicle.license_plate_number || "",
        car_color: vehicle.car_color || "",
        status: vehicle.status || "pending",
        reason: vehicle.reason || "",
        documents: vehicle.documents || {},
        rc_document:
          vehicle.documents?.rc ||
          vehicle.documents?.document ||
          vehicle.documents?.file ||
          "",
        transport_type: vehicle.transport_type || "taxi",
        active: vehicle.active,
        assignedDriver: assignedVehicleMap.get(String(vehicle._id)) || null,
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt,
      })),
    },
  });
};

export const getOwnerFleetZones = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Fleet zone access is only available for owner accounts",
    );
  }

  const baseZoneQuery = {
    active: { $ne: false },
    status: { $ne: "inactive" },
  };
  const ownerScopedZoneQuery = owner.service_location_id
    ? { ...baseZoneQuery, service_location_id: owner.service_location_id }
    : baseZoneQuery;

  let zones = await Zone.find(ownerScopedZoneQuery)
    .select("name service_location_id active status")
    .sort({ name: 1, createdAt: -1 })
    .lean();

  // Some admin-created zones are global or were created without the owner's exact
  // service location linkage. Fall back so owners can still assign a valid zone.
  if (!zones.length && owner.service_location_id) {
    zones = await Zone.find(baseZoneQuery)
      .select("name service_location_id active status")
      .sort({ name: 1, createdAt: -1 })
      .lean();
  }

  res.json({
    success: true,
    data: {
      results: zones.map((zone) => ({
        id: String(zone._id),
        _id: String(zone._id),
        name: zone.name || "",
        service_location_id: zone.service_location_id
          ? String(zone.service_location_id)
          : "",
        active: zone.active !== false,
        status: zone.status || "active",
      })),
    },
  });
};

export const updateOwnerFleetVehicle = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Fleet vehicle access is only available for owner accounts",
    );
  }

  const vehicleId = String(req.params?.vehicleId || "").trim();
  if (!vehicleId || !mongoose.isValidObjectId(vehicleId)) {
    throw new ApiError(400, "A valid vehicle id is required");
  }

  const vehicle = await FleetVehicle.findOne({
    _id: vehicleId,
    owner_id: owner._id,
    active: true,
  });

  if (!vehicle) {
    throw new ApiError(404, "Fleet vehicle not found");
  }

  const vehicleTypeId =
    req.body?.vehicleTypeId || req.body?.vehicle_type_id || null;
  const make = String(
    req.body?.vehicleMake || req.body?.make || req.body?.car_brand || "",
  ).trim();
  const model = String(
    req.body?.vehicleModel || req.body?.model || req.body?.car_model || "",
  ).trim();
  const number = String(
    req.body?.vehicleNumber ||
      req.body?.number ||
      req.body?.license_plate_number ||
      "",
  )
    .trim()
    .toUpperCase();
  const color = String(
    req.body?.vehicleColor || req.body?.color || req.body?.car_color || "",
  ).trim();
  const rcFile = String(req.body?.rcFile || "").trim();
  const nextDocuments = normalizeFleetVehicleDocuments(
    req.body?.documents || {},
    rcFile ||
      req.body?.documents?.rc ||
      req.body?.document ||
      req.body?.file ||
      "",
  );

  if (!vehicleTypeId || !mongoose.isValidObjectId(vehicleTypeId)) {
    throw new ApiError(400, "A valid vehicle type is required");
  }

  if (!make) {
    throw new ApiError(400, "Car brand/make is required");
  }

  if (!model) {
    throw new ApiError(400, "Car model is required");
  }

  if (!number) {
    throw new ApiError(400, "License plate number is required");
  }

  if (!color) {
    throw new ApiError(400, "Car color is required");
  }

  const duplicate = await FleetVehicle.findOne({
    owner_id: owner._id,
    license_plate_number: number,
    _id: { $ne: vehicle._id },
  }).lean();

  if (duplicate) {
    throw new ApiError(
      409,
      "Fleet vehicle with this license plate already exists for this owner",
    );
  }

  vehicle.vehicle_type_id = vehicleTypeId;
  vehicle.car_brand = make;
  vehicle.car_model = model;
  vehicle.license_plate_number = number;
  vehicle.car_color = color;
  if (Object.keys(nextDocuments).length > 0) {
    vehicle.documents = {
      ...(vehicle.documents || {}),
      ...nextDocuments,
    };
    vehicle.markModified("documents");
  }
  if (String(vehicle.status || "").toLowerCase() === "rejected") {
    vehicle.status = "pending";
    vehicle.reason = "";
  }

  await vehicle.save();

  const populated = await FleetVehicle.findById(vehicle._id)
    .populate("vehicle_type_id", "name type_name transport_type icon_types")
    .lean();

  res.json({
    success: true,
    message:
      String(populated.status || "").toLowerCase() === "pending"
        ? "Vehicle updated and resubmitted for verification"
        : "Vehicle updated successfully",
    data: {
      _id: String(populated._id),
      id: String(populated._id),
      vehicle_type_id: populated.vehicle_type_id?._id || null,
      vehicle_type_name:
        populated.vehicle_type_id?.name ||
        populated.vehicle_type_id?.type_name ||
        "",
      car_brand: populated.car_brand || "",
      car_model: populated.car_model || "",
      license_plate_number: populated.license_plate_number || "",
      car_color: populated.car_color || "",
      status: populated.status || "pending",
      reason: populated.reason || "",
      documents: populated.documents || {},
      rc_document:
        populated.documents?.rc ||
        populated.documents?.document ||
        populated.documents?.file ||
        "",
      transport_type: populated.transport_type || "taxi",
      active: populated.active,
      createdAt: populated.createdAt,
      updatedAt: populated.updatedAt,
    },
  });
};

export const deleteOwnerFleetVehicle = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Fleet vehicle access is only available for owner accounts",
    );
  }

  const vehicle = await FleetVehicle.findOne({
    _id: req.params.vehicleId,
    owner_id: owner._id,
  });

  if (!vehicle) {
    throw new ApiError(404, "Fleet vehicle not found");
  }

  await FleetVehicle.deleteOne({ _id: vehicle._id });

  res.json({
    success: true,
    message: "Vehicle deleted successfully",
    data: { deleted: true },
  });
};

export const getOwnerPoolingVehicles = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Pooling vehicle access is only available for owner accounts",
    );
  }

  const vehicles = await PoolingVehicle.find({ ownerId: owner._id })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: vehicles,
    message: "Owner pooling vehicles fetched successfully",
  });
};

export const createOwnerPoolingVehicle = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Pooling vehicle access is only available for owner accounts",
    );
  }

  const body = req.body || {};
  const vehicle = await PoolingVehicle.create({
    name: String(body.name || "").trim(),
    vehicleModel: String(body.vehicleModel || "").trim(),
    vehicleNumber: String(body.vehicleNumber || "").trim(),
    driverName: String(body.driverName || "").trim(),
    driverPhone: String(body.driverPhone || "").trim(),
    color: String(body.color || "").trim(),
    capacity: Math.max(1, Number(body.capacity || 1) || 1),
    vehicleType: ['bike', 'sedan', 'hatchback', 'suv', 'van', 'luxury'].includes(String(body.vehicleType || ''))
      ? String(body.vehicleType)
      : 'sedan',
    blueprint: body.blueprint || {},
    images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
    ownerId: owner._id,
    approve: false,
    status: 'pending',
    poolingEnabled: true,
    adminCommissionPercentage: 0,
    ownerCommissionPercentage: 0,
    serviceTaxPercentage: 0,
  });

  res.status(201).json({
    success: true,
    data: vehicle,
    message: "Pooling vehicle created successfully",
  });
};

export const updateOwnerPoolingVehicle = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Pooling vehicle access is only available for owner accounts",
    );
  }

  const body = req.body || {};
  const vehicle = await PoolingVehicle.findOneAndUpdate(
      { _id: req.params.vehicleId, ownerId: owner._id },
      {
        name: String(body.name || "").trim(),
        vehicleModel: String(body.vehicleModel || "").trim(),
        vehicleNumber: String(body.vehicleNumber || "").trim(),
        driverName: String(body.driverName || "").trim(),
        driverPhone: String(body.driverPhone || "").trim(),
        color: String(body.color || "").trim(),
        capacity: Math.max(1, Number(body.capacity || 1) || 1),
        vehicleType: ['bike', 'sedan', 'hatchback', 'suv', 'van', 'luxury'].includes(String(body.vehicleType || ''))
          ? String(body.vehicleType)
          : 'sedan',
        blueprint: body.blueprint || {},
        images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
        ownerId: owner._id,
      },
      { returnDocument: 'after', runValidators: true },
    );

  if (!vehicle) {
    throw new ApiError(404, "Pooling vehicle not found");
  }

  res.json({
    success: true,
    data: vehicle,
    message: "Pooling vehicle updated successfully",
  });
};

export const deleteOwnerPoolingVehicle = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Pooling vehicle access is only available for owner accounts",
    );
  }

  const vehicle = await PoolingVehicle.findOneAndDelete({
    _id: req.params.vehicleId,
    ownerId: owner._id,
  });

  if (!vehicle) {
    throw new ApiError(404, "Pooling vehicle not found");
  }

  res.json({
    success: true,
    data: { deleted: true },
    message: "Pooling vehicle deleted successfully",
  });
};

export const getOwnerFleetDrivers = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Fleet driver access is only available for owner accounts",
    );
  }

  const drivers = await Driver.find({ owner_id: owner._id, deletedAt: null })
    .populate(
      "assignedFleetVehicleId",
      "vehicle_type_id car_brand car_model license_plate_number car_color status",
    )
    .populate("zoneId", "name service_location_id")
    .sort({ createdAt: -1 })
    .select("name phone email city salary approve status isOnline isOnRide createdAt assignedFleetVehicleId zoneId")
    .lean();

  res.json({
    success: true,
    data: {
      results: drivers.map((driver) => ({
        id: String(driver._id),
        name: driver.name || "",
        phone: driver.phone || "",
        email: driver.email || "",
        city: driver.city || "",
        salary: Number(driver.salary || 0),
        assignedVehicle: driver.assignedFleetVehicleId
          ? {
              vehicleId: String(driver.assignedFleetVehicleId._id || ""),
              name: [
                driver.assignedFleetVehicleId.car_brand,
                driver.assignedFleetVehicleId.car_model,
              ]
                .filter(Boolean)
                .join(" ")
                .trim(),
              number: driver.assignedFleetVehicleId.license_plate_number || "",
              color: driver.assignedFleetVehicleId.car_color || "",
              status: driver.assignedFleetVehicleId.status || "pending",
            }
          : null,
        zone: driver.zoneId
          ? {
              zoneId: String(driver.zoneId._id || ""),
              name: driver.zoneId.name || "",
              service_location_id: driver.zoneId.service_location_id
                ? String(driver.zoneId.service_location_id)
                : "",
            }
          : null,
        approve: driver.approve,
        status: driver.status,
        isOnline: Boolean(driver.isOnline),
        isOnRide: Boolean(driver.isOnRide),
        createdAt: driver.createdAt,
      })),
    },
  });
};

export const createOwnerFleetDriver = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Fleet driver access is only available for owner accounts",
    );
  }

  const name = String(req.body?.name || "").trim();
  const phone = normalizePhone(req.body?.phone || req.body?.mobile);
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const salaryValue = Number(
    req.body?.salary ?? req.body?.monthly_salary ?? req.body?.monthlySalary ?? 0,
  );

  if (!name) {
    throw new ApiError(400, "name is required");
  }

  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, "A valid 10-digit mobile number is required");
  }

  if (!Number.isFinite(salaryValue) || salaryValue < 0) {
    throw new ApiError(400, "A valid non-negative salary is required");
  }

  const existing = await Driver.findOne({ phone }).lean();
  if (existing) {
    throw new ApiError(409, "Phone number is already registered");
  }

  const serviceLocation = owner.service_location_id
    ? await ServiceLocation.findById(owner.service_location_id).lean()
    : null;
  const coordinates =
    Array.isArray(serviceLocation?.location?.coordinates) &&
    serviceLocation.location.coordinates.length === 2
      ? serviceLocation.location.coordinates
      : typeof serviceLocation?.longitude === "number" &&
          typeof serviceLocation?.latitude === "number"
        ? [serviceLocation.longitude, serviceLocation.latitude]
        : [75.8577, 22.7196];

  const city =
    String(req.body?.city || "").trim() ||
    String(
      serviceLocation?.service_location_name || serviceLocation?.name || "",
    ).trim() ||
    "";

  const tempPassword = crypto.randomUUID().slice(0, 12);

  const driver = await Driver.create({
    owner_id: owner._id,
    service_location_id: owner.service_location_id || null,
    name,
    phone,
    email,
    salary: salaryValue,
    gender: "",
    password: await hashPassword(tempPassword),
    vehicleType: "car",
    vehicleIconType: "car",
    registerFor: "taxi",
    vehicleNumber: "",
    vehicleColor: "",
    city,
    approve: false,
    status: "pending",
    location: toPoint(coordinates, "location"),
  });

  res.status(201).json({
    success: true,
    data: {
      id: String(driver._id),
      message: "Fleet driver request created",
    },
  });
};

export const getOwnerFleetDashboard = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Owner dashboard is only available for owner accounts",
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [serviceLocation, drivers, vehicles] = await Promise.all([
    owner.service_location_id
      ? ServiceLocation.findById(owner.service_location_id)
          .select(
            "name service_location_name address city status active latitude longitude location currency_symbol currency_code timezone",
          )
          .lean()
      : null,
    Driver.find({ owner_id: owner._id, deletedAt: null })
      .select("name phone email city approve status isOnline isOnRide createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    FleetVehicle.find({ owner_id: owner._id, active: true })
      .populate("vehicle_type_id", "name type_name transport_type")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const driverIds = drivers.map((driver) => driver._id);

  const emptyMetrics = {
    totalBookings: 0,
    completedBookings: 0,
    cancelledBookings: 0,
    activeBookings: 0,
    grossRevenue: 0,
    ownerEarnings: 0,
    cashTrips: 0,
    onlineTrips: 0,
  };

  let rideMetrics = emptyMetrics;
  let todayMetrics = emptyMetrics;
  let transportBreakdown = [];
  let recentRides = [];
  let busOverview = {
    totalBuses: 0,
    activeBuses: 0,
    totalBookings: 0,
    upcomingBookings: 0,
    confirmedBookings: 0,
    grossRevenue: 0,
  };
  let recentBusBookings = [];

  if (driverIds.length > 0) {
    const [rideMetricsResult, todayMetricsResult, transportBreakdownResult, recentRideDocs] =
      await Promise.all([
        Ride.aggregate([
          { $match: { driverId: { $in: driverIds } } },
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              completedBookings: {
                $sum: {
                  $cond: [{ $eq: ["$status", RIDE_STATUS.COMPLETED] }, 1, 0],
                },
              },
              cancelledBookings: {
                $sum: {
                  $cond: [{ $eq: ["$status", RIDE_STATUS.CANCELLED] }, 1, 0],
                },
              },
              activeBookings: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        "$status",
                        [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING],
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              grossRevenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", RIDE_STATUS.COMPLETED] },
                    { $ifNull: ["$fare", 0] },
                    0,
                  ],
                },
              },
              ownerEarnings: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", RIDE_STATUS.COMPLETED] },
                    { $ifNull: ["$driverEarnings", 0] },
                    0,
                  ],
                },
              },
              cashTrips: {
                $sum: {
                  $cond: [{ $eq: ["$paymentMethod", "cash"] }, 1, 0],
                },
              },
              onlineTrips: {
                $sum: {
                  $cond: [{ $eq: ["$paymentMethod", "online"] }, 1, 0],
                },
              },
            },
          },
        ]),
        Ride.aggregate([
          {
            $match: {
              driverId: { $in: driverIds },
              createdAt: { $gte: startOfToday },
            },
          },
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              completedBookings: {
                $sum: {
                  $cond: [{ $eq: ["$status", RIDE_STATUS.COMPLETED] }, 1, 0],
                },
              },
              cancelledBookings: {
                $sum: {
                  $cond: [{ $eq: ["$status", RIDE_STATUS.CANCELLED] }, 1, 0],
                },
              },
              activeBookings: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        "$status",
                        [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING],
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              grossRevenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", RIDE_STATUS.COMPLETED] },
                    { $ifNull: ["$fare", 0] },
                    0,
                  ],
                },
              },
              ownerEarnings: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", RIDE_STATUS.COMPLETED] },
                    { $ifNull: ["$driverEarnings", 0] },
                    0,
                  ],
                },
              },
              cashTrips: {
                $sum: {
                  $cond: [{ $eq: ["$paymentMethod", "cash"] }, 1, 0],
                },
              },
              onlineTrips: {
                $sum: {
                  $cond: [{ $eq: ["$paymentMethod", "online"] }, 1, 0],
                },
              },
            },
          },
        ]),
        Ride.aggregate([
          { $match: { driverId: { $in: driverIds } } },
          {
            $group: {
              _id: { $ifNull: ["$transport_type", "taxi"] },
              trips: { $sum: 1 },
              completedTrips: {
                $sum: {
                  $cond: [{ $eq: ["$status", RIDE_STATUS.COMPLETED] }, 1, 0],
                },
              },
              earnings: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", RIDE_STATUS.COMPLETED] },
                    { $ifNull: ["$driverEarnings", 0] },
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { trips: -1, _id: 1 } },
        ]),
        Ride.find({ driverId: { $in: driverIds } })
          .select(
            "pickupAddress dropAddress status fare driverEarnings paymentMethod transport_type createdAt driverId",
          )
          .populate("driverId", "name phone")
          .sort({ createdAt: -1 })
          .limit(6)
          .lean(),
      ]);

    const normalizeMetrics = (value = {}) => ({
      totalBookings: Number(value.totalBookings || 0),
      completedBookings: Number(value.completedBookings || 0),
      cancelledBookings: Number(value.cancelledBookings || 0),
      activeBookings: Number(value.activeBookings || 0),
      grossRevenue: Number(value.grossRevenue || 0),
      ownerEarnings: Number(value.ownerEarnings || 0),
      cashTrips: Number(value.cashTrips || 0),
      onlineTrips: Number(value.onlineTrips || 0),
    });

    rideMetrics = normalizeMetrics(rideMetricsResult[0] || emptyMetrics);
    todayMetrics = normalizeMetrics(todayMetricsResult[0] || emptyMetrics);
    transportBreakdown = transportBreakdownResult.map((item) => ({
      transportType: String(item._id || "taxi"),
      trips: Number(item.trips || 0),
      completedTrips: Number(item.completedTrips || 0),
      earnings: Number(item.earnings || 0),
    }));
    recentRides = recentRideDocs.map((ride) => ({
      id: String(ride._id),
      pickupAddress: ride.pickupAddress || "",
      dropAddress: ride.dropAddress || "",
      status: ride.status || "",
      fare: Number(ride.fare || 0),
      earnings: Number(ride.driverEarnings || 0),
      paymentMethod: ride.paymentMethod || "cash",
      transportType: ride.transport_type || "taxi",
      createdAt: ride.createdAt,
      driver: {
        id: String(ride.driverId?._id || ""),
        name: ride.driverId?.name || "",
        phone: ride.driverId?.phone || "",
      },
    }));
  }

  const approvedDrivers = drivers.filter(
    (driver) =>
      driver.approve === true ||
      String(driver.status || "").toLowerCase() === "approved",
  );
  const onlineDrivers = approvedDrivers.filter((driver) => driver.isOnline);
  const busyDrivers = approvedDrivers.filter((driver) => driver.isOnRide);
  const availableDrivers = approvedDrivers.filter(
    (driver) => driver.isOnline && !driver.isOnRide,
  );

  const approvedVehicles = vehicles.filter(
    (vehicle) => String(vehicle.status || "").toLowerCase() === "approved",
  );
  const pendingVehicles = vehicles.filter(
    (vehicle) => String(vehicle.status || "").toLowerCase() === "pending",
  );
  const rejectedVehicles = vehicles.filter(
    (vehicle) => String(vehicle.status || "").toLowerCase() === "rejected",
  );

  const ownerBusServices = await BusService.find({ ownerId: owner._id })
    .select("status")
    .sort({ createdAt: -1 })
    .lean();
  const ownerBusServiceIds = ownerBusServices.map((item) => item._id);

  if (ownerBusServiceIds.length > 0) {
    const [busBookingMetrics, busRecentBookingDocs] = await Promise.all([
      BusBooking.aggregate([
        {
          $match: {
            busServiceId: { $in: ownerBusServiceIds },
          },
        },
        {
          $group: {
            _id: null,
            totalBookings: { $sum: 1 },
            upcomingBookings: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["pending", "confirmed"]] },
                  1,
                  0,
                ],
              },
            },
            confirmedBookings: {
              $sum: {
                $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0],
              },
            },
            grossRevenue: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["pending", "confirmed"]] },
                  { $ifNull: ["$amount", 0] },
                  0,
                ],
              },
            },
          },
        },
      ]),
      BusBooking.find({ busServiceId: { $in: ownerBusServiceIds } })
        .populate("busServiceId", "busName operatorName serviceNumber status")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
    ]);

    const busMetrics = busBookingMetrics[0] || {};
    busOverview = {
      totalBuses: ownerBusServices.length,
      activeBuses: ownerBusServices.filter(
        (item) => String(item.status || "").toLowerCase() === "active",
      ).length,
      totalBookings: Number(busMetrics.totalBookings || 0),
      upcomingBookings: Number(busMetrics.upcomingBookings || 0),
      confirmedBookings: Number(busMetrics.confirmedBookings || 0),
      grossRevenue: Number(busMetrics.grossRevenue || 0),
    };
    recentBusBookings = busRecentBookingDocs.map(serializeOwnerBusBooking);
  }

  res.json({
    success: true,
    data: {
      profile: {
        id: String(owner._id),
        companyName: owner.company_name || owner.name || "",
        ownerName: owner.owner_name || owner.name || "",
        phone: owner.mobile || owner.phone || "",
        email: owner.email || "",
        city: owner.city || "",
        address: owner.address || "",
        transportType: owner.transport_type || "taxi",
        status: owner.status || "approved",
        walletBalance: Number(owner.wallet?.balance || 0),
        noOfVehicles: Number(owner.no_of_vehicles || 0),
      },
      serviceLocation: serviceLocation
        ? {
            id: String(serviceLocation._id),
            name:
              serviceLocation.service_location_name ||
              serviceLocation.name ||
              "",
            address: serviceLocation.address || "",
            status: serviceLocation.status || "active",
            active: serviceLocation.active !== false,
            latitude: Number(serviceLocation.latitude || 0),
            longitude: Number(serviceLocation.longitude || 0),
            currencySymbol:
              serviceLocation.currency_symbol &&
              serviceLocation.currency_symbol !== "â‚¹"
                ? serviceLocation.currency_symbol
                : "₹",
            currencyCode: serviceLocation.currency_code || "INR",
            timezone: serviceLocation.timezone || "Asia/Kolkata",
          }
        : null,
      fleet: {
        totalDrivers: drivers.length,
        approvedDrivers: approvedDrivers.length,
        onlineDrivers: onlineDrivers.length,
        busyDrivers: busyDrivers.length,
        availableDrivers: availableDrivers.length,
        pendingDrivers: Math.max(0, drivers.length - approvedDrivers.length),
        totalVehicles: vehicles.length,
        approvedVehicles: approvedVehicles.length,
        pendingVehicles: pendingVehicles.length,
        rejectedVehicles: rejectedVehicles.length,
      },
      bookings: {
        total: rideMetrics.totalBookings,
        active: rideMetrics.activeBookings,
        completed: rideMetrics.completedBookings,
        cancelled: rideMetrics.cancelledBookings,
        todayTotal: todayMetrics.totalBookings,
        todayCompleted: todayMetrics.completedBookings,
        todayCancelled: todayMetrics.cancelledBookings,
      },
      earnings: {
        walletBalance: Number(owner.wallet?.balance || 0),
        grossRevenue: rideMetrics.grossRevenue,
        ownerEarnings: rideMetrics.ownerEarnings,
        todayGrossRevenue: todayMetrics.grossRevenue,
        todayOwnerEarnings: todayMetrics.ownerEarnings,
        onlineTrips: rideMetrics.onlineTrips,
        cashTrips: rideMetrics.cashTrips,
      },
      busOverview,
      transportBreakdown,
      recentDrivers: drivers.slice(0, 5).map((driver) => ({
        id: String(driver._id),
        name: driver.name || "",
        phone: driver.phone || "",
        city: driver.city || "",
        status: driver.status || "pending",
        isOnline: Boolean(driver.isOnline),
        isOnRide: Boolean(driver.isOnRide),
        createdAt: driver.createdAt,
      })),
      recentVehicles: vehicles.slice(0, 5).map((vehicle) => ({
        id: String(vehicle._id),
        brand: vehicle.car_brand || "",
        model: vehicle.car_model || "",
        color: vehicle.car_color || "",
        number: vehicle.license_plate_number || "",
        status: vehicle.status || "pending",
        transportType: vehicle.transport_type || "taxi",
        vehicleTypeName:
          vehicle.vehicle_type_id?.name ||
          vehicle.vehicle_type_id?.type_name ||
          "",
        createdAt: vehicle.createdAt,
      })),
      recentBusBookings,
      recentRides,
    },
  });
};

export const listOwnerBusServices = async (req, res) => {
  const owner = await Owner.findById(req.auth.sub).lean();

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  res.json({
    success: true,
    data: await listBusServices({ ownerId: owner._id }),
  });
};

export const createOwnerBusService = async (req, res) => {
  const owner = await Owner.findById(req.auth.sub).lean();

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  const resolvedDriver = await resolveOwnerScopedBusDriverDetails(owner, req.body || {});

  res.status(201).json({
    success: true,
    data: await createBusService(
      {
        ...(req.body || {}),
        ownerDriverId: resolvedDriver.ownerDriverId,
        driverName: resolvedDriver.driverName,
        driverPhone: resolvedDriver.driverPhone,
      },
      { ownerId: owner._id },
    ),
  });
};

export const updateOwnerBusService = async (req, res) => {
  const owner = await Owner.findById(req.auth.sub).lean();

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  const existingBus = await BusService.findOne({ _id: req.params.id, ownerId: owner._id })
    .select("ownerDriverId driverName driverPhone")
    .lean();

  if (!existingBus) {
    throw new ApiError(404, "Bus service not found");
  }

  const resolvedDriver = await resolveOwnerScopedBusDriverDetails(owner, req.body || {}, existingBus);

  res.json({
    success: true,
    data: await updateBusService(
      req.params.id,
      {
        ...(req.body || {}),
        ownerDriverId: resolvedDriver.ownerDriverId,
        driverName: resolvedDriver.driverName,
        driverPhone: resolvedDriver.driverPhone,
      },
      { ownerId: owner._id },
    ),
  });
};

export const deleteOwnerBusService = async (req, res) => {
  const owner = await Owner.findById(req.auth.sub).lean();

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  await deleteBusService(req.params.id, { ownerId: owner._id });
  res.json({
    success: true,
    message: "Bus service deleted",
  });
};

export const getOwnerBusBookings = async (req, res) => {
  const owner = await Owner.findById(req.auth.sub).lean();

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  const busServiceId = toCleanString(req.query?.busServiceId);
  const travelDate = toCleanString(req.query?.travelDate || req.query?.date);
  const scheduleId = toCleanString(req.query?.scheduleId);
  const status = toCleanString(req.query?.status).toLowerCase();
  const search = toCleanString(req.query?.search).toLowerCase();

  const ownerBuses = await BusService.find({ ownerId: owner._id })
    .sort({ operatorName: 1, busName: 1 })
    .select("_id busName operatorName serviceNumber coachType busCategory status route schedules blueprint seatPrice variantPricing fareCurrency ownerDriverId driverName driverPhone")
    .lean();

  const allowedBusIds = ownerBuses.map((item) => item._id);
  const query = {
    busServiceId: { $in: allowedBusIds },
  };

  if (busServiceId) {
    query.busServiceId = busServiceId;
  }
  if (travelDate) {
    query.travelDate = normalizeBusTravelDate(travelDate);
  }
  if (scheduleId) {
    query.scheduleId = scheduleId;
  }
  if (status && status !== "all") {
    query.status = status;
  }

  const rawBookings = await BusBooking.find(query)
    .populate("userId", "name phone email")
    .populate("busServiceId", "busName operatorName serviceNumber coachType busCategory status route schedules blueprint")
    .sort({ travelDate: 1, createdAt: -1 })
    .lean();

  const bookings = rawBookings
    .filter((booking) => {
      if (!search) return true;
      const haystack = [
        booking.bookingCode,
        booking.passenger?.name,
        booking.passenger?.phone,
        booking.userId?.name,
        booking.userId?.phone,
        booking.userId?.email,
        booking.routeSnapshot?.busName,
        booking.routeSnapshot?.operatorName,
        booking.travelDate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    })
    .map(serializeOwnerBusBooking);

  const selectedBus =
    (busServiceId
      ? ownerBuses.find((item) => String(item._id) === String(busServiceId))
      : rawBookings[0]?.busServiceId) || null;
  const selectedSchedules = Array.isArray(selectedBus?.schedules) ? selectedBus.schedules : [];

  const filteredSeatBookings = bookings.filter(
    (item) =>
      (!busServiceId || item.busService?.id === String(busServiceId)) &&
      (!travelDate || item.travelDate === normalizeBusTravelDate(travelDate)) &&
      (!scheduleId || item.scheduleId === scheduleId) &&
      item.status !== "failed" &&
      item.status !== "expired" &&
      item.status !== "cancelled",
  );

  const seatBookingMap = new Map();
  filteredSeatBookings.forEach((booking) => {
    booking.activeSeats.forEach((seat) => {
      seatBookingMap.set(seat.seatId, {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        status: booking.status,
        passengerName: booking.passenger?.name || booking.user?.name || "",
        seatLabel: seat.seatLabel || seat.seatId,
      });
    });
  });

  const seatLayout = selectedBus
    ? flattenBusBlueprintSeats(selectedBus.blueprint).map((seat) => {
        const booked = seatBookingMap.get(String(seat.id || ""));
        return {
          seatId: seat.id || "",
          seatLabel: seat.label || seat.id || "",
          variant: seat.variant || "seat",
          price: resolveOwnerBusSeatPrice(selectedBus, seat),
          baseStatus: seat.status || "available",
          liveStatus: booked ? "booked" : seat.status === "blocked" ? "blocked" : "available",
          booking: booked || null,
        };
      })
    : [];

  const summary = bookings.reduce(
    (acc, booking) => {
      acc.totalBookings += 1;
      acc.totalAmount += Number(booking.amount || 0);
      acc.totalSeats += Number(booking.seatSummary?.active || 0);
      const bucketKey = `${booking.status || "pending"}Bookings`;
      if (Object.prototype.hasOwnProperty.call(acc, bucketKey)) {
        acc[bucketKey] += 1;
      }
      return acc;
    },
    {
      totalBookings: 0,
      totalAmount: 0,
      totalSeats: 0,
      confirmedBookings: 0,
      pendingBookings: 0,
      cancelledBookings: 0,
      failedBookings: 0,
      expiredBookings: 0,
    },
  );

  res.json({
    success: true,
    data: {
      filters: {
        busServiceId,
        travelDate: travelDate ? normalizeBusTravelDate(travelDate) : "",
        scheduleId,
        status: status || "all",
        search,
      },
      buses: ownerBuses.map((bus) => ({
        id: String(bus._id),
        busName: bus.busName || "",
        operatorName: bus.operatorName || "",
        serviceNumber: bus.serviceNumber || "",
        coachType: bus.coachType || "",
        busCategory: bus.busCategory || "",
        status: bus.status || "draft",
        route: bus.route || {},
        seatPrice: Number(bus.seatPrice || 0),
        variantPricing: bus.variantPricing || null,
        fareCurrency: bus.fareCurrency || "INR",
        schedules: Array.isArray(bus.schedules) ? bus.schedules : [],
      })),
      selectedBus: selectedBus
        ? {
            id: String(selectedBus._id),
            busName: selectedBus.busName || "",
            operatorName: selectedBus.operatorName || "",
            serviceNumber: selectedBus.serviceNumber || "",
            route: selectedBus.route || {},
            schedules: selectedSchedules,
          }
        : null,
      schedules: selectedSchedules,
      summary,
      seatLayout,
      bookings,
    },
  });
};

export const getOwnerBusBookingCalendar = async (req, res) => {
  const owner = await Owner.findById(req.auth.sub).lean();

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  const ownerBuses = await BusService.find({ ownerId: owner._id }).select("_id").lean();
  const allowedBusIds = ownerBuses.map((item) => item._id);
  const busServiceId = toCleanString(req.query?.busServiceId);
  const scheduleId = toCleanString(req.query?.scheduleId);
  const monthWindow = buildOwnerBusMonthWindow(req.query?.month);

  const query = {
    busServiceId: { $in: allowedBusIds },
    travelDate: {
      $gte: monthWindow.startDate,
      $lt: monthWindow.endDateExclusive,
    },
  };

  if (busServiceId) {
    query.busServiceId = busServiceId;
  }
  if (scheduleId) {
    query.scheduleId = scheduleId;
  }

  const items = await BusBooking.find(query)
    .select("travelDate status seatIds cancelledSeats amount scheduleId busServiceId")
    .sort({ travelDate: 1, createdAt: -1 })
    .lean();

  const calendarMap = new Map();
  items.forEach((item) => {
    const dateKey = item.travelDate || "";
    if (!dateKey) return;
    if (!calendarMap.has(dateKey)) {
      calendarMap.set(dateKey, {
        date: dateKey,
        totalBookings: 0,
        totalSeats: 0,
        totalAmount: 0,
        confirmedBookings: 0,
        pendingBookings: 0,
        cancelledBookings: 0,
        failedBookings: 0,
        expiredBookings: 0,
      });
    }

    const day = calendarMap.get(dateKey);
    const cancelledSeatIdSet = new Set(
      (Array.isArray(item.cancelledSeats) ? item.cancelledSeats : [])
        .map((seat) => toCleanString(seat?.seatId))
        .filter(Boolean),
    );
    const totalActiveSeats = (Array.isArray(item.seatIds) ? item.seatIds : []).filter(
      (seatId) => !cancelledSeatIdSet.has(toCleanString(seatId)),
    ).length;

    day.totalBookings += 1;
    day.totalSeats += totalActiveSeats;
    day.totalAmount += Number(item.amount || 0);
    const bucketKey = `${item.status || "pending"}Bookings`;
    if (Object.prototype.hasOwnProperty.call(day, bucketKey)) {
      day[bucketKey] += 1;
    }
  });

  res.json({
    success: true,
    data: {
      month: monthWindow.month,
      startDate: monthWindow.startDate,
      endDateExclusive: monthWindow.endDateExclusive,
      days: Array.from(calendarMap.values()),
    },
  });
};

export const cancelOwnerBusBookingSeats = async (req, res) => {
  const owner = await Owner.findById(req.auth.sub).lean();

  if (!owner) {
    throw new ApiError(404, "Owner not found");
  }

  const bookingId = toCleanString(req.params?.id);
  const selectedSeatIds = Array.isArray(req.body?.seatIds)
    ? [...new Set(req.body.seatIds.map((item) => toCleanString(item)).filter(Boolean))]
    : [];
  const ownerNote = toCleanString(req.body?.notes || req.body?.ownerNote || "Cancelled by owner panel");

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, "Valid booking id is required");
  }

  const booking = await BusBooking.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Bus booking not found");
  }

  const busService = await BusService.findOne({
    _id: booking.busServiceId,
    ownerId: owner._id,
  });
  if (!busService) {
    throw new ApiError(403, "This bus booking does not belong to your bus service");
  }

  if (String(booking.status || "") !== "confirmed") {
    throw new ApiError(409, "Only confirmed bus bookings can be cancelled");
  }

  const originalSeatIds = Array.isArray(booking.seatIds) ? booking.seatIds : [];
  const originalSeatLabels = Array.isArray(booking.seatLabels) ? booking.seatLabels : [];
  const cancelledSeats = Array.isArray(booking.cancelledSeats) ? booking.cancelledSeats : [];
  const cancelledSeatIds = new Set(
    cancelledSeats.map((item) => toCleanString(item?.seatId)).filter(Boolean),
  );
  const activeSeats = originalSeatIds
    .map((seatId, index) => ({
      seatId: toCleanString(seatId),
      seatLabel: originalSeatLabels[index] || seatId,
    }))
    .filter((item) => item.seatId && !cancelledSeatIds.has(item.seatId));
  const seatsToCancel = selectedSeatIds.length > 0
    ? activeSeats.filter((item) => selectedSeatIds.includes(item.seatId))
    : activeSeats;

  if (seatsToCancel.length === 0) {
    throw new ApiError(400, "Select at least one active seat to cancel");
  }
  if (selectedSeatIds.length > 0 && seatsToCancel.length !== selectedSeatIds.length) {
    throw new ApiError(409, "Some selected seats are already cancelled or not part of this booking");
  }

  const cancellationQuote = buildOwnerBusPartialCancellationQuote({
    booking,
    busService,
    seatIds: seatsToCancel.map((item) => item.seatId),
    travelDateOverride: req.body?.travelDate || req.body?.date,
  });
  if (!cancellationQuote.allowed) {
    throw new ApiError(409, cancellationQuote.reason || "This booking can no longer be cancelled");
  }

  const cancelledAt = new Date();
  let refundPayload = null;
  if (cancellationQuote.refundAmount > 0) {
    const paymentId = toCleanString(booking.payment?.paymentId);
    if (!paymentId) {
      throw new ApiError(409, "This booking cannot be refunded because the payment reference is missing");
    }

    const { keyId, keySecret } = await resolveOwnerRazorpayCredentials();
    refundPayload = await ownerRazorpayRequest({
      method: "POST",
      path: `/payments/${paymentId}/refund`,
      body: {
        amount: Math.round(cancellationQuote.refundAmount * 100),
        notes: {
          bookingId: String(booking._id),
          bookingCode: booking.bookingCode || "",
          cancelledSeats: seatsToCancel.map((item) => item.seatLabel || item.seatId).join(", "),
        },
      },
      keyId,
      keySecret,
    });
  }

  const perSeatRefundAmount = seatsToCancel.length > 0
    ? Math.round((cancellationQuote.refundAmount / seatsToCancel.length) * 100) / 100
    : 0;
  const perSeatChargeAmount = seatsToCancel.length > 0
    ? Math.round((cancellationQuote.chargeAmount / seatsToCancel.length) * 100) / 100
    : 0;

  booking.cancelledSeats = [
    ...cancelledSeats,
    ...seatsToCancel.map((item, index) => ({
      seatId: item.seatId,
      seatLabel: item.seatLabel,
      cancelledAt,
      refundAmount: index === seatsToCancel.length - 1
        ? Math.max(0, Math.round((cancellationQuote.refundAmount - (perSeatRefundAmount * (seatsToCancel.length - 1))) * 100) / 100)
        : perSeatRefundAmount,
      chargeAmount: index === seatsToCancel.length - 1
        ? Math.max(0, Math.round((cancellationQuote.chargeAmount - (perSeatChargeAmount * (seatsToCancel.length - 1))) * 100) / 100)
        : perSeatChargeAmount,
      refundStatus: refundPayload ? (refundPayload.status || "processed") : "not_applicable",
      refundId: refundPayload?.id || "",
      refundProcessedAt: refundPayload?.created_at ? new Date(Number(refundPayload.created_at) * 1000) : cancelledAt,
      notes: ownerNote || cancellationQuote.notes || "",
    })),
  ];

  const remainingActiveSeatCount = activeSeats.length - seatsToCancel.length;
  booking.status = remainingActiveSeatCount <= 0 ? "cancelled" : "confirmed";
  booking.cancelledAt = remainingActiveSeatCount <= 0 ? cancelledAt : null;
  booking.cancellation = {
    allowed: remainingActiveSeatCount > 0,
    appliedRuleId: cancellationQuote.appliedRuleId,
    appliedRuleLabel: cancellationQuote.appliedRuleLabel,
    refundType: cancellationQuote.refundType,
    refundValue: cancellationQuote.refundValue,
    hoursBeforeDeparture: cancellationQuote.hoursBeforeDeparture,
    refundAmount: cancellationQuote.refundAmount,
    chargeAmount: cancellationQuote.chargeAmount,
    notes: ownerNote || cancellationQuote.notes,
  };
  booking.payment.status = refundPayload
    ? (remainingActiveSeatCount <= 0 ? "refunded" : "partially_refunded")
    : (remainingActiveSeatCount <= 0 ? "cancelled" : booking.payment.status || "paid");
  if (!booking.notes?.includes(ownerNote)) {
    booking.notes = [booking.notes, ownerNote].filter(Boolean).join(" | ");
  }
  await booking.save();

  await BusSeatHold.deleteMany({
    bookingId: booking._id,
    status: { $in: ["held", "booked"] },
    seatId: { $in: seatsToCancel.map((item) => item.seatId) },
  });

  const hydratedBooking = await BusBooking.findById(booking._id)
    .populate("userId", "name phone email")
    .populate("busServiceId", "busName operatorName serviceNumber coachType busCategory status route schedules blueprint")
    .lean();

  res.json({
    success: true,
    data: serializeOwnerBusBooking(hydratedBooking),
    message:
      cancellationQuote.refundAmount > 0
        ? (remainingActiveSeatCount <= 0
          ? "Booking cancelled successfully and refund was initiated."
          : "Selected seats cancelled successfully and refund was initiated.")
        : (remainingActiveSeatCount <= 0
          ? "Booking cancelled successfully."
          : "Selected seats cancelled successfully."),
  });
};

export const updateOwnerFleetDriver = async (req, res) => {
  const owner = await resolveAuthenticatedOwner(req);

  if (!owner?._id) {
    throw new ApiError(
      403,
      "Fleet driver access is only available for owner accounts",
    );
  }

  const driverId = String(req.params?.driverId || "").trim();
  if (!driverId || !mongoose.isValidObjectId(driverId)) {
    throw new ApiError(400, "A valid driver id is required");
  }

  const driver = await Driver.findOne({
    _id: driverId,
    owner_id: owner._id,
    deletedAt: null,
  });

  if (!driver) {
    throw new ApiError(404, "Fleet driver not found");
  }

  const name = String(req.body?.name || "").trim();
  const phone = normalizePhone(req.body?.phone || req.body?.mobile);
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const salaryValue = Number(
    req.body?.salary ?? req.body?.monthly_salary ?? req.body?.monthlySalary ?? 0,
  );
  const city = String(req.body?.city || req.body?.address || "").trim();
  const requestedAssignedVehicleId = String(
    req.body?.assignedFleetVehicleId ??
      req.body?.assignedVehicleId ??
      req.body?.vehicleId ??
      "",
  ).trim();
  const requestedZoneId = String(
    req.body?.zoneId ??
      req.body?.zone_id ??
      req.body?.assignedZoneId ??
      "",
  ).trim();

  if (!name) {
    throw new ApiError(400, "name is required");
  }

  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, "A valid 10-digit mobile number is required");
  }

  if (!Number.isFinite(salaryValue) || salaryValue < 0) {
    throw new ApiError(400, "A valid non-negative salary is required");
  }

  const existing = await Driver.findOne({
    phone,
    _id: { $ne: driver._id },
  }).lean();
  if (existing) {
    throw new ApiError(409, "Phone number is already registered");
  }

  let assignedVehicle = null;
  let assignedZone = null;
  if (requestedAssignedVehicleId) {
    if (!mongoose.isValidObjectId(requestedAssignedVehicleId)) {
      throw new ApiError(400, "A valid assigned vehicle id is required");
    }

    assignedVehicle = await FleetVehicle.findOne({
      _id: requestedAssignedVehicleId,
      owner_id: owner._id,
      active: true,
    })
      .populate("vehicle_type_id", "name type_name transport_type icon_types")
      .lean();

    if (!assignedVehicle) {
      throw new ApiError(404, "Assigned vehicle not found for this owner");
    }

    const alreadyAssigned = await Driver.findOne({
      owner_id: owner._id,
      deletedAt: null,
      assignedFleetVehicleId: assignedVehicle._id,
      _id: { $ne: driver._id },
    })
      .select("name")
      .lean();

    if (alreadyAssigned) {
      throw new ApiError(
        409,
        `Vehicle is already assigned to ${alreadyAssigned.name || "another driver"}`,
      );
    }
  }

  if (requestedZoneId) {
    if (!mongoose.isValidObjectId(requestedZoneId)) {
      throw new ApiError(400, "A valid zone id is required");
    }

    const baseAssignedZoneQuery = {
      _id: requestedZoneId,
      active: { $ne: false },
      status: { $ne: "inactive" },
    };

    assignedZone = await Zone.findOne({
      ...baseAssignedZoneQuery,
      ...(owner.service_location_id
        ? { service_location_id: owner.service_location_id }
        : {}),
    })
      .select("_id name service_location_id")
      .lean();

    if (!assignedZone && owner.service_location_id) {
      assignedZone = await Zone.findOne(baseAssignedZoneQuery)
        .select("_id name service_location_id")
        .lean();
    }

    if (!assignedZone) {
      throw new ApiError(404, "Assigned zone not found for this owner");
    }
  }

  driver.name = name;
  driver.phone = phone;
  driver.email = email;
  driver.city = city || driver.city || "";
  driver.salary = salaryValue;
  driver.assignedFleetVehicleId = assignedVehicle?._id || null;
  driver.zoneId = assignedZone?._id || null;

  if (assignedVehicle) {
    driver.vehicleTypeId = assignedVehicle.vehicle_type_id?._id || null;
    driver.vehicleMake = assignedVehicle.car_brand || "";
    driver.vehicleModel = assignedVehicle.car_model || "";
    driver.vehicleNumber = assignedVehicle.license_plate_number || "";
    driver.vehicleColor = assignedVehicle.car_color || "";
    driver.vehicleIconType =
      assignedVehicle.vehicle_type_id?.icon_types || driver.vehicleIconType || "car";
  } else {
    driver.vehicleTypeId = null;
    driver.vehicleMake = "";
    driver.vehicleModel = "";
    driver.vehicleNumber = "";
    driver.vehicleColor = "";
  }

  await driver.save();

  res.json({
    success: true,
    message: "Fleet driver updated successfully",
    data: {
      id: String(driver._id),
      name: driver.name || "",
      phone: driver.phone || "",
      email: driver.email || "",
      city: driver.city || "",
      salary: Number(driver.salary || 0),
      assignedVehicle: assignedVehicle
        ? {
            vehicleId: String(assignedVehicle._id),
            name: [assignedVehicle.car_brand, assignedVehicle.car_model]
              .filter(Boolean)
              .join(" ")
              .trim(),
            number: assignedVehicle.license_plate_number || "",
            color: assignedVehicle.car_color || "",
            status: assignedVehicle.status || "pending",
          }
        : null,
      zone: assignedZone
        ? {
            zoneId: String(assignedZone._id),
            name: assignedZone.name || "",
            service_location_id: assignedZone.service_location_id
              ? String(assignedZone.service_location_id)
              : "",
          }
        : null,
      approve: driver.approve,
      status: driver.status,
      isOnline: Boolean(driver.isOnline),
      isOnRide: Boolean(driver.isOnRide),
      createdAt: driver.createdAt,
    },
  });
};

export const startDriverLoginOtpRequest = async (req, res) => {
  const result = await startDriverLoginOtp(req.body);
  res.status(201).json({ success: true, data: result });
};

export const verifyDriverLoginOtpRequest = async (req, res) => {
  const result = await verifyDriverLoginOtp(req.body);
  res.json({ success: true, data: result });
};

export const startPoolingOnboardingRequest = async (req, res) => {
  const result = await startPoolingDriverOnboarding(req.body);
  res.status(201).json({ success: true, data: result });
};

export const verifyPoolingOnboardingOtpRequest = async (req, res) => {
  const result = await verifyPoolingDriverOnboardingOtp(req.body);
  res.json({ success: true, data: result });
};

export const getPoolingOnboardingSessionRequest = async (req, res) => {
  const result = await getPoolingDriverOnboardingSession({
    registrationId: req.params.registrationId,
    phone: req.query.phone,
  });
  res.json({ success: true, data: result });
};

export const savePoolingOnboardingDetailsRequest = async (req, res) => {
  const result = await savePoolingDriverOnboardingDetails(req.body);
  res.json({ success: true, data: result });
};

export const completePoolingOnboardingRequest = async (req, res) => {
  const result = await completePoolingDriverOnboarding(req.body);
  res.status(201).json({ success: true, data: result });
};

export const uploadPoolingOnboardingImageRequest = async (req, res) => {
  const image = String(req.body?.image || "").trim();

  if (!image) {
    throw new ApiError(400, "Image data is required");
  }

  const result = await uploadDataUrlToCloudinary({
    dataUrl: image,
    publicIdPrefix: "pooling-driver-onboarding",
  });

  res.status(201).json({
    success: true,
    data: {
      url: result.secureUrl,
    },
  });
};

export const startOnboarding = async (req, res) => {
  const result = await startDriverOnboarding(req.body);
  res.status(201).json({ success: true, data: result });
};

export const verifyOnboardingOtp = async (req, res) => {
  const result = await verifyDriverOtp(req.body);
  res.json({ success: true, data: result });
};

export const saveOnboardingRole = async (req, res) => {
  const result = await setDriverOnboardingRole(req.body);
  res.json({ success: true, data: result });
};

export const getOnboardingSignupOptions = async (_req, res) => {
  const result = await getDriverOnboardingSignupOptions();
  res.json({ success: true, data: result });
};

export const saveOnboardingRoleDetails = async (req, res) => {
  const result = await saveDriverRoleDetails(req.body);
  res.json({ success: true, data: result });
};

export const saveOnboardingPersonal = async (req, res) => {
  const result = await saveDriverPersonalDetails(req.body);
  res.json({ success: true, data: result });
};

export const saveOnboardingReferral = async (req, res) => {
  const result = await saveDriverReferral(req.body);
  res.json({ success: true, data: result });
};

export const saveOnboardingVehicle = async (req, res) => {
  const result = await saveDriverVehicle(req.body);
  res.json({ success: true, data: result });
};

export const verifyOnboardingVehicleRc = async (req, res) => {
  const result = await verifyDriverVehicleRc(req.body);
  res.json({ success: true, data: result });
};

export const verifyOnboardingLicenseDocument = async (req, res) => {
  const result = await verifyDriverOnboardingLicenseDocument({
    ...req.body,
    documentKey: req.params.documentKey,
  });
  res.json({ success: true, data: result });
};

export const saveOnboardingDocuments = async (req, res) => {
  const result = await saveDriverDocuments(req.body);
  res.json({ success: true, data: result });
};

export const completeOnboarding = async (req, res) => {
  const result = await completeDriverOnboarding(req.body);
  res.status(201).json({ success: true, data: result });
};

export const getOnboardingSession = async (req, res) => {
  const result = await getDriverOnboardingSession({
    registrationId: req.params.registrationId,
    phone: req.query.phone,
  });
  res.json({ success: true, data: result });
};

export const goOffline = async (req, res) => {
  const existingDriver = await Driver.findById(req.auth.sub);

  if (!existingDriver) {
    throw new ApiError(404, "Driver not found");
  }

  const finalizedTracking = mergeOnlineSessionIntoTracking(
    existingDriver.incentiveTracking || {},
    existingDriver.incentiveTracking?.currentOnlineStartedAt,
    new Date(),
  );
  const finalizedTodaySummary = buildDriverTodaySummaryFromDocument(existingDriver);

  const driver = await Driver.findByIdAndUpdate(
    req.auth.sub,
    {
      isOnline: false,
      socketId: null,
      incentiveTracking: {
        ...finalizedTracking,
        currentOnlineStartedAt: null,
        claimedRewards: pruneClaimedRewards(finalizedTracking?.claimedRewards),
      },
      todaySummary: finalizedTodaySummary,
    },
    { returnDocument: 'after' },
  );

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  res.json({
    success: true,
    data: driver,
  });
};

export const getDriverIncentives = async (req, res) => {
  const driver = await Driver.findById(req.auth.sub).lean();

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const liveDriver = {
    ...driver,
    incentiveTracking: {
      ...(driver.incentiveTracking || {}),
      ...mergeOnlineSessionIntoTracking(
        driver.incentiveTracking || {},
        driver.incentiveTracking?.currentOnlineStartedAt,
        new Date(),
      ),
    },
  };

  const settingsDoc = await AdminBusinessSetting.findOne({ scope: "default" }).lean();
  const driverSettings = settingsDoc?.referral?.driver || {};
  const rides = await Ride.find({ driverId: driver._id }).select("status liveStatus createdAt updatedAt completedAt").lean();

  const snapshot = buildDriverIncentiveSnapshot({
    driver: liveDriver,
    settings: driverSettings,
    rides,
  });

  res.json({
    success: true,
    data: snapshot,
  });
};

export const claimDriverIncentiveReward = async (req, res) => {
  const { rewardType, rewardKey } = req.body || {};
  const normalizedRewardType = String(rewardType || "").trim().toLowerCase();
  const normalizedRewardKey = String(rewardKey || "").trim();

  if (!["milestone", "feature"].includes(normalizedRewardType) || !normalizedRewardKey) {
    throw new ApiError(400, "Valid reward type and reward key are required");
  }

  const driver = await Driver.findById(req.auth.sub);

  if (!driver) {
    throw new ApiError(404, "Driver not found");
  }

  const settingsDoc = await AdminBusinessSetting.findOne({ scope: "default" }).lean();
  const driverSettings = settingsDoc?.referral?.driver || {};
  const rides = await Ride.find({ driverId: driver._id }).select("status liveStatus createdAt updatedAt completedAt").lean();
  const liveDriver = {
    ...driver.toObject(),
    incentiveTracking: {
      ...(driver.incentiveTracking || {}),
      ...mergeOnlineSessionIntoTracking(
        driver.incentiveTracking || {},
        driver.incentiveTracking?.currentOnlineStartedAt,
        new Date(),
      ),
    },
  };
  const snapshot = buildDriverIncentiveSnapshot({
    driver: liveDriver,
    settings: driverSettings,
    rides,
  });

  const targetReward =
    normalizedRewardType === "milestone"
      ? snapshot.milestones.find((item) => String(item.id) === normalizedRewardKey)
      : snapshot.features.find((item) => String(item.key) === normalizedRewardKey);

  if (!targetReward) {
    throw new ApiError(404, "Reward not found");
  }

  if (!targetReward.isEligible) {
    throw new ApiError(400, "Reward is not eligible yet");
  }

  if (targetReward.isClaimed) {
    throw new ApiError(400, "Reward already claimed");
  }

  const claimedRewards = pruneClaimedRewards([
    ...(Array.isArray(driver.incentiveTracking?.claimedRewards) ? driver.incentiveTracking.claimedRewards : []),
    {
      rewardType: normalizedRewardType,
      rewardKey: normalizedRewardType === "milestone" ? String(targetReward.id) : String(targetReward.key),
      periodKey: targetReward.periodKey,
      amount: Number(targetReward.payout_amount ?? targetReward.reward_amount ?? 0),
      claimedAt: new Date(),
      metadata: {
        label: targetReward.name || targetReward.label || "",
        targetValue: targetReward.targetValue ?? targetReward.progress?.targetWeeks ?? 0,
      },
    },
  ]);

  driver.incentiveTracking = {
    ...(liveDriver.incentiveTracking || {}),
    dailyActivity: pruneDailyActivity(liveDriver.incentiveTracking?.dailyActivity),
    claimedRewards,
  };
  await driver.save();

  const rewardAmount = Number(targetReward.payout_amount ?? targetReward.reward_amount ?? 0);

  const walletResult = await applyDriverWalletAdjustment({
    driverId: driver._id,
    amount: rewardAmount,
    type: "adjustment",
    description: `Incentive reward credited for ${targetReward.name || targetReward.label || "milestone"}`,
    metadata: {
      category: "driver_incentive",
      rewardType: normalizedRewardType,
      rewardKey: normalizedRewardType === "milestone" ? String(targetReward.id) : String(targetReward.key),
      periodKey: targetReward.periodKey,
    },
  });

  res.json({
    success: true,
    data: {
      wallet: walletResult.wallet,
      transaction: walletResult.transaction,
      claimedReward: {
        rewardType: normalizedRewardType,
        rewardKey: normalizedRewardKey,
        amount: rewardAmount,
        periodKey: targetReward.periodKey,
      },
    },
  });
};
