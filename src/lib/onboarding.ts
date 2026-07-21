export type BusinessSize = 'just-me' | '2-10' | '11-50' | '50-plus'
export type InvoicingMethod = 'paper' | 'spreadsheets' | 'accounting' | 'erp'

export type AboutBusinessAnswers = {
  businessSize: BusinessSize
  invoicingMethod: InvoicingMethod
}

/** POS / business-type screen only for small shops without an existing system. */
export function shouldShowBusinessTypeScreen(
  businessSize: BusinessSize,
  invoicingMethod: InvoicingMethod,
): boolean {
  const isSmallTeam = businessSize === 'just-me' || businessSize === '2-10'
  const isManualOrSheets = invoicingMethod === 'paper' || invoicingMethod === 'spreadsheets'
  return isSmallTeam && isManualOrSheets
}
