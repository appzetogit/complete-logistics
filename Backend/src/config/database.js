import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

// `mongodb+srv://` connection strings resolve via DNS SRV/TXT lookups. On
// machines with multiple network adapters, Node's bundled resolver can pick
// an adapter's DNS server that doesn't answer SRV queries even though the
// OS's own resolver works fine. Putting public resolvers first fixes SRV
// lookups without touching how the OS resolves everything else.
if (env.mongoUri.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers()]);
  } catch {
    // Non-fatal — falls back to the OS-configured resolvers.
  }
}

export const connectDatabase = async () => {
  mongoose.set('strictQuery', true);

  const connection = await mongoose.connect(env.mongoUri, {
    autoIndex: env.nodeEnv !== 'production',
    dbName: env.mongoDbName,
  });

  const { host, name } = connection.connection;
  console.log(`MongoDB connected to ${host}/${name}`);
};
