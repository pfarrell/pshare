import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is done by hand in src/registerServiceWorker.js, gated
      // on jukebox kiosk mode — see that file for why. Without this, the
      // plugin's own auto-injected register script would run unconditionally
      // and register a service worker on kiosk devices too.
      injectRegister: false,
      manifest: {
        name: 'P·Share',
        short_name: 'P·Share',
        description: 'Personal music streaming',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        start_url: '/pshare/app/',
        scope: '/pshare/app/',
        icons: [
          {
            src: '/pshare/app/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable any',
          },
          {
            src: '/pshare/app/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // public/images is gitignored local-dev-only content (real album art
        // cached during local testing, never meant to ship) — Vite copies all
        // of public/ into dist/ verbatim, so without this it leaks into the
        // precache manifest as thousands of image URLs. deploy.sh already
        // excludes images/ from what actually gets rsynced to the server, so
        // those precached URLs 404 there — and Workbox's SW install fails
        // outright if any single precached URL fails to fetch, so the new
        // service worker version never activates. Whatever version WAS last
        // successfully installed stays in control indefinitely, serving an
        // increasingly stale app shell/JS as later deploys rsync --delete the
        // old asset files that stale shell still references.
        globIgnores: ['images/**'],
        navigateFallback: '/pshare/app/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/pshare\/stream\//,
            handler: 'NetworkOnly',
          },
          {
            // Admin endpoints are all live, mutable state (upload queue polling,
            // logs, search) for a single admin user — never serve them stale.
            urlPattern: /\/pshare\/api\/admin\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/pshare\/api\//,
            handler: 'StaleWhileRevalidate',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // jsmediatags package.json points browser field to dist/jsmediatags.js which doesn't
      // exist — only the .min.js is shipped. Point directly to the file that exists.
      'jsmediatags': 'jsmediatags/dist/jsmediatags.min.js',
    },
  },
  base: process.env.NODE_ENV === 'production' ? '/pshare/app/' : '/',
  server: {
    // Opt-in: DEV_PROD_PROXY=1 points /api and /images at production (patf.com /
    // patf.net) so the UI can be developed against the real library — used for the
    // Pi jukebox, reached at http://localhost:5173 through `ssh -R 5173:localhost:5173`
    // (localhost counts as a secure context, so prod's Secure cookies still work).
    // Default is the local backend on :3939.
    proxy: process.env.DEV_PROD_PROXY
      ? {
          '/api': {
            target: 'https://patf.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, '/pshare/api'),
            // Prod cookies are scoped to .patf.com; strip the domain so the browser
            // keeps them for the dev origin instead of discarding them.
            cookieDomainRewrite: '',
          },
          '/images': {
            target: 'https://patf.net',
            changeOrigin: true,
          },
        }
      : {
          '/api': {
            target: 'http://localhost:3939',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, '')
          }
        },
    historyApiFallback: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true,
    // Default excludes don't cover nested worktree checkouts (e.g.
    // .claude/worktrees/<name>/), which live inside this repo's directory
    // tree and have their own node_modules — without this, vitest
    // double-discovers every test file and loads two conflicting copies
    // of React.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/.worktrees/**',
      '**/worktrees/**',
      '**/.claude/worktrees/**',
      // The backend (server/) has its own test runner (node:test via tsx,
      // see server/package.json's "test" script) — its *.test.ts files
      // import node:test/node:assert, which vitest's browser-oriented
      // bundler can't resolve, so they must never be picked up here.
      '**/server/**',
    ],
  },
})
