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

export type FirebaseTokenVerification =
  | { ok: true; uid: string }
  | { ok: false; reason: 'unauthenticated' | 'configuration-error'; code?: string };

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

  const configuredProjectId = process.env.FIREBASE_PROJECT_ID?.trim() || 'perfil360-8c837';
  if (
    typeof serviceAccount.project_id !== 'string' ||
    serviceAccount.project_id.trim() !== configuredProjectId
  ) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no corresponde al FIREBASE_PROJECT_ID configurado');
  }

  // Las claves privadas en variables de entorno suelen traer \n escapados
  if (typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  cachedApp = initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || 'perfil360-8c837',
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
 * Distingue una sesión inválida de un error de configuración del servidor.
 */
export async function verifyFirebaseToken(
  authorizationHeader: string | null,
): Promise<FirebaseTokenVerification> {
  if (!authorizationHeader) return { ok: false, reason: 'unauthenticated' };

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return { ok: false, reason: 'unauthenticated' };

  let auth: Auth;
  try {
    auth = getAdminAuth();
  } catch {
    console.error('[firebase-admin] configuración de autenticación del servidor inválida.');
    return { ok: false, reason: 'configuration-error' };
  }

  try {
    const decoded = await auth.verifyIdToken(match[1]!);
    return { ok: true, uid: decoded.uid };
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'unknown';
    console.error('[firebase-admin] verificación de ID token fallida:', code);
    return { ok: false, reason: 'unauthenticated', code };
  }
}
