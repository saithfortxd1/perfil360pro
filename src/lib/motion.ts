import type { BezierDefinition, Transition, Variants } from 'motion/react';

/**
 * Curvas y duraciones compartidas. Un único motor de animación (Motion) para
 * todo el producto: no se importa GSAP ni una segunda librería de movimiento.
 */
export const EASE_OUT_EXPO: BezierDefinition = [0.16, 1, 0.3, 1];
export const EASE_STANDARD: BezierDefinition = [0.32, 0.72, 0, 1];

export const DURATION = {
  instant: 0.16,
  fast: 0.26,
  base: 0.52,
  slow: 0.82,
} as const;

export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 220, damping: 26, mass: 0.9 };

/** Opciones de `viewport` para revelar contenido una sola vez al entrar en pantalla. */
export const viewportOnce = { once: true, amount: 0.25 };

/** Aparición con desplazamiento corto: la pauta base de lectura del producto. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE_OUT_EXPO },
  },
};

export const fadeRiseSmall: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.fast, ease: EASE_STANDARD },
  },
};

/** Entrada con foco óptico: se usa sólo en titulares. */
export const blurIn: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(10px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: DURATION.slow, ease: EASE_OUT_EXPO },
  },
};

/** Despliegue lateral desde el riel de la línea de tiempo. */
export const railReveal: Variants = {
  hidden: { opacity: 0, x: 26 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.base, ease: EASE_OUT_EXPO },
  },
};

export function staggerContainer(staggerChildren = 0.08, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren, delayChildren } },
  };
}
