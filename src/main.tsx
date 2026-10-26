import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppErrorBoundary } from '@/components/layout/AppErrorBoundary';
import { AppRouter } from '@/routes/AppRouter';

import '@/styles/index.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('No se encontró el nodo raíz #root en index.html.');
}

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppRouter />
    </AppErrorBoundary>
  </StrictMode>,
);
