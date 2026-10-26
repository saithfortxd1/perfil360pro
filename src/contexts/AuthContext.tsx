import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  observeSession,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  endSession,
  requestPasswordReset,
} from '@/services/firebase/auth';
import { getUserProfile, updateUserProfile } from '@/services/users/userService';
import { ensureUserProfile } from '@/services/firebase/userService';
import type { SessionUser, UserProfile } from '@/types/profile';
import { ok, type Result } from '@/lib/result';

async function getOrCreateUserProfile(user: SessionUser): Promise<Result<UserProfile>> {
  const existing = await getUserProfile(user.uid);
  if (!existing.ok) return existing;
  if (existing.value) return ok(existing.value);

  return ensureUserProfile(user.uid, {
    email: user.email,
    displayName: user.displayName || 'Usuario',
  });
}

/**
 * Contexto de autenticación de Perfil 360 AI.
 *
 * Centraliza el estado de la sesión y el perfil del usuario, exponiendo una
 * única fuente de verdad para toda la aplicación.
 */
export interface AuthContextValue {
  // Estado de autenticación
  user: SessionUser | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;

  // Acciones de autenticación
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<boolean>;

  // Acciones de perfil
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<UserProfile, 'fullName' | 'headline' | 'bio' | 'goal' | 'skills' | 'yearsOfExperience'>>) => Promise<void>;

  // Helpers
  hasRole: (role: 'candidate' | 'recruiter' | 'admin') => boolean;
  isCandidate: boolean;
  isRecruiter: boolean;
  isAdmin: boolean;
}

/**
 * Contexto de autenticación de Perfil 360 AI.
 *
 * Centraliza el estado de la sesión y el perfil de usuario para toda la
 * aplicación. Nunca expone el objeto de Firebase Auth directamente a la UI.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Proveedor de autenticación de Perfil 360 AI.
 *
 * Provee el contexto de autenticación a toda la aplicación mediante el
 * componente <AuthProvider>. Debe envolver la aplicación en el punto de
 * entrada (main.tsx) para que esté disponible en todas las rutas.
 */
export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Observa cambios en la sesión de autenticación y carga el perfil del
   * usuario cuando hay un cambio.
   */
  useEffect(() => {
    let active = true;

    const subscription = observeSession((userProfile) => {
      if (!active) return;
      setUser(userProfile);
      setLoading(false);
    });

    if (!subscription.ok) {
      setError(subscription.error.message);
      setLoading(false);
      return;
    }

    return () => {
      active = false;
      subscription.value();
    };
  }, []);

  /**
   * Carga el perfil del usuario desde Firestore cuando cambia el usuario
   * autenticado.
   */
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    let active = true;

    const loadProfile = async () => {
      setProfileLoading(true);
      setError(null);
      try {
        const result = await getOrCreateUserProfile(user);
        if (!active) return;
        if (result.ok) {
          setProfile(result.value);
        } else {
          setProfile(null);
          setError(result.error.message);
        }
      } catch (loadError) {
        if (active) {
          setProfile(null);
          setError(loadError instanceof Error ? loadError.message : 'Error inesperado al cargar el perfil.');
        }
      } finally {
        if (active) setProfileLoading(false);
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [user]);

  /**
   * Inicia sesión con correo y contraseña.
   */
  const signInWithEmailHandler = async (email: string, password: string) => {
    setError(null);
    try {
      const result = await signInWithEmail({ email, password });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setUser(result.value);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al iniciar sesión');
    }
  };

  /**
   * Registra un nuevo usuario con correo y contraseña.
   */
  const signUpWithEmailHandler = async (
    email: string,
    password: string,
    fullName: string,
  ) => {
    setError(null);
    try {
      const result = await signUpWithEmail({ email, password, fullName });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setUser(result.value);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al registrar cuenta');
    }
  };

  /**
   * Inicia sesión con Google.
   */
  const signInWithGoogleHandler = async () => {
    setError(null);
    try {
      const result = await signInWithGoogle();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setUser(result.value);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al iniciar sesión con Google');
    }
  };

  /**
   * Solicita restablecimiento de contraseña.
   */
  const requestPasswordResetHandler = async (email: string) => {
    setError(null);
    try {
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError('Se ha enviado un correo con instrucciones para restablecer tu contraseña.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al solicitar restablecimiento de contraseña');
    }
  };

  /**
   * Cierra la sesión del usuario.
   */
  const signOutHandler = async (): Promise<boolean> => {
    setError(null);
    try {
      const result = await endSession();
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      setUser(null);
      setProfile(null);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al cerrar sesión');
      return false;
    }
  };

  /**
   * Vuelve a cargar el perfil del usuario desde Firestore.
   */
  const refreshProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    setError(null);
    try {
      const result = await getOrCreateUserProfile(user);
      if (result.ok) {
        setProfile(result.value);
      } else {
        setProfile(null);
        setError(result.error.message);
      }
    } catch (loadError) {
      setProfile(null);
      setError(loadError instanceof Error ? loadError.message : 'Error inesperado al cargar el perfil.');
    } finally {
      setProfileLoading(false);
    }
  };

  /**
   * Actualiza campos del perfil del usuario autenticado.
   */
  const updateProfileHandler = async (
    updates: Partial<
      Pick<
        UserProfile,
        'fullName' | 'headline' | 'bio' | 'goal' | 'skills' | 'yearsOfExperience' | 'experience'
      >
    >,
  ) => {
    if (!user) {
      setError('No hay usuario autenticado.');
      return;
    }

    setError(null);
    try {
      const result = await updateUserProfile(user.uid, updates);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (result.value) {
        setProfile(result.value);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al actualizar el perfil');
    }
  };

  /**
   * Verifica si el usuario autenticado tiene un rol específico.
   */
  const hasRole = (role: 'candidate' | 'recruiter' | 'admin'): boolean => {
    return profile?.role === role;
  };

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    profileLoading,
    error,
    signInWithEmail: signInWithEmailHandler,
    signUpWithEmail: signUpWithEmailHandler,
    signInWithGoogle: signInWithGoogleHandler,
    requestPasswordReset: requestPasswordResetHandler,
    signOut: signOutHandler,
    refreshProfile,
    updateProfile: updateProfileHandler,
    hasRole,
    isAuthenticated: user !== null,
    isAdmin: hasRole('admin'),
    isRecruiter: hasRole('recruiter'),
    isCandidate: hasRole('candidate'),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.');
  }
  return context;
}
