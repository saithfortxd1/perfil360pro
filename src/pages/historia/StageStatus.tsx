import { CircleDashed, CircleCheck, Clock3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Reveal } from '@/components/animations/Reveal';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { StageStatus, StatusItem } from '@/content/projectStory';

interface StatusGroup {
  readonly status: StageStatus;
  readonly title: string;
  readonly tone: BadgeTone;
  readonly icon: LucideIcon;
  readonly iconClass: string;
}

const GROUPS: readonly StatusGroup[] = [
  {
    status: 'completado',
    title: 'Completado',
    tone: 'done',
    icon: CircleCheck,
    iconClass: 'text-signal-400',
  },
  {
    status: 'preparado',
    title: 'Preparado',
    tone: 'ready',
    icon: CircleDashed,
    iconClass: 'text-ion-400',
  },
  {
    status: 'pendiente',
    title: 'Pendiente',
    tone: 'pending',
    icon: Clock3,
    iconClass: 'text-ember-400',
  },
];

export interface StageStatusProps {
  items: readonly StatusItem[];
}

/** Composición de la etapa 4: tres columnas de estado, nunca una lista plana. */
export function StageStatus({ items }: StageStatusProps) {
  return (
    <div className="mt-10 grid gap-5 md:grid-cols-3">
      {GROUPS.map((group, groupIndex) => {
        const groupItems = items.filter((item) => item.status === group.status);
        const Icon = group.icon;

        return (
          <Reveal key={group.status} delay={0.1 + groupIndex * 0.08} y={18}>
            <section
              className="panel h-full p-5"
              aria-labelledby={`estado-${group.status}`}
            >
              <header className="flex items-center justify-between gap-3">
                <h3 id={`estado-${group.status}`} className="meta-label">
                  {group.title}
                </h3>
                <Badge tone={group.tone}>{String(groupItems.length).padStart(2, '0')}</Badge>
              </header>

              <span aria-hidden="true" className="mt-4 block h-px w-full bg-ink-600" />

              <ul className="mt-4 space-y-3">
                {groupItems.map((item) => (
                  <li key={item.label} className="flex gap-2.5">
                    <Icon className={cn('mt-0.5 size-4 shrink-0', group.iconClass)} aria-hidden="true" />
                    <span className="text-sm text-mist-300">{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>
        );
      })}
    </div>
  );
}
