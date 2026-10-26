import { Play, Volume2, Mic, AlertCircle, Check, MonitorSpeaker } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { VoiceOption } from '@/hooks/useSpeech';

export interface VoiceSettingsProps {
  voices: VoiceOption[];
  excludedSystemVoices: VoiceOption[];
  includeSystemVoices: boolean;
  onToggleSystemVoices: (value: boolean) => void;
  selectedVoiceURI: string | null;
  rate: number;
  voicesNotice: string | null;
  heygenEnabled: boolean;
  isPreviewing: boolean;
  onSelectVoice: (voiceURI: string) => void;
  onPreviewVoice: (voiceURI?: string) => void;
  onRateChange: (rate: number) => void;
}

const GENDER_LABEL: Record<VoiceOption['gender'], string | null> = {
  female: 'Femenina',
  male: 'Masculina',
  // El proveedor no declara género: no lo inferimos del nombre.
  unknown: null,
};

function voiceBadge(option: VoiceOption): { text: string; className: string } {
  if (option.isSystemVoice) return { text: 'Sistema', className: 'border-ember-500/40 bg-ember-500/10 text-ember-300' };
  if (option.isLatinSpanish) return { text: 'ES Latino', className: 'border-signal-500/40 bg-signal-500/10 text-signal-300' };
  if (option.isSpanish) return { text: 'ES', className: 'border-ion-500/40 bg-ion-500/10 text-ion-300' };
  return { text: option.lang || '—', className: 'border-ink-600 bg-ink-800 text-mist-400' };
}

function VoiceRow({
  option,
  isSelected,
  onSelect,
  onPreview,
}: {
  option: VoiceOption;
  isSelected: boolean;
  onSelect: (voiceURI: string) => void;
  onPreview: (voiceURI: string) => void;
}) {
  const badge = voiceBadge(option);
  const genderLabel = GENDER_LABEL[option.gender];

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-3 rounded-md border px-3 py-2 transition-colors',
          isSelected ? 'border-signal-400/60 bg-signal-500/10' : 'border-ink-700 bg-ink-850/60 hover:border-ink-600',
        )}
      >
        <button
          type="button"
          role="option"
          aria-selected={isSelected}
          onClick={() => onSelect(option.voice.voiceURI)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full border',
              isSelected ? 'border-signal-400 bg-signal-400/20' : 'border-ink-600',
            )}
            aria-hidden="true"
          >
            {isSelected ? <Check className="size-3 text-signal-300" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-mist-100">{option.name}</span>
            <span className="mt-0.5 flex items-center gap-2">
              <span className={cn('rounded-xs border px-1.5 py-0.5 font-mono text-[10px] uppercase', badge.className)}>
                {badge.text}
              </span>
              {genderLabel ? <span className="text-[10px] text-mist-500">{genderLabel}</span> : null}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onPreview(option.voice.voiceURI)}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-ink-600 text-mist-400 transition-colors hover:border-signal-400 hover:text-signal-300"
          aria-label={`Escuchar muestra de ${option.name}`}
        >
          <Play className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

/**
 * Configuración de voz.
 * Excluye por defecto las voces del sistema (Microsoft) y prioriza español latinoamericano.
 */
export function VoiceSettings({
  voices,
  excludedSystemVoices,
  includeSystemVoices,
  onToggleSystemVoices,
  selectedVoiceURI,
  rate,
  voicesNotice,
  heygenEnabled,
  isPreviewing,
  onSelectVoice,
  onPreviewVoice,
  onRateChange,
}: VoiceSettingsProps) {
  return (
    <div className="w-full space-y-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-6 md:p-8">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-semibold tracking-wider text-cyan-400 uppercase">
          03 CONFIGURACIÓN DE VOZ
        </span>
      </div>

      <div>
        <h3 className="text-xl font-bold text-white">Elige cómo habla la entrevistadora</h3>
        <p className="mt-1 text-sm text-slate-400">
          {heygenEnabled
            ? 'Con el avatar activo, LiveAvatar genera el audio y sincroniza los labios. Estas voces son la preferencia de respaldo.'
            : 'Voces del navegador. Las voces del sistema (Microsoft) se excluyen por defecto por su baja naturalidad.'}
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
          <p className="text-xs font-medium text-mist-300">Voces disponibles</p>
          <span className="font-mono text-[11px] text-mist-500">{voices.length}</span>
        </div>

        {voices.length === 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-ember-500/30 bg-ember-500/5 p-4">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-ember-400" aria-hidden="true" />
            <p className="text-xs text-mist-300">
              {voicesNotice ?? 'No hay voces disponibles. Puedes escribir tus respuestas.'}
            </p>
          </div>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1" role="listbox" aria-label="Voces disponibles">
            {voices.map((option) => (
              <VoiceRow
                key={option.voice.voiceURI}
                option={option}
                isSelected={option.voice.voiceURI === selectedVoiceURI}
                onSelect={onSelectVoice}
                onPreview={onPreviewVoice}
              />
            ))}
          </ul>
        )}
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

      <div className="flex flex-wrap gap-2 border-t border-ink-700/60 pt-4">
        <button
          type="button"
          onClick={() => onPreviewVoice()}
          disabled={voices.length === 0 || isPreviewing}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-ink-600 px-3 text-xs font-medium text-mist-200 transition-colors hover:border-signal-400 hover:text-mist-50 disabled:opacity-50"
        >
          {isPreviewing ? <Volume2 className="size-3.5 animate-pulse" /> : <Play className="size-3.5" />}
          <span>Probar voz seleccionada</span>
        </button>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-mist-500">
          <Mic className="size-3" aria-hidden="true" />
          Tu preferencia se guarda en este navegador
        </span>
      </div>
    </div>
  );
}
