/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** `true` or `false`; unset means on in development and off in a production build. */
  readonly VITE_REQUIRE_SESSION?: string
  /** `false` hides the labelled prototype screens of unfinished modules (docs/MOCK_DATA_POLICY.md). Unset shows them. */
  readonly VITE_FAWTIR_DEMO_MODULES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}
