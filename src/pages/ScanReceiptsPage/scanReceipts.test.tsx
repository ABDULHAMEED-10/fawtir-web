import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { IntakeDto } from '../../api/expenditure/billIntake'
import { ScanReceiptsPage } from './ScanReceiptsPage'

/**
 * Scan receipts on its own: a receipt resumed from a draft row, discarded, refused, warned about
 * as a possible duplicate, its note and petty cash, and the page for a reader who cannot capture
 * bills. The two-photo run
 * through confirm (card, then still owing) is in `UploadBillPage/billIntake.test.tsx`.
 */

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage', 'supplier.read'],
  scopes: [],
  featureFlags: {},
}
const VIEWER: Entitlements = { ...MANAGER, username: 'viewer', permissions: ['invoice.read'] }

function receipt(id: string, overrides: Partial<IntakeDto> = {}): IntakeDto {
  return {
    id,
    source: 'SCANNED',
    filename: `${id}.jpg`,
    contentType: 'image/jpeg',
    byteSize: 2048,
    sha256: 'x',
    documentTypeCode: null,
    extractionStatus: 'NONE',
    extracted: {
      supplierName: null,
      supplierVatNumber: null,
      billNumber: null,
      issueDate: null,
      dueDate: null,
      currency: null,
      net: null,
      vat: null,
      total: null,
      lines: [],
      confidence: {},
    },
    confirmedBillId: null,
    workflowState: 'DRAFT',
    uploadedAt: '2026-09-17T08:00:00Z',
    ...overrides,
  }
}

/** A receipt someone started typing and left: its supplier, number and total come back. */
const typed = (id: string, supplierName: string, total: number) =>
  receipt(id, {
    extracted: {
      ...receipt(id).extracted,
      supplierName,
      billNumber: 'R-4471',
      issueDate: '2026-09-12',
      currency: 'OMR',
      total,
      confidence: { supplierName: true, total: true },
    },
  })

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let stored: Record<string, IntakeDto>
let uploads: IntakeDto[]
let confirmAnswers: Response[]
let discardAnswer: () => Response

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
  who = MANAGER
  stored = {}
  uploads = []
  confirmAnswers = []
  discardAnswer = () => new Response(null, { status: 204 })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.startsWith('/api/v1/bills/intake?source=') && method === 'POST')
      return json(201, uploads.shift())
    if (/\/api\/v1\/bills\/intake\/[^/]+\/confirm$/.test(url))
      return (
        confirmAnswers.shift() ??
        json(201, { id: 'b-new', supplierBillNumber: 'X', totalIncludingVat: 1, currencyCode: 'OMR' })
      )
    if (/\/api\/v1\/bills\/intake\/[^/]+\/file$/.test(url))
      return new Response('jpeg', {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Disposition': 'attachment; filename="stored.jpg"',
        },
      })
    const one = /\/api\/v1\/bills\/intake\/([^/]+)$/.exec(url)
    if (one && method === 'DELETE') return discardAnswer()
    if (one && method === 'GET') {
      const found = stored[one[1]]
      return found
        ? json(200, found)
        : json(404, {
            type: 'https://api.fawtir.om/problems/resource-not-found',
            error: 'BILL_INTAKE_NOT_FOUND',
          })
    }
    if (url.startsWith('/api/v1/suppliers?'))
      return json(200, { items: [], page: 0, pageSize: 20, total: 0 })
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
        <Route path="/expenditure/bills/scan" element={<ScanReceiptsPage />} />
        <Route path="/expenditure/bills/:id" element={<p>bill page</p>} />
        <Route path="/expenditure/bills" element={<p>bills list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function pick(files: File[]) {
  await waitFor(() => expect(document.querySelector('input[type=file]')).not.toBeNull())
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, { target: { files } })
  })
}

