import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 5174 avoids clashing with the SELVIA (J26) frontend on 5173.
    port: 5174,
    // The API has no CORS configuration, so the dev server forwards API calls to it.
    // Keycloak is NOT proxied: the browser must talk to Keycloak directly so SSO cookies work.
    // Set slap-frontend Web origins to http://localhost:5174 (or +) in Keycloak Admin.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
