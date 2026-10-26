import { motion, type MotionValue } from 'motion/react';

import { cn } from '@/lib/utils';

export interface TimelineItem {
  readonly id: string;
  readonly index: string;
  readonly label: string;
}

interface RailBaseProps {
  items: readonly TimelineItem[];
  activeId: string | null;
}

interface TimelineRailProps extends RailBaseProps {
  /** Progreso de lectura del contenedor narrativo, de 0 a 1. */
  progress: MotionValue<number>;
}

/**
 * Riel vertical de escritorio. La línea de progreso se completa con el
 * desplazamiento real del contenedor de etapas (Motion `useScroll`), sin
 * necesitar ScrollTrigger de GSAP.
 */
export function TimelineRail({ items, activeId, progress }: TimelineRailProps) {
  return (
    <div className="relative hidden lg:block">
      <div className="sticky top-28 flex h-[calc(100dvh-9rem)] flex-col">
        <p className="meta-label">Recorrido</p>

        <div className="relative mt-7 flex-1">
          <span className="timeline-rail left-3" aria-hidden="true" />
          <motion.span
            aria-hidden="true"
            style={{ scaleY: progress }}
            className="timeline-rail left-3 origin-top bg-gradient-to-b from-signal-400 via-signal-300 to-ember-400"
          />

          <ol className="flex h-full flex-col justify-between">
            {items.map((item) => {
              const isActive = item.id === activeId;

              return (
                <li key={item.id} className="relative">
                  <a
                    href={`#${item.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    className="group flex items-center gap-4 rounded-sm py-1"
                  >
                    <span className="relative flex size-6 shrink-0 items-center justify-center">
                      <span
                        className={cn(
                          'rounded-full transition-all duration-300',
                          isActive
                            ? 'size-2.5 bg-signal-400 shadow-[0_0_0_4px_rgb(63_230_198/0.16)]'
                            : 'size-1.5 bg-ink-500 group-hover:bg-mist-500',
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        'meta-label transition-colors duration-300',
                        isActive ? 'text-signal-300' : 'text-mist-500 group-hover:text-mist-300',
                      )}
                    >
                      <span className="mr-2">{item.index}</span>
                      {item.label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * Indicador de etapa activa para móvil y tableta. Es también un índice
 * navegable por teclado, así que no depende del desplazamiento.
 */
export function StageProgress({ items, activeId }: RailBaseProps) {
  const activeIndex = items.findIndex((item) => item.id === activeId);

  return (
    <nav
      aria-label="Progreso de la historia"
      className="sticky top-16 z-30 border-b border-ink-700/80 bg-ink-950/85 backdrop-blur-md lg:hidden"
    >
      <div className="shell flex items-stretch gap-1.5 py-2">
        {items.map((item, index) => {
          const isActive = item.id === activeId;
          const isReached = activeIndex >= 0 && index <= activeIndex;

          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={isActive ? 'true' : undefined}
              className="group flex flex-1 flex-col gap-2 rounded-sm px-1 py-2.5"
            >
              <span
                className={cn(
                  'h-0.5 w-full rounded-full transition-colors duration-300',
                  isReached ? 'bg-signal-400' : 'bg-ink-600 group-hover:bg-ink-500',
                )}
                aria-hidden="true"
              />
              <span
                className={cn(
                  'font-mono text-2xs tracking-[0.16em] transition-colors duration-300',
                  isActive ? 'text-signal-300' : 'text-mist-500 group-hover:text-mist-300',
                )}
              >
                {item.index}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
