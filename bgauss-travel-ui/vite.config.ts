import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      "/api": {
        target: "https://localhost:7136", // ⚠️ CHANGE to your backend URL
        changeOrigin: true,
        secure: false
      }
    }
  }
})