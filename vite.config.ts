import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app lives in ./client and is built into ./client/dist,
// which the Node server serves. `npm run dev` proxies the API to the server.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
