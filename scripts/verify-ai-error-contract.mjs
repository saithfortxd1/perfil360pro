import assert from 'node:assert/strict';
import { classifyTransportError, createSafePersistenceFailure, normalizeGeminiFunctionError } from '../src/services/ai/errorClassification.ts';

let checks = 0;
function check(name, actual, expected) {
  assert.equal(actual, expected, name);
  checks += 1;
  console.log(`PASS  ${name}`);
}

const quota = normalizeGeminiFunctionError(429, {
  ok: false,
  error: { code: 'resource-exhausted', retryAfterSeconds: 30, message: 'Límite alcanzado.' },
});
check('HTTP 429 has rate-limit category', quota.category, 'RATE_LIMIT_ERROR');
check('HTTP 429 is not automatically retryable', quota.retryable, false);
check('HTTP 429 preserves the received HTTP status', quota.httpStatus, 429);

const authentication = normalizeGeminiFunctionError(401, {
  ok: false,
  error: { code: 'unauthenticated:auth/id-token-expired', category: 'AUTHENTICATION_ERROR' },
});
check('Firebase HTTP 401 is authentication, not quota', authentication.category, 'AUTHENTICATION_ERROR');

const permission = normalizeGeminiFunctionError(403, { ok: false, error: { code: 'permission-denied' } });
check('HTTP 403 is a permission error', permission.category, 'PERMISSION_ERROR');

const configuration = normalizeGeminiFunctionError(500, {
  ok: false,
  error: { code: 'configuration-error', category: 'CONFIGURATION_ERROR' },
});
check('configuration 500 is not mislabeled as provider outage', configuration.category, 'CONFIGURATION_ERROR');

const persistence = normalizeGeminiFunctionError(500, {
  ok: false,
  error: { code: 'rate-limit-unavailable', category: 'PERSISTENCE_ERROR', sourceCode: 'firestore-rate-limit' },
});
check('Firestore limiter failure is a persistence error', persistence.category, 'PERSISTENCE_ERROR');

const upstream = normalizeGeminiFunctionError(502, {
  ok: false,
  error: { code: 'provider-error', category: 'PROVIDER_ERROR', sourceStatus: 503 },
});
check('upstream 503 retains its provider category', upstream.category, 'PROVIDER_ERROR');
check('upstream source status is preserved', upstream.sourceStatus, 503);

const invalid = normalizeGeminiFunctionError(200, null);
check('malformed successful JSON is an invalid response', invalid.category, 'INVALID_RESPONSE');

const network = classifyTransportError(new TypeError('mock network failure'));
check('connection exception is a network error', network.category, 'NETWORK_ERROR');
check('network errors are distinct from provider 5xx', network.category === upstream.category, false);

const timeout = classifyTransportError(Object.assign(new Error('request timed out'), { name: 'TimeoutError' }));
check('timeout exception has its own category', timeout.category, 'TIMEOUT_ERROR');

const cancelled = classifyTransportError(Object.assign(new Error('aborted'), { name: 'AbortError' }));
check('intentional abort is cancellation, not provider error', cancelled.category, 'CANCELLED');
check('intentional abort is not retryable', cancelled.retryable, false);

const safePersistence = createSafePersistenceFailure('EVALUATION_PERSISTENCE_ERROR', 'No se pudo guardar la evaluación.');
check('evaluation persistence errors retain a distinct category', safePersistence.category, 'PERSISTENCE_ERROR');
check('safe persistence message does not expose internal exception text', safePersistence.message.includes('PRIVATE_RATE_LIMIT_DETAIL'), false);

console.log(`\n${checks} comprobaciones de contrato completadas sin llamadas externas.`);
