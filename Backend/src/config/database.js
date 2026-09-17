import mongoose from 'mongoose';
import { env } from './env.js';

// REQUIRES A REPLICA SET. Ride acceptance, bid acceptance and the wallet
// services use multi-document transactions, which MongoDB only allows on a
// replica set member or mongos. Against a standalone mongod every one of those
// paths fails with "Transaction numbers are only allowed on a replica set
// member or mongos" -- the API keeps answering and only the transactional
// flows break, so it does not look like a configuration fault. A single-node
// replica set is enough: set replication.replSetName in mongod.conf, run
// rs.initiate(), and point MONGODB_URI at it with ?replicaSet=<name>.
export const connectDatabase = async () => {
  mongoose.set('strictQuery', true);

  const connection = await mongoose.connect(env.mongoUri, {
    autoIndex: env.nodeEnv !== 'production',
    dbName: env.mongoDbName,
  });

  const { host, name } = connection.connection;
  console.log(`MongoDB connected to ${host}/${name}`);
};
