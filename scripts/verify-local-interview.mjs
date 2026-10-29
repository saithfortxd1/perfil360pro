import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const fallback = await import(new URL('../src/services/ai/localInterviewFallback.ts', import.meta.url));
const service = read('src/services/ai/geminiService.ts');
const page = read('src/pages/SimuladorInmersivo.tsx');
const evaluation = read('src/services/ai/evaluationService.ts');
const errorClassification = await import(new URL('../src/services/ai/errorClassification.ts', import.meta.url));
const voiceSelection = await import(new URL('../src/services/ai/voiceSelection.ts', import.meta.url));
const voicePolicy = await import(new URL('../src/services/ai/voiceInputPolicy.ts', import.meta.url));
const voicePreferences = await import(new URL('../src/services/ai/voicePreferences.ts', import.meta.url));

const interviewer = { name: 'Mateo', role: 'Entrevistador', company: 'Perfil 360 AI' };
const scenario = { id: 'entrevista', title: 'Liderazgo de equipo', description: 'Coordinar un equipo y priorizar entregas.' };
const initialState = { progress: 0, resources: { tiempo: 100, energia: 100 } };

// Entrevista local de principio a fin: bienvenida/pregunta inicial, cinco turnos y evaluación identificada.
let welcome = fallback.generateLocalWelcomeMessage(scenario, interviewer);
assert.match(welcome.content, /¿cuál es tu nombre\?/i);
assert.equal(welcome.role, 'model');
assert.equal(welcome.metadata.isLocalFallback, true);
const namedWelcome = fallback.generateLocalWelcomeMessage(scenario, interviewer, 'Ariana');
assert.match(namedWelcome.content, /Ariana.*trayectoria profesional/i);
const candidateNameTurn = fallback.generateLocalCandidateNameTurn('Ariana');
assert.match(candidateNameTurn.content, /Ariana.*trayectoria profesional/i);
let state = initialState;
const askedLocalQuestions = new Set();
const emittedLocalTurns = [];
for (let turn = 0; turn < 5; turn += 1) {
  const result = fallback.generateLocalFollowUpTurn(
    turn === 0 ? 'Lideré un equipo para alcanzar resultados medibles.' : `En mi experiencia profesional trabajé para resolver un problema y entregar resultados. Turno ${turn + 1}.`,
    turn,
    state,
    askedLocalQuestions,
  );
  assert.ok(result.message.content.trim().length > 40, 'cada turno local debe responder y formular una pregunta o cierre útil');
  assert.equal(result.message.metadata.isLocalFallback, true);
  state = result.scenarioState;
  emittedLocalTurns.push(result.message.content);
  if (turn === 4) {
    assert.equal(result.completed, true, 'la última respuesta debe cerrar el flujo local');
    assert.equal(state.progress, 100, 'la práctica local completa debe alcanzar 100%');
  }
}
assert.equal(askedLocalQuestions.size, 5, 'el modo local no debe repetir preguntas');
assert.match(emittedLocalTurns[0], /desacuerdo técnico/i, 'la respuesta inicial de liderazgo orienta el seguimiento');
assert.ok(emittedLocalTurns.every((message) => !message.includes('Ariana')), 'las respuestas locales no fuerzan el nombre del candidato en cada turno');
assert.ok(emittedLocalTurns.every((message) => !/hola|soy Mateo/i.test(message)), 'el respaldo local no repite el saludo ni confunde identidades');
const transcript = [welcome, ...Array.from({ length: 5 }, (_, i) => ({ role: 'user', content: `respuesta profesional con contexto ${i}` }))];
const localEvaluation = fallback.generateLocalEvaluation(transcript);
assert.ok(localEvaluation.evaluatedAt > 0);
assert.match(localEvaluation.summary, /Evaluación Local/i);
assert.equal(fallback.generateLocalEvaluation([
  { role: 'user', content: 'Ariana', metadata: { isCandidateName: true } },
  { role: 'user', content: 'Una respuesta profesional con suficiente detalle' },
]).summary.includes('1 intervenciones'), true, 'el nombre no se evalúa como respuesta laboral');

