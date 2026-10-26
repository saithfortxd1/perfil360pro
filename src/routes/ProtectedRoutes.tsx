import { lazy, Suspense } from 'react';

const DashboardPageLazy = lazy(() => import('@/pages/DashboardPage'));

export function ProtectedRoutes() {
  return (
    <Suspense
      fallback={
        <div className="shell py-20 text-center">
          <div className="mx-auto h-8 w-32 animate-pulse rounded bg-ink-800" />
        </div>
      }
    >
      <DashboardPageLazy />
    </Suspense>
  );
}
