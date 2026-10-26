import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { MetaLabel } from '@/components/ui/MetaLabel';
import { PageIntro } from '@/components/layout/PageIntro';
import { VoiceSettings } from '@/components/simulator/VoiceSettings';
import { geminiService } from '@/services/ai/geminiService';
import { evaluatePerformance } from '@/services/ai/evaluationService';
import { saveSimulationHistory } from '@/services/simulationHistory';
import { SCENARIOS } from '@/services/ai/scenarios';
import { profileService } from '@/services/profileService';
import type { StoredProfile } from '@/types/profile';
import type { ChatMessage, SimulationSession } from '@/types/ai';
import { paths } from '@/routes/paths';
import { useAuth } from '@/contexts/AuthContext';
import { useSpeech } from '@/hooks/useSpeech';
import { useHeyGenAvatar } from '@/hooks/useHeyGenAvatar';
import { isInterviewerTtsEnabled, synthesizeInterviewerSpeech } from '@/services/ai/interviewerVoiceService';
import { DEFAULT_INTERVIEWER, getInterviewerById, INTERVIEWER_PROFILES, type InterviewerId, type InterviewerProfile } from '@/services/ai/interviewers';
import { selectInterviewerPlaybackRoute } from '@/services/ai/interviewerPlaybackPolicy';
import { cn } from '@/lib/utils';
import {
  Send,
  Bot,
  User,
  Zap,
  AlertTriangle,
  ChevronDown,
  ArrowRight,
  RotateCcw,
  X,
  Sparkles,
  Play,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings2,
  Square,
  Keyboard,
  MessageSquare,
  RefreshCw,
  Loader2,
} from 'lucide-react';

const SELECTED_INTERVIEWER_STORAGE_KEY = 'perfil360.selectedInterviewer';

const SESSION_STATUS_COLORS: Record<string, string> = {
  idle: 'neutral',
  initializing: 'blue',
  active: 'emerald',
  paused: 'amber',
  chaos_pending: 'amber',
  chaos_active: 'red',
  error: 'red',
  completed: 'neutral',
};

function ttsErrorTitle(code: string): string {
  switch (code) {
    case 'tts-disabled':
      return 'Configuración TTS requerida';
    case 'server-config-missing':
      return 'Falta configuración de voz en el servidor';
    case 'unauthenticated':
      return 'Autenticación requerida';
    case 'audio-format':
    case 'unexpected-audio-format':
      return 'Formato de audio inesperado o conversión PCM fallida';
    case 'invalid-response':
      return 'Formato de audio inesperado';
    case 'session-not-ready':
      return 'Sesión LiveAvatar no lista';
    case 'invalid-pcm':
      return 'Audio PCM inválido';
    case 'sdk-send-failed':
      return 'Error al enviar audio al SDK';
    case 'avatar-error':
    case 'avatar-disconnected':
      return 'Conexión de LiveAvatar';
    case 'network-error':
    case 'server-error':
    case 'tts-error':
      return 'Solicitud TTS/Gemini fallida';
    default:
      return 'Voz del avatar no disponible';
  }
}

/* ------------------------------------------------------------------ */
/* Selector de escenarios                                              */
/* ------------------------------------------------------------------ */

interface ScenarioSelectorProps {
  scenarios: { id: string; title: string; description: string; difficulty: string }[];
  onSelect: (id: string) => void;
  loading: boolean;
}

