const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perfil360-avatar-profiles-'));
let checks = 0;

function check(label, condition) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${label}`);
}

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

try {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(root, 'src', 'services', 'ai', 'interviewers.ts'),
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

  const profiles = require(path.join(tempDir, 'interviewers.js'));
  const james = profiles.getInterviewerById('james');
  const olivia = profiles.getInterviewerById('olivia');
  const mateo = profiles.getInterviewerById('mateo');
  check('James has the user-confirmed LiveAvatar ID without an assumed voice gender',
    james?.liveAvatarId === '69a246bd-1739-418d-b533-9fc578208175' &&
    james.gender === 'no especificado' &&
    james.voice.provider === 'gemini-tts');
  check('Olivia has her configured LiveAvatar ID and feminine conversational identity',
    olivia?.liveAvatarId === 'dc6a2ade-fcad-48b4-89ce-8ae807b18c32' && olivia.gender === 'mujer');
  check('Mateo has his configured LiveAvatar ID and masculine conversational identity',
    mateo?.liveAvatarId === 'c6fe7922-ef30-4928-98b2-95e44bdf3f1e' && mateo.gender === 'hombre');
  check('legacy interviewer profiles remain available as browser-voice profiles',
    ['valeria', 'andres', 'camila'].every((id) => profiles.getInterviewerById(id)?.liveAvatarId === null));
  check('the three configured LiveAvatar profiles use server-managed Gemini TTS',
    [james, olivia, mateo].every((profile) =>
      profile?.liveAvatarId &&
      profile.voice.provider === 'gemini-tts' &&
      profile.voice.selection === 'server-default'));
  check('exactly three profiles map to the authorized LiveAvatar avatars',
    profiles.INTERVIEWER_PROFILES.filter((profile) => profile.liveAvatarId !== null).length === 3);

  const simulator = source('src/pages/SimuladorInmersivo.tsx');
  const service = source('src/services/ai/heygenService.ts');
  const hook = source('src/hooks/useHeyGenAvatar.ts');
  const gemini = source('src/services/ai/geminiService.ts');
  const backend = source('netlify/lib/liveAvatarApi.ts');
  const sessionFunction = source('netlify/functions/heygen-session.ts');
  const voiceService = source('src/services/ai/interviewerVoiceService.ts');
  const ttsFunction = source('netlify/functions/tts.ts');
  const speechHook = source('src/hooks/useSpeech.ts');
  const sdkImplementation = source('node_modules/@heygen/liveavatar-web-sdk/lib/index.esm.js');

  check('selected profile is passed to Gemini and to the LiveAvatar session request',
    simulator.includes('startDynamicSimulation(scenario, professionalProfile, profile)') &&
    simulator.includes('heygenAvatar.connect(user.uid, profile.liveAvatarId)'));
  check('selected interviewer is restored and persisted locally',
    simulator.includes('localStorage.getItem(SELECTED_INTERVIEWER_STORAGE_KEY)') &&
    simulator.includes('localStorage.setItem(SELECTED_INTERVIEWER_STORAGE_KEY, selectedAvatar)'));
  check('session request sends the selected ID without a configured-avatar fallback',
    service.includes('body: JSON.stringify({ avatarId })') &&
    service.includes('returnedSession.avatarId.trim().toLowerCase() !== avatarId.trim().toLowerCase()'));
  check('Gemini system prompt receives the selected name, gender, role, and conversational style',
    gemini.includes('PERSONA ENTREVISTADORA: ${interviewer.name}') &&
    gemini.includes('IDENTIDAD DE GÉNERO: ${interviewer.gender}') &&
    gemini.includes('CARGO: ${interviewer.role}') &&
    gemini.includes('ESTILO: ${interviewer.conversationalStyle}'));
  check('opening the simulator does not start a session before a simulation exists',
    /if \(!session \|\| !user \|\| !profile\.liveAvatarId\) return;[\s\S]*?heygenAvatar\.connect/.test(simulator));
  check('scenario selection only sets a pending scenario and explicit start begins the interview',
    /const handleScenarioSelect = useCallback\([\s\S]*?setPendingScenarioId\(scenarioId\);[\s\S]*?\);[\s\S]*?const startSelectedScenario = useCallback[\s\S]*?startDynamicSimulation\(scenario, professionalProfile, profile\)/.test(simulator) &&
    simulator.includes('onClick={() => void startSelectedScenario()}'));
  check('interviewer cards provide a browser-only sample without synthesizing remotely',
    simulator.includes('Probar voz local') &&
    simulator.includes('speech.previewVoice(') &&
    simulator.includes('no representa la voz de Gemini') &&
    /previewVoice: \(voiceURI\?: string, text\?: string\) => void/.test(speechHook));
  check('connection requests are guarded against duplicate clicks and time out',
    hook.includes('connectingRef.current || sessionRef.current') &&
    hook.includes('20_000') &&
    hook.includes('30_000'));
  check('video-ready requires a live video track, successful playback, current data, and dimensions',
    hook.includes("track.readyState === 'live'") &&
    hook.includes('await video.play()') &&
    hook.includes('video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA') &&
    hook.includes('video.videoWidth === 0') &&
    hook.includes('video.videoHeight === 0'));
  check('ended video tracks trigger recovery and custom track listeners are removed during cleanup',
    hook.includes("videoTrack.addEventListener('ended', handleTrackEnded") &&
    hook.includes("track.removeEventListener('ended', handler)") &&
    hook.includes('La pista de vídeo del avatar se interrumpió'));
  check('backend issues a token while the SDK owns the session start',
    backend.includes('/v1/sessions/token') &&
    !backend.includes('fetch(`${LIVEAVATAR_API_BASE}/v1/sessions/start') &&
    !backend.includes('HEYGEN_DEFAULT_AVATAR_ID') &&
    sessionFunction.includes('Se requiere el ID del avatar seleccionado.') &&
    hook.includes('const startPromise = session.start()') &&
    hook.includes('Promise.race([startPromise, startTimeout])'));
  check('server-generated PCM is normalized and sent through the SDK audio-input method',
    voiceService.includes('toLiveAvatarPcm24k') &&
    hook.includes('session.repeatAudio(base64Pcm24k)') &&
    !simulator.includes('new Audio('));
  check('pending TTS requests are aborted on interruption and interview end',
    voiceService.includes('signal,') &&
    simulator.includes('speechAbortRef.current?.abort()') &&
    simulator.includes('cancelInterviewerSpeech();'));
  check('Gemini TTS voice is selected from the active interviewer on the server',
    simulator.includes('synthesizeInterviewerSpeech(clean, profile.id, abortController.signal)') &&
    voiceService.includes('JSON.stringify({ text, interviewerId })') &&
    ttsFunction.includes("interviewerId === 'olivia'") &&
    ttsFunction.includes("GEMINI_TTS_VOICE_OLIVIA") &&
    ttsFunction.includes("'Aoede'") &&
    ttsFunction.includes("GEMINI_TTS_VOICE_MATEO") &&
    ttsFunction.includes("'Puck'"));
  check('browser fallback voice preference is stored separately for each interviewer',
    simulator.includes('voicePreferenceKey: `perfil360.voice.uri.${profile.id}`') &&
    speechHook.includes('localStorage.getItem(voicePreferenceKey)') &&
    speechHook.includes('localStorage.setItem(voicePreferenceKey, voiceURI)'));
  check('SDK session stop is primary and Netlify end is only a fallback',
    hook.includes('await session.stop()') &&
    hook.includes('if (sessionId && !closedBySdk)') &&
    hook.includes("await endHeyGenSession(sessionId, sessionToken ?? undefined)"));
  check('avatar remains hidden behind the placeholder until the video stream is ready',
    /const showVideo = heygenEnabled && isStreamReady/.test(simulator) &&
    /showVideo \? 'z-10 opacity-100' : 'opacity-0'/.test(simulator));
  check('installed SDK requires both remote tracks before emitting stream-ready or attaching media',
    sdkImplementation.includes('if (hasVideoTrack && hasAudioTrack)') &&
    /attach\(element\) \{[\s\S]*?if \(!this\._remoteVideoTrack \|\| !this\._remoteAudioTrack\)/.test(sdkImplementation) &&
    sdkImplementation.includes('this._remoteVideoTrack.attach(element)') &&
    sdkImplementation.includes('this._remoteAudioTrack.attach(element)'));
  check('installed SDK repeatAudio requires a connected session event socket and sends audio chunks',
    /repeatAudio\(audio\) \{[\s\S]*?if \(!this\._sessionEventSocket\)/.test(sdkImplementation) &&
    sdkImplementation.includes('CommandEventsEnum.AVATAR_SPEAK_AUDIO') &&
    sdkImplementation.includes('splitPcm24kStringToChunks(commandEvent.audio)'));
  check('hook guards stale stream retries and exposes browser-muted audio recovery',
    hook.includes('attachGenerationRef.current !== generation') &&
    hook.includes('audioPlaybackMuted') &&
    hook.includes('enableAudioPlayback') &&
    hook.includes("video.addEventListener('volumechange', handleVolumeChange)") &&
    simulator.includes('Activar audio del avatar'));
  check('autoplay denial preserves the connected session and provides an explicit playback recovery',
    hook.includes("result.reason === 'play-rejected:NotAllowedError'") &&
    hook.includes('se conserva la sesión para permitir reproducción mediante un gesto del usuario') &&
    hook.includes('video.muted = false') &&
    hook.includes('await video.play()'));
  check('audio diagnostics log validated format and duration without logging audio payload',
    hook.includes('sampleRate: 24_000') &&
    hook.includes('bitsPerSample: 16') &&
    hook.includes('durationMs: validation.durationMs') &&
    hook.includes('esperando eventos de voz del avatar') &&
    hook.includes('se recibió confirmación de inicio de voz del avatar') &&
    hook.includes('se recibió confirmación de fin de voz del avatar'));
  check('per-profile TTS voices are selected server-side; other profiles retain per-profile browser preferences',
    ttsFunction.includes("interviewerId === 'james'") &&
    ttsFunction.includes('GEMINI_TTS_VOICE_JAMES') &&
    ttsFunction.includes("interviewerId === 'olivia'") &&
    ttsFunction.includes('GEMINI_TTS_VOICE_OLIVIA') &&
    ttsFunction.includes("GEMINI_TTS_VOICE_MATEO") &&
    ['valeria', 'andres', 'camila'].every((id) => profiles.getInterviewerById(id)?.voice.provider === 'browser') &&
    simulator.includes('voicePreferenceKey: `perfil360.voice.uri.${profile.id}`'));
  check('video diagnostics distinguish track readiness, media events, playback, and real dimensions',
    hook.includes("video.addEventListener('loadedmetadata', handleLoadedMetadata)") &&
    hook.includes("video.addEventListener('canplay', handleCanPlay)") &&
    hook.includes("video.addEventListener('playing', handlePlaying)") &&
    hook.includes('videoWidth: video.videoWidth') &&
    hook.includes('videoHeight: video.videoHeight'));
  check('TTS errors distinguish disabled configuration, MIME mismatch, PCM conversion, session readiness, and SDK sending',
    simulator.includes('VITE_INTERVIEWER_TTS_ENABLED=true') &&
    voiceService.includes('unexpected-audio-format') &&
    voiceService.includes('audio-format') &&
    hook.includes('session-not-ready') &&
    hook.includes('sdk-send-failed'));
  check('late TTS results are discarded after the session or interviewer changes',
    simulator.includes('activeInterviewerIdRef.current !== profile.id') &&
    simulator.includes('activeSessionIdRef.current !== session.id') &&
    simulator.includes('speechAbortRef.current?.abort()'));
  check('avatar stage has no 42rem cap and keeps a 16:9, uncropped video in the flexible grid',
    !simulator.includes('max-w-[42rem]') &&
    simulator.includes('max-w-[96rem]') &&
    simulator.includes('aspect-video') &&
    simulator.includes('object-contain') &&
    simulator.includes('lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]'));

  console.log(`RESULTADO: ${checks} comprobaciones locales pasaron; sin llamadas externas.`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
