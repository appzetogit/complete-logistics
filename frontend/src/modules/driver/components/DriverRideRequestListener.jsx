import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import IncomingRideRequest from '../pages/IncomingRideRequest';
import api from '../../../shared/api/axiosInstance';
import { socketService } from '../../../shared/api/socket';
import { getLocalDriverToken } from '../services/registrationService';
import {
    playRideRequestAlertSound,
    stopRideRequestAlertSound,
    unlockRideRequestAlertSound,
} from '../utils/rideRequestAlertSound';

const ignoredRoutes = new Set([
    '/taxi/driver/home',
    '/taxi/driver/dashboard',
    '/taxi/driver/active-trip',
    '/taxi/driver/lang-select',
    '/taxi/driver/welcome',
    '/taxi/driver/login',
    '/taxi/driver/reg-phone',
    '/taxi/driver/otp-verify',
    '/taxi/driver/step-personal',
    '/taxi/driver/step-referral',
    '/taxi/driver/step-vehicle',
    '/taxi/driver/step-documents',
    '/taxi/driver/registration-status',
    '/taxi/driver/status',
]);

const isIgnoredRoute = (pathname = '') =>
    ignoredRoutes.has(pathname) ||
    pathname.startsWith('/taxi/driver/role-signup/bus-builder');

const DEFAULT_MAP_COORDS = [75.8577, 22.7196];

const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;

const withDriverAuthorization = (token) => (
    token
        ? {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
        : {}
);

const formatPoint = (point, fallback) => {
    const [lng, lat] = point?.coordinates || [];

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
    }

  return fallback;
};

const isScheduledRideForFuture = (value) => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
};

const normalizeJobType = (job = {}) => {
    const value = String(job.type || job.serviceType || 'ride').toLowerCase();
    if (value === 'parcel') return 'parcel';
    if (value === 'intercity') return 'intercity';
    return 'ride';
};

const getJobTitle = (type) => {
    if (type === 'parcel') return 'Delivery';
    if (type === 'intercity') return 'Intercity Ride';
    return 'Taxi Ride';
};

const getPointCoordinates = (point) => {
    const [lng, lat] = point?.coordinates || [];

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return {
            lat: Number(lat),
            lng: Number(lng),
        };
    }

    return null;
};

const calculateDistanceMeters = (startPoint, endPoint) => {
    const start = getPointCoordinates(startPoint);
    const end = getPointCoordinates(endPoint);

    if (!start || !end) {
        return 0;
    }

    const earthRadiusMeters = 6371000;
    const toRadians = (value) => (value * Math.PI) / 180;
    const deltaLat = toRadians(end.lat - start.lat);
    const deltaLng = toRadians(end.lng - start.lng);
    const startLat = toRadians(start.lat);
    const endLat = toRadians(end.lat);
    const haversine =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
    const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

    return earthRadiusMeters * arc;
};

const formatTripDistance = (job = {}) => {
    const estimatedMeters = Number(
        job.estimatedDistanceMeters ||
        job.raw?.estimatedDistanceMeters ||
        calculateDistanceMeters(
            job.pickupLocation || job.raw?.pickupLocation,
            job.dropLocation || job.raw?.dropLocation,
        ) ||
        0,
    );

    if (Number.isFinite(estimatedMeters) && estimatedMeters > 0) {
        return estimatedMeters < 1000
            ? `${Math.max(50, Math.round(estimatedMeters / 10) * 10)} m`
            : `${(estimatedMeters / 1000).toFixed(estimatedMeters >= 10000 ? 0 : 1)} km`;
    }

    if (job.intercity?.distance) return `${job.intercity.distance} km`;
    if (job.raw?.intercity?.distance) return `${job.raw.intercity.distance} km`;
    if (job.radius) return `within ${(Number(job.radius) / 1000).toFixed(1)} km`;
    if (job.raw?.radius) return `within ${(Number(job.raw.radius) / 1000).toFixed(1)} km`;

    return 'nearby';
};

const getCurrentCoords = () => new Promise((resolve) => {
    if (!navigator.geolocation) {
        resolve(DEFAULT_MAP_COORDS);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
        () => resolve(DEFAULT_MAP_COORDS),
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 10000 },
    );
});

