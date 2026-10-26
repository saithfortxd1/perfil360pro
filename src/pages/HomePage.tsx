import { ArrowRight, Sparkles, Shield, Cpu, Compass, Layers, MessageSquare, Mic, User, Bot } from 'lucide-react';

import { BorderBeam } from '@/components/animations/BorderBeam';
import { Reveal } from '@/components/animations/Reveal';
import { ShinyText } from '@/components/animations/ShinyText';
import { SplitReveal } from '@/components/animations/SplitReveal';
import { TextEffect } from '@/components/animations/TextEffect';
import { ButtonLink } from '@/components/ui/Button';
import { MetaLabel } from '@/components/ui/MetaLabel';
import { Panel } from '@/components/ui/Panel';
import { paths } from '@/routes/paths';
import { useAuth } from '@/contexts/AuthContext';

export default function HomePage() {
  const { user } = useAuth();
  const panelPath = user ? paths.panel : paths.login;

  return (
    <div className="space-y-20 sm:space-y-28 pb-16">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden border-b border-ink-700/70 pt-12 pb-20 sm:pt-20 sm:pb-28">
        <span className="grid-backdrop" aria-hidden="true" />
        <span
          aria-hidden="true"
          className="glow-field -top-24 left-[15%] size-[28rem] animate-drift bg-signal-500/15"
        />
        <span
          aria-hidden="true"
          className="glow-field top-20 right-[10%] size-[24rem] bg-ion-500/10"
        />

        <div className="shell relative">
          <Reveal y={12}>
            <MetaLabel index="00">Plataforma de inteligencia profesional</MetaLabel>
          </Reveal>

          <div className="mt-6 max-w-4xl">
            <SplitReveal
              as="h1"
              text="Estructura, analiza y eleva tu perfil profesional con lectura 360"
              className="text-display-lg font-bold text-mist-50"
            />

            <div className="mt-6 max-w-2xl">
              <TextEffect as="p" per="word" preset="fade-in-blur" delay={0.2} className="text-lg sm:text-xl text-mist-300">
                Perfil 360 AI transforma relatos dispersos en propuestas de valor claras, midiendo la completitud de tu experiencia y ofreciendo recomendaciones accionables.
              </TextEffect>
            </div>

            <Reveal delay={0.35} y={16} className="mt-8 flex flex-wrap items-center gap-4">
              <ButtonLink to={paths.historia} size="lg">
                <span>Explorar Historia del Proyecto</span>
                <ArrowRight className="size-4" />
              </ButtonLink>

              <ButtonLink to={panelPath} variant="outline" size="lg">
                <span>Ir al Panel</span>
              </ButtonLink>
            </Reveal>
          </div>

          {/* Telemetry Spec Sheet Strip */}
          <Reveal delay={0.45} y={16} className="mt-14">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink-700 bg-ink-700 sm:grid-cols-4">
              <div className="bg-ink-850 p-4">
                <span className="meta-label text-mist-500">Narrativa</span>
                <span className="mt-1 block font-mono text-lg font-semibold text-signal-300">04 Etapas</span>
              </div>
              <div className="bg-ink-850 p-4">
                <span className="meta-label text-mist-500">Arquitectura</span>
                <span className="mt-1 block font-mono text-lg font-semibold text-ion-300">Modular & Clean</span>
              </div>
              <div className="bg-ink-850 p-4">
                <span className="meta-label text-mist-500">Seguridad</span>
                <span className="mt-1 block font-mono text-lg font-semibold text-mist-100">0 Secretos cliente</span>
              </div>
              <div className="bg-ink-850 p-4">
                <span className="meta-label text-mist-500">Base de Datos</span>
                <span className="mt-1 block font-mono text-lg font-semibold text-ember-400">Firestore (Ready)</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PRODUCT DEMO */}
      <section className="shell">
        <Reveal y={12}>
          <MetaLabel index="01">Demostracion</MetaLabel>
          <h2 className="mt-3 text-display-sm font-semibold">Asi funciona tu entrevista personalizada</h2>
        </Reveal>

        <Reveal delay={0.1} y={16} className="mt-10">
          <div className="relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
            <BorderBeam size={80} duration={10} colorFrom="#3fe6c6" colorTo="#82a6ff" />
            <div className="relative z-10 grid gap-0 lg:grid-cols-2">
              <div className="border-b border-ink-700/50 p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex size-12 items-center justify-center rounded-full border border-ion-500/30 bg-ion-500/10">
                    <Bot className="size-6 text-ion-300" />
                  </div>
                  <div>
                    <p className="font-mono text-xs text-signal-400">ENTREVISTADOR VIRTUAL</p>
                    <p className="font-semibold text-mist-100">Estado: Escuchando</p>
                  </div>
                  <span className="ml-auto flex size-3 rounded-full bg-emerald-500 animate-pulse" />
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-ink-600 bg-ink-800/50 p-4">
                    <p className="text-xs font-mono text-mist-500 mb-2">Pregunta actual</p>
                    <p className="text-sm text-mist-200 leading-relaxed">
                      Cuentame sobre un proyecto donde tuviste que tomar una decision tecnica dificil.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-mist-500">
                    <Mic className="size-3.5" />
                    <span>Tu respuesta se esta transcribiendo...</span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-ink-700/50">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-mist-500">Progreso de entrevista</span>
                    <span className="font-mono text-signal-300">3/8 preguntas</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-ink-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-signal-500 to-ion-400 rounded-full" style={{ width: '37.5%' }} />
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8">
                <div className="space-y-4">
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl bg-ink-800/80 border border-ink-600 px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot className="size-4 text-ion-300" />
                        <span className="font-mono text-2xs text-mist-400">Entrevistador</span>
                      </div>
                      <p className="text-sm text-mist-200 leading-relaxed">
                        Excelente. Ahora, como manejarías una situacion donde un miembro del equipo no esta de acuerdo?
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl bg-signal-500/15 border border-signal-500/30 px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="size-4 text-signal-300" />
                        <span className="font-mono text-2xs text-mist-400">Tu</span>
                      </div>
                      <p className="text-sm text-mist-100 leading-relaxed">
                        Primero escucharía su perspectiva. Luego presentaría los trade-offs con datos...
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl bg-ink-800/80 border border-ink-600 px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot className="size-4 text-ion-300" />
                        <span className="font-mono text-2xs text-mist-400">Entrevistador</span>
                      </div>
                      <p className="text-sm text-mist-200 leading-relaxed">
                        Buena respuesta. Que metricas especificas considerarías?
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-2 rounded-md border border-ink-600 bg-ink-800/50 px-3 py-2">
                  <MessageSquare className="size-4 text-mist-500" />
                  <span className="text-xs text-mist-500">Escribe tu respuesta...</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* HOW IT WORKS */}
      <section className="shell">
        <Reveal y={12}>
          <MetaLabel index="02">Metodologia</MetaLabel>
          <h2 className="mt-3 text-display-sm font-semibold">Como funciona Perfil 360 AI</h2>
        </Reveal>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          <Reveal delay={0.1} y={16}>
            <Panel className="h-full p-6">
              <span className="flex size-10 items-center justify-center rounded-md border border-signal-500/30 bg-signal-500/10 text-signal-300">
                <Compass className="size-5" />
              </span>
              <span className="mt-4 block font-mono text-2xs text-signal-400">PASO 01</span>
              <h3 className="mt-1 text-base font-semibold text-mist-100">Registra tu informacion</h3>
              <p className="mt-2 text-sm text-mist-400">
                Ingresa tu titular, biografia, habilidades clave y objetivo profesional en un formulario estructurado.
              </p>
            </Panel>
          </Reveal>

          <Reveal delay={0.2} y={16}>
            <Panel className="h-full p-6">
              <span className="flex size-10 items-center justify-center rounded-md border border-ion-500/30 bg-ion-500/10 text-ion-300">
                <Cpu className="size-5" />
              </span>
              <span className="mt-4 block font-mono text-2xs text-ion-300">PASO 02</span>
              <h3 className="mt-1 text-base font-semibold text-mist-100">Calcula tu Puntuacion 360</h3>
              <p className="mt-2 text-sm text-mist-400">
                El sistema evalua la completitud y el peso de tu experiencia mediante un algoritmo determinista y transparente.
              </p>
            </Panel>
          </Reveal>

          <Reveal delay={0.3} y={16}>
            <Panel className="h-full p-6">
              <span className="flex size-10 items-center justify-center rounded-md border border-ember-500/30 bg-ember-500/10 text-ember-400">
                <Sparkles className="size-5" />
              </span>
              <span className="mt-4 block font-mono text-2xs text-ember-400">PASO 03</span>
              <h3 className="mt-1 text-base font-semibold text-mist-100">Recibe recomendaciones</h3>
              <p className="mt-2 text-sm text-mist-400">
                Identifica que campos faltan por enriquecer y como alinear tu perfil con las expectativas del mercado.
              </p>
            </Panel>
          </Reveal>
        </div>
      </section>

      {/* FEATURE HIGHLIGHTS */}
      <section className="shell">
        <Reveal y={12}>
          <MetaLabel index="03">Pilares de diseno</MetaLabel>
          <h2 className="mt-3 text-display-sm font-semibold">Calidad tecnica e identidad propia</h2>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Reveal delay={0.1} y={16}>
            <Panel ticks className="p-6 sm:p-8">
              <Shield className="size-6 text-signal-400" />
              <h3 className="mt-4 text-lg font-semibold text-mist-100">Manejo estricto de errores y tipos</h3>
              <p className="mt-2 text-sm text-mist-400">
                Toda operacion devuelve un objeto Result clasificado. Ningun componente lanza excepciones no controladas a la interfaz.
              </p>
            </Panel>
          </Reveal>

          <Reveal delay={0.2} y={16}>
            <Panel ticks className="p-6 sm:p-8">
              <Layers className="size-6 text-ion-400" />
              <h3 className="mt-4 text-lg font-semibold text-mist-100">Independencia de Firebase</h3>
              <p className="mt-2 text-sm text-mist-400">
                Las vistas publicas como la Historia del Proyecto no dependen de Firebase para renderizarse, garantizando velocidad e independencia.
              </p>
            </Panel>
          </Reveal>
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="shell">
        <Reveal y={20}>
          <div className="relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900 p-8 sm:p-12 text-center">
            <BorderBeam size={80} duration={8} colorFrom="#3fe6c6" colorTo="#82a6ff" />
            <span className="grid-backdrop" aria-hidden="true" />

            <div className="relative mx-auto max-w-xl">
              <span className="meta-label">Acceso publico</span>
              <h2 className="mt-3 text-display-sm font-semibold">
                <ShinyText>Descubre la historia del proyecto</ShinyText>
              </h2>
              <p className="mt-3 text-sm text-mist-300">
                Conoce las cuatro etapas de desarrollo, las decisiones de inteligencia artificial y la arquitectura de la solucion.
              </p>

              <div className="mt-6 flex justify-center gap-4">
                <ButtonLink to={paths.historia} size="lg">
                  <span>Ver Historia del Proyecto</span>
                  <ArrowRight className="size-4" />
                </ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}