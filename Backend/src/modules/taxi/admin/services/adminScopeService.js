import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';

/*
 * State-wise / location-wise admin scope.
 *
 * An admin request may be limited to a set of service locations (cities). The limit comes from the states, service
 * locations and zones assigned to the admin, optionally narrowed further by the "state" selector in the admin panel
 * (header `x-admin-state`). The allowed location ids travel with the request in an AsyncLocalStorage store, and a
 * mongoose plugin (adminScopeMongoose.js) adds the matching filter to EVERY query on the scoped models. So lists,
 * details, edits, deletes, counts, dashboards and exports all obey it without each function repeating the filter.
 *
 * Unrestricted: a super admin with no state selected, and legacy sub-admins that have no state / location / zone
 * assigned (they keep seeing everything, as before). Nothing outside admin requests (apps, sockets, jobs) is affected.
 */

const store = new AsyncLocalStorage();

const toObjectId = (value) => {
  const text = String(value || '').trim();
  return mongoose.isValidObjectId(text) ? new mongoose.Types.ObjectId(text) : null;
};
const uniqueIds = (values = []) => {
  const seen = new Map();
  for (const value of values) {
    const id = toObjectId(value);
    if (id) seen.set(String(id), id);
  }
  return [...seen.values()];
};

// ---- what is scoped ---------------------------------------------------------------------------------------------
// field: the model carries the service location itself. via: it is reached through another scoped model.
// global: the model is NOT limited by state (every admin sees all of it). Riders are global: a rider is not tied to one
// state, so the Users screens, a rider's wallet and subscriptions always show every rider.
export const SCOPE_RULES = {
  // area_location_id is a label only for this view; rides and drivers also fall back to their dispatch service_location_id
  TaxiRide: { field: 'area_location_id', mirrorFrom: 'service_location_id' },
  TaxiDriver: { field: 'area_location_id', mirrorFrom: 'service_location_id' },
  TaxiUser: { global: true },
  TaxiOwner: { field: 'service_location_id' },
  TaxiFleetVehicle: { field: 'service_location_id' },
  TaxiServiceStore: { field: 'service_location_id' },
  TaxiAirport: { field: 'service_location_id' },
  TaxiZone: { field: 'service_location_id' },
  TaxiSetPrice: { field: 'service_location_id' },
  TaxiServiceLocation: { field: '_id' },
  WalletTransaction: { via: [{ field: 'driverId', model: 'TaxiDriver' }] },
  TaxiWithdrawalRequest: {
    via: [{ field: 'driver_id', model: 'TaxiDriver' }, { field: 'owner_id', model: 'TaxiOwner' }],
  },
  TaxiSupportTicket: {
    via: [{ field: 'driver_id', model: 'TaxiDriver' }, { field: 'owner_id', model: 'TaxiOwner' }, { field: 'user_id', model: 'TaxiUser', global: true }],
  },
};

// ---- the per-request store --------------------------------------------------------------------------------------

/** The active scope: { locationIds, cache } or null when the request is unrestricted. */
export const getActiveScope = () => store.getStore() || null;

export const runWithAdminScope = (scope, fn) => store.run({ locationIds: scope.locationIds, cache: new Map() }, fn);

/** Runs `fn` with no scope (system lookups that must see every record). */
export const withoutAdminScope = (fn) => store.exit(fn);

/** Location ids (as strings) the current request may touch, or null when unrestricted. */
export const getScopedLocationIds = () => {
  const scope = getActiveScope();
  return scope ? scope.locationIds.map(String) : null;
};

// ---- resolving who may see what ---------------------------------------------------------------------------------

const SCOPE_CACHE_MS = 20 * 1000;
const scopeCache = new Map();
export const clearAdminScopeCache = () => scopeCache.clear();

const hasOwnScope = (admin = {}) =>
  (admin.state_ids?.length || 0) + (admin.service_location_ids?.length || 0) + (admin.zone_ids?.length || 0) > 0;

