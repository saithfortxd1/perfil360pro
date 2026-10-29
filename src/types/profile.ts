export type ProfileLevel = 'inicial' | 'en_desarrollo' | 'solido' | 'destacado';

export type UserRole = 'candidate' | 'recruiter' | 'admin';

/** Datos que el usuario introduce y que se validan antes de salir del cliente. */
export interface ProfileDraft {
  fullName: string;
  headline: string;
  bio: string;
  goal: string;
  education?: string;
  skills: string[];
  yearsOfExperience: number;
}

/** Documento persistido: `ProfileDraft` + metadatos de versión y tiempo. */
export interface StoredProfile extends ProfileDraft {
  readonly schemaVersion: number;
  readonly updatedAtMs: number;
}

export interface ProfileScore {
  readonly score: number;
  readonly level: ProfileLevel;
  readonly breakdown: {
    readonly completeness: number;
    readonly experienceBonus: number;
  };
}

export interface ProfileAnalysis {
  readonly score: ProfileScore;
  readonly recommendations: readonly string[];
}

export interface SessionUser {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly photoURL?: string | null;
  readonly emailVerified: boolean;
}

/** Perfil de usuario en Firestore (colección users/{uid}) */
export interface UserProfile {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly createdAt: unknown; // serverTimestamp
  readonly updatedAt: unknown; // serverTimestamp
  readonly skills: string[];
  readonly experience: unknown[]; // placeholder para futuras entradas de experiencia
  // Campos del perfil profesional (persistidos en users/{uid})
  readonly fullName?: string;
  readonly headline?: string;
  readonly bio?: string;
  readonly goal?: string;
  readonly yearsOfExperience?: number;
}

/** Datos combinados de autenticación + perfil para la UI */
export interface AuthUserData {
  readonly user: SessionUser | null;
  readonly profile: UserProfile | null;
  readonly loading: boolean;
  readonly profileLoading: boolean;
  readonly error: Error | null;
}
