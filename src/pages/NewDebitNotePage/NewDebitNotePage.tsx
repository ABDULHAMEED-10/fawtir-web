import { SalesNotePage } from '../NewCreditNotePage/SalesNotePage'

/** Income › New debit note, from an issued invoice (`?invoice=<id>`), or a draft reopened (`/:id/edit`). */
export function NewDebitNotePage() {
  return <SalesNotePage kind="DEBIT_NOTE" />
}
