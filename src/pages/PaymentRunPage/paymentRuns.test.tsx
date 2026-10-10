import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  PaymentRunCandidateDto,
  PaymentRunDetailDto,
  PaymentRunDto,
} from '../../api/expenditure/paymentRuns'
import {
  actionsFor,
  discountPercent,
  dueNote,
  groupBySupplier,
  bankDetailsChangedIn,
  ibanValid,
  markPaidDateFor,
  markPaidDateProblem,
  paidOn,
  supplierTile,
  windowEnd,
} from '../../lib/paymentRuns'
import { formatDate } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import { formatDisplayDate } from '../../lib/dates'
import { PaymentRunPage, PaymentRunsListPage } from '.'
import { AddToPaymentRunModal } from '../SupplierDetailPage/AddToPaymentRunModal'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: [
    'invoice.read',
    'invoice.payment.manage',
    'invoice.export',
    'admin.settings.manage',
  ],
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

const candidate = (
  billId: string,
  number: string,
  supplierId = SUPPLIER,
  dueDate = '2026-09-19',
): PaymentRunCandidateDto => ({
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
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let detail: PaymentRunDetailDto
/** An answer a test puts ahead of the usual ones, or null to answer as usual. */
let override: ((url: string, method: string) => Response | null) | null
const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([called, init]) =>
      String(called).startsWith(prefix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  detail = DETAIL
  override = null
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const forced = override?.(url, method)
    if (forced) return forced
    if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
    if (url === '/api/v1/payer-bank-accounts' && method === 'GET') return json(200, [])
    if (url === '/api/v1/payer-bank-accounts' && method === 'POST')
      return json(201, {
        id: 'acc-1',
        name: 'Main account',
        iban: 'OM600180000012345678901',
        bic: null,
        active: true,
      })
    if (url.startsWith('/api/v1/payment-runs/candidates'))
      return json(200, [candidate('b-1', 'MR-2'), candidate('b-2', 'SS-9', 'sup-2', '2026-10-30')])
    if (url.startsWith('/api/v1/payment-runs/blocked')) return json(200, [])
    if (url === '/api/v1/payment-runs' && method === 'POST')
      return json(
        201,
        run({ id: 'run-new', reference: 'PR-0002', state: 'DRAFT', paymentDate: null }),
      )
    if (
      url.startsWith('/api/v1/payment-runs') &&
      method === 'GET' &&
      !url.includes('/payment-runs/')
    )
      return json(200, [run(), run({ id: 'run-2', reference: 'PR-0000', state: 'PAID' })])
    if (url === `/api/v1/payment-runs/${RUN_ID}` && method === 'GET') return json(200, detail)
    if (url === `/api/v1/payment-runs/${RUN_ID}` && method === 'PUT') return json(200, detail)
    if (url === `/api/v1/payment-runs/${RUN_ID}/candidates`)
      return json(200, [candidate('b-1', 'MR-2')])
    if (url === `/api/v1/payment-runs/${RUN_ID}/blocked`)
      return json(200, [
        {
          billId: 'b-held',
          supplierBillNumber: 'H-1',
          supplierId: SUPPLIER,
          supplierName: 'Muscat Roastery Co',
          dueDate: null,
          outstanding: 100,
          reasonCodes: ['ON_HOLD', 'AWAITING_APPROVALS'],
          approvalsGiven: 1,
          approvalsRequired: 2,
        },
      ])
    if (/\/api\/v1\/payment-runs\/[^/]+\/items$/.test(url)) return json(200, detail)
    if (url.startsWith(`/api/v1/payment-runs/${RUN_ID}/items/`) && method === 'DELETE')
      return json(200, { ...detail, items: [] })
    if (url === `/api/v1/payment-runs/${RUN_ID}/export`)
      return new Response('beneficiary,iban,amount\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      })
    if (url === `/api/v1/payment-runs/${RUN_ID}/mark-paid`) return json(200, run({ state: 'PAID' }))
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
  )
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
          element={
            <AddToPaymentRunModal
              supplierId={SUPPLIER}
              supplierName="Muscat Roastery Co"
              currency="OMR"
              bankName={null}
              discountPercent={null}
              discountDays={null}
              onClose={() => {}}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the run rules', () => {
  it('groups bills into one transfer per supplier, and a bill with no supplier on its own', () => {
    const groups = groupBySupplier([
      candidate('b-1', 'A'),
      candidate('b-2', 'B'),
      { ...candidate('b-3', 'C'), supplierId: null, supplierName: null },
    ])
    expect(groups.map((group) => group.bills.length)).toEqual([1, 2])
  })

  it('works out due windows and due notes on the Muscat day', () => {
    expect(windowEnd('thisWeek', '2026-09-17')).toBe('2026-09-24')
    expect(windowEnd('endOfMonth', '2026-02-10')).toBe('2026-02-28')
    expect(windowEnd('everything', '2026-09-17')).toBeNull()
    expect(dueNote('2026-09-15', '2026-09-17')).toEqual({
      tone: 'late',
      key: 'paymentRuns.due.late',
      days: 2,
    })
    expect(dueNote('2026-09-30', '2026-09-17').tone).toBe('later')
  })

  it('checks an IBAN the way the server does, check digits included', () => {
    expect(ibanValid('OM60 0180 0000 1234 5678 901')).toBe(true)
    expect(ibanValid('OM810180000012345678901')).toBe(false)
  })

  // Owner, 9 Oct 2026: no bank files, so a draft or scheduled run is marked paid as it stands.
  it('offers only what each state allows', () => {
    expect(actionsFor('DRAFT')).toEqual({ editable: true, canMarkPaid: true, canCancel: true })
    expect(actionsFor('SCHEDULED')).toEqual({ editable: true, canMarkPaid: true, canCancel: true })
    expect(actionsFor('EXPORTED')).toEqual({
      editable: false,
      canMarkPaid: true,
      canCancel: false,
    })
    expect(actionsFor('PAID')).toEqual({ editable: false, canMarkPaid: false, canCancel: false })
    expect(actionsFor('CANCELLED')).toEqual({
      editable: false,
      canMarkPaid: false,
      canCancel: false,
    })
  })

  it("dates a paid run's bills as the server records them: its payment date, unless that was later", () => {
    // Marked paid at 21:30 UTC on 19 Sep, which is already 20 Sep in Muscat.
    const paidAt = '2026-09-19T21:30:00Z'
    expect(paidOn({ paymentDate: '2026-09-18', paidAt })).toBe('2026-09-18')
    expect(paidOn({ paymentDate: '2026-09-20', paidAt })).toBe('2026-09-20')
    expect(paidOn({ paymentDate: '2026-09-25', paidAt })).toBe('2026-09-20')
    expect(paidOn({ paymentDate: null, paidAt })).toBe('2026-09-20')
    expect(paidOn({ paymentDate: null, paidAt: null })).toBeNull()
  })

  it('prints the saving as the design does, and draws a tile for a supplier with no logo', () => {
    expect(discountPercent(20, 1000)).toBe(2)
    expect(discountPercent(0, 1000)).toBe(0)
    expect(supplierTile('Muscat Roastery Co').initials).toBe('MR')
    expect(supplierTile(null).initials).toBe('?')
  })
})

describe('payment runs', () => {
  it('lists runs with their state and leads into a new one', async () => {
    renderAt('/expenditure/payments')
    const row = (await screen.findByRole('link', { name: 'PR-0001' }, { timeout: 8000 })).closest(
      'tr',
    ) as HTMLElement
    expect(within(row).getByText('Scheduled')).toBeTruthy()
    // The rial sign, never the word: the figure stands on its own beside the drawn mark.
    expect(within(row).getByText('980.000')).toBeTruthy()
    expect(within(row).getByText('980.000').parentElement!.querySelector('svg')).not.toBeNull()
    expect(row.textContent).not.toContain('OMR')
    // No bank format column (owner, 9 Oct 2026), though the run still carries one.
    expect(screen.queryByText('How to send it to the bank')).toBeNull()
    expect(within(row).queryByText('Bank Muscat CSV')).toBeNull()
    expect(screen.getByRole('link', { name: 'New payment run' }).getAttribute('href')).toBe(
      '/expenditure/payments/new',
    )
  })

  it('creates the run only when the first bill is ticked', async () => {
    renderAt('/expenditure/payments/new')
    const tick = await screen.findByRole('checkbox', { name: 'Select MR-2' })
    expect(calls('POST', '/api/v1/payment-runs')).toHaveLength(0)

    fireEvent.click(tick)

    await waitFor(() => expect(calls('POST', '/api/v1/payment-runs/run-new/items')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/payment-runs')[0])).toMatchObject({
      currency: 'OMR',
      format: null,
      paymentDate: null,
    })
    expect(bodyOf(calls('POST', '/api/v1/payment-runs/run-new/items')[0])).toEqual({
      billIds: ['b-1'],
    })
  })

  it('shows a run’s bills ticked beside what it could take, and why others cannot be paid', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const inRun = await screen.findByRole('checkbox', { name: 'Select MR-1' })
    expect(
      inRun.getAttribute('aria-checked') ?? String((inRun as HTMLInputElement).checked),
    ).toMatch(/true/)
    expect(await screen.findByRole('checkbox', { name: 'Select MR-2' })).toBeTruthy()
    // The 20.000 taken off 1,000.000 is printed as the design prints it.
    expect(screen.getByText('2% saved by paying early')).toBeTruthy()

    // The blocked list opens as drawn; its row says why the bill cannot be paid.
    expect(
      await screen.findByRole('button', { name: /1 more bill can't be paid yet/ }),
    ).toBeTruthy()
    expect(screen.getByText('On hold · 1 of 2 approvals')).toBeTruthy()

    fireEvent.click(inRun)
    await waitFor(() =>
      expect(calls('DELETE', `/api/v1/payment-runs/${RUN_ID}/items/b-in`)).toHaveLength(1),
    )
  })

  it('marks a scheduled run paid after confirming, with no bank file made', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as paid' }, { timeout: 8000 }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
    // The dialog's date, the run's own (owner, 10 Oct 2026), and nothing else.
    expect(bodyOf(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)[0])).toEqual({
      paymentDate: '2026-09-20',
    })
    expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/export`)).toHaveLength(0)
  })

  it('lets an administrator add the account to pay from, refusing a mistyped IBAN before sending', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a bank account' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Account name/), {
      target: { value: 'Main account' },
    })
    fireEvent.change(within(dialog).getByLabelText(/IBAN/), {
      target: { value: 'OM810180000012345678901' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add the account' }))
    expect(
      await within(dialog).findByText("That IBAN isn't valid. Check it for a typo."),
    ).toBeTruthy()
    expect(calls('POST', '/api/v1/payer-bank-accounts')).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText(/IBAN/), {
      target: { value: 'OM600180000012345678901' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add the account' }))
    await waitFor(() => expect(calls('PUT', `/api/v1/payment-runs/${RUN_ID}`)).toHaveLength(1))
    expect(bodyOf(calls('PUT', `/api/v1/payment-runs/${RUN_ID}`)[0])).toMatchObject({
      payerAccountId: 'acc-1',
      format: 'BANK_MUSCAT_CSV',
    })
  })

  it('adds a supplier’s payable bills to a new run from the supplier page', async () => {
    renderAt('/suppliers/sup-1')
    expect(await screen.findByText('MR-2')).toBeTruthy()
    expect(screen.queryByText('SS-9')).toBeNull()
    // The open run is offered first (Figma 163:29156); a run of their own is the other choice.
    expect(await screen.findByRole('radio', { name: /PR-0001/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Start a run just for them/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start the run' }))

    await waitFor(() => expect(calls('POST', '/api/v1/payment-runs/run-new/items')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/payment-runs/run-new/items')[0])).toEqual({
      billIds: ['b-1'],
    })
  })
})

/** The server's refusal of a refused debit note, naming it beside the code. */
const debitNoteRefused = () =>
  json(400, {
    type: 'https://api.fawtir.om/problems/expenditure-refused',
    status: 400,
    error: 'PAYMENT_RUN_DEBIT_NOTE_REFUSED',
    detail: 'Debit note DN-7 is refused',
    billId: 'b-dn-7',
    supplierBillNumber: 'DN-7',
  })

describe('a refused supplier debit note in a payment run (owner, 8 Oct 2026)', () => {
  it('names the note when adding it to a run is refused', async () => {
    override = (url, method) =>
      method === 'POST' && url.endsWith('/items') ? debitNoteRefused() : null
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select MR-2' }))
    expect(
      await screen.findByText('DN-7 was refused, so it cannot go into a payment run.'),
    ).toBeTruthy()
    expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/items`)).toHaveLength(1)
  })

  it('names the note when adding from the supplier page is refused', async () => {
    override = (url, method) =>
      method === 'POST' && url.endsWith('/items') ? debitNoteRefused() : null
    renderAt('/suppliers/sup-1')
    expect(await screen.findByText('MR-2')).toBeTruthy()
    fireEvent.click(await screen.findByRole('radio', { name: /Start a run just for them/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start the run' }))
    expect(
      await screen.findByText('DN-7 was refused, so it cannot go into a payment run.'),
    ).toBeTruthy()
  })

  it('names the note when marking the run paid is refused', async () => {
    detail = { ...DETAIL, run: run({ state: 'EXPORTED' }) }
    override = (url) => (url.endsWith(`/${RUN_ID}/mark-paid`) ? debitNoteRefused() : null)
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as paid' }, { timeout: 8000 }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as paid' }))
    expect(
      await screen.findByText(
        'DN-7 was refused after it joined this run. Mark the others paid and take DN-7 out of the run.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/^The server refused this\./)).toBeNull()
  })

  it('says why a refused debit note cannot be paid in words, not its code', async () => {
    override = (url) =>
      url === `/api/v1/payment-runs/${RUN_ID}/blocked`
        ? json(200, [
            {
              billId: 'b-dn-7',
              supplierBillNumber: 'DN-7',
              supplierId: SUPPLIER,
              supplierName: 'Muscat Roastery Co',
              dueDate: null,
              outstanding: 50,
              reasonCodes: ['DEBIT_NOTE_REFUSED'],
              approvalsGiven: null,
              approvalsRequired: null,
            },
          ])
        : null
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByRole('button', { name: /1 more bill can't be paid yet/ }),
    ).toBeTruthy()
    expect(screen.getByText('Refused')).toBeTruthy()
    expect(screen.queryByText(/DEBIT_NOTE_REFUSED/)).toBeNull()
  })

  it('calls a refused debit note "Refused" on the supplier page, as the run page does', async () => {
    const blockedRow = (billId: string, number: string, reasonCodes: string[]) => ({
      billId,
      supplierBillNumber: number,
      supplierId: SUPPLIER,
      supplierName: 'Muscat Roastery Co',
      dueDate: null,
      outstanding: 50,
      reasonCodes,
      approvalsGiven: null,
      approvalsRequired: null,
    })
    override = (url) =>
      url.startsWith('/api/v1/payment-runs/blocked')
        ? json(200, [
            blockedRow('b-dn-7', 'DN-7', ['DEBIT_NOTE_REFUSED']),
            blockedRow('b-rej', 'RJ-1', ['REJECTED']),
          ])
        : null
    const view = renderAt('/suppliers/sup-1')
    const row = async (number: string) =>
      (await screen.findByText(number)).closest('li') as HTMLElement
    expect(within(await row('DN-7')).getByText('Refused')).toBeTruthy()
    expect(within(await row('DN-7')).queryByText(/Rejected/)).toBeNull()
    // A rejected bill keeps its words.
    expect(within(await row('RJ-1')).getByText("Rejected · can't be paid")).toBeTruthy()
    expect(screen.queryByText(/DEBIT_NOTE_REFUSED/)).toBeNull()
    view.unmount()

    await i18n.changeLanguage('ar')
    renderAt('/suppliers/sup-1')
    expect(within(await row('DN-7')).getByText('مرفوض')).toBeTruthy()
  })
})

const TWO_UNCONFIRMED = {
  suppliers: [
    { supplierId: SUPPLIER, supplierName: 'Muscat Roastery Co' },
    { supplierId: 'sup-2', supplierName: 'Sohar Steel' },
  ],
}
const TWO_CHANGED = TWO_UNCONFIRMED.suppliers

/** A sent run of two bills: MR-1 can be paid, MR-3 now owes less than the file pays. */
const SENT: PaymentRunDetailDto = {
  run: run({ state: 'EXPORTED', exportedAt: '2026-09-19T10:00:00Z' }),
  items: [
    { ...DETAIL.items[0], markPaidBlock: null },
    {
      id: 'i-3',
      billId: 'b-3',
      supplierId: 'sup-2',
      supplierName: 'Sohar Steel',
      supplierBillNumber: 'SS-3',
      issueDate: '2026-08-30',
      dueDate: '2026-09-18',
      amount: 200,
      discountTaken: 0,
      outstanding: 200,
      markPaidBlock: { code: 'PAYMENT_RUN_AMOUNT_CHANGED', owedNow: 150 },
    },
  ],
  activity: [],
}

const VIEWER: Entitlements = { ...MANAGER, username: 'viewer', permissions: ['invoice.read'] }

const sentRunRefusal = (code: string) =>
  json(400, {
    type: 'https://api.fawtir.om/problems/expenditure-refused',
    status: 400,
    error: code,
    detail: `${code} for SS-3`,
    billId: 'b-3',
    supplierBillNumber: 'SS-3',
    documentTypeCode: '380',
  })

async function openMarkPaid() {
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as paid' }, { timeout: 8000 }))
  return screen.findByRole('dialog')
}

describe('the ways out of a sent run (owner, 8 Oct 2026)', () => {
  beforeEach(() => {
    detail = SENT
    override = (url, method) =>
      method === 'POST' && url === `/api/v1/payment-runs/${RUN_ID}/cancel`
        ? json(200, run({ state: 'CANCELLED' }))
        : null
  })

  it('lists the bills, ticks the one that cannot be paid now, and asks for its reason before marking the others paid', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    expect(dialog.getByText('MR-1')).toBeTruthy()
    expect(dialog.getByText('SS-3')).toBeTruthy()
    const ticks = dialog.getAllByRole('checkbox', { name: 'Take out of the run' })
    expect(ticks.map((tick) => (tick as HTMLInputElement).checked)).toEqual([false, true])
    // Only what is still paid is recorded: 980.000 less nothing for MR-1 alone.
    expect(dialog.getByText(/This records/).textContent).toContain('980.000')

    fireEvent.click(dialog.getByRole('button', { name: 'Mark the others paid' }))
    expect(await dialog.findByText('This field is required')).toBeTruthy()
    expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(0)

    fireEvent.change(dialog.getByLabelText('Reason'), {
      target: { value: 'A credit note came after the file was made' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Mark the others paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
    expect(bodyOf(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)[0])).toEqual({
      paymentDate: '2026-09-20',
      takeOut: [{ billId: 'b-3', reason: 'A credit note came after the file was made' }],
    })
  })

  // Owner, 9 Oct 2026: the sign stands before the figure, as everywhere else in the app.
  it('draws the rial sign before the amount being marked paid, in both languages', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    const check = (sentence: HTMLElement) => {
      const amount = sentence.querySelector('.whitespace-nowrap')!
      expect(amount.firstElementChild!.querySelector('svg')).not.toBeNull()
      expect(amount.textContent!.replace(/\s+/g, ' ')).toBe('OMR 980.000')
      const shown = sentence.cloneNode(true) as Element
      shown.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
      expect(shown.textContent).not.toContain('OMR')
    }
    check(dialog.getByText(/^This records/))
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    check(await dialog.findByText(/^تُسجَّل كل فواتير الدفعة/))
  })

  it('lets any other bill be taken out too, each with its reason', async () => {
    detail = {
      ...SENT,
      items: [
        ...SENT.items,
        { ...SENT.items[0], id: 'i-4', billId: 'b-4', supplierBillNumber: 'MR-4', amount: 100 },
      ],
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    const ticks = dialog.getAllByRole('checkbox', { name: 'Take out of the run' })
    fireEvent.click(ticks[2])
    const reasons = dialog.getAllByLabelText('Reason')
    expect(reasons).toHaveLength(2)
    fireEvent.change(reasons[0], { target: { value: 'Amount changed' } })
    fireEvent.change(reasons[1], { target: { value: 'The bank returned it' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Mark the others paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
    expect(bodyOf(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)[0])).toEqual({
      paymentDate: '2026-09-20',
      takeOut: [
        { billId: 'b-3', reason: 'Amount changed' },
        { billId: 'b-4', reason: 'The bank returned it' },
      ],
    })
  })

  it('marks the whole run paid with only the date once nothing is ticked', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'Take out of the run' })[1])
    expect(dialog.queryByLabelText('Reason')).toBeNull()
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
    // The dialog's date, the run's own (owner, 10 Oct 2026), and nothing else.
    expect(bodyOf(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)[0])).toEqual({
      paymentDate: '2026-09-20',
    })
  })

  it('offers Cancel the run instead when every bill is ticked, never Mark the others paid', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'Take out of the run' })[0])
    expect(dialog.queryByRole('button', { name: 'Mark the others paid' })).toBeNull()
    expect(dialog.queryByRole('button', { name: 'Mark as paid' })).toBeNull()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel the run' }))
    const cancel = within(await screen.findByRole('dialog'))
    expect(
      cancel.getByRole('checkbox', { name: 'The bank paid nothing from this file' }),
    ).toBeTruthy()
    expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(0)
  })

  it('cancels a sent run only with the tick and a reason, and says so to the server', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }, { timeout: 8000 }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Cancel the run/ }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Cancel PR-0001?')).toBeTruthy()

    fireEvent.click(dialog.getByRole('button', { name: 'Cancel the run' }))
    expect(await dialog.findAllByText('This field is required')).toHaveLength(2)
    expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/cancel`)).toHaveLength(0)

    fireEvent.click(dialog.getByRole('checkbox', { name: 'The bank paid nothing from this file' }))
    fireEvent.change(dialog.getByLabelText('Reason'), {
      target: { value: 'The bank rejected the file' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel the run' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/cancel`)).toHaveLength(1),
    )
    expect(bodyOf(calls('POST', `/api/v1/payment-runs/${RUN_ID}/cancel`)[0])).toEqual({
      bankPaidNothing: true,
      reason: 'The bank rejected the file',
    })
  })

  it('reads both dialogs in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'سجّل كمدفوعة' }, { timeout: 8000 }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getAllByRole('checkbox', { name: 'إخراج من الدفعة' })).toHaveLength(2)
    expect(dialog.getByRole('button', { name: 'سجّل الباقي كمدفوع' })).toBeTruthy()
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'إخراج من الدفعة' })[0])
    fireEvent.click(dialog.getByRole('button', { name: 'ألغِ الدفعة' }))
    const cancel = within(await screen.findByRole('dialog'))
    expect(cancel.getByRole('checkbox', { name: 'لم يدفع البنك شيئًا من هذا الملف' })).toBeTruthy()
  })

  it('gives a Viewer neither way out', async () => {
    override = (url) => (url === '/api/v1/me/entitlements' ? json(200, VIEWER) : null)
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await screen.findByRole('link', { name: 'MR-1' }, { timeout: 8000 })).toBeTruthy()
    // E2E 10 Oct, F-18: no run menu at all, so no Copy, Reset or Delete either.
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /Cancel the run/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull()
  })

  it('names the bill when marking the run paid is refused for a changed amount', async () => {
    override = (url) =>
      url.endsWith(`/${RUN_ID}/mark-paid`) ? sentRunRefusal('PAYMENT_RUN_AMOUNT_CHANGED') : null
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'Take out of the run' })[1])
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as paid' }))
    expect(
      await screen.findByText(
        'The amount owed on SS-3 changed after it joined this run. Mark the others paid and take SS-3 out of the run.',
      ),
    ).toBeTruthy()
  })

  // A run sent before bank files were dropped (owner, 9 Oct 2026; lead, 10 Oct 2026): it still
  // says it was sent, and can be marked paid or cancelled, but offers no file and no file warnings.
  it('shows a run sent before as sent, with no download and no warning about its file', async () => {
    detail = { ...SENT, fileStored: true, bankDetailsChangedSinceFile: TWO_CHANGED }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await screen.findByText('Sent to bank', undefined, { timeout: 8000 })).toBeTruthy()
    expect(
      screen.getByText('The bank file was made. Mark the run paid once the bank has paid it.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
    expect(screen.queryByText(/already sent to the bank/)).toBeNull()
    expect(screen.queryByText(/changed after this file was made/)).toBeNull()
  })

  /** The run as the server answers once MR-1 was paid and SS-3 taken out with its reason. */
  const PAID_WITH_ONE_OUT: PaymentRunDetailDto = {
    ...SENT,
    run: run({ state: 'PAID', exportedAt: '2026-09-19T10:00:00Z', paidAt: '2026-09-20T10:00:00Z' }),
    items: [
      { ...SENT.items[0], takenOut: null },
      {
        ...SENT.items[1],
        markPaidBlock: null,
        takenOut: {
          at: '2026-09-20T10:00:00Z',
          actor: 'u-1',
          reason: 'A credit note came after the file was made',
        },
      },
    ],
  }
  const billRow = async (number: string) =>
    (await screen.findByRole('link', { name: number }, { timeout: 8000 })).closest(
      'div.border-t',
    ) as HTMLElement

  it("labels a taken-out bill's row on a paid run with its reason, and only that row", async () => {
    detail = PAID_WITH_ONE_OUT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const out = within(await billRow('SS-3'))
    expect(out.getByText('Taken out · A credit note came after the file was made')).toBeTruthy()
    expect(within(await billRow('MR-1')).queryByText(/Taken out/)).toBeNull()
    expect(screen.getAllByText(/^Taken out · /)).toHaveLength(1)
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    detail = PAID_WITH_ONE_OUT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      within(await billRow('SS-3')).getByText(
        'أُخرج من الدفعة · A credit note came after the file was made',
      ),
    ).toBeTruthy()
    expect(screen.getAllByText(/^أُخرج من الدفعة · /)).toHaveLength(1)
  })

  /** A paid run where Sohar Steel had one bill paid (SS-4) and one taken out (SS-3). */
  const PAID_SPLIT: PaymentRunDetailDto = {
    ...PAID_WITH_ONE_OUT,
    items: [
      ...PAID_WITH_ONE_OUT.items,
      {
        ...SENT.items[1],
        id: 'i-4',
        billId: 'b-4',
        supplierBillNumber: 'SS-4',
        amount: 80.25,
        markPaidBlock: null,
        takenOut: null,
      },
    ],
  }
  const EN_SPLIT = /^Paid .+ · taken out /
  const AR_SPLIT = /^مدفوع .+ · أُخرج من الدفعة /
  /** The line under the totals, as seen (the hidden "OMR" left out), and its drawn signs. */
  const splitLine = (pattern: RegExp) => {
    const [line] = screen.queryAllByText(
      (_, element) => element?.tagName === 'P' && pattern.test(element.textContent ?? ''),
    )
    if (!line) return null
    const copy = line.cloneNode(true) as Element
    copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
    return {
      text: (copy.textContent ?? '').replace(/\s+/g, ' '),
      signs: line.querySelectorAll('svg').length,
    }
  }
  /** A supplier's header in the bill list: its count line and amount. */
  const supplierHeader = async (name: string) =>
    (await screen.findAllByText(name, { selector: 'p.text-base' }, { timeout: 8000 }))[0].closest(
      'div.bg-surface-background',
    ) as HTMLElement

  // Owner, 9 Oct 2026 (D2): the bank file's totals stay; a line under them says what was paid
  // and what was taken out.
  it('splits a paid run into paid and taken out under the totals, with the rial sign', async () => {
    detail = PAID_SPLIT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    await billRow('SS-3')
    expect(splitLine(EN_SPLIT)).toEqual({ text: 'Paid 1,060.250 · taken out 200.000', signs: 2 })
    expect(splitLine(EN_SPLIT)!.text).not.toContain('OMR')
    // The totals themselves are the run's, as the bank received them.
    expect(screen.getByText('Leaving your account').parentElement!.textContent).toContain('980.000')
  })

  it('says the split in Arabic', async () => {
    await i18n.changeLanguage('ar')
    detail = PAID_SPLIT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    await billRow('SS-3')
    expect(splitLine(AR_SPLIT)).toEqual({
      text: 'مدفوع 1,060.250 · أُخرج من الدفعة 200.000',
      signs: 2,
    })
  })

  it('draws no split when nothing was taken out, or the run is only sent', async () => {
    detail = {
      ...PAID_WITH_ONE_OUT,
      items: PAID_WITH_ONE_OUT.items.map((item) => ({ ...item, takenOut: null })),
    }
    const paid = renderAt(`/expenditure/payments/${RUN_ID}`)
    await billRow('SS-3')
    expect(splitLine(EN_SPLIT)).toBeNull()
    paid.unmount()

    detail = { ...PAID_SPLIT, run: { ...PAID_SPLIT.run, state: 'EXPORTED', paidAt: null } }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    await billRow('SS-3')
    expect(splitLine(EN_SPLIT)).toBeNull()
  })

  // E3: on a paid run, the supplier's header counts the bills actually paid.
  it("leaves a taken-out bill out of its supplier's header on a paid run, but keeps its row", async () => {
    detail = PAID_SPLIT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const header = within(await supplierHeader('Sohar Steel'))
    expect(header.getByText('1 bill · paid on its own')).toBeTruthy()
    expect(header.getByText('80.250')).toBeTruthy()
    expect(within(await billRow('SS-3')).getByText(/^Taken out · /)).toBeTruthy()
    expect(await billRow('SS-4')).toBeTruthy()
  })

  it('counts every bill in the header of a run that is only sent', async () => {
    detail = { ...PAID_SPLIT, run: { ...PAID_SPLIT.run, state: 'EXPORTED', paidAt: null } }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const header = within(await supplierHeader('Sohar Steel'))
    expect(header.getByText('2 bills · paid as one transfer')).toBeTruthy()
    expect(header.getByText('280.250')).toBeTruthy()
  })

  it('shows no label when no bill was taken out, or the server does not say', async () => {
    detail = {
      ...PAID_WITH_ONE_OUT,
      items: [
        { ...SENT.items[0], takenOut: null },
        { ...SENT.items[1], markPaidBlock: null },
      ],
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await billRow('SS-3')).toBeTruthy()
    expect(await billRow('MR-1')).toBeTruthy()
    expect(screen.queryByText(/Taken out/)).toBeNull()
  })
})

