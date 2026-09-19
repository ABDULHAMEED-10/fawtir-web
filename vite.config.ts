/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { API_BASE_PATH, DEFAULT_DEV_PROXY_TARGET } from './src/config/api'

export default defineConfig(({ mode }) => {
  // The empty prefix lets the dev server read the FAWTIR_ names from `.env.development` and
  // `.env.local` as well as the shell. Only VITE_-prefixed values are ever bundled, so these two
  // stay server-side and the backend host never reaches the browser.
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * Set only to reach a *deployed* backend, whose allow-list cannot name the dev server:
   * `deploy/contabo/deploy-contabo.sh` refuses to deploy an allow-list containing `localhost`.
   * The value must be an origin that target already allows, such as `https://www.fawtir.om`.
   */
  const proxyOrigin = env.FAWTIR_API_PROXY_ORIGIN

  /**
   * Development and preview only; a production build is served behind an edge that already
   * routes `/api`. The gateway rather than core, because the gateway is what a browser reaches
   * everywhere else and it applies the pre-auth rate limits a frontend should be developed
   * against.
   *
   * One rule for the whole API surface, keyed by the same constant the client builds its URLs
   * from, so a request the browser makes can never miss the proxy. Never per-endpoint entries.
   */
  const apiProxy = {
    [API_BASE_PATH]: {
      target: env.FAWTIR_API_ORIGIN || DEFAULT_DEV_PROXY_TARGET,
      // Host and Origin stay the dev server's, so the browser's request is same-origin end to
      // end. Rewriting Host alone would turn every call into a cross-origin one that the
      // gateway's CORS allow-list and the portal CSRF origin check then refuse.
      //
      // For a deployed target the two must move together, and neither alone will do. Node checks
      // the TLS certificate against the outgoing Host, so leaving it as `localhost` fails the
      // handshake against any real certificate (ERR_TLS_CERT_ALTNAME_INVALID); rewriting it then
      // makes the call cross-origin, which is what the explicit Origin answers. Only this hop is
      // relabelled — the browser still sees the dev server, so the session cookies stay host-only
      // on localhost and the CSRF cookie the client echoes back stays readable.
      changeOrigin: Boolean(proxyOrigin),
      ...(proxyOrigin ? { headers: { origin: proxyOrigin } } : {}),
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
