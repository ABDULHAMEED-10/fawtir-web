import type { TFunction } from 'i18next'

/**
 * The ERP a connection or mapping reads from, by its product name ("Odoo", "ERPNext") rather than
 * the server's code (`ODOO`, `ERPNEXT`). A code with no name yet is shown as the server sent it,
 * which is still better than an i18n key.
 */
export function sourceSystemName(t: TFunction, code: string): string {
  return t(`erp.sourceSystem.${code}`, { defaultValue: code })
}
