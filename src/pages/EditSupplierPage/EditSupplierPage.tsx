import { EditSupplierForm } from '../NewSupplierPage/SupplierFormPage'

/**
 * `/suppliers/:slug/edit`: the supplier form on the Edit frame (Figma 163:26848), loaded from the
 * record, with the side column the frame draws: is the record complete, what changing it affects
 * (from the record's overview), and the changes the record itself dates.
 */
export function EditSupplierPage() {
  return <EditSupplierForm />
}
