import { ChevronDown } from 'lucide-react';

import { Reveal } from '@/components/animations/Reveal';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { ArchitectureLayer, StageStatus } from '@/content/projectStory';

const STATE_TONE: Readonly<Record<StageStatus, BadgeTone>> = {
  completado: 'done',
  preparado: 'ready',
  pendiente: 'pending',
};

const STATE_LABEL: Readonly<Record<StageStatus, string>> = {
  completado: 'Completado',
  preparado: 'Preparado',
  pendiente: 'Pendiente',
};

/** Etiquetas del flujo de datos entre capas, de arriba hacia abajo. */
const FLOW_LABELS = ['renderiza y solicita', 'valida y clasifica', 'persiste'] as const;

export interface StageArchitectureProps {
  layers: readonly ArchitectureLayer[];
}

/** Composición de la etapa 3: diagrama de capas con conectores de flujo. */
export function StageArchitecture({ layers }: StageArchitectureProps) {
  return (
    <Reveal delay={0.12} y={18}>
      <div className="blueprint-node mt-10 p-4 sm:p-6" role="group" aria-label="Diagrama de capas del sistema">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="meta-label">Sistema Perfil 360 AI</p>
          <p className="meta-label text-mist-600">{String(layers.length).padStart(2, '0')} capas</p>
        </div>

        <ol className="mt-6">
          {layers.map((layer, index) => (
            <li key={layer.index}>
              <div className="rounded-sm border border-ink-600 bg-ink-850/80 p-4 transition-colors duration-300 hover:border-ink-500 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-2xs text-ion-300">{layer.index}</span>
                    <div>
                      <h3 className="text-base font-semibold text-mist-100">{layer.name}</h3>
                      <p className="meta-label mt-1.5 text-mist-600">Analogía · {layer.analogy}</p>
                    </div>
                  </div>
                  <Badge tone={STATE_TONE[layer.state]}>{STATE_LABEL[layer.state]}</Badge>
                </div>
                <p className="mt-3 text-sm text-mist-400">{layer.detail}</p>
              </div>

              {index < layers.length - 1 ? (
                <div className="flex items-center gap-3 py-3 pl-3">
                  <ChevronDown className="size-4 text-ink-500" aria-hidden="true" />
                  <span className="meta-label text-mist-600">{FLOW_LABELS[index] ?? 'flujo de datos'}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </Reveal>
  );
}
