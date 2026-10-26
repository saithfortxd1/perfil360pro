/**
 * Taxonomía de errores de la aplicación.
 * Toda capa de servicio devuelve `Result` con un `AppError`; nunca lanza
 * excepciones hacia la UI sin clasificar.
 */
export const ErrorCode = {
  CONFIG: 'CONFIG_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  AUTH: 'AUTH_ERROR',
  PERMISSION: 'PERMISSION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT_ERROR',
  NETWORK: 'NETWORK_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_ERROR',
  INTERNAL: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly retryable: boolean;

  constructor(
    code: ErrorCodeValue,
    message: string,
    options: { cause?: unknown; details?: Record<string, unknown>; retryable?: boolean } = {},
  ) {
    super(message, options.cause instanceof Error ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.details = options.details ?? null;
    this.retryable = options.retryable === true;
  }
}

export function toAppError(error: unknown, fallbackCode: ErrorCodeValue = ErrorCode.INTERNAL): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError(fallbackCode, 'Se produjo un error inesperado.', { cause: error });
  }
  return new AppError(fallbackCode, 'Se produjo un error inesperado.', {
    details: { raw: String(error) },
  });
}

const FIREBASE_ERROR_MAP: Readonly<Record<string, readonly [ErrorCodeValue, string]>> = {
  'auth/invalid-email': [ErrorCode.VALIDATION, 'El correo no tiene un formato válido.'],
  'auth/missing-password': [ErrorCode.VALIDATION, 'Ingresa tu contraseña.'],
  'auth/weak-password': [ErrorCode.VALIDATION, 'La contraseña es demasiado débil.'],
  'auth/email-already-in-use': [ErrorCode.CONFLICT, 'Ese correo ya está registrado.'],
  'auth/invalid-credential': [ErrorCode.AUTH, 'Credenciales incorrectas.'],
  'auth/user-not-found': [ErrorCode.AUTH, 'Credenciales incorrectas.'],
  'auth/wrong-password': [ErrorCode.AUTH, 'Credenciales incorrectas.'],
  'auth/too-many-requests': [ErrorCode.RATE_LIMIT, 'Demasiados intentos. Prueba más tarde.'],
  'auth/network-request-failed': [ErrorCode.NETWORK, 'Sin conexión. Revisa tu red.'],
  'auth/user-disabled': [ErrorCode.PERMISSION, 'Esta cuenta está deshabilitada.'],
  'auth/requires-recent-login': [ErrorCode.AUTH, 'Vuelve a iniciar sesión para continuar.'],
  'permission-denied': [ErrorCode.PERMISSION, 'No tienes permisos para esta operación.'],
  'not-found': [ErrorCode.NOT_FOUND, 'No se encontró el recurso solicitado.'],
  unavailable: [ErrorCode.NETWORK, 'Servicio no disponible. Intenta de nuevo.'],
  'resource-exhausted': [ErrorCode.RATE_LIMIT, 'Límite de uso alcanzado. Intenta más tarde.'],
  unauthenticated: [ErrorCode.AUTH, 'Debes iniciar sesión.'],
};

export function mapFirebaseError(error: unknown): AppError {
  const rawCode =
    typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  const mapped = FIREBASE_ERROR_MAP[rawCode];
  if (mapped !== undefined) {
    return new AppError(mapped[0], mapped[1], { cause: error, details: { firebaseCode: rawCode } });
  }
  return toAppError(error);
}
