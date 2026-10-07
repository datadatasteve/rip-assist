import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://datadatasteve.github.io/rip-assist/ — same base locally so
// paths, the service worker scope and OAuth redirects behave identically.
export default defineConfig({
  base: '/rip-assist/',
  plugins: [react()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1200 },
})
