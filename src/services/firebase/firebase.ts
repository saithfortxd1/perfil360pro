import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';

import { AppError, ErrorCode, toAppError } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';

/**
 * Project ID de referencia del proyecto "perfil36".
 */
export const FIREBASE_PROJECT_ID: string =
  import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || 'perfil360-8c837';

export interface FirebaseEnvironment {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
  readonly appCheckSiteKey: string | null;
}

const REQUIRED_ENV_VALUES = [
  { name: 'VITE_FIREBASE_API_KEY', valueKey: 'apiKey' },
  { name: 'VITE_FIREBASE_AUTH_DOMAIN', valueKey: 'authDomain' },
  { name: 'VITE_FIREBASE_STORAGE_BUCKET', valueKey: 'storageBucket' },
  { name: 'VITE_FIREBASE_MESSAGING_SENDER_ID', valueKey: 'messagingSenderId' },
  { name: 'VITE_FIREBASE_APP_ID', valueKey: 'appId' },
] as const;

export function readFirebaseEnvironment(): Result<FirebaseEnvironment> {
  const env = import.meta.env;

  const values: Omit<FirebaseEnvironment, 'appCheckSiteKey'> = {
    apiKey: env.VITE_FIREBASE_API_KEY?.trim() ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ?? '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '',
    appId: env.VITE_FIREBASE_APP_ID?.trim() ?? '',
  };

  const missing = REQUIRED_ENV_VALUES
    .filter(({ valueKey }) => values[valueKey].length === 0)
    .map(({ name }) => name);

  if (missing.length > 0) {
    return fail(
      new AppError(
        ErrorCode.CONFIG,
        `Falta configuración pública de Firebase en esta compilación: ${missing.join(', ')}. Añade estas variables en Netlify (Environment variables, ámbito de build) y vuelve a compilar. En local, configúralas en .env.local. No añadas credenciales privadas a variables VITE_*.`,
        { details: { missing } },
      ),
    );
  }

  return ok({ ...values, appCheckSiteKey: env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim() || null });
}

export function isFirebaseConfigured(): boolean {
  return readFirebaseEnvironment().ok;
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let emulatorsConnected = false;

export function getFirebaseApp(): Result<FirebaseApp> {
  if (appInstance !== null) return ok(appInstance);

  const environment = readFirebaseEnvironment();
  if (!environment.ok) return environment;

  const { apiKey, authDomain, storageBucket, messagingSenderId, appId } = environment.value;
  const options: FirebaseOptions = {
    apiKey,
    authDomain,
    storageBucket,
    messagingSenderId,
    appId,
    projectId: FIREBASE_PROJECT_ID,
  };

  try {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(options);
    return ok(appInstance);
  } catch (error) {
    return fail(toAppError(error, ErrorCode.CONFIG));
  }
}

function shouldUseEmulators(): boolean {
  return import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
}

export function getFirebaseAuth(): Result<Auth> {
  if (authInstance !== null) return ok(authInstance);

  const app = getFirebaseApp();
  if (!app.ok) return app;

  try {
    authInstance = getAuth(app.value);
    if (shouldUseEmulators() && !emulatorsConnected) {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    return ok(authInstance);
  } catch (error) {
    return fail(toAppError(error, ErrorCode.CONFIG));
  }
}

export function getFirebaseFirestore(): Result<Firestore> {
  if (firestoreInstance !== null) return ok(firestoreInstance);

  const app = getFirebaseApp();
  if (!app.ok) return app;

  try {
    firestoreInstance = getFirestore(app.value);
    if (shouldUseEmulators() && !emulatorsConnected) {
      connectFirestoreEmulator(firestoreInstance, '127.0.0.1', 8080);
      emulatorsConnected = true;
    }
    return ok(firestoreInstance);
  } catch (error) {
    return fail(toAppError(error, ErrorCode.CONFIG));
  }
}

export function getFirebaseFunctions(region: string = 'us-central1'): Result<Functions> {
  const app = getFirebaseApp();
  if (!app.ok) return app;

  try {
    const functions = getFunctions(app.value, region);
    return ok(functions);
  } catch (error) {
    return fail(toAppError(error, ErrorCode.CONFIG));
  }
}