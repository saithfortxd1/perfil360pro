/**
 * Hook de integración con HeyGen LiveAvatar SDK (modo LITE).
 *
 * Responsabilidades:
 * - Crear y gestionar el ciclo de vida de la sesión del SDK.
 * - Adjuntar el stream de video real al elemento <video>.
 * - Exponer estados de conexión/habla/error.
 * - Notificar cuando la entrevistadora termina de hablar (para activar el micrófono).
 * - Liberar recursos al terminar o al desmontar.
 *
 * API usada del SDK (verificada en @heygen/liveavatar-web-sdk):
 * - new LiveAvatarSession(sessionToken, config?)
 * - session.start() / session.stop()
 * - session.attach(HTMLMediaElement)
 * - session.repeatAudio(PCM 24 kHz mono) / session.interrupt()
 * - session.interrupt()
 * - eventos: SessionEvent.SESSION_STREAM_READY / SESSION_STATE_CHANGED / SESSION_DISCONNECTED
 *            AgentEventsEnum.AVATAR_SPEAK_STARTED / AVATAR_SPEAK_ENDED
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  AgentEventsEnum,
  SessionMode,
} from '@heygen/liveavatar-web-sdk';
import { requestHeyGenSession, endHeyGenSession } from '@/services/ai/heygenService';
import { validateBase64Pcm24k } from '@/services/ai/pcmAudio';

export type HeyGenAvatarState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'error'
  | 'disconnected';

export interface UseHeyGenAvatarOptions {
  /** Se llama cuando la entrevistadora termina de hablar. */
  onSpeakEnd?: () => void;
  /** Se llama cuando el avatar empieza a hablar. */
  onSpeakStart?: () => void;
}

export interface UseHeyGenAvatarReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: HeyGenAvatarState;
  sessionId: string | null;
  error: string | null;
  errorCode: string | null;
  isAvailable: boolean;
  /** true cuando el stream de video está realmente listo para mostrarse. */
  isStreamReady: boolean;
  /** El SDK puede silenciar el elemento de vídeo si el navegador bloquea autoplay audible. */
  audioPlaybackMuted: boolean;
  audioPlaybackError: string | null;
  audioCommandStatus: 'idle' | 'sent' | 'confirmed' | 'unconfirmed';
  audioCommandError: string | null;
  /** true si la sesión admite texto directo (solo en modo FULL). En LITE siempre es false. */
  canAcceptText: boolean;
  connectionPending: boolean;
  enableAudioPlayback: () => Promise<boolean>;
  connect: (userId: string, avatarId: string) => Promise<void>;
  /**
   * Reproduce AUDIO con lip-sync. `base64Pcm24k` debe ser PCM 16-bit, 24 kHz, mono en Base64.
   * Es la ÚNICA vía de voz en modo LITE: `message()` y `repeat()` lanzan
   * "Not permitted in LITE mode" en el SDK instalado (v0.0.19).
   * @returns true si el audio se envió correctamente.
   */
  speakAudio: (base64Pcm24k: string) =>
    | { ok: true }
    | { ok: false; code: 'session-not-ready' | 'invalid-pcm' | 'sdk-send-failed'; message: string };
  interrupt: () => void;
  stop: () => Promise<void>;
}

async function closeAvatarSession(
  session: LiveAvatarSession | null,
  sessionId: string | null,
  sessionToken: string | null,
): Promise<void> {
  let closedBySdk = false;

  if (session) {
    try {
      await session.stop();
      closedBySdk = session.state === SessionState.DISCONNECTED;
    } catch (stopError) {
      console.error('[HeyGenAvatar] stop falló:', stopError instanceof Error ? stopError.message : 'unknown');
    }
  }

  if (sessionId && !closedBySdk) {
    try {
      await endHeyGenSession(sessionId, sessionToken ?? undefined);
    } catch (endError) {
      console.error('[HeyGenAvatar] cierre de respaldo falló:', endError instanceof Error ? endError.message : 'unknown');
    }
  }
}

type StreamAttachResult =
  | { ready: true }
  | { ready: false; reason: string };

