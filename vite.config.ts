/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  // The empty prefix lets the dev server read FAWTIR_API_ORIGIN from `.env.local` as well as
  // the shell. Only VITE_-prefixed values are ever bundled, so this one stays server-side.
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * Development and preview only; a production build is served behind an edge that already
   * routes `/api`. The gateway rather than core, because the gateway is what a browser reaches
   * everywhere else and it applies the pre-auth rate limits a frontend should be developed
   * against.
   */
  const apiProxy = {
    '/api': {
      target: env.FAWTIR_API_ORIGIN || 'http://localhost:8080',
      // Host and Origin stay the dev server's, so the browser's request is same-origin end to
      // end. Rewriting Host alone would turn every call into a cross-origin one that the
      // gateway's CORS allow-list and the portal CSRF origin check then refuse.
      changeOrigin: false,
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: { proxy: apiProxy },
    preview: { proxy: apiProxy },
    test: {
      environment: 'jsdom',
      // Lets Testing Library register its automatic cleanup; tests still import explicitly.
      globals: true,
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
      // Form tests type through real inputs; the first in a file also pays jsdom and i18n
      // warm-up and took up to 5.6 s under parallel load — too close to vitest's 5 s default.
      testTimeout: 15_000,
    },
  }
})
