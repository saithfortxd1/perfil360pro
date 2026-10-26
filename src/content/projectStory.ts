import { Compass, Network, Rocket, Sparkles, type LucideIcon } from 'lucide-react';

export type StageStatus = 'completado' | 'preparado' | 'pendiente';

export interface StatusItem {
  readonly label: string;
  readonly status: StageStatus;
}

export interface CriterionItem {
  readonly index: string;
  readonly label: string;
  readonly detail: string;
}

export interface ArchitectureLayer {
  readonly index: string;
  readonly name: string;
  readonly analogy: string;
  readonly detail: string;
  readonly state: StageStatus;
}

export interface StoryStage {
  /** Identificador de ancla: se usa en el enlace directo #etapa-N. */
  readonly id: string;
  readonly index: string;
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;
  readonly paragraphs: readonly string[];
  readonly icon: LucideIcon;
  readonly accent: 'signal' | 'ion' | 'ember';
  readonly layout: 'signals' | 'criteria' | 'architecture' | 'status';
  readonly signals?: readonly string[];
  readonly criteria?: readonly CriterionItem[];
  readonly layers?: readonly ArchitectureLayer[];
  readonly statusItems?: readonly StatusItem[];
  /** Aclaración honesta sobre información que todavía no existe. */
  readonly note?: string;
}

/**
 * Contenido local de la historia del proyecto. No depende de Firebase, de la red
 * ni de una sesión: la vista se renderiza completa sin datos remotos.
 *
 * IMPORTANTE: no se documentan modelos de IA, pruebas ni métricas concretas
 * porque no han sido proporcionados. Donde faltan datos se indica explícitamente.
 */
