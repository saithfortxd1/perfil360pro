import { Link } from 'react-router-dom';

import { BrandMark } from '@/components/ui/BrandMark';
import { paths } from '@/routes/paths';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-ink-700/80 bg-ink-900/60">
      <div className="shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <BrandMark />
          <p className="mt-4 max-w-sm text-sm text-mist-400">
            Una lectura de 360 grados sobre tu perfil profesional: qué comunicas hoy, qué falta por
            completar y qué puedes mejorar.
          </p>
        </div>

        <nav aria-label="Navegación del pie">
          <h2 className="meta-label">Navegación</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link className="text-mist-300 transition-colors hover:text-signal-300" to={paths.home}>
                Inicio
              </Link>
            </li>
            <li>
              <Link className="text-mist-300 transition-colors hover:text-signal-300" to={paths.historia}>
                Historia del proyecto
              </Link>
            </li>
            <li>
              <Link className="text-mist-300 transition-colors hover:text-signal-300" to={paths.panel}>
                Panel de perfil
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="meta-label">Estado del proyecto</h2>
          <ul className="mt-4 space-y-2 text-sm text-mist-400">
            <li>Base técnica y sistema visual: completos</li>
            <li>Firebase Authentication y Firestore: preparados</li>
            <li>Credenciales y despliegue: pendientes</li>
          </ul>
        </div>
      </div>

      <div className="hairline" />

      <div className="shell flex flex-col gap-2 py-6 text-xs text-mist-500 sm:flex-row sm:items-center sm:justify-between">
        <p>Perfil 360 AI · proyecto {import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || 'perfil360-8c837'}</p>
        <p>Interfaz accesible, con soporte para movimiento reducido.</p>
      </div>
    </footer>
  );
}