export function useHeyGenAvatar(options: UseHeyGenAvatarOptions = {}): UseHeyGenAvatarReturn {
  const { onSpeakEnd, onSpeakStart } = options;

  const [state, setState] = useState<HeyGenAvatarState>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [audioPlaybackMuted, setAudioPlaybackMuted] = useState(false);
  const [audioPlaybackError, setAudioPlaybackError] = useState<string | null>(null);
  const [audioCommandStatus, setAudioCommandStatus] = useState<UseHeyGenAvatarReturn['audioCommandStatus']>('idle');
  const [audioCommandError, setAudioCommandError] = useState<string | null>(null);
  const [isAvailable] = useState(() => import.meta.env.VITE_HEYGEN_ENABLED === 'true');
  const [connectionPending, setConnectionPending] = useState(false);

  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const connectAttemptRef = useRef(0);
  const pendingStartRef = useRef<Promise<void> | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const pendingStopRef = useRef(false);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoTrackEndHandlerRef = useRef<(() => void) | null>(null);
  const isClosingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCommandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCommandStartedAtRef = useRef<number | null>(null);
  const connectStartedAtRef = useRef<number | null>(null);
  const speakEndRef = useRef(onSpeakEnd);
  const speakStartRef = useRef(onSpeakStart);

  speakEndRef.current = onSpeakEnd;
  speakStartRef.current = onSpeakStart;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const logMediaEvent = (eventName: string) => {
      console.info(`[HeyGenAvatar] video.${eventName}:`, {
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        paused: video.paused,
        muted: video.muted,
        audioTracks: video.srcObject instanceof MediaStream ? video.srcObject.getAudioTracks().length : 0,
        videoTracks: video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks().length : 0,
      });
    };
    const handleLoadedMetadata = () => logMediaEvent('loadedmetadata');
    const handleCanPlay = () => logMediaEvent('canplay');
    const handlePlaying = () => logMediaEvent('playing');
    const handleVolumeChange = () => {
      const hasAudioTrack = video.srcObject instanceof MediaStream && video.srcObject.getAudioTracks().length > 0;
      setAudioPlaybackMuted(video.muted && hasAudioTrack);
      if (video.muted && hasAudioTrack) {
        setAudioPlaybackError('El navegador silenció la pista de audio del avatar. Usa Activar audio del avatar para recuperarla.');
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('volumechange', handleVolumeChange);
    console.info('[HeyGenAvatar] listener de diagnóstico asociado al elemento video:', {
      elementAvailable: true,
      sessionAvailable: Boolean(sessionId),
    });
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [isAvailable, sessionId]);

  const clearVideoTrackHandler = useCallback(() => {
    const track = videoTrackRef.current;
    const handler = videoTrackEndHandlerRef.current;
    if (track && handler) track.removeEventListener('ended', handler);
    videoTrackRef.current = null;
    videoTrackEndHandlerRef.current = null;
  }, []);

  const failStreamRef = useRef<(session: LiveAvatarSession, message: string) => Promise<void>>(async () => {});

  /**
   * Adjunta el stream al <video> y VERIFICA que realmente hay pista de video.
   * El SDK (`attach`) hace `console.warn("Stream is not yet ready")` y retorna sin
   * lanzar error si las pistas no están listas, por eso comprobamos `srcObject`.
   */
  const attachStream = useCallback(async (session: LiveAvatarSession): Promise<StreamAttachResult> => {
    const video = videoRef.current;
    if (sessionRef.current !== session) return { ready: false, reason: 'session-replaced' };
    if (!video) return { ready: false, reason: 'video-element-missing' };

    try {
      session.attach(video);
    } catch (attachError) {
      const errorName = attachError instanceof Error ? attachError.name : 'unknown';
      console.error('[HeyGenAvatar] attach falló:', errorName);
      return { ready: false, reason: `attach-error:${errorName}` };
    }

    const stream = video.srcObject;
    const videoTrack = stream instanceof MediaStream
      ? stream.getVideoTracks().find((track) => track.readyState === 'live')
      : undefined;
    if (!videoTrack) {
      const audioTrackCount = stream instanceof MediaStream ? stream.getAudioTracks().length : 0;
      return {
        ready: false,
        reason: `remote-tracks-not-attached:audio=${audioTrackCount}:video=${stream instanceof MediaStream ? stream.getVideoTracks().length : 0}`,
      };
    }

    if (videoTrackRef.current !== videoTrack) {
      clearVideoTrackHandler();
      const handleTrackEnded = () => {
        if (sessionRef.current !== session) return;
        setIsStreamReady(false);
        void failStreamRef.current(session, 'La pista de vídeo del avatar se interrumpió. Puedes volver a intentarlo.');
      };
      videoTrackRef.current = videoTrack;
      videoTrackEndHandlerRef.current = handleTrackEnded;
      videoTrack.addEventListener('ended', handleTrackEnded, { once: true });
    }

    try {
      await video.play();
    } catch (playError) {
      const errorName = playError instanceof Error ? playError.name : 'unknown';
      console.warn('[HeyGenAvatar] El navegador no pudo reproducir el stream:', errorName);
      return { ready: false, reason: `play-rejected:${errorName}` };
    }

    if (sessionRef.current !== session || video.srcObject !== stream) {
      return { ready: false, reason: 'session-or-stream-replaced' };
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      return { ready: false, reason: 'video-frame-not-ready' };
    }
    return { ready: true };
  }, [clearVideoTrackHandler]);

  const attachRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachRunRef = useRef<number | null>(null);
  const attachGenerationRef = useRef(0);

  /** Reintenta adjuntar el stream hasta que haya pista de video o se agoten los intentos. */
  const attachWithRetry = useCallback(
    async (session: LiveAvatarSession, generation: number, attempt = 0) => {
      if (sessionRef.current !== session || attachGenerationRef.current !== generation) return;
      if (attempt === 0) {
        if (attachRunRef.current === generation) return;
        attachRunRef.current = generation;
      }
      const result = await attachStream(session);
      if (sessionRef.current !== session || attachGenerationRef.current !== generation) return;
      if (result.ready) {
        if (attachRetryTimerRef.current) {
          clearTimeout(attachRetryTimerRef.current);
          attachRetryTimerRef.current = null;
        }
        attachRunRef.current = null;
        setAudioPlaybackMuted(videoRef.current?.muted ?? false);
        setAudioPlaybackError(null);
        setIsStreamReady(true);
        console.info('[HeyGenAvatar] vídeo listo; estado de reproducción de audio:', {
          muted: videoRef.current?.muted ?? null,
          audioTrackCount: videoRef.current?.srcObject instanceof MediaStream
            ? videoRef.current.srcObject.getAudioTracks().length
            : 0,
        });
        if (import.meta.env.DEV && connectStartedAtRef.current !== null) {
          console.debug('[latencia] conexión LiveAvatar → primer vídeo reproducible:', {
            elapsedMs: Math.round(performance.now() - connectStartedAtRef.current),
          });
        }
        return;
      }
      if (attempt >= 12) {
        attachRunRef.current = null;
        console.error('[HeyGenAvatar] no se pudo adjuntar el stream:', {
          reason: result.reason,
          videoElementAvailable: videoRef.current !== null,
          videoReadyState: videoRef.current?.readyState ?? null,
          videoWidth: videoRef.current?.videoWidth ?? 0,
          videoHeight: videoRef.current?.videoHeight ?? 0,
        });
        if (result.reason === 'play-rejected:NotAllowedError') {
          const video = videoRef.current;
          setAudioPlaybackMuted(video?.muted ?? false);
          setAudioPlaybackError('El navegador bloqueó la reproducción automática. Usa el botón de recuperación para iniciar el vídeo y el audio.');
          setIsStreamReady(false);
          console.warn('[HeyGenAvatar] se conserva la sesión para permitir reproducción mediante un gesto del usuario.');
          return;
        }
        await failStreamRef.current(
          session,
          result.reason === 'video-element-missing'
            ? 'La sesión se conectó, pero el elemento de vídeo no está disponible. Vuelve a intentar.'
            : result.reason.startsWith('play-rejected:')
              ? 'El navegador bloqueó la reproducción del stream. Comprueba los permisos de reproducción y vuelve a intentar.'
              : 'La sesión se conectó, pero no llegaron ambas pistas de audio y vídeo o no se pudo iniciar el vídeo. Comprueba la conexión y vuelve a intentarlo.',
        );
        return;
      }
      if (attempt === 0 || (attempt + 1) % 4 === 0) {
        console.info('[HeyGenAvatar] esperando pistas o primer frame de vídeo:', {
          attempt: attempt + 1,
          reason: result.reason,
          videoElementAvailable: videoRef.current !== null,
          videoReadyState: videoRef.current?.readyState ?? null,
          videoWidth: videoRef.current?.videoWidth ?? 0,
          videoHeight: videoRef.current?.videoHeight ?? 0,
        });
      }
      attachRetryTimerRef.current = setTimeout(() => {
        void attachWithRetry(session, generation, attempt + 1);
      }, 500);
    },
    [attachStream],
  );

  failStreamRef.current = async (session: LiveAvatarSession, message: string) => {
    if (sessionRef.current !== session) return;
    if (attachRetryTimerRef.current) {
      clearTimeout(attachRetryTimerRef.current);
      attachRetryTimerRef.current = null;
    }

    clearVideoTrackHandler();
    attachGenerationRef.current += 1;
    attachRunRef.current = null;
    isClosingRef.current = true;
    await closeAvatarSession(session, sessionIdRef.current, sessionTokenRef.current);
    if (sessionRef.current !== session) return;

    sessionRef.current = null;
    sessionIdRef.current = null;
    sessionTokenRef.current = null;
    setSessionId(null);
    setIsStreamReady(false);
    setAudioPlaybackMuted(false);
    setAudioPlaybackError(null);
    setAudioCommandStatus('idle');
    setAudioCommandError(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setError(message);
    setErrorCode('video-stream-failed');
    setState('error');
  };

  const connect = useCallback(
    async (userId: string, avatarId: string) => {
      if (!isAvailable) {
        setError('HeyGen no está habilitado en este entorno.');
          setErrorCode('configuration-disabled');
          setState('error');
        return;
      }

      if (!avatarId.trim()) {
        setError('El perfil seleccionado no tiene un ID de LiveAvatar configurado; utiliza la alternativa de voz disponible.');
        setErrorCode('invalid-avatar');
        setState('error');
        return;
      }

      if (connectingRef.current || sessionRef.current) {
        if (pendingStopRef.current) {
          setError('La conexión anterior aún no termina de cerrarse. No se iniciará otra sesión en paralelo.');
          setErrorCode('connection-pending');
          setState('error');
        }
        // Ya hay una sesión activa: evitamos duplicados.
        return;
      }

      connectingRef.current = true;
      connectStartedAtRef.current = performance.now();
      setConnectionPending(true);
      const attempt = ++connectAttemptRef.current;
      setState('connecting');
      setError(null);
      setErrorCode(null);
      setIsStreamReady(false);
      setAudioPlaybackMuted(false);
      setAudioPlaybackError(null);
      setAudioCommandStatus('idle');
      setAudioCommandError(null);

      try {
        const requestAbort = new AbortController();
        requestAbortRef.current = requestAbort;
        let requestTimer: ReturnType<typeof setTimeout> | null = null;
        const requestTimeout = new Promise<never>((_, reject) => {
          requestTimer = setTimeout(() => {
            requestAbort.abort();
            reject(new Error('La solicitud de sesión tardó demasiado. Comprueba la conexión y vuelve a intentarlo.'));
          }, 20_000);
        });

        let result: Awaited<ReturnType<typeof requestHeyGenSession>>;
        try {
          result = await Promise.race([requestHeyGenSession(userId, avatarId, requestAbort.signal), requestTimeout]);
          if (import.meta.env.DEV && connectStartedAtRef.current !== null) {
            console.debug('[latencia] solicitud de credenciales LiveAvatar:', {
              elapsedMs: Math.round(performance.now() - connectStartedAtRef.current),
              success: result.ok,
            });
          }
        } finally {
          if (requestTimer) clearTimeout(requestTimer);
          if (requestAbortRef.current === requestAbort) requestAbortRef.current = null;
        }

        if (connectAttemptRef.current !== attempt) return;
        if (!result.ok) {
          setError(result.error.message);
          setErrorCode(result.error.code);
          setState('error');
          return;
        }

        const { sessionToken, sessionId: sid } = result.value;
        // Modo LITE: nosotros controlamos la conversación; LiveAvatar renderiza el video.
        // `voiceChat.defaultMuted` evita que el SDK capture el audio del avatar como si fuera del candidato.
        const session = new LiveAvatarSession(sessionToken, {
          autoKeepAlive: true,
          voiceChat: { defaultMuted: true },
        });
        isClosingRef.current = false;
        sessionRef.current = session;
        const attachGeneration = ++attachGenerationRef.current;
        attachRunRef.current = null;
        sessionIdRef.current = sid;
        sessionTokenRef.current = sessionToken;
        setSessionId(sid);

        session.on(SessionEvent.SESSION_STREAM_READY, () => {
          console.info('[HeyGenAvatar] SDK emitió SESSION_STREAM_READY; comprobando el elemento de vídeo:', {
            elementAvailable: videoRef.current !== null,
          });
          if (import.meta.env.DEV && connectStartedAtRef.current !== null) {
            console.debug('[latencia] conexión LiveAvatar → pistas remotas listas:', {
              elapsedMs: Math.round(performance.now() - connectStartedAtRef.current),
            });
          }
          void attachWithRetry(session, attachGeneration);
        });

        session.on(SessionEvent.SESSION_STATE_CHANGED, (sessionState: SessionState) => {
          if (sessionState === SessionState.CONNECTED) {
            if (import.meta.env.DEV && connectStartedAtRef.current !== null) {
              console.debug('[latencia] solicitud de conexión → sesión conectada:', {
                elapsedMs: Math.round(performance.now() - connectStartedAtRef.current),
              });
            }
            setState((prev) => (prev === 'speaking' ? prev : 'connected'));
          } else if (sessionState === SessionState.DISCONNECTED) {
            if (sessionRef.current !== session) return;
            clearVideoTrackHandler();
            if (attachRetryTimerRef.current) {
              clearTimeout(attachRetryTimerRef.current);
              attachRetryTimerRef.current = null;
            }
            attachGenerationRef.current += 1;
            attachRunRef.current = null;
            setState(isClosingRef.current ? 'disconnected' : 'error');
            setIsStreamReady(false);
            setAudioPlaybackMuted(false);
            setAudioPlaybackError(null);
            setAudioCommandStatus('idle');
            setAudioCommandError(null);
            if (videoRef.current) videoRef.current.srcObject = null;
            if (!isClosingRef.current) {
              sessionRef.current = null;
              sessionIdRef.current = null;
              sessionTokenRef.current = null;
              setSessionId(null);
              setError('La sesión del avatar se desconectó. Puedes volver a intentarlo.');
              setErrorCode('session-disconnected');
            }
          }
        });

        session.on(SessionEvent.SESSION_DISCONNECTED, () => {
          if (sessionRef.current !== session) return;
          clearVideoTrackHandler();
          if (attachRetryTimerRef.current) {
            clearTimeout(attachRetryTimerRef.current);
            attachRetryTimerRef.current = null;
          }
          attachGenerationRef.current += 1;
          attachRunRef.current = null;
          setState(isClosingRef.current ? 'disconnected' : 'error');
          setIsStreamReady(false);
          setAudioPlaybackMuted(false);
          setAudioPlaybackError(null);
          setAudioCommandStatus('idle');
          setAudioCommandError(null);
          if (videoRef.current) videoRef.current.srcObject = null;
          if (!isClosingRef.current) {
            sessionRef.current = null;
            sessionIdRef.current = null;
            sessionTokenRef.current = null;
            setSessionId(null);
            setError('La sesión del avatar se desconectó. Puedes volver a intentarlo.');
            setErrorCode('session-disconnected');
          }
        });

        session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
          console.info('[HeyGenAvatar] se recibió confirmación de inicio de voz del avatar.');
          if (import.meta.env.DEV && audioCommandStartedAtRef.current !== null) {
            console.debug('[latencia] comando SDK → inicio de voz confirmado:', {
              elapsedMs: Math.round(performance.now() - audioCommandStartedAtRef.current),
            });
          }
          if (audioCommandTimerRef.current) clearTimeout(audioCommandTimerRef.current);
          audioCommandTimerRef.current = null;
          setAudioCommandStatus('confirmed');
          setAudioCommandError(null);
          setState('speaking');
          speakStartRef.current?.();
        });

        session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
          console.info('[HeyGenAvatar] se recibió confirmación de fin de voz del avatar.');
          if (import.meta.env.DEV && audioCommandStartedAtRef.current !== null) {
            console.debug('[latencia] comando SDK → fin de voz confirmado:', {
              elapsedMs: Math.round(performance.now() - audioCommandStartedAtRef.current),
            });
          }
          audioCommandStartedAtRef.current = null;
          if (audioCommandTimerRef.current) clearTimeout(audioCommandTimerRef.current);
          audioCommandTimerRef.current = null;
          setAudioCommandStatus('idle');
          setAudioCommandError(null);
          setState((prev) => (prev === 'speaking' ? 'connected' : prev));
          speakEndRef.current?.();
        });

        const startPromise = session.start();
        pendingStartRef.current = startPromise;
        let startTimedOut = false;
        let startTimer: ReturnType<typeof setTimeout> | null = null;
        const startTimeout = new Promise<never>((_, reject) => {
          startTimer = setTimeout(() => {
            startTimedOut = true;
            reject(new Error('La sesión tardó más de 30 segundos en conectarse.'));
          }, 30_000);
        });

        try {
          await Promise.race([startPromise, startTimeout]);
        } catch (startError) {
          if (!startTimedOut) throw startError;

          if (connectAttemptRef.current !== attempt) {
            if (!pendingStopRef.current) {
              void startPromise.then(
                () => closeAvatarSession(session, sid, sessionToken),
                () => {},
              );
            }
            return;
          }

          isClosingRef.current = true;
          setError('La conexión superó 30 segundos. No iniciaremos otra sesión mientras esta tentativa termina; si no se libera, recarga la página.');
          setErrorCode('connection-timeout');
          setState('error');

          const finishLateStart = async () => {
            await closeAvatarSession(session, sid, sessionToken);
            if (sessionRef.current === session) {
              sessionRef.current = null;
              sessionIdRef.current = null;
              sessionTokenRef.current = null;
              setSessionId(null);
              setIsStreamReady(false);
              if (videoRef.current) videoRef.current.srcObject = null;
              setError('La conexión superó el tiempo límite. Puedes volver a intentarlo.');
              setErrorCode('connection-timeout');
              setState('error');
            }
            if (pendingStartRef.current === startPromise) pendingStartRef.current = null;
            if (connectAttemptRef.current === attempt) {
              connectingRef.current = false;
              setConnectionPending(false);
            }
          };
          void startPromise.then(finishLateStart, finishLateStart);
          return;
        } finally {
          if (startTimer) clearTimeout(startTimer);
        }

        if (pendingStartRef.current === startPromise) pendingStartRef.current = null;
        if (sessionRef.current !== session) {
          if (!pendingStopRef.current) {
            await closeAvatarSession(session, sid, sessionToken);
          }
          return;
        }
        setState('connected');

        // Intento inmediato + reintentos: las pistas pueden tardar en estar listas.
        void attachWithRetry(session, attachGeneration);
      } catch (connectError) {
        if (connectAttemptRef.current !== attempt) return;
        console.error('[HeyGenAvatar] connect failed:', connectError instanceof Error ? connectError.message : 'unknown');
        const message = connectError instanceof Error ? connectError.message : 'No se pudo conectar con el avatar.';

        if (attachRetryTimerRef.current) {
          clearTimeout(attachRetryTimerRef.current);
          attachRetryTimerRef.current = null;
        }
        attachGenerationRef.current += 1;
        attachRunRef.current = null;
        clearVideoTrackHandler();
        isClosingRef.current = true;
        pendingStartRef.current = null;
        const session = sessionRef.current;
        await closeAvatarSession(session, sessionIdRef.current, sessionTokenRef.current);
        if (sessionRef.current !== session) return;
        sessionRef.current = null;
        sessionIdRef.current = null;
        sessionTokenRef.current = null;
        setSessionId(null);
        setIsStreamReady(false);
        setAudioPlaybackMuted(false);
        setAudioPlaybackError(null);
        setAudioCommandStatus('idle');
        setAudioCommandError(null);
        if (videoRef.current) videoRef.current.srcObject = null;
        setError(message);
        setErrorCode('session-start-failed');
        setState('error');
      } finally {
        if (!pendingStartRef.current && connectAttemptRef.current === attempt) {
          connectingRef.current = false;
          setConnectionPending(false);
        }
      }
    },
    [isAvailable, attachWithRetry, clearVideoTrackHandler],
  );

  const speakAudio = useCallback((base64Pcm24k: string) => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.CONNECTED || !isStreamReady) {
      console.warn('[HeyGenAvatar] Sin sesión conectada para reproducir audio.');
      return {
        ok: false as const,
        code: 'session-not-ready' as const,
        message: 'El TTS se generó, pero la sesión o el vídeo del avatar dejó de estar listo antes del envío.',
      };
    }

    const validation = validateBase64Pcm24k(base64Pcm24k);
    if (!validation.ok) {
      console.error('[HeyGenAvatar] Audio PCM inválido:', validation.reason);
      return {
        ok: false as const,
        code: 'invalid-pcm' as const,
        message: validation.reason ?? 'El audio no cumple el formato PCM requerido por LiveAvatar.',
      };
    }

    try {
      // LITE mode: `message()`/`repeat()` NO están permitidos. Solo `repeatAudio()`.
      // El SDK fragmenta internamente (400 ms + 1 s) y envía agent.speak / agent.speak_end.
      console.info('[HeyGenAvatar] enviando audio validado a repeatAudio:', {
        sampleRate: 24_000,
        channels: 1,
        bitsPerSample: 16,
        bytes: validation.bytes,
        durationMs: validation.durationMs,
      });
      audioCommandStartedAtRef.current = performance.now();
      session.repeatAudio(base64Pcm24k);
      if (audioCommandTimerRef.current) clearTimeout(audioCommandTimerRef.current);
      setAudioCommandStatus('sent');
      setAudioCommandError(null);
      audioCommandTimerRef.current = setTimeout(() => {
        audioCommandTimerRef.current = null;
        setAudioCommandStatus('unconfirmed');
        setAudioCommandError('El comando se envió al SDK, pero no llegó la confirmación de inicio de voz del avatar.');
        const elapsedMs = audioCommandStartedAtRef.current === null
          ? null
          : Math.round(performance.now() - audioCommandStartedAtRef.current);
        audioCommandStartedAtRef.current = null;
        console.warn('[HeyGenAvatar] venció la espera de confirmación de voz del avatar.', { elapsedMs });
      }, 10_000);
      console.info('[HeyGenAvatar] repeatAudio aceptó el comando localmente; esperando eventos de voz del avatar.');
      return { ok: true as const };
    } catch (speakError) {
      audioCommandStartedAtRef.current = null;
      console.error('[HeyGenAvatar] repeatAudio falló:', speakError instanceof Error ? speakError.message : 'unknown');
      return {
        ok: false as const,
        code: 'sdk-send-failed' as const,
        message: 'No se pudo enviar el audio al SDK LiveAvatar. Comprueba la conexión y vuelve a intentarlo.',
      };
    }
  }, [isStreamReady]);

  const enableAudioPlayback = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    if (!video || !video.srcObject) {
      setAudioPlaybackError('El stream de vídeo aún no está conectado.');
      return false;
    }

    try {
      video.muted = false;
      await video.play();
      if (video.muted) {
        setAudioPlaybackError('El navegador mantiene silenciado el audio. Revisa los permisos de reproducción del sitio.');
        setAudioPlaybackMuted(true);
        return false;
      }
      const hasLiveVideoTrack = video.srcObject instanceof MediaStream &&
        video.srcObject.getVideoTracks().some((track) => track.readyState === 'live');
      if (!hasLiveVideoTrack || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
        setAudioPlaybackError('El navegador permitió reproducir, pero el vídeo aún no tiene un primer frame. Vuelve a intentarlo en un momento.');
        return false;
      }
      setAudioPlaybackMuted(false);
      setAudioPlaybackError(null);
      setIsStreamReady(true);
      console.info('[HeyGenAvatar] reproducción de audio habilitada por acción del usuario.');
      return true;
    } catch (playError) {
      const reason = playError instanceof Error ? playError.name : 'unknown';
      console.warn('[HeyGenAvatar] el navegador rechazó la activación del audio:', reason);
      setAudioPlaybackMuted(video.muted);
      setAudioPlaybackError(
        reason === 'NotAllowedError'
          ? 'El navegador bloqueó el audio. Permite la reproducción de sonido para este sitio y vuelve a intentarlo.'
          : 'No se pudo iniciar el audio del avatar. Vuelve a intentarlo.',
      );
      return false;
    }
  }, []);

  const interrupt = useCallback(() => {
    try {
      sessionRef.current?.interrupt();
      if (audioCommandTimerRef.current) clearTimeout(audioCommandTimerRef.current);
      audioCommandTimerRef.current = null;
      setAudioCommandStatus('idle');
      setAudioCommandError(null);
    } catch {
      // no-op
    }
  }, []);

  const stop = useCallback(async () => {
    connectAttemptRef.current += 1;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    const session = sessionRef.current;
    const sid = sessionIdRef.current;
    const sessionToken = sessionTokenRef.current;
    const pendingStart = pendingStartRef.current;

    if (pendingStart) {
      pendingStopRef.current = true;
      connectingRef.current = true;
      setConnectionPending(true);
      const finishPendingStop = async () => {
        try {
          await pendingStart;
          if (session) await closeAvatarSession(session, sid, sessionToken);
        } catch {
          // LiveAvatarSession.start() performs its own cleanup when it rejects.
        }
        if (pendingStartRef.current === pendingStart) pendingStartRef.current = null;
        pendingStopRef.current = false;
        connectingRef.current = false;
        setConnectionPending(false);
      };
      void finishPendingStop();
    } else {
      connectingRef.current = false;
      setConnectionPending(false);
    }

    if (attachRetryTimerRef.current) {
      clearTimeout(attachRetryTimerRef.current);
      attachRetryTimerRef.current = null;
    }
    attachRunRef.current = null;
    attachGenerationRef.current += 1;
    if (audioCommandTimerRef.current) clearTimeout(audioCommandTimerRef.current);
    audioCommandTimerRef.current = null;
    clearVideoTrackHandler();

    isClosingRef.current = true;
    if (!pendingStart) {
      await closeAvatarSession(session, sid, sessionToken);
    }

    sessionRef.current = null;
    sessionIdRef.current = null;
    sessionTokenRef.current = null;
    setSessionId(null);
    setIsStreamReady(false);
    setAudioPlaybackMuted(false);
    setAudioPlaybackError(null);
    setAudioCommandStatus('idle');
    setAudioCommandError(null);
    setError(null);
    setErrorCode(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setState('idle');
  }, [clearVideoTrackHandler]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      connectAttemptRef.current += 1;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      if (attachRetryTimerRef.current) {
        clearTimeout(attachRetryTimerRef.current);
        attachRetryTimerRef.current = null;
      }
      attachGenerationRef.current += 1;
      if (audioCommandTimerRef.current) clearTimeout(audioCommandTimerRef.current);
      audioCommandTimerRef.current = null;
      clearVideoTrackHandler();
      const session = sessionRef.current;
      const sid = sessionIdRef.current;
      const sessionToken = sessionTokenRef.current;
      isClosingRef.current = true;
      const pendingStart = pendingStartRef.current;
      if (pendingStart && session) {
        pendingStopRef.current = true;
        void pendingStart.then(
          () => closeAvatarSession(session, sid, sessionToken),
          () => {},
        ).finally(() => {
          if (pendingStartRef.current === pendingStart) pendingStartRef.current = null;
          pendingStopRef.current = false;
          connectingRef.current = false;
        });
      } else if (!pendingStart) {
        void closeAvatarSession(session, sid, sessionTokenRef.current);
      }
      sessionRef.current = null;
      sessionIdRef.current = null;
      sessionTokenRef.current = null;
    };
  }, [clearVideoTrackHandler]);

  return {
    videoRef,
    state,
    sessionId,
    error,
    errorCode,
    isAvailable,
    isStreamReady,
    audioPlaybackMuted,
    audioPlaybackError,
    audioCommandStatus,
    audioCommandError,
    // En modo LITE el texto directo no está permitido por el SDK; solo FULL lo admite.
    canAcceptText: sessionRef.current?.mode === SessionMode.FULL,
    connectionPending,
    enableAudioPlayback,
    connect,
    speakAudio,
    interrupt,
    stop,
  };
}
