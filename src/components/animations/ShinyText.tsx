import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Adaptado de `AnimatedShinyText` de Magic UI (magicuidesign/magicui, licencia MIT).
 * El efecto original depende de utilidades de Tailwind para el gradiente y la
 * posición de fondo. Aquí se lleva a la clase `.shiny-text` de `styles/index.css`
 * para que el acento luminoso pueda reutilizarse y para que el modo de movimiento
 * reducido lo desactive por completo.
 */
export interface ShinyTextProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  /** Color del destello. Por defecto usa el acento `signal` del sistema visual. */
  highlightColor?: string;
  /** Duración del barrido en segundos. */
  speed?: number;
}

export function ShinyText({ children, className, highlightColor, speed = 3.4, style, ...rest }: ShinyTextProps) {
  const mergedStyle: CSSProperties = {
    animationDuration: `${speed}s`,
    ...(highlightColor ? { '--shiny-highlight': highlightColor } : {}),
    ...style,
  } as CSSProperties;

  return (
    <span className={cn('shiny-text', className)} style={mergedStyle} {...rest}>
      {children}
    </span>
  );
}
