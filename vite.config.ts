import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true, // reachable from a phone on the same network: http://<laptop-ip>:5173/worker.html
    proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 8787}`, changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      input: { console: resolve(root, 'index.html'), worker: resolve(root, 'worker.html') },
    },
  },
});
