import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { Reveal } from '@/components/animations/Reveal';
import { TextEffect } from '@/components/animations/TextEffect';
import { MetaLabel } from '@/components/ui/MetaLabel';
import { cn } from '@/lib/utils';
import type { StoryStage } from '@/content/projectStory';

export type StageAccent = StoryStage['accent'];

const ACCENT_BOX: Readonly<Record<StageAccent, string>> = {
  signal: 'border-signal-500/45 bg-signal-500/10 text-signal-300',
  ion: 'border-ion-500/45 bg-ion-500/10 text-ion-300',
  ember: 'border-ember-500/45 bg-ember-500/10 text-ember-400',
};

const ACCENT_WATERMARK: Readonly<Record<StageAccent, string>> = {
  signal: 'text-signal-400/[0.07]',
  ion: 'text-ion-400/[0.07]',
  ember: 'text-ember-400/[0.07]',
};

interface StageBlockProps {
  stage: StoryStage;
  isActive: boolean;
  children?: ReactNode;
}

/**
 * Marco común de cada etapa: número de agua en el fondo, icono asociado,
 * kicker monoespaciado, jerarquía tipográfica y nota de veracidad.
 * La composición interna cambia por etapa mediante `children`.
 */
export function StageBlock({ stage, isActive, children }: StageBlockProps) {
  const Icon = stage.icon;

  return (
    <section
      id={stage.id}
      data-stage-id={stage.id}
      data-active={isActive ? 'true' : 'false'}
      aria-labelledby={`${stage.id}-titulo`}
      className={cn(
        'stage-frame border-t border-ink-700/60 pt-10 transition-colors duration-500 sm:pt-14',
        isActive && 'border-ink-600',
      )}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -top-14 right-0 font-display text-[6.5rem] leading-none font-bold select-none sm:-top-20 sm:text-[10rem]',
            ACCENT_WATERMARK[stage.accent],
          )}
        >
          {stage.index}
        </span>

        <Reveal y={10} duration={0.4}>
          <MetaLabel index={stage.index}>{stage.kicker}</MetaLabel>
        </Reveal>

        <Reveal delay={0.06} y={18}>
          <div className="mt-6 flex items-start gap-4">
            <span
              className={cn(
                'mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md border transition-shadow duration-500',
                ACCENT_BOX[stage.accent],
                isActive && 'shadow-[0_0_28px_-10px_currentColor]',
              )}
              aria-hidden="true"
            >
              <Icon className="size-5" />
            </span>
            <h2
              id={`${stage.id}-titulo`}
              className={cn(
                'text-display-sm font-semibold transition-colors duration-500',
                isActive ? 'text-mist-50' : 'text-mist-200',
              )}
            >
              {stage.title}
            </h2>
          </div>
        </Reveal>

        <TextEffect
          as="p"
          per="word"
          preset="slide"
          delay={0.1}
          className="mt-6 max-w-2xl text-lg text-mist-200"
        >
          {stage.lead}
        </TextEffect>

        <div className="mt-6 max-w-2xl space-y-4 text-[0.95rem] text-mist-400">
          {stage.paragraphs.map((paragraph, index) => (
            <Reveal key={paragraph} delay={0.12 + index * 0.06} y={14}>
              <p>{paragraph}</p>
            </Reveal>
          ))}
        </div>

        {children}

        {stage.note ? (
          <Reveal delay={0.08} y={14}>
            <aside
              className="mt-8 flex max-w-2xl gap-3 rounded-md border border-ember-500/30 bg-ember-500/[0.06] p-4"
              aria-label="Información pendiente de completar"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-ember-400" aria-hidden="true" />
              <p className="text-sm text-mist-300">
                <span className="font-medium text-ember-400">Información pendiente. </span>
                {stage.note}
              </p>
            </aside>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