describe('scan receipts: a receipt stored earlier', () => {
  it('brings the receipts named in the link back into the pile, with what was typed', async () => {
    stored = {
      'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4),
      'r-2': receipt('r-2'),
    }
    renderAt('/expenditure/bills/scan?intake=r-1,r-2')

    expect(await screen.findByText('Receipt 1 of 2')).toBeTruthy()
    expect(calls('GET', '/api/v1/bills/intake/r-1')).toHaveLength(2) // the record, then its file
    expect(calls('GET', '/api/v1/bills/intake/r-2/file')).toHaveLength(1)
    // Nothing is uploaded again: the stored photo is the receipt.
    expect(calls('POST', '/api/v1/bills/intake?source=')).toHaveLength(0)
    expect((screen.getByLabelText(/Total paid/) as HTMLInputElement).value).toBe('28.400')
    expect((screen.getByLabelText(/Receipt number/) as HTMLInputElement).value).toBe('R-4471')

    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))
    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-1/confirm')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/r-1/confirm')[0])).toMatchObject({
      supplierName: 'Nizwa Hardware Store',
      billNumber: 'R-4471',
      issueDate: '2026-09-12',
      total: 28.4,
    })
    expect(await screen.findByText('Receipt 2 of 2')).toBeTruthy()
  })

  it('leaves out a receipt that was saved as a bill meanwhile', async () => {
    stored = {
      'r-1': receipt('r-1', { confirmedBillId: 'b-9', workflowState: null }),
      'r-2': typed('r-2', 'Taxi', 3),
    }
    renderAt('/expenditure/bills/scan?intake=r-1,r-2')
    expect(await screen.findByText('Receipt 1 of 1')).toBeTruthy()
    expect((screen.getByLabelText(/Total paid/) as HTMLInputElement).value).toBe('3.000')
  })

  it('says so when the receipt in the link is no longer there', async () => {
    renderAt('/expenditure/bills/scan?intake=gone')
    expect(await screen.findByText('Not found')).toBeTruthy()
    expect(screen.queryByText(/Receipt 1 of/)).toBeNull()
  })
})

describe('scan receipts: discard', () => {
  it('removes the photo on the server and from the pile', async () => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4), 'r-2': typed('r-2', 'Taxi', 3) }
    renderAt('/expenditure/bills/scan?intake=r-1,r-2')
    await screen.findByText('Receipt 1 of 2')

    fireEvent.click(screen.getByRole('button', { name: 'Discard this one' }))
    expect(await screen.findByText('Receipt 1 of 1')).toBeTruthy()
    expect(calls('DELETE', '/api/v1/bills/intake/r-1')).toHaveLength(1)
    expect(calls('DELETE', '/api/v1/bills/intake/r-2')).toHaveLength(0)
    // The one that is left is the other receipt.
    expect((screen.getByLabelText(/Total paid/) as HTMLInputElement).value).toBe('3.000')
  })

  it('keeps the receipt when the server refuses to discard it', async () => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    discardAnswer = () =>
      json(500, { type: 'https://api.fawtir.om/problems/internal-error', correlationId: 'c-1' })
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')

    const closeButtons = () => screen.queryAllByRole('button', { name: 'Close' }).length
    const before = closeButtons()
    fireEvent.click(screen.getByRole('button', { name: 'Discard this photo' }))
    await waitFor(() => expect(calls('DELETE', '/api/v1/bills/intake/r-1')).toHaveLength(1))
    // The failure is said in a notice (with its own Close), and the receipt stays in the pile.
    await waitFor(() => expect(closeButtons()).toBe(before + 1))
    expect(screen.getByText('Receipt 1 of 1')).toBeTruthy()
    expect((screen.getByLabelText(/Total paid/) as HTMLInputElement).value).toBe('28.400')
  })
})

describe('scan receipts: a confirm the server refuses', () => {
  const refused = (error: string) =>
    json(400, { type: 'https://api.fawtir.om/problems/expenditure-refused', error })

  it('marks the field a refusal belongs to and saves nothing', async () => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    confirmAnswers = [refused('BILL_INTAKE_TOTAL_INVALID')]
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')

    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))
    expect(
      await screen.findByText('Some fields need attention before the bill can be saved.'),
    ).toBeTruthy()
    expect(screen.getByLabelText(/Total paid/).getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByText('Saved as a bill.')).toBeNull()
    // The receipt can be corrected and sent again.
    expect(screen.getByRole('button', { name: 'Save and next' })).toBeTruthy()
  })

  it('says when the photo was already saved as a bill', async () => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    confirmAnswers = [refused('BILL_INTAKE_ALREADY_CONFIRMED')]
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')

    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))
    expect(await screen.findByText('This file was already saved as a bill.')).toBeTruthy()
    expect(screen.queryByText('Saved as a bill.')).toBeNull()
  })

  it('checks the receipt before sending: no supplier, nothing sent', async () => {
    uploads.push(receipt('r-new'))
    renderAt('/expenditure/bills/scan')
    await pick([new File(['a'], 'one.jpg', { type: 'image/jpeg' })])
    await screen.findByText('Receipt 1 of 1')

    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))
    expect(
      await screen.findByText('Some fields need attention before the bill can be saved.'),
    ).toBeTruthy()
    expect(calls('POST', '/api/v1/bills/intake/r-new/confirm')).toHaveLength(0)
  })
})

