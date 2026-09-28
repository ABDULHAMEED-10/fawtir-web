import { apiRequest } from '../client'

/**
 * What every new invoice starts from (`CompanyProfileController`'s `/invoice-defaults`, V158) —
 * language, currency, payment terms and the footer note. Separate from `/company-profile` itself
 * so saving it never re-submits the company for verification: none of it is a fact the Tax
 * Authority verifies.
 */
export const INVOICE_DEFAULTS_PATH = '/v1/company-profile/invoice-defaults'

/** `language` is `AR`, `EN` or `AR_EN`; the screen's own values (`ar`/`en`/`both`) are mapped at the edge. */
export type InvoiceDefaultsDto = {
  language: 'AR' | 'EN' | 'AR_EN' | null
  currency: string | null
  paymentTerms: string | null
  footerNote: string | null
}

export function loadInvoiceDefaults(): Promise<InvoiceDefaultsDto> {
  return apiRequest<InvoiceDefaultsDto>(INVOICE_DEFAULTS_PATH)
}

export function saveInvoiceDefaults(defaults: InvoiceDefaultsDto): Promise<InvoiceDefaultsDto> {
  return apiRequest<InvoiceDefaultsDto>(INVOICE_DEFAULTS_PATH, {
    method: 'PUT',
    body: defaults,
  })
}
