import { SalesNotePage } from './SalesNotePage'

/**
 * Income › Self-billed › a self-billed credit note (IBT-003 261), in the credit-note composer
 * (decision D6): from an issued self-billed invoice (`?invoice=<id>`), or a draft reopened
 * (`/:id/edit`).
 */
export function NewSelfBilledCreditNotePage() {
  return <SalesNotePage kind="CREDIT_NOTE" selfBilled />
}
