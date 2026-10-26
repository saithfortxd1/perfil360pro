import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const requiredFirebaseBuildVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const missingFirebaseVariables = requiredFirebaseBuildVariables.filter((name) => !env[name]?.trim());

  if (mode === 'production' && missingFirebaseVariables.length > 0) {
    throw new Error(
      `Faltan variables Firebase requeridas para compilar el frontend: ${missingFirebaseVariables.join(', ')}. ` +
      'Configúralas en Netlify con scope de Builds y contexto Production antes de desplegar.',
    );
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
    server: {
      port: 5173,
      strictPort: false,
    },
  };
});
