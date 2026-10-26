import { AppError, toAppError, type ErrorCodeValue } from '@/lib/errors';

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = (error: AppError): Result<never> => ({ ok: false, error: toAppError(error) });

/** Crea un `Result` fallido con código clasificado y mensaje apto para el usuario. */
export const failWith = (
  code: ErrorCodeValue,
  message: string,
  details?: Record<string, unknown>,
): Result<never> => ({ ok: false, error: new AppError(code, message, details ? { details } : {}) });

/** Ejecuta código síncrono que puede lanzar y lo convierte en `Result`. */
export function attempt<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (error) {
    return fail(toAppError(error));
  }
}

/** Ejecuta una promesa y la convierte en `Result`, capturando el rechazo. */
export async function attemptAsync<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return ok(await promise);
  } catch (error) {
    return fail(toAppError(error));
  }
}
