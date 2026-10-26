export type InterviewerGender = 'mujer' | 'hombre' | 'no especificado';

export interface InterviewerProfile {
  id: string;
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
}

export const INTERVIEWER_PROFILES = [
  {
    id: 'james',
    name: 'James',
    gender: 'no especificado',
    role: 'Entrevistador de selección',
    company: 'Perfil 360 AI',
    description: 'Entrevista profesional centrada en competencias y ejemplos concretos.',
    conversationalStyle: 'analítico, cordial y directo',
    liveAvatarId: '69a246bd-1739-418d-b533-9fc578208175',
    voice: { provider: 'gemini-tts', selection: 'server-default' },
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
  },
] as const satisfies readonly InterviewerProfile[];

export type InterviewerId = (typeof INTERVIEWER_PROFILES)[number]['id'];

export const DEFAULT_INTERVIEWER = INTERVIEWER_PROFILES[0];

export function getInterviewerById(id: string): (typeof INTERVIEWER_PROFILES)[number] | undefined {
  return INTERVIEWER_PROFILES.find((interviewer) => interviewer.id === id);
}
