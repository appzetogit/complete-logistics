/**
 * Makes referral codes unique, safely.
 *
 *   node scripts/migrateReferralCodes.js            report only (changes nothing)
 *   node scripts/migrateReferralCodes.js --apply    give duplicate codes a new value, then create the unique indexes
 *
 * Why: User.referralCode and Driver.referralCode were not unique. Production runs with autoIndex off, so the unique
 * index has to be created once, and it fails if two accounts share a code.
 *
 * What it changes: only the accounts that share a code. The oldest keeps its code (it may already be shared in the
 * wild); every later one gets a fresh code. Nothing else is touched: referral counts, referredBy links, rewards
 * and wallet balances stay as they are.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import '../src/config/env.js';
import { env } from '../src/config/env.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { User } from '../src/modules/taxi/user/models/User.js';

const apply = process.argv.includes('--apply');

const newCode = (prefix, account) => {
  const idPart = String(account._id).slice(-6).toUpperCase();
  const phonePart = String(account.phone || '').slice(-4);
  return `${prefix}${phonePart}${idPart}${crypto.randomBytes(2).toString('hex').toUpperCase()}`.replace(/\W/g, '');
};

const processModel = async ({ label, Model, prefix }) => {
  const duplicates = await Model.aggregate([
    { $match: { referralCode: { $type: 'string', $gt: '' } } },
    { $group: { _id: '$referralCode', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  console.log(`${label}: ${duplicates.length} referral code(s) shared by more than one account`);

  for (const group of duplicates) {
    const accounts = await Model.find({ _id: { $in: group.ids } }).sort({ createdAt: 1, _id: 1 }).select('phone createdAt');
    const [keeper, ...others] = accounts;
    console.log(`  ${group._id}: keeps ${keeper._id}, changes ${others.map((item) => String(item._id)).join(', ')}`);

    if (!apply) continue;

    for (const account of others) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await Model.updateOne({ _id: account._id }, { $set: { referralCode: newCode(prefix, account) } });
          break;
        } catch (error) {
          if (error?.code !== 11000 || attempt === 4) throw error;
        }
      }
    }
  }

  if (apply) {
    await Model.collection.createIndex(
      { referralCode: 1 },
      { unique: true, partialFilterExpression: { referralCode: { $type: 'string', $gt: '' } }, name: 'referralCode_1' },
    );
    console.log(`${label}: unique index on referralCode is in place`);
  }
};

(async () => {
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
  console.log(`Connected to ${mongoose.connection.name}. Mode: ${apply ? 'APPLY' : 'report only'}`);

  await processModel({ label: 'Users', Model: User, prefix: 'USR' });
  await processModel({ label: 'Drivers', Model: Driver, prefix: 'DRV' });

  if (!apply) {
    console.log('\nNothing was changed. Run again with --apply to fix duplicates and create the unique indexes.');
  }

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error('Migration failed:', error);
  await mongoose.disconnect().catch(() => null);
  process.exit(1);
});
