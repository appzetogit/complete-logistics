import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../shared/api/axiosInstance';
import { getLocalUserToken } from '../../modules/user/services/authService';
import userBusService from '../../modules/user/services/busService';
import { userService } from '../../modules/user/services/userService';
import { syncUpcomingRideReminders } from '../../modules/user/utils/upcomingRideReminderService';

const getResponsePayload = (response) =>
  response?.data?.data || response?.data || response || {};

const USER_REMINDER_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const USER_REMINDER_SYNC_COOLDOWN_MS = 60 * 1000;

const UserUpcomingRideReminderBootstrap = () => {
  const location = useLocation();
  const isUserReminderRoute =
    location.pathname.startsWith('/taxi/user') ||
    location.pathname === '/user' ||
    location.pathname.startsWith('/ride') ||
    location.pathname.startsWith('/pooling') ||
    location.pathname.startsWith('/bus');

  useEffect(() => {
    if (!isUserReminderRoute || !getLocalUserToken()) {
      return undefined;
    }

    let cancelled = false;
    let syncInFlight = false;
    let lastSyncAt = 0;

    const syncReminders = async (reason = 'timer') => {
      if (cancelled || syncInFlight) {
        return;
      }

      const now = Date.now();
      if (reason !== 'mount' && now - lastSyncAt < USER_REMINDER_SYNC_COOLDOWN_MS) {
        return;
      }

      syncInFlight = true;
      lastSyncAt = now;

      try {
        const [busSettled, poolingSettled, scheduledRideSettled] = await Promise.allSettled([
          userBusService.getMyBookings({ page: 1, limit: 20, tripState: 'upcoming' }),
          userService.getMyPoolingBookings(),
          api.get('/rides', {
            params: {
              page: 1,
              limit: 20,
              category: 'scheduled',
            },
          }),
        ]);

        if (cancelled) {
          return;
        }

        const busPayload = busSettled.status === 'fulfilled' ? getResponsePayload(busSettled.value) : {};
        const poolingPayload = poolingSettled.status === 'fulfilled' ? getResponsePayload(poolingSettled.value) : {};
        const scheduledRidePayload = scheduledRideSettled.status === 'fulfilled' ? getResponsePayload(scheduledRideSettled.value) : {};

        const rawPoolingBookings = Array.isArray(poolingPayload)
          ? poolingPayload
          : Array.isArray(poolingPayload?.results)
            ? poolingPayload.results
            : [];
        const routeIds = [
          ...new Set(
            rawPoolingBookings
              .map((booking) => String(booking?.route?._id || ''))
              .filter(Boolean),
          ),
        ];
        const routeDetailsEntries = await Promise.all(
          routeIds.map(async (routeId) => {
            try {
              const routeResponse = await userService.getPoolingRouteDetails(routeId);
              return [routeId, getResponsePayload(routeResponse)];
            } catch {
              return [routeId, null];
            }
          }),
        );

        if (cancelled) {
          return;
        }

        const routeDetailsMap = new Map(routeDetailsEntries);
        const poolingBookings = rawPoolingBookings.map((booking) => {
          const routeId = String(booking?.route?._id || '');
          const routeDetails = routeDetailsMap.get(routeId);

          return routeDetails
            ? {
                ...booking,
                route: {
                  ...(booking.route || {}),
                  ...routeDetails,
                },
              }
            : booking;
        });

        syncUpcomingRideReminders({
          busBookings: Array.isArray(busPayload?.results) ? busPayload.results : [],
          poolingBookings,
          scheduledRides: Array.isArray(scheduledRidePayload?.results)
            ? scheduledRidePayload.results
            : [],
        });
      } catch {
        // Reminder sync is non-blocking.
      } finally {
        syncInFlight = false;
      }
    };

    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        syncReminders('visibility');
      }
    };

    const handleFocusSync = () => {
      syncReminders('focus');
    };

    syncReminders('mount');
    const intervalId = window.setInterval(
      () => syncReminders('timer'),
      USER_REMINDER_SYNC_INTERVAL_MS,
    );
    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleVisibilitySync);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
    };
  }, [isUserReminderRoute]);

  return null;
};

export default UserUpcomingRideReminderBootstrap;
