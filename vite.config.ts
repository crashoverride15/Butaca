import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' so the build works from the GitHub Pages subpath.
// The service worker caches the app shell only: API answers never go through it, they live in IndexedDB.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.webmanifest is used as is (it also works in dev)
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // typography only (not an API): so letters look the same offline
          { urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com', handler: 'StaleWhileRevalidate', options: { cacheName: 'google-fonts-css' } },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
});
