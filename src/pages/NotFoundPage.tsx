import { ArrowLeft, FileQuestion } from 'lucide-react';

import { Reveal } from '@/components/animations/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { paths } from '@/routes/paths';

export default function NotFoundPage() {
  return (
    <div className="shell flex min-h-[60dvh] items-center py-20">
      <Reveal y={16} className="mx-auto w-full max-w-lg">
        <Panel ticks className="p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-md border border-ember-500/30 bg-ember-500/10 text-ember-400">
            <FileQuestion className="size-6" />
          </span>

          <p className="meta-label mt-4 text-ember-400">Error 404</p>
          <h1 className="mt-2 text-2xl font-semibold text-mist-50">Página no encontrada</h1>
          <p className="mt-2 text-sm text-mist-400">
            La ruta que intentas consultar no existe o ha sido movida.
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <ButtonLink to={paths.home} size="md">
              <ArrowLeft className="size-4" />
              <span>Volver al inicio</span>
            </ButtonLink>
          </div>
        </Panel>
      </Reveal>
    </div>
  );
}
