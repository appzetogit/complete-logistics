import { SetPrice } from '../admin/models/SetPrice.js';
import { findZoneByPickup } from './matchingService.js';

// Where a goods (delivery) fare gets its distance charges, service tax, commission and payment methods:
// ONLY SetPrice ("Pricing > Set Price"). A rule applies when it is active, belongs to this vehicle type, is saved
// for DELIVERY pricing (transport_type 'delivery') and matches the pickup, most specific first:
//   pickup zone  ->  pickup service location  ->  "All Zones" (no zone).
// Rules saved as 'both' / 'taxi' are never used: on a "Both" vehicle a single row is shared with taxi rides.
// With no delivery rule the vehicle is NOT PRICED: the quote says so and a booking is refused. The old prices on
// the Vehicle Type page are never used (scripts/migrateDeliveryPricingToSetPrice.js copies them into Set Price).
//
// Load-height / extras options and detention terms stay on the vehicle type.

export const DELIVERY_PRICING_SOURCE = Object.freeze({
  SET_PRICE: 'set_price',
  NONE: 'none',
  // kept for older readers of `delivery_pricing_source`; no longer produced
  VEHICLE: 'vehicle',
});

const NOT_PRICED = Object.freeze({
  enabled: false,
  base_price: 0,
  base_distance: 0,
  free_distance: 0,
  distance_price: 0,
});

const toNonNegative = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

/** Distance-charge block from a SetPrice row. */
export const buildPricingFromSetPrice = (rule = {}) => {
  const basePrice = toNonNegative(rule.base_price);
  const baseDistance = toNonNegative(rule.base_distance);
  const distancePrice = toNonNegative(rule.price_per_distance);

  return {
    // A rule with no charges at all is "not priced", not "free".
    enabled: basePrice > 0 || distancePrice > 0,
    base_price: basePrice,
    base_distance: baseDistance,
    free_distance: baseDistance,
    distance_price: distancePrice,
  };
};

/** Distance-charge block from the vehicle type's legacy fields. */
export const buildPricingFromVehicle = (vehicle = {}) => {
  const pricing = vehicle?.delivery_distance_pricing || {};
  const basePrice = toNonNegative(pricing.base_price);
  const distancePrice = toNonNegative(pricing.distance_price);
  const baseDistance = toNonNegative(pricing.base_distance ?? pricing.free_distance);

  return {
    enabled: Boolean(pricing.enabled || basePrice > 0 || distancePrice > 0),
    base_price: basePrice,
    base_distance: baseDistance,
    free_distance: baseDistance,
    distance_price: distancePrice,
  };
};

const buildScopeFilters = (zone) => [
  zone?._id ? { zone_id: zone._id } : null,
  zone?.service_location_id ? { zone_id: null, service_location_id: zone.service_location_id } : null,
  { zone_id: null, service_location_id: null },
].filter(Boolean);

/** The most specific active delivery SetPrice for a vehicle at a pickup, or null. */
export const findDeliverySetPrice = async ({ vehicleTypeId, zone = null, deps = {} }) => {
  const SetPriceModel = deps.SetPrice || SetPrice;

  if (!vehicleTypeId) {
    return null;
  }

  for (const scope of buildScopeFilters(zone)) {
    const rule = await SetPriceModel.findOne({
      vehicle_type: vehicleTypeId,
      active: 1,
      status: 'active',
      pricing_scope: { $ne: 'package' },
      transport_type: 'delivery',
      ...scope,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    if (rule) {
      return rule;
    }
  }

  return null;
};

/**
 * Everything the goods fare engine needs for a vehicle at a pickup point.
 * Quote and booking both call this, so they can never disagree.
 */
export const resolveDeliveryPricing = async ({ vehicle, pickupCoords, deps = {} }) => {
  const zone = await (deps.findZone || findZoneByPickup)(pickupCoords).catch(() => null);
  const zoneInfo = zone?._id
    ? { id: String(zone._id), serviceLocationId: zone.service_location_id ? String(zone.service_location_id) : null }
    : null;

  const rule = await findDeliverySetPrice({ vehicleTypeId: vehicle?._id, zone, deps });

  if (rule) {
    return {
      source: DELIVERY_PRICING_SOURCE.SET_PRICE,
      setPriceId: String(rule._id),
      rule,
      pricing: buildPricingFromSetPrice(rule),
      serviceTaxPercentage: toNonNegative(rule.service_tax),
      zone: zoneInfo,
    };
  }

  return {
    source: DELIVERY_PRICING_SOURCE.NONE,
    setPriceId: null,
    rule: null,
    pricing: { ...NOT_PRICED },
    serviceTaxPercentage: 0,
    zone: zoneInfo,
  };
};

const isDeliveryVehicle = (vehicle) =>
  ['delivery', 'both'].includes(String(vehicle?.transport_type || '').trim().toLowerCase());

/**
 * Public vehicle catalog: show the "All Zones" delivery SetPrice rate on goods
 * vehicles, so apps that read delivery_distance_pricing from the catalog see the
 * Set Price values. Zone-specific rates are not knowable without a pickup
 * point, so they only come through the quote endpoint.
 */
export const overlayCatalogWithDeliverySetPrices = async (vehicles = [], deps = {}) => {
  const SetPriceModel = deps.SetPrice || SetPrice;
  const deliveryIds = vehicles.filter(isDeliveryVehicle).map((vehicle) => vehicle._id).filter(Boolean);

  if (deliveryIds.length === 0) {
    return vehicles;
  }

  const rows = await SetPriceModel.find({
    vehicle_type: { $in: deliveryIds },
    active: 1,
    status: 'active',
    pricing_scope: { $ne: 'package' },
    transport_type: 'delivery',
    zone_id: null,
    service_location_id: null,
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const newestByVehicle = new Map();
  for (const row of rows) {
    const key = String(row.vehicle_type);
    if (!newestByVehicle.has(key)) {
      newestByVehicle.set(key, row);
    }
  }

  return vehicles.map((vehicle) => {
    if (!isDeliveryVehicle(vehicle)) {
      return vehicle;
    }

    const rule = newestByVehicle.get(String(vehicle._id));
    if (!rule) {
      // No "All Zones" delivery Set Price: the card shows no rate (a zone price, if any, comes with the quote).
      return {
        ...vehicle,
        delivery_pricing_source: DELIVERY_PRICING_SOURCE.NONE,
        delivery_distance_pricing: { ...(vehicle.delivery_distance_pricing || {}), ...NOT_PRICED },
        service_tax: 0,
      };
    }

    return {
      ...vehicle,
      delivery_pricing_source: DELIVERY_PRICING_SOURCE.SET_PRICE,
      delivery_distance_pricing: {
        ...(vehicle.delivery_distance_pricing || {}),
        ...buildPricingFromSetPrice(rule),
      },
      service_tax: toNonNegative(rule.service_tax),
    };
  });
};
