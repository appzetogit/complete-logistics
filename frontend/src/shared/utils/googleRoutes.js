const isFiniteCoordinate = (value) => Number.isFinite(Number(value));

const normalizePoint = (point) => {
  if (!point) return null;

  if (typeof point.lat === 'function' && typeof point.lng === 'function') {
    const lat = Number(point.lat());
    const lng = Number(point.lng());
    return isFiniteCoordinate(lat) && isFiniteCoordinate(lng) ? { lat, lng } : null;
  }

  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return isFiniteCoordinate(lat) && isFiniteCoordinate(lng) ? { lat, lng } : null;
};

const normalizeIntermediate = (waypoint) => {
  if (!waypoint) return null;
  if (typeof waypoint === 'string') {
    const location = waypoint.trim();
    return location ? { location } : null;
  }
  if (typeof waypoint === 'object' && waypoint.location) {
    return waypoint;
  }

  const location = normalizePoint(waypoint);
  return location ? { location } : null;
};

const parseDurationSeconds = (value) => {
  if (Number.isFinite(Number(value))) {
    return Number(value);
  }

  const match = /^([\d.]+)s$/i.exec(String(value || '').trim());
  return match ? Number(match[1]) : 0;
};

export const sumComputedRouteLegs = (legs = []) =>
  (Array.isArray(legs) ? legs : []).reduce(
    (totals, leg) => ({
      distanceMeters: totals.distanceMeters + Number(leg?.distanceMeters || 0),
      durationSeconds: totals.durationSeconds + parseDurationSeconds(leg?.duration),
    }),
    { distanceMeters: 0, durationSeconds: 0 },
  );

export const computeDrivingRoute = async ({
  origin,
  destination,
  intermediates = [],
  region,
  computeAlternativeRoutes = false,
} = {}) => {
  if (!window.google?.maps) {
    return { status: 'LIBRARY_UNAVAILABLE', path: [], legs: [], route: null };
  }

  // 1. Try modern Routes API
  if (window.google.maps.importLibrary) {
    try {
      const { Route } = await window.google.maps.importLibrary('routes');
      const request = {
        origin,
        destination,
        travelMode: 'DRIVING',
        computeAlternativeRoutes,
        fields: ['path', 'legs'],
      };

      const normalizedIntermediates = (Array.isArray(intermediates) ? intermediates : [])
        .map(normalizeIntermediate)
        .filter(Boolean);
      if (normalizedIntermediates.length) {
        request.intermediates = normalizedIntermediates;
      }

      if (region) {
        request.region = String(region).trim().toLowerCase();
      }

      const result = await Route.computeRoutes(request);
      const route = result?.routes?.[0] || null;
      const path = (Array.isArray(route?.path) ? route.path : [])
        .map(normalizePoint)
        .filter(Boolean);

      if (route && path.length > 0) {
        return {
          status: 'OK',
          path,
          legs: Array.isArray(route?.legs) ? route.legs : [],
          route,
        };
      }
    } catch (routesApiError) {
      console.warn('Google Routes API failed, falling back to DirectionsService:', routesApiError);
    }
  }

  // 2. Fallback to classic DirectionsService (always available on Google Maps API Keys)
  try {
    const directionsService = new window.google.maps.DirectionsService();
    
    const waypoints = (Array.isArray(intermediates) ? intermediates : [])
      .map(normalizeIntermediate)
      .filter(Boolean)
      .map(wp => ({
        location: wp.location ? new window.google.maps.LatLng(wp.location.lat, wp.location.lng) : wp.location,
        stopover: true
      }));

    const request = {
      origin: new window.google.maps.LatLng(origin.lat, origin.lng),
      destination: new window.google.maps.LatLng(destination.lat, destination.lng),
      travelMode: window.google.maps.TravelMode.DRIVING,
      waypoints,
    };

    if (region) {
      request.region = String(region).trim().toLowerCase();
    }

    return new Promise((resolve) => {
      directionsService.route(request, (response, status) => {
        if (status === 'OK' && response?.routes?.[0]) {
          const route = response.routes[0];
          
          const path = (route.overview_path || []).map(p => ({
            lat: p.lat(),
            lng: p.lng()
          }));

          const legs = (route.legs || []).map(leg => ({
            distanceMeters: leg.distance?.value || 0,
            duration: `${leg.duration?.value || 0}s`,
          }));

          resolve({
            status: 'OK',
            path,
            legs,
            route,
          });
        } else {
          resolve({
            status: status || 'DIRECTIONS_FAILED',
            path: [],
            legs: [],
            route: null,
          });
        }
      });
    });
  } catch (directionsError) {
    console.error('DirectionsService fallback failed:', directionsError);
    return {
      status: 'ROUTE_COMPUTE_FAILED',
      path: [],
      legs: [],
      route: null,
    };
  }
};