/** A scheduled run of the same two bills, as the server answers it once marking paid needs no file. */
const SCHEDULED_TWO: PaymentRunDetailDto = {
  ...SENT,
  run: run({ state: 'SCHEDULED' }),
}

describe('marking a run paid with no bank file (owner, 9 Oct 2026; lead, 10 Oct 2026)', () => {
  beforeEach(() => {
    override = (url, method) =>
      method === 'POST' && url === `/api/v1/payment-runs/${RUN_ID}/cancel`
        ? json(200, run({ state: 'CANCELLED' }))
        : null
  })

  it('offers Mark as paid on a draft, a scheduled and a sent run, never on a paid or cancelled one', async () => {
    const cases: [PaymentRunDto['state'], boolean][] = [
      ['DRAFT', true],
      ['SCHEDULED', true],
      ['EXPORTED', true],
      ['PAID', false],
      ['CANCELLED', false],
    ]
    for (const [state, offered] of cases) {
      detail = {
        ...DETAIL,
        run: run({ state, paymentDate: state === 'DRAFT' ? null : '2026-09-20' }),
      }
      const view = renderAt(`/expenditure/payments/${RUN_ID}`)
      expect(await screen.findByRole('link', { name: 'MR-1' }, { timeout: 8000 })).toBeTruthy()
      expect(!!screen.queryByRole('button', { name: 'Mark as paid' }), state).toBe(offered)
      view.unmount()
    }
  })

  it('offers no Mark as paid on a run with no bills', async () => {
    detail = { ...DETAIL, run: run({ state: 'DRAFT', paymentDate: null }), items: [] }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await screen.findByRole('checkbox', { name: 'Select MR-2' }, { timeout: 8000 }))
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull()
  })

  it('marks a draft run with no payment date paid today, with no bank file', async () => {
    detail = { ...DETAIL, run: run({ state: 'DRAFT', paymentDate: null }) }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    expect(dialog.getByText(/^This records/).textContent).toContain('980.000')
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
    expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/export`)).toHaveLength(0)
    expect(bodyOf(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)[0])).toEqual({
      paymentDate: muscatToday(),
    })
  })

  it('pays some of a scheduled run and takes the rest out, each with its reason', async () => {
    detail = SCHEDULED_TWO
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    expect(dialog.getByText('Mark PR-0001 as paid?')).toBeTruthy()
    expect(dialog.getByText(/^This records/).textContent).toMatch(
      /This records every bill in the run as paid, .*980\.000 in all\. Take out the bills you did not pay\./,
    )
    // The bill the server says cannot be paid now starts ticked.
    const ticks = dialog.getAllByRole('checkbox', { name: 'Take out of the run' })
    expect(ticks.map((tick) => (tick as HTMLInputElement).checked)).toEqual([false, true])
    fireEvent.click(dialog.getByRole('button', { name: 'Mark the others paid' }))
    expect(await dialog.findByText('This field is required')).toBeTruthy()
    expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(0)

    fireEvent.change(dialog.getByLabelText('Reason'), { target: { value: 'Paid next month' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Mark the others paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
    expect(bodyOf(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)[0])).toEqual({
      paymentDate: '2026-09-20',
      takeOut: [{ billId: 'b-3', reason: 'Paid next month' }],
    })
  })

  it('cancels a scheduled run as from the menu when every bill is taken out, asking nothing of a bank', async () => {
    detail = SCHEDULED_TWO
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'Take out of the run' })[0])
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel the run' }))
    const cancel = within(await screen.findByRole('dialog'))
    expect(cancel.getByText('Cancel PR-0001?')).toBeTruthy()
    expect(
      cancel.getByText('The run is cancelled and its bills can go into another run.'),
    ).toBeTruthy()
    expect(cancel.queryByRole('checkbox')).toBeNull()
    fireEvent.click(cancel.getByRole('button', { name: 'Cancel the run' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/cancel`)).toHaveLength(1),
    )
    const [, init] = calls('POST', `/api/v1/payment-runs/${RUN_ID}/cancel`)[0]
    expect((init as RequestInit).body).toBeUndefined()
    expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(0)
  })

  it('says what a scheduled run is waiting for without a bank file, and a paid run’s day', async () => {
    const view = renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText(
        `Scheduled for ${formatDate('2026-09-20')}. Mark the run paid once you have paid the suppliers.`,
        undefined,
        { timeout: 8000 },
      ),
    ).toBeTruthy()
    view.unmount()

    // Marked paid before its payment date: the bills were paid that day, not on the run's date.
    detail = {
      ...DETAIL,
      run: run({ state: 'PAID', paymentDate: '2026-09-25', paidAt: '2026-09-19T08:00:00Z' }),
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText(
        `Paid on ${formatDate('2026-09-19')}. Each bill's payment is recorded.`,
        undefined,
        {
          timeout: 8000,
        },
      ),
    ).toBeTruthy()
  })

  it('renders an old paid run that was sent to the bank, as before', async () => {
    detail = {
      ...DETAIL,
      run: run({
        state: 'PAID',
        format: 'BANK_MUSCAT_CSV',
        exportedAt: '2026-09-19T10:00:00Z',
        paidAt: '2026-09-20T10:00:00Z',
      }),
      fileStored: false,
      bankDetailsChangedSinceFile: TWO_CHANGED,
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText(
        `Paid on ${formatDate('2026-09-20')}. Each bill's payment is recorded.`,
        undefined,
        {
          timeout: 8000,
        },
      ),
    ).toBeTruthy()
    expect(screen.getByText('Payment run PR-0001')).toBeTruthy()
    expect(screen.getByText('Leaving your account').parentElement!.textContent).toContain('980.000')
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
    expect(screen.queryByText(/changed after this file was made/)).toBeNull()
  })

  it('reads the new wording in Arabic, with the rial sign before the amount', async () => {
    await i18n.changeLanguage('ar')
    detail = SCHEDULED_TWO
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText(
        /^مجدولة ليوم .+\. سجّل الدفعة كمدفوعة بعد أن تدفع للمورّدين\.$/,
        undefined,
        { timeout: 8000 },
      ),
    ).toBeTruthy()
    expect(screen.getByText('لسجلاتك')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'سجّل كمدفوعة' }))
    const dialog = within(await screen.findByRole('dialog'))
    const sentence = dialog.getByText(/^تُسجَّل كل فواتير الدفعة/)
    const shown = sentence.cloneNode(true) as Element
    shown.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
    expect(shown.textContent!.replace(/\s+/g, ' ')).toBe(
      'تُسجَّل كل فواتير الدفعة كمدفوعة، بإجمالي 980.000. أخرج من الدفعة الفواتير التي لم تدفعها.',
    )
    expect(sentence.querySelector('svg')).not.toBeNull()
  })

  it('says the new wording of a run being built in English and Arabic', async () => {
    const view = renderAt('/expenditure/payments/new')
    expect(
      await screen.findByText(
        'Pick the bills to pay together. Fawtir groups them by supplier so you can track what is paid and what is still owed.',
        undefined,
        { timeout: 8000 },
      ),
    ).toBeTruthy()
    expect(screen.getByText('for your records')).toBeTruthy()
    view.unmount()
    await i18n.changeLanguage('ar')
    renderAt('/expenditure/payments/new')
    expect(
      await screen.findByText(
        'اختر الفواتير التي ستُدفع معًا. تجمعها فوتر حسب المورّد لتتابع ما دُفع وما بقي مستحقًا.',
        undefined,
        { timeout: 8000 },
      ),
    ).toBeTruthy()
  })

  // Backend #476: a hold (any live run) or a rejection (before a file) placed after the bill
  // joined is ticked to be taken out, as the other blocks are.
  it('starts a held or rejected bill of a draft run ticked to be taken out', async () => {
    detail = {
      ...SCHEDULED_TWO,
      run: run({ state: 'DRAFT', paymentDate: null }),
      items: [
        {
          ...SCHEDULED_TWO.items[0],
          markPaidBlock: { code: 'PAYMENT_RUN_BILL_ON_HOLD', owedNow: 1000 },
        },
        {
          ...SCHEDULED_TWO.items[1],
          markPaidBlock: { code: 'PAYMENT_RUN_BILL_NOT_READY', owedNow: 200 },
        },
        {
          ...SCHEDULED_TWO.items[0],
          id: 'i-5',
          billId: 'b-5',
          supplierBillNumber: 'MR-5',
          markPaidBlock: null,
        },
      ],
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    const ticks = dialog.getAllByRole('checkbox', { name: 'Take out of the run' })
    expect(ticks.map((tick) => (tick as HTMLInputElement).checked)).toEqual([true, true, false])
    expect(dialog.getByRole('button', { name: 'Mark the others paid' })).toBeTruthy()
  })

  it('says each mark-paid refusal of backend #476 in words, in both languages', async () => {
    const { refusalOf } = await import('../../lib/paymentRuns')
    const { ApiError } = await import('../../api')
    const refused = (code: string, problem: Record<string, unknown> = {}) =>
      new ApiError({ status: 400, problemType: 'expenditure-refused', code, problem })
    const en = i18n.getFixedT('en')
    const ar = i18n.getFixedT('ar')
    const said = (code: string, problem?: Record<string, unknown>) => [
      refusalOf(refused(code, problem), en, 'markPaid'),
      refusalOf(refused(code, problem), ar, 'markPaid'),
    ]
    expect(said('PAYMENT_RUN_BILL_ON_HOLD')).toEqual([
      'A bill in this run is on hold. Release it, or take it out of the run and mark the others paid.',
      'إحدى فواتير هذه الدفعة قيد الانتظار. أفرج عنها، أو أخرجها من الدفعة وسجّل الباقي كمدفوع.',
    ])
    expect(
      said('PAYMENT_RUN_BILL_NOT_READY', { supplierBillNumber: 'SS-3', documentTypeCode: '380' }),
    ).toEqual([
      'SS-3 was rejected after it joined this run. Mark the others paid and take SS-3 out of the run.',
      'رُفضت SS-3 بعد إضافتها إلى هذه الدفعة. سجّل الباقي كمدفوع وأخرج SS-3 من الدفعة.',
    ])
    // With no number to name, the code's own sentence.
    expect(said('PAYMENT_RUN_BILL_NOT_READY')[0]).toBe("That bill hasn't cleared approval yet.")
    expect(said('PAYMENT_RUN_EMPTY')[0]).toBe('Tick at least one bill first.')
    expect(said('PAYMENT_RUN_TRANSITION_INVALID')[0]).toBe(
      "The run can't do that in its current state.",
    )
    expect(said('PAYMENT_RUN_CONCURRENTLY_MODIFIED')[0]).toBe(
      'Someone else changed this run. Reload it and try again.',
    )
    // Adding a held bill keeps the sentence it had.
    expect(refusalOf(refused('PAYMENT_RUN_BILL_ON_HOLD'), en, 'add')).toBe(
      'That bill is on hold. Release it before paying.',
    )
  })

  it('shows the refusal on the page when marking a scheduled run paid is refused for a hold', async () => {
    detail = SCHEDULED_TWO
    override = (url) =>
      url.endsWith(`/${RUN_ID}/mark-paid`) ? runRefusal('PAYMENT_RUN_BILL_ON_HOLD', {}) : null
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'Take out of the run' })[1])
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as paid' }))
    expect(
      await screen.findByText(
        'A bill in this run is on hold. Release it, or take it out of the run and mark the others paid.',
      ),
    ).toBeTruthy()
  })

  it('renders a run paid with no bank file: no file, no download, its own day', async () => {
    detail = {
      ...DETAIL,
      run: run({
        state: 'PAID',
        format: null,
        paymentDate: '2026-09-21',
        exportedAt: null,
        paidAt: '2026-09-21T06:00:00Z',
      }),
      fileStored: null,
      bankDetailsChangedSinceFile: [],
      activity: [
        {
          at: '2026-09-21T06:00:00Z',
          kind: 'PAID',
          reason: null,
          actor: 'u-1',
          billId: null,
          supplierBillNumber: null,
        },
        {
          at: '2026-09-17T08:00:00Z',
          kind: 'CREATED',
          reason: null,
          actor: 'u-1',
          billId: null,
          supplierBillNumber: null,
        },
      ],
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText(
        `Paid on ${formatDate('2026-09-21')}. Each bill's payment is recorded.`,
        undefined,
        { timeout: 8000 },
      ),
    ).toBeTruthy()
    expect(screen.getByText('Paid')).toBeTruthy()
    expect(screen.queryByText(/Sent to bank|bank file|exported/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull()
  })

  it('gives a Viewer no Mark as paid on a scheduled run', async () => {
    detail = SCHEDULED_TWO
    override = (url) => (url === '/api/v1/me/entitlements' ? json(200, VIEWER) : null)
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await screen.findByRole('link', { name: 'MR-1' }, { timeout: 8000 })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull()
  })
})