const simulatedVoices = [
  { voice: { voiceURI: 'es-female' }, name: 'Lucia', lang: 'es-ES', gender: 'female', isSpanish: true, isLatinSpanish: false, isSystemVoice: false },
  { voice: { voiceURI: 'es-male' }, name: 'Andres', lang: 'es-CO', gender: 'male', isSpanish: true, isLatinSpanish: true, isSystemVoice: false },
];
assert.equal(voiceSelection.choosePreferredVoice(simulatedVoices, null).voice.voiceURI, 'es-male');
assert.equal(voiceSelection.choosePreferredVoice(simulatedVoices, 'es-female').voice.voiceURI, 'es-female', 'una preferencia guardada se conserva');
assert.equal(voiceSelection.inferVoiceGender('Andrés', 'urn:local:Andres'), 'unknown', 'un nombre propio no basta para atribuir género');
assert.equal(voiceSelection.inferVoiceGender('Spanish Male', 'urn:local:SpanishMale'), 'male', 'solo metadatos explícitos permiten inferir género');
assert.equal(voiceSelection.choosePreferredVoice([], 'es-late'), null, 'no se sustituye una voz guardada mientras todavía no aparece');
assert.equal(voiceSelection.choosePreferredVoice([{ ...simulatedVoices[1], voice: { voiceURI: 'es-late' } }], 'es-late').voice.voiceURI, 'es-late', 'la preferencia se resuelve cuando llegan voces tardías');
assert.equal(voicePolicy.AUTO_SEND_SILENCE_MS, 2200);
const autoKey = voicePolicy.makeAutoSubmitKey('s1', 2, 'respuesta final');
assert.equal(voicePolicy.isNewAutoSubmit(autoKey, autoKey), false, 'una transcripción final idéntica se procesa una sola vez');
const speechHook = read('src/hooks/useSpeech.ts');
assert.match(speechHook, /SIMULATOR_VOICE_CONFIG\.DEFAULT_RATE/);
assert.match(speechHook, /readVoicePreference\(localStorage, voicePreferenceKey\)/);
assert.match(speechHook, /writeVoicePreference\(localStorage, voicePreferenceKey, voiceURI\)/);
assert.match(speechHook, /readVoiceRate\(localStorage, SIMULATOR_VOICE_CONFIG\.DEFAULT_RATE\)/);
assert.match(speechHook, /addEventListener\?\.\('voiceschanged', loadVoices\)/);
assert.match(speechHook, /removeEventListener\?\.\('voiceschanged', loadVoices\)/);
assert.match(speechHook, /processedFinalResultRefs\.current\.get\(i\) === segment/);
assert.match(read('src/services/ai/voiceConfig.ts'), /DEFAULT_RATE:\s*1\.10/);
const inMemoryVoiceStorage = new Map();
const storageMock = { getItem: (key) => inMemoryVoiceStorage.get(key) ?? null, setItem: (key, value) => inMemoryVoiceStorage.set(key, value) };
assert.equal(voicePreferences.writeVoicePreference(storageMock, 'voice.james', 'es-male'), true);
assert.equal(voicePreferences.readVoicePreference(storageMock, 'voice.james'), 'es-male');
assert.equal(voicePreferences.writeVoiceRate(storageMock, 1.1), 1.1);
assert.equal(voicePreferences.readVoiceRate(storageMock, 1.1), 1.1);
voicePreferences.writeVoicePreference(storageMock, 'voice.james', 'es-female');
assert.equal(voicePreferences.readVoicePreference(storageMock, 'voice.james'), 'es-female');
assert.equal(voicePreferences.readVoiceRate(storageMock, 1.1), 1.1, 'cambiar la voz no altera la velocidad guardada');
const voiceSettings = read('src/components/simulator/VoiceSettings.tsx');
assert.match(voiceSettings, /<select[\s\S]*onChange=\{\(event\) => onSelectVoice\(event\.target\.value\)\}/);
assert.match(voiceSettings, /voicesLoading/);
assert.match(voiceSettings, /onPreviewVoice\(selectedVoiceURI \?\? voices\[0\]\?\.voice\.voiceURI\)/);
assert.match(voiceSettings, /option\.name\} · \{option\.lang/);
const activeSimulator = page.slice(page.indexOf('/* ---------------- Entrevista en curso ---------------- */'));
assert.match(activeSimulator, /onClick=\{openVoiceSettings\}[\s\S]*Configurar voz/);
assert.match(page, /const openVoiceSettings = useCallback\([\s\S]*setShowVoiceSettings\(true\)/, 'el control abre la configuración desde la pantalla activa');
assert.match(activeSimulator, /showVoiceSettings \? \([\s\S]*role="dialog"[\s\S]*aria-modal="true"[\s\S]*voicesLoading=\{speech\.voicesLoading\}/);
assert.match(speechHook, /const speak = useCallback\(\(text: string\) => speakWith\(text, selectedVoice, rate\)/, 'la voz seleccionada alimenta la reproducción real del navegador');

// El servicio debe convertir el 429 en modo local dentro del mismo turno y no repetir la petición.
const sendMessage = service.slice(service.indexOf('async sendMessage('), service.indexOf('async triggerChaos('));
assert.doesNotMatch(sendMessage, /MAX_ATTEMPTS|BACKOFF_MS|for\s*\(\s*let\s+attempt/);
assert.match(sendMessage, /this\.currentSession\.candidateName = candidateName/);
assert.match(sendMessage, /isCandidateName: true/);
assert.match(sendMessage, /result\.error\.code === 'ABORTED'\) return/);
assert.match(sendMessage, /this\.usingFallback = true;[\s\S]*generateLocalFollowUpTurn/);
assert.match(service, /normalizeGeminiFunctionError\(status, result\)/);
assert.match(service, /classifyTransportError\(error\)/);
assert.equal(errorClassification.normalizeGeminiFunctionError(429, { error: { code: 'resource-exhausted' } }).code, 'QUOTA_EXCEEDED');
assert.equal(errorClassification.normalizeGeminiFunctionError(429, { error: { code: 'resource-exhausted' } }).retryable, false, 'un 429 no se reintenta automáticamente');
assert.equal(errorClassification.normalizeGeminiFunctionError(401, { error: { code: 'unauthenticated' } }).category, 'AUTHENTICATION_ERROR');
assert.equal(errorClassification.normalizeGeminiFunctionError(403, { error: { code: 'permission-denied' } }).category, 'PERMISSION_ERROR');
assert.equal(errorClassification.normalizeGeminiFunctionError(500, { error: { code: 'configuration-error', category: 'CONFIGURATION_ERROR' } }).category, 'CONFIGURATION_ERROR');
assert.equal(errorClassification.normalizeGeminiFunctionError(500, null).category, 'UNKNOWN_ERROR', 'un 500 genérico no se atribuye automáticamente a Gemini');
assert.equal(errorClassification.classifyTransportError(new TypeError('mock network')).category, 'NETWORK_ERROR');
assert.equal(errorClassification.normalizeGeminiFunctionError(200, null).category, 'INVALID_RESPONSE');
const systemPromptBuilder = service.slice(service.indexOf('private buildSystemPrompt('), service.indexOf('private buildChaosPrompt('));
assert.match(systemPromptBuilder, /PERSONA ENTREVISTADORA: \$\{interviewer\.name\}/);
assert.match(systemPromptBuilder, /PERSONA CANDIDATA: \$\{userProfile\.candidateName/);
assert.match(systemPromptBuilder, /no lo repitas en cada turno/);

// Predefinidos omiten Gemini al iniciar, y la evaluación offline no solicita una evaluación al modelo.
assert.match(service, /if \(!this\.isConfigured\(\)\) \{\s*this\.latencyMark\('escenarios predefinidos',[\s\S]*?return \{ ok: true, value: localScenarios\('CONFIG_MISSING'\) \};\s*\}/);
assert.match(service, /Boolean\(\(dynamicScenario as \{ isFallback\?: boolean \}\)\.isFallback\)/);
assert.match(evaluation, /if \(geminiService\.isUsingFallback\(\)\)[\s\S]*generateLocalEvaluation/);
assert.match(page, /startedPendingQuestionRef\.current === pendingQuestion\.id/);
assert.match(page, /Modo local ·/);
assert.doesNotMatch(page, /stage\.scrollIntoView|messagesEndRef\.current\?\.scrollIntoView/);
assert.match(page, /scrollTo\(\{ top: transcript\.scrollHeight/);
assert.match(page, /window\.scrollTo\(0, 0\)/, 'la entrada y el inicio anclan la vista arriba, sin desplazarla a un panel inferior');
assert.match(page, /setShowScenarioSelector\(false\);\s*window\.scrollTo\(0, 0\);/);
assert.match(page, /Continuar en modo local/);
assert.match(service, /continueWithLocalFallback\(\): boolean/);
assert.match(activeSimulator, /onClick=\{handleInterrupt\}/);
assert.match(activeSimulator, /onClick=\{handleChaos\}/, 'el botón real de imprevisto está enlazado al manejador');
assert.match(service, /interruptCurrentTurnLocally\(\): boolean/);
assert.match(activeSimulator, /disabled=\{!session\?\.chaosAvailable \|\| chaosLoading \|\| isSending \|\| session\?\.status !== 'active'\}/, 'el imprevisto no queda deshabilitado porque el micrófono esté escuchando o el entrevistador hable');
assert.match(page, /result\.error\.code !== 'ABORTED'/, 'una cancelación intencional no se muestra como error');
assert.match(page, /setCompletionNotice\(wasEvaluating[\s\S]*Entrevista terminada/);
assert.match(page, /PREDEFINED_SCENARIO_OPTIONS\);/);
assert.doesNotMatch(page, /setDynamicScenarios\(\[\]\)/, 'el inicio de personalización no oculta los escenarios locales');
assert.doesNotMatch(page, /disabled=\{!pendingScenario \|\| generatingScenarios/, 'generar escenarios personalizados no bloquea iniciar uno predefinido');
assert.match(page, /max-h-\[55dvh\][\s\S]*overflow-y-auto overscroll-contain/, 'la transcripción queda limitada y se desplaza dentro de su panel');
assert.match(page, /flex h-full min-h-0 flex-col bg-ink-950/, 'la vista activa ocupa el espacio disponible bajo la cabecera del sitio');
const appShell = read('src/components/layout/AppShell.tsx');
assert.match(appShell, /isSimulator \? 'flex h-dvh min-h-0 flex-col'/);
assert.match(appShell, /isSimulator \? 'min-h-0 flex-1 overflow-y-auto/);
assert.match(appShell, /!isDashboard && !isSimulator \? <SiteFooter \/> : null/);
assert.match(page, /space-y-4 p-4 sm:p-5/);
assert.match(page, /tracking-\[0\.1em\]/);
assert.match(page, /disabled:from-ink-700 disabled:to-ink-700 disabled:text-mist-300 disabled:opacity-100/);

// Controles de producto que deben mantenerse estables.
const interviewers = read('src/services/ai/interviewers.ts');
assert.match(interviewers, /activeMaleIds = new Set<InterviewerProfile\['id'\]>\(\['mateo', 'james', 'andres'\]\)/);
assert.match(interviewers, /i\.enabled && i\.gender === 'hombre' && activeMaleIds\.has\(i\.id\)/);
assert.match(interviewers, /id: 'olivia',[\s\S]*?enabled: false/);
assert.match(interviewers, /id: 'valeria',[\s\S]*?enabled: false/);
assert.match(interviewers, /id: 'camila',[\s\S]*?enabled: false/);
assert.match(read('src/services/ai/voiceConfig.ts'), /DEFAULT_RATE:\s*1\.10/);
assert.doesNotMatch(read('src/components/simulator/VoiceSettings.tsx'), /Ajustar voz/);

let server;
const realFetch = globalThis.fetch;
try {
// Integración real del servicio Gemini con fetch simulado: el 429 se solicita una sola vez,
// luego inicio, cinco respuestas y evaluación local completan la práctica sin más peticiones.
const { createServer } = await import('vite');
const fakeInterviewer = { id: 'mateo', name: 'Mateo', role: 'Entrevistador', company: 'Perfil 360 AI', description: '', conversationalStyle: '', liveAvatarId: null, voice: { provider: 'browser', selection: 'user-selected' } };
let providerCalls = 0;
let lastRequestBody = '';
let resolveDeferredFetch = null;
const waitForProviderCall = async () => {
  for (let attempt = 0; attempt < 100 && providerCalls === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(providerCalls > 0, 'la solicitud simulada debe llegar al fetch del servicio');
};
let mockedFailure = { status: 429, json: async () => ({ ok: false, error: { code: 'resource-exhausted', message: 'límite simulado' } }) };
server = await createServer({
  configFile: path.join(root, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  plugins: [{
    name: 'mock-firebase-token-for-local-interview-test',
    enforce: 'pre',
    transform(source, id) {
      if (id.endsWith('/src/services/ai/geminiService.ts')) {
        return source.replace("import { getFirebaseIdToken } from '@/services/firebase/idToken';", "const getFirebaseIdToken = async () => 'test-token';");
      }
      return null;
    },
  }],
});
globalThis.fetch = async (_url, options = {}) => {
  providerCalls += 1;
  lastRequestBody = String(options.body ?? '');
  if (mockedFailure === 'connection') throw new TypeError('Failed to fetch');
  if (mockedFailure === 'pending') {
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  }
  if (mockedFailure === 'deferred') {
    return new Promise((resolve) => { resolveDeferredFetch = resolve; });
  }
  return { ok: mockedFailure.status >= 200 && mockedFailure.status < 300, status: mockedFailure.status, json: mockedFailure.json };
};
const { geminiService: gemini } = await server.ssrLoadModule('/src/services/ai/geminiService.ts');
assert.equal(gemini.initialize().ok, true);
const scenarioConfig = {
  id: 'interview-local-test', title: 'Entrevista de liderazgo', description: 'Liderar un equipo.', role: 'profesional',
  initialState: { id: 'liderazgo_equipo', title: 'Entrevista de liderazgo', description: 'Liderar un equipo.', currentSituation: 'Coordinar una entrega profesional.', objectives: ['Demostrar liderazgo'], constraints: [], progress: 0, resources: { tiempo: 100, presupuesto: 100, energia: 100, redContactos: 100 } },
  systemPrompt: '', chaosEvents: [],
};
// Una bienvenida Gemini pendiente se puede interrumpir explícitamente sin reintentar.
mockedFailure = 'pending';
providerCalls = 0;
const pendingWelcome = gemini.startSimulation(scenarioConfig, { role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer);
await waitForProviderCall();
assert.equal(gemini.continueWithLocalFallback(), true);
const selectedLocalWelcome = await pendingWelcome;
assert.equal(selectedLocalWelcome.ok, true, 'la selección de modo local libera una bienvenida Gemini pendiente');
assert.equal(selectedLocalWelcome.value.messages.length, 1, 'la bienvenida local se agrega una vez');
assert.equal(gemini.getFallbackReason(), 'LOCAL_FALLBACK_SELECTED');
assert.equal(providerCalls, 1, 'continuar local cancela la única solicitud; no reintenta Gemini');
gemini.endSimulation();
providerCalls = 0;
const noContextScenarios = await gemini.generateScenariosFromProfile({ fullName: 'Ariana Gómez' });
assert.equal(noContextScenarios.ok, true);
assert.ok(noContextScenarios.value.every((entry) => entry.isFallback === true));
assert.equal(providerCalls, 0, 'sin datos profesionales suficientes se evita solicitar Gemini');
// Perfilización: una petición simulada verifica que el prompt recibe solo campos profesionales elegidos.
mockedFailure = { status: 200, json: async () => ({ ok: true, text: JSON.stringify({ scenarios: [{ id: 'custom-1', title: 'Liderar una migración', description: 'Dirigir una migración técnica con entregas críticas.', difficulty: 'alto' }] }) }) };
const personalized = await gemini.generateScenariosFromProfile({
  fullName: 'Ariana Gómez', headline: 'Líder de producto', skills: ['analítica', 'liderazgo'],
  yearsOfExperience: 7, bio: 'He coordinado equipos multidisciplinarios.', goal: 'Dirigir producto', education: 'Ingeniería',
});
assert.equal(personalized.ok, true);
assert.equal(personalized.value[0].title, 'Liderar una migración');
assert.equal(personalized.value[0].isFallback, undefined, 'un resultado Gemini válido no se marca predefinido');
const profilePrompt = JSON.parse(lastRequestBody).prompt;
for (const expected of ['Ariana Gómez', 'Líder de producto', 'analítica', '7', 'He coordinado equipos', 'Dirigir producto', 'Ingeniería']) assert.ok(profilePrompt.includes(expected), `el prompt debe incluir ${expected}`);

// El 429 entrega escenarios explícitamente predefinidos con una sola petición.
providerCalls = 0;
mockedFailure = { status: 429, json: async () => ({ ok: false, error: { code: 'resource-exhausted', message: 'límite simulado' } }) };
const predefinedScenarios = await gemini.generateScenariosFromProfile({ fullName: 'Ariana', skills: ['liderazgo'] });
assert.equal(predefinedScenarios.ok, true);
assert.ok(predefinedScenarios.value.every((entry) => entry.isFallback === true));
assert.equal(providerCalls, 1, 'el 429 de escenarios no causa reintento');
for (const [status, reason] of [[401, 'UNAUTHENTICATED'], [403, 'PERMISSION_DENIED']]) {
  providerCalls = 0;
  mockedFailure = { status, json: async () => ({ ok: false, error: { code: reason.toLowerCase().replaceAll('_', '-'), message: `mock ${status}` } }) };
  const authFallback = await gemini.generateScenariosFromProfile({ skills: ['liderazgo'] });
  assert.equal(authFallback.ok, true, `HTTP ${status} debe permitir escenarios locales`);
  assert.ok(authFallback.value.every((entry) => entry.isFallback === true && entry.fallbackReason === reason));
  assert.equal(providerCalls, status === 401 ? 2 : 1, `HTTP ${status} debe conservar su política de autenticación sin repetir 403`);
}
mockedFailure = { status: 200, json: async () => ({ ok: true, text: '{"scenarios":[' }) };
providerCalls = 0;
const malformedScenarios = await gemini.generateScenariosFromProfile({ skills: ['liderazgo'] });
assert.equal(malformedScenarios.ok, true, 'JSON de escenarios truncado cae al respaldo local');
assert.ok(malformedScenarios.value.every((entry) => entry.isFallback === true));
assert.equal(providerCalls, 1, 'un JSON truncado tampoco dispara un segundo intento');
for (const [mockedError, reason] of [
  [{ status: 500, json: async () => ({ ok: false, error: { code: 'internal', message: 'mock 500' } }) }, 'UNKNOWN_ERROR'],
  ['connection', 'NETWORK_ERROR'],
]) {
  providerCalls = 0;
  mockedFailure = mockedError;
  const fallbackScenarios = await gemini.generateScenariosFromProfile({ skills: ['liderazgo'] });
  assert.equal(fallbackScenarios.ok, true, `${reason} debe permitir iniciar con escenarios locales`);
  assert.ok(fallbackScenarios.value.every((entry) => entry.isFallback === true && entry.fallbackReason === reason));
  assert.equal(providerCalls, 1, `${reason} no debe causar reintentos de la solicitud de escenarios`);
}
providerCalls = 0;
mockedFailure = { status: 200, json: async () => { throw new SyntaxError('JSON inválido'); } };
const invalidEnvelopeScenarios = await gemini.generateScenariosFromProfile({ skills: ['liderazgo'] });
assert.equal(invalidEnvelopeScenarios.ok, true);
assert.ok(invalidEnvelopeScenarios.value.every((entry) => entry.isFallback === true && entry.fallbackReason === 'INVALID_RESPONSE'));
assert.equal(providerCalls, 1, 'un sobre JSON inválido no se reintenta');
const callsBeforeLocalStart = providerCalls;
const localStartAfterScenarioError = await gemini.startDynamicSimulation(
  invalidEnvelopeScenarios.value[0],
  { role: 'profesional', experienceLevel: 'intermedio', fullName: 'Ariana Gómez', skills: ['liderazgo'] },
  fakeInterviewer,
);
assert.equal(localStartAfterScenarioError.ok, true, 'si falla la generación de escenarios puede iniciarse con la opción local');
assert.equal(localStartAfterScenarioError.value.messages.length, 1, 'el escenario local tiene una sola bienvenida');
assert.equal(providerCalls, callsBeforeLocalStart, 'el escenario local no espera una segunda solicitud de bienvenida');
gemini.endSimulation();
providerCalls = 0;
mockedFailure = { status: 429, json: async () => ({ ok: false, error: { code: 'resource-exhausted', message: 'límite simulado' } }) };
const integrationResult = await gemini.startSimulation(scenarioConfig, { role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer);
assert.equal(integrationResult.ok, true, 'startSimulation debe continuar después de HTTP 429');
assert.equal(integrationResult.value.messages.length, 1, 'la pregunta de bienvenida debe aparecer una vez');
assert.match(integrationResult.value.messages[0].content, /¿cuál es tu nombre\?/i);
const nameAnswer = await gemini.sendMessage('Ariana Gómez');
assert.equal(nameAnswer.ok, true, 'la entrevista local debe recoger el nombre del candidato');
assert.equal(gemini.getCurrentSession().candidateName, 'Ariana Gómez');
assert.equal(gemini.getCurrentSession().messages.filter((message) => message.metadata?.isCandidateName).length, 1);
assert.match(nameAnswer.value.message.content, /Ariana Gómez.*trayectoria profesional/i);
for (let i = 0; i < 5; i += 1) {
  const turn = await gemini.sendMessage(`En un proyecto profesional coordiné un equipo y resolví un reto con resultados medibles. Respuesta ${i + 1}.`);
  assert.equal(turn.ok, true, `la respuesta ${i + 1} debe continuar en modo local`);
}
assert.equal(providerCalls, 1, 'HTTP 429 no debe provocar reintento ni llamadas posteriores');
const completedSession = gemini.getCurrentSession();
assert.equal(completedSession.messages.filter((message) => message.role === 'model').length, 7, 'la bienvenida aparece una vez y cada respuesta recibe un único turno del entrevistador');
assert.equal(completedSession.status, 'completed', 'el quinto turno cierra la entrevista local');
assert.equal(gemini.isUsingFallback(), true);
const { evaluatePerformance } = await server.ssrLoadModule('/src/services/ai/evaluationService.ts');
const evaluationResult = await evaluatePerformance({
  userId: 'test-user', scenarioId: completedSession.scenarioId, messages: completedSession.messages,
  scenarioState: { progress: completedSession.scenarioState.progress, resources: completedSession.scenarioState.resources },
});
assert.equal(evaluationResult.ok, true);
assert.match(evaluationResult.value.summary, /Evaluación Local/i);
assert.equal(providerCalls, 1, 'evaluar en modo local no debe llamar a Gemini');
gemini.endSimulation();
// La acción de interrumpir cancela un turno remoto pendiente y devuelve una respuesta local útil.
providerCalls = 0;
mockedFailure = { status: 200, json: async () => ({ ok: true, text: '¿Qué reto profesional resolviste?' }) };
assert.equal((await gemini.startSimulation(scenarioConfig, { fullName: 'Ariana Gómez', role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer)).ok, true);
mockedFailure = 'pending';
providerCalls = 0;
const interruptedTurn = gemini.sendMessage('Organicé las prioridades y entregué el proyecto con resultados medibles.');
await waitForProviderCall();
assert.equal(gemini.interruptCurrentTurnLocally(), true, 'se permite interrumpir la solicitud Gemini pendiente');
const interruptedResult = await interruptedTurn;
assert.equal(interruptedResult.ok, true, 'la cancelación elegida continúa la conversación localmente');
assert.ok(interruptedResult.value.message.content.length > 40);
assert.equal(gemini.getCurrentSession().messages.filter((message) => message.role === 'user').length, 1, 'la respuesta interrumpida no se duplica');
assert.equal(gemini.getCurrentSession().messages.filter((message) => message.role === 'model').length, 2, 'se conserva una bienvenida y se añade un seguimiento local');
assert.equal(gemini.getFallbackReason(), 'INTERRUPTED_LOCAL');
assert.equal(providerCalls, 1, 'la interrupción no reintenta Gemini');
gemini.endSimulation();

// Cerrar durante una solicitud que ignora AbortSignal invalida la respuesta tardía y permite una sesión nueva.
providerCalls = 0;
mockedFailure = { status: 200, json: async () => ({ ok: true, text: 'Cuéntame de tu experiencia.' }) };
const closingStart = await gemini.startSimulation(scenarioConfig, { fullName: 'Ariana Gómez', role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer);
assert.equal(closingStart.ok, true);
const closingSessionId = closingStart.value.id;
mockedFailure = 'deferred';
providerCalls = 0;
const lateTurn = gemini.sendMessage('Una respuesta profesional suficientemente detallada para probar el cierre.');
await waitForProviderCall();
gemini.abortCurrentTurn();
gemini.endSimulation();
resolveDeferredFetch({ ok: true, status: 200, json: async () => ({ ok: true, text: 'Esta respuesta llegó después del cierre.' }) });
const closedTurnResult = await lateTurn;
assert.equal(closedTurnResult.ok, false);
assert.equal(closedTurnResult.error.code, 'ABORTED');
assert.equal(gemini.getCurrentSession(), null, 'la respuesta tardía no reactiva la sesión cerrada');
mockedFailure = { status: 200, json: async () => ({ ok: true, text: 'Nueva entrevista: ¿qué experiencia quieres destacar?' }) };
const restartedSession = await gemini.startSimulation(scenarioConfig, { role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer);
assert.equal(restartedSession.ok, true, 'se puede iniciar una entrevista después del cierre');
assert.notEqual(restartedSession.value.id, closingSessionId);
assert.equal(gemini.getCurrentSession().id, restartedSession.value.id);
gemini.endSimulation();
// Una bienvenida Gemini exitosa seguida por HTTP 500 en Modo Caos conserva sesión,
// añade un imprevisto local y mantiene la conversación sin llamadas posteriores.
providerCalls = 0;
mockedFailure = { status: 200, json: async () => ({ ok: true, text: '¿Puedes contarme sobre un reto profesional que hayas resuelto?' }) };
const chaosStart = await gemini.startSimulation(scenarioConfig, { fullName: 'Ariana Gómez', role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer);
assert.equal(chaosStart.ok, true);
assert.equal(chaosStart.value.messages.length, 1, 'la bienvenida inicial se conserva una sola vez');
mockedFailure = { status: 200, json: async () => ({ ok: true, text: '¿Qué resultado medible obtuviste y cómo lo comprobaste?' }) };
assert.equal((await gemini.sendMessage('Coordiné el equipo y entregamos a tiempo.')).ok, true);
assert.equal((await gemini.sendMessage('El resultado fue una reducción de retrasos del 20%.')).ok, true);
const beforeChaos = gemini.getCurrentSession();
assert.equal(beforeChaos.messages.filter((message) => message.role === 'model').length, 3, 'la bienvenida no se repite en respuestas consecutivas');
assert.equal(beforeChaos.messages.filter((message) => message.id === chaosStart.value.messages[0].id).length, 1, 'el historial no duplica el mensaje inicial');
mockedFailure = { status: 500, json: async () => ({ ok: false, error: { code: 'internal', message: 'mock server error' } }) };
const chaosResult = await gemini.triggerChaos();
assert.equal(chaosResult.ok, true, 'un 500 de imprevisto debe activar el imprevisto local');
assert.match(chaosResult.value.response.content, /Surgió un cambio importante/i);
assert.equal(gemini.getCurrentSession().status, 'active', 'el fallo del proveedor no invalida la sesión');
assert.equal(gemini.getCurrentSession().candidateName, 'Ariana Gómez');
assert.equal(gemini.getCurrentSession().messages.filter((message) => message.id === chaosResult.value.response.id).length, 1);
assert.equal(providerCalls, 4, 'se realizan solo la bienvenida, dos respuestas y una solicitud de imprevisto');
const afterChaos = await gemini.sendMessage('Priorizaría el impacto en el cliente, alinearía al equipo y comunicaría plazos concretos.');
assert.equal(afterChaos.ok, true, 'la entrevista sigue después del respaldo local del imprevisto');
assert.equal(providerCalls, 4, 'la conversación local posterior no depende de Gemini');
assert.equal(gemini.getCurrentSession().status, 'active');
assert.match(gemini.getCurrentSession().messages.at(-1).content, /Pregunta|¿|Surgió/i);
assert.equal(gemini.getCurrentSession().messages.filter((message) => message.role === 'model' && /Hola, soy Mateo/i.test(message.content)).length, 0, 'no se reinicia el saludo al cambiar al respaldo local');
gemini.endSimulation();
const callsBeforePredefined = providerCalls;
const predefinedSession = await gemini.startDynamicSimulation(
  { id: 'liderazgo_equipo', title: 'Práctica predefinida', description: 'Coordinar una entrega.', difficulty: 'medio', isFallback: true },
  { role: 'profesional', experienceLevel: 'intermedio', fullName: 'Ariana Gómez' },
  fakeInterviewer,
);
assert.equal(predefinedSession.ok, true);
assert.equal(predefinedSession.value.messages.length, 1);
assert.equal(gemini.getFallbackReason(), 'Escenario predefinido');
assert.equal(providerCalls, callsBeforePredefined, 'el escenario predefinido no debe llamar a Gemini al iniciar');
assert.equal((await gemini.triggerChaos()).ok, true, 'una sesión nueva no hereda el cooldown de imprevistos anterior');
for (let i = 0; i < 5; i += 1) {
  assert.equal((await gemini.sendMessage(`Organicé el trabajo, prioricé resultados y comuniqué los riesgos con claridad. Turno ${i + 1}.`)).ok, true);
}
assert.equal(gemini.getCurrentSession().status, 'completed', 'una sesión predefinida termina una entrevista completa');
assert.equal(providerCalls, callsBeforePredefined, 'la entrevista local completa no realiza solicitudes a Gemini');
gemini.endSimulation();
for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'PERMISSION_DENIED'], [500, 'SERVICE_UNAVAILABLE']]) {
  mockedFailure = { status, json: async () => ({ ok: false, error: { code: 'gemini-error', message: `mock ${status}` } }) };
  const errorResult = await gemini.startSimulation(scenarioConfig, { role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer);
  assert.equal(errorResult.ok, true, `HTTP ${status} debe permitir bienvenida local`);
  assert.equal(gemini.getFallbackReason(), code, `HTTP ${status} debe conservar su clasificación real`);
  gemini.endSimulation();
}
for (const [serverCode, expectedReason] of [['configuration-error', 'CONFIG_MISSING'], ['internal', 'UNKNOWN_ERROR']]) {
  mockedFailure = { status: 500, json: async () => ({ ok: false, error: { code: serverCode, message: `mock ${serverCode}` } }) };
  const serverFailureStart = await gemini.startSimulation(scenarioConfig, { role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer);
  assert.equal(serverFailureStart.ok, true, `${serverCode} conserva el inicio local`);
  assert.equal(gemini.getFallbackReason(), expectedReason, `${serverCode} no se clasifica como SERVICE_UNAVAILABLE genérico`);
  gemini.endSimulation();
}
mockedFailure = 'connection';
assert.equal((await gemini.startSimulation(scenarioConfig, { role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer)).ok, true);
assert.equal(gemini.getFallbackReason(), 'NETWORK_ERROR');
gemini.endSimulation();
mockedFailure = { status: 200, json: async () => { throw new SyntaxError('JSON truncado'); } };
assert.equal((await gemini.startSimulation(scenarioConfig, { role: 'profesional', experienceLevel: 'intermedio' }, fakeInterviewer)).ok, true);
assert.equal(gemini.getFallbackReason(), 'INVALID_RESPONSE');
gemini.endSimulation();
console.log('OK: integración con HTTP 429 hizo una sola solicitud y completó inicio, cinco respuestas y evaluación local.');
globalThis.fetch = realFetch;
await server.close();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  globalThis.fetch = realFetch;
  if (server) await server.close();
}

console.log('OK: flujo local completo, respuesta por turno, evaluación local, 429 sin reintentos, clasificación de errores y requisitos de entrevistadores/voz.');
