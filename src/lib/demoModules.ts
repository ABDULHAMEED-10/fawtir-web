/**
 * Prototype screens of modules with no server yet (POS, stock, trade documents, console
 * operations…) draw sample records. Owner decision 2026-10-08: they stay visible while their
 * modules are built, always under the sample-data ribbon, so nobody reads them as the company's
 * own. A build can hide them with the literal `false`. A failed request never decides this: there
 * is no sample fallback for a screen that has a server. See docs/MOCK_DATA_POLICY.md.
 */
export function demoModulesEnabled(): boolean {
  return import.meta.env.VITE_FAWTIR_DEMO_MODULES !== 'false'
}
