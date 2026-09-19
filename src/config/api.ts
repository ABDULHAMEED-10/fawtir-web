// Declares `ImportMeta.env`. Needed here rather than only in `src/vite-env.d.ts` because
// `vite.config.ts` imports this module, which pulls it into the Node tsconfig project too.
/// <reference types="vite/client" />

/**
 * The one place that decides where the app's API calls go.
 *
 * Imported by both `src/api/client.ts` (the browser) and `vite.config.ts` (the dev server), so
 * the path the browser calls and the path the dev server proxies can never drift apart. Nothing
 * here may import anything else, and nothing here may read `import.meta.env` unguarded: under
 * `vite.config.ts` this module is evaluated by Node, where `import.meta.env` does not exist.
 *
 * Feature modules must not know any of this. They pass a path such as `/v1/branches` to the
 * client and stay independent of host, port, proxy and environment.
 */

/**
 * Every API call is same-origin under this prefix, in development and in production alike. The
 * backend host lives behind it — the Vite proxy locally, the Vercel rewrite in production — and
 * that is deliberate, not incidental: the portal session cookies are host-only and the CSRF
 * cookie must stay readable from the page's own origin, both of which a direct cross-origin call
 * would break.
 */
export const API_BASE_PATH = '/api'

/**
 * Where the dev server forwards {@link API_BASE_PATH} when the environment names no target.
 *
 * Deliberately the TEST backend rather than a local gateway: a developer with nothing configured
 * gets a working stack. Override it per machine — see `.env.development` for the variable names.
 */
export const DEFAULT_DEV_PROXY_TARGET = 'https://api.fawtir.om'

/**
 * The prefix the browser actually calls.
 *
 * `VITE_API_BASE_URL` exists as an escape hatch for a deployment that cannot proxy; setting it to
 * an absolute URL makes every call cross-origin, which works only if that host allow-lists this
 * origin AND the cookie contract is revisited. Leave it unset.
 *
 * Read through `?.` so this module stays importable from `vite.config.ts`, where `import.meta.env`
 * is undefined.
 */
export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || API_BASE_PATH).replace(/\/+$/, '')
