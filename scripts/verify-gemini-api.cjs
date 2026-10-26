/**
 * Local contract tests for Gemini Netlify handlers.
 * Uses mocked fetch, Firebase auth, and rate limiting; makes no network calls.
 */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.tmp-gemini');
let checks = 0;

function check(label, condition) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS  ${label}`);
}

function stubModule(relativePath, exports) {
  const filename = path.join(outDir, relativePath);
  const stub = new Module(filename, require.main);
  stub.filename = filename;
  stub.loaded = true;
  stub.exports = exports;
  require.cache[filename] = stub;
}

async function main() {
  try {
    execFileSync(process.execPath, [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      'netlify/lib/geminiTts.ts',
      'netlify/functions/gemini.ts',
      'netlify/functions/tts.ts',
      '--ignoreConfig',
      '--outDir',
      '.tmp-gemini',
      '--module',
      'commonjs',
      '--moduleResolution',
      'bundler',
      '--target',
      'es2022',
      '--lib',
      'es2022,dom',
      '--skipLibCheck',
      '--esModuleInterop',
    ], { cwd: root, stdio: 'pipe' });
    fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

    const pcmFixture = Buffer.from([0, 0, 1, 0]).toString('base64');
    let requestedUrl = '';
    let requestedOptions;
    global.fetch = async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return new Response(JSON.stringify({
        steps: [{
          type: 'model_output',
          content: [{ type: 'audio', data: pcmFixture, mime_type: 'audio/wav' }],
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    process.env.GEMINI_API_KEY = 'local-test-key';
    delete process.env.GEMINI_TTS_MODEL;
    process.env.GEMINI_API_BASE_URL = '';
    delete process.env.GEMINI_TTS_VOICE_OLIVIA;
    delete process.env.GEMINI_TTS_VOICE_MATEO;
    delete process.env.GEMINI_TTS_VOICE_JAMES;
    const tts = require(path.join(outDir, 'lib/geminiTts.js'));
    const result = await tts.synthesizeWithGemini('  Hola   mundo  ');
    const requestBody = JSON.parse(requestedOptions.body);
    check('TTS uses Gemini Interactions REST endpoint', requestedUrl === 'https://generativelanguage.googleapis.com/v1beta/interactions');
    check('TTS selects default Flash-Lite model', requestBody.model === 'gemini-3.8-flash-lite-tts');
    check('TTS uses documented user_input text structure', requestBody.input[0].type === 'user_input' && requestBody.input[0].content[0].text === 'Hola mundo');
    check('TTS requests audio and configured voice', requestBody.response_format.type === 'audio' && requestBody.generation_config.speech_config[0].voice === 'Kore');
    check('TTS extracts audio from REST steps content', result.ok && result.value.audioBase64 === pcmFixture && result.value.mimeType === 'audio/wav');
    check('TTS sends API key in request header', requestedOptions.headers['x-goog-api-key'] === 'local-test-key');

    let providerCalls = 0;
    global.fetch = async () => {
      providerCalls += 1;
      return new Response('{}');
    };
    const tooLong = await tts.synthesizeWithGemini('x'.repeat(1201));
    check('TTS rejects over-limit text before provider request', !tooLong.ok && tooLong.error.status === 413 && providerCalls === 0);
    delete process.env.GEMINI_API_KEY;
    const missingKey = await tts.synthesizeWithGemini('Hola');
    check('TTS reports missing server key as a distinct configuration error without provider request',
      !missingKey.ok &&
      missingKey.error.status === 500 &&
      missingKey.error.code === 'server-config-missing' &&
      providerCalls === 0);
    process.env.GEMINI_API_KEY = 'PEGA_TU_CLAVE_AQUI';
    const placeholderKey = await tts.synthesizeWithGemini('Hola');
    check('TTS rejects the local key placeholder without provider request', !placeholderKey.ok && placeholderKey.error.status === 500 && providerCalls === 0);
    process.env.GEMINI_API_KEY = 'local-test-key';

    let authenticated = true;
    let allowed = true;
    let textProviderCalls = 0;
    let sentBody;
    global.fetch = async (_url, options) => {
      textProviderCalls += 1;
      sentBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Respuesta local' }] } }],
      }), { status: 200 });
    };
    stubModule('lib/firebaseAdmin.js', {
      verifyFirebaseToken: async () => authenticated
        ? { ok: true, uid: 'user-1' }
        : { ok: false, reason: 'unauthenticated' },
    });
    stubModule('lib/rateLimit.js', {
      checkAndConsumeGeminiRateLimit: async () => ({ ok: allowed, message: 'Límite local' }),
    });
    stubModule('lib/http.js', {
      errorResponse: (message, status, _origin, code) => Response.json({ ok: false, error: { message, code } }, { status }),
      jsonResponse: (body, status) => Response.json(body, { status }),
      preflightResponse: () => new Response(null, { status: 204 }),
    });
    const { default: handler } = require(path.join(outDir, 'functions/gemini.js'));
    const makeRequest = (body) => new Request('http://localhost/api/gemini', {
      method: 'POST',
      headers: { Authorization: 'Bearer local-test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const successResponse = await handler(makeRequest({ prompt: 'Prueba' }), {});
    const success = await successResponse.json();
    check('text function returns provider text', successResponse.status === 200 && success.text === 'Respuesta local');
    check('text function forwards text using server-side generateContent', sentBody.contents[0].parts[0].text === 'Prueba');

    process.env.GEMINI_API_KEY = 'PEGA_TU_CLAVE_AQUI';
    const placeholderResponse = await handler(makeRequest({ prompt: 'Prueba' }), {});
    check('text function rejects the local key placeholder without provider request', placeholderResponse.status === 500 && textProviderCalls === 1);
    process.env.GEMINI_API_KEY = 'local-test-key';

    authenticated = false;
    const deniedResponse = await handler(makeRequest({ prompt: 'Prueba' }), {});
    check('text function requires Firebase authentication', deniedResponse.status === 401 && textProviderCalls === 1);

    authenticated = true;
    allowed = false;
    const limitedResponse = await handler(makeRequest({ prompt: 'Prueba' }), {});
    check('text function enforces per-user rate limit', limitedResponse.status === 429 && textProviderCalls === 1);

    allowed = true;
    const invalidResponse = await handler(makeRequest({ contents: [{ role: 'attacker', parts: [{ text: 'Prueba' }] }] }), {});
    check('text function rejects invalid history schema', invalidResponse.status === 400 && textProviderCalls === 1);

    const callsBeforeQuota = textProviderCalls;
    global.fetch = async () => {
      textProviderCalls += 1;
      return new Response(JSON.stringify({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          details: [{
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaMetric: 'generate_content_free_tier_requests' }],
          }],
        },
      }), { status: 429 });
    };
    const quotaResponse = await handler(makeRequest({ prompt: 'Prueba' }), {});
    const quotaBody = await quotaResponse.json();
    check('text function maps daily quota exhaustion without calling a fallback model',
      quotaResponse.status === 429 &&
      quotaBody.error?.code === 'resource-exhausted' &&
      textProviderCalls === callsBeforeQuota + 1);

    // Test safe error instrumentation: extracts status, message, reason, domain from ErrorInfo
    const capturedLogs = [];
    const originalConsoleError = console.error;
    console.error = (...args) => {
      capturedLogs.push(args.join(' '));
      originalConsoleError(...args);
    };

    global.fetch = async () => {
      textProviderCalls += 1;
      return new Response(JSON.stringify({
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'INVALID_ARGUMENT',
          details: [{
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'API_KEY_INVALID',
            domain: 'googleapis.com',
            metadata: { service: 'generativelanguage.googleapis.com' },
          }],
        },
      }), { status: 400 });
    };

    const errorInfoResponse = await handler(makeRequest({ prompt: 'Prueba' }), {});
    check('text function handles provider 400 response', errorInfoResponse.status === 400);
    const loggedErrorLine = capturedLogs.find((log) => log.includes('[gemini] el proveedor respondió 400'));
    let loggedParsed = null;
    try {
      const jsonStart = loggedErrorLine ? loggedErrorLine.indexOf('{') : -1;
      if (jsonStart !== -1) {
        loggedParsed = JSON.parse(loggedErrorLine.slice(jsonStart));
      }
    } catch {
      loggedParsed = null;
    }
    check('text function logs provider status', loggedParsed?.status === 'INVALID_ARGUMENT');
    check('text function logs provider sanitized message', loggedParsed?.message?.includes('API key not valid'));
    check('text function logs provider reason from ErrorInfo', loggedParsed?.reason === 'API_KEY_INVALID');
    check('text function logs provider domain from ErrorInfo', loggedParsed?.domain === 'googleapis.com');

    // Test safe error instrumentation: non-JSON body response
    global.fetch = async () => {
      textProviderCalls += 1;
      return new Response('<html><body>Bad Gateway</body></html>', { status: 502 });
    };
    capturedLogs.length = 0;
    const htmlResponse = await handler(makeRequest({ prompt: 'Prueba' }), {});
    check('text function handles provider non-JSON failure', htmlResponse.status === 502);
    const loggedNonJsonLine = capturedLogs.find((log) => log.includes('[gemini] el proveedor respondió 502'));
    let loggedNonJsonParsed = null;
    try {
      const jsonStart = loggedNonJsonLine ? loggedNonJsonLine.indexOf('{') : -1;
      if (jsonStart !== -1) {
        loggedNonJsonParsed = JSON.parse(loggedNonJsonLine.slice(jsonStart));
      }
    } catch {
      loggedNonJsonParsed = null;
    }
    check('text function safely flags non-JSON response without leaking raw HTML body', loggedNonJsonParsed?.note === 'no-json-body');

    console.error = originalConsoleError;

    global.fetch = async (_url, options) => {
      textProviderCalls += 1;
      sentBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Respuesta local' }] } }],
      }), { status: 200 });
    };

    let synthesizedText;
    let synthesizedVoice;
    let synthesizeCalls = 0;
    let synthesizeResult = { ok: true, value: { audioBase64: pcmFixture, mimeType: 'audio/wav' } };
    stubModule('lib/geminiTts.js', {
      synthesizeWithGemini: async (text, voice) => {
        synthesizeCalls += 1;
        synthesizedText = text;
        synthesizedVoice = voice;
        return synthesizeResult;
      },
    });
    const { default: ttsHandler } = require(path.join(outDir, 'functions/tts.js'));
    const makeTtsRequest = (body) => new Request('http://localhost/api/tts', {
      method: 'POST',
      headers: { Authorization: '******', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const ttsResponse = await ttsHandler(makeTtsRequest({ text: 'Audio local', interviewerId: 'olivia' }), {});
    const ttsPayload = await ttsResponse.json();
    check('TTS function returns mocked audio in the client response shape', ttsResponse.status === 200 && ttsPayload.audio.base64 === pcmFixture);
    check('TTS function selects Olivia’s profile-default voice', synthesizedText === 'Audio local' && synthesizedVoice === 'Aoede' && synthesizeCalls === 1);

    const mateoResponse = await ttsHandler(makeTtsRequest({ text: 'Audio local', interviewerId: 'mateo' }), {});
    check('TTS function selects Mateo’s distinct profile-default voice', mateoResponse.status === 200 && synthesizedVoice === 'Puck' && synthesizeCalls === 2);

    const jamesResponse = await ttsHandler(makeTtsRequest({ text: 'Audio local', interviewerId: 'james' }), {});
    check('TTS function accepts James and selects the configured safe default voice',
      jamesResponse.status === 200 && synthesizedVoice === 'Kore' && synthesizeCalls === 3);
    process.env.GEMINI_TTS_VOICE_JAMES = 'Aoede';
    const jamesConfiguredResponse = await ttsHandler(makeTtsRequest({ text: 'Audio local', interviewerId: 'james' }), {});
    check('TTS function honors James’s optional server-side voice setting',
      jamesConfiguredResponse.status === 200 && synthesizedVoice === 'Aoede' && synthesizeCalls === 4);
    delete process.env.GEMINI_TTS_VOICE_JAMES;

    synthesizeResult = {
      ok: false,
      error: { message: 'Falta GEMINI_API_KEY en el servidor.', status: 500, code: 'server-config-missing' },
    };
    const missingServerKeyResponse = await ttsHandler(makeTtsRequest({ text: 'Audio local', interviewerId: 'olivia' }), {});
    const missingServerKeyPayload = await missingServerKeyResponse.json();
    check('TTS function preserves a distinct missing-server-key configuration error',
      missingServerKeyResponse.status === 500 &&
      missingServerKeyPayload.error.code === 'server-config-missing' &&
      synthesizeCalls === 5);
    synthesizeResult = { ok: true, value: { audioBase64: pcmFixture, mimeType: 'audio/wav' } };

    authenticated = false;
    const unauthenticatedTts = await ttsHandler(makeTtsRequest({ text: 'Audio local', interviewerId: 'olivia' }), {});
    check('TTS function requires Firebase authentication', unauthenticatedTts.status === 401 && synthesizeCalls === 5);

    authenticated = true;
    allowed = false;
    const limitedTts = await ttsHandler(makeTtsRequest({ text: 'Audio local', interviewerId: 'olivia' }), {});
    check('TTS function enforces the shared rate limit', limitedTts.status === 429 && synthesizeCalls === 5);

    allowed = true;
    const oversizedTts = await ttsHandler(makeTtsRequest({ text: 'x'.repeat(16_400) }), {});
    check('TTS function rejects oversized bodies before synthesis', oversizedTts.status === 413 && synthesizeCalls === 5);

    console.log(`\nRESULTADO: ${checks} comprobaciones locales pasaron; cero llamadas externas.`);
  } finally {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_TTS_MODEL;
    delete process.env.GEMINI_TTS_VOICE_OLIVIA;
    delete process.env.GEMINI_TTS_VOICE_MATEO;
    delete process.env.GEMINI_TTS_VOICE_JAMES;
    delete process.env.GEMINI_API_BASE_URL;
    delete global.fetch;
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('ERROR en comprobaciones Gemini:', error);
  process.exitCode = 1;
});
