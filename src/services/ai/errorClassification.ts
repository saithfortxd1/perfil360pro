import type { AiErrorCategory } from '../../types/ai';

export interface NormalizedAiError {
  category: AiErrorCategory;
  code: string;
  message: string;
  retryable: boolean;
  httpStatus?: number;
  sourceCode?: string;
  sourceStatus?: number;
}

export interface GeminiFunctionErrorPayload {
  ok?: unknown;
  error?: {
    message?: unknown;
    code?: unknown;
    category?: unknown;
    retryAfterSeconds?: unknown;
    sourceCode?: unknown;
    sourceStatus?: unknown;
  };
}

/** Maps the safe Netlify response envelope without conflating upstream and Firebase auth errors. */
export function normalizeGeminiFunctionError(
  httpStatus: number,
  payload: GeminiFunctionErrorPayload | null,
): NormalizedAiError {
  const error = payload?.error;
  const sourceCode = typeof error?.sourceCode === 'string'
    ? error.sourceCode
    : typeof error?.code === 'string' ? error.code : undefined;
  const sourceStatus = typeof error?.sourceStatus === 'number' ? error.sourceStatus : undefined;
  const declaredCategory = typeof error?.category === 'string' ? error.category : undefined;
  const retryAfterSeconds = typeof error?.retryAfterSeconds === 'number' ? error.retryAfterSeconds : undefined;
  const message = typeof error?.message === 'string' ? error.message : `Error del servicio de IA (${httpStatus}).`;

  let category: AiErrorCategory;
  let code: string;
  let retryable = false;

  if (httpStatus === 429 || sourceCode === 'resource-exhausted') {
    category = 'RATE_LIMIT_ERROR';
    code = 'QUOTA_EXCEEDED';
  } else if (httpStatus === 401 || sourceCode === 'unauthenticated' || sourceCode?.startsWith('unauthenticated:')) {
    category = 'AUTHENTICATION_ERROR';
    code = 'UNAUTHENTICATED';
  } else if (httpStatus === 403) {
    category = 'PERMISSION_ERROR';
    code = 'PERMISSION_DENIED';
  } else if (sourceCode === 'configuration-error' || declaredCategory === 'CONFIGURATION_ERROR') {
    category = 'CONFIGURATION_ERROR';
    code = 'CONFIG_MISSING';
  } else if (sourceCode === 'rate-limit-unavailable' || sourceCode === 'persistence-error' || declaredCategory === 'PERSISTENCE_ERROR') {
    category = 'PERSISTENCE_ERROR';
    code = 'PERSISTENCE_ERROR';
  } else if (sourceCode === 'network-error' || declaredCategory === 'NETWORK_ERROR') {
    category = 'NETWORK_ERROR';
    code = 'NETWORK_ERROR';
    retryable = true;
  } else if (sourceCode === 'timeout-error' || declaredCategory === 'TIMEOUT_ERROR') {
    category = 'TIMEOUT_ERROR';
    code = 'TIMEOUT_ERROR';
    retryable = true;
  } else if (sourceCode === 'invalid-response' || sourceCode === 'empty-response' || sourceCode === 'invalid-argument' || declaredCategory === 'INVALID_RESPONSE' || httpStatus === 200) {
    category = 'INVALID_RESPONSE';
    code = 'INVALID_RESPONSE';
  } else if (sourceCode === 'cancelled' || sourceCode === 'aborted' || declaredCategory === 'CANCELLED') {
    category = 'CANCELLED';
    code = 'ABORTED';
  } else if (sourceCode === 'provider-error' || sourceCode === 'gemini-error' || declaredCategory === 'PROVIDER_ERROR') {
    category = 'PROVIDER_ERROR';
    code = httpStatus >= 500 ? 'SERVICE_UNAVAILABLE' : 'PROVIDER_ERROR';
    retryable = httpStatus >= 500 || (sourceStatus !== undefined && sourceStatus >= 500);
  } else {
    category = 'UNKNOWN_ERROR';
    code = 'UNKNOWN_ERROR';
  }

  return {
    category,
    code,
    message: category === 'RATE_LIMIT_ERROR' && retryAfterSeconds && retryAfterSeconds > 0 && retryAfterSeconds <= 120
      ? `El servicio de IA pidió esperar ${retryAfterSeconds} segundos antes de reintentar.`
      : message,
    retryable,
    httpStatus,
    ...(sourceCode ? { sourceCode } : {}),
    ...(sourceStatus !== undefined ? { sourceStatus } : {}),
  };
}

export function classifyTransportError(error: unknown): NormalizedAiError {
  if (error instanceof Error && error.name === 'AbortError') {
    return { category: 'CANCELLED', code: 'ABORTED', message: 'Solicitud cancelada.', retryable: false };
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || /(?:time[\s_-]?out|timed out)/i.test(error.message))) {
    return { category: 'TIMEOUT_ERROR', code: 'TIMEOUT_ERROR', message: 'El servicio tardó demasiado en responder.', retryable: true };
  }
  return { category: 'NETWORK_ERROR', code: 'NETWORK_ERROR', message: 'Se perdió la conexión. Revisa tu red y reintenta.', retryable: true };
}

export function createSafePersistenceFailure(code: string, message: string): NormalizedAiError {
  return { category: 'PERSISTENCE_ERROR', code, message, retryable: false };
}
