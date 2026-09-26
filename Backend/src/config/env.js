import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const primaryEnvPath = path.resolve(__dirname, '../../.env');
const fallbackEnvPath = path.resolve(process.cwd(), '.env');

const primaryEnvLoad = dotenv.config({ path: primaryEnvPath });
if (primaryEnvLoad.error && primaryEnvPath !== fallbackEnvPath) {
  dotenv.config({ path: fallbackEnvPath });
}

const resolvedJwtSecret = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET;
const resolvedJwtExpiresIn = process.env.JWT_EXPIRES_IN || process.env.JWT_ACCESS_EXPIRES || '7d';
const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        return trimmedValue;
      }
    }
  }

  return '';
};

const requiredEnvVars = ['MONGODB_URI'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

if (!resolvedJwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET or JWT_ACCESS_SECRET');
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number.isInteger(Number(process.env.PORT)) ? Number(process.env.PORT) : 4000,
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB_NAME || 'appzeto_taxi',
  jwtSecret: resolvedJwtSecret,
  jwtExpiresIn: resolvedJwtExpiresIn,
  corsOrigin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '*',
  publicFrontendUrl:
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.APP_FRONTEND_URL ||
    process.env.FRONTEND_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    '',
  publicBackendUrl:
    process.env.PUBLIC_BACKEND_URL ||
    process.env.APP_BACKEND_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.BACKEND_URL ||
    '',
  phonePeRedirectBaseUrl:
    process.env.PHONEPE_REDIRECT_BASE_URL ||
    process.env.PHONEPE_CALLBACK_BASE_URL ||
    process.env.PUBLIC_PHONEPE_REDIRECT_URL ||
    '',
  uploadDir: path.resolve(
    __dirname,
    '../..',
    process.env.UPLOAD_DIR || process.env.UPLOAD_PATH || 'uploads',
  ),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'appzeto-taxi',
  },
  firebase: {
    databaseURL: process.env.FIREBASE_DATABASE_URL || '',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
    serviceAccountJson:
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      '',
  },
  sms: {
    useDefaultOtp: process.env.USE_DEFAULT_OTP || 'false',
    staticOtpPhone: readEnv('STATIC_OTP_PHONE'),
    staticOtpCode: readEnv('STATIC_OTP_CODE'),
    otpExpiryMinutes:
      Number.isFinite(Number(process.env.OTP_EXPIRY_MINUTES)) && Number(process.env.OTP_EXPIRY_MINUTES) > 0
        ? Number(process.env.OTP_EXPIRY_MINUTES)
        : 10,
    indiaHub: {
      username: readEnv('SMS_INDIA_HUB_USERNAME'),
      password: readEnv('SMS_INDIA_HUB_PASSWORD'),
      apiKey: readEnv('SMS_INDIA_HUB_API_KEY'),
      apiKeyOverride: readEnv('SMS_INDIA_HUB_API_KEY_OVERRIDE'),
      senderId: readEnv('SMS_INDIA_HUB_SENDER_ID'),
      dltTemplateId: readEnv('SMS_INDIA_HUB_DLT_TEMPLATE_ID'),
    },
  },
  driverWallet: {
    defaultCashLimit: Number.isFinite(Number(process.env.DRIVER_WALLET_DEFAULT_CASH_LIMIT))
      ? Number(process.env.DRIVER_WALLET_DEFAULT_CASH_LIMIT)
      : 500,
    commissionPercent: Number.isFinite(Number(process.env.DRIVER_COMMISSION_PERCENT))
      ? Number(process.env.DRIVER_COMMISSION_PERCENT)
      : 20,
  },
  uploads: {
    // Absolute path nginx serves at /uploads/ (see sites-enabled/udanxpress.conf).
    dir: process.env.UPLOAD_DIR || '/var/www/uploads',
    // Absolute so mobile clients can use the URL without knowing the API host.
    publicBaseUrl: `${(process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || '').replace(/\/+$/, '')}/uploads`,
  },
  redis: {
    url: readEnv('REDIS_URL'),
    enabled: !['false', '0', 'off'].includes(String(process.env.REDIS_ENABLED || 'true').trim().toLowerCase()),
    rateLimitEnabled: !['false', '0', 'off'].includes(String(process.env.REDIS_RATE_LIMIT_ENABLED || 'true').trim().toLowerCase()),
    connectTimeoutMs:
      Number.isFinite(Number(process.env.REDIS_CONNECT_TIMEOUT_MS)) && Number(process.env.REDIS_CONNECT_TIMEOUT_MS) > 0
        ? Number(process.env.REDIS_CONNECT_TIMEOUT_MS)
        : 2000,
    commandTimeoutMs:
      Number.isFinite(Number(process.env.REDIS_COMMAND_TIMEOUT_MS)) && Number(process.env.REDIS_COMMAND_TIMEOUT_MS) > 0
        ? Number(process.env.REDIS_COMMAND_TIMEOUT_MS)
        : 500,
  },
};
