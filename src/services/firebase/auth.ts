import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';

import { mapFirebaseError, AppError, ErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import type { SessionUser } from '@/types/profile';
import { sanitizeText, validateEmail, validatePassword } from '@/utils/validation';

import { getFirebaseAuth } from './firebase';
import { ensureUserProfile } from './userService';

/** Proyección mínima del usuario: nunca se expone el objeto `User` completo a la UI. */
export function toSessionUser(user: User | null): SessionUser | null {
  if (user === null) return null;
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
  };
}

/** Observa la sesión. Si Firebase no está configurado devuelve un `Result` fallido. */
export function observeSession(handler: (user: SessionUser | null) => void): Result<() => void> {
  const auth = getFirebaseAuth();
  if (!auth.ok) return auth;

  const unsubscribe = onAuthStateChanged(
    auth.value,
    (user) => handler(toSessionUser(user)),
    () => handler(null),
  );

  return ok(unsubscribe);
}

export async function signUpWithEmail(input: {
  email: unknown;
  password: unknown;
  fullName: unknown;
}): Promise<Result<SessionUser>> {
  const email = validateEmail(input.email);
  if (!email.ok) return email;

  const password = validatePassword(input.password);
  if (!password.ok) return password;

  const fullName = sanitizeText(input.fullName, 80);
  if (fullName.length < 2) {
    return fail(
      new AppError(ErrorCode.VALIDATION, 'El nombre debe tener al menos 2 caracteres.', {
        details: { field: 'fullName' },
      }),
    );
  }

  const auth = getFirebaseAuth();
  if (!auth.ok) return auth;

  try {
    const credential = await createUserWithEmailAndPassword(auth.value, email.value, password.value);
    await updateProfile(credential.user, { displayName: fullName });
    return ok(toSessionUser(credential.user) as SessionUser);
  } catch (error) {
    console.error('[Firebase Auth] signUpWithEmail failed:', error);
    return fail(mapFirebaseError(error));
  }
}

export async function signInWithEmail(input: { email: unknown; password: unknown }): Promise<Result<SessionUser>> {
  const email = validateEmail(input.email);
  if (!email.ok) return email;

  if (typeof input.password !== 'string' || input.password.length === 0) {
    return fail(
      new AppError(ErrorCode.VALIDATION, 'Ingresa tu contraseña.', { details: { field: 'password' } }),
    );
  }

  const auth = getFirebaseAuth();
  if (!auth.ok) return auth;

  try {
    const credential = await signInWithEmailAndPassword(auth.value, email.value, input.password);
    return ok(toSessionUser(credential.user) as SessionUser);
  } catch (error) {
    console.error('[Firebase Auth] signInWithEmail failed:', error);
    return fail(mapFirebaseError(error));
  }
}

/**
 * Inicia sesión con Google.
 * Crea automáticamente el perfil en Firestore si es el primer inicio de sesión.
 */
export async function signInWithGoogle(): Promise<Result<SessionUser>> {
  const auth = getFirebaseAuth();
  if (!auth.ok) return auth;

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const credential = await signInWithPopup(auth.value, provider);
    const sessionUser = toSessionUser(credential.user) as SessionUser;

    // Crear/obtener perfil en Firestore
    await ensureUserProfile(sessionUser.uid, {
      email: sessionUser.email,
      displayName: sessionUser.displayName || credential.user.displayName || 'Usuario',
    });

    return ok(sessionUser);
  } catch (error) {
    console.error('[Firebase Auth] signInWithGoogle failed:', error);
    return fail(mapFirebaseError(error));
  }
}

export async function requestPasswordReset(emailInput: unknown): Promise<Result<true>> {
  const email = validateEmail(emailInput);
  if (!email.ok) return email;

  const auth = getFirebaseAuth();
  if (!auth.ok) return auth;

  try {
    await sendPasswordResetEmail(auth.value, email.value);
    return ok(true);
  } catch (error) {
    console.error('[Firebase Auth] requestPasswordReset failed:', error);
    return fail(mapFirebaseError(error));
  }
}

export async function endSession(): Promise<Result<null>> {
  const auth = getFirebaseAuth();
  if (!auth.ok) return auth;

  try {
    await signOut(auth.value);
    return ok(null);
  } catch (error) {
    console.error('[Firebase Auth] endSession failed:', error);
    return fail(mapFirebaseError(error));
  }
}
