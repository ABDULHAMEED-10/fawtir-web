import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import en from '../../../i18n/locales/en.json'
import ar from '../../../i18n/locales/ar.json'
import { resetSharedRequests } from '../../../api'
import { REFUND_METHODS, REFUND_REASONS } from '../../../lib/console/refundCases'
import { CompanyRefundCases } from './CompanyRefundCases'

const TENANT = '11111111-1111-4111-8111-111111111111'
const COMPANY = `/api/v1/platform/companies/${TENANT}`
const PAYMENTS = `${COMPANY}/payments?limit=1`
const CASE_ID = 'c0000000-0000-4000-8000-000000000412'
const AMOUNT = `${COMPANY}/subscription/refund-cases/${CASE_ID}/amount`
const REFUND = `${COMPANY}/subscription/refund-cases/${CASE_ID}/refund`

function leaveCase(over: Record<string, unknown> = {}) {
  return {
    id: CASE_ID,
    tenantId: TENANT,
    paymentId: 'p-1',
    amount: '700.000',
    method: 'CARD',
    reason: 'LEFT_FAWTIR_ANNUAL',
    status: 'OPEN',
    openedAt: '2026-10-21T09:30:00Z',
    openedBy: 'u-1',
    disconnectionId: 'd-1',
    suggestedAmount: '700.000',
    monthsRefunded: 7,
    amountReason: null,
    amountAdjustedAt: null,
    amountAdjustedBy: null,
    refundMethod: null,
    refundedAt: null,
    refundedBy: null,
    refundReference: null,
    ...over,
  }
}

const financeCase = {
  ...leaveCase(),
  id: 'c-2',
  reason: 'CANCELLED_BY_CUSTOMER',
  amount: '84.000',
  disconnectionId: null,
  suggestedAmount: null,
  monthsRefunded: null,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  answers = {
    [PAYMENTS]: () =>
      json(200, { items: [], refundCases: [leaveCase(), financeCase], nextCursor: null }),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const R = (key: string, options?: Record<string, unknown>) =>
  i18n.t(`console.refundCases.${key}`, options)

function renderCases(canManage = true, onMessage = vi.fn()) {
  render(
    <MemoryRouter>
      <CompanyRefundCases tenantId={TENANT} canManage={canManage} onMessage={onMessage} />
    </MemoryRouter>,
  )
  return onMessage
}

function sent(method: string, path: string) {
  const call = fetchMock.mock.calls.find(([url, init]) => url === path && init?.method === method)
  return call ? JSON.parse(String(call[1]?.body)) : null
}

describe('CompanyRefundCases', () => {
  it('lists the cases with the leaving company reason, the suggestion and actions only on the open annual case', async () => {
    renderCases()
    expect(await screen.findByText(R('reason.LEFT_FAWTIR_ANNUAL'))).toBeTruthy()
    expect(screen.getByText(R('reason.CANCELLED_BY_CUSTOMER'))).toBeTruthy()
    expect(screen.getByText(/7 whole months/)).toBeTruthy()
    // One case is settled here; the other is Finance's, so only one pair of buttons.
    expect(screen.getAllByRole('button', { name: R('refund.open') })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: R('amount.open') })).toHaveLength(1)
  })

  it('shows no actions without platform.billing.manage', async () => {
    renderCases(false)
    expect(await screen.findByText(R('reason.LEFT_FAWTIR_ANNUAL'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: R('refund.open') })).toBeNull()
    expect(screen.queryByRole('button', { name: R('amount.open') })).toBeNull()
  })

  it('draws nothing when the company has no case or the server does not list them', async () => {
    answers[PAYMENTS] = () => json(200, { items: [], nextCursor: null })
    const { container } = render(
      <MemoryRouter>
        <CompanyRefundCases tenantId={TENANT} canManage onMessage={vi.fn()} />
      </MemoryRouter>,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('changes the amount with a reason', async () => {
    answers[`POST ${AMOUNT}`] = () =>
      json(200, leaveCase({ amount: '650.500', amountReason: 'Agreed by phone' }))
    const onMessage = renderCases()
    await userEvent.click(await screen.findByRole('button', { name: R('amount.open') }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText(new RegExp(R('amount.label')))
    await userEvent.clear(amount)
    await userEvent.type(amount, '0')
    await userEvent.click(within(dialog).getByRole('button', { name: R('amount.confirm') }))
    expect(await within(dialog).findByText(R('amount.invalid'))).toBeTruthy()
    expect(sent('POST', AMOUNT)).toBeNull()

    await userEvent.clear(amount)
    await userEvent.type(amount, '650.5')
    await userEvent.type(
      within(dialog).getByLabelText(new RegExp(i18n.t('console.operators.reason.label'))),
      'Agreed by phone',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: R('amount.confirm') }))
    await waitFor(() => expect(onMessage).toHaveBeenCalled())
    expect(sent('POST', AMOUNT)).toEqual({ amount: 650.5, reason: 'Agreed by phone' })
  })

  it('records the refund with the method chosen and the reference', async () => {
    answers[`POST ${REFUND}`] = () =>
      json(
        200,
        leaveCase({
          status: 'REFUNDED',
          refundMethod: 'BANK_TRANSFER',
          refundedAt: '2026-10-21T10:00:00Z',
        }),
      )
    const onMessage = renderCases()
    await userEvent.click(await screen.findByRole('button', { name: R('refund.open') }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: R('refund.confirm') }))
    expect(sent('POST', REFUND)).toBeNull()

    await userEvent.click(
      within(dialog).getByRole('button', { name: new RegExp(R('refund.method')) }),
    )
    await userEvent.click(await screen.findByRole('option', { name: R('method.BANK_TRANSFER') }))
    await userEvent.type(within(dialog).getByLabelText(new RegExp(R('refund.reference'))), 'TRF-88')
    await userEvent.click(within(dialog).getByRole('button', { name: R('refund.confirm') }))
    await waitFor(() => expect(onMessage).toHaveBeenCalled())
    expect(sent('POST', REFUND)).toEqual({ method: 'BANK_TRANSFER', reference: 'TRF-88' })
  })

  it('shows a refunded case read-only with how it went back', async () => {
    answers[PAYMENTS] = () =>
      json(200, {
        items: [],
        refundCases: [
          leaveCase({
            status: 'REFUNDED',
            refundMethod: 'CASH',
            refundedAt: '2026-10-21T10:00:00Z',
            refundReference: 'RCPT-9',
          }),
        ],
        nextCursor: null,
      })
    renderCases()
    expect(await screen.findByText(R('status.REFUNDED'))).toBeTruthy()
    expect(screen.getByText(/in cash/)).toBeTruthy()
    expect(screen.getByText('RCPT-9')).toBeTruthy()
    expect(screen.queryByRole('button', { name: R('refund.open') })).toBeNull()
  })

  it('has every reason, status and method in English and Arabic', () => {
    for (const locale of [en, ar] as Record<string, unknown>[]) {
      const block = (locale.console as Record<string, Record<string, Record<string, string>>>)
        .refundCases
      for (const reason of [...REFUND_REASONS, 'OTHER']) expect(block.reason[reason]).toBeTruthy()
      for (const method of [...REFUND_METHODS, 'OTHER']) expect(block.method[method]).toBeTruthy()
      expect(block.status.OPEN).toBeTruthy()
      expect(block.status.REFUNDED).toBeTruthy()
    }
  })
})
