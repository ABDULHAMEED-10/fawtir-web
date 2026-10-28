import type { ReferenceDataDto } from '../api/reference/referenceData'
import type { DraftRequest } from '../api/invoices/drafts'
import type { PosCustomerKind, PosLineRef, PosSaleRequest } from '../api/pos/pos'
import { blankDraftForm, toDraftRequest, type DraftForm } from './invoiceDraft'
import { invoiceLinesFor, NO_SALE_DISCOUNT, type SaleDiscount, type SaleLine } from './pos'

/**
 * The invoice a till sale files, built by the invoice composer's own request builder
 * (`toDraftRequest`), so a POS sale and a typed invoice follow the same PINT-OM rules (owner,
 * 21 Oct 2026). A walk-in is a consumer's simplified invoice; a sale put on a company is a full
 * tax invoice to that customer; a walk-in at 500.000 or more before VAT becomes a full invoice to
 * the buyer named at the till (ER Art. 146, `SIMPLIFIED_INVOICE_LIMIT`). The till's branch is the
 * invoice's branch and the prices are exclusive of VAT, as the catalogue keeps them. The server
 * sets the payment terms from the payments (NET0, or the company's own terms on account).
 *
 * It is sent with the payments in one call, `POST /v1/pos/sales` (row P.12, `posSaleRequest`).
 */
export type PosSale = {
  lines: SaleLine[]
  /** The company the sale was put on, or a consumer (walk-in, or a buyer named at the till). */
  customer: { kind: 'consumer' | 'business' | 'government'; id: string | null }
  branchId: string | null
  saleDiscount?: SaleDiscount
  /** A consumer's full tax invoice (ER Art. 149): lines keep their classification. */
  fullTax?: boolean
}

export function posDraftForm(sale: PosSale): DraftForm {
  const discount = sale.saleDiscount ?? NO_SALE_DISCOUNT
  const plain = sale.customer.kind === 'consumer' && !sale.fullTax
  return {
    ...blankDraftForm(),
    // A full invoice to a named consumer is built as a business invoice: classified lines.
    customerType:
      sale.fullTax && sale.customer.kind === 'consumer' ? 'business' : sale.customer.kind,
    customerId: sale.customer.id,
    branchId: sale.branchId,
    paymentTerms: 'NET0',
    headerDiscountType: discount.type,
    headerDiscountValue: discount.value || '0',
    // A consumer's simplified invoice carries no classification (the composer's rule).
    lines: invoiceLinesFor(sale.lines).map((line) =>
      plain ? { ...line, hsCode: undefined, serviceType: undefined } : line,
    ),
  }
}

export function posInvoiceRequest(reference: ReferenceDataDto | null, sale: PosSale): DraftRequest {
  const request = toDraftRequest(reference, posDraftForm(sale), true)
  return {
    ...request,
    details: {
      ...request.details,
      transactionType:
        sale.customer.kind === 'consumer' && !sale.fullTax ? 'SIMPLIFIED' : 'FULL_TAX',
    },
  }
}

/** One per catalogue line: ITEM lines move stock, ADD_ON lines never do. */
export function posLineRefs(lines: SaleLine[]): PosLineRef[] {
  return invoiceLinesFor(lines).map((line, index) => ({
    lineNumber: index + 1,
    role: line.ref.role,
    productId: line.ref.productId,
    variantId: line.ref.variantId,
    addOnId: line.ref.addOnId,
  }))
}

/** The buyer of the sale, as `POST /v1/pos/sales` names it. */
export type TillBuyer =
  | { kind: 'walkIn' }
  | { kind: 'company'; customerId: string; customerKind: 'BUSINESS' | 'GOVERNMENT' }
  | {
      kind: 'named'
      name: string
      contact: string | null
      identifierScheme: string
      identifierValue: string
    }

/** Everything but the till, the time and the payments: the sale as the till holds it. */
export function posSaleBody(
  reference: ReferenceDataDto | null,
  input: {
    lines: SaleLine[]
    saleDiscount: SaleDiscount
    branchId: string
    buyer: TillBuyer
  },
): Pick<PosSaleRequest, 'customer' | 'draft' | 'lineRefs'> {
  const { buyer } = input
  const company = buyer.kind === 'company'
  const draft = posInvoiceRequest(reference, {
    lines: input.lines,
    saleDiscount: input.saleDiscount,
    branchId: input.branchId,
    customer: company
      ? {
          kind: buyer.customerKind === 'GOVERNMENT' ? 'government' : 'business',
          id: buyer.customerId,
        }
      : { kind: 'consumer', id: null },
    fullTax: buyer.kind === 'named',
  })
  // The customer is named once, in `customer`; the draft's would have to match it.
  const rest: Omit<DraftRequest, 'customerId'> & { customerId?: string } = { ...draft }
  delete rest.customerId
  const kind: PosCustomerKind = company
    ? buyer.customerKind
    : buyer.kind === 'named'
      ? 'CONSUMER'
      : 'WALK_IN'
  return {
    customer: {
      kind,
      ...(company ? { customerId: buyer.customerId } : {}),
      ...(buyer.kind === 'named'
        ? {
            consumer: {
              name: buyer.name,
              contact: buyer.contact,
              identifierScheme: buyer.identifierScheme as never,
              identifierValue: buyer.identifierValue,
            },
          }
        : {}),
    },
    draft: company ? { ...rest, customerId: buyer.customerId } : rest,
    lineRefs: posLineRefs(input.lines),
  }
}
