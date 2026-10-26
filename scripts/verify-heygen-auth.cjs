const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perfil360-heygen-auth-'));
let checks = 0;

function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
  console.log(`PASS ${label}`);
}

function stubModule(relativePath, exports) {
  const filename = path.join(tempDir, relativePath);
  const stub = new Module(filename, require.main);
  stub.filename = filename;
  stub.loaded = true;
  stub.exports = exports;
  require.cache[filename] = stub;
}

async function main() {
 try {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    'netlify/functions/heygen-session.ts',
    '--ignoreConfig',
    '--outDir',
    tempDir,
    '--module',
    'commonjs',
    '--target',
    'es2022',
    '--lib',
    'es2022',
    '--skipLibCheck',
  ], { cwd: root, stdio: 'pipe' });

  const allowlist = require(path.join(tempDir, 'lib', 'avatarAllowlist.js'));
  const oliviaId = 'dc6a2ade-fcad-48b4-89ce-8ae807b18c32';
  const mateoId = 'c6fe7922-ef30-4928-98b2-95e44bdf3f1e';

  check('normalizes case, whitespace, and surrounding quotes',
    allowlist.normalizeAvatarId(`  "${oliviaId.toUpperCase()}"  `), oliviaId);
  check('rejects malformed requested IDs', allowlist.normalizeAvatarId('not-a-uuid'), null);
  check('rejects a missing allowlist', allowlist.resolveAvatarFromAllowlist(oliviaId, ' ').code, 'config-missing');
  check('rejects a malformed allowlist', allowlist.resolveAvatarFromAllowlist(oliviaId, `${oliviaId},broken`).code, 'config-invalid');
  check('rejects an invalid requested ID', allowlist.resolveAvatarFromAllowlist('bad-id', oliviaId).code, 'invalid-avatar');
  check('rejects an avatar omitted from the allowlist', allowlist.resolveAvatarFromAllowlist(mateoId, oliviaId).code, 'avatar-not-allowed');
  check('allows Olivia and Mateo when explicitly configured',
    [
      allowlist.resolveAvatarFromAllowlist(oliviaId, `${oliviaId},${mateoId}`).ok,
      allowlist.resolveAvatarFromAllowlist(mateoId, `${oliviaId},${mateoId}`).ok,
    ],
    [true, true]);
  check('deduplicates normalized entries',
    allowlist.parseAllowedAvatarIds(`${oliviaId.toUpperCase()}, ${oliviaId}`).avatarIds,
    [oliviaId]);

  let authenticated = false;
  let rateLimitCalls = 0;
  let rateLimitAllowed = true;
  let tokenCalls = 0;
  let sessionCreationResult = null;
  process.env.HEYGEN_ALLOWED_AVATARS = `${oliviaId},${mateoId}`;
  stubModule('lib/firebaseAdmin.js', {
    verifyFirebaseToken: async () => authenticated
      ? { ok: true, uid: 'test-user' }
      : { ok: false, reason: 'unauthenticated' },
  });
  stubModule('lib/rateLimit.js', {
    checkAndConsumeRateLimit: async () => {
      rateLimitCalls += 1;
      return rateLimitAllowed ? { ok: true } : { ok: false, message: 'Rate limit local' };
    },
  });
  stubModule('lib/http.js', {
    errorResponse: (message, status, _origin, code) => Response.json({ ok: false, error: { message, code } }, { status }),
    jsonResponse: (body, status) => Response.json(body, { status }),
    preflightResponse: () => new Response(null, { status: 204 }),
  });
  stubModule('lib/liveAvatarApi.js', {
    resolveAllowedAvatar: allowlist.resolveAvatarFromAllowlist
      ? (requestedAvatarId) => allowlist.resolveAvatarFromAllowlist(requestedAvatarId, process.env.HEYGEN_ALLOWED_AVATARS)
      : undefined,
    createLiveAvatarSession: async (avatarId) => {
      tokenCalls += 1;
      return sessionCreationResult ?? { ok: true, value: { sessionId: 'local-session', sessionToken: 'local-token', avatarId } };
    },
  });
  const { default: handler } = require(path.join(tempDir, 'functions', 'heygen-session.js'));
  const request = (body) => new Request('http://localhost/api/heygen/session', {
    method: 'POST',
    headers: { Authorization: 'Bearer local-test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const unauthenticated = await handler(request({ avatarId: oliviaId }), {});
  check('session function rejects unauthenticated callers before rate limiting',
    [unauthenticated.status, rateLimitCalls, tokenCalls], [401, 0, 0]);

  authenticated = true;
  const denied = await handler(request({ avatarId: 'not-a-uuid' }), {});
  check('session function maps malformed avatar IDs to a client error without token creation',
    [denied.status, tokenCalls], [400, 0]);

  const unlisted = await handler(request({ avatarId: '69a246bd-1739-418d-b533-9fc578208175' }), {});
  check('session function denies IDs absent from the server allowlist',
    [unlisted.status, tokenCalls], [403, 0]);

  const oversized = await handler(new Request('http://localhost/api/heygen/session', {
    method: 'POST',
    headers: { Authorization: 'Bearer local-test-token', 'Content-Type': 'application/json' },
    body: 'x'.repeat(2_049),
  }), {});
  check('session function rejects oversized bodies before rate limiting or token creation',
    [oversized.status, rateLimitCalls, tokenCalls], [413, 0, 0]);

  rateLimitAllowed = false;
  const limited = await handler(request({ avatarId: oliviaId }), {});
  check('session function enforces the per-user rate limit before token creation',
    [limited.status, tokenCalls], [429, 0]);
  rateLimitAllowed = true;

  const accepted = await handler(request({ avatarId: `  ${oliviaId.toUpperCase()}  ` }), {});
  const acceptedBody = await accepted.json();
  check('session function returns only the token session payload for an allowed normalized ID',
    [accepted.status, acceptedBody.session?.avatarId, acceptedBody.session?.sessionId, tokenCalls],
    [200, oliviaId, 'local-session', 1]);

  sessionCreationResult = {
    ok: false,
    error: { message: 'Provider rejected request', status: 502, code: 'provider-auth-rejected' },
  };
  const providerRejected = await handler(request({ avatarId: mateoId }), {});
  const providerErrorBody = await providerRejected.json();
  check('session function forwards safe provider error codes and statuses',
    [providerRejected.status, providerErrorBody.error?.code, tokenCalls],
    [502, 'provider-auth-rejected', 2]);

  delete process.env.HEYGEN_ALLOWED_AVATARS;
  const unconfigured = await handler(request({ avatarId: oliviaId }), {});
  check('session function fails closed when the allowlist is absent',
    [unconfigured.status, tokenCalls], [500, 2]);

  console.log(`RESULT: ${checks} comprobaciones de allowlist y handler pasaron; sin llamadas externas.`);
 } finally {
  require('node:fs').rmSync(tempDir, { recursive: true, force: true });
 }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
