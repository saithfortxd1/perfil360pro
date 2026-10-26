import type { Config, Context } from '@netlify/functions';
import { verifyFirebaseToken } from '../lib/firebaseAdmin';
import { checkAndConsumeGeminiRateLimit } from '../lib/rateLimit';
import { synthesizeWithGemini } from '../lib/geminiTts';
import { errorResponse, jsonResponse, preflightResponse } from '../lib/http';

/**
 * POST /api/tts
 *
 * Sintetiza la pregunta de la entrevistadora con Gemini TTS.
 * Devuelve el audio en Base64; el cliente lo normaliza a PCM 24 kHz mono 16-bit
 * (`toLiveAvatarPcm24k`) antes de enviarlo a LiveAvatar para el lip-sync.
 *
 * Seguridad:
 * - Verifica el ID token de Firebase (Authorization: Bearer <idToken>).
 * - La credencial de Gemini vive SOLO aquí (nunca en el bundle).
 * - Rate limit horario de Gemini compartido con las llamadas de texto.
 * - No registra claves ni el texto del candidato.
 */
export default async function handler(request: Request, _context: Context): Promise<Response> {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') return preflightResponse(origin);
  if (request.method !== 'POST') return errorResponse('Método no permitido.', 405, origin);

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 16_384) {
    return errorResponse('La solicitud supera el tamaño permitido.', 413, origin, 'payload-too-large');
  }

  const authentication = await verifyFirebaseToken(request.headers.get('authorization'));
  if (!authentication.ok) {
    if (authentication.reason === 'configuration-error') {
      return errorResponse('La autenticación Firebase del servidor no está configurada correctamente.', 500, origin, 'configuration-error');
    }
    return errorResponse('Debes iniciar sesión para usar la voz del entrevistador.', 401, origin, 'unauthenticated');
  }
  const uid = authentication.uid;

  let text: string | undefined;
  let interviewerId: 'james' | 'olivia' | 'mateo' | undefined;

  const rawBody = await request.text();
  if (!rawBody || new TextEncoder().encode(rawBody).byteLength > 16_384) {
    if (rawBody) return errorResponse('La solicitud supera el tamaño permitido.', 413, origin, 'payload-too-large');
    return errorResponse('Falta el texto a sintetizar.', 400, origin, 'invalid-argument');
  }

  try {
    const parsed = JSON.parse(rawBody) as { text?: unknown; interviewerId?: unknown };
    if (typeof parsed.text === 'string') text = parsed.text;
    if (
      parsed.interviewerId === 'james' ||
      parsed.interviewerId === 'olivia' ||
      parsed.interviewerId === 'mateo'
    ) {
      interviewerId = parsed.interviewerId;
    }
  } catch {
    return errorResponse('Cuerpo de la solicitud inválido.', 400, origin, 'invalid-argument');
  }

  if (!text || text.trim().length === 0) {
    return errorResponse('Falta el texto a sintetizar.', 400, origin, 'invalid-argument');
  }
  if (!interviewerId) {
    return errorResponse('Selecciona un perfil de entrevistador válido.', 400, origin, 'invalid-argument');
  }

  // Comparte el límite horario de Gemini con las llamadas de texto.
  try {
    const rateLimit = await checkAndConsumeGeminiRateLimit(uid);
    if (!rateLimit.ok) {
      return errorResponse(rateLimit.message ?? 'Límite alcanzado.', 429, origin, 'resource-exhausted');
    }
  } catch (error) {
    console.error('[tts] error de rate limit:', error instanceof Error ? error.message : 'unknown');
    return errorResponse('No se pudo verificar el límite de uso.', 500, origin, 'internal');
  }

  const voice = interviewerId === 'james'
    ? process.env.GEMINI_TTS_VOICE_JAMES?.trim() || 'Kore'
    : interviewerId === 'olivia'
      ? process.env.GEMINI_TTS_VOICE_OLIVIA?.trim() || 'Aoede'
      : process.env.GEMINI_TTS_VOICE_MATEO?.trim() || 'Puck';
  const result = await synthesizeWithGemini(text, voice);

  if (!result.ok) {
    // Traducimos el estado del proveedor a uno adecuado para el cliente.
    const status = result.error.code === 'server-config-missing'
      ? 500
      : result.error.status === 429 ? 429 : result.error.status >= 500 ? 502 : result.error.status;
    return errorResponse(result.error.message, status, origin, result.error.code ?? 'tts-error');
  }

  return jsonResponse(
    {
      ok: true,
      audio: {
        base64: result.value.audioBase64,
        mimeType: result.value.mimeType,
      },
    },
    200,
    origin,
  );
}

export const config: Config = {
  path: '/api/tts',
};