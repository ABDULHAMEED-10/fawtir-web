import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import en from '../../../i18n/locales/en.json'
import ar from '../../../i18n/locales/ar.json'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { muscatToday } from '../../../lib/invoiceIssue'
import { REFUND_KINDS, refundQueuePath } from '../../../lib/console/refundCases'
import { ConsoleRefundCasesPage } from './ConsoleRefundCasesPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const api = (path: string) => `/api${path}`
const OPEN = api(refundQueuePath(null, 'OPEN'))

const ADMIN: Entitlements = {
  userId: 'u-admin',
  username: 'finance.admin',
  tenantId: 't-platform',
  roles: [
    {
      id: 'r-1',
      code: 'PLATFORM_TENANT_ADMIN',
      name: 'Platform tenant administrator',
      systemRole: true,
    },
  ],
  permissions: ['platform.billing.read', 'platform.billing.manage'],
  scopes: [],
  featureFlags: {},
}
const SUPPORT: Entitlements = {
  ...ADMIN,
  userId: 'u-support',
  roles: [{ id: 'r-2', code: 'PLATFORM_SUPPORT', name: 'Platform support', systemRole: true }],
  permissions: ['platform.billing.read'],
}

function refundCase(over: Record<string, unknown> = {}) {
  return {
    id: 'rc-1',
    tenantId: 't-1',
    paymentId: 'p-1',
    amount: '420.000',
    method: 'CARD',
    reason: 'FINAL_REJECTION',
    status: 'OPEN',
    openedAt: '2026-10-19T07:15:00Z',
    openedBy: 'u-system',
    suggestedAmount: null,
    monthsRefunded: null,
    refundMethod: null,
    refundedAt: null,
    refundReference: null,
    refundedOn: null,
    ...over,
  }
}

const REJECTED = { refundCase: refundCase(), tenantName: 'Nizwa Date Traders SPC' }
const LEFT = {
  refundCase: refundCase({
    id: 'rc-2',
    tenantId: 't-2',
    reason: 'LEFT_FAWTIR_ANNUAL',
    amount: '700.000',
    suggestedAmount: '700.000',
    monthsRefunded: 7,
    disconnectionId: 'd-1',
    openedAt: '2026-10-21T09:30:00Z',
  }),
  tenantName: 'Sur Marine Services LLC',
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let who: Entitlements
let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  who = ADMIN
  answers = { [OPEN]: () => json(200, { items: [REJECTED, LEFT], nextCursor: null }) }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const Q = (key: string) => i18n.t(`console.refundQueue.${key}`)
const R = (key: string) => i18n.t(`console.refundCases.${key}`)

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={['/console/billing/refunds']}>
      <Routes>
        <Route path="/console/billing/refunds" element={<ConsoleRefundCasesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** The "Refunded" method picker, not the "Refunded on" day beside it. */
function methodPicker(dialog: HTMLElement) {
  const [picker] = within(dialog)
    .getAllByRole('button', { name: new RegExp(R('refund.method')) })
    .filter((button) => !button.getAttribute('aria-label')?.startsWith(R('refund.on')))
  return picker
}

function sent(method: string, path: string) {
  const call = fetchMock.mock.calls.find(([url, init]) => url === path && init?.method === method)
  return call ? JSON.parse(String(call[1]?.body)) : null
}

describe('Console › Refund cases', () => {
  it('lists every kind of open case across companies, with the company linked', async () => {
    renderQueue()
    const company = await screen.findByRole('link', { name: 'Nizwa Date Traders SPC' })
    expect(company.getAttribute('href')).toBe('/console/tenants/t-1')
    expect(screen.getByText(R('reason.FINAL_REJECTION'))).toBeTruthy()
    expect(screen.getByText(R('reason.LEFT_FAWTIR_ANNUAL'))).toBeTruthy()
    // Both can be marked refunded; only the super admin's case changes its amount or is declined.
    expect(screen.getAllByRole('button', { name: R('refund.open') })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: R('amount.open') })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: R('decline.open') })).toHaveLength(1)
  })

  it('filters by state and by kind', async () => {
    const refunded = api(refundQueuePath(null, 'REFUNDED'))
    const closedApplications = api(refundQueuePath('SIGNUP_REJECTION', 'REFUNDED'))
    answers[refunded] = () => json(200, { items: [], nextCursor: null })
    answers[closedApplications] = () =>
      json(200, {
        items: [
          {
            ...REJECTED,
            refundCase: refundCase({
              status: 'REFUNDED',
              refundMethod: 'CARD',
              refundedOn: '2026-10-20',
              refundedAt: '2026-10-21T08:00:00Z',
            }),
          },
        ],
        nextCursor: null,
      })
    renderQueue()
    await screen.findByText(R('reason.FINAL_REJECTION'))
    await userEvent.click(screen.getByRole('button', { name: Q('view.REFUNDED') }))
    expect(await screen.findByText(Q('empty'))).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: new RegExp(Q('kind.label')) }))
    await userEvent.click(await screen.findByRole('option', { name: Q('kind.SIGNUP_REJECTION') }))
    expect(await screen.findByText(/to the card/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: R('refund.open') })).toBeNull()
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(closedApplications)
    expect(closedApplications).toContain('reason=FINAL_REJECTION&reason=CORRECTION_WINDOW_EXPIRED')
  })

  it('marks a closed application refunded from the queue and reads the queue again', async () => {
    const REFUND = '/api/v1/platform/companies/t-1/subscription/refund-cases/rc-1/refund'
    answers[`POST ${REFUND}`] = () =>
      json(
        200,
        refundCase({
          status: 'REFUNDED',
          refundMethod: 'BANK_TRANSFER',
          refundedOn: muscatToday(),
        }),
      )
    renderQueue()
    await screen.findByText(R('reason.FINAL_REJECTION'))
    const [first] = screen.getAllByRole('button', { name: R('refund.open') })
    await userEvent.click(first)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(R('refund.bodyFinance'))).toBeTruthy()
    await userEvent.click(methodPicker(dialog))
    await userEvent.click(await screen.findByRole('option', { name: R('method.BANK_TRANSFER') }))
    await userEvent.click(within(dialog).getByRole('button', { name: R('refund.confirm') }))
    expect(await screen.findByText(/recorded as refunded by bank transfer/)).toBeTruthy()
    expect(sent('POST', REFUND)).toEqual({
      method: 'BANK_TRANSFER',
      reference: null,
      refundedOn: muscatToday(),
    })
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => url === OPEN).length).toBeGreaterThan(1),
    )
  })

  it('offers no acts without platform.billing.manage', async () => {
    who = SUPPORT
    renderQueue()
    expect(await screen.findByText(R('reason.FINAL_REJECTION'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: R('refund.open') })).toBeNull()
  })

  it('says when nothing is waiting', async () => {
    answers[OPEN] = () => json(200, { items: [], nextCursor: null })
    renderQueue()
    expect(await screen.findByText(Q('emptyOpen'))).toBeTruthy()
  })

  it('has every kind and view in English and Arabic', () => {
    for (const locale of [en, ar] as Record<string, unknown>[]) {
      const block = (locale.console as Record<string, Record<string, Record<string, string>>>)
        .refundQueue
      for (const kind of [...Object.keys(REFUND_KINDS), 'ALL', 'label'])
        expect(block.kind[kind]).toBeTruthy()
      for (const view of ['OPEN', 'REFUNDED', 'ALL']) expect(block.view[view]).toBeTruthy()
    }
  })
})
