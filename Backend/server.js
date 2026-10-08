import { createServer } from 'node:http';
import { createApp } from './src/app.js';
import { connectDatabase } from './src/config/database.js';
import { env } from './src/config/env.js';
import { connectRedis, getRedisStatus } from './src/infrastructure/redis/redisClient.js';
import { configureTaxiSocketServer } from './src/modules/taxi/socket/index.js';
import { User } from './src/modules/taxi/user/models/User.js';
import { getFirebaseStatus } from './src/config/firebase.js';
import { Driver } from './src/modules/taxi/driver/models/Driver.js';
import { Zone } from './src/modules/taxi/driver/models/Zone.js';
import { ServiceLocation } from './src/modules/taxi/admin/models/ServiceLocation.js';

// Production runs with autoIndex off, so the geo indexes driver matching needs ($near on drivers,
// zone lookup) may never have been built - then every dispatch attempt throws. Make sure they exist;
// creating an index that already exists is a no-op.
const ensureDispatchGeoIndexes = async () => {
  const wanted = [
    [Driver, { location: '2dsphere' }],
    [Driver, { 'routeBooking.anchorLocation': '2dsphere' }],
    [Zone, { geometry: '2dsphere' }],
    [ServiceLocation, { location: '2dsphere' }],
  ];
  for (const [model, keys] of wanted) {
    try {
      await model.collection.createIndex(keys);
    } catch (error) {
      console.error(`[indexes] could not create ${model.collection.collectionName} ${JSON.stringify(keys)}: ${error.message}`);
    }
  }
  console.log('[indexes] dispatch geo indexes checked');
};
import { restoreScheduledDispatches, startDispatchRecoveryLoop } from './src/modules/taxi/services/dispatchService.js';

const bootstrap = async () => {
  await connectDatabase();
  await ensureDispatchGeoIndexes();
  if (!env.redis.enabled || !env.redis.url) {
    console.warn('[redis] disabled or not configured, falling back to in-memory rate limiting');
  } else {
    const redisClient = await connectRedis();
    if (!redisClient?.isReady) {
      console.warn('[redis] startup connect did not complete; app will continue and fall back to in-memory rate limiting until Redis is ready');
    }
  }

  const firebaseStatus = getFirebaseStatus();
  if (firebaseStatus.configured) {
    console.log(`[push] Firebase configured (project ${firebaseStatus.projectId || 'unknown'})`);
  } else {
    console.error(`[push] PUSH NOTIFICATIONS ARE OFF - ${firebaseStatus.reason}`);
  }

  const app = createApp();
  const httpServer = createServer(app);

  await configureTaxiSocketServer(httpServer);
  await restoreScheduledDispatches();
  startDispatchRecoveryLoop();

  httpServer.listen(env.port, () => {
    const redisStatus = getRedisStatus();
    console.log(`Taxi backend listening on port ${env.port}`);
    console.log('[redis] status', redisStatus);
  });
};

bootstrap().catch((error) => {
  console.error('Failed to start taxi backend', error);
  process.exit(1);
});
