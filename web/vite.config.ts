import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The API base URL is read from VITE_API_URL, which Vite inlines at BUILD
 * time — which is why compose.yaml passes it as a build arg to the web image
 * rather than as a runtime environment variable.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
