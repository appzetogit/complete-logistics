import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './modules/taxi/middlewares/errorMiddleware.js';
import { taxiRouter } from './modules/taxi/routes/index.js';
import { referralLinkRouter } from './modules/taxi/referral/routes/referralRoutes.js';

export const createApp = () => {
  const app = express();

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
  app.use(express.json({
    limit: '25mb',
    // Razorpay signs the exact bytes it sent, so keep them for the webhook routes only
    // (goods advance: /deliveries/advance/razorpay/webhook, ride payments: /rides/payments/razorpay/webhook).
    verify: (req, _res, buf) => {
      const url = String(req.originalUrl || '');
      if (url.includes('/advance/razorpay/webhook') || url.includes('/rides/payments/razorpay/webhook')) {
        req.rawBody = buf;
      }
    },
  }));
  app.use(express.urlencoded({ extended: true })); 
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  app.use('/uploads', express.static(env.uploadDir));

  app.get('/health', (_req, res) => {
    res.json({ success: true, message: 'Taxi backend is healthy' });
  });

  // The shared referral link (https://<domain>/r/<code>) lives at the site root, not under /api.
  app.use(referralLinkRouter);

  // Keep both mounts during integration so existing clients using /api or /api/v1 continue to work.
  app.use('/api', taxiRouter);
  app.use('/api/v1', taxiRouter);

  app.get(['/api', '/api/v1'], (_req, res) => {
    res.json({
      success: true,
      message: 'Taxi API is mounted',
      routes: {
        admins: ['/api/admin', '/api/v1/admin'],
        users: ['/api/users', '/api/v1/users'],
        drivers: ['/api/drivers', '/api/v1/drivers'],
        rides: ['/api/rides', '/api/v1/rides'],
        deliveries: ['/api/deliveries', '/api/v1/deliveries'],
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
