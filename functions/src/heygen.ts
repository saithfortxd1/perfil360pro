import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

const db = getFirestore();

// Secret de HeyGen — se configura con: firebase functions:secrets:set HEYGEN_API_KEY
const heygenApiKey = defineSecret('HEYGEN_API_KEY');

// Límite de sesiones por usuario por hora
const MAX_SESSIONS_PER_HOUR = 5;

/**
 * Cloud Function: Genera un token de sesión de HeyGen LiveAvatar
 *
 * Seguridad:
 * - Verifica Firebase Auth (request.auth)
 * - La API key de HeyGen se mantiene en el servidor (Secret Manager)
 * - Rate limiting atómico por usuario (Firestore transaction)
 * - No expone la API key ni datos sensibles en la respuesta
 * - El frontend recibe únicamente session_token y session_id
 *
 * Flujo oficial (docs.liveavatar.com):
 * 1. POST /v1/sessions/token → obtiene session_token + session_id
 * 2. POST /v1/sessions/start (con Bearer session_token) → obtiene WebRTC credentials
 * 3. Frontend conecta a LiveKit room con las credenciales
 */
export const heygenSession = onCall(
  {
    secrets: [heygenApiKey],
    region: 'us-central1',
  },
  async (request) => {
    // 1. Verificar autenticación
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión para usar el avatar.');
    }

    const userId = request.auth.uid;

    // 2. Rate limiting atómico por usuario (Firestore transaction)
    const rateLimitRef = db.doc(`heygenRateLimits/${userId}`);
    const now = Date.now();
    const windowStart = now - 60 * 60 * 1000; // 1 hora

    let sessions: number[] = [];
    await db.runTransaction(async (transaction) => {
      const rateLimitDoc = await transaction.get(rateLimitRef);
      sessions = Array.isArray(rateLimitDoc.data()?.sessions)
        ? rateLimitDoc.data()!.sessions.filter((t: number) => t > windowStart)
        : [];

      if (sessions.length >= MAX_SESSIONS_PER_HOUR) {
        throw new HttpsError(
          'resource-exhausted',
          'Has alcanzado el límite de sesiones de avatar por hora. Intenta más tarde.'
        );
      }

      transaction.set(
        rateLimitRef,
        {
          sessions: [...sessions, now],
          lastSession: FieldValue.serverTimestamp(),
          userId,
        },
        { merge: true }
      );
    });

    // 3. Validar avatar_id (lista permitida, no arbitrario del cliente)
    const allowedAvatars = (process.env.HEYGEN_ALLOWED_AVATARS || '').split(',').filter(Boolean);
    const defaultAvatar = process.env.HEYGEN_DEFAULT_AVATAR_ID || '';
    const requestedAvatar = request.data?.avatarId || defaultAvatar;

    if (allowedAvatars.length > 0 && !allowedAvatars.includes(requestedAvatar)) {
      throw new HttpsError('invalid-argument', 'Avatar no permitido.');
    }

    if (!requestedAvatar) {
      throw new HttpsError('invalid-argument', 'No se ha configurado un avatar por defecto.');
    }

    // 4. Llamar a HeyGen API: Create Session Token
    // Endpoint oficial: POST https://api.liveavatar.com/v1/sessions/token
    // Auth: X-API-KEY header
    // Body: { mode: "LITE", avatar_id: "<uuid>", is_sandbox: true (opcional) }
    try {
      const isSandbox = process.env.HEYGEN_SANDBOX === 'true';

      const tokenResponse = await fetch('https://api.liveavatar.com/v1/sessions/token', {
        method: 'POST',
        headers: {
          'X-API-KEY': heygenApiKey.value(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'LITE',
          avatar_id: requestedAvatar,
          ...(isSandbox ? { is_sandbox: true } : {}),
        }),
      });

      if (!tokenResponse.ok) {
        console.error('[HeyGen] Token API error:', tokenResponse.status);
        throw new HttpsError('internal', 'Error al crear token de sesión de avatar.');
      }

      const tokenData = await tokenResponse.json();

      if (!tokenData.data?.session_token || !tokenData.data?.session_id) {
        console.error('[HeyGen] Invalid token response: missing session_token or session_id');
        throw new HttpsError('internal', 'Respuesta inválida del servicio de avatar.');
      }

      const sessionToken = tokenData.data.session_token;
      const sessionId = tokenData.data.session_id;

      // 5. Iniciar la sesión: POST /v1/sessions/start (con Bearer session_token)
      // Esto devuelve las credenciales de WebRTC (livekit_url, livekit_client_token)
      const startResponse = await fetch('https://api.liveavatar.com/v1/sessions/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!startResponse.ok) {
        console.error('[HeyGen] Start session API error:', startResponse.status);
        throw new HttpsError('internal', 'Error al iniciar sesión de avatar.');
      }

      const startData = await startResponse.json();

      if (!startData.data?.livekit_url || !startData.data?.livekit_client_token) {
        console.error('[HeyGen] Invalid start response: missing livekit_url or livekit_client_token');
        throw new HttpsError('internal', 'Respuesta inválida al iniciar sesión de avatar.');
      }

      // 6. Devolver solo los datos necesarios al frontend
      return {
        session_token: sessionToken,
        session_id: sessionId,
        avatar_id: requestedAvatar,
        livekit_url: startData.data.livekit_url,
        livekit_client_token: startData.data.livekit_client_token,
        max_session_duration: startData.data.max_session_duration,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('[HeyGen] Unexpected error:', error instanceof Error ? error.message : String(error));
      throw new HttpsError('internal', 'Error al crear sesión de avatar.');
    }
  }
);

/**
 * Cloud Function: Finaliza una sesión de HeyGen
 *
 * Endpoint oficial: POST https://api.liveavatar.com/v1/sessions/stop
 * Auth: X-API-KEY + HTTPBearer (session_token)
 * Body: { session_id: "<uuid>", reason: "USER_CLOSED" }
 */
export const heygenEndSession = onCall(
  {
    secrets: [heygenApiKey],
    region: 'us-central1',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const { sessionId } = request.data || {};
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpsError('invalid-argument', 'ID de sesión requerido.');
    }

    try {
      const response = await fetch('https://api.liveavatar.com/v1/sessions/stop', {
        method: 'POST',
        headers: {
          'X-API-KEY': heygenApiKey.value(),
          'Authorization': `Bearer ${request.auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          reason: 'USER_CLOSED',
        }),
      });

      if (!response.ok) {
        console.error('[HeyGen] Stop session error:', response.status);
      }

      return { success: response.ok };
    } catch (error) {
      console.error('[HeyGen] Error ending session:', error instanceof Error ? error.message : String(error));
      return { success: false };
    }
  }
);
