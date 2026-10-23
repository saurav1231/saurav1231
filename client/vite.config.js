import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development, /api calls are forwarded to the Express server.
    proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' },
  },
  build: {
    // three.js is ~1 MB but is lazy-loaded only for the 3D hero.
    chunkSizeWarningLimit: 1500,
  },
});
