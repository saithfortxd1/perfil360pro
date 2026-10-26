import { Reveal } from '@/components/animations/Reveal';

export interface StageSignalsProps {
  signals: readonly string[];
}

/** Composición de la etapa 1: lectura de señales en tres columnas con ejes. */
export function StageSignals({ signals }: StageSignalsProps) {
  return (
    <Reveal delay={0.12} y={18}>
      <div className="panel panel--ticks mt-10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="meta-label">Señales detectadas</p>
          <p className="meta-label text-mist-600">
            {String(signals.length).padStart(2, '0')} lecturas
          </p>
        </div>

        <span
          aria-hidden="true"
          className="mt-5 block h-px w-full bg-gradient-to-r from-signal-500/70 via-ink-600 to-transparent"
        />

        <ul className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-5">
          {signals.map((signal, index) => (
            <li key={signal}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-2xs text-signal-400">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-ink-600" />
              </div>
              <p className="mt-3 text-sm text-mist-300">{signal}</p>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}