const runRefusal = (code: string, fields: Record<string, unknown>) =>
  json(400, {
    type: 'https://api.fawtir.om/problems/expenditure-refused',
    status: 400,
    error: code,
    detail: `${code} in English`,
    ...fields,
  })

describe('refusals when marking a run paid, and no bank file (owner, 9 Oct 2026)', () => {
  async function refusedMarkPaid(code: string, fields: Record<string, unknown>) {
    override = (url) => (url.endsWith(`/${RUN_ID}/mark-paid`) ? runRefusal(code, fields) : null)
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(
      await screen.findByRole('button', { name: /Mark as paid|سجّل كمدفوعة/ }, { timeout: 8000 }),
    )
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: /Mark as paid|سجّل كمدفوعة/ }))
  }

  it('has no sentence for unconfirmed bank details any more (owner, 10 Oct 2026)', async () => {
    const { refusalOf } = await import('../../lib/paymentRuns')
    const { ApiError } = await import('../../api')
    const error = new ApiError({
      status: 400,
      problemType: 'expenditure-refused',
      code: 'PAYMENT_RUN_BANK_DETAILS_UNCONFIRMED',
      problem: TWO_UNCONFIRMED,
    })
    const en = i18n.getFixedT('en')
    const generic = refusalOf(
      new ApiError({ status: 400, problemType: 'expenditure-refused', code: 'SOMETHING_NEW', problem: {} }),
      en,
      'markPaid',
    )
    expect(refusalOf(error, en, 'markPaid')).toBe(generic)
    expect(refusalOf(error, en, 'markPaid')).not.toMatch(/not confirmed/)
  })

  it('names the switched-off account the run pays from', async () => {
    await refusedMarkPaid('PAYMENT_RUN_PAYER_ACCOUNT_INACTIVE', { accountName: 'Bank Muscat 4471' })
    expect(
      await screen.findByText(
        'The account you pay from, Bank Muscat 4471, is switched off. Choose an active account.',
      ),
    ).toBeTruthy()
  })

  it('says the account refusal in Arabic, with its value, and nothing of unconfirmed details', async () => {
    const { refusalOf } = await import('../../lib/paymentRuns')
    const { ApiError } = await import('../../api')
    const refused = (code: string, problem: Record<string, unknown>) =>
      new ApiError({ status: 400, problemType: 'expenditure-refused', code, problem })
    const ar = i18n.getFixedT('ar')
    expect(
      refusalOf(refused('PAYMENT_RUN_BANK_DETAILS_UNCONFIRMED', TWO_UNCONFIRMED), ar, 'markPaid'),
    ).not.toMatch(/لم تُؤكَّد/)
    expect(
      refusalOf(
        refused('PAYMENT_RUN_PAYER_ACCOUNT_INACTIVE', { accountName: 'Bank Muscat 4471' }),
        ar,
        'markPaid',
      ),
    ).toBe('الحساب الذي تدفع منه، Bank Muscat 4471، موقوف. اختر حسابًا نشطًا.')
  })

  it('keeps no sentence for the refusals only a bank file could raise', async () => {
    const { refusalOf } = await import('../../lib/paymentRuns')
    const { ApiError } = await import('../../api')
    for (const code of [
      'PAYMENT_RUN_PAYER_NAME_NOT_LATIN',
      'PAYMENT_RUN_FORMAT_REQUIRED',
      'PAYMENT_RUN_PAYER_ACCOUNT_REQUIRED',
      'PAYMENT_RUN_BANK_DETAILS_MISSING',
    ]) {
      const said = refusalOf(
        new ApiError({ status: 400, problemType: 'expenditure-refused', code, problem: {} }),
        i18n.t,
        'markPaid',
      )
      expect(said, code).not.toMatch(/legal name|how to send|account you pay from first|IBAN/)
    }
  })

  it('draws no format choice, no download and no ISO 20022 note on a run being built', async () => {
    detail = { ...DETAIL, run: run({ format: 'PAIN_001', payerAccountId: null }) }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await screen.findByRole('checkbox', { name: 'Select MR-1' }, { timeout: 8000 }))
    for (const gone of [
      'How to send it to the bank',
      'Bank Muscat CSV',
      'ISO 20022 pain.001',
      'Printed list',
      'An ISO 20022 file needs the account you pay from.',
    ])
      expect(screen.queryByText(gone), gone).toBeNull()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: /Copy into a new run/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Change the bank format/ })).toBeNull()
  })

  it('keeps the run’s stored format when its details change, without asking for one', async () => {
    detail = { ...DETAIL, run: run({ format: 'PRINTED_LIST' }) }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const reference = await screen.findByLabelText('Run reference', undefined, { timeout: 8000 })
    fireEvent.change(reference, { target: { value: 'MARCH-SUPPLIERS' } })
    fireEvent.blur(reference)
    await waitFor(() => expect(calls('PUT', `/api/v1/payment-runs/${RUN_ID}`)).toHaveLength(1))
    expect(bodyOf(calls('PUT', `/api/v1/payment-runs/${RUN_ID}`)[0])).toEqual({
      paymentDate: '2026-09-20',
      payerAccountId: null,
      runReference: 'MARCH-SUPPLIERS',
      format: 'PRINTED_LIST',
    })
  })

  it('asks for no account to pay from: the field is there, with no required mark', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const label = await screen.findByText('Pay from', undefined, { timeout: 8000 })
    expect(label.textContent).toBe('Pay from')
  })
})

