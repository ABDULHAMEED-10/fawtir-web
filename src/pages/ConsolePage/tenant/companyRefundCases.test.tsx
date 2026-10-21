import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import en from '../../../i18n/locales/en.json'
import ar from '../../../i18n/locales/ar.json'
import { resetSharedRequests } from '../../../api'
import { REFUND_METHODS, REFUND_REASONS } from '../../../lib/console/refundCases'
import { muscatToday } from '../../../lib/invoiceIssue'
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

describe('CompanyRefundCases', () => {
  it('lists the cases; both open cases can be marked refunded, only the console case changes its amount', async () => {
    renderCases()
    expect(await screen.findByText(R('reason.LEFT_FAWTIR_ANNUAL'))).toBeTruthy()
    expect(screen.getByText(R('reason.CANCELLED_BY_CUSTOMER'))).toBeTruthy()
    expect(screen.getByText(/7 whole months/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: R('refund.open') })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: R('amount.open') })).toHaveLength(1)
    // Only the yearly remaining months may be declined; the Finance case is always refunded.
    expect(screen.getAllByRole('button', { name: R('decline.open') })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: R('waive.open') })).toHaveLength(1)
  })

  it('RF-2: marks a Finance case refunded at its amount, with the day it went back', async () => {
    const FINANCE_REFUND = `${COMPANY}/subscription/refund-cases/c-2/refund`
    answers[PAYMENTS] = () =>
      json(200, {
        items: [],
        refundCases: [{ ...financeCase, reason: 'FINAL_REJECTION' }],
        nextCursor: null,
      })
    answers[`POST ${FINANCE_REFUND}`] = () =>
      json(200, {
        ...financeCase,
        reason: 'FINAL_REJECTION',
        status: 'REFUNDED',
        refundMethod: 'CARD',
        refundedAt: '2026-10-22T10:00:00Z',
        refundedOn: '2026-10-21',
      })
    const onMessage = renderCases()
    await userEvent.click(await screen.findByRole('button', { name: R('refund.open') }))
    expect(screen.queryByRole('button', { name: R('amount.open') })).toBeNull()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(R('refund.bodyFinance'))).toBeTruthy()
    await userEvent.click(methodPicker(dialog))
    await userEvent.click(await screen.findByRole('option', { name: R('method.CARD') }))
    await userEvent.type(
      within(dialog).getByLabelText(new RegExp(R('refund.reference'))),
      'PAYMOB-RF-9',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: R('refund.confirm') }))
    await waitFor(() => expect(onMessage).toHaveBeenCalled())
    expect(sent('POST', FINANCE_REFUND)).toEqual({
      method: 'CARD',
      reference: 'PAYMOB-RF-9',
      refundedOn: muscatToday(),
    })
  })

  it('settles the monthly leaving case and the yearly cancellation case here too', async () => {
    answers[PAYMENTS] = () =>
      json(200, {
        items: [],
        refundCases: [
          leaveCase({ reason: 'LEFT_FAWTIR_MONTHLY', monthsRefunded: 1, amount: '105.000' }),
          leaveCase({ id: 'c-3', reason: 'CANCELLED_ANNUAL_REMAINING', disconnectionId: null }),
        ],
        nextCursor: null,
      })
    renderCases()
    expect(await screen.findByText(R('reason.LEFT_FAWTIR_MONTHLY'))).toBeTruthy()
    expect(screen.getByText(R('reason.CANCELLED_ANNUAL_REMAINING'))).toBeTruthy()
    expect(screen.getByText(/1 whole month(?!s)/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: R('refund.open') })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: R('amount.open') })).toHaveLength(2)
    // CA-1, LV-6: only the yearly remaining months may be closed without a refund; the monthly period
    // paid ahead is always refunded, unless the customer gives it up in writing.
    expect(screen.getAllByRole('button', { name: R('decline.open') })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: R('waive.open') })).toHaveLength(1)
  })

  it('records that the customer gave up an always-refunded refund, with written evidence and a reference', async () => {
    const WAIVE = `${COMPANY}/subscription/refund-cases/c-2/waive`
    answers[PAYMENTS] = () => json(200, { items: [], refundCases: [financeCase], nextCursor: null })
    answers[`POST ${WAIVE}`] = () => json(200, { ...financeCase, status: 'WAIVED' })
    const onMessage = renderCases()
    expect(await screen.findByText(R('reason.CANCELLED_BY_CUSTOMER'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: R('decline.open') })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: R('waive.open') }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: R('waive.confirm') }))
    expect(sent('POST', WAIVE)).toBeNull()

    await userEvent.type(
      within(dialog).getByLabelText(new RegExp(R('waive.evidence'))),
      'Keep it, we do not want it back',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: R('waive.confirm') }))
    expect(sent('POST', WAIVE)).toBeNull()
    await userEvent.type(within(dialog).getByLabelText(new RegExp(R('waive.reference'))), 'MAIL-7')
    await userEvent.click(within(dialog).getByRole('button', { name: R('waive.confirm') }))
    await waitFor(() => expect(onMessage).toHaveBeenCalled())
    expect(sent('POST', WAIVE)).toEqual({
      evidence: 'Keep it, we do not want it back',
      reference: 'MAIL-7',
    })
  })

  it('shows a waived case with the customer evidence and its reference, read-only', async () => {
    answers[PAYMENTS] = () =>
      json(200, {
        items: [],
        refundCases: [
          leaveCase({
            reason: 'LEFT_FAWTIR_MONTHLY',
            status: 'WAIVED',
            waivedAt: '2026-10-21T10:00:00Z',
            waiveEvidence: 'Keep the month',
            waiveReference: 'MAIL-7',
          }),
        ],
        nextCursor: null,
      })
    renderCases()
    expect(await screen.findByText(R('status.WAIVED'))).toBeTruthy()
    expect(screen.getByText(/Keep the month/)).toBeTruthy()
    expect(screen.getByText('MAIL-7')).toBeTruthy()
    expect(screen.queryByRole('button', { name: R('waive.open') })).toBeNull()
    expect(screen.queryByRole('button', { name: R('refund.open') })).toBeNull()
  })

  it('shows the approval day and the refund day as days, never raw timestamps', async () => {
    answers[PAYMENTS] = () =>
      json(200, {
        items: [],
        refundCases: [
          leaveCase({
            status: 'REFUNDED',
            refundMethod: 'CASH',
            openedAt: '2026-10-20T21:30:00Z',
            refundedAt: '2026-10-21T10:00:00Z',
            approvedOn: '2026-10-21',
            refundedOn: '2026-10-23',
          }),
        ],
        nextCursor: null,
      })
    renderCases()
    // 21:30 UTC on 20 Oct is already 21 Oct in Muscat.
    expect(await screen.findByText(/Opened 21 Oct 2026/)).toBeTruthy()
    expect(screen.getByText(/Approved on 21 Oct 2026/)).toBeTruthy()
    expect(screen.getByText(/in cash on 23 Oct 2026/)).toBeTruthy()
    expect(screen.queryByText(/T\d{2}:\d{2}/)).toBeNull()
  })

  it('a console refund is approved today: its body no longer speaks of working the amount out again', async () => {
    renderCases()
    await userEvent.click((await screen.findAllByRole('button', { name: R('refund.open') }))[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(R('refund.body'))).toBeTruthy()
    expect(R('refund.body')).not.toMatch(/worked out again/)
  })

  it('closes a case without a refund, with a reason, and shows it read-only', async () => {
    const DECLINE = `${COMPANY}/subscription/refund-cases/${CASE_ID}/decline`
    answers[`POST ${DECLINE}`] = () =>
      json(200, leaveCase({ status: 'DECLINED', declineReason: 'Contract excludes refunds' }))
    const onMessage = renderCases()
    expect(await screen.findAllByText(R('status.UNDER_REVIEW'))).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: R('decline.open') }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(
      within(dialog).getByLabelText(new RegExp(i18n.t('console.operators.reason.label'))),
      'Contract excludes refunds',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: R('decline.confirm') }))
    await waitFor(() => expect(onMessage).toHaveBeenCalled())
    expect(sent('POST', DECLINE)).toEqual({ reason: 'Contract excludes refunds' })
  })

  it('shows a declined case with its reason', async () => {
    answers[PAYMENTS] = () =>
      json(200, {
        items: [],
        refundCases: [
          leaveCase({ status: 'DECLINED', declineReason: 'Contract excludes refunds' }),
        ],
        nextCursor: null,
      })
    renderCases()
    expect(await screen.findByText(R('status.DECLINED'))).toBeTruthy()
    expect(screen.getByText(/Contract excludes refunds/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: R('decline.open') })).toBeNull()
  })

  it('shows a withdrawn case closed, with no actions', async () => {
    answers[PAYMENTS] = () =>
      json(200, {
        items: [],
        refundCases: [leaveCase({ status: 'WITHDRAWN', withdrawnAt: '2026-10-22T08:00:00Z' })],
        nextCursor: null,
      })
    renderCases()
    expect(await screen.findByText(R('status.WITHDRAWN'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: R('refund.open') })).toBeNull()
    expect(screen.queryByRole('button', { name: R('amount.open') })).toBeNull()
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
    // The leaving case is listed first; the Finance case below it has its own button.
    await userEvent.click((await screen.findAllByRole('button', { name: R('refund.open') }))[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: R('refund.confirm') }))
    expect(sent('POST', REFUND)).toBeNull()

    await userEvent.click(methodPicker(dialog))
    await userEvent.click(await screen.findByRole('option', { name: R('method.BANK_TRANSFER') }))
    await userEvent.type(within(dialog).getByLabelText(new RegExp(R('refund.reference'))), 'TRF-88')
    await userEvent.click(within(dialog).getByRole('button', { name: R('refund.confirm') }))
    await waitFor(() => expect(onMessage).toHaveBeenCalled())
    expect(sent('POST', REFUND)).toEqual({
      method: 'BANK_TRANSFER',
      reference: 'TRF-88',
      refundedOn: muscatToday(),
    })
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
      expect(block.status.WITHDRAWN).toBeTruthy()
      expect(block.status.DECLINED).toBeTruthy()
      expect(block.status.UNDER_REVIEW).toBeTruthy()
      expect(block.status.WAIVED).toBeTruthy()
      expect(block.waive.open).toBeTruthy()
      expect(block.approvedOn).toBeTruthy()
    }
  })
})
