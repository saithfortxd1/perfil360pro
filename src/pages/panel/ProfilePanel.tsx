import { useCallback, useEffect, useState } from 'react';

import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { profileService } from '@/services/profileService';
import type { ProfileDraft } from '@/types/profile';

export interface ProfilePanelProps {
  user: { uid: string; email: string; displayName: string; emailVerified: boolean };
  initialProfile?: Partial<ProfileDraft>;
}

export function ProfilePanel({ user, initialProfile }: ProfilePanelProps) {
  const [formData, setFormData] = useState({
    fullName: initialProfile?.fullName || user.displayName || '',
    headline: initialProfile?.headline || '',
    bio: initialProfile?.bio || '',
    goal: initialProfile?.goal || '',
    skills: (initialProfile?.skills || []).join(', '),
    yearsOfExperience: String(initialProfile?.yearsOfExperience || 0),
  });
  const [busy, setBusy] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(async (isActive: () => boolean = () => true) => {
    setLoadingProfile(true);
    setProfileLoadFailed(false);
    setError(null);

    try {
      const result = await profileService.load(user.uid);
      if (!isActive()) return;
      if (!result.ok) {
        setProfileLoadFailed(true);
        setError(result.error.message);
        return;
      }

      if (result.value) {
        setFormData({
          fullName: result.value.fullName,
          headline: result.value.headline,
          bio: result.value.bio,
          goal: result.value.goal,
          skills: result.value.skills.join(', '),
          yearsOfExperience: String(result.value.yearsOfExperience),
        });
      }
    } catch (loadError) {
      if (!isActive()) return;
      setProfileLoadFailed(true);
      setError(loadError instanceof Error ? loadError.message : 'Error al cargar el perfil guardado.');
    } finally {
      if (isActive()) setLoadingProfile(false);
    }
  }, [user.uid]);

  useEffect(() => {
    let active = true;
    void loadProfile(() => active);
    return () => {
      active = false;
    };
  }, [loadProfile]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const profileData = {
      fullName: formData.fullName.trim(),
      headline: formData.headline.trim(),
      bio: formData.bio.trim(),
      goal: formData.goal.trim(),
      skills: formData.skills.split(',').map((s) => s.trim()).filter(Boolean),
      yearsOfExperience: parseInt(formData.yearsOfExperience, 10) || 0,
    };

    try {
      const result = await profileService.save(user.uid, profileData);
      if (result.ok) {
        setSuccess('Perfil guardado correctamente.');
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al guardar el perfil');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-mist-100">Mi Perfil</h2>
        <Badge variant="inicial">{formData.skills.split(',').filter((skill) => skill.trim()).length} habilidades</Badge>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-ember-500/40 bg-ember-500/10 p-3 text-sm text-ember-400">
          {error}
        </p>
      )}
      {profileLoadFailed ? (
        <button type="button" onClick={() => void loadProfile()} className="mt-3 text-sm text-signal-300 hover:underline">
          Reintentar carga del perfil
        </button>
      ) : null}
      {success && (
        <p role="status" className="mt-4 rounded-md border border-signal-400/40 bg-signal-400/10 p-3 text-sm text-signal-300">
          {success}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid gap-4">
          <div>
            <label htmlFor="fullName" className="block text-xs font-medium text-mist-300">
              Nombre completo
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="María García"
              className="w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="headline" className="block text-xs font-medium text-mist-300">
              Titular profesional
            </label>
            <input
              id="headline"
              type="text"
              value={formData.headline}
              onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
              placeholder="Ingeniera de datos senior"
              className="w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="bio" className="block text-xs font-medium text-mist-300">
              Biografía / Resumen
            </label>
            <textarea
              id="bio"
              rows={3}
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Resumen de tu experiencia y especialidades..."
              className="w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="goal" className="block text-xs font-medium text-mist-300">
              Objetivo profesional
            </label>
            <input
              id="goal"
              type="text"
              value={formData.goal}
              onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
              placeholder="Quiero analizar mi perfil para... (opcional)"
              className="w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid gap-4">
          <div>
            <label htmlFor="skills" className="block text-xs font-medium text-mist-300">
              Habilidades (separadas por comas)
            </label>
            <input
              id="skills"
              type="text"
              value={formData.skills}
              onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
              placeholder="React, TypeScript, Firebase..."
              className="w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="yearsOfExperience" className="block text-xs font-medium text-mist-300">
              Años de experiencia
            </label>
            <input
              id="yearsOfExperience"
              type="number"
              min={0}
              max={60}
              value={formData.yearsOfExperience}
              onChange={(e) => setFormData({ ...formData, yearsOfExperience: e.target.value })}
              className="w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={busy || loadingProfile || profileLoadFailed}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-signal-400 px-4 py-2.5 text-sm font-semibold text-ink-950 hover:bg-signal-400/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && (
              <svg className="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="text-signal-400" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12c0 2.63 1.018 4.987 2.655 6.915z"></path>
              </svg>
            )}
              <span>Guardar perfil</span>
            </button>
        </div>
      </form>
      </Panel>
  );
}
