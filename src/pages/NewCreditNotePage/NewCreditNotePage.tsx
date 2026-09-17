import { SalesNotePage } from './SalesNotePage'

/** Income › New credit note, from an issued invoice (`?invoice=<id>`), or a draft reopened (`/:id/edit`). */
export function NewCreditNotePage() {
  return <SalesNotePage kind="CREDIT_NOTE" />
}
