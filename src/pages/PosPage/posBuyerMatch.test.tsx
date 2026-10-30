import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosPaymentPage } from './PosPaymentPage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { hintOf, matchRequest } from '../../lib/posBuyerMatch'

/**
 * "Matches customer on file": the full-invoice buyer's ID (and phone) matches a customer stored
 * under another name, said under the ID before the invoice is filed, never blocking it.
 */

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell'],
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

const ON_FILE = {
  match: 'identifier',
  customerId: 'c-1',
  name: 'Saif Al Busaidi',
  sameName: false,
  identifierScheme: 'CID',
  identifierValue: '•••• 5678',
  identifierValueMasked: true,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let calls: { url: string; init?: RequestInit }[]
let matchAnswer: () => Response | Promise<Response>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  calls = []
  matchAnswer = () => json(ON_FILE)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url === '/api/v1/pos/customers/match') return matchAnswer()
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        return json(
          {
            type: 'https://api.fawtir.om/problems/simplified-invoice-limit',
            status: 422,
            code: 'SIMPLIFIED_INVOICE_LIMIT',
            buyerIdentifierSchemes: ['CR', 'CID'],
          },
          422,
        )
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const matches = () => calls.filter((call) => call.url === '/api/v1/pos/customers/match')

async function buyerForm() {
  render(
    <MemoryRouter initialEntries={['/pos/payment']}>
      <Routes>
        <Route path="/pos/payment" element={<PosPaymentPage />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: /Take 5.817 in cash/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish the sale' }))
  await screen.findByRole('button', { name: 'Make it a full invoice' })
  fireEvent.change(screen.getByLabelText("Buyer's name"), { target: { value: 'Hamed Al Rawahi' } })
  fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: '9234 5678' } })
  fireEvent.change(screen.getByLabelText('ID number'), { target: { value: '12345678' } })
}

describe('matches customer on file', () => {
  it('names the customer on file with the masked ID when the name differs, and still allows the sale', async () => {
    await buyerForm()
    expect(
      await screen.findByText(
        'Matches customer on file: Saif Al Busaidi (Civil ID •••• 5678)',
        {},
        { timeout: 2000 },
      ),
    ).toBeTruthy()
    expect(matches()).toHaveLength(1)
    expect(matches()[0].init?.method).toBe('POST')
    expect(JSON.parse(String(matches()[0].init?.body))).toEqual({
      tillId: 'till-1',
      name: 'Hamed Al Rawahi',
      contact: '+96892345678',
      identifierScheme: 'CID',
      identifierValue: '12345678',
    })
    expect(
      (screen.getByRole('button', { name: 'Make it a full invoice' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('says nothing when the endpoint is absent (older server) or offline', async () => {
    matchAnswer = () => json({ type: 'about:blank', status: 404 }, 404)
    await buyerForm()
    await waitFor(() => expect(matches()).toHaveLength(1), { timeout: 2000 })
    expect(screen.queryByText(/Matches customer on file/)).toBeNull()
    matchAnswer = () => Promise.reject(new TypeError('Failed to fetch'))
    fireEvent.change(screen.getByLabelText('ID number'), { target: { value: '12345679' } })
    await waitFor(() => expect(matches()).toHaveLength(2), { timeout: 2000 })
    expect(screen.queryByText(/Matches customer on file/)).toBeNull()
  })

  it('is worded in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.t('pos.buyer.onFile', { name: 'سيف' })).toBe('يطابق عميلًا مسجّلًا: سيف')
    expect(i18n.t('pos.buyer.onFileWithId', { name: 'سيف', id: '•••• 5678' })).toBe(
      'يطابق عميلًا مسجّلًا: سيف (•••• 5678)',
    )
  })
})

describe('the lookup', () => {
  const typed = { name: ' Hamed ', scheme: 'CID', value: '12345678', contact: '' }
  it('waits for a name, a whole ID and a phone that can be filed', () => {
    expect(matchRequest('t', typed)).toEqual({
      tillId: 't',
      name: 'Hamed',
      contact: null,
      identifierScheme: 'CID',
      identifierValue: '12345678',
    })
    expect(matchRequest('t', { ...typed, name: ' ' })).toBeNull()
    expect(matchRequest('t', { ...typed, value: '123' })).toBeNull()
    expect(matchRequest('t', { ...typed, contact: '12' })).toBeNull()
  })
  it('is said only for a match under another name', () => {
    expect(hintOf(ON_FILE as never)).not.toBeNull()
    expect(hintOf({ ...ON_FILE, sameName: true } as never)).toBeNull()
    expect(hintOf({ ...ON_FILE, match: 'none', name: null } as never)).toBeNull()
    expect(hintOf(null)).toBeNull()
  })
})
