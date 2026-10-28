import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { BillDetailDto, BillHoldDto } from '../../api/expenditure/bills'
import { BillDetailPage } from './BillDetailPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const COPY = '11111111-1111-1111-1111-111111111111'
const ORIGINAL = '22222222-2222-2222-2222-222222222222'
const COPY_URL = `/api/v1/bills/${COPY}`
const ORIGINAL_URL = `/api/v1/bills/${ORIGINAL}`
const RESOLVE_URL = `${COPY_URL}/duplicate-resolution`

const APPROVER: Entitlements = {
  userId: 'u-1',
  username: 'approver',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.approve', 'invoice.payment.manage'],
  scopes: [],
  featureFlags: {},
}
/** Captures and pays bills but does not approve them: may not turn a copy into a debt alone. */
const PAYER: Entitlements = {
  ...APPROVER,
  username: 'payer',
  permissions: ['invoice.read', 'invoice.payment.manage'],
}

const SERVER_REASON =
  'Possible duplicate of bill ' + ORIGINAL + ': the same Peppol supplier sent the same document number and type again.'

function duplicateHold(overrides: Partial<BillHoldDto> = {}): BillHoldDto {
  return {
    id: 'h-1',
    reason: SERVER_REASON,
    openedBy: 'system',
    openedAt: '2026-10-28T08:00:00Z',
    releasedBy: null,
    releasedAt: null,
    duplicateOfBillId: ORIGINAL,
    duplicateResolution: null,
    duplicateResolvedBy: null,
    duplicateResolvedAt: null,
    duplicateResolutionNote: null,
    ...overrides,
  }
}

function bill(
  id: string,
  delivery: string,
  overrides: Partial<BillDetailDto> & { row?: Partial<BillDetailDto['bill']> } = {},
): BillDetailDto {
  const { row, ...rest } = overrides
  return {
    bill: {
      id,
      inboundDeliveryId: delivery,
      source: 'PEPPOL',
      networkVerified: true,
      supplierId: null,
      supplierName: 'Qalhat Marine Supplies',
      documentTypeCode: '380',
      supplierBillNumber: 'QMS-7781',
      issueDate: '2026-09-01',
      dueDate: '2026-10-01',
      overdue: false,
      currencyCode: 'OMR',
      totalIncludingVat: 2354.31,
      vatAmount: 112.11,
      amountDue: 2354.31,
      paidAmount: 0,
      creditedAmount: 0,
      outstandingAmount: 2354.31,
      purchaseOrderReference: null,
      workflowState: 'NEW',
      complianceObligation: 'REPORTED_BY_SENDER',
      readiness: { state: 'PENDING', distinctApprovals: 0, required: 1, autoApproved: false },
      match: null,
      hold: null,
      paymentRunReference: null,
      paidOnTheSpot: false,
      ...row,
    },
    lines: [],
    readiness: { state: 'PENDING', distinctApprovals: 0, required: 1, autoApproved: false },
    approvals: [],
    hold: null,
    holdHistory: [],
    settlement: {
      billTotal: 2354.31,
      paidAmount: 0,
      creditedAmount: 0,
      outstandingAmount: 2354.31,
      currency: 'OMR',
      paymentState: 'UNPAID',
      overdue: false,
      dueDate: '2026-10-01',
    },
    payments: [],
    paymentRunReference: null,
    intake: null,
    compliance: { source: 'PEPPOL', networkVerified: true, obligation: 'REPORTED_BY_SENDER' },
    activity: [],
    ...rest,
  }
}

