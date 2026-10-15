import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { ConsoleBillingPaymentsPage } from './ConsoleBillingPaymentsPage'
import { ConsoleBankAccountsPage } from './ConsoleBankAccountsPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const QUEUE = '/api/v1/platform/billing/payments'
const BENEFICIARIES = '/api/v1/platform/billing/beneficiaries'

const VERIFIER: Entitlements = {
  userId: 'u-admin',
  username: 'finance.admin',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform tenant administrator', systemRole: true }],
  permissions: [
    'platform.billing.read', 'platform.billing.evidence.read', 'platform.billing.cash.record',
    'platform.billing.verify', 'platform.billing.manage',
  ],
  scopes: [],
  featureFlags: {},
}
const SUPPORT: Entitlements = {
  ...VERIFIER,
  userId: 'u-support',
  roles: [{ id: 'r-2', code: 'PLATFORM_SUPPORT', name: 'Platform support', systemRole: true }],
  permissions: ['platform.billing.read', 'platform.billing.evidence.read', 'platform.billing.cash.record'],
}

const BILL = {
  id: 'b-1', number: 'FWT-SUB-2026-000009', planCode: 'BUSINESS', planName: 'Business', billingCycle: 'MONTHLY',
  periodStartsOn: '2026-10-23', periodEndsOn: '2026-11-22', subtotal: '80.000', vatRate: '0.05000',
  vatAmount: '4.000', total: '84.000', currency: 'OMR', taxDocumentStatus: 'NOT_A_TAX_INVOICE',
  status: 'PENDING_VERIFICATION', dueOn: '2026-10-22', issuedAt: '2026-10-18T05:00:00Z', paidAt: null,
  appliedPaidThrough: null, voidReason: null, version: 1,
}

function payment(over: Record<string, unknown> = {}) {
  return {
    id: 'p-1', tenantId: 't-1', billId: 'b-1', method: 'BANK_TRANSFER', status: 'SUBMITTED', amount: '84.000',
    submittedBy: 'u-customer', submittedAt: '2026-10-18T06:00:00Z', reference: 'TRX-1', customerNote: null,
    proofSha256: 'a'.repeat(64), proofContentType: 'application/pdf', proofSizeBytes: 1200, receiptNumber: null,
    receivedAmount: null, receivedAt: null, collectorName: null, receiptRecordedBy: null, verifiedBy: null,
    requiresSecondApproval: null, thresholdApplied: null, secondApprovedBy: null, rejectionReason: null,
    version: 3, ...over,
  }
}

const SECOND_APPROVED = {
  id: 'e-1', paymentId: 'p-1', kind: 'PAYMENT_SECOND_APPROVED', details: {}, actorId: 'u-admin',
  occurredAt: '2026-10-18T07:00:00Z',
}

/** The queue answers one page at a time (Phase 2.1). */
function page(items: unknown[], nextCursor: string | null = null) {
  return { items, nextCursor }
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
  who = VERIFIER
  answers = {}
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/billing/payments" element={<ConsoleBillingPaymentsPage />} />
        <Route path="/console/billing/accounts" element={<ConsoleBankAccountsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function headerOf(init: RequestInit | undefined, name: string) {
  return (init?.headers as Record<string, string> | undefined)?.[name]
}

async function openFirst(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: i18n.t('console.billing.open') }))
  return within(await screen.findByRole('region', { name: /FWT-SUB-2026-000009/ }))
}