export const projectStory: readonly StoryStage[] = [
  {
    id: 'etapa-1',
    index: '01',
    kicker: 'Etapa 01 · Punto de partida',
    title: 'El problema que dio origen a Perfil 360 AI',
    lead: 'Casi todo el mundo sabe hacer su trabajo. Muy poca gente consigue explicarlo bien por escrito.',
    paragraphs: [
      'Buscar empleo, cambiar de sector o pedir un ascenso depende casi siempre de un texto: un currículum, un perfil profesional, una descripción en una red laboral. Ese texto se escribe de memoria, con prisa y sin una mirada externa que lo revise.',
      'El resultado se repite: se enumeran tareas en lugar de logros, se mezclan herramientas con responsabilidades, se omiten resultados concretos y se copia el mismo relato para puestos muy distintos.',
      'Perfil 360 AI nace de esa fricción concreta: la distancia entre lo que una persona sabe hacer y lo que su perfil consigue comunicar.',
    ],
    icon: Compass,
    accent: 'signal',
    layout: 'signals',
    signals: [
      'El relato profesional queda repartido entre varias plataformas',
      'Nadie revisa el perfil con criterio externo',
      'Es difícil saber qué información falta por completar',
    ],
  },
  {
    id: 'etapa-2',
    index: '02',
    kicker: 'Etapa 02 · Decisiones de tecnología',
    title: 'Cómo se eligieron las herramientas de inteligencia artificial',
    lead: 'La tecnología se eligió después del problema, nunca antes.',
    paragraphs: [
      'Antes de incorporar cualquier modelo o servicio se definieron las condiciones que debía cumplir la solución: entender texto escrito por personas no expertas, producir recomendaciones concretas y verificables, y mantener siempre a la persona en control de su propio contenido.',
      'También pesaron criterios prácticos: coste predecible, posibilidad de sustituir un proveedor por otro sin reescribir la aplicación y cuidado con los datos personales.',
      'Por eso la arquitectura no depende de un modelo concreto. Primero se construyeron la interfaz y la lógica de negocio; el análisis con IA se conectará después como un servicio intercambiable detrás de una frontera bien definida.',
    ],
    icon: Sparkles,
    accent: 'ion',
    layout: 'criteria',
    criteria: [
      {
        index: 'C1',
        label: 'Comprensión del lenguaje natural',
        detail: 'Debe interpretar descripciones profesionales escritas sin jerga técnica ni formato estricto.',
      },
      {
        index: 'C2',
        label: 'Proveedor reemplazable',
        detail: 'El motor de análisis tiene que poder cambiarse sin tocar la interfaz ni las reglas de negocio.',
      },
      {
        index: 'C3',
        label: 'Coste acotado',
        detail: 'El gasto por análisis debe ser predecible, con límites de uso por persona y por periodo.',
      },
      {
        index: 'C4',
        label: 'Privacidad por defecto',
        detail: 'Ningún dato personal debe salir del proyecto si no es imprescindible para generar el análisis.',
      },
      {
        index: 'C5',
        label: 'Recomendaciones verificables',
        detail: 'Cada sugerencia debe poder rastrearse hasta algo que la persona ha escrito realmente.',
      },
    ],
    note: 'Información pendiente de completar: nombres exactos de los modelos evaluados, pruebas comparativas realizadas y resultados obtenidos. No se documenta ningún modelo ni métrica porque esas pruebas todavía no se han realizado en este proyecto.',
  },
  {
    id: 'etapa-3',
    index: '03',
    kicker: 'Etapa 03 · Arquitectura',
    title: 'Cómo está organizado el sistema, en palabras simples',
    lead: 'Piensa en un restaurante: la sala donde te atienden, la cocina donde se prepara todo y el almacén donde se guarda lo necesario.',
    paragraphs: [
      'La interfaz es la sala: lo único que ve y toca la persona. Su responsabilidad se limita a mostrar información y recoger datos; no decide nada por su cuenta.',
      'La lógica de negocio es la cocina: aquí viven las reglas, como calcular qué tan completo está un perfil o qué recomendaciones corresponden según lo escrito.',
      'Los servicios son el mostrador que comunica sala y almacén: traducen cada petición y validan todo antes de guardar. El almacén es la base de datos, donde el perfil de cada persona queda aislado del resto.',
    ],
    icon: Network,
    accent: 'ion',
    layout: 'architecture',
    layers: [
      {
        index: '01',
        name: 'Interfaz',
        analogy: 'La sala',
        detail: 'Páginas, componentes y sistema visual. Muestra datos y recoge lo que la persona escribe.',
        state: 'completado',
      },
      {
        index: '02',
        name: 'Lógica de negocio',
        analogy: 'La cocina',
        detail: 'Puntuación, validación y recomendaciones. Funciones puras y verificables, sin depender de la interfaz.',
        state: 'completado',
      },
      {
        index: '03',
        name: 'Servicios y mensajería',
        analogy: 'El mostrador',
        detail: 'Módulos que conectan interfaz y datos, validan cada operación y clasifican los errores.',
        state: 'preparado',
      },
      {
        index: '04',
        name: 'Almacén de datos',
        analogy: 'El almacén',
        detail: 'Cloud Firestore. Preparado, pero todavía sin conectar: faltan credenciales y reglas de seguridad.',
        state: 'pendiente',
      },
    ],
    note: 'Ninguna función de inteligencia artificial está desplegada todavía. Lo que existe es la estructura que la alojará.',
  },
  {
    id: 'etapa-4',
    index: '04',
    kicker: 'Etapa 04 · Puesta en marcha',
    title: 'Qué está hecho, qué está preparado y qué falta',
    lead: 'La entrega se organiza en tres estados para que no haya dudas sobre el punto exacto del proyecto.',
    paragraphs: [
      'Un proyecto se comunica mejor cuando distingue con claridad lo terminado de lo que sólo está listo para conectarse. Estas tres listas son la fotografía real del estado actual.',
    ],
    icon: Rocket,
    accent: 'ember',
    layout: 'status',
    statusItems: [
      { label: 'Base del proyecto con Vite, React y TypeScript', status: 'completado' },
      { label: 'Sistema visual, tokens y componentes reutilizables', status: 'completado' },
      { label: 'Enrutado público y esta página de historia', status: 'completado' },
      { label: 'Validación estricta, tipado y manejo de errores', status: 'completado' },
      { label: 'Módulos de Firebase Authentication y Cloud Firestore', status: 'preparado' },
      { label: 'Plantilla .env.example con las variables requeridas', status: 'preparado' },
      { label: 'Capa de servicios y hooks lista para conectar', status: 'preparado' },
      { label: 'Credenciales reales del proyecto de Firebase', status: 'pendiente' },
      { label: 'Reglas de seguridad de Firestore y App Check', status: 'pendiente' },
      { label: 'Servicio de análisis con IA en el backend', status: 'pendiente' },
      { label: 'Despliegue público y dominio definitivo', status: 'pendiente' },
    ],
    note: 'No se ha verificado ninguna conexión real con Firebase: en este entorno no se han proporcionado credenciales para el proyecto perfil360-8c837.',
  },
];

export const storyClosing = {
  title: 'Perfil 360 AI no promete adivinar quién eres.',
  body: 'Ordena lo que ya sabes, señala lo que falta y deja la última palabra en tus manos.',
};
