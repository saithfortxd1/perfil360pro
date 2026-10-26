const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perfil360-playback-'));
let checks = 0;

function check(label, actual, expected) {
  if (arguments.length < 3) {
    assert.ok(actual, label);
  } else {
    assert.deepEqual(actual, expected, label);
  }
  checks += 1;
  console.log(`PASS ${label}`);
}

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

try {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    'src/services/ai/interviewerPlaybackPolicy.ts',
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

  const { selectInterviewerPlaybackRoute } = require(path.join(tempDir, 'interviewerPlaybackPolicy.js'));
  const ready = {
    hasActiveSession: true,
    requiresLiveAvatar: true,
    avatarState: 'connected',
    isVideoReady: true,
    ttsEnabled: true,
    browserTtsAvailable: true,
    muted: false,
  };

  check('video track not ready keeps audio queued', selectInterviewerPlaybackRoute({ ...ready, isVideoReady: false }), 'wait');
  check('connected state without ready dimensions does not play speech', selectInterviewerPlaybackRoute({ ...ready, isVideoReady: false }), 'wait');
  check('avatar error does not fall back to browser speech', selectInterviewerPlaybackRoute({ ...ready, avatarState: 'error' }), 'unavailable');
  check('disconnected avatar reports unavailable playback', selectInterviewerPlaybackRoute({ ...ready, avatarState: 'disconnected' }), 'unavailable');
  check('ready LiveAvatar selects the server TTS route', selectInterviewerPlaybackRoute(ready), 'avatar-tts');
  check('ready LiveAvatar with TTS disabled never falls back to browser speech', selectInterviewerPlaybackRoute({ ...ready, ttsEnabled: false }), 'unavailable');
  check('profiles without LiveAvatar use the browser voice route', selectInterviewerPlaybackRoute({ ...ready, requiresLiveAvatar: false }), 'browser-fallback');
  check('muted audio starts no playback route', selectInterviewerPlaybackRoute({ ...ready, muted: true }), 'silent');
  check('inactive sessions cannot start playback', selectInterviewerPlaybackRoute({ ...ready, hasActiveSession: false }), 'silent');
  check('missing avatar TTS and browser voice report unavailable playback',
    selectInterviewerPlaybackRoute({ ...ready, ttsEnabled: false, browserTtsAvailable: false }), 'unavailable');

  const simulator = source('src/pages/SimuladorInmersivo.tsx');
  check('queued speech is bound to the originating session and interviewer',
    simulator.includes('sessionId: session.id, interviewerId: profile.id') &&
    simulator.includes('pendingQuestion.sessionId !== session.id') &&
    simulator.includes('pendingQuestion.interviewerId !== profile.id'));
  check('ending or cancelling invalidates queued questions',
    simulator.includes('pendingQuestionIdRef.current += 1') &&
    simulator.includes('startedPendingQuestionRef.current = null') &&
    simulator.includes('cancelInterviewerSpeech();'));
  check('late TTS responses from an interrupted or replaced request cannot play',
    simulator.includes('speechRequestIdRef.current += 1') &&
    simulator.includes('speechAbortRef.current?.abort()') &&
    simulator.includes('speechRequestIdRef.current !== requestId') &&
    simulator.includes('!session') &&
    simulator.includes('activeSessionIdRef.current !== session.id') &&
    simulator.includes('activeInterviewerIdRef.current !== profile.id'));
  check('automatic and manual microphone capture wait for the avatar readiness gate',
    /if \(pendingQuestion \|\| \(requiresLiveAvatar && !liveAvatarReady\) \|\| heygenAvatar\.audioCommandStatus === 'sent'\) return;/.test(simulator) &&
    /pendingQuestion !== null \|\| \(requiresLiveAvatar && !liveAvatarReady\)/.test(simulator) &&
    /heygenAvatar\.audioCommandStatus === 'sent' \|\| pendingQuestion !== null/.test(simulator) &&
    /if \(ttsBusy\) return;/.test(simulator));
  check('the voice router selects one route and only uses browser speech for non-avatar profiles',
    simulator.includes("playbackRoute === 'avatar-tts'") &&
    simulator.includes("playbackRoute === 'browser-fallback'") &&
    simulator.includes('if (sent.ok) return;') &&
    simulator.includes("playbackRoute === 'unavailable'") &&
    simulator.includes('No se usará Web Speech como sustituto.'));
  check('failed and disabled avatar TTS expose a recoverable message without browser playback',
    simulator.includes('TTS deshabilitado por configuración.') &&
    simulator.includes('Reintentar voz') &&
    simulator.includes('onClick={repeatQuestion}'));
  check('a new interview moves focus and scrolls to the scenario rather than the transcript end',
    simulator.includes('interviewStageRef.current') &&
    simulator.includes('stage.focus({ preventScroll: true })') &&
    simulator.includes('stage.scrollIntoView') &&
    simulator.includes('}, [session?.id, reducedMotion]);'));
  check('UI exposes waiting state and no-voice-before-ready message',
    simulator.includes('Esperando que el vídeo esté listo') &&
    simulator.includes('La pregunta está lista. Se reproducirá cuando el vídeo y la sesión del avatar estén preparados.'));
  check('interviewer cards use initials rather than unauthorized portraits and identify local voice samples',
    simulator.includes('profile.name.charAt(0)') &&
    simulator.includes('Probar voz local') &&
    simulator.includes('no representa la voz de Gemini'));
  check('LiveAvatar preview requires an explicit user action and can be stopped before an interview',
    simulator.includes('Conectar avatar para vista previa') &&
    simulator.includes('puede consumir cuota') &&
    simulator.includes('Detener vista previa') &&
    simulator.includes('onClick={() => void heygenAvatar.stop()}'));
  check('mobile simulator keeps the preview wide, controls touch-sized, and respects the device safe area',
    simulator.includes('p-3 sm:gap-6 sm:p-6') &&
    simulator.includes('min-h-11') &&
    simulator.includes('env(safe-area-inset-bottom)'));
  check('development latency diagnostics measure transcript, text, TTS, and SDK handoff without logging content',
    simulator.includes('[latencia] transcripción final recibida') &&
    simulator.includes('transcriptToSubmitMs') &&
    simulator.includes('envío del candidato → texto de respuesta listo') &&
    simulator.includes('síntesis TTS terminada') &&
    simulator.includes('errorCode: result.ok ? null : result.error.code') &&
    simulator.includes('envío local de audio a LiveAvatar SDK') &&
    !simulator.includes('console.debug(`[latencia] ${clean}`'));
  check('confirmed speech end enables the microphone without an additional 200ms wait',
    simulator.includes('heygenAvatar.audioCommandStatus === \'sent\'') &&
    simulator.includes('if (!speech.isListening) speech.startListening();') &&
    !/setTimeout\(\(\) => \{\s*if \(!speech\.isListening\) speech\.startListening\(\);\s*\},\s*200\)/.test(simulator));

  console.log(`RESULTADO: ${checks} comprobaciones locales de selección y enrutamiento pasaron; sin llamadas externas.`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