describe('Console › Subscription payments', () => {
  it('verifies with If-Match carrying the version read, and says what happened', async () => {
    answers[QUEUE] = () => json(200, page([{ payment: payment(), bill: BILL, tenantName: 'Payments LLC' }]))
    answers[`${QUEUE}/p-1`] = () => json(200, { payment: payment(), bill: BILL, tenantName: 'Payments LLC', history: [] })
    answers[`POST ${QUEUE}/p-1/verification`] = () =>
      json(200, { payment: payment({ status: 'AWAITING_SECOND_APPROVAL', version: 4 }), bill: BILL, tenantName: 'Payments LLC', history: [] })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/payments')

    expect(await screen.findByText('Payments LLC')).toBeTruthy()
    const panel = await openFirst(user)
    await user.click(panel.getByRole('button', { name: i18n.t('console.billing.verify') }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/p-1/verification')
        && headerOf(init, 'If-Match') === '"3"')).toBe(true),
    )
    expect(await screen.findByText(i18n.t('console.billing.done.verified'))).toBeTruthy()
  })

  it('names the four-eyes refusal when the same person tries to approve twice', async () => {
    const awaiting = payment({ status: 'AWAITING_SECOND_APPROVAL', verifiedBy: 'u-admin', requiresSecondApproval: true, thresholdApplied: '50.000' })
    answers[QUEUE] = () => json(200, page([{ payment: awaiting, bill: BILL, tenantName: 'Payments LLC' }]))
    answers[`${QUEUE}/p-1`] = () =>
      json(200, { payment: awaiting, bill: BILL, tenantName: 'Payments LLC', history: [SECOND_APPROVED] })
    answers[`POST ${QUEUE}/p-1/second-approval`] = () =>
      json(403, { type: 'https://api.fawtir.om/problems/payment-approver-not-independent' })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/payments')

    const panel = await openFirst(user)
    expect(panel.getByText(i18n.t('console.billing.secondNeeded'))).toBeTruthy()
    expect(panel.getByText(i18n.t('console.billing.event.PAYMENT_SECOND_APPROVED'), { exact: false })).toBeTruthy()
    await user.click(panel.getByRole('button', { name: i18n.t('console.billing.approveSecond') }))
    expect(await screen.findByText(i18n.t('console.billing.refusal.payment-approver-not-independent'))).toBeTruthy()
  })

  it('asks the cash verifier to confirm again above the threshold, where a transfer needs a second approver', async () => {
    const awaiting = payment({
      method: 'CASH', reference: null, proofSha256: null, proofContentType: null, status: 'AWAITING_SECOND_APPROVAL',
      verifiedBy: 'u-admin', requiresSecondApproval: true, thresholdApplied: '50.000', version: 4,
    })
    answers[QUEUE] = () => json(200, page([{ payment: awaiting, bill: BILL, tenantName: 'Payments LLC' }]))
    answers[`${QUEUE}/p-1`] = () =>
      json(200, { payment: awaiting, bill: BILL, tenantName: 'Payments LLC', history: [SECOND_APPROVED] })
    answers[`POST ${QUEUE}/p-1/second-approval`] = () =>
      json(200, { payment: { ...awaiting, status: 'CONFIRMED', version: 5 }, bill: BILL, tenantName: 'Payments LLC', history: [] })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/payments')

    const panel = await openFirst(user)
    expect(panel.getByText(i18n.t('console.billing.secondNeededCash'))).toBeTruthy()
    // The note names the threshold with the drawn rial sign (OMR survives only for screen readers).
    const note = panel.getByText((_, el) => el?.tagName === 'P' && /50\.000/.test(el.textContent ?? ''))
    expect(note.querySelector('svg')).toBeTruthy()
    expect(panel.queryByRole('button', { name: i18n.t('console.billing.approveSecond') })).toBeNull()
    expect(panel.getByText(i18n.t('console.billing.event.PAYMENT_CONFIRMED_AGAIN'), { exact: false })).toBeTruthy()
    expect(panel.queryByText(i18n.t('console.billing.event.PAYMENT_SECOND_APPROVED'), { exact: false })).toBeNull()
    await user.click(panel.getByRole('button', { name: i18n.t('console.billing.confirmAgain') }))
    expect(await screen.findByText(i18n.t('console.billing.done.confirmedAgain'))).toBeTruthy()
  })

  it('offers confirm again on cash only to its verifier, not to the operator who recorded it', async () => {
    const awaiting = payment({
      method: 'CASH', reference: null, proofSha256: null, proofContentType: null, status: 'AWAITING_SECOND_APPROVAL',
      receiptRecordedBy: 'u-admin', verifiedBy: 'u-other', requiresSecondApproval: true, thresholdApplied: '50.000',
      version: 4,
    })
    answers[QUEUE] = () => json(200, page([{ payment: awaiting, bill: BILL, tenantName: 'Payments LLC' }]))
    answers[`${QUEUE}/p-1`] = () => json(200, { payment: awaiting, bill: BILL, tenantName: 'Payments LLC', history: [] })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/payments')

    const panel = await openFirst(user)
    expect(panel.getByText(i18n.t('console.billing.secondNeededCash'))).toBeTruthy()
    expect(panel.queryByRole('button', { name: i18n.t('console.billing.confirmAgain') })).toBeNull()
    expect(panel.queryByRole('button', { name: i18n.t('console.billing.approveSecond') })).toBeNull()
    expect(panel.queryByText((_, el) => el?.tagName === 'P' && /Confirm again\./.test(el.textContent ?? ''))).toBeNull()
  })

  it('still offers a bank transfer second approval to an operator who did not verify it', async () => {
    const awaiting = payment({
      status: 'AWAITING_SECOND_APPROVAL', verifiedBy: 'u-other', requiresSecondApproval: true, thresholdApplied: '50.000',
    })
    answers[QUEUE] = () => json(200, page([{ payment: awaiting, bill: BILL, tenantName: 'Payments LLC' }]))
    answers[`${QUEUE}/p-1`] = () => json(200, { payment: awaiting, bill: BILL, tenantName: 'Payments LLC', history: [] })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/payments')

    const panel = await openFirst(user)
    expect(panel.getByRole('button', { name: i18n.t('console.billing.approveSecond') })).toBeTruthy()
    expect(panel.queryByRole('button', { name: i18n.t('console.billing.confirmAgain') })).toBeNull()
  })

  it('loads the next page of the queue from the cursor and keeps the first page', async () => {
    answers[QUEUE] = () => json(200, page([{ payment: payment(), bill: BILL, tenantName: 'Payments LLC' }], 'cursor-2'))
    answers[`${QUEUE}?after=cursor-2`] = () => json(200, page([{
      payment: payment({ id: 'p-2', tenantId: 't-2' }), bill: { ...BILL, id: 'b-2', number: 'FWT-SUB-2026-000010' },
      tenantName: 'Second LLC',
    }]))
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/payments')

    expect(await screen.findByText('Payments LLC')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('console.billing.loadMore') }))

    expect(await screen.findByText('Second LLC')).toBeTruthy()
    expect(screen.getByText('Payments LLC')).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.billing.loadMore') })).toBeNull()
  })

  it('says to reject a payment whose bill no longer matches the plan', async () => {
    answers[QUEUE] = () => json(200, page([{ payment: payment(), bill: BILL, tenantName: 'Payments LLC' }]))
    answers[`${QUEUE}/p-1`] = () => json(200, { payment: payment(), bill: BILL, tenantName: 'Payments LLC', history: [] })
    answers[`POST ${QUEUE}/p-1/verification`] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/bill-stale' })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/payments')

    const panel = await openFirst(user)
    await user.click(panel.getByRole('button', { name: i18n.t('console.billing.verify') }))
    expect(await screen.findByText(i18n.t('console.billing.refusal.bill-stale'))).toBeTruthy()
  })

  it('lets support record a cash receipt but offers no verification', async () => {
    who = SUPPORT
    const cash = payment({ method: 'CASH', reference: null, proofSha256: null, proofContentType: null, amount: '36.750' })
    const bill = { ...BILL, total: '36.750' }
    answers[QUEUE] = () => json(200, page([{ payment: cash, bill, tenantName: 'Payments LLC' }]))
    answers[`${QUEUE}/p-1`] = () => json(200, { payment: cash, bill, tenantName: 'Payments LLC', history: [] })
    answers[`POST ${QUEUE}/p-1/cash-receipt`] = () =>
      json(200, { payment: { ...cash, status: 'RECEIPT_RECORDED', version: 4 }, bill, tenantName: 'Payments LLC', history: [] })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/payments')

    const panel = await openFirst(user)
    expect(panel.queryByRole('button', { name: i18n.t('console.billing.verify') })).toBeNull()
    expect(panel.queryByRole('button', { name: i18n.t('console.billing.reject') })).toBeNull()
    await user.type(panel.getByRole('textbox', { name: i18n.t('console.billing.cash.number') }), 'RC-77')
    await user.type(panel.getByRole('textbox', { name: i18n.t('console.billing.cash.time') }), '10:30')
    await user.type(panel.getByRole('textbox', { name: i18n.t('console.billing.cash.collector') }), 'Salim')
    await user.click(panel.getByRole('button', { name: i18n.t('console.billing.cash.record') }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/p-1/cash-receipt'))
      expect(call).toBeTruthy()
      expect(headerOf(call![1], 'If-Match')).toBe('"3"')
      expect(JSON.parse(String(call![1]?.body))).toMatchObject({ receiptNumber: 'RC-77', receivedAmount: '36.750', collectorName: 'Salim' })
      // The cashier's clock is Muscat's, whatever zone the operator's browser is in.
      expect(JSON.parse(String(call![1]?.body)).receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T10:30:00\+04:00$/)
    })
  })
})