describe('scan receipts: a possible duplicate', () => {
  const duplicateOf = (source: string) =>
    json(409, {
      type: 'https://api.fawtir.om/problems/resource-conflict',
      error: 'BILL_INTAKE_POSSIBLE_DUPLICATE',
      duplicateOf: {
        billId: 'b-on-file',
        supplierBillNumber: 'R-4471',
        issueDate: '2026-09-12',
        total: 28.4,
        currencyCode: 'OMR',
        source,
      },
    })

  it('names the bill on file, and saves only when told it is a different bill', async () => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    confirmAnswers = [duplicateOf('SCANNED')]
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    expect(await screen.findByText('This may be a bill you already have')).toBeTruthy()
    expect(screen.getByText(/A bill R-4471 from this supplier is already recorded/)).toBeTruthy()
    expect(screen.getByText(/scanned\.$/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open that bill' }).getAttribute('href')).toBe(
      '/expenditure/bills/b-on-file',
    )
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/r-1/confirm')[0]).notDuplicateOf).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /It's a different bill/ }))
    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-1/confirm')).toHaveLength(2))
    expect(bodyOf(calls('POST', '/api/v1/bills/intake/r-1/confirm')[1]).notDuplicateOf).toBe(
      'b-on-file',
    )
    expect(await screen.findByText('Saved as a bill.')).toBeTruthy()
  })

  it.each([
    ['RECURRING', /from a recurring bill\.$/],
    ['SELF_BILLED', /self-billed\.$/],
  ])('names a %s bill on file in words, never as a raw key', async (source, words) => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    confirmAnswers = [duplicateOf(source)]
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    await screen.findByText('This may be a bill you already have')
    expect(screen.getByText(words)).toBeTruthy()
    expect(screen.queryByText(/billIntake\.duplicate/)).toBeNull()
  })
})

describe('scan receipts: a reader who cannot capture bills', () => {
  it('sees "no access", and nothing is fetched or offered', async () => {
    who = VIEWER
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    renderAt('/expenditure/bills/scan?intake=r-1')

    expect(await screen.findByText('No access')).toBeTruthy()
    expect(document.querySelector('input[type=file]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save and next' })).toBeNull()
    expect(calls('POST', '/api/v1/bills/intake')).toHaveLength(0)
  })
})

describe('scan receipts: the note and petty cash', () => {
  const confirmBody = (id: string) => bodyOf(calls('POST', `/api/v1/bills/intake/${id}/confirm`)[0])

  it('sends the note typed on the receipt, trimmed, to be kept on the bill', async () => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')
    fireEvent.change(screen.getByLabelText(/^Note/), {
      target: { value: '  Fixing the drain behind the roastery  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-1/confirm')).toHaveLength(1))
    expect(confirmBody('r-1').note).toBe('Fixing the drain behind the roastery')
  })

  it('sends no note field when nothing was typed', async () => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-1/confirm')).toHaveLength(1))
    expect('note' in confirmBody('r-1')).toBe(false)
  })

  it('brings back a note saved on the receipt earlier and sends it again', async () => {
    stored = { 'r-1': { ...typed('r-1', 'Nizwa Hardware Store', 28.4), note: 'Drain cover' } }
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')
    expect((screen.getByLabelText(/^Note/) as HTMLInputElement).value).toBe('Drain cover')
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-1/confirm')).toHaveLength(1))
    expect(confirmBody('r-1').note).toBe('Drain cover')
  })

  it('records petty cash as cash, marked so the server writes its fixed reference', async () => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')
    fireEvent.click(screen.getByRole('button', { name: 'Petty cash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-1/confirm')).toHaveLength(1))
    expect(confirmBody('r-1').paidOnTheSpot).toEqual({
      methodCode: '10',
      paymentReference: null,
      paidOn: '2026-09-12',
      pettyCash: true,
    })
  })

  it.each([
    ['Cash', '10'],
    ['Card', '48'],
  ])('does not mark %s as petty cash', async (button, methodCode) => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')
    // Through petty cash and back, so the mark is shown to follow the choice.
    fireEvent.click(screen.getByRole('button', { name: 'Petty cash' }))
    fireEvent.click(screen.getByRole('button', { name: button }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-1/confirm')).toHaveLength(1))
    expect(confirmBody('r-1').paidOnTheSpot).toEqual({
      methodCode,
      paymentReference: null,
      paidOn: '2026-09-12',
    })
  })

  it('sends no payment, and so no petty cash mark, on a receipt still owing', async () => {
    stored = { 'r-1': typed('r-1', 'Nizwa Hardware Store', 28.4) }
    renderAt('/expenditure/bills/scan?intake=r-1')
    await screen.findByText('Receipt 1 of 1')
    fireEvent.click(screen.getByRole('button', { name: 'Petty cash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Still owing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and next' }))

    await waitFor(() => expect(calls('POST', '/api/v1/bills/intake/r-1/confirm')).toHaveLength(1))
    expect(confirmBody('r-1').paidOnTheSpot).toBeNull()
  })
})
