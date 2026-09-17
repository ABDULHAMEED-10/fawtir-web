import { EditCustomerForm, NewCustomerForm } from './CustomerFormPage'

/** `/customers/new`: the customer form with nothing on file yet. */
export function NewCustomerPage() {
  return <NewCustomerForm />
}

/** `/customers/:id/edit`: the same form, loaded from the record (decision of 2026-09-16). */
export function EditCustomerPage() {
  return <EditCustomerForm />
}