describe('the end-to-end check of 10 Oct 2026', () => {
  /** SCHEDULED_TWO with SS-3 put on hold after it joined the run. */
  const HELD: PaymentRunDetailDto = {
    ...SCHEDULED_TWO,
    items: [
      SCHEDULED_TWO.items[0],
      {
        ...SCHEDULED_TWO.items[1],
        markPaidBlock: { code: 'PAYMENT_RUN_BILL_ON_HOLD', owedNow: 200 },
      },
    ],
  }
  const rowOf = async (number: string) =>
    (await screen.findByRole('link', { name: number }, { timeout: 8000 })).closest(
      'div.border-t',
    ) as HTMLElement

  // F-3: the run page carried no flag, and the dialog ticked the bill with no word why.
  it('flags a bill put on hold inside the run on its row and in the dialog, ticked', async () => {
    detail = HELD
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(within(await rowOf('SS-3')).getByText('On hold')).toBeTruthy()
    expect(within(await rowOf('MR-1')).queryByText('On hold')).toBeNull()

    const dialog = within(await openMarkPaid())
    const items = dialog.getAllByRole('listitem')
    expect(within(items[1]).getByText('On hold')).toBeTruthy()
    expect(within(items[0]).queryByText('On hold')).toBeNull()
    const ticks = dialog.getAllByRole('checkbox', { name: 'Take out of the run' })
    expect(ticks.map((tick) => (tick as HTMLInputElement).checked)).toEqual([false, true])
  })

  it('says the other reasons a bill cannot be marked paid in words, in both languages', async () => {
    detail = SENT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(within(await rowOf('SS-3')).getByText('Amount owed changed')).toBeTruthy()
    expect(screen.queryByText(/PAYMENT_RUN_/)).toBeNull()
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    expect(within(await rowOf('SS-3')).getByText('تغيّر المبلغ المستحق')).toBeTruthy()
  })

  // F-3: the refusal said "A bill in this run is on hold" without saying which.
  it('names the held bill when marking paid is refused for it and the screen knows which', async () => {
    detail = HELD
    override = (url) =>
      url.endsWith(`/${RUN_ID}/mark-paid`) ? runRefusal('PAYMENT_RUN_BILL_ON_HOLD', {}) : null
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'Take out of the run' })[1])
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as paid' }))
    expect(
      await screen.findByText(
        'SS-3 is on hold. Release it, or take it out of the run and mark the others paid.',
      ),
    ).toBeTruthy()
  })

  it('names the bill the server names, in both languages', async () => {
    const { refusalOf } = await import('../../lib/paymentRuns')
    const { ApiError } = await import('../../api')
    const refused = new ApiError({
      status: 400,
      problemType: 'expenditure-refused',
      code: 'PAYMENT_RUN_BILL_ON_HOLD',
      problem: { supplierBillNumber: 'UI-P4' },
    })
    expect(refusalOf(refused, i18n.getFixedT('en'), 'markPaid')).toBe(
      'UI-P4 is on hold. Release it, or take it out of the run and mark the others paid.',
    )
    expect(refusalOf(refused, i18n.getFixedT('ar'), 'markPaid')).toBe(
      'UI-P4 قيد الانتظار. أفرج عنها، أو أخرجها من الدفعة وسجّل الباقي كمدفوع.',
    )
  })

  // F-5: the failed attempt's banner stayed on the run once it was then marked paid.
  it('clears the refusal once the run is then marked paid', async () => {
    detail = HELD
    let refuse = true
    override = (url) => {
      if (!url.endsWith(`/${RUN_ID}/mark-paid`)) return null
      if (!refuse) return null
      refuse = false
      return runRefusal('PAYMENT_RUN_BILL_ON_HOLD', {})
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    let dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'Take out of the run' })[1])
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as paid' }))
    expect(await screen.findByText(/is on hold\. Release it/)).toBeTruthy()

    dialog = within(await openMarkPaid())
    fireEvent.change(dialog.getByRole('textbox'), { target: { value: 'Goods not received' } })
    const reads = calls('GET', `/api/v1/payment-runs/${RUN_ID}`).length
    fireEvent.click(dialog.getByRole('button', { name: 'Mark the others paid' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // The run is drawn again once reloaded, and the old refusal is not on it.
    await waitFor(() =>
      expect(calls('GET', `/api/v1/payment-runs/${RUN_ID}`).length).toBeGreaterThan(reads),
    )
    expect(await screen.findByRole('link', { name: 'MR-1' }, { timeout: 8000 })).toBeTruthy()
    expect(screen.queryByText(/is on hold\. Release it/)).toBeNull()
  })

  // F-6: a taken-out bill kept its discounted amount and "2% saved by paying early".
  it('shows a taken-out bill at what it still owes, with no early-payment saving', async () => {
    detail = {
      ...SCHEDULED_TWO,
      run: run({ state: 'PAID', paidAt: '2026-09-20T10:00:00Z' }),
      items: [
        { ...SCHEDULED_TWO.items[0], markPaidBlock: null, takenOut: null },
        {
          ...SCHEDULED_TWO.items[1],
          amount: 39.2,
          discountTaken: 0.8,
          outstanding: 40,
          markPaidBlock: null,
          takenOut: { at: '2026-09-20T10:00:00Z', actor: 'u-1', reason: 'Goods not received' },
        },
      ],
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const out = within(await rowOf('SS-3'))
    expect(out.getByText('40.000')).toBeTruthy()
    expect(out.queryByText('39.200')).toBeNull()
    expect(out.queryByText(/saved by paying early/)).toBeNull()
    // The bill that was paid keeps its saving.
    expect(within(await rowOf('MR-1')).getByText('2% saved by paying early')).toBeTruthy()
  })

  // F-12: cancelling a run from the menu asked "Cancel PR-0001?" with a "Delete" button.
  it('asks to cancel the run from the menu with a button that says so', async () => {
    detail = SCHEDULED_TWO
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }, { timeout: 8000 }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByRole('button', { name: 'Cancel the run' })).toBeTruthy()
    expect(dialog.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  // F-8: a run made 10 Oct 03:56 Muscat read "Started 9 Oct 2026", the UTC day.
  it('says the day a run was started on the Muscat day', async () => {
    override = (url, method) =>
      (url === '/api/v1/payment-runs' || url.startsWith('/api/v1/payment-runs?')) &&
      method === 'GET'
        ? json(200, [run({ createdAt: '2026-10-09T23:56:49Z' })])
        : null
    renderAt('/expenditure/payments')
    expect(
      await screen.findAllByText('Started 10 Oct 2026', undefined, { timeout: 8000 }),
    ).not.toHaveLength(0)
    expect(screen.queryByText('Started 9 Oct 2026')).toBeNull()
  })

  // F-13: the list offered a "Sent to bank" tab no run can reach without a file.
  it('offers no Sent to bank tab, and still lists a run sent before under All', async () => {
    override = (url, method) =>
      (url === '/api/v1/payment-runs' || url.startsWith('/api/v1/payment-runs?')) &&
      method === 'GET'
        ? json(200, [run({ state: 'EXPORTED', exportedAt: '2026-09-19T10:00:00Z' })])
        : null
    renderAt('/expenditure/payments')
    expect(await screen.findByRole('link', { name: 'PR-0001' }, { timeout: 8000 })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Sent to bank' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'All' })).toBeTruthy()
    expect(screen.getByText('Sent to bank')).toBeTruthy()
  })

  // F-9 (backend #477): the list showed only the planned total of a paid run with take-outs.
  it('splits a paid run with take-outs into paid and taken out on the list, rial sign on each', async () => {
    override = (url, method) =>
      (url === '/api/v1/payment-runs' || url.startsWith('/api/v1/payment-runs?')) &&
      method === 'GET'
        ? json(200, [
            run({ state: 'PAID', netTotal: 119.2, paidTotal: 50, takenOutTotal: 69.2 }),
            run({
              id: 'run-2',
              reference: 'PR-0000',
              state: 'PAID',
              paidTotal: 980,
              takenOutTotal: 0,
            }),
            run({
              id: 'run-3',
              reference: 'PR-0003',
              state: 'SCHEDULED',
              paidTotal: null,
              takenOutTotal: null,
            }),
          ])
        : null
    renderAt('/expenditure/payments')
    const row = (await screen.findByRole('link', { name: 'PR-0001' }, { timeout: 8000 })).closest(
      'tr',
    )!
    const line = within(row).getByText(
      (_, element) =>
        element?.tagName === 'P' && /^Paid .+ · taken out /.test(element.textContent ?? ''),
    )
    const copy = line.cloneNode(true) as Element
    copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
    expect((copy.textContent ?? '').replace(/\s+/g, ' ')).toBe('Paid 50.000 · taken out 69.200')
    expect(line.querySelectorAll('svg')).toHaveLength(2)
    expect(within(row).getByText('119.200')).toBeTruthy()
    // Nothing taken out, or not paid: no line.
    for (const reference of ['PR-0000', 'PR-0003']) {
      const other = screen.getByRole('link', { name: reference }).closest('tr')!
      expect(within(other).queryByText(/taken out/)).toBeNull()
    }

    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /^مدفوع .+ · أُخرج من الدفعة /.test(element.textContent ?? ''),
      ),
    ).toBeTruthy()
  })

  // F-18: a Viewer saw Copy, Reset and Delete, and the server refused them.
  it('draws no run menu for a Viewer on a draft run', async () => {
    detail = { ...SCHEDULED_TWO, run: run({ state: 'DRAFT', paymentDate: null }) }
    override = (url) => (url === '/api/v1/me/entitlements' ? json(200, VIEWER) : null)
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await screen.findByRole('link', { name: 'MR-1' }, { timeout: 8000 })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
    expect(screen.queryByText(/Copy into a new run|Reset the selection/)).toBeNull()
  })
})

