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

/**
 * Prototypes hidden outright, whatever the build says: no nav entry, no link or row action into
 * them, and their routes show the "not available yet" page instead of sample records. Quotations,
 * order forms and delivery notes showed another company's sample records inside a real session;
 * the owner decided to hide them until they are connected to the real API (R6, 23 Oct 2026).
 * The compliance report prototype put the company's real name and VAT number beside invented
 * figures, with Share offered, so it read as the company's own signed report; the owner decided to
 * hide it too (DA-17, 30 Oct 2026). Its route does not show the "not available yet" page: it falls
 * back to the real-only report, which keeps the real identity, numbering check and Excel export.
 * Purchase orders are not in this list: their screens read and write `/v1/purchase-orders`.
 * Take a module out of this list in the change that connects it.
 */
const HIDDEN_PROTOTYPES: ReadonlySet<string> = new Set(['tradeDocuments', 'complianceReport'])

/** Whether a prototype module is hidden outright (see HIDDEN_PROTOTYPES). */
export function prototypeHidden(module: string): boolean {
  return HIDDEN_PROTOTYPES.has(module)
}

/** Whether a prototype module's sample screens may be shown: demos on, and not hidden outright. */
export function prototypeShown(module: string): boolean {
  return demoModulesEnabled() && !prototypeHidden(module)
}
