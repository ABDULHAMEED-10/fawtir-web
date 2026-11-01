import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { PosRefundPage } from './PosRefundPage'
import { ApiError } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { creditLineOfSale, type ReturnLine } from '../../lib/posRefund'
import { posRefusalKey, queueRefusalKey, refusalValues } from '../../lib/posRefusals'
import { resetOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import type { PosRefundLookupDto } from '../../api/pos/pos'

/**
 * A goods line with no HS code, from backend #819. `line` on a refund is the CREDIT NOTE's line,
 * numbered over what comes back, so it is not the sale's line once anything is left out.
 */

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell', 'pos.refund'],
  scopes: [],
  featureFlags: {},
}

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  code: 'T01',
  seriesBase: 'NZW-T01',
  name: 'Till 1',
  status: 'ACTIVE',
  defaultFloat: 30,
  version: 0,
  openShift: {
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    openedAt: '2026-10-28T03:00:00Z',
  },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const line = (lineNumber: number, description: string, extra: Record<string, unknown> = {}) => ({
  lineNumber,
  role: 'ITEM',
  productId: `p-${lineNumber}`,
  description,
  quantitySold: 1,
  quantityRefunded: 0,
  unitPrice: 2,
  discount: null,
  vatRate: 5,
  vatCategory: 'S',
  refundable: true,
  ...extra,
})

const LOOKUP = {
  saleId: 'sale-1',
  invoiceId: 'inv-1',
  invoiceNumber: 'NZW-T01-INV-2026-000001',
  soldAt: '2026-10-28T08:00:00Z',
  transactionType: 'FULL_TAX',
  branch: { id: 'b-1', name: 'Nizwa' },
  customer: { kind: 'CONSUMER', customerId: 'c-1', name: 'Sara Ali' },
  headerDiscount: null,
  lines: [
    line(1, 'Flat White'),
    line(2, 'Extra shot', {
      role: 'ADD_ON',
      productId: 'p-1',
      refundable: false,
    }),
    line(3, 'Free cookie', { givenFree: true }),
    line(4, 'Beans'),
  ],
  paid: {
    byMethod: [{ method: 'CASH', amount: 6.3 }],
    total: 6.3,
    paidBack: 0,
  },
  total: 6.3,
  tip: 0,
  tipMethod: null,
  filing: null,
  credited: 0,
  owed: 0,
  creditNoteNumbers: [],
} as unknown as PosRefundLookupDto

/** The body the running server answered (N7, 1 Nov 2026), `line` aside. */
const refusedBody = (creditLine: number) => ({
  detail: `Line ${creditLine} is goods (BTOM-019 = 'G') and needs an HS code (IBT-158) on every invoice, simplified included (IBR-174-OM, IBR-079-OM). Use 000000000000 (Other) when no closer code applies, or leave goods/services unstated on a simplified invoice`,
  instance: '/api/v1/pos/sales/sale-1/refunds',
  status: 400,
  title: 'Request rejected',
  type: 'https://api.fawtir.om/problems/hs-code-required',
  code: 'HS_CODE_REQUIRED',
  timestamp: '2026-11-01T05:02:20.271968Z',
  line: creditLine,
  field: 'classification.hsCode',
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
    },
  })

const back = (...lineNumbers: number[]): ReturnLine[] =>
  lineNumbers.map((lineNumber) => ({ lineNumber, qty: 1 }))

const refused = (creditLine: number) =>
  new ApiError({
    status: 400,
    problemType: 'hs-code-required',
    code: 'HS_CODE_REQUIRED',
    problem: refusedBody(creditLine),
  })