describe('Console › Bank account', () => {
  it('shows a proposed account as needing confirmation, and the confirming operator sends If-Match', async () => {
    answers[BENEFICIARIES] = () => json(200, [{
      id: 'a-1', legalName: 'Fawtir LLC', bankName: 'Bank Muscat', iban: 'OM810180000001299123456', swiftCode: null,
      status: 'PENDING_CONFIRMATION', reason: 'Main account', createdBy: 'u-other', createdAt: '2026-10-18T05:00:00Z',
      confirmedBy: null, version: 0,
    }])
    answers[`POST ${BENEFICIARIES}/a-1/confirmation`] = () => json(200, {})
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/accounts')

    expect(await screen.findByText(i18n.t('console.bankAccounts.status.PENDING_CONFIRMATION'))).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('console.bankAccounts.confirm') }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/a-1/confirmation')
        && headerOf(init, 'If-Match') === '"0"')).toBe(true),
    )
  })

  it('names the refusal when the person who entered the account tries to confirm it', async () => {
    answers[BENEFICIARIES] = () => json(200, [{
      id: 'a-1', legalName: 'Fawtir LLC', bankName: 'Bank Muscat', iban: 'OM810180000001299123456', swiftCode: null,
      status: 'PENDING_CONFIRMATION', reason: 'Main account', createdBy: 'u-admin', createdAt: '2026-10-18T05:00:00Z',
      confirmedBy: null, version: 0,
    }])
    answers[`POST ${BENEFICIARIES}/a-1/confirmation`] = () =>
      json(403, { type: 'https://api.fawtir.om/problems/payment-approver-not-independent' })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/accounts')

    await user.click(await screen.findByRole('button', { name: i18n.t('console.bankAccounts.confirm') }))
    expect(await screen.findByText(i18n.t('console.bankAccounts.refusal.sameOperator'))).toBeTruthy()
  })
})

describe('Console › Bank account, retiring the live account', () => {
  it('asks before retiring the account customers pay into, and sends nothing on Keep it', async () => {
    answers[BENEFICIARIES] = () => json(200, [{
      id: 'a-1', legalName: 'Fawtir LLC', bankName: 'Bank Muscat', iban: 'OM810180000001299123456', swiftCode: null,
      status: 'ACTIVE', reason: 'Main account', createdBy: 'u-other', createdAt: '2026-10-18T05:00:00Z',
      confirmedBy: 'u-third', version: 2,
    }])
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/accounts')

    await user.click(await screen.findByRole('button', { name: i18n.t('console.bankAccounts.retire') }))
    expect(screen.getByText(i18n.t('console.bankAccounts.retireConfirm'))).toBeTruthy()
    await user.click(screen.getByRole('button', { name: i18n.t('console.bankAccounts.keep') }))
    expect(screen.queryByText(i18n.t('console.bankAccounts.retireConfirm'))).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/retire'))).toBe(false)
  })
})