/** The later copy, held undecided. `sameDocumentUuid` as the server would send it. */
function heldCopy(sameDocumentUuid = false, open: BillHoldDto = duplicateHold()): BillDetailDto {
  return bill(COPY, 'd-copy', {
    hold: open,
    holdHistory: [open],
    row: {
      workflowState: 'ON_HOLD',
      issueDate: '2026-09-02',
      hold: {
        reason: open.reason,
        openedAt: open.openedAt,
        duplicateOfBillId: ORIGINAL,
        duplicateResolution: open.duplicateResolution,
      },
      duplicateHold: {
        duplicateOfBillId: ORIGINAL,
        duplicateOfBillNumber: 'QMS-7781',
        resolution: open.duplicateResolution === 'CONFIRMED_DUPLICATE' ? 'CONFIRMED_DUPLICATE' : null,
        sameDocumentUuid,
      },
    },
  })
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let copyResponses: Array<() => Response>
let resolveResponse: () => Response

const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${String(url)}`)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = APPROVER
  copyResponses = [() => json(200, heldCopy())]
  resolveResponse = () => json(200, duplicateHold({ duplicateResolution: 'CONFIRMED_DUPLICATE' }))
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === ENTITLEMENTS_URL) return json(200, who)
    if (url === RESOLVE_URL && method === 'POST') return resolveResponse()
    if (url === COPY_URL) {
      const next = copyResponses.length > 1 ? copyResponses.shift()! : copyResponses[0]
      return next()
    }
    if (url === ORIGINAL_URL) return json(200, bill(ORIGINAL, 'd-original', { row: { workflowState: 'APPROVED' } }))
    if (url === '/api/v1/inbound-invoices/d-copy')
      return json(200, inbound('d-copy', 'aaaaaaaa-0000-4000-8000-00000000000a'))
    if (url === '/api/v1/inbound-invoices/d-original')
      return json(200, inbound('d-original', 'bbbbbbbb-0000-4000-8000-00000000000b'))
    if (url.startsWith('/api/v1/compliance/activity/'))
      return json(404, { type: 'https://api.fawtir.om/problems/not-found' })
    throw new Error(`unexpected request to ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function inbound(id: string, uuid: string) {
  return {
    id,
    correlationId: uuid,
    state: 'AVAILABLE',
    validationPassed: true,
    validationFailedLayer: null,
    receivedAt: '2026-10-28T08:00:00Z',
    acknowledgedAt: null,
    mlsCode: null,
    mlsEmittedAt: null,
    mlsTransportState: null,
    mlsDeliveredAt: null,
  }
}

function renderCopy() {
  return render(
    <MemoryRouter initialEntries={[`/expenditure/bills/${COPY}`]}>
      <Routes>
        <Route path="/expenditure/bills/:id" element={<BillDetailPage />} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function card() {
  await screen.findByRole('heading', { level: 2, name: 'Possible duplicate' })
  return document.getElementById('duplicate-check') as HTMLElement
}

const resolveCalls = () => calls().filter((call) => call === `POST ${RESOLVE_URL}`)
const resolveBody = () =>
  JSON.parse(
    String(fetchMock.mock.calls.find(([url, init]) => url === RESOLVE_URL && init)?.[1]?.body),
  )

describe('a bill held as a possible duplicate', () => {
  it('compares it with the bill on file, with both document UUIDs, and never shows the English reason', async () => {
    renderCopy()
    const section = await card()
    expect(await within(section).findByText('bbbbbbbb-0000-4000-8000-00000000000b')).toBeTruthy()
    expect(within(section).getByText('aaaaaaaa-0000-4000-8000-00000000000a')).toBeTruthy()
    expect(within(section).getByText('This bill')).toBeTruthy()
    expect(within(section).getByText('Already on file')).toBeTruthy()
    expect(within(section).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(
      `/expenditure/bills/${ORIGINAL}`,
    )
    expect(within(section).getAllByText('QMS-7781')).toHaveLength(2)
    expect(within(section).getByText('Not on hold')).toBeTruthy()
    expect(within(section).getAllByText('Hold')).toHaveLength(2)
    expect(screen.queryByText(new RegExp(ORIGINAL + ':'))).toBeNull()
    expect(screen.getByText(/Held as a possible duplicate\. Decide whether it is one/)).toBeTruthy()
  })

  it('takes the document UUIDs from documentUuid, without reading the delivery records', async () => {
    const copy = heldCopy()
    copyResponses = [() => json(200, { ...copy, bill: { ...copy.bill, documentUuid: 'cccccccc-0000-4000-8000-00000000000c' } })]
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === ENTITLEMENTS_URL) return json(200, who)
      if (url === COPY_URL) return copyResponses[0]()
      if (url === ORIGINAL_URL)
        return json(
          200,
          bill(ORIGINAL, 'd-original', {
            row: { workflowState: 'APPROVED', documentUuid: 'dddddddd-0000-4000-8000-00000000000d' },
          }),
        )
      // The page's own compliance reads of this copy, unrelated to the comparison.
      if (url === '/api/v1/inbound-invoices/d-copy' || url.startsWith('/api/v1/compliance/'))
        return json(404, { type: 'https://api.fawtir.om/problems/not-found' })
      throw new Error(`unexpected request to ${init?.method ?? 'GET'} ${url}`)
    })
    renderCopy()
    const section = await card()
    expect(await within(section).findByText('dddddddd-0000-4000-8000-00000000000d')).toBeTruthy()
    expect(within(section).getByText('cccccccc-0000-4000-8000-00000000000c')).toBeTruthy()
    expect(calls()).not.toContain('GET /api/v1/inbound-invoices/d-original')
  })

  it('offers no plain release, approval or rejection, and leads to the decision instead', async () => {
    renderCopy()
    await card()
    expect(screen.queryByRole('button', { name: 'Release' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve for payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Query it' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Review duplicate' }).getAttribute('href')).toBe('#duplicate-check')
  })

  it('confirms a duplicate with a note, in one request, and reads the bill again', async () => {
    copyResponses = [
      () => json(200, heldCopy()),
      () =>
        json(
          200,
          heldCopy(
            false,
            duplicateHold({
              duplicateResolution: 'CONFIRMED_DUPLICATE',
              duplicateResolvedBy: 'u-1',
              duplicateResolvedAt: '2026-10-28T09:00:00Z',
              duplicateResolutionNote: 'Resent by the supplier',
            }),
          ),
        ),
    ]
    renderCopy()
    const section = await card()
    fireEvent.click(within(section).getByRole('button', { name: 'Confirm duplicate' }))
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Confirm duplicate' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '   ' } })
    expect(confirm.disabled).toBe(true)

    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: '  Resent by the supplier  ' },
    })
    // Both clicks inside one act: no render runs between them, so the button is still enabled
    // for the second and only the in-flight guard stops a second request.
    act(() => {
      fireEvent.click(confirm)
      fireEvent.click(confirm)
    })
    expect(await screen.findByText('Confirmed as a duplicate.')).toBeTruthy()
    expect(resolveCalls()).toHaveLength(1)
    expect(resolveBody()).toEqual({ decision: 'CONFIRMED_DUPLICATE', note: 'Resent by the supplier' })
    await waitFor(() => expect(calls().filter((call) => call === `GET ${COPY_URL}`)).toHaveLength(2))
    // The earlier bill is read once for the page, not again after the decision.
    expect(calls().filter((call) => call === `GET ${ORIGINAL_URL}`)).toHaveLength(1)

    // The final state: no decision left; when, by whom and why it was decided.
    await screen.findByRole('heading', { level: 2, name: 'Duplicate' })
    const decided = document.getElementById('duplicate-check') as HTMLElement
    expect(within(decided).queryByRole('button', { name: 'Confirm duplicate' })).toBeNull()
    expect(within(decided).queryByRole('button', { name: 'Not a duplicate' })).toBeNull()
    expect(within(decided).getByText(/^Decided /)).toBeTruthy()
    expect(within(decided).getByText(/· by you: “Resent by the supplier”/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Review duplicate' })).toBeNull()
  })

  it('says it is not a duplicate with a note', async () => {
    resolveResponse = () =>
      json(200, duplicateHold({ duplicateResolution: 'NOT_DUPLICATE', releasedAt: '2026-10-28T09:00:00Z' }))
    renderCopy()
    const section = await card()
    fireEvent.click(within(section).getByRole('button', { name: 'Not a duplicate' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/becomes an ordinary bill/)).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Second delivery' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not a duplicate' }))
    expect(await screen.findByText('Marked as not a duplicate, and released from hold.')).toBeTruthy()
    expect(resolveBody()).toEqual({ decision: 'NOT_DUPLICATE', note: 'Second delivery' })
  })

  it('reads a copy decided not a duplicate as an ordinary bill, with the decision kept', async () => {
    const released = duplicateHold({
      releasedBy: 'u-2',
      releasedAt: '2026-10-28T09:00:00Z',
      duplicateResolution: 'NOT_DUPLICATE',
      duplicateResolvedBy: 'u-2',
      duplicateResolvedAt: '2026-10-28T09:00:00Z',
      duplicateResolutionNote: 'Second delivery',
    })
    copyResponses = [() => json(200, bill(COPY, 'd-copy', { holdHistory: [released] }))]
    renderCopy()
    await screen.findByRole('heading', { level: 2, name: 'Not a duplicate' })
    const section = document.getElementById('duplicate-check') as HTMLElement
    await within(section).findByRole('link', { name: 'Open' })
    expect(within(section).getAllByText('Not on hold')).toHaveLength(2)
    expect(within(section).queryByText('Possible duplicate')).toBeNull()
    expect(within(section).getByText(/Second delivery/)).toBeTruthy()
    expect(within(section).queryByText(/by you/)).toBeNull()
    expect(within(section).queryByRole('button', { name: 'Confirm duplicate' })).toBeNull()
  })

  it('offers no approval or rejection on a confirmed duplicate either', async () => {
    copyResponses = [
      () =>
        json(
          200,
          heldCopy(
            false,
            duplicateHold({
              duplicateResolution: 'CONFIRMED_DUPLICATE',
              duplicateResolvedBy: 'u-2',
              duplicateResolvedAt: '2026-10-28T09:00:00Z',
              duplicateResolutionNote: 'Resent',
            }),
          ),
        ),
    ]
    renderCopy()
    await screen.findByRole('heading', { level: 2, name: 'Duplicate' })
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review duplicate' })).toBeNull()
    expect(screen.getByText('A duplicate of a bill already on file. It stays on hold and is never paid.')).toBeTruthy()
  })

  it('words a held credit note as a credit note: never paid or approved, set against a bill', async () => {
    const copy = heldCopy()
    copyResponses = [() => json(200, { ...copy, bill: { ...copy.bill, documentTypeCode: '381' } })]
    renderCopy()
    const section = await card()
    expect(within(section).getByText(/Compare it with the credit note already on file/)).toBeTruthy()
    expect(within(section).getByText(/It can't be set against any bill until then\./)).toBeTruthy()
    expect(within(section).queryByText(/paid/)).toBeNull()
    expect(
      screen.getByText('Held as a possible duplicate. Decide whether it is one before it can be set against a bill.'),
    ).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Not a duplicate' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/becomes an ordinary credit note that can be set against a bill/)).toBeTruthy()
    expect(within(dialog).queryByText(/approve and pay/)).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Confirm duplicate' }))
    expect(
      within(await screen.findByRole('dialog')).getByText(/never set against a bill or refunded/),
    ).toBeTruthy()
  })

  it('says a held credit note in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const copy = heldCopy()
    copyResponses = [() => json(200, { ...copy, bill: { ...copy.bill, documentTypeCode: '381' } })]
    renderCopy()
    await screen.findByRole('heading', { level: 2, name: 'فاتورة مكررة محتملة' })
    expect(screen.getByText(/قارنه بالإشعار الدائن المسجّل لديكم/)).toBeTruthy()
  })

  it('says why approving is refused when the bill became a held duplicate after the page loaded, and reads it again', async () => {
    // Read before the hold: an ordinary bill with Approve on offer; the re-read finds it held.
    copyResponses = [() => json(200, bill(COPY, 'd-copy')), () => json(200, heldCopy())]
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `${COPY_URL}/approval/approve` && init?.method === 'POST')
        return json(409, {
          type: 'https://api.fawtir.om/problems/resource-conflict',
          error: 'BILL_APPROVAL_HELD_AS_DUPLICATE',
          detail: 'English detail never shown',
        })
      return base(url, init)
    })
    renderCopy()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getByRole('button', { name: 'Approve for payment' }))
    expect(
      await screen.findByText(
        "This bill is held as a possible duplicate, so it can't be approved. Decide the duplicate check first.",
      ),
    ).toBeTruthy()
    expect(screen.queryByText('English detail never shown')).toBeNull()
    await waitFor(() => expect(calls().filter((call) => call === `GET ${COPY_URL}`)).toHaveLength(2))
    // Read again, the page shows the hold and no approval.
    await card()
    expect(screen.queryByRole('button', { name: 'Approve for payment' })).toBeNull()
  })

  it('says why rejecting is refused when the bill became a held duplicate after the page loaded, and reads it again', async () => {
    copyResponses = [() => json(200, bill(COPY, 'd-copy')), () => json(200, heldCopy())]
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `${COPY_URL}/approval/reject` && init?.method === 'POST')
        return json(409, {
          type: 'https://api.fawtir.om/problems/resource-conflict',
          error: 'BILL_REJECTION_HELD_AS_DUPLICATE',
          detail: 'English detail never shown',
        })
      return base(url, init)
    })
    renderCopy()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Wrong amount' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject the bill' }))
    expect(
      await screen.findByText(
        "This bill is held as a possible duplicate, so it can't be rejected. Decide the duplicate check first.",
      ),
    ).toBeTruthy()
    // The dialog closes, so the sentence is not hidden behind its overlay.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('English detail never shown')).toBeNull()
    await waitFor(() => expect(calls().filter((call) => call === `GET ${COPY_URL}`)).toHaveLength(2))
    // Read again, the page shows the hold and offers no rejection.
    await card()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
  })

  it('keeps the reject dialog open on a refused reason, to correct it there', async () => {
    copyResponses = [() => json(200, bill(COPY, 'd-copy'))]
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `${COPY_URL}/approval/reject` && init?.method === 'POST')
        return json(400, {
          type: 'https://api.fawtir.om/problems/approval-failed',
          error: 'APPROVAL_REASON_TOO_LONG',
        })
      return base(url, init)
    })
    renderCopy()
    await screen.findByRole('heading', { level: 1, name: 'QMS-7781' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Wrong amount' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject the bill' }))
    expect(await screen.findByText(/That reason is too long/)).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('withholds "Not a duplicate" when both copies share a document UUID, and says why', async () => {
    copyResponses = [() => json(200, heldCopy(true))]
    renderCopy()
    const section = await card()
    expect(within(section).queryByRole('button', { name: 'Not a duplicate' })).toBeNull()
    expect(within(section).getByRole('button', { name: 'Confirm duplicate' })).toBeTruthy()
    expect(within(section).getByText(/Both copies carry the same document UUID/)).toBeTruthy()
  })

  it('says the server refused "Not a duplicate" for the same document UUID, and reads the bill again', async () => {
    // A server before duplicateHold: the UUIDs are not known, so the choice is offered.
    const open = duplicateHold()
    copyResponses = [
      () =>
        json(200, {
          ...heldCopy(),
          bill: { ...heldCopy().bill, duplicateHold: undefined },
          hold: open,
        }),
    ]
    resolveResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        error: 'BILL_DUPLICATE_SAME_DOCUMENT_UUID',
        detail: 'English detail never shown',
      })
    renderCopy()
    const section = await card()
    fireEvent.click(within(section).getByRole('button', { name: 'Not a duplicate' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Different goods' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not a duplicate' }))
    expect(
      await screen.findByText('Both copies carry the same document UUID, so it cannot be marked as not a duplicate.'),
    ).toBeTruthy()
    expect(screen.queryByText('English detail never shown')).toBeNull()
    await waitFor(() => expect(calls().filter((call) => call === `GET ${COPY_URL}`)).toHaveLength(2))
  })

  it('says someone else already decided, and reads the bill again', async () => {
    resolveResponse = () =>
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        error: 'BILL_DUPLICATE_ALREADY_RESOLVED',
      })
    renderCopy()
    const section = await card()
    fireEvent.click(within(section).getByRole('button', { name: 'Confirm duplicate' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Resent' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm duplicate' }))
    expect(await screen.findByText(/Someone has already decided whether this is a duplicate/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(calls().filter((call) => call === `GET ${COPY_URL}`)).toHaveLength(2))
  })

  it("keeps the dialog open on a note refusal, with the message tied to the field", async () => {
    resolveResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        error: 'BILL_DUPLICATE_RESOLUTION_NOTE_TOO_LONG',
      })
    renderCopy()
    const section = await card()
    fireEvent.click(within(section).getByRole('button', { name: 'Confirm duplicate' }))
    const dialog = await screen.findByRole('dialog')
    const note = within(dialog).getByRole('textbox')
    expect(note.getAttribute('maxlength')).toBe('500')
    fireEvent.change(note, { target: { value: 'Resent' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm duplicate' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toBe('That note is too long. Keep it to 500 characters or fewer.')
    expect(note.getAttribute('aria-describedby')).toBe(alert.id)
    expect(note.getAttribute('aria-invalid')).toBe('true')
  })

  it('says a refused permission in the dialog', async () => {
    resolveResponse = () => json(403, { type: 'https://api.fawtir.om/problems/forbidden' })
    renderCopy()
    const section = await card()
    fireEvent.click(within(section).getByRole('button', { name: 'Confirm duplicate' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Resent' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm duplicate' }))
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(resolveCalls()).toHaveLength(1)
  })

  it('offers no decision to a reader without invoice.approve, and says who decides', async () => {
    who = PAYER
    renderCopy()
    const section = await card()
    expect(within(section).queryByRole('button', { name: 'Confirm duplicate' })).toBeNull()
    expect(within(section).queryByRole('button', { name: 'Not a duplicate' })).toBeNull()
    expect(within(section).getByText('Someone who can approve bills makes this decision.')).toBeTruthy()
    // Nor the plain release, which the payer could otherwise press.
    expect(screen.queryByRole('button', { name: 'Release' })).toBeNull()
  })

  it('says when the bill on file cannot be opened', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === ENTITLEMENTS_URL) return json(200, who)
      if (url === COPY_URL) return json(200, heldCopy())
      if (url === ORIGINAL_URL)
        return json(404, { type: 'https://api.fawtir.om/problems/resource-not-found', error: 'BILL_NOT_FOUND' })
      if (url.startsWith('/api/v1/inbound-invoices/') || url.startsWith('/api/v1/compliance/'))
        return json(404, { type: 'https://api.fawtir.om/problems/not-found' })
      throw new Error(`unexpected request to ${(init?.method ?? 'GET')} ${url}`)
    })
    renderCopy()
    const section = await card()
    expect(await within(section).findByText('Not found')).toBeTruthy()
  })

  it('reads in Arabic, with the hold row in the duplicate wording', async () => {
    await i18n.changeLanguage('ar')
    renderCopy()
    await screen.findByRole('heading', { level: 2, name: 'فاتورة مكررة محتملة' })
    const section = document.getElementById('duplicate-check') as HTMLElement
    expect(await within(section).findByText('غير محجوزة')).toBeTruthy()
    expect(within(section).getAllByText('الحجز')).toHaveLength(2)
    expect(within(section).queryByText(/الانتظار/)).toBeNull()
    expect(screen.getByRole('button', { name: 'تأكيد التكرار' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'ليست مكررة' }).length).toBeGreaterThan(0)
  })
})
