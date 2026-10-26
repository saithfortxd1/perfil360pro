import { useMemo } from 'react';
import { useReducedMotion, useScroll, useSpring } from 'motion/react';
import { ArrowRight } from 'lucide-react';

import { BorderBeam } from '@/components/animations/BorderBeam';
import { Reveal } from '@/components/animations/Reveal';
import { ShinyText } from '@/components/animations/ShinyText';
import { StageProgress, TimelineRail, type TimelineItem } from '@/components/animations/TimelineRail';
import { PageIntro } from '@/components/layout/PageIntro';
import { ButtonLink } from '@/components/ui/Button';
import { projectStory, storyClosing } from '@/content/projectStory';
import { useActiveStage } from '@/hooks/useActiveStage';
import { paths } from '@/routes/paths';

import { StageArchitecture } from './historia/StageArchitecture';
import { StageBlock } from './historia/StageBlock';
import { StageCriteria } from './historia/StageCriteria';
import { StageSignals } from './historia/StageSignals';
import { StageStatus } from './historia/StageStatus';

const STAGE_IDS = projectStory.map((stage) => stage.id) as readonly string[];

/**
 * Página pública de la historia del proyecto.
 *
 * No consulta Firebase, no depende de una sesión y no muestra pantallas de
 * carga: todo el contenido es local y se renderiza en el primer pintado.
 */
export default function HistoriaProyecto() {
  const prefersReducedMotion = useReducedMotion();
  const { activeId, containerRef } = useActiveStage(STAGE_IDS);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.4 });
  const railProgress = prefersReducedMotion ? scrollYProgress : smoothProgress;

  const railItems = useMemo<TimelineItem[]>(
    () =>
      projectStory.map((stage) => ({
        id: stage.id,
        index: stage.index,
        label: stage.kicker.split('·')[1]?.trim() ?? stage.title,
      })),
    [],
  );

  return (
    <div>
      <div className="relative overflow-hidden border-b border-ink-700/70">
        <span className="grid-backdrop" aria-hidden="true" />
        <span
          aria-hidden="true"
          className="glow-field -top-32 left-[10%] size-[26rem] animate-drift bg-signal-500/12"
        />
        <span
          aria-hidden="true"
          className="glow-field top-10 right-[6%] size-[22rem] bg-ion-500/10"
        />

        <div className="shell relative py-16 sm:py-24">
          <PageIntro
            index="00"
            kicker="Historia del proyecto"
            title="Cómo nació y cómo está construido Perfil 360 AI"
            lead="Cuatro etapas explican el recorrido completo: el problema que lo originó, cómo se eligieron las herramientas de inteligencia artificial, cómo está organizado el sistema y en qué punto se encuentra hoy."
          >
            <Reveal delay={0.3} y={12}>
              <dl className="grid gap-6 border-t border-ink-700/70 pt-6 sm:grid-cols-3">
                <div>
                  <dt className="meta-label">Etapas</dt>
                  <dd className="mt-2 font-display text-2xl text-mist-100">04</dd>
                </div>
                <div>
                  <dt className="meta-label">Conexión con datos</dt>
                  <dd className="mt-2 font-display text-2xl text-mist-100">Preparada</dd>
                </div>
                <div>
                  <dt className="meta-label">Lectura</dt>
                  <dd className="mt-2 font-display text-2xl text-mist-100">Sin sesión</dd>
                </div>
              </dl>
            </Reveal>
          </PageIntro>
        </div>
      </div>

      <StageProgress items={railItems} activeId={activeId} />

      <div className="shell py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
          <TimelineRail items={railItems} activeId={activeId} progress={railProgress} />

          <div ref={containerRef} className="relative space-y-16 sm:space-y-24">
            {projectStory.map((stage) => (
              <StageBlock key={stage.id} stage={stage} isActive={stage.id === activeId}>
                {stage.layout === 'signals' && stage.signals ? (
                  <StageSignals signals={stage.signals} />
                ) : null}
                {stage.layout === 'criteria' && stage.criteria ? (
                  <StageCriteria criteria={stage.criteria} />
                ) : null}
                {stage.layout === 'architecture' && stage.layers ? (
                  <StageArchitecture layers={stage.layers} />
                ) : null}
                {stage.layout === 'status' && stage.statusItems ? (
                  <StageStatus items={stage.statusItems} />
                ) : null}
              </StageBlock>
            ))}

            <Reveal y={22}>
              <section
                className="relative overflow-hidden rounded-lg border border-ink-700 bg-ink-900 p-8 sm:p-12"
                aria-labelledby="cierre-historia"
              >
                <BorderBeam size={70} duration={9} colorFrom="#3fe6c6" colorTo="#ffb673" />
                <span className="grid-backdrop" aria-hidden="true" />

                <div className="relative max-w-2xl">
                  <p className="meta-label">Cierre</p>
                  <h2 id="cierre-historia" className="mt-4 text-display-sm font-semibold">
                    <ShinyText>{storyClosing.title}</ShinyText>
                  </h2>
                  <p className="mt-4 text-mist-300">{storyClosing.body}</p>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <ButtonLink to={paths.panel} size="lg">
                      Ver mi panel
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </ButtonLink>
                    <ButtonLink to={paths.home} variant="outline" size="lg">
                      Volver al inicio
                    </ButtonLink>
                  </div>
                </div>
              </section>
            </Reveal>
          </div>
        </div>
      </div>
    </div>
  );
}
