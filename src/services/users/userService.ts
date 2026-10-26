import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';

import { AppError, ErrorCode, mapFirebaseError, toAppError } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import type { UserProfile } from '@/types/profile';
import { getFirebaseFirestore } from '@/services/firebase/firebase';

const COLLECTION = 'users';
export const USER_PROFILE_SCHEMA_VERSION = 1;

function userDocument(uid: string): Result<DocumentReference<DocumentData>> {
  if (typeof uid !== 'string' || uid.trim().length === 0) {
    return fail(new AppError(ErrorCode.AUTH, 'Se requiere un ID de usuario válido para acceder al perfil.'));
  }

  const firestore = getFirebaseFirestore();
  if (!firestore.ok) return firestore;

  return ok(doc(firestore.value, COLLECTION, uid));
}

function normalizeProfile(data: DocumentData | undefined): UserProfile | null {
  if (!data) return null;

  return {
    uid: typeof data.uid === 'string' ? data.uid : '',
    email: typeof data.email === 'string' ? data.email : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    role: (data.role as 'candidate' | 'recruiter' | 'admin') || 'candidate',
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    skills: Array.isArray(data.skills) ? data.skills : [],
    experience: Array.isArray(data.experience) ? data.experience : [],
    fullName: typeof data.fullName === 'string' ? data.fullName : undefined,
    headline: typeof data.headline === 'string' ? data.headline : undefined,
    bio: typeof data.bio === 'string' ? data.bio : undefined,
    goal: typeof data.goal === 'string' ? data.goal : undefined,
    yearsOfExperience: typeof data.yearsOfExperience === 'number' ? data.yearsOfExperience : undefined,
  };
}

/**
 * Crea el perfil de usuario en Firestore si no existe (idempotente).
 * El rol por defecto es 'candidate'.
 */
export async function ensureUserProfile(
  uid: string,
  authData: { email: string; displayName: string },
): Promise<Result<UserProfile>> {
  const reference = userDocument(uid);
  if (!reference.ok) return reference;

  try {
    const snapshot = await getDoc(reference.value);

    if (snapshot.exists()) {
      const existing = normalizeProfile(snapshot.data());
      return ok(existing as UserProfile);
    }

    // Usuario nuevo: crear con rol 'candidate' por defecto
    const newProfile: UserProfile = {
      uid,
      email: authData.email,
      displayName: authData.displayName,
      role: 'candidate',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      skills: [],
      experience: [],
      fullName: authData.displayName || '',
    };

    await setDoc(reference.value, {
      uid: newProfile.uid,
      email: newProfile.email,
      displayName: newProfile.displayName,
      role: newProfile.role,
      createdAt: newProfile.createdAt,
      updatedAt: newProfile.updatedAt,
    });

    return ok({ ...newProfile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } catch (error) {
    return fail(mapFirebaseError(error));
  }
}

/**
 * Obtiene el perfil de usuario desde Firestore.
 */
export async function getUserProfile(uid: string): Promise<Result<UserProfile | null>> {
  const reference = userDocument(uid);
  if (!reference.ok) return reference;

  try {
    const snapshot = await getDoc(reference.value);
    return ok(snapshot.exists() ? normalizeProfile(snapshot.data()) : null);
  } catch (error) {
    return fail(mapFirebaseError(error));
  }
}

/**
 * Actualiza campos permitidos del perfil de usuario.
 * Nunca permite modificar el rol desde el cliente.
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'headline' | 'bio' | 'goal' | 'skills' | 'yearsOfExperience' | 'experience'>>,
): Promise<Result<UserProfile>> {
  const reference = userDocument(uid);
  if (!reference.ok) return reference;

  const allowedUpdates: Record<string, unknown> = {};
  if (updates.displayName !== undefined) allowedUpdates.displayName = updates.displayName;
  if (updates.headline !== undefined) allowedUpdates.headline = updates.headline;
  if (updates.bio !== undefined) allowedUpdates.bio = updates.bio;
  if (updates.goal !== undefined) allowedUpdates.goal = updates.goal;
  if (updates.skills !== undefined) allowedUpdates.skills = updates.skills;
  if (updates.yearsOfExperience !== undefined) allowedUpdates.yearsOfExperience = updates.yearsOfExperience;
  if (updates.experience !== undefined) allowedUpdates.experience = updates.experience;

  if (Object.keys(allowedUpdates).length === 0) {
    return fail(new AppError(ErrorCode.VALIDATION, 'No hay campos válidos para actualizar.'));
  }

  try {
    await updateDoc(reference.value, {
      ...allowedUpdates,
      updatedAt: serverTimestamp(),
    });

    const snapshot = await getDoc(reference.value);
    return ok(normalizeProfile(snapshot.data()) as UserProfile);
  } catch (error) {
    return fail(mapFirebaseError(error));
  }
}

/**
 * Suscripción en tiempo real al perfil de usuario.
 */
export function observeUserProfile(
  uid: string,
  handler: (profile: UserProfile | null) => void,
): Result<() => void> {
  const reference = userDocument(uid);
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