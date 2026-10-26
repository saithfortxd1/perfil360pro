import { LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { paths } from '@/routes/paths';
import { AuthPanel } from '@/pages/panel/AuthPanel';
import { ProfileDashboard } from '@/pages/panel/ProfileDashboard';

export default function DashboardPage() {
  const { user, profile, loading, profileLoading, error, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async (): Promise<boolean> => {
    const signedOut = await signOut();
    if (signedOut) navigate(paths.login, { replace: true });
    return signedOut;
  };

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center bg-slate-950 text-slate-300">
        <LoaderCircle className="mr-3 size-5 animate-spin text-cyan-300" /> Cargando tu espacio…
      </div>
    );
  }

  if (!user) {
    return <AuthPanel onSuccess={() => navigate(paths.panel, { replace: true })} />;
  }

  if (profileLoading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center bg-slate-950 text-slate-300">
        <LoaderCircle className="mr-3 size-5 animate-spin text-cyan-300" /> Cargando perfil…
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center text-slate-100">
        <h1 className="text-2xl font-semibold">No se pudo cargar el perfil</h1>
        <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <ProfileDashboard
      user={user}
      role={profile?.role ?? 'candidate'}
      initialProfile={{
        fullName: profile?.fullName || profile?.displayName || user.displayName,
        headline: profile?.headline || '',
        bio: profile?.bio || '',
        goal: profile?.goal || '',
        skills: profile?.skills ?? [],
        yearsOfExperience: profile?.yearsOfExperience ?? 0,
      }}
      onSignOut={handleSignOut}
    />
  );
}
