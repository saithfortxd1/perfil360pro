import type { Config, Context } from '@netlify/functions';
import { verifyFirebaseToken } from '../lib/firebaseAdmin';
import { checkAndConsumeGeminiRateLimit } from '../lib/rateLimit';
import { errorResponse, jsonResponse, preflightResponse } from '../lib/http';

type GeminiContent = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

const MAX_BODY_BYTES = 512_000;
const MAX_CONTENT_ITEMS = 101;
const MAX_TOTAL_TEXT_LENGTH = 100_000;
const PRIMARY_MODEL = process.env.GEMINI_TEXT_MODEL?.trim() || 'gemini-3.5-flash';
const FALLBACK_MODEL = process.env.GEMINI_TEXT_FALLBACK_MODEL?.trim() || 'gemini-3.5-flash-lite';
const API_BASE = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');

function parseContents(payload: unknown): GeminiContent[] | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const body = payload as { prompt?: unknown; contents?: unknown };

  if (typeof body.prompt === 'string') {
    const prompt = body.prompt.trim();
    if (!prompt || prompt.length > MAX_TOTAL_TEXT_LENGTH || body.contents !== undefined) return null;
    return [{ role: 'user', parts: [{ text: prompt }] }];
  }

  if (!Array.isArray(body.contents) || body.contents.length === 0 || body.contents.length > MAX_CONTENT_ITEMS) return null;

  let totalLength = 0;
  const contents: GeminiContent[] = [];
  for (const item of body.contents) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const candidate = item as { role?: unknown; parts?: unknown };
    if ((candidate.role !== 'user' && candidate.role !== 'model') || !Array.isArray(candidate.parts) || candidate.parts.length !== 1) return null;
    const part = candidate.parts[0] as { text?: unknown } | null;
    if (!part || typeof part.text !== 'string' || !part.text.trim()) return null;
    totalLength += part.text.length;
    if (totalLength > MAX_TOTAL_TEXT_LENGTH) return null;
    contents.push({ role: candidate.role, parts: [{ text: part.text }] });
  }
  return contents;
}

