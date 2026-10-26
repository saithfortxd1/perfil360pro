import { Reveal } from '@/components/animations/Reveal';
import type { CriterionItem } from '@/content/projectStory';

export interface StageCriteriaProps {
  criteria: readonly CriterionItem[];
}

/**
 * Composición de la etapa 2: matriz de criterios con separadores de 1 px
 * generados por el propio grid, en lugar de tarjetas independientes.
 */
export function StageCriteria({ criteria }: StageCriteriaProps) {
  return (
    <Reveal delay={0.12} y={18}>
      <ol
        className="mt-10 grid gap-px overflow-hidden rounded-md border border-ink-700 bg-ink-700 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Criterios de selección"
      >
        {criteria.map((criterion) => (
          <li key={criterion.index} className="bg-ink-850 p-5 transition-colors duration-300 hover:bg-ink-800">
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xs tracking-[0.14em] text-ion-300">{criterion.index}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-ink-600" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-mist-100">{criterion.label}</h3>
            <p className="mt-2 text-sm text-mist-400">{criterion.detail}</p>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}