/**
 * { restricted: false } or { restricted: true, locationIds: [ObjectId] } for this admin.
 * `selectedState`: a state id from the panel's selector, or '' / 'all'.
 */
export const resolveAdminScope = async ({ admin, isSuperAdmin, selectedState = '' }) => {
  const stateChoice = String(selectedState || '').trim().toLowerCase();
  const chosenState = stateChoice && stateChoice !== 'all' ? toObjectId(stateChoice) : null;
  const ownScope = !isSuperAdmin && hasOwnScope(admin);

  if (!ownScope && !chosenState) return { restricted: false, locationIds: [] };

  const cacheKey = `${admin?._id || admin?.id}|${chosenState || ''}|${ownScope}|${(admin.state_ids || []).join(',')}|${(admin.service_location_ids || []).join(',')}|${(admin.zone_ids || []).join(',')}`;
  const hit = scopeCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  const ServiceLocation = mongoose.models.TaxiServiceLocation;
  const Zone = mongoose.models.TaxiZone;

  let allowed = null; // null = everything
  if (ownScope) {
    const fromStates = admin.state_ids?.length
      ? await ServiceLocation.find({ state_id: { $in: uniqueIds(admin.state_ids) } }).setOptions({ skipAdminScope: true }).distinct('_id')
      : [];
    const fromZones = admin.zone_ids?.length
      ? await Zone.find({ _id: { $in: uniqueIds(admin.zone_ids) } }).setOptions({ skipAdminScope: true }).distinct('service_location_id')
      : [];
    allowed = uniqueIds([...(admin.service_location_ids || []), ...fromStates, ...fromZones]);
  }

  let locationIds = allowed;
  if (chosenState) {
    const inState = await ServiceLocation.find({ state_id: chosenState }).setOptions({ skipAdminScope: true }).distinct('_id');
    const stateIds = uniqueIds(inState);
    if (allowed === null) {
      locationIds = stateIds;
    } else {
      const allowedSet = new Set(allowed.map(String));
      locationIds = stateIds.filter((id) => allowedSet.has(String(id)));
    }
  }

  const value = { restricted: true, locationIds: locationIds || [] };
  scopeCache.set(cacheKey, { value, expires: Date.now() + SCOPE_CACHE_MS });
  return value;
};

// ---- the filter for one model -----------------------------------------------------------------------------------

// the cache holds a PROMISE (.exec()): a mongoose Query can only be awaited once, and two queries of one request
// (for example two aggregates in a Promise.all) both need these ids.
const idsInScope = async (scope, modelName) => {
  const key = `ids:${modelName}`;
  if (!scope.cache.has(key)) {
    const Model = mongoose.models[modelName];
    scope.cache.set(
      key,
      Model
        ? Model.find({ [SCOPE_RULES[modelName]?.field || 'service_location_id']: { $in: scope.locationIds } }).setOptions({ skipAdminScope: true }).distinct('_id').exec()
        : Promise.resolve([]),
    );
  }
  return scope.cache.get(key);
};

/** The mongo filter that limits `modelName` to the active scope, or null when nothing applies. */
export const buildScopeFilter = async (modelName, scope = getActiveScope()) => {
  const rule = SCOPE_RULES[modelName];
  if (!scope || !rule || rule.global) return null;

  if (rule.field) return { [rule.field]: { $in: scope.locationIds } };

  const clauses = [];
  for (const link of rule.via) {
    // a global model (riders) has no area: every record of that kind is visible, so the link only has to be set
    clauses.push(link.global ? { [link.field]: { $ne: null } } : { [link.field]: { $in: await idsInScope(scope, link.model) } });
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

/** True when a record with this service location id may be touched by the active scope. */
export const isLocationInScope = (locationId, scope = getActiveScope()) => {
  if (!scope) return true;
  if (!locationId) return false;
  return scope.locationIds.some((id) => String(id) === String(locationId));
};
