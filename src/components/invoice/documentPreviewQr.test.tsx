import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocumentPreview, type PreviewDocument } from './DocumentPreview'

const party = { name: 'Gulf Supplies', lines: [], vat: '' }
const sheet: PreviewDocument = {
  kind: 'CREDIT NOTE',
  number: 'CN-1',
  brand: { name: 'Seller', initial: 'S', vat: '' },
  from: party,
  to: party,
  meta: [],
  lines: [],
  totals: { subtotal: '1.000', net: '1.000', vat: '0.050', vatLabel: 'VAT 5%', total: '1.050' },
}
const labels = {
  from: 'From',
  billTo: 'Bill to',
  description: 'Description',
  price: 'Price',
  qty: 'Qty',
  vat: 'VAT',
  total: 'Total',
  subtotal: 'Subtotal',
  discount: 'Discount',
  net: 'Net',
  totalDue: 'Total due',
  qrAlt: 'QR code of the note',
}

describe('the printed note carries no device-made QR (CMP37-2b, B37 WEB-10)', () => {
  it('draws no QR and no QR placeholder when the server supplied none', () => {
    const { container } = render(<DocumentPreview document={sheet} labels={labels} />)
    expect(screen.queryByAltText(labels.qrAlt)).toBeNull()
    expect(container.querySelector('.bg-\\[\\#f3f3f3\\]')).toBeNull()
  })
})
