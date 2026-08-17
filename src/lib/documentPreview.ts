import type { PreviewDocument } from '../components/invoice/DocumentPreview'
import { INVOICE_DETAIL } from './invoiceDetails'

/** The issuing business. Comes from the tenant profile once accounts are wired up. */
const SELLER = {
  name: 'Al Bahja Coffee',
  legalName: 'Al Bahja Coffee LLC',
  initial: 'A',
  vat: 'VAT OM1100112233',
  lines: ['Way 3025, Al Khuwair', 'Muscat, Oman'],
}

/**
 * Stand-in for the QR string the clearance response carries.
 *
 * The real one is TLV-encoded and signed, so only the OTA round-trip can produce it. Keeping
 * the same field order here means swapping in the server value is a one-line change.
 */
function qrPayload(input: {
  seller: string
  sellerVat: string
  timestamp: string
  total: string
  vat: string
}) {
  return [
    `seller=${input.seller}`,
    `vat=${input.sellerVat}`,
    `date=${input.timestamp}`,
    `total=${input.total}`,
    `vatAmount=${input.vat}`,
  ].join('|')
}

/** Map the invoice-details record onto the printable document. */
export function invoiceToPreview(
  invoice: typeof INVOICE_DETAIL,
  invoiceId: string,
  labels: {
    kind: string
    status: string
    issueDate: string
    dueDate: string
    poRef: string
    terms: string
    amountPaid: string
    balanceDue: string
    payTo: string
    peppol: string
  },
): PreviewDocument {
  return {
    kind: labels.kind,
    number: invoiceId,
    statusLabel: labels.status,
    brand: { name: SELLER.name, initial: SELLER.initial, vat: SELLER.vat },
    from: { name: SELLER.legalName, lines: SELLER.lines, vat: SELLER.vat },
    to: {
      name: invoice.customer.name,
      lines: ['Shatti Al Qurum', 'Muscat, Oman'],
      // The record keeps the VAT number and the Peppol id in one string; the sheet prints the VAT part.
      vat: invoice.customer.vat.split(' · ')[0],
    },
    meta: [
      { label: labels.issueDate, value: invoice.fields.issueDate },
      { label: labels.dueDate, value: invoice.fields.dueDate },
      { label: labels.poRef, value: invoice.fields.poReference },
      { label: labels.terms, value: invoice.fields.paymentTerms },
    ],
    lines: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      unitPrice: item.unitPrice,
      qty: item.qty,
      vat: item.vat,
      total: item.total,
    })),
    totals: {
      subtotal: invoice.totals.subtotal,
      discount: invoice.totals.discount,
      net: invoice.totals.net,
      vat: invoice.totals.vat,
      vatLabel: `VAT ${invoice.items[0]?.vat ?? '5%'}`,
      total: invoice.totals.total,
    },
    notes: invoice.notes.customer,
    footer: [
      {
        label: labels.amountPaid,
        value: `OMR ${invoice.paid} · ${labels.balanceDue} OMR ${invoice.outstanding}`,
      },
      {
        label: labels.payTo,
        value: 'Bank Muscat · IBAN OM12 0018 0000 0011 2345 6702 · Ref MGH-2044-07',
      },
      { label: labels.peppol, value: invoice.customer.vat.split(' · ')[1] ?? '' },
    ],
    qrPayload: qrPayload({
      seller: SELLER.legalName,
      sellerVat: SELLER.vat.replace('VAT ', ''),
      timestamp: invoice.fields.issueDate,
      total: invoice.totals.total,
      vat: invoice.totals.vat,
    }),
  }
}
