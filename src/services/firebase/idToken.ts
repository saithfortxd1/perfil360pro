import { getFirebaseAuth } from '@/services/firebase/firebase';

/**
 * Devuelve el ID token de Firebase del usuario actual, o `null` si no hay sesión.
 * Espera a que Auth termine de hidratar la sesión persistida antes de leer `currentUser`.
 */
export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth.ok) return null;

  try {
    await auth.value.authStateReady();
  } catch {
    return null;
  }

  const user = auth.value.currentUser;
  if (!user) return null;

  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}