const DriverRideRequestListener = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [currentRequest, setCurrentRequest] = useState(null);
    const [acceptingRideId, setAcceptingRideId] = useState('');
    const acceptingRideIdRef = useRef('');
    const requestRef = useRef(null);
    const activeOnRoute = !isIgnoredRoute(location.pathname);

    useEffect(() => {
        const unlock = () => unlockRideRequestAlertSound();

        window.addEventListener('pointerdown', unlock, { passive: true });
        window.addEventListener('keydown', unlock);

        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, []);

    useEffect(() => {
        requestRef.current = currentRequest;
    }, [currentRequest]);

    const fetchActiveJob = useCallback(async (type = 'ride') => {
        const normalizedType = String(type || 'ride').toLowerCase();
        const endpoint = normalizedType === 'parcel' ? '/deliveries/active/me' : '/rides/active/me';
        const driverToken = getLocalDriverToken();
        const response = await api.get(endpoint, {
            ...withDriverAuthorization(driverToken),
            params: { t: Date.now(), type: normalizedType },
        });
        return unwrapApiPayload(response);
    }, []);

    useEffect(() => {
        if (!activeOnRoute) {
            stopRideRequestAlertSound();
            setCurrentRequest(null);
            acceptingRideIdRef.current = '';
            setAcceptingRideId('');
            return undefined;
        }

        const socket = socketService.connect({ role: 'driver' });

        if (!socket) {
            return undefined;
        }

        const onRideRequest = (data) => {
            const requestType = normalizeJobType(data);
            const request = {
                type: requestType,
                title: getJobTitle(requestType),
                fare: `Rs ${data.fare || 0}`,
                payment: data.paymentMethod || 'Cash',
                pickup: data.pickupAddress || formatPoint(data.pickupLocation, 'Pickup Location'),
                drop: data.dropAddress || formatPoint(data.dropLocation, 'Drop Location'),
                distance: formatTripDistance(data),
                requestId: data.rideId,
                rideId: data.rideId,
                attempt: data.attempt,
                maxAttempts: data.maxAttempts,
                acceptRejectDurationSeconds: data.acceptRejectDurationSeconds || data.expiresInSeconds,
                requestExpiresAt: data.requestExpiresAt || null,
                customer: data.user || null,
                bookingMode: data.bookingMode || 'normal',
                bidding: data.bidding || { enabled: false },
                raw: data,
            };

            setCurrentRequest(request);
            playRideRequestAlertSound();
        };

        const onRideRequestClosed = ({ rideId }) => {
            if (acceptingRideIdRef.current && acceptingRideIdRef.current === rideId) return;

            const activeRequest = requestRef.current;
            if (!activeRequest?.rideId || activeRequest.rideId === rideId) {
                stopRideRequestAlertSound();
                setCurrentRequest(null);
            }
        };

        const onSocketError = ({ message } = {}) => {
            if (String(message || '').toLowerCase().includes('no longer available')) {
                stopRideRequestAlertSound();
                setCurrentRequest(null);
            }
            acceptingRideIdRef.current = '';
            setAcceptingRideId('');
        };

        const onRideBidSubmitted = ({ rideId }) => {
            if (!rideId || rideId !== acceptingRideIdRef.current) return;
            setAcceptingRideId('');
        };

        const onRideBiddingUpdated = (payload = {}) => {
            if (!payload?.rideId) return;

            setCurrentRequest((current) => {
                if (!current?.rideId || current.rideId !== payload.rideId) {
                    return current;
                }

                const pricingNegotiationMode = payload.pricingNegotiationMode || current.raw?.pricingNegotiationMode || 'none';
                const isDriverBidMode = pricingNegotiationMode === 'driver_bid';

                return {
                    ...current,
                    fare: `Rs ${payload.fare || current.raw?.fare || 0}`,
                    bookingMode: payload.bookingMode || current.bookingMode || 'normal',
                    raw: {
                        ...(current.raw || {}),
                        fare: payload.fare || current.raw?.fare || 0,
                        bookingMode: payload.bookingMode || current.raw?.bookingMode || 'bidding',
                        pricingNegotiationMode,
                        fareIncreaseWaitMinutes: payload.fareIncreaseWaitMinutes || current.raw?.fareIncreaseWaitMinutes || 0,
                        nextFareIncreaseAt: payload.nextFareIncreaseAt || current.raw?.nextFareIncreaseAt || null,
                        bidding: {
                            ...(current.raw?.bidding || {}),
                            enabled: isDriverBidMode,
                            baseFare: payload.baseFare || current.raw?.bidding?.baseFare || current.raw?.baseFare || current.raw?.fare || 0,
                            userMaxBidFare: payload.userMaxBidFare || payload.fare || current.raw?.bidding?.userMaxBidFare || current.raw?.userMaxBidFare || 0,
                            bidStepAmount: payload.bidStepAmount || current.raw?.bidding?.bidStepAmount || 10,
                        },
                    },
                };
            });
        };

        const openAcceptedRide = async (payload) => {
            if (!payload?.rideId || payload.rideId !== acceptingRideIdRef.current) return;

            stopRideRequestAlertSound();
            const activeRequest = requestRef.current;
            const nextType = activeRequest?.type || 'ride';
            const scheduledAt = activeRequest?.raw?.scheduledAt || payload?.scheduledAt || null;
            let currentJob = null;
            let currentDriverCoords = null;

            try {
                [currentJob, currentDriverCoords] = await Promise.all([
                    fetchActiveJob(nextType).catch(() => null),
                    getCurrentCoords(),
                ]);
            } catch {
                currentJob = null;
            }

            setCurrentRequest(null);
            acceptingRideIdRef.current = '';
            setAcceptingRideId('');
            if (isScheduledRideForFuture(scheduledAt)) {
              return;
            }
            navigate('/taxi/driver/active-trip', {
                state: {
                    type: nextType,
                    rideId: currentJob?.rideId || payload.rideId,
                    otp: currentJob?.otp || payload?.otp || activeRequest?.raw?.otp || '',
                    request: {
                        ...activeRequest,
                        rideId: currentJob?.rideId || payload.rideId,
                        otp: currentJob?.otp || payload?.otp || activeRequest?.raw?.otp || '',
                        raw: currentJob || {
                            ...(activeRequest?.raw || {}),
                            otp: payload?.otp || activeRequest?.raw?.otp || '',
                            status: payload.status,
                            liveStatus: payload.liveStatus,
                            acceptedAt: payload.acceptedAt,
                        },
                    },
                    currentDriverCoords,
                },
            });
        };

        socketService.on('rideRequest', onRideRequest);
        socketService.on('rideRequestClosed', onRideRequestClosed);
        socketService.on('errorMessage', onSocketError);
        socketService.on('rideAccepted', openAcceptedRide);
        socketService.on('rideBidSubmitted', onRideBidSubmitted);
        socketService.on('rideBiddingUpdated', onRideBiddingUpdated);

        return () => {
            socketService.off('rideRequest', onRideRequest);
            socketService.off('rideRequestClosed', onRideRequestClosed);
            socketService.off('errorMessage', onSocketError);
            socketService.off('rideAccepted', openAcceptedRide);
            socketService.off('rideBidSubmitted', onRideBidSubmitted);
            socketService.off('rideBiddingUpdated', onRideBiddingUpdated);
        };
    }, [activeOnRoute, fetchActiveJob, navigate]);

    const handleAccept = useCallback(() => {
        if (!currentRequest?.rideId || acceptingRideId) return;

        acceptingRideIdRef.current = currentRequest.rideId;
        setAcceptingRideId(currentRequest.rideId);
        stopRideRequestAlertSound();
        socketService.emit('acceptRide', { rideId: currentRequest.rideId });
    }, [acceptingRideId, currentRequest]);

    const handleDecline = useCallback(() => {
        if (currentRequest?.rideId) {
            socketService.emit('rejectRide', { rideId: currentRequest.rideId });
        }
        stopRideRequestAlertSound();
        setCurrentRequest(null);
    }, [currentRequest]);

    const handleSubmitBid = useCallback((bidFare) => {
        if (!currentRequest?.rideId || acceptingRideId || currentRequest?.raw?.pricingNegotiationMode !== 'driver_bid') return;

        acceptingRideIdRef.current = currentRequest.rideId;
        setAcceptingRideId(currentRequest.rideId);
        stopRideRequestAlertSound();
        socketService.emit('submitRideBid', { rideId: currentRequest.rideId, bidFare });
    }, [acceptingRideId, currentRequest]);

    return (
        <IncomingRideRequest
            visible={activeOnRoute && Boolean(currentRequest)}
            requestData={currentRequest}
            isAccepting={Boolean(acceptingRideId)}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onSubmitBid={handleSubmitBid}
        />
    );
};

export default DriverRideRequestListener;
