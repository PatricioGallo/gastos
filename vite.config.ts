import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages: https://patriciogallo.github.io/gastos/
  base: '/gastos/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Mis Gastos',
        short_name: 'Gastos',
        description: 'Gastos mensuales, ingresos, inflación y estadísticas',
        theme_color: '#0b0f1e',
        background_color: '#0b0f1e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/gastos/',
        scope: '/gastos/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'api.argentinadatos.com' || url.hostname === 'api.bcra.gob.ar',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'indicadores-api' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
