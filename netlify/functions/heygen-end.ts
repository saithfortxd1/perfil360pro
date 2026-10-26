import type { Config, Context } from '@netlify/functions';
import { verifyFirebaseToken } from '../lib/firebaseAdmin';
import { stopLiveAvatarSession } from '../lib/liveAvatarApi';
import { errorResponse, jsonResponse, preflightResponse } from '../lib/http';

/**
 * POST /api/heygen/end
 *
 * Finaliza la sesión de LiveAvatar del usuario autenticado.
 * Best-effort: si el proveedor falla, devolvemos ok para no bloquear la limpieza local.
 */
export default async function handler(request: Request, _context: Context): Promise<Response> {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return preflightResponse(origin);
  }

  if (request.method !== 'POST') {
    return errorResponse('Método no permitido.', 405, origin);
  }

  const uid = await verifyFirebaseToken(request.headers.get('authorization'));
  if (!uid) {
    return errorResponse('Debes iniciar sesión.', 401, origin, 'unauthenticated');
  }

  let sessionId: string | undefined;
  let sessionToken: string | undefined;

  const rawBody = await request.text();
  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as { sessionId?: unknown; sessionToken?: unknown };
      if (typeof parsed.sessionId === 'string') sessionId = parsed.sessionId;
      if (typeof parsed.sessionToken === 'string') sessionToken = parsed.sessionToken;
    } catch {
      return errorResponse('Cuerpo de la solicitud inválido.', 400, origin, 'invalid-argument');
    }
  }

  if (!sessionId) {
    return errorResponse('Se requiere sessionId.', 400, origin, 'invalid-argument');
  }

  try {
    const result = await stopLiveAvatarSession(sessionId, sessionToken);
    if (!result.ok) {
      console.error('[heygen-end] provider error:', result.error.status);
    }
    // Best-effort: siempre respondemos ok para permitir la limpieza local
    return jsonResponse({ ok: true }, 200, origin);
  } catch (error) {
    console.error('[heygen-end] unexpected error:', error instanceof Error ? error.message : 'unknown');
    return jsonResponse({ ok: true }, 200, origin);
  }
}

export const config: Config = {
  path: '/api/heygen/end',
};
