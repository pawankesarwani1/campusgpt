import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The desktop app ships its files locally; a service worker there would
      // only risk serving stale cached assets after an app update.
      disable: process.env.BUILD_TARGET === 'electron',
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'CampusGPT — AI Study Assistant',
        short_name: 'CampusGPT',
        description: 'AI study assistant for Anna University students — notes, 13-mark answers, PYQ prediction, and exam practice.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the app shell (built static assets) so it opens instantly and
        // works offline. API calls to the backend are a different origin and
        // are NOT cached, so data is always fresh.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      // Keep the service worker off during local dev to avoid stale caching.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    // Don't watch Electron build output: files there get locked mid-build,
    // which crashes the dev server (EBUSY) and triggers pointless reloads.
    watch: { ignored: ['**/release/**', '**/dist/**'] },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
