import { getFirebaseAuth } from '@/services/firebase/firebase';

/**
 * Devuelve el ID token de Firebase del usuario actual, o `null` si no hay sesión.
 * Se usa para autenticar las llamadas a las Netlify Functions.
 */
export async function getFirebaseIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth.ok) return null;

  const user = auth.value.currentUser;
  if (!user) return null;

  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}