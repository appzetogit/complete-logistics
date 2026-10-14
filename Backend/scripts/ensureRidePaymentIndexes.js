/**
 * Production has Mongoose autoIndex off, so new indexes must be created by hand. This creates:
 *   - uniq_ride_provider_payment_id: one gateway payment can pay one ride only
 *   - ride_payment_refund_status: Admin > Payment Refunds
 *   - ride_unpaid_online_cover: the sweep that pays drivers for online bookings the rider never paid
 *
 *   node scripts/ensureRidePaymentIndexes.js          checks for duplicates first, changes nothing if any
 *
 * If the same payment id is already on two rides, the unique index cannot be built: the script lists them
 * and stops (fix them by hand, then run it again). Safe to run again.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const DB_NAME = String(process.env.MONGODB_DB_NAME || 'appzeto_taxi').trim();
if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in Backend/.env');
}

const { Ride } = await import('../src/modules/taxi/user/models/Ride.js');

try {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME, autoIndex: false });
  console.log(`Connected to ${mongoose.connection.host}/${DB_NAME}\n`);

  const duplicates = await Ride.aggregate([
    { $match: { 'driverPaymentCollection.providerPaymentId': { $gt: '' } } },
    { $group: { _id: '$driverPaymentCollection.providerPaymentId', rides: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  if (duplicates.length) {
    console.log('The same payment id is recorded on more than one ride. Fix these first:');
    for (const item of duplicates) console.log(`  ${item._id}: ${item.rides.map(String).join(', ')}`);
    process.exitCode = 1;
  } else {
    await Ride.collection.createIndex(
      { 'driverPaymentCollection.providerPaymentId': 1 },
      {
        name: 'uniq_ride_provider_payment_id',
        unique: true,
        partialFilterExpression: { 'driverPaymentCollection.providerPaymentId': { $gt: '' } },
      },
    );
    console.log('ok  uniq_ride_provider_payment_id');
  }

  await Ride.collection.createIndex({ 'paymentRefunds.status': 1 }, { name: 'ride_payment_refund_status', sparse: true });
  console.log('ok  ride_payment_refund_status');
  await Ride.collection.createIndex(
    { completedAt: 1 },
    { name: 'ride_unpaid_online_cover', partialFilterExpression: { settledAs: 'cash', paymentMethod: 'online', platformCoveredAt: null } },
  );
  console.log('ok  ride_unpaid_online_cover');
} catch (error) {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
