import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { PaymentRunCandidateDto, PaymentRunDetailDto, PaymentRunDto } from '../../api/expenditure/paymentRuns'
import { actionsFor, dueNote, groupBySupplier, ibanValid, windowEnd } from '../../lib/paymentRuns'
import { PaymentRunPage, PaymentRunsListPage } from '.'
import { AddToPaymentRunModal } from '../SupplierDetailPage/AddToPaymentRunModal'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'invoice.export', 'admin.settings.manage'],
  scopes: [],
  featureFlags: {},
}

const RUN_ID = 'run-1'
const SUPPLIER = 'sup-1'

function run(overrides: Partial<PaymentRunDto> = {}): PaymentRunDto {
  return {
    id: RUN_ID,
    reference: 'PR-0001',
    state: 'SCHEDULED',
    paymentDate: '2026-09-20',
    payerAccountId: null,
    runReference: null,
    format: 'BANK_MUSCAT_CSV',
    currency: 'OMR',
    billsTotal: 1000,
    discountTotal: 20,
    netTotal: 980,
    exportedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: '2026-09-17T08:00:00Z',
    version: 1,
    ...overrides,
  }
}

const candidate = (billId: string, number: string, supplierId = SUPPLIER, dueDate = '2026-09-19'): PaymentRunCandidateDto => ({
  billId,
  supplierId,
  supplierName: supplierId === SUPPLIER ? 'Muscat Roastery Co' : 'Sohar Steel',
  supplierBillNumber: number,
  issueDate: '2026-08-30',
  dueDate,
  outstanding: 500,
  discount: 0,
  amount: 500,
})

const DETAIL: PaymentRunDetailDto = {
  run: run(),
  items: [
    {
      id: 'i-1',
      billId: 'b-in',
      supplierId: SUPPLIER,
      supplierName: 'Muscat Roastery Co',
      supplierBillNumber: 'MR-1',
      issueDate: '2026-08-30',
      dueDate: '2026-09-18',
      amount: 980,
      discountTaken: 20,
      outstanding: 1000,
    },
  ],
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
let detail: PaymentRunDetailDto
const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(([called, init]) => String(called).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method)
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  detail = DETAIL
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
    if (url === '/api/v1/payer-bank-accounts' && method === 'GET') return json(200, [])
    if (url === '/api/v1/payer-bank-accounts' && method === 'POST')
      return json(201, { id: 'acc-1', name: 'Main account', iban: 'OM600180000012345678901', bic: null, active: true })
    if (url.startsWith('/api/v1/payment-runs/candidates')) return json(200, [candidate('b-1', 'MR-2'), candidate('b-2', 'SS-9', 'sup-2', '2026-10-30')])
    if (url.startsWith('/api/v1/payment-runs/blocked')) return json(200, [])
    if (url === '/api/v1/payment-runs' && method === 'POST') return json(201, run({ id: 'run-new', reference: 'PR-0002', state: 'DRAFT', paymentDate: null }))
    if (url.startsWith('/api/v1/payment-runs') && method === 'GET' && !url.includes('/payment-runs/'))
      return json(200, [run(), run({ id: 'run-2', reference: 'PR-0000', state: 'PAID' })])
    if (url === `/api/v1/payment-runs/${RUN_ID}` && method === 'GET') return json(200, detail)
    if (url === `/api/v1/payment-runs/${RUN_ID}` && method === 'PUT') return json(200, detail)
    if (url === `/api/v1/payment-runs/${RUN_ID}/candidates`) return json(200, [candidate('b-1', 'MR-2')])
    if (url === `/api/v1/payment-runs/${RUN_ID}/blocked`)
      return json(200, [
        { billId: 'b-held', supplierBillNumber: 'H-1', supplierId: SUPPLIER, supplierName: 'Muscat Roastery Co', dueDate: null, outstanding: 100, reasonCodes: ['ON_HOLD', 'AWAITING_APPROVALS'], approvalsGiven: 1, approvalsRequired: 2 },
      ])
    if (/\/api\/v1\/payment-runs\/[^/]+\/items$/.test(url)) return json(200, detail)
    if (url.startsWith(`/api/v1/payment-runs/${RUN_ID}/items/`) && method === 'DELETE') return json(200, { ...detail, items: [] })
    if (url === `/api/v1/payment-runs/${RUN_ID}/export`) return new Response('beneficiary,iban,amount\n', { status: 200, headers: { 'Content-Type': 'text/csv' } })
    if (url === `/api/v1/payment-runs/${RUN_ID}/mark-paid`) return json(200, run({ state: 'PAID' }))
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/payments" element={<PaymentRunsListPage />} />
        <Route path="/expenditure/payments/new" element={<PaymentRunPage />} />
        <Route path="/expenditure/payments/:runId" element={<PaymentRunPage />} />
        <Route
          path="/suppliers/:id"
          element={<AddToPaymentRunModal supplierId={SUPPLIER} supplierName="Muscat Roastery Co" currency="OMR" onClose={() => {}} />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the run rules', () => {
  it('groups bills into one transfer per supplier, and a bill with no supplier on its own', () => {
    const groups = groupBySupplier([candidate('b-1', 'A'), candidate('b-2', 'B'), { ...candidate('b-3', 'C'), supplierId: null, supplierName: null }])
    expect(groups.map((group) => group.bills.length)).toEqual([1, 2])
  })

  it('works out due windows and due notes on the Muscat day', () => {
    expect(windowEnd('thisWeek', '2026-09-17')).toBe('2026-09-24')
    expect(windowEnd('endOfMonth', '2026-02-10')).toBe('2026-02-28')
    expect(windowEnd('everything', '2026-09-17')).toBeNull()
    expect(dueNote('2026-09-15', '2026-09-17')).toEqual({ tone: 'late', key: 'paymentRuns.due.late', days: 2 })
    expect(dueNote('2026-09-30', '2026-09-17').tone).toBe('later')
  })

  it('checks an IBAN the way the server does, check digits included', () => {
    expect(ibanValid('OM60 0180 0000 1234 5678 901')).toBe(true)
    expect(ibanValid('OM810180000012345678901')).toBe(false)
  })

  it('offers only what each state allows', () => {
    expect(actionsFor('DRAFT')).toEqual({ editable: true, canExport: false, canMarkPaid: false, canCancel: true })
    expect(actionsFor('EXPORTED')).toEqual({ editable: false, canExport: true, canMarkPaid: true, canCancel: false })
    expect(actionsFor('PAID')).toEqual({ editable: false, canExport: false, canMarkPaid: false, canCancel: false })
  })
})

