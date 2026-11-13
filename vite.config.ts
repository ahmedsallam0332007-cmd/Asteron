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
        theme_color: '#07060A',
        background_color: '#07060A',
        display: 'standalone',
        start_url: '/station',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2,json,webp}'], navigateFallback: '/index.html' },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
