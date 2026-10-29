/**
 * Utilidades HTTP para Netlify Functions:
 * - CORS controlado por allowlist (no comodín en producción)
 * - Respuestas JSON consistentes
 * - Manejo seguro de errores (sin filtrar internals)
 */

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173'];

export function getAllowedOrigins(): string[] {
  const configured = process.env.ALLOWED_ORIGINS;
  if (configured) {
    return configured.split(',').map((origin) => origin.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

export function buildCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowed = getAllowedOrigins();
  const origin = requestOrigin && allowed.includes(requestOrigin) ? requestOrigin : allowed[0] ?? '';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Operation-Id',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function jsonResponse(
  body: unknown,
  status: number,
  requestOrigin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...buildCorsHeaders(requestOrigin),
    },
  });
}

export function preflightResponse(requestOrigin: string | null): Response {
  return new Response(null, { status: 204, headers: buildCorsHeaders(requestOrigin) });
}

/** Error seguro para el cliente: mensaje claro, sin stack ni detalles internos. */
export function errorResponse(
  message: string,
  status: number,
  requestOrigin: string | null,
  code?: string,
  metadata?: { category?: string; sourceCode?: string; sourceStatus?: number },
): Response {
  return jsonResponse({
    ok: false,
    error: {
      message,
      ...(code ? { code } : {}),
      ...(metadata?.category ? { category: metadata.category } : {}),
      ...(metadata?.sourceCode ? { sourceCode: metadata.sourceCode } : {}),
      ...(metadata?.sourceStatus !== undefined ? { sourceStatus: metadata.sourceStatus } : {}),
    },
  }, status, requestOrigin);
}
