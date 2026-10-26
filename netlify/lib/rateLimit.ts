import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from './firebaseAdmin';

/**
 * Rate limiting atómico por usuario usando la colección heygenRateLimits.
 * Se ejecuta dentro de una transacción de Firestore para evitar condiciones de carrera
 * entre solicitudes concurrentes del mismo usuario.
 */

const MAX_SESSIONS_PER_WINDOW = Number(process.env.HEYGEN_MAX_SESSIONS_PER_HOUR || '5');
const WINDOW_MS = 60 * 60 * 1000; // 1 hora

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  message?: string;
}

export async function checkAndConsumeRateLimit(userId: string): Promise<RateLimitResult> {
  const db = getAdminDb();
  const ref = db.doc(`heygenRateLimits/${userId}`);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  let remaining = 0;
  let exceeded = false;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const rawSessions = snapshot.data()?.sessions;
    const activeSessions: number[] = Array.isArray(rawSessions)
      ? rawSessions.filter((timestamp): timestamp is number => typeof timestamp === 'number' && timestamp > windowStart)
      : [];

    if (activeSessions.length >= MAX_SESSIONS_PER_WINDOW) {
      exceeded = true;
      remaining = 0;
      return;
    }

    remaining = Math.max(0, MAX_SESSIONS_PER_WINDOW - (activeSessions.length + 1));

    transaction.set(
      ref,
      {
        sessions: [...activeSessions, now],
        userId,
        lastSessionAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(now + WINDOW_MS),
      },
      { merge: true },
    );
  });

  if (exceeded) {
    return {
      ok: false,
      remaining: 0,
      message: 'Has alcanzado el límite de sesiones de avatar por hora. Intenta de nuevo más tarde.',
    };
  }

  return { ok: true, remaining };
}

const GEMINI_MAX_REQUESTS_PER_HOUR = Number(process.env.GEMINI_MAX_REQUESTS_PER_HOUR || '60');

/** Rate limit independiente para las llamadas de texto; no consume cupos de sesiones HeyGen. */
export async function checkAndConsumeGeminiRateLimit(userId: string): Promise<RateLimitResult> {
  const db = getAdminDb();
  const ref = db.doc(`geminiRateLimits/${userId}`);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const maxRequests = Number.isInteger(GEMINI_MAX_REQUESTS_PER_HOUR) && GEMINI_MAX_REQUESTS_PER_HOUR > 0
    ? GEMINI_MAX_REQUESTS_PER_HOUR
    : 60;

  let remaining = 0;
  let exceeded = false;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const rawRequests = snapshot.data()?.requests;
    const activeRequests: number[] = Array.isArray(rawRequests)
      ? rawRequests.filter((timestamp): timestamp is number => typeof timestamp === 'number' && timestamp > windowStart)
      : [];

    if (activeRequests.length >= maxRequests) {
      exceeded = true;
      remaining = 0;
      return;
    }

    remaining = Math.max(0, maxRequests - (activeRequests.length + 1));
    transaction.set(
      ref,
      {
        requests: [...activeRequests, now],
        userId,
        lastRequestAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(now + WINDOW_MS),
      },
      { merge: true },
    );
  });

  return exceeded
    ? { ok: false, remaining: 0, message: 'Has alcanzado el límite de solicitudes de IA por hora. Intenta de nuevo más tarde.' }
    : { ok: true, remaining };
}
