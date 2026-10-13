/**
 * One-time: move every rider's refund credits (`refundWallet`) into the spendable `balance`, with a
 * "Moved from refund wallet" entry in their history. Afterwards the refund line disappears in the app (it hides at 0).
 *
 *   node scripts/moveRefundWalletToBalance.js           dry run: lists the wallets and the total, changes nothing
 *   node scripts/moveRefundWalletToBalance.js --apply   moves the money
 *
 * Each wallet is moved atomically (only if the refund amount is still what was read), so it is safe to run while the
 * app is live and safe to run again (wallets already at 0 are skipped).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const DB_NAME = String(process.env.MONGODB_DB_NAME || 'appzeto_taxi').trim();
if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in Backend/.env');
}

const { UserWallet } = await import('../src/modules/taxi/user/models/UserWallet.js');
const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

try {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected to ${mongoose.connection.host}/${DB_NAME}  (${APPLY ? 'APPLY' : 'dry run'})\n`);

  const wallets = await UserWallet.find({ refundWallet: { $gt: 0 } }).select('userId refundWallet balance').lean();
  let total = 0;
  let moved = 0;
  for (const wallet of wallets) {
    const amount = round(wallet.refundWallet);
    total = round(total + amount);
    console.log(`${String(wallet.userId)}  refund ₹${amount}  -> balance ₹${round(wallet.balance)} + ₹${amount}`);
    if (!APPLY) continue;
    const result = await UserWallet.updateOne(
      { _id: wallet._id, refundWallet: wallet.refundWallet },
      {
        $inc: { refundWallet: -wallet.refundWallet, balance: amount },
        $push: {
          transactions: {
            $each: [{ kind: 'credit', amount, title: 'Moved from refund wallet', provider: 'refund_wallet_move', walletField: 'balance' }],
            $slice: -50,
          },
        },
      },
    );
    if (result.modifiedCount) {
      moved += 1;
    } else {
      console.log('   skipped: the refund amount changed meanwhile (run again)');
    }
  }

  console.log(`\n${wallets.length} wallet(s) with refund credits, ₹${total} in total.`);
  console.log(APPLY ? `Moved ${moved} wallet(s).` : 'Dry run only. Add --apply to move them.');
} catch (error) {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
