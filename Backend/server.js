import { createServer } from 'node:http';
import { createApp } from './src/app.js';
import { connectDatabase } from './src/config/database.js';
import { env } from './src/config/env.js';
import { connectRedis, getRedisStatus } from './src/infrastructure/redis/redisClient.js';
import { configureTaxiSocketServer } from './src/modules/taxi/socket/index.js';
import { User } from './src/modules/taxi/user/models/User.js';
import { restoreScheduledDispatches, startDispatchRecoveryLoop } from './src/modules/taxi/services/dispatchService.js';

const bootstrap = async () => {
  await connectDatabase();
  if (!env.redis.enabled || !env.redis.url) {
    console.warn('[redis] disabled or not configured, falling back to in-memory rate limiting');
  } else {
    const redisClient = await connectRedis();
    if (!redisClient?.isReady) {
      console.warn('[redis] startup connect did not complete; app will continue and fall back to in-memory rate limiting until Redis is ready');
    }
  }

  const app = createApp();
  const httpServer = createServer(app);

  configureTaxiSocketServer(httpServer);
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
