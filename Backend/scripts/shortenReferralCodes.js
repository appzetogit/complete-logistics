/**
 * Gives every rider and driver that still has an old long referral code (for example USR1234AB12CD) a new
 * 8 character one (U7K2M9QX for riders, D... for drivers). The old code is kept in `legacyReferralCodes`, so links
 * and codes people already shared keep working. Nothing is written without --apply.
 *
 *   node scripts/shortenReferralCodes.js            dry run: counts and a few examples
 *   node scripts/shortenReferralCodes.js --apply    write the new codes
 *
 * Run it from the Backend folder (it reads .env). Safe to re-run: accounts that already have an 8 character code
 * are skipped.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const apply = process.argv.includes('--apply');

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'appzeto_taxi' });

  const { allocateReferralCode, REFERRAL_CODE_LENGTH } = await import('../src/modules/taxi/referral/services/referralAttributionService.js');
  const { User } = await import('../src/modules/taxi/user/models/User.js');
  const { Driver } = await import('../src/modules/taxi/driver/models/Driver.js');

  console.log(apply ? 'APPLYING changes.' : 'Dry run: nothing is written. Add --apply to write.');

  for (const [type, Model] of [['user', User], ['driver', Driver]]) {
    const filter = {
      referralCode: { $type: 'string', $gt: '' },
      $expr: { $ne: [{ $strLenCP: '$referralCode' }, REFERRAL_CODE_LENGTH] },
    };
    const total = await Model.countDocuments(filter);
    let changed = 0;
    const examples = [];

    const cursor = Model.find(filter).select('referralCode').lean().cursor();
    for await (const account of cursor) {
      const next = await allocateReferralCode(type);
      if (examples.length < 3) examples.push(`${account.referralCode} -> ${next}`);
      if (!apply) continue;
      // only while the account still has the code we read, so a parallel change is never overwritten
      const result = await Model.updateOne(
        { _id: account._id, referralCode: account.referralCode },
        { $set: { referralCode: next }, $addToSet: { legacyReferralCodes: account.referralCode } },
      );
      changed += result.modifiedCount;
    }

    console.log(`${type}s: ${total} with a long code${apply ? `, ${changed} changed` : ''}.`);
    examples.forEach((line) => console.log(`  e.g. ${line}`));
  }

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
