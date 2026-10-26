import { analyzeProfile } from '@/utils/profileScore';
import { validateProfileDraft } from '@/utils/validation';
import type { ProfileAnalysis, ProfileDraft, StoredProfile } from '@/types/profile';
import type { Result } from '@/lib/result';

import { observeProfile, readProfile, writeProfile } from './firebase/firestore';

/**
 * Servicio de perfil: única puerta de entrada para leer, guardar y analizar.
 * La UI no conoce Firestore ni las reglas de validación; sólo este contrato.
 */
export const profileService = {
  load(uid: string): Promise<Result<StoredProfile | null>> {
    return readProfile(uid);
  },

  subscribe(uid: string, handler: (profile: StoredProfile | null) => void): Result<() => void> {
    return observeProfile(uid, handler);
  },

  /** Valida en la frontera de confianza antes de persistir. */
  save(uid: string, input: unknown): Promise<Result<StoredProfile>> {
    const validated = validateProfileDraft(input);
    if (!validated.ok) return Promise.resolve(validated);
    return writeProfile(uid, validated.value);
  },

  /** Análisis local y determinista: no realiza llamadas de red. */
  analyze(profile: Partial<ProfileDraft> | null | undefined): ProfileAnalysis {
    return analyzeProfile(profile);
  },
};
