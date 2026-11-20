/**
 * DANGER: permanently deletes booking and wallet data from the database in .env. There is no undo.
 * Take a backup first (see below). Nothing is changed without --apply, and --apply also needs --confirm=<db name>
 * and --i-have-a-backup.
 *
 * What it removes
 *   bookings   rides (their chat, refunds and advance records are inside the ride), deliveries, ride bids,
 *              gateway payment orders (Cashfree / Razorpay order records), referral reward entries
 *   wallets    rider wallets: transactions removed, balance / refund wallet / held amount set to 0
 *              driver wallets: transactions removed, wallet.balance set to 0 (cash limit and blocked flag are kept)
 *              owner wallets: transactions removed, wallet.balance set to 0
 *   cleanup    riders' currentRideId cleared, drivers' isOnRide set to false (no ride exists any more)
 *
 * What it does NOT touch
 *   accounts (riders, drivers, owners, admins), vehicles, prices, cities and zones, settings, withdrawal requests,
 *   rental / bus / pooling / owner bookings, promo redemptions, referral codes and counters, subscriptions,
 *   support tickets, driver statistics.
 *
 *   node scripts/resetBookingsAndWallets.js                                   dry run: counts and sums only
 *   node scripts/resetBookingsAndWallets.js --apply --confirm=<db> --i-have-a-backup
 *
 * Backup first (copies every collection into a new database on the same cluster):
 *   node scripts/copyMongoDb.js "$MONGODB_URI" <db>_backup_YYYYMMDD
 * Run from the Backend folder (it reads .env).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const backupDone = args.includes('--i-have-a-backup');
const confirm = (args.find((arg) => arg.startsWith('--confirm=')) || '').slice('--confirm='.length);

const sum = async (Model, field) => {
  const [row] = await Model.aggregate([{ $group: { _id: null, total: { $sum: `$${field}` } } }]);
  return Math.round((row?.total || 0) * 100) / 100;
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  const dbName = process.env.MONGODB_DB_NAME || 'appzeto_taxi';
  await mongoose.connect(process.env.MONGODB_URI, { dbName });

  const load = async (file, name) => (await import(file))[name];
  const base = '../src/modules/taxi/';
  const Ride = await load(`${base}user/models/Ride.js`, 'Ride');
  const Delivery = await load(`${base}user/models/Delivery.js`, 'Delivery');
  const RideBid = await load(`${base}user/models/RideBid.js`, 'RideBid');
  const PaymentOrder = await load(`${base}payments/models/PaymentOrder.js`, 'PaymentOrder');
  const ReferralReward = await load(`${base}referral/models/ReferralReward.js`, 'ReferralReward');
  const UserWallet = await load(`${base}user/models/UserWallet.js`, 'UserWallet');
  const WalletTransaction = await load(`${base}driver/models/WalletTransaction.js`, 'WalletTransaction');
  const OwnerWalletTransaction = await load(`${base}admin/models/OwnerWalletTransaction.js`, 'OwnerWalletTransaction');
  const Driver = await load(`${base}driver/models/Driver.js`, 'Driver');
  const Owner = await load(`${base}admin/models/Owner.js`, 'Owner');
  const User = await load(`${base}user/models/User.js`, 'User');

  const toDelete = [
    ['rides', Ride],
    ['deliveries', Delivery],
    ['ride bids', RideBid],
    ['payment orders', PaymentOrder],
    ['referral rewards', ReferralReward],
    ['driver wallet transactions', WalletTransaction],
    ['owner wallet transactions', OwnerWalletTransaction],
  ];

  console.log(`Database: ${dbName}`);
  console.log(apply ? 'APPLY requested.' : 'Dry run: nothing is changed.');
  console.log('\nWill be DELETED:');
  for (const [label, Model] of toDelete) {
    console.log(`  ${label.padEnd(28)} ${await Model.countDocuments()}  (${Model.collection.collectionName})`);
  }
  console.log('\nWill be RESET to zero:');
  console.log(`  rider wallets                ${await UserWallet.countDocuments()}  balance sum ${await sum(UserWallet, 'balance')}, refund wallet sum ${await sum(UserWallet, 'refundWallet')}, held sum ${await sum(UserWallet, 'heldBalance')}`);
  console.log(`  driver wallets               ${await Driver.countDocuments({ 'wallet.balance': { $ne: 0 } })} drivers with a balance, sum ${await sum(Driver, 'wallet.balance')}`);
  console.log(`  owner wallets                ${await Owner.countDocuments({ 'wallet.balance': { $ne: 0 } })} owners with a balance, sum ${await sum(Owner, 'wallet.balance')}`);
  console.log(`\nWill be CLEARED: ${await User.countDocuments({ currentRideId: { $ne: null } })} riders with a current ride, ${await Driver.countDocuments({ isOnRide: true })} drivers marked on a ride`);

  if (!apply) {
    console.log('\nDry run only. To delete: --apply --confirm=' + dbName + ' --i-have-a-backup');
    await mongoose.disconnect();
    return;
  }
  if (confirm !== dbName) throw new Error(`Refused: --confirm must equal the database name (${dbName}).`);
  if (!backupDone) throw new Error('Refused: take a backup first, then add --i-have-a-backup.');

  console.log('\nDeleting...');
  for (const [label, Model] of toDelete) {
    const result = await Model.deleteMany({});
    console.log(`  ${label}: ${result.deletedCount} deleted`);
  }
  const wallets = await UserWallet.updateMany({}, { $set: { balance: 0, refundWallet: 0, heldBalance: 0, transactions: [] } });
  console.log(`  rider wallets reset: ${wallets.modifiedCount}`);
  const drivers = await Driver.updateMany({ 'wallet.balance': { $ne: 0 } }, { $set: { 'wallet.balance': 0 } });
  console.log(`  driver wallets reset: ${drivers.modifiedCount}`);
  const owners = await Owner.updateMany({ 'wallet.balance': { $ne: 0 } }, { $set: { 'wallet.balance': 0 } });
  console.log(`  owner wallets reset: ${owners.modifiedCount}`);
  const riders = await User.updateMany({ currentRideId: { $ne: null } }, { $set: { currentRideId: null } });
  const onRide = await Driver.updateMany({ isOnRide: true }, { $set: { isOnRide: false } });
  console.log(`  riders with a current ride cleared: ${riders.modifiedCount}, drivers set off-ride: ${onRide.modifiedCount}`);

  console.log('\nDone. Restart the backend (pm2 restart 25 --update-env) so nothing keeps old state in memory.');
  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
