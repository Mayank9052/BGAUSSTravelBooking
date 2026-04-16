// vite.config.ts
// Proxy is ONLY used during local dev (npm run dev).
// In production (npm run build), Vite removes all proxy config —
// the built JS files use relative /api paths, which IIS handles directly.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    open: true,
    proxy: {
      // Dev only: forwards /api to the .NET dev server
      // In production this block is irrelevant — it's never included in the build
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
    },
  },

  build: {
    // Output to wwwroot so ASP.NET Core's MapFallbackToFile serves index.html
    outDir: '../BgaussTravel.API/wwwroot',
    emptyOutDir: true,
    sourcemap: false,
  },
})