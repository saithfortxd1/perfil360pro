import { motion, useReducedMotion, type MotionStyle, type Transition } from 'motion/react';
import type { CSSProperties } from 'react';

/**
 * Adaptado de `BorderBeam` de Magic UI (magicuidesign/magicui, licencia MIT).
 * Cambios respecto al original: la máscara que recorta el haz al borde se declara
 * con estilos en línea (incluido el prefijo -webkit-) en lugar de utilidades
 * `mask-*` de Tailwind; y con `prefers-reduced-motion` el haz queda estático en
 * el borde superior, sin animación infinita.
 */
export interface BorderBeamProps {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
  reverse?: boolean;
  initialOffset?: number;
  transition?: Transition;
  className?: string;
  style?: CSSProperties;
}

const BORDER_MASK: CSSProperties = {
  maskImage: 'linear-gradient(transparent, transparent), linear-gradient(#000, #000)',
  WebkitMaskImage: 'linear-gradient(transparent, transparent), linear-gradient(#000, #000)',
  maskClip: 'padding-box, border-box',
  WebkitMaskClip: 'padding-box, border-box',
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
} as CSSProperties;

export function BorderBeam({
  size = 58,
  duration = 7,
  delay = 0,
  colorFrom = '#3fe6c6',
  colorTo = '#4f7ce8',
  borderWidth = 1,
  reverse = false,
  initialOffset = 0,
  transition,
  className,
  style,
}: BorderBeamProps) {
  const prefersReducedMotion = useReducedMotion();

  const beamStyle: MotionStyle = {
    width: size,
    offsetPath: `rect(0 auto auto 0 round ${size}px)`,
    backgroundColor: colorFrom,
    backgroundImage: `linear-gradient(90deg, ${colorFrom}, ${colorTo} 55%, transparent)`,
    ...style,
  };

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        pointerEvents: 'none',
        border: `${borderWidth}px solid transparent`,
        ...BORDER_MASK,
      }}
    >
      <motion.span
        className="absolute block aspect-square"
        style={beamStyle}
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={
          prefersReducedMotion
            ? { offsetDistance: '12%', opacity: 0.7 }
            : {
                offsetDistance: reverse
                  ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
                  : [`${initialOffset}%`, `${100 + initialOffset}%`],
              }
        }
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { repeat: Infinity, ease: 'linear', duration, delay: -delay, ...transition }
        }
      />
    </div>
  );
}
