/**
 * Gemini TTS via the Gemini Developer API Interactions endpoint.
 * The request and response formats intentionally follow the REST schema,
 * rather than the older generateContent audio format.
 */

export type TtsOutcome =
  | { ok: true; value: { audioBase64: string; mimeType: string } }
  | { ok: false; error: { message: string; status: number; code?: string } };

const GEMINI_API_BASE = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
const MAX_TEXT_LENGTH = 1200;
const DEFAULT_MODEL = process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-3.8-flash-lite-tts';
const DEFAULT_VOICE = process.env.GEMINI_TTS_VOICE?.trim() || 'Kore';

interface InteractionAudio {
  type?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
}

interface InteractionStep {
  type?: string;
  content?: InteractionAudio[];
}

interface InteractionResponse {
  steps?: InteractionStep[];
  error?: { message?: string };
}

export async function synthesizeWithGemini(text: string, voice?: string): Promise<TtsOutcome> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) {
    return { ok: false, error: { message: 'El texto está vacío.', status: 400 } };
  }
  if (clean.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: { message: `El texto supera ${MAX_TEXT_LENGTH} caracteres.`, status: 413 } };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'PEGA_TU_CLAVE_AQUI') {
    return {
      ok: false,
      error: {
        message: 'Falta GEMINI_API_KEY en el servidor.',
        status: 500,
        code: 'server-config-missing',
      },
    };
  }

  let response: Response;
  try {
    response = await fetch(`${GEMINI_API_BASE}/v1beta/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [{
          type: 'user_input',
          content: [{
            type: 'text',
            text: clean,
            annotations: [{ type: 'speech_metadata', style: 'clear and conversational' }],
          }],
        }],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [{ voice: voice?.trim() || DEFAULT_VOICE }],
        },
      }),
    });
  } catch (error) {
    console.error('[gemini-tts] fallo de red:', error instanceof Error ? error.message : 'unknown');
    return { ok: false, error: { message: 'No se pudo contactar con el servicio de voz.', status: 502 } };
  }

  if (!response.ok) {
    console.error('[gemini-tts] el proveedor respondió', response.status);
    const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
    const message = response.status === 429
      ? 'Límite de uso del servicio de voz alcanzado. Reintenta más tarde.'
      : 'El servicio de voz rechazó la solicitud.';
    return { ok: false, error: { message, status } };
  }

  let payload: InteractionResponse;
  try {
    payload = (await response.json()) as InteractionResponse;
  } catch {
    return { ok: false, error: { message: 'Respuesta ilegible del servicio de voz.', status: 502 } };
  }

  const audioBlocks = (payload.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((item) => item.type === 'audio' && typeof item.data === 'string' && item.data.length > 0);
  const audio = audioBlocks.at(-1);

  if (!audio?.data || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio.data)) {
    console.error('[gemini-tts] respuesta sin un bloque de audio válido');
    return { ok: false, error: { message: 'El servicio de voz no devolvió audio válido.', status: 502 } };
  }

  return {
    ok: true,
    value: { audioBase64: audio.data, mimeType: audio.mime_type ?? audio.mimeType ?? '' },
  };
}
