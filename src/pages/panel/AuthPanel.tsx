import { useState } from 'react';

import { Panel } from '@/components/ui/Panel';
import { BrandMark } from '@/components/ui/BrandMark';
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/services/firebase/auth';

type Mode = 'login' | 'register';

export interface AuthPanelProps {
  onSuccess?: () => void;
}

export function AuthPanel({ onSuccess }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (mode === 'login') {
        const result = await signInWithEmail({ email, password });
        if (result.ok) {
          onSuccess?.();
        } else {
          setError(result.error.message);
        }
      } else {
        const result = await signUpWithEmail({ email, password, fullName });
        if (result.ok) {
          onSuccess?.();
        } else {
          setError(result.error.message);
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al procesar la solicitud');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setError(null);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await signInWithGoogle();
      if (result.ok) {
        onSuccess?.();
      } else {
        setError(result.error.message);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al continuar con Google');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md mx-auto">
        <Panel className="p-6 sm:p-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BrandMark className="size-10" />
            <span className="text-xl font-bold text-mist-50">Perfil 360 AI</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-mist-100">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h2>
          <p className="mt-2 text-sm text-mist-400 max-w-md">
            {mode === 'login'
              ? 'Ingresa tus credenciales para acceder a tu perfil y análisis.'
              : 'Crea tu cuenta para comenzar a construir tu Perfil 360.'}
          </p>
          <div className="mt-6">
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'register' && (
                <div className="space-y-2">
                  <label htmlFor="fullName" className="block text-xs font-medium text-mist-300">
                    Nombre completo
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="María García"
                    className="w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
                  />
                </div>
              )}
              <div className="grid gap-3">
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-mist-300">
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@dominio.com"
                    className="w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-mist-300">
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
                  />
                </div>
              </div>
            <div className="mt-6">
              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-signal-400 px-4 py-2.5 text-sm font-semibold text-ink-950 hover:bg-signal-400/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? (
                  <>
                    <svg className="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="text-signal-400" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12c0 2.63 1.018 4.987 2.655 6.915z"></path>
                    </svg>
                    Procesando...
                  </>
                ) : (
                  <>
                    <span>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</span>
                  </>
                )}
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-mist-500 flex-wrap gap-4">
                <button
                  type="button"
                  onClick={handleToggleMode}
                  className="text-mist-500 hover:text-signal-300 hover:underline"
                >
                  {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>
              </div>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-ink-700" />
                <span className="text-xs text-mist-500">o continúa con</span>
                <span className="h-px flex-1 bg-ink-700" />
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy}
                className="flex w-full items-center justify-center gap-3 rounded-md border border-ink-600 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <img src="/google.svg" alt="" aria-hidden="true" className="size-5" />
                Continuar con Google
              </button>
            </form>
          </div>
          {error && (
            <div className="mt-3 rounded-md border border-ember-500/40 bg-ember-500/10 p-3 text-xs text-ember-400">
              {error}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
