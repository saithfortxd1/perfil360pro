import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';

import { AppError, ErrorCode, mapFirebaseError, toAppError } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import type { ProfileDraft, StoredProfile } from '@/types/profile';
import { LIMITS, sanitizeText } from '@/utils/validation';

import { getFirebaseFirestore } from './firebase';

const COLLECTION = 'profiles';
export const PROFILE_SCHEMA_VERSION = 1;

function profileDocument(uid: string): Result<DocumentReference<DocumentData>> {
  if (typeof uid !== 'string' || uid.trim().length === 0) {
    return fail(new AppError(ErrorCode.AUTH, 'Se requiere una sesión válida para acceder al perfil.'));
  }

  const firestore = getFirebaseFirestore();
  if (!firestore.ok) return firestore;

  return ok(doc(firestore.value, COLLECTION, uid));
}

function normalizeProfile(data: DocumentData | undefined): StoredProfile {
  const source = data ?? {};
  const updatedAt = source.updatedAt as { toMillis?: () => number } | undefined;
  const skills = Array.isArray(source.skills)
    ? source.skills
        .map((skill: unknown) => sanitizeText(skill, LIMITS.skills.itemMax))
        .filter((skill: string) => skill.length > 0)
        .slice(0, LIMITS.skills.maxItems)
    : [];

  return {
    fullName: typeof source.fullName === 'string' ? source.fullName : '',
    headline: typeof source.headline === 'string' ? source.headline : '',
    bio: typeof source.bio === 'string' ? source.bio : '',
    goal: typeof source.goal === 'string' ? source.goal : '',
    education: typeof source.education === 'string' ? source.education : '',
    skills,
    yearsOfExperience: typeof source.yearsOfExperience === 'number' ? source.yearsOfExperience : 0,
    schemaVersion: typeof source.schemaVersion === 'number' ? source.schemaVersion : PROFILE_SCHEMA_VERSION,
    updatedAtMs: typeof source.updatedAtMs === 'number'
      ? source.updatedAtMs
      : typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : 0,
  };
}

export async function readProfile(uid: string): Promise<Result<StoredProfile | null>> {
  const reference = profileDocument(uid);
  if (!reference.ok) return reference;

  try {
    const snapshot = await getDoc(reference.value);
    return ok(snapshot.exists() ? normalizeProfile(snapshot.data()) : null);
  } catch (error) {
    return fail(mapFirebaseError(error));
  }
}

export async function writeProfile(uid: string, draft: ProfileDraft): Promise<Result<StoredProfile>> {
  const reference = profileDocument(uid);
  if (!reference.ok) return reference;

  const updatedAtMs = Date.now();

  try {
    await setDoc(
      reference.value,
      {
        ...draft,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return ok({ ...draft, schemaVersion: PROFILE_SCHEMA_VERSION, updatedAtMs });
  } catch (error) {
    return fail(mapFirebaseError(error));
  }
}

/**
 * Suscripción en tiempo real con degradación segura: ante cualquier error de
 * lectura se notifica `null` en lugar de propagar la excepción a la UI.
 */
export function observeProfile(
  uid: string,
  handler: (profile: StoredProfile | null) => void,
): Result<() => void> {
  const reference = profileDocument(uid);
  if (!reference.ok) return reference;

  try {
    const unsubscribe = onSnapshot(
      reference.value,
      (snapshot) => {
        try {
          handler(snapshot.exists() ? normalizeProfile(snapshot.data()) : null);
        } catch {
          handler(null);
        }
      },
      () => handler(null),
    );

    return ok(unsubscribe);
  } catch (error) {
    return fail(toAppError(error));
  }
}
