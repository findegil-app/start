import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages sirve el proyecto en https://<owner>.github.io/<repo>/
const base = process.env.BASE_PATH ?? '/start/'

export default defineConfig({
  base,
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
        theme_color: '#9f1d20',
        background_color: '#faf7f2',
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
})
