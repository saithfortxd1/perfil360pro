import type { ProfileAnalysis, ProfileDraft, ProfileLevel, ProfileScore } from '@/types/profile';

/**
 * Reglas de negocio puras de Perfil 360.
 * Sin React, sin Firebase y sin efectos secundarios: son deterministas y
 * verificables de forma aislada. La UI nunca calcula puntuaciones por su cuenta.
 */
export const SECTION_WEIGHTS = {
  fullName: 10,
  headline: 15,
  bio: 20,
  skills: 30,
  goal: 25,
} as const;

const MAX_EXPERIENCE_YEARS = 15;
const EXPERIENCE_BONUS_MAX = 10;
const BIO_SUBSTANTIAL_LENGTH = 40;
const SKILLS_FOR_FULL_CREDIT = 5;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function hasSubstantialText(value: unknown, minLength: number): boolean {
  return typeof value === 'string' && value.trim().length >= minLength;
}

/** Completitud ponderada del perfil, de 0 a 100. */
export function computeCompleteness(profile: Partial<ProfileDraft> | null | undefined): number {
  if (profile === null || profile === undefined) return 0;

  let total = 0;

  if (hasSubstantialText(profile.fullName, 2)) total += SECTION_WEIGHTS.fullName;
  if (hasSubstantialText(profile.headline, 4)) total += SECTION_WEIGHTS.headline;
  if (hasSubstantialText(profile.bio, BIO_SUBSTANTIAL_LENGTH)) total += SECTION_WEIGHTS.bio;

  const skillCount = Array.isArray(profile.skills) ? profile.skills.length : 0;
  if (skillCount > 0) {
    total += SECTION_WEIGHTS.skills * clamp(skillCount / SKILLS_FOR_FULL_CREDIT, 0.4, 1);
  }

  if (hasSubstantialText(profile.goal, 10)) total += SECTION_WEIGHTS.goal;

  return Math.round(clamp(total, 0, 100));
}

/** Puntuación 360 (0-1000) con desglose trazable de sus dos componentes. */
export function computeProfileScore(profile: Partial<ProfileDraft> | null | undefined): ProfileScore {
  const completeness = computeCompleteness(profile);
  const years = typeof profile?.yearsOfExperience === 'number' && Number.isFinite(profile.yearsOfExperience)
    ? profile.yearsOfExperience
    : 0;

  const experienceBonus = clamp(years, 0, MAX_EXPERIENCE_YEARS) * (EXPERIENCE_BONUS_MAX / MAX_EXPERIENCE_YEARS);
  const score = Math.round(clamp(completeness * 9 + experienceBonus * 10, 0, 1000));

  const level: ProfileLevel =
    score >= 800 ? 'destacado' : score >= 600 ? 'solido' : score >= 350 ? 'en_desarrollo' : 'inicial';

  return {
    score,
    level,
    breakdown: { completeness, experienceBonus: Math.round(experienceBonus * 10) / 10 },
  };
}

const LEVEL_TITLES: Readonly<Record<ProfileLevel, string>> = {
  inicial: 'Perfil inicial',
  en_desarrollo: 'Perfil en desarrollo',
  solido: 'Perfil sólido',
  destacado: 'Perfil destacado',
};

export function levelTitle(level: ProfileLevel): string {
  return LEVEL_TITLES[level];
}

function skillsLackEvidence(profile: Partial<ProfileDraft>): boolean {
  const bio = typeof profile.bio === 'string' ? profile.bio.toLowerCase() : '';
  if (bio.length === 0) return true;
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  return !skills.some((skill) => skill.length >= 3 && bio.includes(skill.toLowerCase()));
}

/** Recomendaciones deterministas derivadas del estado del perfil. */
export function buildRecommendations(profile: Partial<ProfileDraft> | null | undefined): readonly string[] {
  const draft = profile ?? {};
  const recommendations: string[] = [];

  if (!hasSubstantialText(draft.bio, BIO_SUBSTANTIAL_LENGTH)) {
    recommendations.push('Escribe una biografía de al menos 40 caracteres con tu propuesta de valor.');
  }

  const skillCount = Array.isArray(draft.skills) ? draft.skills.length : 0;
  if (skillCount < SKILLS_FOR_FULL_CREDIT) {
    recommendations.push(`Añade habilidades hasta alcanzar al menos ${SKILLS_FOR_FULL_CREDIT}.`);
  } else if (skillsLackEvidence(draft)) {
    recommendations.push('Relaciona cada habilidad clave con un logro o proyecto concreto en tu biografía.');
  }

  if (!hasSubstantialText(draft.goal, 10)) {
    recommendations.push('Define un objetivo profesional concreto para orientar tu perfil.');
  }

  if (computeCompleteness(draft) === 100) {
    recommendations.push('Tu perfil está completo: revísalo cada mes para mantenerlo vigente.');
  }

  return recommendations;
}

/** Análisis local y determinista. No realiza llamadas de red ni depende de Firebase. */
export function analyzeProfile(profile: Partial<ProfileDraft> | null | undefined): ProfileAnalysis {
  return { score: computeProfileScore(profile), recommendations: buildRecommendations(profile) };
}
