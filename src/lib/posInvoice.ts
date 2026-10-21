import type { ReferenceDataDto } from '../api/reference/referenceData'
import type { DraftRequest } from '../api/invoices/drafts'
import { blankDraftForm, toDraftRequest, type DraftForm } from './invoiceDraft'
import { invoiceLinesFor, NO_SALE_DISCOUNT, type SaleDiscount, type SaleLine } from './pos'

/**
 * The invoice a till sale files, built by the invoice composer's own request builder
 * (`toDraftRequest`), so a POS sale and a typed invoice follow the same PINT-OM rules (owner,
 * 21 Oct 2026). A walk-in is a consumer's simplified invoice; a sale put on a company is a full
 * tax invoice to that customer. The till's branch is the invoice's branch, the sale is paid on
 * the spot (terms NET0) and the prices are exclusive of VAT, as the catalogue keeps them.
 *
 * TODO(backend): the till does not file it yet. It sells the sample shelf, whose items are not
 * catalogue products, and a sale needs one call that creates and issues the invoice with the
 * payments taken, safe to repeat from a till that was offline (INCOME.md row P.12).
 */
export type PosSale = {
  lines: SaleLine[]
  /** The walk-in record for a consumer, or the company the sale was put on. */
  customer: { kind: 'consumer' | 'business' | 'government'; id: string | null }
  branchId: string | null
  saleDiscount?: SaleDiscount
  /** Names a size or add-on in the invoice's language. */
  label?: (key: string) => string
}

export function posDraftForm(sale: PosSale): DraftForm {
  const discount = sale.saleDiscount ?? NO_SALE_DISCOUNT
  const consumer = sale.customer.kind === 'consumer'
  return {
    ...blankDraftForm(),
    customerType: sale.customer.kind,
    customerId: sale.customer.id,
    branchId: sale.branchId,
    paymentTerms: 'NET0',
    headerDiscountType: discount.type,
    headerDiscountValue: discount.value || '0',
    // A consumer's simplified invoice carries no classification (the composer's rule).
    lines: invoiceLinesFor(sale.lines, sale.label).map((line) =>
      consumer ? { ...line, hsCode: undefined, serviceType: undefined } : line,
    ),
  }
}

export function posInvoiceRequest(reference: ReferenceDataDto | null, sale: PosSale): DraftRequest {
  return toDraftRequest(reference, posDraftForm(sale), true)
}