describe('payment runs', () => {
  it('lists runs with their state and leads into a new one', async () => {
    renderAt('/expenditure/payments')
    const row = (await screen.findByRole('link', { name: 'PR-0001' })).closest('tr') as HTMLElement
    expect(within(row).getByText('Scheduled')).toBeTruthy()
    expect(within(row).getByText('980.000')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'New payment run' }).getAttribute('href')).toBe('/expenditure/payments/new')
  })

  it('creates the run only when the first bill is ticked', async () => {
    renderAt('/expenditure/payments/new')
    const tick = await screen.findByRole('checkbox', { name: 'Select MR-2' })
    expect(calls('POST', '/api/v1/payment-runs')).toHaveLength(0)

    fireEvent.click(tick)

    await waitFor(() => expect(calls('POST', '/api/v1/payment-runs/run-new/items')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/payment-runs')[0])).toMatchObject({ currency: 'OMR', format: null, paymentDate: null })
    expect(bodyOf(calls('POST', '/api/v1/payment-runs/run-new/items')[0])).toEqual({ billIds: ['b-1'] })
  })

  it('shows a run’s bills ticked beside what it could take, and why others cannot be paid', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const inRun = await screen.findByRole('checkbox', { name: 'Select MR-1' })
    expect(inRun.getAttribute('aria-checked') ?? String((inRun as HTMLInputElement).checked)).toMatch(/true/)
    expect(await screen.findByRole('checkbox', { name: 'Select MR-2' })).toBeTruthy()
    expect(screen.getByText('20.000 OMR early-payment discount')).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: /1 bill can't be paid yet/ }))
    expect(screen.getByText('On hold · 1 of 2 approvals')).toBeTruthy()

    fireEvent.click(inRun)
    await waitFor(() => expect(calls('DELETE', `/api/v1/payment-runs/${RUN_ID}/items/b-in`)).toHaveLength(1))
  })

  it('makes the bank file for a scheduled run, and records an exported run as paid after confirming', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Make the bank file' }))
    await waitFor(() => expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/export`)).toHaveLength(1))

    detail = { ...DETAIL, run: run({ state: 'EXPORTED' }) }
    await waitFor(() => expect(calls('GET', `/api/v1/payment-runs/${RUN_ID}`).length).toBeGreaterThan(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as paid' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() => expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1))
  })

  it('lets an administrator add the account to pay from, refusing a mistyped IBAN before sending', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a bank account' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Account name/), { target: { value: 'Main account' } })
    fireEvent.change(within(dialog).getByLabelText(/IBAN/), { target: { value: 'OM810180000012345678901' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add the account' }))
    expect(await within(dialog).findByText("That IBAN isn't valid. Check it for a typo.")).toBeTruthy()
    expect(calls('POST', '/api/v1/payer-bank-accounts')).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText(/IBAN/), { target: { value: 'OM600180000012345678901' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add the account' }))
    await waitFor(() => expect(calls('PUT', `/api/v1/payment-runs/${RUN_ID}`)).toHaveLength(1))
    expect(bodyOf(calls('PUT', `/api/v1/payment-runs/${RUN_ID}`)[0])).toMatchObject({ payerAccountId: 'acc-1', format: 'BANK_MUSCAT_CSV' })
  })

  it('adds a supplier’s payable bills to a new run from the supplier page', async () => {
    renderAt('/suppliers/sup-1')
    expect(await screen.findByText('MR-2')).toBeTruthy()
    expect(screen.queryByText('SS-9')).toBeNull()
    await waitFor(() => expect(screen.getByLabelText(/PR-0001 · Scheduled/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Add to the run' }))

    await waitFor(() => expect(calls('POST', '/api/v1/payment-runs/run-new/items')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/payment-runs/run-new/items')[0])).toEqual({ billIds: ['b-1'] })
  })
})
