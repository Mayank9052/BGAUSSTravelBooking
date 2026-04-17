// vite.config.ts
// Added /uploads proxy so bill images/PDFs load correctly in dev (localhost:5173)
// In production (IIS) everything is on the same origin so no proxy needed.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target:       'https://localhost:7136',   // ← updated to match actual backend port
        changeOrigin: true,
        secure:       false,  // Accept self-signed cert in dev
        timeout:      120000,
        proxyTimeout: 120000,
      },
      '/hubs': {
        target:       'https://localhost:7136',   // ← updated to match actual backend port
        changeOrigin: true,
        secure:       false,  // Accept self-signed cert in dev
        ws:           true,
      },
      // ── KEY FIX: proxy /uploads so bill images load in dev ────────────────
      // Without this, Vite serves /uploads from its own static folder (not found).
      // With this, /uploads/bills/uuid.png → http://localhost:5136/uploads/bills/...
      '/uploads': {
        target:       'https://localhost:7136',
        changeOrigin: true,
        secure:       false,
      },
    },
  },

  build: {
    // Output to wwwroot so ASP.NET Core's MapFallbackToFile serves index.html
    outDir: '../BgaussTravel.API/wwwroot',
    emptyOutDir: true,
    sourcemap: false,
  },
})