let creditLine = 1

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale([])
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  creditLine = 1
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(MANAGER)
      if (url === '/api/v1/branches') {
        return json([
          {
            id: 'b-1',
            code: 'NZW',
            name: 'Nizwa',
            type: 'BRANCH',
            city: 'Nizwa',
          },
        ])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.startsWith('/api/v1/pos/refund-lookup')) return json(LOOKUP)
      if (url.endsWith('/refund-quote')) return json({ type: 'about:blank', status: 404 }, 404)
      if (url.endsWith('/refunds') && init?.method === 'POST') {
        return json(refusedBody(creditLine), 400)
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const refundOnly = async (name: string) => {
  render(
    <MemoryRouter initialEntries={['/pos/refund?invoice=NZW-T01-INV-2026-000001']}>
      <Routes>
        <Route path="/pos/refund" element={<PosRefundPage />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByLabelText(i18n.t('pos.refund.sendBack', { name })))
  fireEvent.click(await screen.findByRole('button', { name: /^Refund/ }))
  return screen.findByRole('alert')
}

describe('a credit note line, read back as a line of the sale', () => {
  it('counts only what comes back, in the order of the sale', () => {
    expect(creditLineOfSale(LOOKUP, back(4), 1)?.description).toBe('Beans')
    expect(creditLineOfSale(LOOKUP, back(1, 4), 1)?.description).toBe('Flat White')
  })

  it('counts the add-on that comes back with its item', () => {
    expect(creditLineOfSale(LOOKUP, back(1, 4), 2)?.description).toBe('Extra shot')
    expect(creditLineOfSale(LOOKUP, back(1, 4), 3)?.description).toBe('Beans')
  })

  it('leaves out a given-away line, which goes on no note', () => {
    expect(creditLineOfSale(LOOKUP, back(3, 4), 1)?.description).toBe('Beans')
  })

  it('finds nothing for a number past the note', () => {
    expect(creditLineOfSale(LOOKUP, back(4), 2)).toBeNull()
  })
})

describe('the refund page when a line has no HS code', () => {
  it('names the item that was refused, not line 1 of the sale, and says what to do', async () => {
    const alert = await refundOnly('Beans')
    expect(alert.textContent).toContain('Line 4 (Beans)')
    expect(alert.textContent).toContain('no HS code')
    expect(alert.textContent).toContain('Nothing was refunded')
    expect(alert.textContent).toContain('edit items')
    expect(alert.textContent).not.toContain(i18n.t('pos.refusal.failed'))
    expect(alert.textContent).not.toContain('BTOM')
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    render(
      <MemoryRouter initialEntries={['/pos/refund?invoice=NZW-T01-INV-2026-000001']}>
        <Routes>
          <Route path="/pos/refund" element={<PosRefundPage />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByLabelText(i18n.t('pos.refund.sendBack', { name: 'Beans' })))
    const button = (await screen.findAllByRole('button')).find((b) =>
      b.className.includes('bg-danger-700'),
    )
    fireEvent.click(button as HTMLElement)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Beans')
    expect(alert.textContent).toContain('رمز النظام المنسق')
    expect(alert.textContent).not.toContain(i18n.t('pos.refusal.failed'))
  })

  it('does not put a credit note number on the sale when it cannot place the line', async () => {
    creditLine = 9
    const alert = await refundOnly('Beans')
    expect(alert.textContent).not.toContain('Line 9')
    expect(alert.textContent).toContain('no HS code')
  })
})

describe('a sale at the till when a line has no HS code', () => {
  it('has its own sentence with the line, in both languages', () => {
    const error = refused(2)
    const key = posRefusalKey(error)
    expect(key).toBe('pos.refusal.HS_CODE_REQUIRED')
    const en = i18n.t(key, { ...refusalValues(error), lng: 'en' })
    expect(en).toContain('Line 2')
    expect(en).toContain('edit items')
    expect(i18n.t(key, { ...refusalValues(error), lng: 'ar' })).toContain('رمز النظام المنسق')
  })
})

describe('a queued sale refused for it', () => {
  it('says the sale goes once the code is on the item, not to take the line off', () => {
    const key = queueRefusalKey('HS_CODE_REQUIRED', 'hs-code-required', {
      line: '2',
    })
    const en = i18n.t(key, { line: '2', lng: 'en' })
    expect(en).toContain('Line 2')
    expect(en).toContain('edit items')
    expect(en).not.toContain('Take it off')
    expect(i18n.t(key, { line: '2', lng: 'ar' })).toContain('رمز النظام المنسق')
  })

  it('leaves the number out on a row from another till, which carries no figures', () => {
    const en = i18n.t(queueRefusalKey('HS_CODE_REQUIRED', null), { lng: 'en' })
    expect(en).not.toContain('{{')
    expect(en).toContain('edit items')
  })
})
