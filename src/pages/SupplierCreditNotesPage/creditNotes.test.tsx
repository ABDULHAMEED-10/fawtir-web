import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { CreditNoteRowDto, CreditNoteSummaryDto } from '../../api/expenditure/notes'
import { toCreditNoteItem } from '../../lib/supplierNoteList'
import { SupplierCreditNotesPage } from './SupplierCreditNotesPage'
import { SupplierCreditNoteDetailPage } from '../SupplierCreditNoteDetailPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const SUMMARY_URL = '/api/v1/credit-notes/summary'
const NOTE_ID = '70000000-0000-0000-0000-000000000001'
const BILL_ID = '70000000-0000-0000-0000-000000000002'
const OTHER_BILL_ID = '70000000-0000-0000-0000-000000000003'
const SETTLED_BILL_ID = '70000000-0000-0000-0000-000000000004'
const DEBIT_BILL_ID = '70000000-0000-0000-0000-000000000005'

/** A row of our own supplier's, to vary one field at a time. */
const OURS = {
  source: 'UPLOADED' as const,
  supplierId: 's-1',
  supplierName: 'Qalhat Marine Supplies',
  documentTypeCode: '380',
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  overdue: false,
  currencyCode: 'OMR',
  totalIncludingVat: 300,
  vatAmount: 15,
  paidAmount: 0,
  outstandingAmount: 300,
  purchaseOrderReference: null,
  workflowState: 'APPROVED' as const,
  readiness: { state: 'READY' as const, distinctApprovals: 1, required: 1, autoApproved: false },
  match: null,
  hold: null,
  paymentRunReference: null,
  paidOnTheSpot: false,
}

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage'],
  scopes: [],
  featureFlags: {},
}

const READER: Entitlements = { ...ADMIN, permissions: ['invoice.read'] }

const SUMMARY: CreditNoteSummaryDto = {
  currencyCode: 'OMR',
  usableCount: 3,
  usableCredit: 420.5,
  recoveredThisQuarterCount: 2,
  recoveredThisQuarter: 180,
  topSupplier: { supplierId: 's-1', supplierName: 'Qalhat Marine Supplies', noteCount: 4 },
  excludedFromTotals: 1,
}

