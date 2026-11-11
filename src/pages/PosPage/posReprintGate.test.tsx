import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import type { PosSaleDto } from '../../api/pos/pos'
import { reprintReady } from '../../lib/posReprint'
import { REPRINT_LINES_SETTLED } from '../../lib/posReprintGate'
import { ReceiptReprint } from './PosReprint'

/**
 * QW4R-5: the reprint ships gated off until backend A4T-1 settles `receipt.lines`. An answer that
 * would print once the gate opens (lines, a READY QR, a frozen seller) prints nothing now.
 */

const READY_SALE = {
  saleId: 's-1',
  invoiceNumber: 'NZW-T01-INV-2026-000049',
  transactionType: 'SIMPLIFIED',
  customerKind: 'WALK_IN',
  soldAt: '2026-10-29T10:00:00Z',
  queuedOffline: false,
  cashier: { userId: 'u-1', name: 'Maryam' },
  payments: [],
  receipt: {
    invoiceTotal: 5.649,
    tip: 0,
    totalPaid: 5.649,
    onAccount: 0,
    qr: { status: 'READY', payload: 'AQ==', pngUrl: null },
    lines: [{ description: 'Flat white', quantity: 2, unitPrice: 2.69, amount: 5.38, vatCategory: 'S', vatRate: 5 }],
    seller: { legalName: 'Al Noor Trading LLC', vatNumber: 'OM1100012345' },
  },
  filing: { dispatchState: 'DISPATCHED', acceptedAt: '2026-10-29T10:00:01Z' },
  warnings: [],
} as unknown as PosSaleDto

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(READY_SALE), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the reprint gate (QW4R-5)', () => {
  it('is off as shipped', () => {
    expect(REPRINT_LINES_SETTLED).toBe(false)
  })

  it('refuses an answer with lines and a READY QR, online or queued', () => {
    expect(reprintReady(READY_SALE)).toBe(false)
    expect(reprintReady({ ...READY_SALE, queuedOffline: true })).toBe(false)
  })

  it('the dialog says the reprint is unavailable and puts nothing on paper', async () => {
    render(
      <MemoryRouter>
        <ReceiptReprint saleId="s-1" branchName={null} onClose={() => {}} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(i18n.t('pos.today.reprintUnavailable'))).toBeTruthy()
    expect(document.querySelector('.fawtir-print-sheet')).toBeNull()
    expect(
      (screen.getByRole('button', { name: i18n.t('pos.done.printAgain') }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
