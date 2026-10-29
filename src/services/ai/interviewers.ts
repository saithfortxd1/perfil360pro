export type InterviewerGender = 'hombre' | 'mujer' | 'no especificado';

export interface InterviewerProfile {
  id: 'james' | 'mateo' | 'andres' | 'olivia' | 'valeria' | 'camila';
  name: string;
  gender: InterviewerGender;
  role: string;
  company: string;
  description: string;
  conversationalStyle: string;
  liveAvatarId: string | null;
  voice: {
    provider: 'gemini-tts' | 'browser';
    selection: 'server-default' | 'user-selected';
  };
  enabled?: boolean;
}

/**
 * Catálogo completo de perfiles de entrevistadores.
 * Por requisito del producto, todos los entrevistadores disponibles son exclusivamente personajes masculinos (Mateo, James, Andrés).
 * Los perfiles femeninos (Olivia, Valeria, Camila) quedan deshabilitados (enabled: false) para no aparecer en el simulador.
 */
export const ALL_INTERVIEWER_PROFILES = [
  {
    id: 'james',
    name: 'James',
    gender: 'hombre',
    role: 'Entrevistador de selección',
    company: 'Perfil 360 AI',
    description: 'Entrevista profesional centrada en competencias y ejemplos concretos.',
    conversationalStyle: 'analítico, cordial y directo',
    liveAvatarId: '69a246bd-1739-418d-b533-9fc578208175',
    voice: { provider: 'gemini-tts', selection: 'server-default' },
    enabled: true,
  },
  {
    id: 'mateo',
    name: 'Mateo',
    gender: 'hombre',
    role: 'Entrevistador de selección',
    company: 'Perfil 360 AI',
    description: 'Entrevista profesional centrada en competencias y ejemplos concretos.',
    conversationalStyle: 'objetivo, cordial y directo',
    liveAvatarId: 'c6fe7922-ef30-4928-98b2-95e44bdf3f1e',
    voice: { provider: 'gemini-tts', selection: 'server-default' },
    enabled: true,
  },
  {
    id: 'andres',
    name: 'Andrés Mendoza',
    gender: 'hombre',
    role: 'Gerente de Talento Humano',
    company: 'Horizon RH',
    description: 'Evalúa competencias y experiencias profesionales.',
    conversationalStyle: 'profesional, objetivo y cordial',
    liveAvatarId: null,
    voice: { provider: 'browser', selection: 'user-selected' },
    enabled: true,
  },
  {
    id: 'olivia',
    name: 'Olivia',
    gender: 'mujer',
    role: 'Entrevistadora de selección',
    company: 'Perfil 360 AI',
    description: 'Entrevista profesional centrada en competencias y ejemplos concretos.',
    conversationalStyle: 'analítica, cordial y directa',
    liveAvatarId: 'dc6a2ade-fcad-48b4-89ce-8ae807b18c32',
    voice: { provider: 'gemini-tts', selection: 'server-default' },
    enabled: false,
  },
  {
    id: 'valeria',
    name: 'Valeria Torres',
    gender: 'mujer',
    role: 'Líder Técnica',
    company: 'KRONOS Labs',
    description: 'Evalúa razonamiento técnico y liderazgo.',
    conversationalStyle: 'analítica, exigente y cordial',
    liveAvatarId: null,
    voice: { provider: 'browser', selection: 'user-selected' },
    enabled: false,
  },
  {
    id: 'camila',
    name: 'Camila Rojas',
    gender: 'mujer',
    role: 'Directora Comercial',
    company: 'Vanguard Sales',
    description: 'Evalúa comunicación y criterio comercial.',
    conversationalStyle: 'segura, directa y cordial',
    liveAvatarId: null,
    voice: { provider: 'browser', selection: 'user-selected' },
    enabled: false,
  },
] as const satisfies readonly (InterviewerProfile & { enabled: boolean })[];

export type InterviewerId = (typeof ALL_INTERVIEWER_PROFILES)[number]['id'];

/**
 * Perfiles de entrevistadores.
 * Contiene todos los perfiles definidos en la aplicación conservando compatibilidad
 * con contratos de verificación existentes.
 */
export const INTERVIEWER_PROFILES = ALL_INTERVIEWER_PROFILES;

export const DEFAULT_INTERVIEWER = INTERVIEWER_PROFILES[0];

export function getInterviewerById(id: string): InterviewerProfile | undefined {
  return ALL_INTERVIEWER_PROFILES.find((interviewer) => interviewer.id === id);
}

/** Devuelve únicamente los entrevistadores masculinos activos disponibles para la simulación */
export function getAvailableInterviewers(): readonly InterviewerProfile[] {
  const activeMaleIds = new Set<InterviewerProfile['id']>(['mateo', 'james', 'andres']);
  return ALL_INTERVIEWER_PROFILES.filter((i) => i.enabled && i.gender === 'hombre' && activeMaleIds.has(i.id));
}
