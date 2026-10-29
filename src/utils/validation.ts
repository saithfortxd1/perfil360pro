import { failWith, ok, type Result } from '@/lib/result';
import { ErrorCode } from '@/lib/errors';
import type { ProfileDraft } from '@/types/profile';

/** Límites del dominio. Son la única fuente de verdad para validación y conteo. */
export const LIMITS = {
  fullName: { min: 2, max: 80 },
  headline: { min: 4, max: 120 },
  bio: { max: 1200 },
  goal: { min: 0, max: 500 },
  skills: { minItems: 1, maxItems: 30, itemMax: 40 },
  yearsOfExperience: { min: 0, max: 60 },
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

/**
 * Normaliza texto libre: forma Unicode NFC, elimina caracteres de control y
 * marcadores bidireccionales y colapsa espacios. No altera el contenido visible.
 */
export function sanitizeText(value: unknown, maxLength = 5000): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(CONTROL_OR_BIDI, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function validateLength(
  value: unknown,
  { min = 0, max }: { min?: number; max: number },
  field: string,
  label: string,
): Result<string> {
  const text = sanitizeText(value, max + 64);
  if (text.length < min) {
    return failWith(ErrorCode.VALIDATION, `${label} debe tener al menos ${min} caracteres.`, { field });
  }
  if (text.length > max) {
    return failWith(ErrorCode.VALIDATION, `${label} no puede superar ${max} caracteres.`, { field });
  }
  return ok(text);
}

export function validateEmail(value: unknown): Result<string> {
  const email = sanitizeText(value, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return failWith(ErrorCode.VALIDATION, 'Ingresa un correo válido, por ejemplo nombre@dominio.com.', {
      field: 'email',
    });
  }
  return ok(email);
}

export function validatePassword(value: unknown): Result<string> {
  if (typeof value !== 'string' || value.length < 8) {
    return failWith(ErrorCode.VALIDATION, 'La contraseña debe tener al menos 8 caracteres.', {
      field: 'password',
    });
  }
  if (value.length > 128) {
    return failWith(ErrorCode.VALIDATION, 'La contraseña no puede superar 128 caracteres.', {
      field: 'password',
    });
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return failWith(ErrorCode.VALIDATION, 'La contraseña debe incluir al menos una letra y un número.', {
      field: 'password',
    });
  }
  return ok(value);
}

/** Valida y normaliza el borrador de perfil. Entrada `unknown` por ser frontera de confianza. */
export function validateProfileDraft(input: unknown): Result<ProfileDraft> {
  if (input === null || typeof input !== 'object') {
    return failWith(ErrorCode.VALIDATION, 'Los datos del perfil son inválidos.', { field: 'profile' });
  }

  const source = input as Record<string, unknown>;

  const fullName = validateLength(source.fullName, LIMITS.fullName, 'fullName', 'El nombre');
  if (!fullName.ok) return fullName;

  const headline = validateLength(source.headline, LIMITS.headline, 'headline', 'El titular');
  if (!headline.ok) return headline;

  const bio = validateLength(source.bio ?? '', { min: 0, max: LIMITS.bio.max }, 'bio', 'La biografía');
  if (!bio.ok) return bio;

  const goal = validateLength(source.goal, LIMITS.goal, 'goal', 'El objetivo');
  if (!goal.ok) return goal;

  const education = validateLength(source.education ?? '', { min: 0, max: 800 }, 'education', 'La formación');
  if (!education.ok) return education;

  const rawSkills = Array.isArray(source.skills) ? source.skills : [];
  const skills = [
    ...new Set(
      rawSkills
        .map((skill) => sanitizeText(skill, LIMITS.skills.itemMax))
        .filter((skill) => skill.length > 0),
    ),
  ];

  if (skills.length < LIMITS.skills.minItems) {
    return failWith(ErrorCode.VALIDATION, 'Añade al menos una habilidad.', { field: 'skills' });
  }
  if (skills.length > LIMITS.skills.maxItems) {
    return failWith(ErrorCode.VALIDATION, `Puedes registrar hasta ${LIMITS.skills.maxItems} habilidades.`, {
      field: 'skills',
    });
  }

  const years = Number(source.yearsOfExperience);
  if (!Number.isFinite(years) || years < LIMITS.yearsOfExperience.min || years > LIMITS.yearsOfExperience.max) {
    return failWith(
      ErrorCode.VALIDATION,
      `Los años de experiencia deben estar entre ${LIMITS.yearsOfExperience.min} y ${LIMITS.yearsOfExperience.max}.`,
      { field: 'yearsOfExperience' },
    );
  }

  return ok({
    fullName: fullName.value,
    headline: headline.value,
    bio: bio.value,
    goal: goal.value,
    education: education.value,
    skills,
    yearsOfExperience: Math.trunc(years),
  });
}
