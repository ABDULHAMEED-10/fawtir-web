/**
 * Prototype screens of modules with no server yet (POS, stock, trade documents, console
 * operations…) draw sample records. The owner keeps them for design and development, so they are
 * shown only when a build opts in explicitly with the literal `true`, never by default and never
 * because a request failed. See docs/MOCK_DATA_POLICY.md.
 */
export function demoModulesEnabled(): boolean {
  return import.meta.env.VITE_FAWTIR_DEMO_MODULES === 'true'
}
