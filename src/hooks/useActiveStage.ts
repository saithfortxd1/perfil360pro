import { useEffect, useRef, useState } from 'react';

/**
 * Determina qué etapa de la línea de tiempo está activa.
 *
 * Se usa una banda de detección de 0 px alrededor del centro del viewport
 * (`-50% 0px -50% 0px`): en cada instante exactamente una etapa cruza esa línea,
 * lo que evita cálculos de distancia por evento y mantiene el coste en O(1).
 */
export function useActiveStage<S extends string>(stageIds: readonly S[]): {
  activeId: S | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<S | null>(null);
  const stageKey = stageIds.join('|');

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-stage-id]'));
    if (nodes.length === 0) return undefined;

    const resolveId = (node: HTMLElement): S => node.dataset.stageId as S;
    setActiveId(resolveId(nodes[0]));

    if (typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(resolveId(entry.target as HTMLElement));
        }
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );

    for (const node of nodes) observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [stageKey]);

  return { activeId, containerRef };
}
