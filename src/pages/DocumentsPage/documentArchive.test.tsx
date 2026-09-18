import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ArchiveItemDto, ArchiveListDto } from '../../api/compliance/archive'
import { artefactRows, counterpartyValue, directionOf, frozenNote, showingNote, taxYears, visibleItems } from '../../lib/documentArchive'
import { DocumentsPage } from './DocumentsPage'
import { DocumentDetailPage } from '../DocumentDetailPage/DocumentDetailPage'

const READER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read'],
  scopes: [],
  featureFlags: {},
}
const OUTSIDER: Entitlements = { ...READER, username: 'nobody', permissions: ['customer.read'] }

const artefact = (available: boolean, href: string | null = null) => ({ available, href })

const ISSUED: ArchiveItemDto = {
  invoice_uuid: '11111111-1111-1111-1111-111111111111',
  direction: 'ISSUED',
  document_kind: 'STANDARD_INVOICE',
  invoice_number: 'INV-2026-000004',
  counterparty: '0248:OM1100628391',
  occurred_at: '2026-09-01T07:00:00Z',
  tax_year: 2026,
  b2c: false,
  tdd: { status: 'ACCEPTED', ack: 'AB' },
  artefacts: {
    xml: artefact(true, '/api/v1/invoices/sub-1/document'),
    tdd: artefact(true, '/api/v1/invoices/sub-1/tdd'),
    pdf: artefact(true, '/api/v1/invoices/sub-1/pdf'),
    qr: artefact(true, '/api/v1/invoices/sub-1/qr'),
    mls: artefact(true, '/api/v1/compliance/activity/corr-1'),
    mls_count: 2,
    delivery_notification: artefact(true, null),
  },
  retention: {
    retention_class: 'STANDARD',
    retain_until: '2037-12-31',
    under_retention: true,
    legal_hold: { held: false, reason: null, set_by: null, set_at: null },
    frozen: true,
  },
  links: { self: '/api/v1/compliance/documents/11111111-1111-1111-1111-111111111111', activity: '/api/v1/compliance/activity/11111111-1111-1111-1111-111111111111' },
}

const RECEIVED: ArchiveItemDto = {
  ...ISSUED,
  invoice_uuid: '22222222-2222-2222-2222-222222222222',
  direction: 'RECEIVED',
  document_kind: 'STANDARD_INVOICE',
  invoice_number: 'SOHAR-1002',
  tdd: { status: null, ack: 'NONE' },
  artefacts: { ...ISSUED.artefacts, pdf: artefact(false), qr: artefact(false), tdd: artefact(true, null), mls_count: 0 },
  retention: { ...ISSUED.retention, legal_hold: { held: true, reason: 'Tax audit 2026', set_by: 'u-9', set_at: '2026-09-10T06:00:00Z' } },
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let page: () => ArchiveListDto
let refuse = false

const calls = (prefix: string) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix))

