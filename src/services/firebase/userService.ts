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
import type { UserProfile, UserRole } from '@/types/profile';
import { sanitizeText } from '@/utils/validation';

import { getFirebaseFirestore } from './firebase';

const USERS_COLLECTION = 'users';

function userDocument(uid: string): Result<DocumentReference<DocumentData>> {
  if (typeof uid !== 'string' || uid.trim().length === 0) {
    return fail(new AppError(ErrorCode.AUTH, 'Se requiere una sesión válida para acceder al perfil de usuario.'));
  }

  const firestore = getFirebaseFirestore();
  if (!firestore.ok) return firestore;

  return ok(doc(firestore.value, USERS_COLLECTION, uid));
}

function normalizeUserProfile(data: DocumentData | undefined): UserProfile | null {
  if (!data) return null;
  const source = data;

  return {
    uid: typeof source.uid === 'string' ? source.uid : '',
    email: typeof source.email === 'string' ? source.email : '',
    displayName: typeof source.displayName === 'string' ? source.displayName : '',
    role: (source.role as UserRole) || 'candidate',
    createdAt: source.createdAt ?? null,
    updatedAt: source.updatedAt ?? null,
    skills: Array.isArray(source.skills) ? source.skills : [],
    experience: Array.isArray(source.experience) ? source.experience : [],
    fullName: typeof source.fullName === 'string' ? source.fullName : undefined,
    headline: typeof source.headline === 'string' ? source.headline : undefined,
    bio: typeof source.bio === 'string' ? source.bio : undefined,
    goal: typeof source.goal === 'string' ? source.goal : undefined,
    yearsOfExperience: typeof source.yearsOfExperience === 'number' ? source.yearsOfExperience : undefined,
  };
}

/**
 * Crea el perfil de usuario en Firestore si no existe.
 * Operación idempotente: si el documento ya existe, no lo sobrescribe.
 */
export async function ensureUserProfile(
  uid: string,
  authData: { email: string; displayName: string }
): Promise<Result<UserProfile>> {
  const reference = userDocument(uid);
  if (!reference.ok) return reference;

  try {
    const snapshot = await getDoc(reference.value);

    if (snapshot.exists()) {
      // Usuario existente: devolver perfil actual sin modificar rol ni campos admin
      const existing = normalizeUserProfile(snapshot.data());
      return ok(existing as UserProfile);
    }

    // Usuario nuevo: crear con rol candidate por defecto
    const now = serverTimestamp();
    const newProfile: UserProfile = {
      uid,
      email: authData.email,
      displayName: authData.displayName,
      role: 'candidate',
      createdAt: now,
      updatedAt: now,
      skills: [],
      experience: [],
    };

    await setDoc(reference.value, {
      uid: newProfile.uid,
      email: newProfile.email,
      displayName: newProfile.displayName,
      role: newProfile.role,
      createdAt: now,
      updatedAt: now,
    });

    return ok({ ...newProfile, createdAt: now, updatedAt: now });
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
    return ok(snapshot.exists() ? normalizeUserProfile(snapshot.data()) : null);
  } catch (error) {
    return fail(mapFirebaseError(error));
  }
}

/**
 * Actualiza campos permitidos del perfil de usuario.
 * Usa setDoc con merge: true para garantizar la sobreescritura correcta.
 * Nunca permite modificar el rol desde el cliente.
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'email' | 'fullName' | 'headline' | 'bio' | 'goal' | 'skills' | 'yearsOfExperience'>>
): Promise<Result<UserProfile>> {
  const reference = userDocument(uid);
  if (!reference.ok) return reference;

  // Filtrar solo campos permitidos y sanitizar
  const allowedUpdates: Record<string, unknown> = {};
  if (updates.displayName !== undefined) {
    allowedUpdates.displayName = sanitizeText(updates.displayName, 80);
  }
  if (updates.email !== undefined) {
    const email = updates.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return fail(new AppError(ErrorCode.VALIDATION, 'Correo electrónico inválido.', { details: { field: 'email' } }));
    }
    allowedUpdates.email = email;
  }
  if (updates.fullName !== undefined) {
    allowedUpdates.fullName = sanitizeText(updates.fullName, 80);
  }
  if (updates.headline !== undefined) {
    allowedUpdates.headline = sanitizeText(updates.headline, 120);
  }
  if (updates.bio !== undefined) {
    allowedUpdates.bio = sanitizeText(updates.bio, 1200);
  }
  if (updates.goal !== undefined) {
    allowedUpdates.goal = sanitizeText(updates.goal, 500);
  }
  if (updates.skills !== undefined) {
    allowedUpdates.skills = updates.skills.map(s => sanitizeText(s, 40)).filter(s => s.length > 0);
  }
  if (updates.yearsOfExperience !== undefined) {
    allowedUpdates.yearsOfExperience = Math.trunc(updates.yearsOfExperience);
  }

  if (Object.keys(allowedUpdates).length === 0) {
    return fail(new AppError(ErrorCode.VALIDATION, 'No hay campos válidos para actualizar.'));
  }

  try {
    await setDoc(reference.value, {
      ...allowedUpdates,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // Leer el perfil actualizado
    const snapshot = await getDoc(reference.value);
    const updated = normalizeUserProfile(snapshot.data());
    return ok(updated as UserProfile);
  } catch (error) {
    return fail(mapFirebaseError(error));
  }
}

/**
 * Suscripción en tiempo real al perfil de usuario.
 */
export function subscribeUserProfile(
  uid: string,
  handler: (profile: UserProfile | null) => void
): Result<() => void> {
  const reference = userDocument(uid);
  if (!reference.ok) return reference;

  try {
    const unsubscribe = onSnapshot(
      reference.value,
      (snapshot) => {
        try {
          handler(snapshot.exists() ? normalizeUserProfile(snapshot.data()) : null);
        } catch {
          handler(null);
        }
      },
      () => handler(null)
    );

    return ok(unsubscribe);
  } catch (error) {
    return fail(toAppError(error));
  }
}