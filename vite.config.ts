import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Asteron',
        short_name: 'Asteron',
        description: 'Offline-first astronaut health monitoring. Self-support aid, not a medical device.',
        theme_color: '#08050C',
        background_color: '#08050C',
        display: 'standalone',
        start_url: '/station',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff,woff2,json,webp,jpg,glb}'], navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/media\//], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
    }),
  ],
  // Never inline assets as data: URLs: the production CSP allows fonts and images from our own origin only.
  build: { assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 120_000 },
})
