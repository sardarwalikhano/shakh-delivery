import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        id: '/',
        name: 'SHAKH Delivery',
        short_name: 'SHAKH',
        description: 'SHAKH Delivery — Kurdish-first commerce and delivery platform.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0B1220',
        background_color: '#F7F8FA',
        orientation: 'portrait-primary',
        lang: 'ku-Arab',
        dir: 'rtl',
        categories: ['shopping', 'business', 'travel'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        shortcuts: [
          { name: 'گەڕان', short_name: 'گەڕان', url: '/search', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'سەبەتە', short_name: 'سەبەتە', url: '/cart', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'داواکارییەکانم', short_name: 'داواکاری', url: '/orders', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }] }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'font-cache', expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 } }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: { '@': '/src' }
  }
});
