/**
 * The coarse vehicle class a driver is stored with (`vehicleType`: bike | auto | car), worked out from the catalog
 * vehicle's icon type or name. The rider app draws the live car / bike on the map from it, so a two-wheeler must
 * say 'bike': a "scooty" used to fall through to 'car' and riders saw a car for a scooter.
 */
export const genericVehicleTypeOf = (value = '') => {
  const text = String(value || '').trim().toLowerCase();
  if (/bike|scoot|moped|motorcycle|activa/.test(text)) return 'bike';
  if (text.includes('auto')) return 'auto';
  return 'car';
};