beforeEach(async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }))
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = READER
  page = () => ({ items: [ISSUED, RECEIVED], page: 0, page_size: 20, has_more: true })
  refuse = false
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.startsWith('/api/v1/compliance/documents/')) {
      const uuid = url.split('/').pop()
      const found = [ISSUED, RECEIVED].find((item) => item.invoice_uuid === uuid)
      return found ? json(200, found) : json(404, { type: 'https://api.fawtir.om/problems/not-found' })
    }
    if (url.startsWith('/api/v1/compliance/documents')) {
      return refuse ? json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' }) : json(200, page())
    }
    if (url.startsWith('/api/v1/invoices/')) return new Response('<Invoice/>', { status: 200, headers: { 'Content-Type': 'application/xml' } })
    throw new Error(`unexpected request to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderArchive(at = '/compliance/documents') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/compliance/documents" element={<DocumentsPage />} />
        <Route path="/compliance/documents/:id" element={<DocumentDetailPage />} />
        <Route path="/compliance/activity" element={<p>activity page</p>} />
        <Route path="/suppliers" element={<p>suppliers list</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('The compliance archive, wired to the API', () => {
  it('lists what is held for each document, and says how long it must be kept', async () => {
    renderArchive()
    expect(await screen.findByRole('link', { name: 'INV-2026-000004' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'SOHAR-1002' })).toBeTruthy()
    expect(screen.getAllByText('OM1100628391').length).toBe(2)
    // 'Accepted' is also an option in the tax-authority filter, so read the row's own cell.
    expect(within(screen.getByRole('link', { name: 'INV-2026-000004' }).closest('tr') as HTMLElement).getByText('Accepted')).toBeTruthy()
    expect(screen.getByText('Not reported')).toBeTruthy()
    expect(screen.getAllByText('31 Dec 2037').length).toBe(2)
    // The received document is on hold; the sent one is not.
    expect(screen.getAllByText('Legal hold')).toHaveLength(1)
    // No total exists, so the page says what it is showing.
    expect(screen.getByText('Showing 1–2')).toBeTruthy()
  })

  it('asks the server for each filter, and narrows the legal-hold tab itself', async () => {
    renderArchive()
    await screen.findByRole('link', { name: 'INV-2026-000004' })

    fireEvent.click(screen.getByRole('tab', { name: 'Received' }))
    await waitFor(() => expect(calls('/api/v1/compliance/documents?').some((call) => String(call[0]).includes('direction=RECEIVED'))).toBe(true))

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'CREDIT_NOTE' } })
    await waitFor(() => expect(calls('/api/v1/compliance/documents?').some((call) => String(call[0]).includes('document_kind=CREDIT_NOTE'))).toBe(true))

    fireEvent.change(screen.getByPlaceholderText('Search by document number'), { target: { value: 'INV-2026' } })
    await waitFor(() => expect(calls('/api/v1/compliance/documents?').some((call) => String(call[0]).includes('invoice_number=INV-2026'))).toBe(true))

    // The archive has no legal-hold filter, so that tab narrows the page it was given.
    fireEvent.click(screen.getByRole('tab', { name: 'On legal hold' }))
    expect(await screen.findByRole('link', { name: 'SOHAR-1002' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'INV-2026-000004' })).toBeNull()
  })

  it('pages with what the server gives it, having no total to count', async () => {
    renderArchive()
    await screen.findByRole('link', { name: 'INV-2026-000004' })
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true)

    page = () => ({ items: [RECEIVED], page: 1, page_size: 20, has_more: false })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(calls('/api/v1/compliance/documents?').some((call) => String(call[0]).includes('page=1'))).toBe(true))
    expect(await screen.findByText('Showing 21–21')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens a document and offers only the files the archive serves', async () => {
    const saved: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
    renderArchive(`/compliance/documents/${ISSUED.invoice_uuid}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'INV-2026-000004' })).toBeTruthy()
    expect(screen.getByText('Tax year')).toBeTruthy()
    expect(screen.getByText(ISSUED.invoice_uuid)).toBeTruthy()
    expect(screen.getByText('Not yet')).toBeTruthy()
    // The date reads as a date, not as the API's ISO string.
    expect(screen.getByText('This document must be kept until 31 Dec 2037, so it cannot be removed before then.')).toBeTruthy()

    // The transport receipt exists with nothing serving it: named, not offered.
    const receipt = screen.getByText('Transport receipt').closest('li') as HTMLElement
    expect(within(receipt).getByText('Held, no download yet')).toBeTruthy()
    expect(within(receipt).queryByRole('button', { name: 'Download' })).toBeNull()

    const xml = screen.getByText('Signed XML').closest('li') as HTMLElement
    fireEvent.click(within(xml).getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(calls('/api/v1/invoices/sub-1/document')).toHaveLength(1))
    expect(saved).toHaveLength(1)

    // The delivery record is a screen, not a file.
    const mls = screen.getByText(/Delivery record/).closest('li') as HTMLElement
    expect(within(mls).getByRole('link', { name: 'Open the delivery record' }).getAttribute('href')).toBe('/compliance/activity')
  })

  it('shows a legal hold with its reason, and never offers to set one', async () => {
    renderArchive(`/compliance/documents/${RECEIVED.invoice_uuid}`)
    expect(await screen.findByText('Tax audit 2026')).toBeTruthy()
    expect(screen.getByText(/on legal hold, so nothing about it can be removed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /hold/i })).toBeNull()
  })

  it('reads a refusal as "no access", not as an empty archive', async () => {
    who = OUTSIDER
    refuse = true
    renderArchive()
    expect(await screen.findByText('No access')).toBeTruthy()
    expect(screen.queryByText(/Nothing filed here yet/)).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderArchive()
    expect(await screen.findByRole('heading', { level: 1, name: 'المستندات' })).toBeTruthy()
    expect(screen.getAllByText(/مُرسل/).length).toBeGreaterThan(0)
  })
})

describe('archive helpers', () => {
  it('lists every artefact, saying which can be downloaded', () => {
    const rows = artefactRows(ISSUED.artefacts)
    expect(rows.map((row) => row.id)).toEqual(['xml', 'tdd', 'pdf', 'qr', 'mls', 'delivery_notification'])
    expect(rows.find((row) => row.id === 'delivery_notification')).toMatchObject({ available: true, href: null })
    expect(rows.find((row) => row.id === 'mls')).toMatchObject({ opens: true, count: 2 })
    expect(artefactRows(RECEIVED.artefacts).find((row) => row.id === 'pdf')?.available).toBe(false)
  })

  it('says why a document is frozen, hold before retention', () => {
    expect(frozenNote(RECEIVED)).toEqual({ key: 'documents.frozen.legalHold' })
    expect(frozenNote(ISSUED)).toEqual({ key: 'documents.frozen.retention', values: { date: '2037-12-31' } })
    expect(frozenNote({ ...ISSUED, retention: { ...ISSUED.retention, under_retention: false } })).toBeNull()
  })

  it('reads a counterparty identifier as its value', () => {
    expect(counterpartyValue('0248:OM1100628391')).toBe('OM1100628391')
    expect(counterpartyValue('OM1100628391')).toBe('OM1100628391')
    expect(counterpartyValue(null)).toBeNull()
  })

  it('maps tabs to the filter the archive has, and narrows the hold tab here', () => {
    expect(directionOf('issued')).toBe('ISSUED')
    expect(directionOf('legalHold')).toBe('')
    expect(visibleItems([ISSUED, RECEIVED], 'legalHold')).toEqual([RECEIVED])
    expect(visibleItems([ISSUED, RECEIVED], 'all')).toHaveLength(2)
  })

  it('counts the rows it was given, from the page it is on', () => {
    expect(showingNote(2, 0, 20)).toEqual({ count: 2, from: 1, to: 2 })
    expect(showingNote(1, 1, 20)).toEqual({ count: 1, from: 21, to: 21 })
    expect(showingNote(0, 0, 20)).toEqual({ count: 0, from: 0, to: 0 })
    expect(taxYears('2026-09-18')[0]).toBe(2026)
    expect(taxYears('2026-09-18')).toHaveLength(10)
  })
})