function note(overrides: Partial<CreditNoteRowDto> = {}): CreditNoteRowDto {
  return {
    id: NOTE_ID,
    inboundDeliveryId: null,
    source: 'PEPPOL',
    networkVerified: true,
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    supplierParticipantId: '0248:1234567890',
    documentTypeCode: '381',
    creditNoteNumber: 'QMS-CN-1',
    issueDate: '2026-09-01',
    currencyCode: 'OMR',
    taxCurrencyCode: null,
    creditedAmount: 200,
    vatAmount: 9.524,
    reasonCode: 'CL02-RETURN',
    approval: 'NONE',
    status: 'UNAPPLIED',
    balance: { applied: 0, refunded: 0, remaining: 200 },
    credits: { billNumber: null, issueDate: null, documentUuid: null, billId: null, applied: false },
    ...overrides,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let notes: CreditNoteRowDto[]
let settlements: unknown[]
let applyBody: unknown
let applyRefusal: Record<string, unknown> | null
let refundBody: unknown

const calls = (prefix: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  notes = [note()]
  settlements = []
  applyBody = null
  applyRefusal = null
  refundBody = null

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
    if (url.startsWith(SUMMARY_URL)) return json(200, SUMMARY)
    if (url.includes(`/credit-notes/${NOTE_ID}/settlements`)) return json(200, settlements)
    if (url.includes(`/credit-notes/${NOTE_ID}/apply`)) {
      applyBody = JSON.parse(String(init?.body))
      if (applyRefusal !== null) {
        return new Response(
          JSON.stringify({ ...applyRefusal, status: 400, type: 'https://api.fawtir.om/problems/expenditure-refused' }),
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        )
      }
      return json(200, { settlement: {}, status: 'APPLIED', balance: { applied: 200, refunded: 0, remaining: 0 } })
    }
    if (url.includes(`/credit-notes/${NOTE_ID}/refund`)) {
      refundBody = JSON.parse(String(init?.body))
      return json(200, { settlement: {}, status: 'REFUNDED', balance: { applied: 0, refunded: 200, remaining: 0 } })
    }
    if (url.includes(`/credit-notes/${NOTE_ID}`)) return json(200, notes[0])
    if (url.includes('/credit-notes')) {
      return json(200, { items: notes, page: 0, pageSize: 20, count: notes.length, total: notes.length })
    }
    if (url.includes('/bills')) {
      return json(200, {
        items: [
          {
            id: BILL_ID,
            source: 'PEPPOL',
            supplierId: 's-1',
            supplierName: 'Qalhat Marine Supplies',
            documentTypeCode: '380',
            supplierBillNumber: 'QMS-7781',
            issueDate: '2026-09-01',
            dueDate: '2026-10-01',
            overdue: false,
            currencyCode: 'OMR',
            totalIncludingVat: 1000,
            vatAmount: 50,
            paidAmount: 0,
            outstandingAmount: 1000,
            purchaseOrderReference: null,
            workflowState: 'APPROVED',
            readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
            match: null,
            hold: null,
            paymentRunReference: null,
            paidOnTheSpot: false,
          },
          // A bill from a DIFFERENT supplier, which the server's own guard would refuse. The
          // list endpoint takes no supplier parameter, so one arrives here and the screen is
          // what has to keep it out of the picker.
          {
            id: OTHER_BILL_ID,
            source: 'UPLOADED',
            supplierId: 's-2',
            supplierName: 'Browser Check Trading',
            documentTypeCode: '380',
            supplierBillNumber: 'BCT-0001',
            issueDate: '2026-09-02',
            dueDate: '2026-10-02',
            overdue: false,
            currencyCode: 'OMR',
            totalIncludingVat: 500,
            vatAmount: 25,
            paidAmount: 0,
            outstandingAmount: 500,
            purchaseOrderReference: null,
            workflowState: 'APPROVED',
            readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
            match: null,
            hold: null,
            paymentRunReference: null,
            paidOnTheSpot: false,
          },
          // Our supplier, but nothing is owed ON a credit note, so it is not a target.
          {
            ...OURS,
            id: NOTE_ID,
            documentTypeCode: '381',
            supplierBillNumber: 'QMS-CN-1',
            outstandingAmount: 0,
          },
          // Our supplier, already settled: the server would compute nothing to apply.
          { ...OURS, id: SETTLED_BILL_ID, supplierBillNumber: 'QMS-PAID', paidAmount: 300, outstandingAmount: 0 },
          // Our supplier's DEBIT note: it ADDS to what is owed, so a credit may reduce it.
          { ...OURS, id: DEBIT_BILL_ID, documentTypeCode: '383', supplierBillNumber: 'QMS-DN-9', outstandingAmount: 60 },
        ],
        page: 0,
        pageSize: 25,
        count: 5,
        total: 5,
      })
    }
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function renderList(path = '/expenditure/credit-notes') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/expenditure/credit-notes" element={<SupplierCreditNotesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/expenditure/credit-notes/${NOTE_ID}`]}>
      <Routes>
        <Route path="/expenditure/credit-notes/:id" element={<SupplierCreditNoteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Credit notes list, wired to the API', () => {
  it('shows the summary figures and the rows the API returned', async () => {
    renderList()
    expect(await screen.findByText('QMS-CN-1')).toBeTruthy()
    expect(screen.getByText('420.500')).toBeTruthy()
    expect(screen.getByText('180.000')).toBeTruthy()
    // Twice, and both are wanted: the supplier who sent the most notes is a card of its own,
    // and the same name is on the row.
    expect(screen.getAllByText('Qalhat Marine Supplies')).toHaveLength(2)
    expect(screen.getByText('200.000')).toBeTruthy()
    // Scoped to the table: "Not used yet" is also a tab, and the status on the row is the one
    // this assertion is about.
    expect(within(screen.getByRole('table')).getByText('Not used yet')).toBeTruthy()
    // Excluded rows are said out loud rather than quietly dropped from the totals.
    expect(screen.getByText(/not counted above/)).toBeTruthy()
  })

  it('asks the server for the tab rather than filtering a page in the browser', async () => {
    renderList()
    await screen.findByText('QMS-CN-1')
    expect(calls('/api/v1/credit-notes?')).toEqual(['/api/v1/credit-notes?status=ALL&page=0&page_size=20'])

    fireEvent.click(screen.getByRole('tab', { name: 'Refunded' }))
    await waitFor(() =>
      expect(calls('/api/v1/credit-notes?').at(-1)).toBe('/api/v1/credit-notes?status=REFUNDED&page=0&page_size=20'),
    )
  })

  it('links a credit to its bill only when one bill actually carries it', async () => {
    // The server derives `applied` from `billId`; a note reducing none or several names none.
    expect(toCreditNoteItem(note()).againstBillId).toBeNull()
    expect(
      toCreditNoteItem(note({ credits: { billNumber: 'QMS-7781', issueDate: null, documentUuid: null, billId: BILL_ID, applied: true } }))
        .againstBillId,
    ).toBe(BILL_ID)

    renderList()
    await screen.findByText('QMS-CN-1')
    expect(screen.getByText('No bill yet')).toBeTruthy()
  })
})

describe('One credit note', () => {
  it('offers no target the guard would refuse: not itself, not a credit note, not a settled bill', async () => {
    renderDetail()
    await screen.findByText('QMS-CN-1')

    fireEvent.change(screen.getByLabelText('Which bill'), { target: { value: 'test' } })
    expect(await screen.findByRole('button', { name: /QMS-7781/ })).toBeTruthy()

    // Nothing is owed ON a credit note, and a settled bill would compute an amount of zero.
    expect(screen.queryByRole('button', { name: /QMS-CN-1/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /QMS-PAID/ })).toBeNull()

    // But a DEBIT note is a legitimate target — it adds to what is owed, and the server allows it.
    // The constraint and the capability, or a picker that offered nothing would pass this too.
    expect(screen.getByRole('button', { name: /QMS-DN-9/ })).toBeTruthy()
  })

  it('asks the server to narrow to this supplier rather than filtering a page it was handed', async () => {
    renderDetail()
    await screen.findByText('QMS-CN-1')

    fireEvent.change(screen.getByLabelText('Which bill'), { target: { value: 'test' } })
    await waitFor(() => expect(calls('/api/v1/bills').at(-1)).toContain('supplier_id=s-1'))
  })

  it('shows the server refusal by name when one gets through, never "try again"', async () => {
    applyRefusal = { error: 'CREDIT_NOTE_SUPPLIER_MISMATCH', trace_id: 'trace-9' }
    renderDetail()
    await screen.findByText('QMS-CN-1')

    fireEvent.change(screen.getByLabelText('Which bill'), { target: { value: 'test' } })
    fireEvent.click(await screen.findByRole('button', { name: /QMS-7781/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))

    expect(await screen.findByText(/A credit can only reduce a bill from the supplier who issued it/))
      .toBeTruthy()
    expect(screen.queryByText(/Please try again/i)).toBeNull()
  })

  it('offers only this supplier\'s bills, because the server refuses any other outright', async () => {
    renderDetail()
    await screen.findByText('QMS-CN-1')

    // Both bills come back from the list endpoint; only one can legally take this credit.
    fireEvent.change(screen.getByLabelText('Which bill'), { target: { value: 'test' } })
    expect(await screen.findByRole('button', { name: /QMS-7781/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /BCT-0001/ })).toBeNull()
  })

  it('names the supplier when nothing matches, so an empty list does not read as a broken search', async () => {
    notes = [note({ supplierId: 's-9', supplierName: 'Nobody Else LLC' })]
    renderDetail()
    await screen.findByText('QMS-CN-1')

    fireEvent.change(screen.getByLabelText('Which bill'), { target: { value: 'test' } })
    expect(await screen.findByText(/No bills from Nobody Else LLC match that/)).toBeTruthy()
  })

  it('shows all four figures of the balance, so a refunded note still adds up', async () => {
    notes = [note({ creditedAmount: 52.5, balance: { applied: 0, refunded: 12.5, remaining: 40 } })]
    renderDetail()
    await screen.findByText('QMS-CN-1')

    // 52.500 credited = 0.000 applied + 12.500 refunded + 40.000 left. Drop the refund and the
    // three that remain contradict each other.
    expect(screen.getByText('52.500')).toBeTruthy()
    expect(screen.getByText(/^Refunded/)).toBeTruthy()
    expect(screen.getByText('12.500')).toBeTruthy()
    expect(screen.getByText('40.000')).toBeTruthy()
  })

  it('applies the credit to a bill the reader picked, and sends the amount they typed', async () => {
    renderDetail()
    await screen.findByText('QMS-CN-1')

    fireEvent.change(screen.getByLabelText('Which bill'), { target: { value: 'QMS' } })
    fireEvent.click(await screen.findByRole('button', { name: /QMS-7781/ }))
    fireEvent.change(screen.getByLabelText('Amount (optional)'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))

    await waitFor(() => expect(applyBody).toEqual({ billId: BILL_ID, amount: 150 }))
  })

  it('sends no amount when none was typed, so the server takes the largest that fits', async () => {
    renderDetail()
    await screen.findByText('QMS-CN-1')

    fireEvent.change(screen.getByLabelText('Which bill'), { target: { value: 'QMS' } })
    fireEvent.click(await screen.findByRole('button', { name: /QMS-7781/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }))

    await waitFor(() => expect(applyBody).toEqual({ billId: BILL_ID, amount: null }))
  })

  it('refuses to send more than the note has left, and never asks the server', async () => {
    renderDetail()
    await screen.findByText('QMS-CN-1')

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Paid on'), { target: { value: '2026-09-20' } })

    expect(screen.getByRole('alert').textContent).toContain('200.000')
    expect(screen.getByRole('button', { name: 'Record the refund' })).toHaveProperty('disabled', true)
    expect(refundBody).toBeNull()
  })

  it('records a refund with its date and reference', async () => {
    renderDetail()
    await screen.findByText('QMS-CN-1')

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Paid on'), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText('Payment reference (optional)'), { target: { value: 'TRF-9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record the refund' }))

    await waitFor(() => expect(refundBody).toEqual({ amount: 200, paidOn: '2026-09-20', paymentReference: 'TRF-9' }))
  })

  it('offers no disposition to someone who may only read', async () => {
    who = READER
    renderDetail()
    await screen.findByText('QMS-CN-1')

    expect(screen.queryByRole('button', { name: 'Use it' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record the refund' })).toBeNull()
  })

  it('offers nothing to dispose of once the credit is spent', async () => {
    notes = [note({ status: 'APPLIED', balance: { applied: 200, refunded: 0, remaining: 0 } })]
    renderDetail()
    await screen.findByText('QMS-CN-1')

    expect(screen.getByText(/Nothing is left to dispose of/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use it' })).toBeNull()
  })

  it('labels the three figures as figures, not as the sentence an action answers with', async () => {
    // The success notice for an apply and the label above the "used so far" figure once shared
    // a key, so the card read "The credit was used against that bill." where a heading belonged.
    // Nothing failed: no test looked at the labels, and only the rendered page showed it.
    notes = [note({ balance: { applied: 50, refunded: 25, remaining: 125 } })]
    renderDetail()
    await screen.findByText('QMS-CN-1')

    expect(screen.getByText('Credited')).toBeTruthy()
    expect(screen.getByText('Used so far')).toBeTruthy()
    expect(screen.getByText('Left to use')).toBeTruthy()
    expect(screen.queryByText(/The credit was used against/)).toBeNull()
    expect(screen.getByText('125.000')).toBeTruthy()
  })

  it('says an empty history is the linked regime, not a gap', async () => {
    renderDetail()
    expect(await screen.findByText(/reduces it automatically/)).toBeTruthy()
  })

  it('shows a reason code as the code when nothing names it', async () => {
    renderDetail()
    await screen.findByText('QMS-CN-1')
    expect(within(screen.getByText('Why the supplier credited').closest('div')!).getByText('CL02-RETURN')).toBeTruthy()
  })
})
