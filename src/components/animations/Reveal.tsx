import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

import { DURATION, EASE_OUT_EXPO, viewportOnce } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Retraso en segundos. Se usa para escalonar bloques hermanos. */
  delay?: number;
  /** Desplazamiento vertical inicial en píxeles. */
  y?: number;
  duration?: number;
  amount?: number;
}

/**
 * Pauta base de aparición al entrar en pantalla. Se apoya sólo en `opacity` y
 * `transform`, las propiedades más baratas de animar. Con movimiento reducido
 * el contenido se renderiza directamente, sin estado inicial invisible.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 20,
  duration = DURATION.base,
  amount = 0.25,
}: RevealProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const variants: Variants = {
    hidden: { opacity: 0, y },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration, ease: EASE_OUT_EXPO, delay },
    },
  };

  return (
    <motion.div
      className={cn(className)}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: viewportOnce.once, amount }}
    >
      {children}
    </motion.div>
  );
}
