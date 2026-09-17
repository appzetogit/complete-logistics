/**
 * serviceConfigStore.js
 * 
 * Shared in-memory store that simulates admin-controlled service configuration.
 * In production this would be fetched from the backend API.
 * Admin edits in ServiceConfig.jsx write to this store; StepVehicle.jsx reads from it.
 */

export const SERVICE_CONFIG = {
  /** Active service types captains can register for */
  services: [
    { id: 'taxi',     label: 'Taxi',     icon: 'taxi_icon', description: 'City cab & bike rides',  active: true },
    { id: 'delivery', label: 'Delivery', icon: 'delivery_icon', description: 'Parcel & courier drops',  active: true },
  ],

  /**
   * Locations where the service is available.
   * Each location contains vehicle types that are active for that city.
   * A vehicle type is only shown to a captain if:
   *   - the location is active
   *   - the vehicle is active
   *   - the vehicle.services array includes the captain's chosen service
   */
  locations: [
    {
      id: 'indore',
      city: 'Indore',
      state: 'Madhya Pradesh',
      active: true,
      vehicleTypes: [
        { id: 'bike',  label: 'Bike',  icon: 'bike_icon', services: ['taxi', 'delivery'], active: true },
        { id: 'auto',  label: 'Auto',  icon: 'auto_icon', services: ['taxi'],             active: true },
        { id: 'cab',   label: 'Cab',   icon: 'cab_icon', services: ['taxi'],             active: true },
      ],
    },
    {
      id: 'bhopal',
      city: 'Bhopal',
      state: 'Madhya Pradesh',
      active: true,
      vehicleTypes: [
        { id: 'bike',  label: 'Bike',  icon: 'bike_icon', services: ['taxi', 'delivery'], active: true },
        { id: 'auto',  label: 'Auto',  icon: 'auto_icon', services: ['taxi'],             active: true },
      ],
    },
    {
      id: 'ujjain',
      city: 'Ujjain',
      state: 'Madhya Pradesh',
      active: true,
      vehicleTypes: [
        { id: 'bike',  label: 'Bike',  icon: 'bike_icon', services: ['taxi', 'delivery'], active: true },
      ],
    },
    {
      id: 'gwalior',
      city: 'Gwalior',
      state: 'Madhya Pradesh',
      active: true,
      vehicleTypes: [
        { id: 'bike',  label: 'Bike',  icon: 'bike_icon', services: ['taxi', 'delivery'], active: true },
        { id: 'cab',   label: 'Cab',   icon: 'cab_icon', services: ['taxi'],             active: true },
      ],
    },
  ],
};

/**
 * Helper: returns active locations only
 */
export const getActiveLocations = () =>
  SERVICE_CONFIG.locations.filter(l => l.active);

/**
 * Helper: given a location id and chosen service id,
 * returns only the active vehicle types that support that service.
 */
export const getVehicleTypesForLocation = (locationId, serviceId) => {
  const loc = SERVICE_CONFIG.locations.find(l => l.id === locationId);
  if (!loc) return [];
  return loc.vehicleTypes.filter(
    v => v.active && (serviceId === 'both' || v.services.includes(serviceId))
  );
};

/**
 * Helper: returns active service types captains can choose from
 */
export const getActiveServices = () =>
  SERVICE_CONFIG.services.filter(s => s.active);
