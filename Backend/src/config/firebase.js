import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { env } from './env.js';

let firebaseDatabase = null;
let firebaseMessaging = null;
let firebaseInitAttempted = false;
let lastInitError = '';

const parseServiceAccountJson = (rawJson) => {
  if (!rawJson) {
    return null;
  }

  const parsed = JSON.parse(rawJson);

  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  return parsed;
};

const readServiceAccount = () => {
  if (env.firebase.serviceAccountJson) {
    try {
      return parseServiceAccountJson(env.firebase.serviceAccountJson);
    } catch (error) {
      console.error('Firebase service account JSON parsing failed:', error.message);
      return null;
    }
  }

  if (!env.firebase.serviceAccountPath) {
    return null;
  }

  const credentialPath = path.isAbsolute(env.firebase.serviceAccountPath)
    ? env.firebase.serviceAccountPath
    : path.resolve(process.cwd(), env.firebase.serviceAccountPath);

  if (!fs.existsSync(credentialPath)) {
    console.warn(`Firebase service account file not found at ${credentialPath}. Falling back to env configuration if available.`);
    return null;
  }

  try {
    return parseServiceAccountJson(fs.readFileSync(credentialPath, 'utf8'));
  } catch (error) {
    console.error('Firebase service account file read failed:', error.message);
    return null;
  }
};

const getFirebaseApp = () => {
  if (admin.apps.length > 0) {
    return admin.apps[0];
  }

  const serviceAccount = readServiceAccount();
  if (!serviceAccount && !env.firebase.databaseURL) {
    return null;
  }

  try {
    return admin.initializeApp({
      ...(serviceAccount ? { credential: admin.credential.cert(serviceAccount) } : {}),
      ...(env.firebase.databaseURL ? { databaseURL: env.firebase.databaseURL } : {}),
    });
  } catch (error) {
    lastInitError = error.message;
    console.error('Firebase admin initialization failed:', error.message);
    return null;
  }
};

/**
 * Why push notifications can or cannot be sent, without exposing any secret.
 * `configured` is true only when a usable service account (or application default credential) is present:
 * a database URL alone is not enough to send FCM messages.
 */
export const getFirebaseStatus = () => {
  let serviceAccount = null;
  let problem = '';

  try {
    serviceAccount = readServiceAccount();
  } catch (error) {
    problem = error.message;
  }

  const hasServiceAccount = Boolean(serviceAccount?.private_key && serviceAccount?.client_email);
  // A key that is present but cannot be turned into a Firebase app (bad private key, wrong JSON) is also "off".
  const canMessage = hasServiceAccount && Boolean(getFirebaseMessaging());

  if (hasServiceAccount && !canMessage && !problem) {
    problem = `Firebase could not start with the configured service account: ${lastInitError || 'unknown error'}. Check that FIREBASE_SERVICE_ACCOUNT_JSON is the complete, unmodified JSON key.`;
  }

  if (!hasServiceAccount && !problem) {
    problem = env.firebase.serviceAccountJson || env.firebase.serviceAccountPath
      ? 'The Firebase service account was found but is missing private_key / client_email, or could not be read.'
      : 'No Firebase service account is configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (the whole service-account JSON) or FIREBASE_SERVICE_ACCOUNT_PATH in the server .env, then restart with --update-env.';
  }

  return {
    configured: canMessage,
    projectId: serviceAccount?.project_id || '',
    clientEmail: serviceAccount?.client_email || '',
    hasDatabaseUrl: Boolean(env.firebase.databaseURL),
    reason: canMessage ? '' : problem,
  };
};

export const getFirebaseDatabase = () => {
  if (firebaseDatabase || firebaseInitAttempted) {
    return firebaseDatabase;
  }

  firebaseInitAttempted = true;

  if (!env.firebase.databaseURL) {
    return null;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  try {
    firebaseDatabase = admin.database(app);
    return firebaseDatabase;
  } catch (error) {
    console.error('Firebase database initialization failed:', error.message);
    return null;
  }
};

// Tests only: replace the messaging client with a fake that records what would be sent.
let messagingOverride = null;
export const setFirebaseMessagingForTests = (fake) => {
  messagingOverride = fake || null;
};

export const getFirebaseMessaging = () => {
  if (messagingOverride) {
    return messagingOverride;
  }

  if (firebaseMessaging) {
    return firebaseMessaging;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  try {
    firebaseMessaging = admin.messaging(app);
    return firebaseMessaging;
  } catch (error) {
    console.error('Firebase messaging initialization failed:', error.message);
    return null;
  }
};

export const firebaseServerTimestamp = () => admin.database.ServerValue.TIMESTAMP;
