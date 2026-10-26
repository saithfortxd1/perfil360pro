import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { paths } from '@/routes/paths';

export type AuthRole = 'candidate' | 'recruiter' | 'admin';

export interface ProtectedRouteProps {
  /** Roles permitidos para acceder a la ruta. Si no se especifica, cualquier usuario autenticado puede acceder. */
  allowedRoles?: AuthRole[];
  /** Ruta a la que redirigir si no está autenticado. Por defecto '/acceso'. */
  fallbackPath?: string;
  children?: ReactNode;
}

/**
 * Componente de protección de rutas (route guard).
 *
 * Impide el acceso a rutas protegidas si el usuario no está autenticado.
 * Si el usuario no está autenticado, lo redirige a la ruta de inicio de sesión.
 * Si se especifican `allowedRoles`, solo permite el acceso a usuarios con alguno
 * de esos roles.
 */
export function ProtectedRoute({ allowedRoles, fallbackPath = paths.login, children }: ProtectedRouteProps) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  // Mientras se carga la sesión, mostramos un estado de carga
  if (loading) {
    return (
      <div className="shell py-20 text-center">
        <div className="mx-auto h-8 w-32 animate-pulse rounded bg-ink-800" />
        <p className="mt-4 text-sm text-mist-500">Cargando sesión...</p>
      </div>
    );
  }

  // Usuario no autenticado: redirigir al login
  if (!user) {
    return <Navigate to={fallbackPath} replace state={{ from: location }} />;
  }

  // Usuario autenticado pero faltan permisos para la etapa
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.some(hasRole)) {
    return (
      <div className="shell py-20">
        <div className="mx-auto max-w-md p-8 text-center" role="alert" aria-label="Acceso no autorizado">
          <h2 className="text-lg font-semibold text-mist-50">Acceso no autorizado</h2>
          <p className="mt-2 text-sm text-mist-400">
            No tienes los permisos necesarios para acceder a esta sección.
          </p>
          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-signal-400 px-4 py-2 text-sm font-medium text-ink-950"
            onClick={() => window.history.back()}
          >
            Volver atrás
          </button>
        </div>
      </div>
    );
  }

  // Usuario autenticado con permisos: mostrar contenido
  return <>{children ?? <Outlet />}</>;
}

/**
 * Componente de protección de rutas públicas.
 * Redirige a usuarios autenticados a la ruta de destino (por defecto '/panel').
 * Útil para páginas de inicio de sesión o registro.
 */
export function PublicRoute({ fallbackPath = '/panel', children }: { fallbackPath?: string; children?: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user) {
    return <Navigate to={fallbackPath} replace state={{ from: location }} />;
  }

  return <>{children ?? <Outlet />}</>;
}