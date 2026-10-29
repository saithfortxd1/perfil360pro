import { Play, Square, Volume2, Mic, AlertCircle, MonitorSpeaker } from 'lucide-react';

import type { VoiceOption } from '@/hooks/useSpeech';

export interface VoiceSettingsProps {
  voices: VoiceOption[];
  voicesLoading?: boolean;
  excludedSystemVoices: VoiceOption[];
  includeSystemVoices: boolean;
  onToggleSystemVoices: (value: boolean) => void;
  selectedVoiceURI: string | null;
  rate: number;
  voicesNotice: string | null;
  browserTtsAvailable: boolean;
  heygenEnabled: boolean;
  isPreviewing: boolean;
  onSelectVoice: (voiceURI: string) => void;
  onPreviewVoice: (voiceURI?: string) => void;
  onStopPreview?: () => void;
  onRateChange: (rate: number) => void;
}

const GENDER_LABEL: Record<VoiceOption['gender'], string | null> = {
  female: 'Femenina probable',
  male: 'Masculina probable',
  unknown: null,
};

function voiceProvider(option: VoiceOption): string {
  const identity = `${option.name} ${option.voice.voiceURI}`.toLowerCase();
  if (identity.includes('google')) return 'Google';
  if (identity.includes('microsoft') || identity.includes('msft')) return 'Microsoft';
  if (identity.includes('apple')) return 'Apple';
  if (identity.includes('amazon')) return 'Amazon';
  return 'Navegador';
}

/**
 * Configuración y selector de voz con previsualización inmediata.
 * Prioriza español latinoamericano y guarda la preferencia localmente.
 */
export function VoiceSettings({
  voices,
  voicesLoading = false,
  excludedSystemVoices,
  includeSystemVoices,
  onToggleSystemVoices,
  selectedVoiceURI,
  rate,
  voicesNotice,
  browserTtsAvailable,
  heygenEnabled,
  isPreviewing,
  onSelectVoice,
  onPreviewVoice,
  onStopPreview,
  onRateChange,
}: VoiceSettingsProps) {
  const handleGlobalPreviewToggle = () => {
    if (isPreviewing) {
      if (onStopPreview) onStopPreview();
    } else {
      onPreviewVoice(selectedVoiceURI ?? voices[0]?.voice.voiceURI);
    }
  };

  return (
    <div className="w-full space-y-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-6 md:p-8">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono font-semibold tracking-wider text-cyan-400 uppercase">
          03 CONFIGURACIÓN DE VOZ
        </span>
        {voices.length > 0 ? (
          <span className="rounded-full border border-signal-500/30 bg-signal-500/10 px-2 py-0.5 font-mono text-[11px] text-signal-300">
            {voices.length} {voices.length === 1 ? 'voz' : 'voces'} disponibles
          </span>
        ) : null}
      </div>

      <div>
        <h3 className="text-xl font-bold text-white">Voz del entrevistador</h3>
        <p className="mt-1 text-sm text-slate-400">
          {heygenEnabled
            ? 'Esta voz se utiliza en el simulador mediante Web Speech API si el avatar está cargando o no genera audio. Elige una voz y escucha su muestra antes de iniciar.'
            : 'Elige una voz española y escucha la muestra antes de iniciar la entrevista.'}
        </p>
      </div>

      {/* Velocidad */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="voice-rate" className="text-xs font-medium text-mist-300">
            Velocidad de habla
          </label>
          <span className="font-mono text-xs text-mist-400">{rate.toFixed(2)}×</span>
        </div>
        <div className="px-1 py-2">
          <input
            id="voice-rate"
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={rate}
            onChange={(event) => onRateChange(Number(event.target.value))}
            className="w-full accent-signal-400"
            aria-describedby="voice-rate-hint"
          />
        </div>
        <p id="voice-rate-hint" className="text-[11px] text-mist-500">
          0.5× más lento · 1.0× normal · 1.5× más rápido
        </p>
      </div>

      {/* Lista de voces */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-mist-300">Voces en español (prioriza Latinoamérica)</p>
          {isPreviewing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-signal-300">
              <Volume2 className="size-3.5 animate-pulse" />
              <span>Reproduciendo muestra…</span>
            </span>
          ) : null}
        </div>

        {voicesLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 p-4 text-xs text-mist-300" role="status" aria-live="polite">
            <span className="size-3 animate-spin rounded-full border-2 border-signal-400 border-t-transparent" aria-hidden="true" />
            Comprobando las voces disponibles en este navegador…
          </div>
        ) : voices.length === 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-ember-500/30 bg-ember-500/5 p-4">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-ember-400" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-ember-300">
                {voicesNotice ?? 'El navegador todavía no ha cargado ninguna voz.'}
              </p>
              <p className="text-[11px] text-mist-400">
                Si estás usando Firefox o una ventana de incógnito, las voces pueden tardar unos segundos en inicializarse.
              </p>
            </div>
          </div>
        ) : (
          null
        )}
        <label className="block space-y-1.5" htmlFor="interviewer-voice-select">
          <span className="text-xs font-medium text-mist-300">Voz disponible en este navegador</span>
          <select
            id="interviewer-voice-select"
            value={selectedVoiceURI ?? ''}
            disabled={voices.length === 0}
            onChange={(event) => onSelectVoice(event.target.value)}
            className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="" disabled>{voices.length ? 'Selecciona una voz española…' : 'Sin voces españolas adicionales'}</option>
            {selectedVoiceURI && !voices.some((option) => option.voice.voiceURI === selectedVoiceURI) ? (
              <option value={selectedVoiceURI} disabled>Voz guardada no disponible</option>
            ) : null}
            {voices.map((option) => (
              <option key={option.voice.voiceURI} value={option.voice.voiceURI}>
                {option.name} · {option.lang || 'idioma desconocido'} · {voiceProvider(option)}
                {GENDER_LABEL[option.gender] ? ` · ${GENDER_LABEL[option.gender]}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Voces del sistema excluidas */}
      {excludedSystemVoices.length > 0 ? (
        <div className="space-y-2 border-t border-ink-700/60 pt-4">
          <label className="flex items-start gap-2 text-xs text-mist-300">
            <input
              type="checkbox"
              checked={includeSystemVoices}
              onChange={(event) => onToggleSystemVoices(event.target.checked)}
              className="mt-0.5 accent-signal-400"
            />
            <span>
              Incluir {excludedSystemVoices.length} voz{excludedSystemVoices.length === 1 ? '' : 'es'} del sistema
              <span className="ml-1 inline-flex items-center gap-1 text-mist-500">
                <MonitorSpeaker className="size-3" aria-hidden="true" />
              </span>
            </span>
          </label>
          <p className="text-[11px] text-mist-500">
            Detectadas como voces del sistema (Microsoft/SAPI). Suelen sonar más robóticas; solo si no hay otra opción.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700/60 pt-4">
        <button
          type="button"
          onClick={handleGlobalPreviewToggle}
          disabled={!browserTtsAvailable}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-ink-600 px-3 text-xs font-medium text-mist-200 transition-colors hover:border-signal-400 hover:text-mist-50 disabled:opacity-50"
        >
          {isPreviewing ? (
            <>
              <Square className="size-3.5 fill-current text-signal-300" />
              <span>Detener muestra</span>
            </>
          ) : (
            <>
              <Play className="size-3.5 text-signal-300" />
              <span>Escuchar voz seleccionada</span>
            </>
          )}
        </button>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-mist-500">
          <Mic className="size-3" aria-hidden="true" />
          Tu preferencia se guarda automáticamente en este navegador
        </span>
      </div>
    </div>
  );
}
