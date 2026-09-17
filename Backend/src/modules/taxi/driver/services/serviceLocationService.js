import { listServiceLocations as listAdminServiceLocations } from '../../admin/services/adminService.js';

const isActiveLocation = (location) => location?.active !== false && String(location?.status || 'active').toLowerCase() === 'active';

export const listDriverServiceLocations = async () => {
  const locations = await listAdminServiceLocations();

  return locations
    .filter(isActiveLocation)
    .map((location) => ({
      _id: location._id,
      id: location._id,
      name: location.service_location_name || location.name,
      service_location_name: location.service_location_name || location.name,
      address: location.address || '',
      country: location.country || '',
      currency_name: location.currency_name || '',
      currency_symbol: location.currency_symbol || '',
      currency_code: location.currency_code || '',
      timezone: location.timezone || '',
      unit: location.unit || 'km',
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      location: location.location || null,
      active: true,
      status: location.status || 'active',
    }));
};
