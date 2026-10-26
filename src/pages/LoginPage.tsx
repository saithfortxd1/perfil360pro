import { useNavigate } from 'react-router-dom';
import { PageIntro } from '@/components/layout/PageIntro';
import { Reveal } from '@/components/animations/Reveal';
import { AuthPanel } from '@/pages/panel/AuthPanel';
import { paths } from '@/routes/paths';

export default function LoginPage() {
  const navigate = useNavigate();

  return (
    <div className="shell py-12 sm:py-16">
      <PageIntro
        index="01"
        kicker="Autenticación"
        title="Acceso al Panel de Perfil 360"
        lead="Inicia sesión o crea una cuenta para estructurar, puntuar y guardar tu perfil profesional."
      />
      <div className="mt-10">
        <Reveal y={16}>
          <AuthPanel onSuccess={() => navigate(paths.panel)} />
        </Reveal>
      </div>
    </div>
  );
}