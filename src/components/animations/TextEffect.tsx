import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Fragment, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { DURATION, EASE_OUT_EXPO } from '@/lib/motion';

/**
 * Adaptado de `TextEffect` de Motion Primitives (ibelick/motion-primitives).
 * Cambios respecto al original: el texto completo se expone siempre mediante
 * `<span className="sr-only">` mientras los segmentos animados quedan
 * `aria-hidden`, y con `prefers-reduced-motion` se renderiza texto plano.
 */
export type TextEffectPreset = 'fade' | 'blur' | 'fade-in-blur' | 'slide';

export interface TextEffectProps {
  /** Texto a animar. Se divide en segmentos según `per`. */
  children: string;
  per?: 'word' | 'char';
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  preset?: TextEffectPreset;
  className?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
}

const ITEM_VARIANTS: Readonly<Record<TextEffectPreset, Variants>> = {
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  blur: {
    hidden: { opacity: 0, filter: 'blur(10px)' },
    visible: { opacity: 1, filter: 'blur(0px)' },
  },
  'fade-in-blur': {
    hidden: { opacity: 0, y: 14, filter: 'blur(10px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
  },
  slide: {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0 },
  },
};

export function TextEffect({
  children,
  per = 'word',
  as = 'p',
  preset = 'fade-in-blur',
  className,
  delay = 0,
  stagger = 0.045,
  duration = DURATION.base,
}: TextEffectProps) {
  const prefersReducedMotion = useReducedMotion();

  const containerVariants = useMemo<Variants>(
    () => ({
      hidden: {},
      visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
    }),
    [stagger, delay],
  );

  const itemVariants = useMemo<Variants>(
    () => ({
      hidden: ITEM_VARIANTS[preset].hidden,
      visible: {
        ...(ITEM_VARIANTS[preset].visible as Record<string, unknown>),
        transition: { duration, ease: EASE_OUT_EXPO },
      },
    }),
    [preset, duration],
  );

  const words = useMemo(() => children.split(/\s+/).filter(Boolean), [children]);

  if (prefersReducedMotion) {
    const PlainTag = as;
    return <PlainTag className={className}>{children}</PlainTag>;
  }

  const MotionTag = motion[as] as typeof motion.div;

  return (
    <MotionTag
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.4 }}
    >
      <span className="sr-only">{children}</span>
      <span aria-hidden="true">
        {words.map((word, wordIndex) => (
          <Fragment key={`segment-${wordIndex}-${word}`}>
            {wordIndex > 0 ? ' ' : null}
            <motion.span
              variants={itemVariants}
              className={cn('inline-block whitespace-pre', per === 'char' && 'whitespace-nowrap')}
            >
              {per === 'word'
                ? word
                : word.split('').map((letter, letterIndex) => (
                    <motion.span
                      key={`letter-${letterIndex}`}
                      variants={itemVariants}
                      className="inline-block whitespace-pre"
                    >
                      {letter}
                    </motion.span>
                  ))}
            </motion.span>
          </Fragment>
        ))}
      </span>
    </MotionTag>
  );
}
