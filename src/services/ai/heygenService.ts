import { getFirebaseIdToken } from '@/services/firebase/idToken';

/**
 * Servicio de integración con HeyGen LiveAvatar (modo LITE).
 *
 * ARQUITECTURA (Netlify):
 * - El frontend llama a Netlify Functions (/api/heygen/*) con el ID token de Firebase.
 * - Las Functions verifican el token con Firebase Admin, aplican rate limit y validan el avatar.
 * - La API key de LiveAvatar vive SOLO en el servidor (variable de entorno de Netlify).
 * - El frontend recibe solo el session_token temporal; el SDK obtiene las credenciales de la sala.
 *
 * MODOS DE LIVEAVATAR (docs.liveavatar.com):
 * - FULL: HeyGen gestiona STT/LLM/TTS. NO lo usamos (perdemos la lógica de Gemini).
 * - LITE: nosotros controlamos LLM/TTS; LiveAvatar renderiza el video con lip-sync. ← ELEGIDO
 */

export interface HeyGenConfig {
  enabled: boolean;
}

export interface HeyGenSessionData {
  sessionId: string;
  sessionToken: string;
  avatarId: string;
}

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string; code: string; retryable: boolean } };

/**
 * Lee la configuración pública de HeyGen (solo variables VITE_).
 */
export function readHeyGenConfig(): HeyGenConfig {
  return {
    enabled: import.meta.env.VITE_HEYGEN_ENABLED === 'true',
  };
}

/**
 * HeyGen está disponible si el frontend lo habilita Y hay un backend configurado.
 */
export function isHeyGenAvailable(): boolean {
  return readHeyGenConfig().enabled;
}

/**
 * Solicita una nueva sesión de LiveAvatar al backend seguro de Netlify.
 */
export async function requestHeyGenSession(
  _userId: string,
  avatarId: string,
  signal?: AbortSignal,
): Promise<Result<HeyGenSessionData>> {
  const config = readHeyGenConfig();

  if (!config.enabled) {
    return {
      ok: false,
      error: {
        message: 'HeyGen no está habilitado. Define VITE_HEYGEN_ENABLED=true en .env.local',
        code: 'HEYGEN_DISABLED',
        retryable: false,
      },
    };
  }

  if (!avatarId.trim()) {
    return {
      ok: false,
      error: { message: 'Selecciona un avatar LiveAvatar antes de iniciar.', code: 'invalid-avatar', retryable: false },
    };
  }

  try {
    const idToken = await getFirebaseIdToken();
    if (!idToken) {
      return {
        ok: false,
        error: { message: 'Debes iniciar sesión para iniciar el avatar.', code: 'unauthenticated', retryable: false },
      };
    }

    const response = await fetch('/api/heygen/session', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatarId }),
      signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok: true; session?: Partial<HeyGenSessionData> | null }
      | { ok: false; error: { message: string; code?: string } }
      | null;

    if (!response.ok || !payload || payload.ok !== true) {
      const message = payload && 'error' in payload ? payload.error.message : `Error del servidor (${response.status}).`;
      const code = payload && 'error' in payload ? payload.error.code ?? 'server-error' : 'server-error';
      return { ok: false, error: { message, code, retryable: response.status >= 500 || response.status === 429 } };
    }

    const returnedSession = payload.session;
    if (
      !returnedSession ||
      typeof returnedSession.sessionToken !== 'string' ||
      !returnedSession.sessionToken.trim() ||
      typeof returnedSession.sessionId !== 'string' ||
      !returnedSession.sessionId.trim() ||
      typeof returnedSession.avatarId !== 'string'
    ) {
      return {
        ok: false,
        error: { message: 'Respuesta inválida del backend de avatar.', code: 'invalid-response', retryable: true },
      };
    }

    if (returnedSession.avatarId.trim().toLowerCase() !== avatarId.trim().toLowerCase()) {
      return {
        ok: false,
        error: {
          message: 'El backend devolvió un avatar diferente al seleccionado. La sesión no se iniciará.',
          code: 'invalid-response',
          retryable: false,
        },
      };
    }

    return {
      ok: true,
      value: {
        sessionId: returnedSession.sessionId,
        sessionToken: returnedSession.sessionToken,
        avatarId: returnedSession.avatarId,
      },
    };
  } catch (error) {
    console.error('[HeyGenService] requestHeyGenSession failed:', error instanceof Error ? error.message : 'unknown');
    return {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : 'Error de red al solicitar la sesión de avatar.',
        code: 'network-error',
        retryable: true,
      },
    };
  }
}

/**
 * Finaliza la sesión de LiveAvatar en el backend.
 */
export async function endHeyGenSession(sessionId: string, sessionToken?: string): Promise<Result<void>> {
  const idToken = await getFirebaseIdToken();
  if (!idToken) {
    // Sin sesión de Firebase no hay nada que cerrar en el servidor.
    return { ok: true, value: undefined };
  }

  try {
    await fetch('/api/heygen/end', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, sessionToken }),
    });
    return { ok: true, value: undefined };
  } catch (error) {
    console.error('[HeyGenService] endHeyGenSession failed:', error instanceof Error ? error.message : 'unknown');
    // Best-effort: no bloqueamos la limpieza local
    return { ok: true, value: undefined };
  }
}

/** Hook de conveniencia (no introduce estado; solo agrupa las funciones). */
export function useHeyGen() {
  return { readHeyGenConfig, isHeyGenAvailable, requestHeyGenSession, endHeyGenSession };
}
