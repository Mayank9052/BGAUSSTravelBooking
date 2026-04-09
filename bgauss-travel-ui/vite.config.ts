import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'https://localhost:7136',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        proxyTimeout: 120000
      }
    }
  }
})