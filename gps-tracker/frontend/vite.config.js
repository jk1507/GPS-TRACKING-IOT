import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies REST + WebSocket traffic to the backend so the
// browser always talks to a single origin (no CORS headaches in development).
// In production set VITE_API_URL to the deployed backend instead.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
