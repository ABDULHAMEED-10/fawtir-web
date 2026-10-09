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
  ibanValid,
  supplierTile,
  windowEnd,
} from '../../lib/paymentRuns'
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

  it('offers only what each state allows', () => {
    expect(actionsFor('DRAFT')).toEqual({
      editable: true,
      canExport: false,
      canMarkPaid: false,
      canCancel: true,
    })
    expect(actionsFor('EXPORTED')).toEqual({
      editable: false,
      canExport: true,
      canMarkPaid: true,
      canCancel: false,
    })
    expect(actionsFor('PAID')).toEqual({
      editable: false,
      canExport: false,
      canMarkPaid: false,
      canCancel: false,
    })
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

  it('makes the bank file for a scheduled run, and records an exported run as paid after confirming', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }, { timeout: 8000 }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/export`)).toHaveLength(1),
    )

    detail = { ...DETAIL, run: run({ state: 'EXPORTED' }) }
    await waitFor(() =>
      expect(calls('GET', `/api/v1/payment-runs/${RUN_ID}`).length).toBeGreaterThan(1),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as paid' }, { timeout: 8000 }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
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

  it('names the note when making the bank file is refused', async () => {
    override = (url) => (url.endsWith(`/${RUN_ID}/export`) ? debitNoteRefused() : null)
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }, { timeout: 8000 }))
    expect(
      await screen.findByText(
        'DN-7 was refused after it joined this run. Take it out of the run first.',
      ),
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
        'DN-7 was refused after the bank file was made. Mark the others paid and take DN-7 out of the run.',
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
    check(await dialog.findByText(/^يُسجَّل مبلغ/))
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
      takeOut: [
        { billId: 'b-3', reason: 'Amount changed' },
        { billId: 'b-4', reason: 'The bank returned it' },
      ],
    })
  })

  it('marks the whole run paid with no body once nothing is ticked', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    const dialog = within(await openMarkPaid())
    fireEvent.click(dialog.getAllByRole('checkbox', { name: 'Take out of the run' })[1])
    expect(dialog.queryByLabelText('Reason')).toBeNull()
    fireEvent.click(dialog.getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() =>
      expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)).toHaveLength(1),
    )
    const [, init] = calls('POST', `/api/v1/payment-runs/${RUN_ID}/mark-paid`)[0]
    expect((init as RequestInit).body).toBeUndefined()
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
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }, { timeout: 8000 }))
    expect(await screen.findByRole('menuitem', { name: /Copy into a new run/ })).toBeTruthy()
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
        'The amount owed on SS-3 changed after the bank file was made. Mark the others paid and take SS-3 out of the run.',
      ),
    ).toBeTruthy()
  })

  it('warns beside Download again that the file was already sent, and only on a sent run', async () => {
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByRole('button', { name: 'Download the file again' }, { timeout: 8000 }),
    ).toBeTruthy()
    expect(
      screen.getByText('This file was already sent to the bank. Do not upload it again.'),
    ).toBeTruthy()
  })

  it('says nothing of a sent file on a scheduled run', async () => {
    detail = DETAIL
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(await screen.findByRole('button', { name: 'Download' }, { timeout: 8000 })).toBeTruthy()
    expect(screen.queryByText(/already sent to the bank/)).toBeNull()
  })

  it('says the sent-file warning in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText('أُرسل هذا الملف إلى البنك بالفعل. لا ترفعه مرة أخرى.', undefined, {
        timeout: 8000,
      }),
    ).toBeTruthy()
  })

  it('names the bill when making the bank file is refused for a changed amount', async () => {
    detail = DETAIL
    override = (url) =>
      url.endsWith(`/${RUN_ID}/export`) ? sentRunRefusal('PAYMENT_RUN_AMOUNT_CHANGED') : null
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }, { timeout: 8000 }))
    expect(
      await screen.findByText(
        'The amount owed on SS-3 changed after it joined this run. Take it out and add it again.',
      ),
    ).toBeTruthy()
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

const exportRefusal = (code: string, fields: Record<string, unknown>) =>
  json(400, {
    type: 'https://api.fawtir.om/problems/expenditure-refused',
    status: 400,
    error: code,
    detail: `${code} in English`,
    ...fields,
  })

const TWO_UNCONFIRMED = {
  suppliers: [
    { supplierId: SUPPLIER, supplierName: 'Muscat Roastery Co' },
    { supplierId: 'sup-2', supplierName: 'Sohar Steel' },
  ],
}

describe('the bank file and changed supplier IBANs (owner, 8 Oct 2026)', () => {
  async function refusedExport(code: string, fields: Record<string, unknown>) {
    override = (url) => (url.endsWith(`/${RUN_ID}/export`) ? exportRefusal(code, fields) : null)
    renderAt(`/expenditure/payments/${RUN_ID}`)
    fireEvent.click(
      await screen.findByRole('button', { name: /Download|تنزيل/ }, { timeout: 8000 }),
    )
  }

  it('names each supplier whose new bank details are not confirmed when the file is refused', async () => {
    await refusedExport('PAYMENT_RUN_BANK_DETAILS_UNCONFIRMED', TWO_UNCONFIRMED)
    expect(
      await screen.findByText(
        "Muscat Roastery Co's new bank details are not confirmed yet. Confirm them, or take their bills out of the run. " +
          "Sohar Steel's new bank details are not confirmed yet. Confirm them, or take their bills out of the run.",
      ),
    ).toBeTruthy()
    expect(calls('POST', `/api/v1/payment-runs/${RUN_ID}/export`)).toHaveLength(1)
  })

  it('names the switched-off account the run pays from', async () => {
    await refusedExport('PAYMENT_RUN_PAYER_ACCOUNT_INACTIVE', { accountName: 'Bank Muscat 4471' })
    expect(
      await screen.findByText(
        'The account you pay from, Bank Muscat 4471, is switched off. Choose an active account.',
      ),
    ).toBeTruthy()
  })

  it('asks for the legal name in English letters for the pain.001 file', async () => {
    await refusedExport('PAYMENT_RUN_PAYER_NAME_NOT_LATIN', {})
    expect(
      await screen.findByText(
        "The bank file needs the company's legal name in English letters. Update it in Company settings, then try again.",
      ),
    ).toBeTruthy()
  })

  it('says the three refusals in Arabic, with their values', async () => {
    const { refusalOf } = await import('../../lib/paymentRuns')
    const { ApiError } = await import('../../api')
    const refused = (code: string, problem: Record<string, unknown>) =>
      new ApiError({ status: 400, problemType: 'expenditure-refused', code, problem })
    const ar = i18n.getFixedT('ar')
    expect(
      refusalOf(refused('PAYMENT_RUN_BANK_DETAILS_UNCONFIRMED', TWO_UNCONFIRMED), ar, 'export'),
    ).toBe(
      'البيانات البنكية الجديدة للمورّد Muscat Roastery Co لم تُؤكَّد بعد. أكّدها أو أخرج فواتيره من الدفعة. ' +
        'البيانات البنكية الجديدة للمورّد Sohar Steel لم تُؤكَّد بعد. أكّدها أو أخرج فواتيره من الدفعة.',
    )
    expect(
      refusalOf(
        refused('PAYMENT_RUN_PAYER_ACCOUNT_INACTIVE', { accountName: 'Bank Muscat 4471' }),
        ar,
        'export',
      ),
    ).toBe('الحساب الذي تدفع منه، Bank Muscat 4471، موقوف. اختر حسابًا نشطًا.')
    expect(refusalOf(refused('PAYMENT_RUN_PAYER_NAME_NOT_LATIN', {}), ar, 'export')).toBe(
      'يحتاج الملف البنكي إلى الاسم القانوني للشركة بالأحرف الإنجليزية. حدّثه في إعدادات الشركة ثم حاول مرة أخرى.',
    )
  })

  it('says, one line per supplier, that their IBAN changed after the file was made', async () => {
    detail = {
      ...SENT,
      fileStored: true,
      bankDetailsChangedSinceFile: TWO_UNCONFIRMED.suppliers,
    }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText(
        "Muscat Roastery Co's bank details changed after this file was made. This file keeps the old IBAN; new runs use the new one.",
        undefined,
        { timeout: 8000 },
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        "Sohar Steel's bank details changed after this file was made. This file keeps the old IBAN; new runs use the new one.",
      ),
    ).toBeTruthy()
  })

  it('says the changed-IBAN line in Arabic', async () => {
    await i18n.changeLanguage('ar')
    detail = { ...SENT, bankDetailsChangedSinceFile: [TWO_UNCONFIRMED.suppliers[1]] }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByText(
        'تغيّرت البيانات البنكية للمورّد Sohar Steel بعد إنشاء هذا الملف. يبقى هذا الملف بالآيبان القديم، وتستخدم الدفعات الجديدة الآيبان الجديد.',
        undefined,
        { timeout: 8000 },
      ),
    ).toBeTruthy()
  })

  it('says nothing of changed IBANs when none changed, or the server does not say', async () => {
    detail = { ...SENT, fileStored: true, bankDetailsChangedSinceFile: [] }
    renderAt(`/expenditure/payments/${RUN_ID}`)
    expect(
      await screen.findByRole('button', { name: 'Download the file again' }, { timeout: 8000 }),
    ).toBeTruthy()
    expect(screen.queryByText(/changed after this file was made/)).toBeNull()
  })
})