async function requestModel(apiKey: string, model: string, contents: GeminiContent[]): Promise<Response> {
  return fetch(`${API_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.55,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 420,
      },
    }),
  });
}

function extractText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) => part && typeof part === 'object' ? (part as { text?: unknown }).text : undefined)
    .filter((part): part is string => typeof part === 'string')
    .join('');
  return text.trim() || null;
}

function parseRetryDelaySeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value !== 'string') return null;
  const match = /^(\d+(?:\.\d+)?)s$/i.exec(value.trim());
  if (!match) return null;
  return Math.round(Number(match[1]));
}

function classifyProviderFailure(status: number, payload: unknown): {
  status: number;
  code: string;
  message: string;
  retryAfterSeconds: number | null;
} {
  const error = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : null;
  const details = error && typeof error === 'object' ? (error as { details?: unknown }).details : null;
  const providerStatus = error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'string'
    ? (error as { status: string }).status
    : '';
  const serialized = typeof details === 'object' && details !== null ? JSON.stringify(details).toLowerCase() : '';
  const dailyQuota = serialized.includes('free_tier') || serialized.includes('perday') || serialized.includes('per_day');
  let retryAfterSeconds: number | null = null;
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (!detail || typeof detail !== 'object') continue;
      const retryDelay = (detail as { retryDelay?: unknown }).retryDelay;
      const parsed = parseRetryDelaySeconds(retryDelay);
      if (parsed !== null) retryAfterSeconds = parsed;
    }
  }

  if (status === 429 || providerStatus === 'RESOURCE_EXHAUSTED') {
    return {
      status: 429,
      code: 'resource-exhausted',
      retryAfterSeconds,
      message: dailyQuota
        ? 'Se agotó la cuota diaria del servicio de IA. No reintentes de inmediato; revisa el uso del proyecto o espera al restablecimiento.'
        : retryAfterSeconds
          ? `El servicio de IA está saturado. Espera ${retryAfterSeconds} segundos antes de reintentar.`
          : 'Se alcanzó el límite de uso del servicio de IA. Espera un momento antes de reintentar.',
    };
  }

  return {
    status: status >= 500 ? 502 : 400,
    code: 'gemini-error',
    retryAfterSeconds: null,
    message: 'El servicio de IA rechazó la solicitud.',
  };
}

export default async function handler(request: Request, _context: Context): Promise<Response> {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return preflightResponse(origin);
  if (request.method !== 'POST') return errorResponse('Método no permitido.', 405, origin);

  const authentication = await verifyFirebaseToken(request.headers.get('authorization'));
  if (!authentication.ok) {
    if (authentication.reason === 'configuration-error') {
      return errorResponse('La autenticación Firebase del servidor no está configurada correctamente.', 500, origin, 'configuration-error');
    }
    const safeCode = authentication.code ? `unauthenticated:${authentication.code}` : 'unauthenticated';
    return errorResponse('Debes iniciar sesión para usar la inteligencia artificial.', 401, origin, safeCode);
  }
  const uid = authentication.uid;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'PEGA_TU_CLAVE_AQUI') {
    return errorResponse('El servicio de IA no está configurado en el servidor.', 500, origin, 'configuration-error');
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse('La solicitud supera el tamaño permitido.', 413, origin, 'payload-too-large');
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return errorResponse('No se pudo leer la solicitud.', 400, origin, 'invalid-argument');
  }
  if (!bodyText || new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return errorResponse('La solicitud está vacía o supera el tamaño permitido.', bodyText ? 413 : 400, origin, 'invalid-argument');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return errorResponse('Cuerpo de la solicitud inválido.', 400, origin, 'invalid-argument');
  }
  const contents = parseContents(payload);
  if (!contents) {
    return errorResponse(`La solicitud debe contener texto válido (máximo ${MAX_TOTAL_TEXT_LENGTH} caracteres).`, 400, origin, 'invalid-argument');
  }

  try {
    const rateLimit = await checkAndConsumeGeminiRateLimit(uid);
    if (!rateLimit.ok) {
      return errorResponse(rateLimit.message ?? 'Límite de uso alcanzado.', 429, origin, 'resource-exhausted');
    }
  } catch (error) {
    console.error('[gemini] error de rate limit:', error instanceof Error ? error.message : 'unknown');
    return errorResponse('No se pudo verificar el límite de uso.', 500, origin, 'internal');
  }

  let response: Response;
  let usedFallback = false;
  try {
    try {
      response = await requestModel(apiKey, PRIMARY_MODEL, contents);
    } catch {
      usedFallback = true;
      response = await requestModel(apiKey, FALLBACK_MODEL, contents);
    }
    // Un 429 de cuota no debe disparar otro modelo: consume la misma métrica y empeora el agotamiento.
    if (!response.ok && response.status >= 500) {
      usedFallback = true;
      response = await requestModel(apiKey, FALLBACK_MODEL, contents);
    }
  } catch (error) {
    console.error('[gemini] fallo de red:', error instanceof Error ? error.message : 'unknown');
    return errorResponse('No se pudo contactar con el servicio de IA.', 502, origin, 'network-error');
  }

  if (!response.ok) {
    const failurePayload = await response.json().catch(() => null);
    const classified = classifyProviderFailure(response.status, failurePayload);
    console.error('[gemini] el proveedor respondió', response.status, classified.code);
    return jsonResponse(
      {
        ok: false,
        error: {
          message: classified.message,
          code: classified.code,
          ...(classified.retryAfterSeconds !== null ? { retryAfterSeconds: classified.retryAfterSeconds } : {}),
        },
      },
      classified.status,
      origin,
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return errorResponse('Respuesta ilegible del servicio de IA.', 502, origin, 'invalid-response');
  }
  const text = extractText(result);
  if (!text) return errorResponse('El servicio de IA no devolvió texto.', 502, origin, 'empty-response');

  return jsonResponse({ ok: true, text, usedFallback }, 200, origin);
}

export const config: Config = {
  path: '/api/gemini',
};
