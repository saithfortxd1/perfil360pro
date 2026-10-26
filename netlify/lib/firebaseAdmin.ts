import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Inicialización de Firebase Admin para Netlify Functions.
 *
 * Requiere la variable de entorno FIREBASE_SERVICE_ACCOUNT (JSON del service account).
 * Nunca se expone al cliente: solo se usa en el servidor.
 */

let cachedApp: App | null = null;

export function getAdminApp(): App {
  if (cachedApp !== null) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApps()[0]!;
    return cachedApp;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurado en el entorno del servidor');
  }

  let serviceAccount: Record<string, string>;
  try {
    serviceAccount = JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no es un JSON válido');
  }

  // Las claves privadas en variables de entorno suelen traer \n escapados
  if (typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  cachedApp = initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
    projectId: process.env.FIREBASE_PROJECT_ID || 'perfil360-8c837',
  });

  return cachedApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

/**
 * Verifica el ID token de Firebase enviado en el header Authorization.
 * Devuelve el uid si es válido, o null si no lo es.
 */
export async function verifyFirebaseToken(authorizationHeader: string | null): Promise<string | null> {
  if (!authorizationHeader) return null;

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]!);
    return decoded.uid;
  } catch {
    return null;
  }
}
