/**
 * Cliente de la API oficial de LiveAvatar (HeyGen).
 *
 * Endpoints verificados con docs.liveavatar.com:
 * - POST /v1/sessions/token  (auth: X-API-KEY)          → { data: { session_id, session_token } }
 * - POST /v1/sessions/start is called by the browser SDK with the session token.
 * - POST /v1/sessions/stop   (auth: X-API-KEY + Bearer)  → body { session_id, reason }
 */

import { resolveAvatarFromAllowlist } from './avatarAllowlist';

const LIVEAVATAR_API_BASE = process.env.LIVEAVATAR_API_BASE_URL || 'https://api.liveavatar.com';

export interface HeyGenSessionCredentials {
  sessionId: string;
  sessionToken: string;
}

export type HeyGenResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string; status: number; code: string } };

function apiKey(): string {
  const key = process.env.HEYGEN_API_KEY?.trim();
  if (!key) throw new Error('config-missing');
  return key;
}

/**
 * Crea un token LITE. El SDK del navegador inicia la sesión y conecta LiveKit.
 */
export async function createLiveAvatarSession(avatarId: string, isSandbox: boolean): Promise<HeyGenResult<HeyGenSessionCredentials>> {
  let key: string;
  try {
    key = apiKey();
  } catch (error) {
    return {
      ok: false,
      error: {
        message: 'La configuración del servidor está incompleta. Contacta al administrador.',
        status: 500,
        code: error instanceof Error && error.message === 'config-missing' ? 'config-missing' : 'config-invalid',
      },
    };
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(`${LIVEAVATAR_API_BASE}/v1/sessions/token`, {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'LITE',
        avatar_id: avatarId,
        ...(isSandbox ? { is_sandbox: true } : {}),
      }),
    });
  } catch {
    return {
      ok: false,
      error: {
        message: 'No se pudo conectar con el proveedor del avatar. Intenta de nuevo más tarde.',
        status: 502,
        code: 'provider-connection-failed',
      },
    };
  }

  if (!tokenResponse.ok) {
    // No registramos el cuerpo de error del proveedor: puede contener datos sensibles.
    const authorizationRejected = tokenResponse.status === 401 || tokenResponse.status === 403;
    return {
      ok: false,
      error: {
        message: authorizationRejected
          ? 'El proveedor rechazó la autorización del avatar. Revisa la configuración de la cuenta.'
          : 'El proveedor no pudo crear el token de avatar.',
        status: authorizationRejected || tokenResponse.status >= 500 ? 502 : tokenResponse.status,
        code: authorizationRejected ? 'provider-auth-rejected' : 'provider-token-rejected',
      },
    };
  }

  let tokenData: { data?: { session_id?: string; session_token?: string } };
  try {
    tokenData = (await tokenResponse.json()) as { data?: { session_id?: string; session_token?: string } };
  } catch {
    return {
      ok: false,
      error: { message: 'El proveedor devolvió una respuesta inválida.', status: 502, code: 'provider-invalid-response' },
    };
  }
  const sessionId = tokenData.data?.session_id;
  const sessionToken = tokenData.data?.session_token;

  if (!sessionId || !sessionToken) {
    return {
      ok: false,
      error: { message: 'El proveedor devolvió una respuesta inválida.', status: 502, code: 'provider-invalid-response' },
    };
  }

  return { ok: true, value: { sessionId, sessionToken } };
}

/**
 * Detiene una sesión de LiveAvatar usando el endpoint oficial.
 */
export async function stopLiveAvatarSession(sessionId: string, sessionToken?: string): Promise<HeyGenResult<void>> {
  let key: string;
  try {
    key = apiKey();
  } catch (error) {
    return {
      ok: false,
      error: {
        message: 'La configuración del servidor está incompleta. Contacta al administrador.',
        status: 500,
        code: error instanceof Error && error.message === 'config-missing' ? 'config-missing' : 'config-invalid',
      },
    };
  }

  const response = await fetch(`${LIVEAVATAR_API_BASE}/v1/sessions/stop`, {
    method: 'POST',
    headers: {
      'X-API-KEY': key,
      ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId, reason: 'USER_CLOSED' }),
  });

  if (!response.ok) {
    return {
      ok: false,
      error: { message: 'No se pudo detener la sesión de avatar.', status: response.status, code: 'provider-stop-rejected' },
    };
  }

  return { ok: true, value: undefined };
}

/**
 * Valida el avatar solicitado contra la lista permitida.
 * Si HEYGEN_ALLOWED_AVATARS no está configurada, RECHAZA (fail-closed).
 */
export function resolveAllowedAvatar(requestedAvatarId?: string) {
  return resolveAvatarFromAllowlist(requestedAvatarId, process.env.HEYGEN_ALLOWED_AVATARS);
}
