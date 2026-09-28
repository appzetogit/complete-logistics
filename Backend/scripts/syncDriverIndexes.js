import dns from 'node:dns';
import { connectDatabase } from '../src/config/database.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { env } from '../src/config/env.js';

if (env.mongoUri.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers()]);
  } catch {
    // Non-fatal fallback
  }
}

const run = async () => {
  await connectDatabase();
  console.log(`Checking indexes on collection '${Driver.collection.name}'...`);

  const indexesBefore = await Driver.collection.indexes();
  console.log('Existing indexes before sync:');
  console.log(JSON.stringify(indexesBefore, null, 2));

  console.log('\nSyncing Driver indexes...');
  const synced = await Driver.syncIndexes();
  console.log('Driver indexes synced:', synced);

  const indexesAfter = await Driver.collection.indexes();
  console.log('\nIndexes after sync:');
  console.log(JSON.stringify(indexesAfter, null, 2));

  process.exit(0);
};

run().catch((error) => {
  console.error('Error syncing driver indexes:', error);
  process.exit(1);
});