function ScenarioSelector({ scenarios, onSelect, loading }: ScenarioSelectorProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center gap-3 rounded-md border border-ink-600 bg-ink-800/80 px-4 py-3">
        <Loader2 className="size-4 animate-spin text-signal-400" aria-hidden="true" />
        <span className="text-sm text-mist-400">Generando escenarios personalizados…</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-ink-600 bg-ink-800/80 px-4 py-3 text-left transition-colors hover:border-signal-400"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Seleccionar escenario de entrevista"
      >
        <span className="flex-1 truncate text-sm text-mist-100">Selecciona un escenario…</span>
        <ChevronDown className={cn('size-5 text-mist-400 transition-transform', open && !reducedMotion && 'rotate-180')} aria-hidden="true" />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.15 }}
            className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-ink-600 bg-ink-900/95 shadow-xl"
            role="listbox"
            aria-label="Escenarios disponibles"
          >
            <div className="p-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setOpen(false);
                    onSelect(scenario.id);
                  }}
                  className="flex w-full items-start gap-3 rounded-md p-3 text-left transition-colors hover:bg-ink-800/60"
                >
                  <span className="mt-0.5 font-mono text-2xs uppercase text-signal-400">{scenario.difficulty}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-mist-100">{scenario.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-mist-400">{scenario.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Burbuja de mensaje                                                  */
/* ------------------------------------------------------------------ */

function MessageBubble({ message, interviewerName }: { message: ChatMessage; interviewerName: string }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex min-w-0 w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'min-w-0 max-w-[85%] rounded-2xl border px-4 py-2.5',
          isUser ? 'border-signal-500/30 bg-signal-500/15 text-mist-100' : 'border-ink-600 bg-ink-800/80 text-mist-200',
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          {isUser ? <User className="size-3.5 text-signal-300" aria-hidden="true" /> : <Bot className="size-3.5 text-ion-300" aria-hidden="true" />}
          <span className="font-mono text-2xs uppercase text-mist-400">{isUser ? 'Tú' : interviewerName}</span>
        </div>
        <p className="break-words whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Escenario principal del avatar                                      */
/* ------------------------------------------------------------------ */

interface AvatarStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  heygenEnabled: boolean;
  isInterviewActive: boolean;
  heygenState: string;
  isStreamReady: boolean;
  profile: InterviewerProfile;
  interviewerSpeaking: boolean;
  isListening: boolean;
  heygenError: string | null;
  audioPlaybackMuted: boolean;
  audioPlaybackError: string | null;
  onEnableAudioPlayback: () => void;
  audioCommandStatus: 'idle' | 'sent' | 'confirmed' | 'unconfirmed';
  audioCommandError: string | null;
  onRetryQuestion: () => void;
  /** true solo cuando hay TTS propio (PCM) y por tanto lip-sync real. */
  lipSyncAvailable: boolean;
}

function AvatarStage({
  videoRef,
  heygenEnabled,
  isInterviewActive,
  heygenState,
  isStreamReady,
  profile,
  interviewerSpeaking,
  isListening,
  heygenError,
  audioPlaybackMuted,
  audioPlaybackError,
  onEnableAudioPlayback,
  audioCommandStatus,
  audioCommandError,
  onRetryQuestion,
  lipSyncAvailable,
}: AvatarStageProps) {
  const showVideo = heygenEnabled && isStreamReady;

  /** Motivo explícito cuando no hay video: nunca dejamos un icono sin explicación. */
  const fallbackReason = (() => {
    if (!heygenEnabled) {
      if (!profile.liveAvatarId) {
        return `${profile.name} está disponible por voz; este perfil no tiene un ID LiveAvatar asignado.`;
      }
      return 'Avatar de video desactivado. Se usará la voz del navegador.';
    }
    if (heygenState === 'error') {
      return heygenError ?? 'No se pudo conectar con el avatar de video.';
    }
    if (heygenState === 'connecting') {
      return 'Preparando la sesión y conectando el video…';
    }
    if (heygenEnabled && (heygenState === 'connected' || heygenState === 'speaking')) {
      return 'La sesión está conectada; esperando el stream de vídeo…';
    }
    if (heygenState === 'idle') {
      return isInterviewActive
        ? 'La entrevista está activa, pero la conexión del avatar todavía no comenzó.'
        : heygenEnabled
        ? `Selecciona un escenario para iniciar la sesión de ${profile.name}.`
        : `Selecciona un escenario para iniciar la entrevista con ${profile.name}.`;
    }
    if (heygenState === 'disconnected') {
      return 'La sesión del avatar se ha cerrado. Puedes seguir por voz o texto.';
    }
    return 'Preparando el avatar de video…';
  })();

  const connectionLabel = (() => {
    if (!heygenEnabled) return 'Voz del navegador';
    if (!isStreamReady && (heygenState === 'connected' || heygenState === 'speaking')) {
      return 'Conectado · esperando vídeo…';
    }
    switch (heygenState) {
      case 'connecting':
        return 'Conectando avatar…';
      case 'connected':
        return 'Avatar conectado';
      case 'speaking':
        return 'Avatar hablando';
      case 'error':
        return 'Avatar no disponible';
      case 'disconnected':
        return 'Avatar desconectado';
      default:
        return 'Avatar en espera';
    }
  })();

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-4">
      <div className="relative w-full min-w-0">
        <div
          className={cn(
            'relative aspect-video w-full overflow-hidden rounded-2xl border bg-ink-900 shadow-[0_24px_80px_-44px_rgb(0_0_0/0.9)] transition-colors duration-300',
            interviewerSpeaking ? 'border-amber-300/50' : isListening ? 'border-amber-400/50' : 'border-ink-600',
          )}
        >
          {/* El elemento <video> siempre está montado cuando HeyGen está habilitado,
              para que session.attach() tenga un destino estable. */}
          {heygenEnabled ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={false}
              className={cn('absolute inset-0 size-full bg-ink-950 object-contain transition-opacity duration-300', showVideo ? 'z-10 opacity-100' : 'opacity-0')}
            />
          ) : null}

          {/* Fallback honesto: nunca fingimos un video en vivo */}
          {!showVideo ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,_rgb(41_37_32)_0%,_rgb(15_15_16)_72%)] px-5">
              {heygenEnabled && (
                heygenState === 'connecting' ||
                ((heygenState === 'connected' || heygenState === 'speaking') && !isStreamReady)
              ) ? (
                <Loader2 className="size-8 animate-spin text-amber-200" aria-hidden="true" />
              ) : (
                <span className="flex size-20 items-center justify-center rounded-full border border-amber-100/20 bg-white/[0.04] text-3xl font-light text-amber-50 shadow-inner" aria-hidden="true">
                  {profile.name.charAt(0)}
                </span>
              )}
              <p role="status" aria-live="polite" className="max-w-[85%] break-words text-center text-xs text-mist-400">
                {fallbackReason}
              </p>
              {!heygenEnabled ? (
                <p className="max-w-[85%] text-center text-[10px] text-mist-600">
                  Requiere <code className="text-mist-500">VITE_HEYGEN_ENABLED=true</code> y las funciones desplegadas.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-black/65 to-transparent p-3 sm:p-4">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white sm:text-sm">{profile.name}</p>
              <p className="truncate text-[10px] text-white/65 sm:text-xs">{profile.role}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[9px] text-white/80 backdrop-blur sm:text-[10px]">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  isStreamReady ? 'bg-emerald-300' : heygenState === 'error' ? 'bg-red-300' : heygenState === 'connecting' || heygenState === 'connected' ? 'animate-pulse bg-amber-200' : 'bg-white/40',
                )}
                aria-hidden="true"
              />
              {isStreamReady ? 'Vídeo listo' : heygenState === 'error' ? 'Error de conexión' : heygenState === 'connecting' ? 'Conectando' : heygenEnabled && heygenState === 'connected' ? 'Esperando vídeo' : 'Vista previa'}
            </span>
          </div>

          {/* Indicador de audio */}
          {interviewerSpeaking ? (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden="true">
              <span className="size-2 animate-bounce rounded-full bg-signal-400" style={{ animationDelay: '0ms' }} />
              <span className="size-2 animate-bounce rounded-full bg-signal-400" style={{ animationDelay: '150ms' }} />
              <span className="size-2 animate-bounce rounded-full bg-signal-400" style={{ animationDelay: '300ms' }} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="max-w-full text-center">
        <p className="break-words px-3 font-semibold text-mist-100">{profile.name}</p>
        <p className="break-words px-3 text-xs text-mist-400">
          {profile.role} · {profile.company}
        </p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-mist-500">
          <span
            className={cn(
              'size-1.5 rounded-full',
              isStreamReady && (heygenState === 'connected' || heygenState === 'speaking')
                ? 'bg-emerald-400'
                : heygenState === 'connecting' || (heygenEnabled && (heygenState === 'connected' || heygenState === 'speaking') && !isStreamReady)
                  ? 'animate-pulse bg-amber-400'
                  : heygenState === 'error'
                    ? 'bg-red-400'
                    : 'bg-ink-500',
            )}
            aria-hidden="true"
          />
          {connectionLabel}
        </p>
        {heygenError ? <p className="mt-1 max-w-xs text-[11px] text-ember-400">{heygenError}</p> : null}
        {audioPlaybackMuted || audioPlaybackError ? (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            {audioPlaybackMuted ? (
              <p className="max-w-xs text-[11px] text-amber-300">
                El vídeo está conectado, pero el navegador silenció su pista de audio.
              </p>
            ) : null}
            <button
              type="button"
              onClick={onEnableAudioPlayback}
              className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
            >
              {isStreamReady ? 'Activar audio del avatar' : 'Reintentar reproducción'}
            </button>
          </div>
        ) : null}
        {audioPlaybackError ? (
          <p className="mt-1 max-w-xs text-[11px] text-ember-400" role="status" aria-live="polite">
            {audioPlaybackError}
          </p>
        ) : null}
        {audioCommandStatus === 'sent' ? (
          <p className="mt-1 max-w-xs text-[11px] text-amber-300" role="status" aria-live="polite">
            Audio enviado al SDK; esperando confirmación de voz del avatar…
          </p>
        ) : null}
        {audioCommandError ? (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <p className="max-w-xs text-[11px] text-ember-400" role="alert">{audioCommandError}</p>
            <button
              type="button"
              onClick={onRetryQuestion}
              className="rounded-md border border-ember-500/40 px-3 py-1.5 text-[11px] font-medium text-ember-300 transition-colors hover:bg-ember-500/10"
            >
              Reintentar audio
            </button>
          </div>
        ) : null}
        {heygenEnabled && !lipSyncAvailable ? (
          <p className="mt-1 max-w-xs text-[10px] text-amber-300/80">
            La voz del navegador no se envía al avatar. TTS debe estar habilitado para enviar audio con <code className="text-amber-200">repeatAudio()</code>.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página principal                                                    */
/* ------------------------------------------------------------------ */

export default function SimuladorInmersivo() {
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();

  // --- Sesión y Gemini ---
  const [geminiReady, setGeminiReady] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [session, setSession] = useState<SimulationSession | null>(null);
  const [showScenarioSelector, setShowScenarioSelector] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Escenarios ---
  const [dynamicScenarios, setDynamicScenarios] = useState<{ id: string; title: string; description: string; difficulty: string }[]>([]);
  const [generatingScenarios, setGeneratingScenarios] = useState(false);
  const [scenarioGenError, setScenarioGenError] = useState<string | null>(null);
  const [lastUserProfile, setLastUserProfile] = useState<StoredProfile | null>(null);
  const [pendingScenarioId, setPendingScenarioId] = useState<string | null>(null);

  // --- Entrevista ---
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chaosLoading, setChaosLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<{ score: number; strengths: string[]; improvements: string[]; summary: string } | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<InterviewerId>(() => {
    try {
      const savedId = typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(SELECTED_INTERVIEWER_STORAGE_KEY);
      return (savedId ? getInterviewerById(savedId)?.id : undefined) ?? DEFAULT_INTERVIEWER.id;
    } catch {
      return DEFAULT_INTERVIEWER.id;
    }
  });
  const profile = getInterviewerById(selectedAvatar) ?? DEFAULT_INTERVIEWER;
  const pendingScenario = dynamicScenarios.find((scenario) => scenario.id === pendingScenarioId) ?? null;

  // --- Modo de respuesta ---
  const [answerMode, setAnswerMode] = useState<'voice' | 'text'>('voice');
  const [autoSend, setAutoSend] = useState(true);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  /** Respuesta que falló y puede reintentarse sin volver a hablar. */
  const [lastFailedAnswer, setLastFailedAnswer] = useState<string | null>(null);
  /** El TTS del entrevistador está generando audio. */
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsError, setTtsError] = useState<{ code: string; message: string } | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<{
    id: number;
    text: string;
    sessionId: string;
    interviewerId: InterviewerId;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const interviewStageRef = useRef<HTMLElement>(null);
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>('');
  const speechRequestIdRef = useRef(0);
  const speechAbortRef = useRef<AbortController | null>(null);
  const pendingQuestionIdRef = useRef(0);
  const startedPendingQuestionRef = useRef<number | null>(null);
  const activeInterviewerIdRef = useRef(profile.id);
  const activeSessionIdRef = useRef(session?.id ?? null);
  const voiceFinalizedAtRef = useRef<number | null>(null);
  activeInterviewerIdRef.current = profile.id;
  activeSessionIdRef.current = session?.id ?? null;

  // --- Voz ---
  const speech = useSpeech({
    lang: 'es-ES',
    voicePreferenceKey: `perfil360.voice.uri.${profile.id}`,
    onTranscript: (text, isFinal) => {
      if (!isFinal) return;
      voiceFinalizedAtRef.current = performance.now();
      if (import.meta.env.DEV) {
        console.debug('[latencia] transcripción final recibida');
      }
      const merged = `${inputValue} ${text}`.replace(/\s+/g, ' ').trim();
      setInputValue(merged);

      // Auto-envío tras una pausa breve (solo en modo voz).
      // 1100 ms: suficiente para una pausa natural al hablar, sin la espera excesiva anterior.
      if (autoSend && answerMode === 'voice') {
        if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = setTimeout(() => {
          autoSendTimerRef.current = null;
          if (import.meta.env.DEV && voiceFinalizedAtRef.current !== null) {
            console.debug('[latencia] transcripción final → autoenvío:', {
              elapsedMs: Math.round(performance.now() - voiceFinalizedAtRef.current),
            });
          }
          void submitAnswer(merged);
        }, 1100);
      }
    },
    onError: (code) => {
      // Mensajes diferenciados por causa real del fallo de micrófono.
      switch (code) {
        case 'denied':
          setMicError('Permiso de micrófono denegado. Ábrelo en el candado de la barra de direcciones o escribe tu respuesta.');
          break;
        case 'no-device':
          setMicError('No se detectó ningún micrófono conectado. Conecta uno o escribe tu respuesta.');
          break;
        case 'busy':
          setMicError('El micrófono está siendo usado por otra aplicación. Ciérrala o escribe tu respuesta.');
          break;
        case 'insecure-context':
          setMicError('El navegador solo permite micrófono en conexiones seguras (https o localhost).');
          break;
        case 'unsupported':
          setMicError('Este navegador no admite reconocimiento de voz. Puedes escribir tus respuestas.');
          break;
        case 'recognition-error':
          setMicError('El reconocimiento de voz falló temporalmente. Puedes reintentar o escribir.');
          break;
        default:
          setMicError('No se pudo iniciar el micrófono. Puedes escribir tus respuestas.');
      }
    },
  });

  // --- Avatar HeyGen ---
  const heygenAvatar = useHeyGenAvatar({
    onSpeakStart: () => {
      // Evita que el micrófono capture la voz de la entrevistadora
      speech.stopListening();
    },
    onSpeakEnd: () => {
      if (session && answerMode === 'voice' && !muted) {
        speech.startListening();
      }
    },
  });

  const interviewerSpeaking = heygenAvatar.state === 'speaking' || speech.isSpeaking;

  /**
   * Voz de la entrevistadora.
   *
   * Hecho verificado en el SDK instalado (v0.0.19): en modo LITE, `message()` y
   * `repeat()` lanzan "Not permitted in LITE mode". La única vía de voz con lip-sync
   * es `repeatAudio()` con audio PCM 16-bit 24 kHz mono en Base64, es decir, un TTS propio.
   *
   * Con `VITE_INTERVIEWER_TTS_ENABLED=true` se pide el audio a la Netlify Function `/api/tts`
   * (Gemini TTS con la clave en el servidor) y se envía al avatar.
   * Sin TTS, la pregunta queda sin voz para los perfiles LiveAvatar; no se simula lip-sync con Web Speech.
   */
  const heygenLipSyncAvailable =
    isInterviewerTtsEnabled() && heygenAvatar.isAvailable && profile.liveAvatarId !== null;
  const requiresLiveAvatar = heygenAvatar.isAvailable && profile.liveAvatarId !== null;
  const liveAvatarReady =
    (heygenAvatar.state === 'connected' || heygenAvatar.state === 'speaking') &&
    heygenAvatar.isStreamReady;

  /** No sustituye el TTS del avatar por voz de navegador en perfiles LiveAvatar. */
  const speakQuestion = useCallback(
    async (rawText: string) => {
      const clean = rawText.replace(/[*`#]/g, '').replace(/\s+/g, ' ').trim();
      if (!clean || !session) return;
      const requestId = ++speechRequestIdRef.current;
      speechAbortRef.current?.abort();
      speechAbortRef.current = null;
      setTtsBusy(false);

      if (interviewerSpeaking) {
        speech.stopSpeaking();
        heygenAvatar.interrupt();
      }

      const playbackRoute = selectInterviewerPlaybackRoute({
        hasActiveSession: Boolean(session),
        requiresLiveAvatar,
        avatarState: heygenAvatar.state,
        isVideoReady: heygenAvatar.isStreamReady,
        ttsEnabled: heygenLipSyncAvailable,
        browserTtsAvailable: speech.supported.tts,
        muted,
      });
      if (playbackRoute === 'wait') {
        setTtsError(null);
        const id = ++pendingQuestionIdRef.current;
        setPendingQuestion({ id, text: clean, sessionId: session.id, interviewerId: profile.id });
        return;
      }
      if (playbackRoute === 'silent') return;
      if (playbackRoute === 'unavailable') {
        const error = heygenAvatar.state === 'error'
          ? { code: 'avatar-error', message: heygenAvatar.error ?? 'No se pudo conectar con el avatar.' }
          : heygenAvatar.state === 'disconnected'
            ? { code: 'avatar-disconnected', message: 'La sesión del avatar se desconectó. Reintenta la conexión antes de repetir la pregunta.' }
            : {
                code: 'tts-disabled',
                message: 'TTS deshabilitado por configuración. Define VITE_INTERVIEWER_TTS_ENABLED=true en .env.local y reinicia Netlify Dev; GEMINI_API_KEY debe estar configurada solo en el entorno servidor (.env local ignorado). No se usará Web Speech como sustituto.',
              };
        setTtsError(error);
        return;
      }

      setPendingQuestion(null);
      setTtsError(null);

      // 1) Ruta con lip-sync: TTS propio → repeatAudio().
      if (playbackRoute === 'avatar-tts') {
        const abortController = new AbortController();
        speechAbortRef.current = abortController;
        setTtsBusy(true);
        const ttsStartedAt = performance.now();
        let result: Awaited<ReturnType<typeof synthesizeInterviewerSpeech>>;
        try {
          result = await synthesizeInterviewerSpeech(clean, profile.id, abortController.signal);
        } catch (speechError) {
          console.error('[Simulador] No se pudo preparar el audio del entrevistador:', speechError instanceof Error ? speechError.message : 'unknown');
          result = {
            ok: false,
            error: { message: 'No se pudo preparar el audio del entrevistador.', code: 'tts-error', retryable: true },
          };
        } finally {
          if (speechAbortRef.current === abortController) speechAbortRef.current = null;
        }
        if (import.meta.env.DEV) {
          console.debug('[latencia] síntesis TTS terminada:', {
            elapsedMs: Math.round(performance.now() - ttsStartedAt),
            success: result.ok,
            errorCode: result.ok ? null : result.error.code,
          });
        }
        if (
          speechRequestIdRef.current !== requestId ||
          !session ||
          activeSessionIdRef.current !== session.id ||
          activeInterviewerIdRef.current !== profile.id
        ) return;
        setTtsBusy(false);

        if (result.ok) {
          const sdkSendStartedAt = performance.now();
          const sent = heygenAvatar.speakAudio(result.value.pcm24kBase64);
          if (import.meta.env.DEV) {
            console.debug('[latencia] envío local de audio a LiveAvatar SDK:', {
              elapsedMs: Math.round(performance.now() - sdkSendStartedAt),
              accepted: sent.ok,
            });
          }
          if (sent.ok) return;
          console.warn('[Simulador] No se pudo enviar audio al avatar:', sent.code);
          setTtsError({ code: sent.code, message: sent.message });
        } else {
          console.warn('[Simulador] TTS no disponible:', result.error.code);
          setTtsError({ code: result.error.code, message: result.error.message });
        }
      }

      // La voz de navegador solo se usa en perfiles que no requieren LiveAvatar.
      if (speechRequestIdRef.current === requestId && session && playbackRoute === 'browser-fallback' && speech.supported.tts && !muted) {
        speech.speak(clean);
      }
    },
    [speech, muted, session, heygenAvatar, heygenLipSyncAvailable, interviewerSpeaking, requiresLiveAvatar, profile.id],
  );

  useEffect(() => {
    speechRequestIdRef.current += 1;
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    voiceFinalizedAtRef.current = null;
    setTtsBusy(false);
    setTtsError(null);
    setPendingQuestion(null);
    startedPendingQuestionRef.current = null;
  }, [profile.id]);

  const cancelInterviewerSpeech = useCallback(() => {
    speechRequestIdRef.current += 1;
    pendingQuestionIdRef.current += 1;
    setPendingQuestion(null);
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    setTtsBusy(false);
    speech.stopSpeaking();
    if (interviewerSpeaking) heygenAvatar.interrupt();
  }, [speech, heygenAvatar, interviewerSpeaking]);

  // --- Inicializar Gemini ---
  useEffect(() => {
    const result = geminiService.initialize();
    setGeminiReady(result.ok);
    setGeminiError(result.ok ? null : result.error.message);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SELECTED_INTERVIEWER_STORAGE_KEY, selectedAvatar);
    } catch {
      console.warn('[Simulador] No se pudo guardar la selección del entrevistador en este navegador.');
    }
  }, [selectedAvatar]);

  // --- Escenarios dinámicos ---
  useEffect(() => {
    if (!geminiReady) return;

    if (!user) {
      setDynamicScenarios(
        Object.values(SCENARIOS).map((scenario) => ({
          id: scenario.id,
          title: scenario.title,
          description: scenario.description,
          difficulty: 'medio',
        })),
      );
      return;
    }

    let cancelled = false;

    const run = async () => {
      setGeneratingScenarios(true);
      setScenarioGenError(null);
      setDynamicScenarios([]);
      setLastUserProfile(null);

      try {
        const profileResult = await profileService.load(user.uid);
        if (cancelled) return;
        if (!profileResult.ok) {
          setScenarioGenError(`No se pudo cargar tu perfil profesional: ${profileResult.error.message}`);
          return;
        }
        if (!profileResult.value) {
          setScenarioGenError('Primero guarda tu perfil profesional en el Panel para generar escenarios personalizados.');
          return;
        }

        setLastUserProfile(profileResult.value);
        const result = await geminiService.generateScenariosFromProfile(profileResult.value);
        if (cancelled) return;

        if (result.ok) {
          setDynamicScenarios(result.value);
        } else {
          setScenarioGenError(result.error.message);
        }
      } catch (generationError) {
        if (!cancelled) {
          setScenarioGenError(
            generationError instanceof Error ? generationError.message : 'No se pudieron generar los escenarios.',
          );
        }
      } finally {
        if (!cancelled) setGeneratingScenarios(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [geminiReady, user]);

  // --- Conectar avatar cuando hay sesión activa ---
  useEffect(() => {
    if (!session || !user || !profile.liveAvatarId) return;
    if (!heygenAvatar.isAvailable) return;
    if (heygenAvatar.state !== 'idle' && heygenAvatar.state !== 'error') return;
    void heygenAvatar.connect(user.uid, profile.liveAvatarId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, user?.uid, heygenAvatar.isAvailable, profile.id, profile.liveAvatarId]);

  useEffect(() => {
    if (!pendingQuestion) return;
    if (!session || pendingQuestion.sessionId !== session.id || pendingQuestion.interviewerId !== profile.id) {
      setPendingQuestion(null);
      return;
    }
    const route = selectInterviewerPlaybackRoute({
      hasActiveSession: Boolean(session),
      requiresLiveAvatar: heygenAvatar.isAvailable && profile.liveAvatarId !== null,
      avatarState: heygenAvatar.state,
      isVideoReady: heygenAvatar.isStreamReady,
      ttsEnabled: heygenLipSyncAvailable,
      browserTtsAvailable: speech.supported.tts,
      muted,
    });
    if (route === 'wait') return;
    if (startedPendingQuestionRef.current === pendingQuestion.id) return;

    startedPendingQuestionRef.current = pendingQuestion.id;
    setPendingQuestion(null);
    void speakQuestion(pendingQuestion.text);
  }, [
    pendingQuestion,
    session?.id,
    profile.id,
    profile.liveAvatarId,
    heygenAvatar.isAvailable,
    heygenAvatar.state,
    heygenAvatar.isStreamReady,
    heygenLipSyncAvailable,
    speech.supported.tts,
    muted,
    session,
    liveAvatarReady,
    speakQuestion,
  ]);

  // --- Pronunciar la última pregunta del entrevistador ---
  const spokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.messages.length === 0) return;
    const last = session.messages[session.messages.length - 1];
    if (!last || last.role !== 'model') return;
    if (spokenRef.current === last.id) return;
    spokenRef.current = last.id;

    const clean = last.content
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) return;

    void speakQuestion(clean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.messages.length]);

  // --- Auto-scroll ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [session?.messages.length, reducedMotion]);

  useEffect(() => {
    if (!session) return;
    const stage = interviewStageRef.current;
    if (!stage) return;
    stage.focus({ preventScroll: true });
    stage.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }, [session?.id, reducedMotion]);

  // --- Al terminar de hablar la entrevistadora, activar micrófono (modo voz) ---
  useEffect(() => {
    if (answerMode !== 'voice' || muted) return;
    if (pendingQuestion || (requiresLiveAvatar && !liveAvatarReady) || heygenAvatar.audioCommandStatus === 'sent') return;
    if (ttsBusy) return;
    if (interviewerSpeaking) return;
    // No abrimos el micrófono mientras se está analizando la respuesta anterior:
    // evitaría captar audio del candidato que aún no debe enviarse.
    if (isSending) return;
    if (!session) return;
    if (!speech.supported.stt) return;
    // El evento de fin de voz del SDK / Web Speech confirma que la reproducción terminó.
    // No añadimos otra pausa artificial antes de habilitar la respuesta.
    if (!speech.isListening) speech.startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewerSpeaking, answerMode, muted, isSending, session?.id, pendingQuestion?.id, requiresLiveAvatar, liveAvatarReady, ttsBusy, heygenAvatar.audioCommandStatus]);

  useEffect(() => {
    if (requiresLiveAvatar && !liveAvatarReady && speech.isListening) {
      speech.stopListening();
    }
  }, [requiresLiveAvatar, liveAvatarReady, speech.isListening, speech.stopListening]);

  // --- Diagnóstico del micrófono: se ejecuta una vez al entrar en la entrevista ---
  useEffect(() => {
    if (!session) return;
    if (!speech.supported.mediaDevices) return;
    void speech.probeMicrophone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // --- Limpieza del temporizador de auto-envío ---
  useEffect(() => {
    return () => {
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
    };
  }, []);

  /* ---------------- Handlers ---------------- */

  const submitAnswer = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim();
      if (!content || isSending) return;
      if (!session) return;
      if (content === lastSentRef.current) {
        // Evita envíos duplicados por eventos de voz repetidos.
        return;
      }

      if (autoSendTimerRef.current) {
        clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = null;
      }

      if (interviewerSpeaking || ttsBusy) cancelInterviewerSpeech();
      setInputValue('');
      setIsSending(true);
      setError(null);
      setLastFailedAnswer(null);
      lastSentRef.current = content;
      if (import.meta.env.DEV) {
        const finalizedAt = voiceFinalizedAtRef.current;
        console.debug('[latencia] respuesta del candidato aceptada:', {
          inputMode: answerMode,
          transcriptToSubmitMs: finalizedAt === null ? null : Math.round(performance.now() - finalizedAt),
        });
      }
      voiceFinalizedAtRef.current = null;

      // Cortamos el micrófono: ya tenemos la respuesta y evitamos captar la voz del entrevistador.
      speech.stopListening();

      const startedAt = performance.now();
      const result = await geminiService.sendMessage(content);

      if (result.ok) {
        if (import.meta.env.DEV) {
          console.debug('[latencia] envío del candidato → texto de respuesta listo:', {
            elapsedMs: Math.round(performance.now() - startedAt),
          });
        }
        setSession((prev) =>
          prev
            ? {
                ...prev,
                scenarioState: result.value.scenarioState,
                messages: [
                  ...prev.messages,
                  { id: `user_${Date.now()}`, role: 'user', content, timestamp: Date.now() },
                  result.value.message,
                ],
              }
            : null,
        );
      } else {
        setError(result.error.message);
        // Guardamos el texto para que el usuario pueda reintentar sin volver a hablar.
        setLastFailedAnswer(content);
        setInputValue(content);
      }
      setIsSending(false);
      lastSentRef.current = '';
    },
    [isSending, session, speech, interviewerSpeaking, ttsBusy, cancelInterviewerSpeech, answerMode],
  );

  /** Reintenta la última respuesta que falló, sin crear un turno nuevo. */
  const retryLastAnswer = useCallback(() => {
    const pending = lastFailedAnswer ?? inputValue;
    if (!pending.trim() || isSending) return;
    void submitAnswer(pending);
  }, [lastFailedAnswer, inputValue, isSending, submitAnswer]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      void submitAnswer(inputValue);
    },
    [inputValue, submitAnswer],
  );

  const handleScenarioSelect = useCallback(
    (scenarioId: string) => {
      if (!dynamicScenarios.some((entry) => entry.id === scenarioId)) return;
      if (!lastUserProfile) {
        setError('No se puede iniciar la simulación sin un perfil profesional guardado.');
        return;
      }

      setError(null);
      setPendingScenarioId(scenarioId);
    },
    [dynamicScenarios, lastUserProfile],
  );

  const startSelectedScenario = useCallback(async () => {
    const scenario = dynamicScenarios.find((entry) => entry.id === pendingScenarioId);
    if (!scenario || !lastUserProfile) return;

    setError(null);
    setShowScenarioSelector(false);

    const professionalProfile = {
      role: 'profesional',
      experienceLevel: lastUserProfile.yearsOfExperience > 5 ? 'avanzado' : 'intermedio',
      skills: lastUserProfile.skills,
      yearsOfExperience: lastUserProfile.yearsOfExperience,
    };

    const result = await geminiService.startDynamicSimulation(scenario, professionalProfile, profile);
    if (result.ok) {
      setSession(result.value);
      setShowTranscript(false);
    } else {
      setError(result.error.message);
      setShowScenarioSelector(true);
    }
  }, [dynamicScenarios, lastUserProfile, pendingScenarioId, profile]);

  const handleChaos = useCallback(async () => {
    if (!session || chaosLoading) return;
    setChaosLoading(true);
    setError(null);

    const result = await geminiService.triggerChaos();
    if (result.ok) {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              scenarioState: result.value.scenarioState,
              messages: [...prev.messages, result.value.response],
              events: [...prev.events, result.value.event],
            }
          : null,
      );
    } else {
      setError(result.error.message);
    }
    setChaosLoading(false);
  }, [session, chaosLoading]);

  const handleEvaluate = useCallback(async () => {
    if (!session || !user) return;
    setEvaluating(true);
    const result = await evaluatePerformance({
      userId: user.uid,
      scenarioId: session.scenarioId,
      messages: session.messages,
      scenarioState: { progress: session.scenarioState.progress, resources: session.scenarioState.resources },
    });
    if (result.ok) {
      const evaluated = {
        score: result.value.score,
        strengths: result.value.strengths,
        improvements: result.value.improvements,
        summary: result.value.summary,
      };
      setEvaluation(evaluated);
      try {
        saveSimulationHistory(user.uid, {
          id: session.id,
          title: session.scenarioState.title,
          completedAt: Date.now(),
          ...evaluated,
        });
      } catch (historyError) {
        console.error('[Simulador] No se pudo guardar el historial local:', historyError instanceof Error ? historyError.message : 'unknown');
        setError('La evaluación se completó, pero no se pudo guardar en el historial local.');
      }
    } else {
      setError(result.error.message);
    }
    setEvaluating(false);
  }, [session, user]);

  const handleEndInterview = useCallback(async () => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    // Cancela cualquier petición en vuelo para que no actualice estado tras salir.
    geminiService.abortCurrentTurn();
    speech.stopListening();
    cancelInterviewerSpeech();
    startedPendingQuestionRef.current = null;
    await heygenAvatar.stop();
    geminiService.endSimulation();
    setSession(null);
    setEvaluation(null);
    setShowScenarioSelector(true);
    setError(null);
    setLastFailedAnswer(null);
    setInputValue('');
  }, [speech, heygenAvatar, cancelInterviewerSpeech]);

  const toggleMic = useCallback(() => {
    setMicError(null);
    if (speech.isListening) {
      speech.stopListening();
      setMuted(true);
    } else {
      setMuted(false);
      speech.startListening();
    }
  }, [speech]);

  const toggleMuteAudio = useCallback(() => {
    if (interviewerSpeaking || ttsBusy) cancelInterviewerSpeech();
    setMuted((prev) => !prev);
  }, [interviewerSpeaking, ttsBusy, cancelInterviewerSpeech]);

  const repeatQuestion = useCallback(() => {
    if (!session) return;
    const lastModel = [...session.messages].reverse().find((message) => message.role === 'model');
    if (!lastModel) return;
    void speakQuestion(lastModel.content);
  }, [session, speakQuestion]);

  const switchAnswerMode = useCallback(
    (mode: 'voice' | 'text') => {
      setAnswerMode(mode);
      if (mode === 'text') {
        speech.stopListening();
      } else if (!muted) {
        speech.startListening();
      }
    },
    [speech, muted],
  );

  const currentQuestion = useMemo(() => {
    if (!session) return '';
    const lastModel = [...session.messages].reverse().find((message) => message.role === 'model');
    return lastModel?.content ?? '';
  }, [session]);

  const userMessageCount = session ? session.messages.filter((message) => message.role === 'user').length : 0;

  /** Estado de voz derivado, siempre visible para el usuario. */
  const voiceStatus = useMemo(() => {
    if (!speech.supported.stt) {
      return {
        label: 'Reconocimiento de voz no disponible',
        detail: 'Tu navegador no admite SpeechRecognition. Puedes escribir tus respuestas.',
        className: 'border-ember-500/40 bg-ember-500/10 text-ember-300',
        dotClass: 'bg-ember-400',
      };
    }
    if (micError) {
      return {
        label: 'Micrófono no disponible',
        detail: micError,
        className: 'border-ember-500/40 bg-ember-500/10 text-ember-300',
        dotClass: 'bg-ember-400',
      };
    }
    if (answerMode === 'text') {
      return {
        label: 'Modo escrito activo',
        detail: 'Pulsa «Responder por voz» o el micrófono para hablar.',
        className: 'border-ink-600 bg-ink-800/60 text-mist-400',
        dotClass: 'bg-ink-500',
      };
    }
    if (ttsBusy) {
      return {
        label: 'Preparando la voz de la entrevistadora',
        detail: 'Generando el audio para el avatar.',
        className: 'border-ion-500/40 bg-ion-500/10 text-ion-300',
        dotClass: 'bg-ion-400 animate-pulse',
      };
    }
    if (pendingQuestion || (requiresLiveAvatar && !liveAvatarReady)) {
      return {
        label: 'Esperando que el vídeo esté listo',
        detail: 'La pregunta no se reproducirá y el micrófono no se abrirá hasta que vídeo y sesión estén preparados.',
        className: 'border-amber-400/30 bg-amber-400/5 text-amber-200',
        dotClass: 'bg-amber-300 animate-pulse',
      };
    }
    if (interviewerSpeaking) {
      return {
        label: 'Respondiendo la entrevistadora',
        detail: 'El micrófono se activará al terminar.',
        className: 'border-ion-500/40 bg-ion-500/10 text-ion-300',
        dotClass: 'bg-ion-400 animate-pulse',
      };
    }
    if (isSending) {
      return {
        label: 'Analizando tu respuesta',
        detail: 'La entrevistadora está preparando la siguiente pregunta.',
        className: 'border-ion-500/40 bg-ion-500/10 text-ion-300',
        dotClass: 'bg-ion-400 animate-pulse',
      };
    }
    if (speech.isListening) {
      return {
        label: 'Escuchando · habla con naturalidad',
        detail: 'Pulsa el micrófono para detener.',
        className: 'border-red-500/40 bg-red-500/10 text-red-300',
        dotClass: 'bg-red-400 animate-pulse',
      };
    }
    return {
      label: 'Micrófono en pausa',
      detail: 'Pulsa el micrófono para responder por voz.',
      className: 'border-ink-600 bg-ink-800/60 text-mist-400',
      dotClass: 'bg-ink-500',
    };
  }, [speech.supported.stt, speech.isListening, micError, answerMode, interviewerSpeaking, isSending, ttsBusy, pendingQuestion, requiresLiveAvatar, liveAvatarReady]);

  /* ---------------- Estados previos a la entrevista ---------------- */

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 md:px-8 sm:py-24">
        <PageIntro
          index="03"
          kicker="Simulador Inmersivo"
          title="Acceso restringido"
          lead="Inicia sesión y completa tu perfil para que Gemini genere tus entrevistas personalizadas."
        />
        <div className="flex items-center justify-center py-20">
          <Panel className="max-w-lg border-ember-500/30 bg-ember-500/5 text-center">
            <div className="flex flex-col items-center gap-4">
              <span className="flex size-16 items-center justify-center rounded-full border border-ember-500/40 bg-ember-500/10">
                <AlertTriangle className="size-8 text-ember-400" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold text-mist-100">Inicia sesión para continuar</h2>
              <p className="text-sm text-mist-400">
                El simulador requiere una cuenta activa y un perfil completo para generar escenarios adaptados a tu experiencia.
              </p>
              <ButtonLink to={paths.login} size="lg" className="mt-2">
                <span>Iniciar sesión</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  if (!geminiReady) {
    return (
      <div className="container mx-auto px-4 py-12 md:px-8 sm:py-24">
        <PageIntro index="03" kicker="Simulador Inmersivo" title="Configurando el simulador…" lead="Verificando la conexión con el motor de entrevistas." />
        <div className="flex items-center justify-center py-20">
          {geminiError ? (
            <Panel className="max-w-lg border-ember-500/30 bg-ember-500/5">
              <div className="flex items-start gap-3 text-ember-300">
                <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Error de configuración</p>
                  <p className="mt-1 text-xs text-ember-400">{geminiError}</p>
                </div>
              </div>
            </Panel>
          ) : (
            <div className="flex items-center gap-3">
              <Loader2 className="size-6 animate-spin text-signal-400" aria-hidden="true" />
              <p className="text-sm text-mist-400">Inicializando el motor de entrevistas…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showScenarioSelector) {
    return (
      <div className="container mx-auto px-4 py-12 md:px-8 sm:py-24">
        <PageIntro
          index="03"
          kicker="Simulador Inmersivo"
          title="Practica una entrevista real"
          lead="Elige un escenario, escucha las preguntas y responde por voz. Gemini conduce la entrevista y evalúa tu desempeño al final."
        />

        <div className="mt-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {/* Selección */}
          <div className="space-y-6">
            {error ? (
              <Panel className="border-ember-500/30 bg-ember-500/5 p-4">
                <div className="flex min-w-0 items-start gap-3 text-ember-300">
                  <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
                  <p className="min-w-0 break-words text-sm">{error}</p>
                  <button type="button" onClick={() => setError(null)} className="ml-auto text-ember-400 hover:text-ember-200" aria-label="Descartar">
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </Panel>
            ) : null}

            <Panel className="space-y-6 p-5 sm:p-6" ticks>
              <div>
                <MetaLabel index="01">Entrevistadora</MetaLabel>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {INTERVIEWER_PROFILES.map((entry) => (
                    <article
                      key={entry.id}
                      className={cn(
                        'min-w-0 rounded-lg border p-3 transition-colors',
                        selectedAvatar === entry.id ? 'border-signal-400/60 bg-signal-500/10' : 'border-ink-700 hover:border-ink-600',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedAvatar(entry.id)}
                        disabled={heygenAvatar.connectionPending || (heygenAvatar.sessionId !== null && !session)}
                        aria-pressed={selectedAvatar === entry.id}
                        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex size-12 shrink-0 items-center justify-center rounded-full border text-lg font-semibold',
                              selectedAvatar === entry.id
                                ? 'border-signal-400/50 bg-signal-500/15 text-signal-200'
                                : 'border-ink-600 bg-ink-800 text-mist-300',
                            )}
                            aria-hidden="true"
                          >
                            {entry.name.charAt(0)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium text-mist-100">{entry.name}</span>
                              <span className="shrink-0 rounded-full border border-ink-600 px-2 py-0.5 text-[9px] uppercase text-mist-400">
                                {entry.gender}
                              </span>
                            </span>
                            <span className="mt-1 block truncate text-xs text-mist-400">{entry.role}</span>
                            <span className="mt-1 inline-flex rounded-full border border-ink-700 px-1.5 py-0.5 text-[9px] text-mist-500">
                              {entry.liveAvatarId ? 'LiveAvatar' : 'Solo voz'}
                            </span>
                          </span>
                        </span>
                        <span className="mt-3 block min-h-8 text-[10px] leading-relaxed text-mist-500">{entry.description}</span>
                      </button>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-700/70 pt-3">
                        <span className="text-[10px] text-mist-400">
                        {!heygenAvatar.isAvailable || !entry.liveAvatarId
                          ? 'Voz del navegador'
                          : heygenLipSyncAvailable
                            ? 'LiveAvatar · audio TTS al iniciar'
                            : 'LiveAvatar · voz del navegador, sin lip-sync'}
                        </span>
                        {entry.liveAvatarId ? (
                          <button
                            type="button"
                            disabled={selectedAvatar !== entry.id || !speech.supported.tts || speech.isSpeaking || !speech.selectedVoice}
                            onClick={() => speech.previewVoice(
                              undefined,
                              `Hola, soy ${entry.name}, ${entry.gender === 'mujer' ? 'tu entrevistadora' : entry.gender === 'hombre' ? 'tu entrevistador' : 'la persona que conducirá la entrevista'}. ¿Podemos comenzar la entrevista?`,
                            )}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-ink-600 px-2.5 text-[10px] font-medium text-mist-200 transition-colors hover:border-signal-400 hover:text-mist-50 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-8"
                            aria-label={`Probar muestra local de voz de ${entry.name}`}
                            title={selectedAvatar !== entry.id ? 'Selecciona este perfil para probar la voz del navegador' : 'La muestra usa la voz del navegador, no Gemini TTS'}
                          >
                            <Volume2 className="size-3.5" aria-hidden="true" />
                            <span>{speech.isSpeaking && selectedAvatar === entry.id ? 'Reproduciendo…' : 'Probar voz local'}</span>
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
                {INTERVIEWER_PROFILES.some((entry) => entry.liveAvatarId) ? (
                  <p className="mt-2 text-[10px] text-mist-500">
                    La muestra es una síntesis local del navegador; no representa la voz de Gemini ni verifica el audio de LiveAvatar.
                  </p>
                ) : null}
              </div>

              <div>
                <MetaLabel index="02">Escenario</MetaLabel>
                <div className="mt-3">
                  <ScenarioSelector scenarios={dynamicScenarios} onSelect={handleScenarioSelect} loading={generatingScenarios} />
                </div>
                {scenarioGenError ? (
                  <div role="alert" className="mt-3 rounded-md border border-ember-500/40 bg-ember-500/10 p-3">
                    <p className="text-sm text-ember-300">{scenarioGenError}</p>
                    {lastUserProfile ? (
                      <button
                        type="button"
                        disabled={generatingScenarios}
                        onClick={async () => {
                          setGeneratingScenarios(true);
                          setScenarioGenError(null);
                          try {
                            const result = await geminiService.generateScenariosFromProfile(lastUserProfile);
                            if (result.ok) setDynamicScenarios(result.value);
                            else setScenarioGenError(result.error.message);
                          } catch (generationError) {
                            setScenarioGenError(
                              generationError instanceof Error ? generationError.message : 'No se pudieron generar los escenarios.',
                            );
                          } finally {
                            setGeneratingScenarios(false);
                          }
                        }}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-ember-500/40 bg-ember-500/10 px-4 py-2 text-sm font-medium text-ember-300 transition-colors hover:bg-ember-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw className="size-4" aria-hidden="true" />
                        <span>Reintentar generación</span>
                      </button>
                    ) : (
                      <ButtonLink to={paths.panel} size="sm" className="mt-3">
                        Completar perfil
                      </ButtonLink>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-ink-700/60 pt-4">
                <p className="text-xs text-mist-500">
                  {profile.liveAvatarId && heygenAvatar.isAvailable
                    ? heygenLipSyncAvailable
                      ? 'El ID elegido se validará en la allowlist al iniciar. El TTS usa la voz predeterminada del servidor, no una voz determinada por género; el lip-sync real sigue pendiente de prueba.'
                      : 'El ID elegido se validará en la allowlist al iniciar. TTS no está habilitado; no se usará Web Speech como sustituto sincronizado.'
                    : 'Este perfil utilizará la voz del navegador y no iniciará una sesión LiveAvatar.'}
                </p>
              </div>
            </Panel>

            <Panel className="space-y-4 border-signal-500/30 bg-signal-500/[0.04] p-5 sm:p-6" ticks>
              <div>
                <MetaLabel index="03">Preparación</MetaLabel>
                {pendingScenario ? (
                  <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-mist-100">{pendingScenario.title}</h2>
                        <p className="mt-1 text-xs leading-relaxed text-mist-400">{pendingScenario.description}</p>
                      </div>
                      <Badge>{pendingScenario.difficulty}</Badge>
                    </div>
                    <p className="mt-3 border-t border-ink-700/70 pt-3 text-xs text-mist-400">
                      Entrevistador: <span className="font-medium text-mist-200">{profile.name}</span>
                      {' · '}Modo de respuesta: <span className="font-medium text-mist-200">{answerMode === 'voice' ? 'voz' : 'texto'}</span>
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-mist-400">
                    Elige un escenario para revisar la entrevista y el perfil antes de iniciarla.
                  </p>
                )}
              </div>
              <Button
                size="lg"
                className="w-full"
                disabled={!pendingScenario || generatingScenarios || !lastUserProfile}
                onClick={() => void startSelectedScenario()}
              >
                <span>Iniciar entrevista</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <p className="text-center text-[11px] text-mist-500">
                La entrevista comienza aquí. La vista previa remota del avatar es opcional y requiere una acción explícita.
              </p>
            </Panel>

            {!heygenAvatar.isAvailable || !profile.liveAvatarId ? (
              <VoiceSettings
                voices={speech.voices}
                excludedSystemVoices={speech.excludedSystemVoices}
                includeSystemVoices={speech.includeSystemVoices}
                onToggleSystemVoices={speech.setIncludeSystemVoices}
                selectedVoiceURI={speech.selectedVoice?.voice.voiceURI ?? null}
                rate={speech.rate}
                voicesNotice={speech.voicesNotice}
                heygenEnabled={heygenAvatar.isAvailable && profile.liveAvatarId !== null}
                isPreviewing={speech.isSpeaking}
                onSelectVoice={speech.selectVoice}
                onPreviewVoice={speech.previewVoice}
                onRateChange={speech.setRate}
              />
            ) : null}
          </div>

          {/* Vista previa del avatar y estado del simulador */}
          <div>
            <Panel className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6" ticks>
              <AvatarStage
                videoRef={heygenAvatar.videoRef}
                heygenEnabled={heygenAvatar.isAvailable && profile.liveAvatarId !== null}
                isInterviewActive={false}
                heygenState={heygenAvatar.state}
                isStreamReady={heygenAvatar.isStreamReady}
                profile={profile}
                interviewerSpeaking={heygenAvatar.state === 'speaking'}
                isListening={false}
                heygenError={heygenAvatar.error}
                audioPlaybackMuted={heygenAvatar.audioPlaybackMuted}
                audioPlaybackError={heygenAvatar.audioPlaybackError}
                onEnableAudioPlayback={() => {
                  void heygenAvatar.enableAudioPlayback();
                }}
                audioCommandStatus={heygenAvatar.audioCommandStatus}
                audioCommandError={heygenAvatar.audioCommandError}
                onRetryQuestion={() => {}}
                lipSyncAvailable={heygenLipSyncAvailable}
              />
              {heygenAvatar.isAvailable && profile.liveAvatarId ? (
                <div className="w-full space-y-3 border-t border-ink-700/60 pt-5">
                  <div className="space-y-1">
                    <MetaLabel>Vista previa remota</MetaLabel>
                    <p className="text-xs leading-relaxed text-mist-400">
                      Inicia una sesión real de LiveAvatar y puede consumir cuota. No genera una muestra de voz Gemini.
                    </p>
                  </div>
                  {heygenAvatar.sessionId || heygenAvatar.connectionPending ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => void heygenAvatar.stop()}
                    >
                      {heygenAvatar.connectionPending
                        ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        : <Square className="size-4" aria-hidden="true" />}
                      <span>{heygenAvatar.connectionPending ? 'Cancelar conexión' : 'Detener vista previa'}</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={!user || heygenAvatar.state === 'connecting'}
                      onClick={() => {
                        if (user && profile.liveAvatarId) {
                          void heygenAvatar.connect(user.uid, profile.liveAvatarId);
                        }
                      }}
                    >
                      <Play className="size-4" aria-hidden="true" />
                      <span>Conectar avatar para vista previa</span>
                    </Button>
                  )}
                  {!user ? (
                    <p className="text-[11px] text-mist-500">Inicia sesión para solicitar una vista previa.</p>
                  ) : null}
                </div>
              ) : (
                <p className="w-full border-t border-ink-700/60 pt-5 text-xs text-mist-500">
                  Este perfil no tiene un avatar remoto asignado; conserva la opción de voz local.
                </p>
              )}
              <div className="w-full space-y-3 border-t border-ink-700/60 pt-5">
                <MetaLabel>Estado del simulador</MetaLabel>
                <ul className="space-y-2 text-xs">
                  <li className="flex items-center gap-2 text-mist-300">
                    <span className={cn('size-1.5 shrink-0 rounded-full', heygenAvatar.isAvailable ? 'bg-emerald-400' : 'bg-ink-500')} aria-hidden="true" />
                    <span>
                      Avatar de video:{' '}
                      <span className={heygenAvatar.isAvailable ? 'text-emerald-300' : 'text-mist-500'}>
                        {heygenAvatar.isAvailable ? 'activado' : 'desactivado'}
                      </span>
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-mist-300">
                    <span className={cn('size-1.5 shrink-0 rounded-full', speech.supported.stt ? 'bg-emerald-400' : 'bg-ember-400')} aria-hidden="true" />
                    <span>
                      Entrada por voz:{' '}
                      <span className={speech.supported.stt ? 'text-emerald-300' : 'text-ember-300'}>
                        {speech.supported.stt ? 'disponible' : 'no disponible en este navegador'}
                      </span>
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-mist-300">
                    <span className={cn('size-1.5 shrink-0 rounded-full', speech.supported.tts ? 'bg-emerald-400' : 'bg-ember-400')} aria-hidden="true" />
                    <span>
                      Voz del navegador:{' '}
                      <span className={speech.supported.tts ? 'text-emerald-300' : 'text-ember-300'}>
                        {speech.supported.tts ? `${speech.voices.length} voces detectadas` : 'no disponible'}
                      </span>
                    </span>
                  </li>
                </ul>

                {!speech.supported.stt ? (
                  <p className="rounded-lg border border-ember-500/30 bg-ember-500/5 p-4 text-[11px] text-ember-300">
                    Durante la entrevista podrás escribir tus respuestas. Para hablar, prueba con Chrome o Edge actualizados.
                  </p>
                ) : null}

                {!heygenAvatar.isAvailable ? (
                  <p className="rounded-lg border border-ink-700 bg-ink-800/60 p-4 text-[11px] text-mist-500">
                    El avatar de video requiere <code className="text-mist-400">VITE_HEYGEN_ENABLED=true</code> y el backend de sesiones desplegado.
                  </p>
                ) : null}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Entrevista en curso ---------------- */

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-ink-700/80 bg-ink-950/90 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-md border border-red-500/40 bg-red-500/20">
              <span className="size-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-2xs uppercase text-red-400">Entrevista en vivo</p>
              <h1 className="truncate text-sm font-semibold text-mist-100">{session?.scenarioState.title ?? 'Entrevista'}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone={(SESSION_STATUS_COLORS[session?.status ?? 'idle'] ?? 'neutral') as never} className="hidden sm:inline-flex">
              {session?.status ?? 'idle'}
            </Badge>
            <button
              type="button"
              onClick={handleEndInterview}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800/80 px-3 py-1.5 text-xs font-medium text-mist-200 transition-colors hover:border-ember-400 hover:text-ember-300"
            >
              <Square className="size-3.5" aria-hidden="true" />
              <span>Terminar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[96rem] flex-col gap-6 px-4 py-6 md:px-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
          {/* Escenario del avatar */}
          <section
            ref={interviewStageRef}
            tabIndex={-1}
            aria-label="Escenario de entrevista"
            className="flex min-w-0 flex-1 flex-col items-center justify-start gap-6 outline-none"
          >
            <AvatarStage
              videoRef={heygenAvatar.videoRef}
              heygenEnabled={heygenAvatar.isAvailable && profile.liveAvatarId !== null}
              isInterviewActive={Boolean(session)}
              heygenState={heygenAvatar.state}
              isStreamReady={heygenAvatar.isStreamReady}
              profile={profile}
              interviewerSpeaking={interviewerSpeaking}
              isListening={speech.isListening}
              heygenError={heygenAvatar.error}
              audioPlaybackMuted={heygenAvatar.audioPlaybackMuted}
              audioPlaybackError={heygenAvatar.audioPlaybackError}
              onEnableAudioPlayback={() => {
                void heygenAvatar.enableAudioPlayback();
              }}
              audioCommandStatus={heygenAvatar.audioCommandStatus}
              audioCommandError={heygenAvatar.audioCommandError}
              onRetryQuestion={repeatQuestion}
              lipSyncAvailable={heygenLipSyncAvailable}
            />

            {/* Recuperación del avatar sin perder la conversación textual */}
            {heygenAvatar.isAvailable && profile.liveAvatarId && session &&
            (heygenAvatar.state === 'error' || heygenAvatar.state === 'idle') ? (
              <button
                type="button"
                disabled={heygenAvatar.connectionPending}
                onClick={() => {
                  void heygenAvatar.connect(user.uid, profile.liveAvatarId!);
                }}
                className="inline-flex items-center gap-2 rounded-md border border-ember-500/40 bg-ember-500/10 px-3 py-1.5 text-xs font-medium text-ember-300 transition-colors hover:bg-ember-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {heygenAvatar.connectionPending
                  ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  : <RefreshCw className="size-3.5" aria-hidden="true" />}
                <span>
                  {heygenAvatar.connectionPending
                    ? 'Esperando que termine el intento anterior'
                    : heygenAvatar.state === 'error'
                      ? 'Reintentar conexión del avatar'
                      : 'Iniciar conexión del avatar'}
                </span>
              </button>
            ) : null}

            {/* Pregunta actual */}
            <AnimatePresence mode="wait">
              {currentQuestion ? (
                <motion.div
                  key={currentQuestion.slice(0, 40)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
                  className="w-full max-w-2xl"
                >
                  <Panel className="border-signal-500/30 bg-signal-500/5">
                    <div className="flex items-center justify-between gap-3">
                      <MetaLabel index="PREGUNTA">{interviewerSpeaking ? 'Hablando…' : 'Pregunta actual'}</MetaLabel>
                      <button
                        type="button"
                        onClick={repeatQuestion}
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-mist-400 transition-colors hover:text-signal-300"
                      >
                        <RotateCcw className="size-3" aria-hidden="true" />
                        Repetir
                      </button>
                    </div>
                    <p className="mt-3 text-base leading-relaxed text-mist-100">{currentQuestion}</p>
                    {pendingQuestion ? (
                      <p className="mt-3 border-t border-amber-200/10 pt-3 text-xs text-amber-100/80" role="status" aria-live="polite">
                        La pregunta está lista. Se reproducirá cuando el vídeo y la sesión del avatar estén preparados.
                      </p>
                    ) : null}
                  </Panel>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>

          {/* Panel lateral: transcripción y ajustes */}
          <aside className="flex min-w-0 w-full flex-col gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTranscript((value) => !value)}
                className={cn(
                  'inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors',
                  showTranscript ? 'border-signal-400/60 bg-signal-500/10 text-signal-200' : 'border-ink-600 text-mist-300 hover:border-ink-500',
                )}
                aria-expanded={showTranscript}
              >
                <MessageSquare className="size-3.5" aria-hidden="true" />
                <span>Transcripción ({userMessageCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setShowVoiceSettings((value) => !value)}
                className={cn(
                  'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors',
                  showVoiceSettings ? 'border-signal-400/60 bg-signal-500/10 text-signal-200' : 'border-ink-600 text-mist-300 hover:border-ink-500',
                )}
                aria-expanded={showVoiceSettings}
                aria-label="Configuración de voz"
              >
                <Settings2 className="size-3.5" aria-hidden="true" />
              </button>
            </div>

            {showVoiceSettings ? (
              <VoiceSettings
                voices={speech.voices}
                excludedSystemVoices={speech.excludedSystemVoices}
                includeSystemVoices={speech.includeSystemVoices}
                onToggleSystemVoices={speech.setIncludeSystemVoices}
                selectedVoiceURI={speech.selectedVoice?.voice.voiceURI ?? null}
                rate={speech.rate}
                voicesNotice={speech.voicesNotice}
                heygenEnabled={heygenAvatar.isAvailable && profile.liveAvatarId !== null}
                isPreviewing={speech.isSpeaking}
                onSelectVoice={speech.selectVoice}
                onPreviewVoice={speech.previewVoice}
                onRateChange={speech.setRate}
              />
            ) : null}

            {showTranscript ? (
              <Panel className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto" role="log" aria-live="polite" aria-label="Transcripción de la entrevista">
                  {session?.messages.map((message) => <MessageBubble key={message.id} message={message} interviewerName={profile.name} />)}
                  <div ref={messagesEndRef} />
                </div>
              </Panel>
            ) : null}

            {/* Evaluación */}
            <Panel className="space-y-3">
              <div className="flex items-center justify-between">
                <MetaLabel index="04">Evaluación</MetaLabel>
                {evaluation ? (
                  <Badge tone={evaluation.score >= 70 ? 'done' : evaluation.score >= 40 ? 'neutral' : 'pending'}>{evaluation.score}/100</Badge>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleEvaluate}
                disabled={evaluating || userMessageCount === 0}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-signal-500 to-ion-400 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:from-signal-400 hover:to-ion-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {evaluating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                <span>{evaluating ? 'Evaluando…' : 'Evaluar desempeño'}</span>
              </button>
              {evaluation ? (
                <div className="space-y-2 text-xs">
                  {evaluation.strengths.length > 0 ? (
                    <div>
                      <p className="font-mono text-[10px] uppercase text-mist-500">Fortalezas</p>
                      <ul className="mt-1 space-y-1">
                        {evaluation.strengths.map((item, index) => (
                          <li key={`s-${index}`} className="flex min-w-0 gap-1.5 text-mist-300">
                            <span className="text-signal-400" aria-hidden="true">+</span>
                            <span className="min-w-0 break-words">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {evaluation.improvements.length > 0 ? (
                    <div>
                      <p className="font-mono text-[10px] uppercase text-mist-500">Áreas de mejora</p>
                      <ul className="mt-1 space-y-1">
                        {evaluation.improvements.map((item, index) => (
                          <li key={`i-${index}`} className="flex min-w-0 gap-1.5 text-mist-300">
                            <span className="text-ember-400" aria-hidden="true">→</span>
                            <span className="min-w-0 break-words">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {evaluation.summary ? <p className="italic text-mist-400">{evaluation.summary}</p> : null}
                </div>
              ) : (
                <p className="text-xs text-mist-500">
                  {userMessageCount === 0 ? 'Responde al menos una pregunta para evaluar.' : 'Listo para evaluar tu desempeño.'}
                </p>
              )}
            </Panel>

            {/* Modo Caos */}
            <Panel className="space-y-3">
              <div className="flex items-center justify-between">
                <MetaLabel>Modo Caos</MetaLabel>
                <Badge tone={session?.chaosAvailable ? 'accent' : 'neutral'}>{session?.chaosAvailable ? 'Disponible' : 'En enfriamiento'}</Badge>
              </div>
              <button
                type="button"
                onClick={handleChaos}
                disabled={!session?.chaosAvailable || chaosLoading || session?.status !== 'active'}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-ember-500/40 bg-ember-500/10 px-4 py-2 text-sm font-medium text-ember-300 transition-colors hover:bg-ember-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {chaosLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Zap className="size-4" aria-hidden="true" />}
                <span>{chaosLoading ? 'Preparando…' : 'Introducir imprevisto'}</span>
              </button>
            </Panel>
          </aside>
        </div>
      </main>

      {/* Barra de controles inferior */}
      <footer className="sticky bottom-0 z-30 border-t border-ink-700/80 bg-ink-950/95 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-8">
          {/* Error de red/servicio con acción de reintento */}
          {error ? (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 rounded-md border border-ember-500/40 bg-ember-500/10 px-3 py-1.5 text-[11px] text-ember-300">
              <span className="font-medium">{error}</span>
              {lastFailedAnswer ? (
                <button
                  type="button"
                  onClick={retryLastAnswer}
                  disabled={isSending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ember-500/50 px-2 py-0.5 font-medium transition-colors hover:bg-ember-500/20 disabled:opacity-50"
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                  <span>Reintentar</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-ember-400 transition-colors hover:text-ember-200"
                aria-label="Descartar el error"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {/* Aviso si el TTS del entrevistador falla: el avatar seguirá sin lip-sync */}
          {ttsError ? (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
              <span className="font-medium">{ttsErrorTitle(ttsError.code)}: {ttsError.message}</span>
              {heygenLipSyncAvailable && session && ttsError.code !== 'tts-disabled' ? (
                <button
                  type="button"
                  onClick={repeatQuestion}
                  disabled={ttsBusy || pendingQuestion !== null}
                  className="inline-flex items-center gap-1.5 rounded border border-amber-500/50 px-2 py-0.5 font-medium transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                  <span>Reintentar voz</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setTtsError(null)}
                className="text-amber-400 transition-colors hover:text-amber-200"
                aria-label="Descartar el aviso de voz"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <div
            className={cn('mb-2 flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-center text-[11px]', voiceStatus.className)}
            role="status"
            aria-live="polite"
          >
            <span className={cn('size-1.5 shrink-0 rounded-full', voiceStatus.dotClass)} aria-hidden="true" />
            <span className="font-medium">{voiceStatus.label}</span>
            <span className="hidden text-mist-500 sm:inline">· {voiceStatus.detail}</span>
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            {/* Control de micrófono — siempre renderizado para que sea fácil de encontrar */}
            <div className="flex shrink-0 flex-col items-center gap-1">
              <button
                type="button"
                onClick={answerMode === 'voice' ? toggleMic : () => switchAnswerMode('voice')}
                disabled={!speech.supported.stt || (answerMode === 'voice' && (interviewerSpeaking || heygenAvatar.audioCommandStatus === 'sent' || pendingQuestion !== null || (requiresLiveAvatar && !liveAvatarReady)))}
                className={cn(
                  'flex size-12 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  speech.isListening && answerMode === 'voice'
                    ? 'border-red-500/60 bg-red-500/20 text-red-400'
                    : 'border-ink-600 bg-ink-800/80 text-mist-300 hover:border-signal-400 hover:text-signal-300',
                )}
                aria-label={
                  !speech.supported.stt
                    ? 'Reconocimiento de voz no disponible en este navegador'
                    : answerMode !== 'voice'
                      ? 'Activar modo voz'
                      : speech.isListening
                        ? 'Detener micrófono'
                        : requiresLiveAvatar && !liveAvatarReady
                          ? 'Micrófono disponible cuando el vídeo esté listo'
                          : 'Activar micrófono'
                }
                aria-pressed={speech.isListening && answerMode === 'voice'}
                title={!speech.supported.stt ? 'Tu navegador no admite reconocimiento de voz. Escribe tu respuesta.' : undefined}
              >
                {speech.isListening && answerMode === 'voice' ? (
                  <Mic className="size-5 animate-pulse" aria-hidden="true" />
                ) : (
                  <MicOff className="size-5" aria-hidden="true" />
                )}
              </button>
              <span className="text-[9px] font-medium uppercase tracking-wide text-mist-500">
                {!speech.supported.stt
                  ? 'Sin voz'
                  : answerMode !== 'voice'
                    ? 'Activar voz'
                    : speech.isListening
                      ? 'Grabando'
                      : 'Hablar'}
              </span>
            </div>

            {/* Campo de texto / transcripción */}
            <div className="relative min-w-0 flex-1">
              <textarea
                value={speech.interimTranscript ? `${inputValue} ${speech.interimTranscript}`.trim() : inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submitAnswer(inputValue);
                  }
                }}
                rows={1}
                placeholder={
                  answerMode === 'voice'
                    ? speech.isListening
                      ? 'Escuchando… habla con naturalidad'
                      : 'Pulsa el micrófono para responder por voz'
                    : 'Escribe tu respuesta…'
                }
                disabled={isSending}
                aria-label="Tu respuesta"
                className="max-h-28 min-h-11 w-full resize-none rounded-md border border-ink-600 bg-ink-800/80 px-4 py-3 text-sm text-mist-100 placeholder:text-mist-500 focus:border-signal-400 focus:outline-none disabled:opacity-60"
              />
              {speech.isListening ? (
                <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 text-[10px] font-medium text-red-400">
                  <span className="size-1.5 animate-pulse rounded-full bg-red-400" aria-hidden="true" />
                  REC
                </span>
              ) : null}
            </div>

            {/* Enviar */}
            <Button type="submit" disabled={isSending || !inputValue.trim()} className="h-11 shrink-0">
              {isSending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Send className="size-5" aria-hidden="true" />}
              <span className="sr-only">Enviar respuesta</span>
            </Button>
          </form>

          {/* Controles secundarios */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => switchAnswerMode(answerMode === 'voice' ? 'text' : 'voice')}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 px-2.5 py-1 text-mist-400 transition-colors hover:border-ink-500 hover:text-mist-200"
            >
              {answerMode === 'voice' ? <Keyboard className="size-3" aria-hidden="true" /> : <Mic className="size-3" aria-hidden="true" />}
              <span>{answerMode === 'voice' ? 'Escribir en su lugar' : 'Responder por voz'}</span>
            </button>

            {answerMode === 'voice' && speech.supported.stt ? (
              <button
                type="button"
                onClick={() => setAutoSend((value) => !value)}
                aria-pressed={autoSend}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors',
                  autoSend ? 'border-signal-400/50 text-signal-300' : 'border-ink-700 text-mist-400 hover:border-ink-500',
                )}
              >
                <span>Auto-envío: {autoSend ? 'activado' : 'desactivado'}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={toggleMuteAudio}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 px-2.5 py-1 text-mist-400 transition-colors hover:border-ink-500 hover:text-mist-200"
              aria-label={muted ? 'Activar audio' : 'Silenciar audio'}
            >
              {muted ? <VolumeX className="size-3" aria-hidden="true" /> : <Volume2 className="size-3" aria-hidden="true" />}
              <span>{muted ? 'Audio silenciado' : 'Silenciar audio'}</span>
            </button>

            {!heygenAvatar.isAvailable ? (
              <span className="text-mist-600">Voz del navegador · {speech.selectedVoice?.name ?? 'sin voz'}</span>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
