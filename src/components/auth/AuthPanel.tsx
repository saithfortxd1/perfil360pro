import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { Panel } from '@/components/ui/Panel';
import { BrandMark } from '@/components/ui/BrandMark';
import { requestPasswordReset, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/services/firebase/auth';

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
      setError(error instanceof Error ? error.message : 'Error inesperado');
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

  const handlePasswordReset = async () => {
    const result = await requestPasswordReset(email);
    setError(result.ok ? 'Te enviamos un enlace para restablecer la contraseña.' : result.error.message);
  };

  return (
    <Panel className="p-6 sm:p-8 max-w-md mx-auto">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-2">
          <BrandMark className="size-10" />
          <span className="text-xl font-bold text-mist-100">Perfil 360 AI</span>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-mist-100">
          {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        </h2>
        <p className="mt-2 text-sm text-mist-400 max-w-xs">
          {mode === 'login'
            ? 'Ingresa tus credenciales para acceder a tu perfil y análisis.'
            : 'Crea tu cuenta para comenzar a crear tu Perfil 360 AI.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === 'register' && (
          <div>
            <label htmlFor="fullName" className="block text-xs font-medium text-mist-300">
              Nombre completo
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan Pérez"
              className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
            />
          </div>
        )}
        <div className={mode === 'login' ? 'mt-4' : 'mt-0'}>
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
            className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
          />
          <div className="mt-4">
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
              className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800/80 px-3.5 py-2.5 text-sm text-mist-100 focus:border-signal-400 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-ember-500/40 bg-ember-500/10 p-3 text-sm text-ember-400">
            {error}
          </div>
        )}

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

          {mode === 'login' ? (
            <div className="mt-4 flex items-center justify-between text-xs text-mist-500">
              <button type="button" onClick={handlePasswordReset} className="cursor-pointer hover:text-signal-300">
                ¿Olvidaste tu contraseña?
              </button>
              <span className="mx-2 text-mist-600">│</span>
              <button type="button" onClick={handleToggleMode} className="cursor-pointer text-signal-300 hover:underline">
                Crear una cuenta
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-mist-500">
              <span className="cursor-pointer text-mist-500 hover:text-signal-300">¿Ya tienes cuenta?</span>
              <button
                type="button"
                onClick={handleToggleMode}
                className="flex items-center gap-1 text-mist-300 hover:text-mist-300 text-sm font-medium transition-colors"
              >
                Iniciar sesión
                <ArrowRight className="size-3.5 ml-1" />
              </button>
            </div>
          )}
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
    </Panel>
  );
}
