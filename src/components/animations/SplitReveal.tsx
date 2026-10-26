import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Fragment, useMemo } from 'react';

import { EASE_OUT_EXPO } from '@/lib/motion';

export type SplitRevealEffect = 'rise' | 'blur' | 'skew';

export interface SplitRevealProps {
  text: string;
  className?: string;
  /** Elemento semántico del titular. */
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  delay?: number;
  duration?: number;
  stagger?: number;
  effect?: SplitRevealEffect;
  /** Máscara por palabra: el texto emerge desde detrás de una línea de corte. */
  mask?: boolean;
}

const WORD_MASK_CLASS = 'inline-block overflow-hidden pb-[0.16em] -mb-[0.16em] align-bottom';

function itemVariantsFor(effect: SplitRevealEffect, duration: number, mask: boolean): Variants {
  const hidden =
    effect === 'blur'
      ? { opacity: 0, filter: 'blur(12px)', y: mask ? 12 : 6 }
      : effect === 'skew'
        ? { opacity: 0, y: 18, skewY: 3 }
        : { opacity: 0, y: mask ? '110%' : 18 };

  return {
    hidden,
    visible: {
      opacity: 1,
      y: 0,
      skewY: 0,
      filter: 'blur(0px)',
      transition: { duration, ease: EASE_OUT_EXPO },
    },
  };
}

/**
 * Patrón de revelado por palabra inspirado en `SplitText` de React Bits
 * (DavidHDev/react-bits).
 *
 * Decisión técnica: el original se apoya en GSAP + el plugin SplitText. Como el
 * proyecto usa Motion como único motor de animación, aquí se reimplementa el
 * mismo comportamiento (máscara + escalonado + respeto por `prefers-reduced-motion`)
 * sin añadir una segunda librería de movimiento.
 */
export function SplitReveal({
  text,
  className,
  as = 'h1',
  delay = 0,
  duration = 0.75,
  stagger = 0.075,
  effect = 'rise',
  mask = true,
}: SplitRevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);

  const containerVariants = useMemo<Variants>(
    () => ({
      hidden: {},
      visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
    }),
    [stagger, delay],
  );

  const itemVariants = useMemo(() => itemVariantsFor(effect, duration, mask), [effect, duration, mask]);

  if (prefersReducedMotion) {
    const PlainTag = as;
    return <PlainTag className={className}>{text}</PlainTag>;
  }

  const MotionTag = motion[as] as typeof motion.h1;

  return (
    <MotionTag
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      aria-label={text}
    >
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          {index > 0 ? ' ' : null}
          <span aria-hidden="true" className={mask ? WORD_MASK_CLASS : 'inline-block'}>
            <motion.span variants={itemVariants} className="inline-block whitespace-pre">
              {word}
            </motion.span>
          </span>
        </Fragment>
      ))}
    </MotionTag>
  );
}
