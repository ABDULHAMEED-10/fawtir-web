import type { ScanResult } from '../components/invoice/ScanToFillModal'

/**
 * Stand-in for the document-extraction endpoint behind "Scan to fill".
 *
 * The real thing is a server job — OCR the upload, then have a model map the text onto invoice
 * fields — and it returns exactly this shape. Nothing in the UI knows the difference, so
 * replacing this function with a `fetch` is the whole integration:
 *
 *     POST /api/v1/invoice-drafts/scan     multipart, the uploaded file
 *     200  { fields: [{ key, labelKey, value, confidence }], lines: [...] }
 *
 * Confidence is deliberately mixed here so the review step has something to flag — a real
 * extractor is least sure about handwritten dates and reference numbers, which is what the
 * low-confidence rows below imitate.
 */
export async function extractInvoice(file: File): Promise<ScanResult> {
  await new Promise((resolve) => setTimeout(resolve, 1400))

  // A file the reader cannot open is a failure, not an empty result.
  if (file.size === 0) throw new Error('empty file')

  return {
    fields: [
      {
        key: 'customer',
        labelKey: 'scanToFill.fieldCustomer',
        value: 'Muscat Grand Hotel LLC',
        confidence: 0.96,
      },
      {
        key: 'issueDate',
        labelKey: 'scanToFill.fieldIssueDate',
        value: '2026-07-18',
        confidence: 0.91,
      },
      {
        key: 'dueDate',
        labelKey: 'scanToFill.fieldDueDate',
        value: '2026-08-17',
        confidence: 0.88,
      },
      {
        key: 'purchaseOrder',
        labelKey: 'scanToFill.fieldPurchaseOrder',
        value: 'PO-88213',
        confidence: 0.62,
      },
      {
        key: 'subject',
        labelKey: 'scanToFill.fieldSubject',
        value: 'Monthly coffee supply — July',
        confidence: 0.79,
      },
    ],
    lines: [
      { description: 'Cappuccino - Large', quantity: '12', unitPrice: '1.800', confidence: 0.94 },
      {
        description: 'Coffee Beans 1kg - House Blend',
        quantity: '4',
        unitPrice: '9.500',
        confidence: 0.9,
      },
      { description: 'Delivery charge', quantity: '1', unitPrice: '2.500', confidence: 0.71 },
    ],
  }
}