/** The two-bill scheduled run, with Sohar Steel's bank details changed after its bill joined. */
const CHANGED_SINCE_ADDED: PaymentRunDetailDto = {
  ...SENT,
  run: run({ state: 'SCHEDULED' }),
  items: [
    { ...SENT.items[0], supplierBankDetailsChangedSinceAdded: false },
    { ...SENT.items[1], markPaidBlock: null, supplierBankDetailsChangedSinceAdded: true },
    {
      ...SENT.items[1],
      id: 'i-5',
      billId: 'b-5',
      supplierBillNumber: 'SS-5',
      markPaidBlock: null,
      supplierBankDetailsChangedSinceAdded: true,
    },
  ],
}

describe("the owner's answers of 10 Oct 2026", () => {
  const markPaidBody = () => bodyOf(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)[0])

  async function markPaidWithDateOf(paymentDate: string | null) {
    detail = { ...DETAIL, run: run({ paymentDate, state: paymentDate ? 'SCHEDULED' : 'DRAFT' }) }
    const view = renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    const shown = dialog.getByRole('button', { name: 'Paid on' }).textContent
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
    const sent = markPaidBody()
    view.unmount()
    fetchMock.mockClear()
    return { shown, sent }
  }

  it('asks for the date paid, starting on the run date, or today when it has none or it is ahead', async () => {
    const today = muscatToday()
    const past = await markPaidWithDateOf('2026-09-20')
    expect(past.shown).toContain(formatDisplayDate('2026-09-20', 'en'))
    expect(past.sent).toEqual({ paymentDate: '2026-09-20' })

    const none = await markPaidWithDateOf(null)
    expect(none.shown).toContain(formatDisplayDate(today, 'en'))
    expect(none.sent).toEqual({ paymentDate: today })

    const ahead = await markPaidWithDateOf('2999-12-31')
    expect(ahead.shown).toContain(formatDisplayDate(today, 'en'))
    expect(ahead.sent).toEqual({ paymentDate: today })
  })

  it('works the date out as the dialog does, and refuses a future one before sending', () => {
    expect(markPaidDateFor({ paymentDate: '2026-10-08' }, '2026-10-10')).toBe('2026-10-08')
    expect(markPaidDateFor({ paymentDate: '2026-10-10' }, '2026-10-10')).toBe('2026-10-10')
    expect(markPaidDateFor({ paymentDate: '2026-10-11' }, '2026-10-10')).toBe('2026-10-10')
    expect(markPaidDateFor({ paymentDate: null }, '2026-10-10')).toBe('2026-10-10')
    expect(markPaidDateProblem('2026-10-11', '2026-10-10')).toBe(
      'invoiceDetails.pay.error.dateFuture',
    )
    expect(markPaidDateProblem('', '2026-10-10')).toBe('paymentRuns.paidOnRequired')
    expect(markPaidDateProblem('2026-10-10', '2026-10-10')).toBeNull()
    expect(markPaidDateProblem('2026-01-02', '2026-10-10')).toBeNull()
  })

  it('offers no day after today in the dialog’s calendar', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getByRole('button', { name: 'Paid on' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next month' }))
    const fifteenth = screen.getAllByRole('button', { name: '15' })
    expect(fifteenth.length).toBeGreaterThan(0)
    for (const day of fifteenth) expect((day as HTMLButtonElement).disabled).toBe(true)
  })

  it('sends the date beside the bills taken out', async () => {
    detail = SCHEDULED_TWO
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.change(dialog.getByLabelText('Reason'), { target: { value: 'Paid next month' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Mark the others paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
    expect(markPaidBody()).toEqual({
      paymentDate: '2026-09-20',
      takeOut: [{ billId: 'b-3', reason: 'Paid next month' }],
    })
  })

  it('hides the date while the button reads Cancel the run', async () => {
    detail = SCHEDULED_TWO
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    expect(dialog.getByRole('button', { name: 'Paid on' })).toBeTruthy()
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'Take out of the run' })[0])
    expect(dialog.getByRole('button', { name: 'Cancel the run' })).toBeTruthy()
    expect(dialog.queryByRole('button', { name: 'Paid on' })).toBeNull()
  })

  it('reads the server’s refusal of a future date, in English and Arabic', async () => {
    const { refusalOf } = await import('../../lib/paymentRuns')
    const { ApiError } = await import('../../api')
    override = (url) =>
      url.endsWith(`/${RUN_ID}/mark-paid`)
        ? runRefusal('PAYMENT_RUN_PAYMENT_DATE_IN_FUTURE', {})
        : null
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as paid' }))
    expect(await screen.findByText('A payment cannot be dated in the future.')).toBeTruthy()

    const refused = (code: string, problem: Record<string, unknown>) =>
      new ApiError({ status: 400, problemType: 'expenditure-refused', code, problem })
    const ar = i18n.getFixedT('ar')
    expect(refusalOf(refused('PAYMENT_RUN_PAYMENT_DATE_IN_FUTURE', {}), ar, 'markPaid')).toBe(
      'لا يمكن تأريخ دفعة في المستقبل.',
    )
    // A date after a bill's early-payment discount ends (10 Oct 2026): by the bill's number,
    // agreeing in Arabic with a bill or a debit note.
    const en = i18n.getFixedT('en')
    const late = 'PAYMENT_RUN_PAYMENT_DATE_AFTER_DISCOUNT'
    const ss3 = { billId: 'b-3', supplierBillNumber: 'SS-3', documentTypeCode: '380' }
    expect(refusalOf(refused(late, ss3), en, 'markPaid')).toBe(
      'SS-3 was priced with an early-payment discount that ends before the date you paid. Choose an earlier date, or take SS-3 out of the run.',
    )
    expect(refusalOf(refused(late, {}), en, 'markPaid')).toBe(
      'A bill in this run was priced with an early-payment discount that ends before the date you paid. Choose an earlier date.',
    )
    expect(refusalOf(refused(late, ss3), ar, 'markPaid')).toBe(
      'سُعّرت SS-3 بخصم سداد مبكر ينتهي قبل تاريخ الدفع. اختر تاريخًا أبكر، أو أخرج SS-3 من الدفعة.',
    )
    expect(refusalOf(refused(late, { ...ss3, documentTypeCode: '383' }), ar, 'markPaid')).toBe(
      'سُعّر SS-3 بخصم سداد مبكر ينتهي قبل تاريخ الدفع. اختر تاريخًا أبكر، أو أخرج SS-3 من الدفعة.',
    )
    // The codes retired by the backend read the generic refusal.
    for (const code of ['PAYMENT_RUN_DATE_REQUIRED', 'PAYMENT_RUN_PAYMENT_DATE_BEFORE_ISSUE_DATE'])
      expect(refusalOf(refused(code, ss3), en, 'markPaid')).not.toMatch(/date|issued/)
  })

  it('warns once per supplier whose bank details changed after their bill joined the run', async () => {
    detail = CHANGED_SINCE_ADDED
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText("Sohar Steel's bank details changed. Check before you pay.", {}, {
        timeout: 8000,
      }),
    ).toBeTruthy()
    expect(screen.getAllByText(/bank details changed\. Check before you pay\./)).toHaveLength(1)
    expect(screen.queryByText(/Muscat Roastery Co's bank details changed/)).toBeNull()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    detail = CHANGED_SINCE_ADDED
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText('تغيّرت البيانات البنكية لـ Sohar Steel. تحقّق منها قبل الدفع.', {}, {
        timeout: 8000,
      }),
    ).toBeTruthy()
  })

  it('warns on draft, scheduled and sent runs only, and never when the flag is false or absent', async () => {
    const cases: [PaymentRunDto['state'], boolean][] = [
      ['DRAFT', true],
      ['SCHEDULED', true],
      ['EXPORTED', true],
      ['PAID', false],
      ['CANCELLED', false],
    ]
    for (const [state, warned] of cases) {
      detail = { ...CHANGED_SINCE_ADDED, run: run({ state }) }
      const view = renderAt(`/expenditure/payments/${RUN_ID}`)
      expect(await screen.findByRole('link', { name: 'MR-1' }, { timeout: 8000 })).toBeTruthy()
      expect(!!screen.queryByText(/bank details changed\. Check before you pay/), state).toBe(warned)
      view.unmount()
    }
    for (const flag of [false, undefined, null]) {
      detail = {
        ...CHANGED_SINCE_ADDED,
        items: CHANGED_SINCE_ADDED.items.map((item) => ({
          ...item,
          supplierBankDetailsChangedSinceAdded: flag,
        })),
      }
      const view = renderAt(`/expenditure/payments/${RUN_ID}`)
      expect(await screen.findByRole('link', { name: 'MR-1' }, { timeout: 8000 })).toBeTruthy()
      expect(screen.queryByText(/bank details changed/)).toBeNull()
      view.unmount()
    }
    // Eight renders in one test: more than the default 15 s when the machine is busy.
  }, 30_000)

  it('lists the suppliers as the page does, once each and only with a name', () => {
    const item = (supplierId: string | null, supplierName: string | null, flag?: boolean | null) => ({
      supplierId,
      supplierName,
      supplierBankDetailsChangedSinceAdded: flag,
    })
    expect(
      bankDetailsChangedIn('SCHEDULED', [
        item('s-1', 'A', true),
        item('s-1', 'A', true),
        item('s-2', 'B', false),
        item('s-3', '  ', true),
        item(null, 'C', true),
        item('s-4', 'D'),
      ]),
    ).toEqual([
      { key: 's-1', name: 'A' },
      { key: 'C', name: 'C' },
    ])
    expect(bankDetailsChangedIn('PAID', [item('s-1', 'A', true)])).toEqual([])
    expect(bankDetailsChangedIn('CANCELLED', [item('s-1', 'A', true)])).toEqual([])
  })

  it('still draws an old sent run, with none of the bank-file lines', async () => {
    detail = {
      ...SENT,
      fileStored: true,
      bankDetailsChangedSinceFile: TWO_CHANGED,
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await screen.findByRole('link', { name: 'SS-3' }, { timeout: 8000 })).toBeTruthy()
    expect(screen.getByText('Sent to bank')).toBeTruthy()
    expect(screen.queryByText(/after this file was made/)).toBeNull()
    expect(screen.queryByText(/bank details changed/)).toBeNull()
    expect(screen.queryByText(/already sent to the bank/)).toBeNull()
  })
})

