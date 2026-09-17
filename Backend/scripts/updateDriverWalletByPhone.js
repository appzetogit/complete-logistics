import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';

const phone = String(process.argv[2] || '').trim();
const rawAmount = process.argv[3];
const amount = Number(rawAmount);

if (!/^\d{10}$/.test(phone)) {
  throw new Error('Usage: node scripts/updateDriverWalletByPhone.js <10-digit-phone> <amount>');
}

if (!Number.isFinite(amount) || amount <= 0) {
  throw new Error('Amount must be a positive number');
}

const connect = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    autoIndex: env.nodeEnv !== 'production',
    dbName: env.mongoDbName,
  });
};

const main = async () => {
  await connect();

  const driver = await Driver.findOneAndUpdate(
    { phone },
    {
      $inc: { 'wallet.balance': amount },
      $set: { 'wallet.updatedAt': new Date() },
    },
    {
      new: true,
      runValidators: true,
    },
  ).lean();

  if (!driver) {
    throw new Error(`Driver not found for phone ${phone}`);
  }

  console.log(JSON.stringify({
    ok: true,
    phone,
    addedAmount: amount,
    walletBalance: Number(driver?.wallet?.balance || 0),
    driverId: String(driver._id),
  }));
};

main()
  .catch((error) => {
    console.error('[updateDriverWalletByPhone] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
