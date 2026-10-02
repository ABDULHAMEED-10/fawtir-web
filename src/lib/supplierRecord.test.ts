import { describe, expect, it } from 'vitest'
import type { DocumentKind, SupplierDocumentDto } from '../api/expenditure/supplierRecord'
import {
  documentKindLabelKey,
  documentRemovable,
  keepChoicesFor,
  keepToSend,
} from './supplierRecord'

const entry = (
  document: Partial<SupplierDocumentDto['document']>,
  removable?: boolean,
): SupplierDocumentDto => ({
  document: {
    id: 'd-1',
    title: 'A paper',
    kind: 'OTHER',
    series: null,
    version: 1,
    documentDate: null,
    provenance: 'UPLOADED',
    note: null,
    contentType: 'application/pdf',
    byteSize: 1,
    uploadedAt: '2026-01-15T08:00:00Z',
    retentionClass: 'STANDARD',
    legalHold: { held: false, reason: null, setBy: null, setAt: null },
    retainUntil: null,
    ...document,
  },
  standing: 'ON_FILE',
  ...(removable === undefined ? {} : { removable }),
})

// Owner's answer 4 (2 Oct 2026): the per-document choice stays, but a tax document (bill, credit
// or debit note) is always kept under the ten-year rule and cannot be set to delete.
describe('how long a supplier paper is kept', () => {
  const TAX: DocumentKind[] = ['BILL', 'CREDIT_NOTE', 'DEBIT_NOTE']
  const OTHERS: DocumentKind[] = ['AGREEMENT', 'CERTIFICATE', 'PRICE_LIST', 'CORRESPONDENCE', 'OTHER']

  it('offers every choice for a paper that is not a tax document', () => {
    for (const kind of OTHERS)
      expect(keepChoicesFor(kind), kind).toEqual(['forever', 'matchInvoice', 'untilDate'])
  })

  it('offers a tax document the ten-year rule alone', () => {
    for (const kind of TAX) expect(keepChoicesFor(kind), kind).toEqual(['matchInvoice'])
  })

  it('sends the choice made for a paper that is not a tax document', () => {
    expect(keepToSend('AGREEMENT', 'forever')).toBe('UNTIL_DELETED')
    expect(keepToSend('AGREEMENT', 'matchInvoice')).toBe('TEN_YEAR_RULE')
    // The server has no dated deletion: the paper stays until someone deletes it.
    expect(keepToSend('CORRESPONDENCE', 'untilDate')).toBe('UNTIL_DELETED')
  })

  it('never sends "until deleted" for a tax document, whatever the form still holds', () => {
    for (const kind of TAX) {
      expect(keepToSend(kind, 'forever'), kind).toBe('TEN_YEAR_RULE')
      expect(keepToSend(kind, 'untilDate'), kind).toBe('TEN_YEAR_RULE')
      expect(keepToSend(kind, 'matchInvoice'), kind).toBe('TEN_YEAR_RULE')
    }
  })
})

describe('whether a supplier paper can be removed now', () => {
  const TODAY = '2026-10-02'

  it('takes the server at its word when it says', () => {
    expect(documentRemovable(entry({ keep: 'UNTIL_DELETED' }, true), TODAY)).toBe(true)
    expect(
      documentRemovable(entry({ keep: 'TEN_YEAR_RULE', retainUntil: '2037-12-31' }, false), TODAY),
    ).toBe(false)
    // The server's answer wins over the dates this browser can see.
    expect(documentRemovable(entry({ retainUntil: '2025-12-31' }, false), TODAY)).toBe(false)
    expect(documentRemovable(entry({ retainUntil: '2037-12-31' }, true), TODAY)).toBe(true)
  })

  it('works it out as before for a server that does not say', () => {
    expect(documentRemovable(entry({ retainUntil: '2037-12-31' }), TODAY)).toBe(false)
    expect(documentRemovable(entry({ retainUntil: TODAY }), TODAY)).toBe(false)
    expect(documentRemovable(entry({ retainUntil: '2025-12-31' }), TODAY)).toBe(true)
    expect(documentRemovable(entry({ retainUntil: null }), TODAY)).toBe(true)
    expect(
      documentRemovable(
        entry({
          retainUntil: '2025-12-31',
          legalHold: { held: true, reason: 'Dispute', setBy: 'u-1', setAt: null },
        }),
        TODAY,
      ),
    ).toBe(false)
  })
})

describe('the name of a kind of paper', () => {
  it('names the five kinds the form offers, the three tax documents, and anything else as Other', () => {
    expect(documentKindLabelKey('AGREEMENT')).toBe('supplierRecord.kind.AGREEMENT')
    expect(documentKindLabelKey('BILL')).toBe('billDetail.breadcrumbBill')
    expect(documentKindLabelKey('CREDIT_NOTE')).toBe('documents.kind.CREDIT_NOTE')
    expect(documentKindLabelKey('DEBIT_NOTE')).toBe('documents.kind.DEBIT_NOTE')
    expect(documentKindLabelKey('SOMETHING_NEW')).toBe('supplierRecord.kind.OTHER')
  })
})