/**
 * A paid run: MR-1 paid; Sohar Steel's SS-3 taken out. SS-3 was planned with an early-payment
 * discount, so what it still owes (200.000) is more than its run amount (196.000).
 */
const PAID_SOHAR_OUT: PaymentRunDetailDto = {
  ...SENT,
  run: run({ state: 'PAID', paymentDate: '2026-09-20', paidAt: '2026-09-20T10:00:00Z' }),
  items: [
    { ...SENT.items[0], takenOut: null },
    {
      ...SENT.items[1],
      amount: 196,
      discountTaken: 4,
      outstanding: 200,
      markPaidBlock: null,
      takenOut: {
        at: '2026-09-20T10:00:00Z',
        actor: 'u-1',
        reason: 'Paid next month',
        owedNow: 200,
      },
    },
  ],
}

describe("the owner's last points of 10 Oct 2026", () => {
  const headerOf = async (name: string) =>
    (await screen.findAllByText(name, { selector: 'p.text-base' }, { timeout: 8000 }))[0].closest(
      'div.bg-surface-background',
    ) as HTMLElement
  const whoGetsPaid = () => screen.getByText('Who gets paid').closest('section') as HTMLElement
  /** The line under the totals as seen: the hidden "OMR" left out. */
  const seen = (element: Element) => {
    const copy = element.cloneNode(true) as Element
    copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove())
    return (copy.textContent ?? '').replace(/\s+/g, ' ')
  }

  it('draws the payment date with no required mark', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const label = await screen.findByText('Payment date', undefined, { timeout: 8000 })
    expect(label.textContent).toBe('Payment date')
  })

  it('clears a planned date, sending none, and offers no Clear without a date', async () => {
    // The server puts a scheduled run back to a draft when its date is cleared.
    override = (url, method) =>
      method === 'PUT' && url === `/api/v1/payment-runs/${RUN_ID}`
        ? json(200, { ...DETAIL, run: run({ state: 'DRAFT', paymentDate: null }) })
        : null
    const view = renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await screen.findByText(/^Scheduled for /, undefined, { timeout: 8000 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(calls('PUT', `/api/v1/payment-runs/${RUN_ID}`)).toHaveLength(1))
    expect(bodyOf(calls('PUT', `/api/v1/payment-runs/${RUN_ID}`)[0])).toMatchObject({
      paymentDate: null,
    })
    // Back to a draft: no "Scheduled for", no Clear, and it can still be marked paid.
    await waitFor(() => expect(screen.queryByText(/^Scheduled for /)).toBeNull())
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeTruthy()
    view.unmount()
    override = null

    detail = { ...DETAIL, run: run({ state: 'DRAFT', paymentDate: null }) }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    await screen.findByText('Payment date', undefined, { timeout: 8000 })
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('starts a run with no payment date', async () => {
    renderAt('/expenditure/payments/new')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select MR-2' }, { timeout: 8000 }))
    await waitFor(() => expect(calls('POST', '/api/v1/payment-runs')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/payment-runs')[0])).toMatchObject({ paymentDate: null })
  })

  it('says "Scheduled for" only when the run has a date', async () => {
    detail = { ...DETAIL, run: run({ state: 'SCHEDULED', paymentDate: null }) }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText('Mark the run paid once you have paid the suppliers.', undefined, {
        timeout: 8000,
      }),
    ).toBeTruthy()
    expect(screen.queryByText(/Scheduled for/)).toBeNull()
  })

  it('says the undated note in Arabic', async () => {
    await i18n.changeLanguage('ar')
    detail = { ...DETAIL, run: run({ state: 'SCHEDULED', paymentDate: null }) }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText('سجّل الدفعة كمدفوعة بعد أن تدفع للمورّدين.', undefined, {
        timeout: 8000,
      }),
    ).toBeTruthy()
    expect(screen.queryByText(/مجدولة ليوم/)).toBeNull()
  })

  it('heads a supplier whose bills were all taken out "Taken out", with no transfer', async () => {
    detail = PAID_SOHAR_OUT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const sohar = within(await headerOf('Sohar Steel'))
    expect(sohar.getByText('Taken out')).toBeTruthy()
    expect(sohar.queryByText(/paid as one transfer|paid on its own/)).toBeNull()
    expect(sohar.queryByText('one transfer')).toBeNull()
    // No amount either: nothing went to them (lead, 10 Oct 2026).
    expect(sohar.queryByText(/\d\.\d{3}/)).toBeNull()
    // A supplier that was paid keeps its header.
    const roastery = within(await headerOf('Muscat Roastery Co'))
    expect(roastery.getByText('1 bill · paid on its own')).toBeTruthy()
    expect(roastery.getByText('one transfer')).toBeTruthy()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    detail = PAID_SOHAR_OUT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(within(await headerOf('Sohar Steel')).getByText('أُخرجت من الدفعة')).toBeTruthy()
  })

  it('counts a taken-out bill at what it still owes, without the discount', async () => {
    detail = PAID_SOHAR_OUT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    await headerOf('Sohar Steel')
    const [line] = screen.queryAllByText(
      (_, element) => element?.tagName === 'P' && /^Paid .+ · taken out /.test(seen(element!)),
    )
    expect(seen(line)).toBe('Paid 980.000 · taken out 200.000')
  })

  it("reads what a taken-out bill owes from the server's owedNow, else from the item", async () => {
    const withOwed = (owedNow: number | undefined) => ({
      ...PAID_SOHAR_OUT,
      items: [
        PAID_SOHAR_OUT.items[0],
        {
          ...PAID_SOHAR_OUT.items[1],
          outstanding: 210,
          takenOut: { ...PAID_SOHAR_OUT.items[1].takenOut!, owedNow },
        },
      ],
    })
    for (const [owedNow, shown] of [
      [150, 'Paid 980.000 · taken out 150.000'],
      [undefined, 'Paid 980.000 · taken out 210.000'],
    ] as const) {
      detail = withOwed(owedNow)
      const view = renderAt(`/expenditure/payments/${RUN_ID}`)
      await headerOf('Sohar Steel')
      const [line] = screen.queryAllByText(
        (_, element) => element?.tagName === 'P' && /^Paid .+ · taken out /.test(seen(element!)),
      )
      expect(seen(line)).toBe(shown)
      view.unmount()
    }
  })

  it("shows a taken-out row at the server's owedNow, without the discount", async () => {
    detail = PAID_SOHAR_OUT
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const row = (await screen.findByRole('link', { name: 'SS-3' }, { timeout: 8000 })).closest(
      'div.border-t',
    ) as HTMLElement
    expect(within(row).getByText('200.000')).toBeTruthy()
    expect(within(row).queryByText('196.000')).toBeNull()
  })

  it('lists only the suppliers paid under Who gets paid on a paid run', async () => {
    detail = PAID_SOHAR_OUT
    const view = renderAt(`/expenditure/payments/${RUN_ID}`)
    await headerOf('Sohar Steel')
    const paid = within(whoGetsPaid())
    expect(paid.getByText('Muscat Roastery Co')).toBeTruthy()
    expect(paid.queryByText('Sohar Steel')).toBeNull()
    view.unmount()

    // A run still to be paid lists everyone in it.
    detail = { ...PAID_SOHAR_OUT, run: run({ state: 'SCHEDULED' }) }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    await headerOf('Sohar Steel')
    expect(within(whoGetsPaid()).getByText('Sohar Steel')).toBeTruthy()
  })

  it('counts only the suppliers and transfers paid in This run on a paid run', async () => {
    const count = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).parentElement!.querySelector('dd')!.textContent
    detail = PAID_SOHAR_OUT
    const view = renderAt(`/expenditure/payments/${RUN_ID}`)
    await headerOf('Sohar Steel')
    expect(count('Suppliers')).toBe('1')
    expect(count('Transfers')).toBe('1')
    view.unmount()

    detail = { ...PAID_SOHAR_OUT, run: run({ state: 'SCHEDULED' }) }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    await headerOf('Sohar Steel')
    expect(count('Suppliers')).toBe('2')
    expect(count('Transfers')).toBe('2')
  })

  // Backend #480: a supplier debit note nobody has accepted is not payable (owner, 10 Oct 2026).
  it('says to accept a debit note first, where a refused one says it was refused', async () => {
    const { ApiError } = await import('../../api')
    const { refusalOf } = await import('../../lib/paymentRuns')
    const refused = (code: string, problem: Record<string, unknown>) =>
      new ApiError({ status: 400, problemType: 'expenditure-refused', code, problem })
    const note = { billId: 'dn-1', supplierBillNumber: 'GCL-DN-0091', documentTypeCode: '383' }
    const notAccepted = refused('PAYMENT_RUN_DEBIT_NOTE_NOT_ACCEPTED', note)
    for (const action of ['add', 'markPaid'] as const)
      expect(refusalOf(notAccepted, i18n.getFixedT('en'), action)).toBe(
        'Accept the debit note before you pay it.',
      )
    expect(refusalOf(notAccepted, i18n.getFixedT('ar'), 'add')).toBe(
      'اقبل الإشعار المدين قبل أن تدفعه.',
    )

    override = (url) =>
      url === `/api/v1/payment-runs/${RUN_ID}/blocked`
        ? json(200, [
            {
              billId: 'dn-1',
              supplierBillNumber: 'GCL-DN-0091',
              supplierId: SUPPLIER,
              supplierName: 'Muscat Roastery Co',
              dueDate: null,
              outstanding: 96.5,
              reasonCodes: ['DEBIT_NOTE_NOT_ACCEPTED'],
              approvalsGiven: null,
              approvalsRequired: null,
            },
          ])
        : null
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText('Accept the debit note before you pay it.', undefined, {
        timeout: 8000,
      }),
    ).toBeTruthy()
  })

  it('words Mark as paid as approved, with the rial sign and three decimals', async () => {
    detail = SCHEDULED_TWO
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    const sentence = dialog.getByText(/^This records every bill/)
    expect(seen(sentence)).toBe(
      'This records every bill in the run as paid, 980.000 in all. Take out the bills you did not pay.',
    )
    expect(sentence.querySelector('svg')).not.toBeNull()
  })
})
