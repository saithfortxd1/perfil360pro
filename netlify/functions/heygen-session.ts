import type { Config, Context } from '@netlify/functions';
import { verifyFirebaseToken } from '../lib/firebaseAdmin';
import { checkAndConsumeRateLimit } from '../lib/rateLimit';
import { createLiveAvatarSession, resolveAllowedAvatar } from '../lib/liveAvatarApi';
import { errorResponse, jsonResponse, preflightResponse } from '../lib/http';

/**
 * POST /api/heygen/session
 *
 * Crea una sesión de LiveAvatar para el usuario autenticado.
 *
 * Seguridad:
 * - Verifica el ID token de Firebase (Authorization: Bearer <idToken>).
 * - Rechaza si HEYGEN_ALLOWED_AVATARS no está configurada (fail-closed).
 * - Rate limit atómico por usuario (Firestore transaction).
 * - La API key de LiveAvatar solo vive en el servidor.
 */
export default async function handler(request: Request, _context: Context): Promise<Response> {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return preflightResponse(origin);
  }

  if (request.method !== 'POST') {
    return errorResponse('Método no permitido.', 405, origin);
  }

  // 1. Autenticación
  const uid = await verifyFirebaseToken(request.headers.get('authorization'));
  if (!uid) {
    return errorResponse('Debes iniciar sesión para usar el avatar.', 401, origin, 'unauthenticated');
  }

  // 2. Entrada válida (JSON con avatarId explícito)
  let avatarId: string | undefined;
  const rawBody = await request.text();
  if (rawBody.length > 2_048) {
    return errorResponse('Cuerpo de la solicitud demasiado grande.', 413, origin, 'payload-too-large');
  }
  if (rawBody) {
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (typeof parsed === 'object' && parsed !== null && 'avatarId' in parsed && typeof parsed.avatarId === 'string') {
        avatarId = parsed.avatarId;
      }
    } catch {
      return errorResponse('Cuerpo de la solicitud inválido.', 400, origin, 'invalid-argument');
    }
  }

  // 3. Validar avatar (fail-closed si no hay lista permitida)
  if (!avatarId?.trim()) {
    return errorResponse('Se requiere el ID del avatar seleccionado.', 400, origin, 'invalid-avatar');
  }

  const avatarResolution = resolveAllowedAvatar(avatarId);
  if (!avatarResolution.ok) {
    const status = avatarResolution.code === 'config-missing' || avatarResolution.code === 'config-invalid'
      ? 500
      : avatarResolution.code === 'avatar-not-allowed' ? 403 : 400;
    return errorResponse(avatarResolution.message, status, origin, avatarResolution.code);
  }

  // 4. Rate limiting atómico
  try {
    const rateLimit = await checkAndConsumeRateLimit(uid);
    if (!rateLimit.ok) {
      return errorResponse(rateLimit.message ?? 'Límite alcanzado.', 429, origin, 'resource-exhausted');
    }
  } catch (error) {
    console.error('[heygen-session] rate limit error:', error instanceof Error ? error.message : 'unknown');
    return errorResponse('No se pudo verificar el límite de uso.', 500, origin, 'internal');
  }

  // 5. Crear sesión en LiveAvatar
  const isSandbox = process.env.HEYGEN_SANDBOX === 'true';

  try {
    const created = await createLiveAvatarSession(avatarResolution.avatarId, isSandbox);

    if (!created.ok) {
      console.error('[heygen-session] provider error:', created.error.status);
      return errorResponse(created.error.message, created.error.status, origin, created.error.code);
    }

    // 6. Devolver solo lo necesario para el SDK del navegador
    return jsonResponse(
      {
        ok: true,
        session: {
          sessionId: created.value.sessionId,
          sessionToken: created.value.sessionToken,
          avatarId: avatarResolution.avatarId,
        },
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('[heygen-session] unexpected error:', error instanceof Error ? error.message : 'unknown');
    return errorResponse('Error al crear la sesión de avatar.', 500, origin, 'internal');
  }
}

export const config: Config = {
  path: '/api/heygen/session',
};
