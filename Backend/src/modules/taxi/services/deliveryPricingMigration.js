import { buildPricingFromVehicle } from './deliveryPricingService.js';

// Pure planning for scripts/migrateDeliveryPricingToSetPrice.js: which goods
// vehicles still carry their prices on the vehicle type and need a delivery
// Set Price row. Nothing here touches the database.

const isDeliveryVehicle = (vehicle) =>
  ['delivery', 'both'].includes(String(vehicle?.transport_type || '').trim().toLowerCase());

const isGlobalRow = (row) => !row.zone_id && !row.service_location_id;
const isActiveRow = (row) => Number(row.active ?? 1) === 1 && String(row.status || 'active') === 'active';
const sameId = (left, right) => String(left) === String(right);

/**
 * `vehicles` and `setPrices` are plain (lean) documents.
 * Returns one plan item per goods vehicle that has legacy pricing:
 *   { vehicleId, name, action: 'create' | 'skip', reason, row? }
 */
export const planDeliveryPricingMigration = ({ vehicles = [], setPrices = [] }) => {
  const plan = [];

  for (const vehicle of vehicles.filter(isDeliveryVehicle)) {
    const legacy = buildPricingFromVehicle(vehicle);
    const entry = { vehicleId: String(vehicle._id), name: vehicle.name || '' };

    if (!legacy.enabled) {
      plan.push({ ...entry, action: 'skip', reason: 'vehicle has no legacy delivery pricing' });
      continue;
    }

    const rowsForVehicle = setPrices.filter(
      (row) => sameId(row.vehicle_type, vehicle._id) && row.pricing_scope !== 'package' && isActiveRow(row),
    );

    if (rowsForVehicle.some((row) => row.transport_type === 'delivery' && isGlobalRow(row))) {
      plan.push({ ...entry, action: 'skip', reason: 'already has an All Zones delivery Set Price' });
      continue;
    }

    // Goods bookings already take payment methods, commissions and cancellation
    // fees from a shared 'both' rule when there is one. Clone those so the new
    // delivery row (which wins from now on) changes the fare and nothing else.
    const template = rowsForVehicle.find((row) => row.transport_type === 'both' && isGlobalRow(row)) || null;

    plan.push({
      ...entry,
      action: 'create',
      reason: template
        ? "fare from the vehicle type; payment/commission/cancellation copied from its 'both' Set Price"
        : 'fare and commission from the vehicle type',
      row: {
        vehicle_type: vehicle._id,
        transport_type: 'delivery',
        pricing_scope: 'ride',
        zone_id: null,
        service_location_id: null,
        active: 1,
        status: 'active',
        payment_type: template?.payment_type?.length ? template.payment_type : ['cash', 'online'],
        admin_commission_type_from_driver: Number(
          template?.admin_commission_type_from_driver ?? vehicle.admin_commission_type_from_driver ?? 1,
        ),
        admin_commission_from_driver: Number(
          template?.admin_commission_from_driver ?? vehicle.admin_commission_from_driver ?? 0,
        ),
        admin_commission_type_for_owner: Number(
          template?.admin_commission_type_for_owner ?? vehicle.admin_commission_type_for_owner ?? 1,
        ),
        admin_commission_for_owner: Number(
          template?.admin_commission_for_owner ?? vehicle.admin_commission_for_owner ?? 0,
        ),
        user_cancellation_fee_type: template?.user_cancellation_fee_type || 'percentage',
        user_cancellation_fee: Number(template?.user_cancellation_fee ?? 0),
        driver_cancellation_fee_type: template?.driver_cancellation_fee_type || 'percentage',
        driver_cancellation_fee: Number(template?.driver_cancellation_fee ?? 0),
        cancellation_fee_goes_to: template?.cancellation_fee_goes_to || 'admin',
        service_tax: Number(vehicle.service_tax ?? 0),
        base_price: legacy.base_price,
        base_distance: legacy.base_distance,
        price_per_distance: legacy.distance_price,
      },
    });
  }

  return plan;
};
