import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { paths } from '@/routes/paths';

/** Restablece la posición de lectura al cambiar de ruta (sin animación). */
function RouteScrollReset() {
  const { pathname } = useLocation();

  useEffect(() => {
    globalThis.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

export function AppShell() {
  const { pathname } = useLocation();
  const isDashboard = pathname === paths.panel;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-signal-400 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-950"
      >
        Saltar al contenido principal
      </a>

      <RouteScrollReset />
      {!isDashboard ? <SiteHeader /> : null}

      <main id="contenido-principal" tabIndex={-1} className="flex-1 focus-visible:outline-none">
        <Outlet />
      </main>

      {!isDashboard ? <SiteFooter /> : null}
    </div>
  );
}
