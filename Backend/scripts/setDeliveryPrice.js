/**
 * Create or update the "All Zones" Delivery Set Price of one goods vehicle (Pricing > Set Price, Pricing for:
 * Delivery). Goods are priced only from this row, so a goods vehicle without one cannot be booked.
 *
 * List every goods vehicle and its current All Zones delivery price:
 *   node scripts/setDeliveryPrice.js --list
 *
 * Set a price (dry run: shows what would change, writes nothing):
 *   node scripts/setDeliveryPrice.js --vehicle="Rentol 20 Ft(7 ton)" --base=500 --base-km=2 --per-km=40 --tax=5
 * Then the same with --apply.
 *
 * Options (only the ones given are changed on an existing row):
 *   --vehicle=<name or id>   exact vehicle type name (case-insensitive) or its id
 *   --base=<rupees>          base price
 *   --base-km=<km>           distance covered by the base price
 *   --per-km=<rupees>        price per km after the base distance
 *   --tax=<percent>          service tax %
 *   --commission=<percent>   admin commission from the driver, in % (new rows default to the vehicle's existing one)
 *   --payment=cash,online    allowed payment methods (new rows default to cash,online)
 *   --apply                  write the change
 *
 * The quote and booking use the new price immediately; the vehicle list in the app within a few minutes (cache).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
const APPLY = args.apply === true;
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const DB_NAME = String(process.env.MONGODB_DB_NAME || 'appzeto_taxi').trim();
if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in Backend/.env');
}

const { Vehicle } = await import('../src/modules/taxi/admin/models/Vehicle.js');
const { SetPrice } = await import('../src/modules/taxi/admin/models/SetPrice.js');

const GOODS = ['delivery', 'both'];
const ALL_ZONES_DELIVERY = { transport_type: 'delivery', zone_id: null, service_location_id: null, pricing_scope: { $ne: 'package' } };

const numberArg = (name) => {
  if (args[name] === undefined) return undefined;
  const value = Number(args[name]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} must be a number >= 0 (got "${args[name]}")`);
  }
  return value;
};

const describe = (row) => (row
  ? `base ₹${row.base_price ?? 0} for ${row.base_distance ?? 0} km, then ₹${row.price_per_distance ?? 0}/km, tax ${row.service_tax ?? 0}%, `
    + `commission ${row.admin_commission_from_driver ?? 0}${Number(row.admin_commission_type_from_driver ?? 1) === 1 ? '%' : ' flat'}, `
    + `payment ${(row.payment_type || []).join('/') || '-'}`
  : 'NO DELIVERY PRICE (cannot be booked)');

try {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected to ${mongoose.connection.host}/${DB_NAME}  (${APPLY ? 'APPLY' : 'dry run'})\n`);

  if (args.list) {
    const vehicles = await Vehicle.find({ transport_type: { $in: GOODS } }).select('name transport_type').sort({ name: 1 }).lean();
    for (const vehicle of vehicles) {
      const row = await SetPrice.findOne({ vehicle_type: vehicle._id, active: 1, status: 'active', ...ALL_ZONES_DELIVERY })
        .sort({ updatedAt: -1 }).lean();
      console.log(`${String(vehicle._id)}  ${String(vehicle.name).padEnd(26)} ${describe(row)}`);
    }
    process.exitCode = 0;
  } else {
    const key = String(args.vehicle || '').trim();
    if (!key) throw new Error('Pass --vehicle="<name or id>" (or --list)');

    const vehicle = mongoose.Types.ObjectId.isValid(key)
      ? await Vehicle.findById(key).lean()
      : await Vehicle.findOne({ name: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
    if (!vehicle) throw new Error(`No vehicle type named "${key}". Run with --list to see the names.`);
    if (!GOODS.includes(String(vehicle.transport_type))) {
      throw new Error(`"${vehicle.name}" is a ${vehicle.transport_type} vehicle, not a goods (delivery/both) one.`);
    }

    const changes = {};
    const base = numberArg('base');
    const baseKm = numberArg('base-km');
    const perKm = numberArg('per-km');
    const tax = numberArg('tax');
    const commission = numberArg('commission');
    if (base !== undefined) changes.base_price = base;
    if (baseKm !== undefined) changes.base_distance = baseKm;
    if (perKm !== undefined) changes.price_per_distance = perKm;
    if (tax !== undefined) changes.service_tax = tax;
    if (commission !== undefined) {
      changes.admin_commission_type_from_driver = 1;
      changes.admin_commission_from_driver = commission;
    }
    if (args.payment !== undefined) {
      const methods = String(args.payment).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
      const bad = methods.filter((item) => !['cash', 'online', 'wallet'].includes(item));
      if (!methods.length || bad.length) throw new Error('--payment must be a list of cash, online, wallet');
      changes.payment_type = methods;
    }

    const existing = await SetPrice.findOne({ vehicle_type: vehicle._id, active: 1, status: 'active', ...ALL_ZONES_DELIVERY })
      .sort({ updatedAt: -1 });
    console.log(`Vehicle: ${vehicle.name} (${vehicle._id})`);
    console.log(`Now:     ${describe(existing?.toObject())}`);

    if (!Object.keys(changes).length) {
      console.log('\nNothing to change: pass --base / --base-km / --per-km / --tax / --commission / --payment.');
    } else if (existing) {
      const next = { ...existing.toObject(), ...changes };
      if (!(Number(next.base_price) > 0 || Number(next.price_per_distance) > 0)) {
        throw new Error('A delivery price needs --base or --per-km above 0 (otherwise the vehicle stays "not priced").');
      }
      console.log(`After:   ${describe(next)}`);
      if (APPLY) {
        Object.assign(existing, changes);
        await existing.save();
        console.log(`\nUpdated Set Price ${existing._id}.`);
      }
    } else {
      // A new row: commission and payment default to what this vehicle already uses for its other rows.
      const template = await SetPrice.findOne({ vehicle_type: vehicle._id, active: 1, status: 'active', pricing_scope: { $ne: 'package' } })
        .sort({ updatedAt: -1 }).lean();
      const row = {
        vehicle_type: vehicle._id,
        transport_type: 'delivery',
        pricing_scope: 'ride',
        zone_id: null,
        service_location_id: null,
        active: 1,
        status: 'active',
        payment_type: template?.payment_type?.length ? template.payment_type : ['cash', 'online'],
        admin_commission_type_from_driver: Number(template?.admin_commission_type_from_driver ?? vehicle.admin_commission_type_from_driver ?? 1),
        admin_commission_from_driver: Number(template?.admin_commission_from_driver ?? vehicle.admin_commission_from_driver ?? 0),
        admin_commission_type_for_owner: Number(template?.admin_commission_type_for_owner ?? vehicle.admin_commission_type_for_owner ?? 1),
        admin_commission_for_owner: Number(template?.admin_commission_for_owner ?? vehicle.admin_commission_for_owner ?? 0),
        base_price: 0,
        base_distance: 0,
        price_per_distance: 0,
        service_tax: 0,
        ...changes,
      };
      if (!(row.base_price > 0 || row.price_per_distance > 0)) {
        throw new Error('A new delivery price needs --base or --per-km above 0.');
      }
      console.log(`Create:  ${describe(row)}`);
      if (APPLY) {
        const created = await SetPrice.create(row);
        console.log(`\nCreated Set Price ${created._id}.`);
      }
    }
    if (!APPLY) console.log('\nDry run only. Add --apply to write it.');
  }
} catch (error) {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
