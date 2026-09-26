import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv, type UserConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { sealToken, type Vault } from './src/lib/vault.ts'

// GitHub Pages sirve el proyecto en https://<owner>.github.io/<repo>/
const base = process.env.BASE_PATH ?? '/start/'

/**
 * Cifra el token de GitHub para el bundle. Nunca se escribe en el repo: llega por variables de entorno
 * (secretos de GitHub Actions en CI, o .env.local en desarrollo):
 *   NOTES_TOKEN       fine-grained PAT con Contents R/W sobre el repo de notas
 *   NOTES_GOOGLE_SUB  id interno de la cuenta de Google (la app lo muestra si falta)
 *   NOTES_EMAIL       cuenta a la que pertenece (por defecto pablo.llorente@nfq.es)
 */
async function buildVault(env: Record<string, string>): Promise<Vault> {
  const token = env.NOTES_TOKEN?.trim()
  const sub = env.NOTES_GOOGLE_SUB?.trim()
  const email = (env.NOTES_EMAIL || 'pablo.llorente@nfq.es').trim().toLowerCase()
  if (!token || !sub) {
    console.warn('[findegil] NOTES_TOKEN / NOTES_GOOGLE_SUB no definidos: el build no incluye acceso a las notas')
    return {}
  }
  return { [email]: await sealToken(token, sub, email) }
}

export default defineConfig(async ({ mode }): Promise<UserConfig> => ({
  base,
  define: {
    __FINDEGIL_VAULT__: JSON.stringify(await buildVault(loadEnv(mode, process.cwd(), ''))),
  },
  build: { target: 'es2022' },
  worker: { format: 'es' },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Findegil',
        short_name: 'Findegil',
        description: 'Notas local-first respaldadas en un repositorio privado de GitHub',
        lang: 'es',
        theme_color: '#14182b',
        background_color: '#14182b',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache (Cache-First) de todo el shell: HTML, JS (incluido el worker de sync), CSS e iconos.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // La API de GitHub nunca se cachea en el SW: los datos viven en IndexedDB.
        runtimeCaching: [],
      },
    }),
  ],
}))
