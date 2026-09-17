import { EditSupplierForm } from '../NewSupplierPage/SupplierFormPage'

/**
 * `/suppliers/:slug/edit`: the same form as a new supplier, loaded from the record (decision of
 * 2026-09-16). The Figma edit frame's side panels that nothing backs (what the change affects,
 * recent changes) are not drawn; its completeness check is, from the record's own health flags.
 */
export function EditSupplierPage() {
  return <EditSupplierForm />
}
