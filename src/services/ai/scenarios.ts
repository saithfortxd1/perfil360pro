import type {
  ScenarioConfig,
  ScenarioId,
  ScenarioState,
} from '@/types/ai';

/**
 * Configuración de escenarios de simulación predefinidos
 * Cada escenario define un contexto profesional inmersivo
 */

function createInitialState(
  id: ScenarioId,
  title: string,
  description: string,
  currentSituation: string,
  objectives: string[],
  constraints: string[],
  progress: number
): ScenarioState {
  return {
    id,
    title,
    description,
    currentSituation,
    objectives,
    constraints,
    progress,
    resources: {
      tiempo: 100,
      presupuesto: 100,
      energia: 100,
      redContactos: 100,
    },
  };
}

export const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  entrevista_tecnica: {
    id: 'entrevista_tecnica',
    title: 'Entrevista Técnica Senior',
    description:
      'Te enfrentas a una entrevista técnica para un puesto de Staff Engineer en una empresa tecnológica de alto crecimiento. Debes demostrar profundidad técnica, pensamiento sistémico y capacidad de liderazgo sin autoridad formal.',
    role: 'profesional',
    initialState: createInitialState(
      'entrevista_tecnica',
      'Entrevista Técnica Senior',
      'Te enfrentas a una entrevista técnica para un puesto de Staff Engineer en una empresa tecnológica de alto crecimiento. Debes demostrar profundidad técnica, pensamiento sistémico y capacidad de liderazgo sin autoridad formal.',
      'Estás en la sala de reuniones virtual. El panel incluye al CTO, un Staff Engineer y el Engineering Manager. Han revisado tu portfolio y código. La primera pregunta técnica acaba de terminar.',
      [
        'Demostrar expertise técnico sin arrogancia',
        'Mostrar pensamiento sistémico y trade-offs',
        'Evidenciar liderazgo sin autoridad',
        'Conectar experiencia con sus desafíos actuales',
      ],
      [
        'Tiempo limitado: 45 min restantes',
        'Panel técnico de alto nivel',
        'Una respuesta incorrecta puede costar la oferta',
      ],
      10
    ),
    systemPrompt: '',
    chaosEvents: [],
  },

  negociacion_salarial: {
    id: 'negociacion_salarial',
    title: 'Negociación Salarial y de Rol',
    description:
      'Has recibido una oferta de una empresa que te interesa, pero el paquete está por debajo de tus expectativas. Debes negociar salario, equity, título y beneficios sin quemar puentes.',
    role: 'profesional',
    initialState: createInitialState(
      'negociacion_salarial',
      'Negociación Salarial y de Rol',
      'Has recibido una oferta de una empresa que te interesa, pero el paquete está por debajo de tus expectativas. Debes negociar salario, equity, título y beneficios sin quemar puentes.',
      'Acabas de recibir la oferta formal por email. El salario base es 15% menor a tu objetivo, el equity es estándar, y el título es "Senior Engineer" cuando buscabas "Staff". El recruiter espera tu respuesta en 48h.',
      [
        'Obtener salario base dentro de rango objetivo',
        'Negociar equity significativo',
        'Conseguir título que refleje tu experiencia',
        'Mantener relación positiva con la empresa',
      ],
      [
        'Plazo de 48 horas',
        'No tienes ofertas competidoras formales',
        'La empresa tiene bandas salariales rígidas',
      ],
      5
    ),
    systemPrompt: '',
    chaosEvents: [],
  },

  gestion_crisis: {
    id: 'gestion_crisis',
    title: 'Gestión de Crisis Técnica',
    description:
      'Eres el Tech Lead de un producto crítico. En producción surge un incidente severo que afecta al 40% de usuarios. Debes coordinar la respuesta, comunicar a stakeholders y tomar decisiones bajo presión extrema.',
    role: 'lider',
    initialState: createInitialState(
      'gestion_crisis',
      'Gestión de Crisis Técnica',
      'Eres el Tech Lead de un producto crítico. En producción surge un incidente severo que afecta al 40% de usuarios. Debes coordinar la respuesta, comunicar a stakeholders y tomar decisiones bajo presión extrema.',
      'Son las 03:00 AM. El sistema de pagos está caído. 40% de transacciones fallan. El CEO y CTO están en el canal de guerra. Tu equipo de 5 ingenieros espera tus órdenes. El cliente principal (cuenta $2M/año) está afectado.',
      [
        'Restaurar servicio en < 2 horas',
        'Mantener informado al CEO y cliente principal',
        'Proteger a tu equipo del burnout',
        'Identificar causa raíz y prevenir recurrencia',
      ],
      [
        'Presión extrema de tiempo',
        'Visibilidad ejecutiva máxima',
        'Equipo fatiguado (llevan 3h despiertos)',
        'Cliente principal amenazando con irse',
      ],
      0
    ),
    systemPrompt: '',
    chaosEvents: [],
  },

  lanzamiento_producto: {
    id: 'lanzamiento_producto',
    title: 'Lanzamiento de Producto Crítico',
    description:
      'Lideras el lanzamiento de la v2.0 de tu producto estrella. La fecha es inamovible (conferencia anual en 3 semanas). Hay deuda técnica, el equipo está cansado y el CEO quiere "features wow" de última hora.',
    role: 'lider',
    initialState: createInitialState(
      'lanzamiento_producto',
      'Lanzamiento de Producto Crítico',
      'Lideras el lanzamiento de la v2.0 de tu producto estrella. La fecha es inamovible (conferencia anual en 3 semanas). Hay deuda técnica, el equipo está cansado y el CEO quiere "features wow" de última hora.',
      'Quedan 3 semanas para el lanzamiento en la conferencia anual. El 60% de features comprometidas están listas. QA reporta 47 bugs críticos. El CEO pide añadir "AI-powered insights" esta semana. Tu equipo de 8 está al límite.',
      [
        'Lanzar a tiempo con calidad aceptable',
        'Gestionar expectativas del CEO',
        'Proteger salud del equipo',
        'Definir MVP viable para la demo',
      ],
      [
        'Fecha inamovible (conferencia)',
        'CEO pidiendo scope creep',
        'Equipo al 120% de capacidad',
        'Deuda técnica acumulada',
      ],
      25
    ),
    systemPrompt: '',
    chaosEvents: [],
  },

  cambio_carrera: {
    id: 'cambio_carrera',
    title: 'Transición de Carrera: IC a Management',
    description:
      'Llevas 8 años como Individual Contributor y te ofrecen el puesto de Engineering Manager. Debes decidir si aceptas, sabiendo que perderás manos en código y ganarás responsabilidad de personas, presupuestos y estrategia.',
    role: 'profesional',
    initialState: createInitialState(
      'cambio_carrera',
      'Transición de Carrera: IC a Management',
      'Llevas 8 años como Individual Contributor y te ofrecen el puesto de Engineering Manager. Debes decidir si aceptas, sabiendo que perderás manos en código y ganarás responsabilidad de personas, presupuestos y estrategia.',
      'Tu director te ha ofrecido el puesto de EM del equipo Platform (12 personas). El salario sube 25%, pero dejas de codear. Tu proyecto favorito (la nueva plataforma de datos) queda en manos de otro. Tienes una semana para decidir.',
      [
        'Evaluar si el management es para ti',
        'Negociar términos de transición',
        'Planificar sucesión técnica de tu proyecto',
        'Mantener credibilidad técnica',
      ],
      [
        'Decisión en 7 días',
        'Proyecto técnico que amas en juego',
        'Equipo que te respeta como IC',
        'Incertidumbre sobre satisfacción como manager',
      ],
      0
    ),
    systemPrompt: '',
    chaosEvents: [],
  },

  liderazgo_equipo: {
    id: 'liderazgo_equipo',
    title: 'Liderazgo de Equipo Disfuncional',
    description:
      'Heredas un equipo de 6 ingenieros con baja moral, rotación alta, deuda técnica masiva y zero proceso. El anterior TL renunció quemado. Tienes 90 días para dar la vuelta o te reasignan.',
    role: 'lider',
    initialState: createInitialState(
      'liderazgo_equipo',
      'Liderazgo de Equipo Disfuncional',
      'Heredas un equipo de 6 ingenieros con baja moral, rotación alta, deuda técnica masiva y zero proceso. El anterior TL renunció quemado. Tienes 90 días para dar la vuelta o te reasignan.',
      'Primera semana como TL. El equipo no tiene code reviews, tests, ni planning. Dos seniors han renunciado este mes. El backlog tiene 200+ tickets. El PM espera features para ayer. La moral es de 3/10.',
      [
        'Establecer confianza y seguridad psicológica',
        'Implementar proceso mínimo viable (reviews, planning, retro)',
        'Reducir deuda técnica crítica',
        'Retener al talento restante',
      ],
      [
        '90 días para resultados visibles',
        'Equipo escéptico y cansado',
        'PM presionando por features',
        'Sin presupuesto para contratar',
      ],
      0
    ),
    systemPrompt: '',
    chaosEvents: [],
  },

  networking_evento: {
    id: 'networking_evento',
    title: 'Networking en Conferencia Clave',
    description:
      'Asistes a la conferencia anual de tu industria. Tienes 3 días para conectar con 5 personas clave (inversores, potenciales cofounders, mentores, partners). Eres introvertido y odias el "networking falso".',
    role: 'emprendedor',
    initialState: createInitialState(
      'networking_evento',
      'Networking en Conferencia Clave',
      'Asistes a la conferencia anual de tu industria. Tienes 3 días para conectar con 5 personas clave (inversores, potenciales cofounders, mentores, partners). Eres introvertido y odias el "networking falso".',
      'Día 1 de la conferencia. 2,000 asistentes. Has identificado 5 objetivos prioritarios: 2 VCs, 1 CTO de empresa admirada, 1 potential cofounder, 1 mentor soñado. Estás en el café de la mañana, solo, con tu badge puesto.',
      [
        'Conectar auténticamente con los 5 objetivos',
        'Conseguir 3 follow-up meetings concretos',
        'No parecer "necesitado" ni vendedor',
        'Disfrutar el proceso (o al menos sobrevivir)',
      ],
      [
        'Solo 3 días',
        'Ansiedad social en grupos grandes',
        'Competencia: todos quieren hablar con los mismos',
        'Sin introducciones calientes previas',
      ],
      0
    ),
    systemPrompt: '',
    chaosEvents: [],
  },

  presentacion_inversion: {
    id: 'presentacion_inversion',
    title: 'Pitch a Inversores Serie A',
    description:
      'Tu startup (B2B SaaS, $150k MRR, creciendo 20% MoM) levanta Serie A. Tienes 3 reuniones programadas con VCs top tier. Debes transmitir visión, métricas, equipo y defensibilidad en 30 min cada una.',
    role: 'emprendedor',
    initialState: createInitialState(
      'presentacion_inversion',
      'Pitch a Inversores Serie A',
      'Tu startup (B2B SaaS, $150k MRR, creciendo 20% MoM) levanta Serie A. Tienes 3 reuniones programadas con VCs top tier. Debes transmitir visión, métricas, equipo y defensibilidad en 30 min cada una.',
      'Mañana primera reunión con Partner de Sequoia. Tu deck está en v12. Cofounder nervioso. Métricas fuertes pero churn subió a 4% último mes. Competidor anunció $50M ronda ayer. Necesitas $8M a $80M pre.',
      [
        'Transmitir visión convincente en 10 min',
        'Defender métricas con honestidad (incluyendo churn)',
        'Diferenciar vs competidor recién financiado',
        'Cerrar term sheet en 30 días',
      ],
      [
        '3 reuniones en 5 días',
        'Churn reciente al alza',
        'Competidor con $50M fresco',
        'Cofounder con ansiedad visible',
      ],
      0
    ),
    systemPrompt: '',
    chaosEvents: [],
  },
};

/**
 * Obtiene un escenario por ID
 */
export function getScenario(id: ScenarioId) {
  return SCENARIOS[id];
}

/**
 * Lista todos los escenarios disponibles
 */
export function listScenarios(): ScenarioConfig[] {
  return Object.values(SCENARIOS);
}