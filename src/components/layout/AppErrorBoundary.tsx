import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Frontera de error de nivel raíz. Evita la pantalla en blanco y ofrece una
 * salida navegable sin exponer detalles técnicos al usuario.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('[perfil360] error no controlado', error, info.componentStack);
    }
  }

  override render(): ReactNode {
    const { error } = this.state;

    if (error === null) return this.props.children;

    return (
      <div className="shell flex min-h-dvh items-center py-20">
        <div className="panel panel--ticks w-full max-w-xl p-8" role="alert">
          <p className="meta-label">Error inesperado</p>
          <h1 className="mt-3 text-display-sm">Algo se rompió en la interfaz</h1>
          <p className="mt-3 text-mist-300">
            La aplicación no pudo continuar. Recarga la página para volver a intentarlo; si el problema
            persiste, revisa la consola del navegador.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex min-h-11 items-center rounded-md bg-signal-400 px-5 text-sm font-medium text-ink-950"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    );
  }
}
