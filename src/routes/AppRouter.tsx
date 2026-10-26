import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Suspense, lazy } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/contexts/AuthContext';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import HistoriaProyecto from '@/pages/HistoriaProyecto';
import NotFoundPage from '@/pages/NotFoundPage';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { paths } from '@/routes/paths';

// Lazy load del Dashboard para code-splitting
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));

// Lazy load del Simulador para code-splitting
const SimuladorPage = lazy(() => import('@/pages/SimuladorInmersivo'));

// Wrapper para el Dashboard con Suspense
const DashboardWrapper = () => (
  <Suspense
    fallback={
      <div className="shell py-20 text-center">
        <div className="mx-auto h-8 w-32 animate-pulse rounded bg-ink-800" />
      </div>
    }
  >
    <DashboardPage />
  </Suspense>
);

// Wrapper para el Simulador con Suspense
const SimuladorWrapper = () => (
  <Suspense
    fallback={
      <div className="shell py-20 text-center">
        <div className="mx-auto h-8 w-32 animate-pulse rounded bg-ink-800" />
      </div>
    }
  >
    <SimuladorPage />
  </Suspense>
);

const router = createBrowserRouter([
  {
    path: paths.home,
    element: (
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    ),
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: paths.historia,
        element: <HistoriaProyecto />,
      },
      {
        path: paths.login,
        element: <LoginPage />,
      },
      {
        path: paths.simulador,
        element: <ProtectedRoute />,
        children: [
          {
            index: true,
            element: <SimuladorWrapper />,
          },
        ],
      },
      {
        path: paths.panel,
        element: <ProtectedRoute />,
        children: [
          {
            index: true,
            element: <DashboardWrapper />,
          },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
