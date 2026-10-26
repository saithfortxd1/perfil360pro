import { getFirebaseIdToken } from '@/services/firebase/idToken';
import { extractWavPcm, toLiveAvatarPcm24k } from '@/services/ai/pcmAudio';
import type { InterviewerId } from '@/services/ai/interviewers';

/**
 * Voz de la entrevistadora con Gemini TTS + lip-sync en LiveAvatar.
 *
 * FLUJO:
 *   texto de Gemini → Netlify Function `/api/tts` (clave secreta en servidor)
 *   → audio (WAV o PCM) → normalización a PCM 16-bit 24 kHz mono
 *   → `LiveAvatarSession.repeatAudio()` → avatar habla con labios sincronizados.
 *
 * La credencial de Gemini NUNCA llega al navegador: solo se recibe el audio ya generado.
 */

export interface InterviewerSpeech {
  /** PCM 16-bit, 24 kHz, mono, Base64: el único formato que acepta `repeatAudio()`. */
  pcm24kBase64: string;
  durationMs: number;
}

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string; code: string; retryable: boolean } };

/** Solo es `true` cuando el operador habilitó el TTS del entrevistador. */
export function isInterviewerTtsEnabled(): boolean {
  return import.meta.env.VITE_INTERVIEWER_TTS_ENABLED === 'true';
}

/**
 * Sintetiza el texto de la entrevistadora y lo deja listo para LiveAvatar.
 * Devuelve PCM 24 kHz mono 16-bit en Base64 (WAV ya recortado si el proveedor lo envió con cabecera).
 */
export async function synthesizeInterviewerSpeech(
  text: string,
  interviewerId: InterviewerId,
  signal?: AbortSignal,
): Promise<Result<InterviewerSpeech>> {
  if (!isInterviewerTtsEnabled()) {
    return {
      ok: false,
      error: { message: 'El TTS del entrevistador no está habilitado.', code: 'tts-disabled', retryable: false },
    };
  }

  let idToken: string | null;
  try {
    idToken = await getFirebaseIdToken();
  } catch {
    return {
      ok: false,
      error: { message: 'No se pudo verificar tu sesión para usar la voz.', code: 'unauthenticated', retryable: false },
    };
  }
  if (!idToken) {
    return {
      ok: false,
      error: { message: 'Inicia sesión para usar la voz del entrevistador.', code: 'unauthenticated', retryable: false },
    };
  }

  let response: Response;
  try {
    response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, interviewerId }),
      signal,
    });
  } catch {
    return {
      ok: false,
      error: { message: 'No se pudo contactar con el servicio de voz.', code: 'network-error', retryable: true },
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok: true; audio?: { base64?: string; mimeType?: string } }
    | { ok: false; error?: { message?: string; code?: string } }
    | null;

  if (!response.ok || !payload || payload.ok !== true) {
    const message =
      payload && 'error' in payload && payload.error?.message
        ? payload.error.message
        : `Error del servicio de voz (${response.status}).`;
    const code = payload && 'error' in payload ? payload.error?.code ?? 'server-error' : 'server-error';
    return { ok: false, error: { message, code, retryable: response.status >= 500 || response.status === 429 } };
  }

  const audioBase64 = payload.audio?.base64;
  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
    return {
      ok: false,
      error: { message: 'El servicio de voz devolvió audio vacío.', code: 'invalid-response', retryable: true },
    };
  }

  const mimeType = payload.audio?.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  if (mimeType !== 'audio/wav' && mimeType !== 'audio/x-wav') {
    return {
      ok: false,
      error: {
        message: `Gemini devolvió un tipo de audio no admitido (${mimeType || 'sin tipo MIME'}); se esperaba WAV.`,
        code: 'unexpected-audio-format',
        retryable: false,
      },
    };
  }
  if (!extractWavPcm(audioBase64)) {
    return {
      ok: false,
      error: {
        message: 'Gemini indicó WAV, pero el contenido no tiene una cabecera WAV PCM válida.',
        code: 'audio-format',
        retryable: false,
      },
    };
  }

  // Gemini documenta WAV para esta ruta; convertir solamente tras validar tipo y cabecera.
  const normalized = toLiveAvatarPcm24k(audioBase64);
  if (!normalized.ok || !normalized.pcmBase64) {
    return {
      ok: false,
      error: {
        message: normalized.reason ?? 'El audio no tiene el formato requerido por el avatar.',
        code: 'audio-format',
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    value: { pcm24kBase64: normalized.pcmBase64, durationMs: normalized.durationMs ?? 0 },
  };
}