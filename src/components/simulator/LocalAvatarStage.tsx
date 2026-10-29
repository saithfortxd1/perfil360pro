import { Volume2, Mic, Pause, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InterviewerProfile } from '@/services/ai/interviewers';

export type LocalAvatarState = 'preparing' | 'listening' | 'speaking' | 'idle' | 'paused';

interface LocalAvatarStageProps {
  profile: InterviewerProfile;
  state?: LocalAvatarState;
  isSpeaking: boolean;
  isListening: boolean;
  isInterviewActive: boolean;
  currentQuestion?: string | null;
  avatarMode?: 'local' | 'remote';
  onSwitchMode?: (mode: 'local' | 'remote') => void;
  voiceName?: string | null;
  voiceRate?: number;
}

/**
 * Representación visual moderna y profesional para el avatar local masculino (Mateo, James, Andrés)
 * sin requerir WebRTC ni créditos de HeyGen.
 * Incluye estados visuales reactivos (preparando, hablando, escuchando, pausa),
 * ondas de sonido animadas, y retrato estilizado con iluminación elegante.
 */
export function LocalAvatarStage({
  profile,
  state: customState,
  isSpeaking,
  isListening,
  isInterviewActive,
  avatarMode = 'local',
  onSwitchMode,
  voiceName,
  voiceRate = 1.10,
}: LocalAvatarStageProps) {
  // Determinar estado actual
  const computedState: LocalAvatarState = customState ?? (() => {
    if (!isInterviewActive) return 'idle';
    if (isSpeaking) return 'speaking';
    if (isListening) return 'listening';
    return 'idle';
  })();

  const statusConfig = {
    idle: {
      label: isInterviewActive ? 'En espera' : 'Listo para entrevistar',
      badgeClass: 'border-white/10 bg-black/40 text-mist-200',
      dotClass: 'bg-emerald-400',
      message: isInterviewActive
        ? `${profile.name} está atento a tu respuesta.`
        : 'Selecciona un escenario para iniciar la entrevista.',
    },
    preparing: {
      label: 'Preparando entrevista',
      badgeClass: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
      dotClass: 'bg-amber-400 animate-ping',
      message: 'Construyendo el contexto y la primera pregunta...',
    },
    speaking: {
      label: 'Hablando',
      badgeClass: 'border-signal-400/40 bg-signal-500/20 text-signal-100',
      dotClass: 'bg-signal-400 animate-pulse',
      message: 'Escucha con atención la pregunta antes de responder.',
    },
    listening: {
      label: 'Escuchando tu respuesta',
      badgeClass: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200',
      dotClass: 'bg-emerald-400 animate-pulse',
      message: 'Micrófono activo. Habla con claridad cuando desees.',
    },
    paused: {
      label: 'En pausa',
      badgeClass: 'border-ink-600 bg-ink-800 text-mist-400',
      dotClass: 'bg-ink-500',
      message: 'La simulación está en pausa.',
    },
  }[computedState];

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-4">
      {/* Contenedor con relación de aspecto 16:9 y fondo estilizado */}
      <div className="relative w-full min-w-0">
        <div
          style={{ maxWidth: 'min(100%, calc(52dvh * 16 / 9))' }}
          className={cn(
            'relative mx-auto aspect-video w-full overflow-hidden rounded-2xl border transition-all duration-500 shadow-[0_24px_80px_-44px_rgb(0_0_0/0.95)]',
            computedState === 'speaking'
              ? 'border-signal-400/60 shadow-[0_0_50px_-10px_rgba(56,189,248,0.25)]'
              : computedState === 'listening'
              ? 'border-emerald-500/50 shadow-[0_0_50px_-10px_rgba(52,211,153,0.2)]'
              : 'border-ink-700/80 bg-ink-950',
          )}
        >
          {/* Fondo gradiente atmosférico con efecto halo */}
          <div
            className={cn(
              'absolute inset-0 transition-opacity duration-700',
              computedState === 'speaking'
                ? 'bg-[radial-gradient(circle_at_50%_40%,_rgba(14,116,144,0.35)_0%,_rgba(15,23,42,0.95)_70%)]'
                : computedState === 'listening'
                ? 'bg-[radial-gradient(circle_at_50%_40%,_rgba(5,150,105,0.25)_0%,_rgba(15,23,42,0.95)_70%)]'
                : 'bg-[radial-gradient(circle_at_50%_40%,_rgba(30,41,59,0.5)_0%,_rgba(15,23,42,0.98)_80%)]',
            )}
          />

          {/* Anillos concéntricos de energía/respiración sutil */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={cn(
                'absolute rounded-full border border-white/5 transition-all duration-1000',
                computedState === 'speaking'
                  ? 'size-72 scale-110 border-signal-400/20 animate-pulse'
                  : computedState === 'listening'
                  ? 'size-64 scale-105 border-emerald-400/20'
                  : 'size-56 opacity-40',
              )}
            />
            <div
              className={cn(
                'absolute rounded-full border border-white/5 transition-all duration-700',
                computedState === 'speaking'
                  ? 'size-96 scale-125 border-signal-400/10'
                  : computedState === 'listening'
                  ? 'size-80 scale-110 border-emerald-400/10'
                  : 'size-72 opacity-20',
              )}
            />
          </div>

          {/* Tarjeta superior: Identidad y Badge de Estado */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3 sm:p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-semibold text-white sm:text-sm">{profile.name}</p>
                <span className="rounded-full bg-signal-400/20 px-2 py-0.5 text-[9px] font-medium text-signal-300 border border-signal-400/30">
                  Modo Local AI
                </span>
              </div>
              <p className="truncate text-[10px] text-white/70 sm:text-xs">
                {profile.role} · {profile.company}
              </p>
            </div>

            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-medium backdrop-blur sm:text-[10px] transition-colors',
                statusConfig.badgeClass,
              )}
            >
              <span className={cn('size-1.5 rounded-full', statusConfig.dotClass)} aria-hidden="true" />
              {statusConfig.label}
            </span>
          </div>

          {/* Retrato visual estilizado del Entrevistador masculino */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="relative group">
              {/* Resplandor posterior dinámico */}
              <div
                className={cn(
                  'absolute -inset-4 rounded-full blur-xl transition-all duration-500 opacity-60',
                  computedState === 'speaking'
                    ? 'bg-gradient-to-tr from-signal-500 to-cyan-400 scale-110'
                    : computedState === 'listening'
                    ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 scale-105'
                    : 'bg-slate-700/40 scale-95',
                )}
              />

              {/* Marco del Avatar con Silueta SVG de Alta Calidad */}
              <div
                className={cn(
                  'relative flex size-28 sm:size-36 items-center justify-center rounded-full border-2 bg-gradient-to-b from-slate-800 to-slate-950 shadow-2xl transition-all duration-300',
                  computedState === 'speaking'
                    ? 'border-signal-300 scale-105'
                    : computedState === 'listening'
                    ? 'border-emerald-400'
                    : 'border-slate-700',
                )}
              >
                {/* Gráfico SVG estilizado representativo masculino */}
                <svg
                  className="size-20 sm:size-24 text-slate-200"
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-label={`Retrato de ${profile.name}`}
                >
                  <defs>
                    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#bae6fd" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                    <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#475569" />
                      <stop offset="100%" stopColor="#1e293b" />
                    </linearGradient>
                  </defs>

                  {/* Cabeza / Rostro */}
                  <circle cx="50" cy="38" r="20" fill="url(#avatarGrad)" opacity="0.9" />

                  {/* Cabello ejecutivo masculino */}
                  <path
                    d="M32 35C32 25 40 19 50 19C60 19 68 25 68 35C65 30 58 28 50 28C42 28 35 30 32 35Z"
                    fill="#334155"
                  />

                  {/* Cuerpo / Hombros ejecutivos */}
                  <path
                    d="M20 85C20 68 33 62 50 62C67 62 80 68 80 85C80 87 78 88 76 88H24C22 88 20 87 20 85Z"
                    fill="url(#bodyGrad)"
                  />
                  {/* Cuello ejecutivo / Traje formal */}
                  <path d="M44 62L50 72L56 62H44Z" fill="#f8fafc" />
                </svg>

                {/* Insignia flotante en el avatar indicando actividad */}
                <div
                  className={cn(
                    'absolute bottom-0 right-0 flex size-8 sm:size-9 items-center justify-center rounded-full border-2 border-slate-900 shadow-md transition-colors',
                    computedState === 'speaking'
                      ? 'bg-signal-500 text-white'
                      : computedState === 'listening'
                      ? 'bg-emerald-500 text-white'
                      : computedState === 'paused'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-700 text-slate-300',
                  )}
                >
                  {computedState === 'speaking' ? (
                    <Volume2 className="size-4 animate-pulse" aria-hidden="true" />
                  ) : computedState === 'listening' ? (
                    <Mic className="size-4 animate-bounce" aria-hidden="true" />
                  ) : computedState === 'paused' ? (
                    <Pause className="size-4" aria-hidden="true" />
                  ) : (
                    <Sparkles className="size-4" aria-hidden="true" />
                  )}
                </div>
              </div>
            </div>

            {/* Ondas dinámicas de sonido cuando el entrevistador habla */}
            {computedState === 'speaking' ? (
              <div className="mt-4 flex items-center justify-center gap-1.5 h-6" aria-label="Audio activo">
                <span className="w-1 rounded-full bg-signal-400 animate-pulse h-3" style={{ animationDelay: '0ms' }} />
                <span className="w-1 rounded-full bg-signal-400 animate-pulse h-5" style={{ animationDelay: '150ms' }} />
                <span className="w-1 rounded-full bg-signal-300 animate-pulse h-6" style={{ animationDelay: '300ms' }} />
                <span className="w-1 rounded-full bg-signal-400 animate-pulse h-4" style={{ animationDelay: '100ms' }} />
                <span className="w-1 rounded-full bg-signal-400 animate-pulse h-2" style={{ animationDelay: '250ms' }} />
              </div>
            ) : computedState === 'listening' ? (
              <p className="mt-4 text-xs font-medium text-emerald-300 animate-pulse">
                Escuchando tu respuesta...
              </p>
            ) : (
              <p className="mt-4 text-xs text-mist-400 text-center max-w-xs">
                {statusConfig.message}
              </p>
            )}
          </div>

          {/* Barra inferior informativa fija */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-white/5 bg-black/50 px-3 py-2 backdrop-blur sm:px-4">
            <span className="text-[10px] text-mist-400">
              Voz del navegador: <span className="text-mist-200">{voiceName ?? 'sin voz disponible'} ({voiceRate.toFixed(2)}×)</span>
            </span>
            <span className="text-[10px] text-mist-500 font-medium">
              Configuración fija
            </span>
          </div>
        </div>
      </div>

      {/* Selector explícito de modo (Local vs HeyGen Remoto) */}
      {onSwitchMode && profile.liveAvatarId ? (
        <div className="flex w-full items-center justify-between rounded-lg border border-ink-700/80 bg-ink-900/60 p-2.5 text-xs">
          <div className="flex flex-col">
            <span className="font-medium text-mist-200">Modo del avatar</span>
            <span className="text-[11px] text-mist-500">
              {avatarMode === 'local'
                ? 'Local: Sin consumo de créditos ni dependencias externas.'
                : 'Remoto (HeyGen): Requiere créditos activos de LiveAvatar.'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-md bg-ink-950 p-1 border border-ink-800">
            <button
              type="button"
              onClick={() => onSwitchMode('local')}
              className={cn(
                'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                avatarMode === 'local'
                  ? 'bg-signal-500/20 text-signal-200 border border-signal-500/40'
                  : 'text-mist-400 hover:text-mist-200',
              )}
            >
              Local (Recomendado)
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('remote')}
              className={cn(
                'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                avatarMode === 'remote'
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                  : 'text-mist-400 hover:text-mist-200',
              )}
            >
              Remoto (HeyGen)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
