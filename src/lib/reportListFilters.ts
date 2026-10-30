/**
 * The filters a Reports › Lists dataset takes, in words. The catalogue names them by their query
 * parameters (`ListsCatalogue.Dataset.parameters` on the server), which the card printed as they
 * came: "Filters: state, type, customer_id, from, to" (NEW-2).
 *
 * `from` and `to` are one filter to the reader, the period, so they share a label; so do `q` and
 * `search`, and `state` and `status`. A label is listed once, in the order it first appears.
 */
const PARAMETER_LABELS: Record<string, string> = {
  from: 'period',
  to: 'period',
  state: 'status',
  status: 'status',
  type: 'type',
  customer_id: 'customer',
  search: 'search',
  q: 'search',
  filter: 'workflowStage',
  direction: 'direction',
  document_kind: 'documentKind',
  invoice_number: 'invoiceNumber',
  tax_year: 'taxYear',
  tdd_status: 'tddStatus',
}

/** An i18n key under `reports.lists.parameter`, or the server's own name for one it does not know. */
export type ListFilterLabel = { key: string } | { text: string }

export function listFilterLabels(parameters: readonly string[]): ListFilterLabel[] {
  const seen = new Set<string>()
  const labels: ListFilterLabel[] = []
  for (const parameter of parameters) {
    // Object.hasOwn, not `in`: a parameter named "constructor" is not a label (ownPropertyLookups).
    const label: ListFilterLabel = Object.hasOwn(PARAMETER_LABELS, parameter)
      ? { key: `reports.lists.parameter.${PARAMETER_LABELS[parameter]}` }
      : { text: parameter }
    const id = 'key' in label ? label.key : `\u0000${label.text}`
    if (seen.has(id)) continue
    seen.add(id)
    labels.push(label)
  }
  return labels
}
