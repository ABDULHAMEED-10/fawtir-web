import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ArchiveItemDto, ArchiveListDto } from '../../api/compliance/archive'
import {
  artefactRows,
  counterpartyValue,
  directionOf,
  formatBytes,
  frozenNote,
  recordBytes,
  recordKind,
  showingNote,
  statusChip,
  taxYears,
  timeLeft,
  visibleItems,
} from '../../lib/documentArchive'
import { profileLabel, readArchiveXml } from '../../lib/archiveXml'
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
  links: {
    self: '/api/v1/compliance/documents/11111111-1111-1111-1111-111111111111',
    activity: '/api/v1/compliance/activity/11111111-1111-1111-1111-111111111111',
  },
}

const RECEIVED: ArchiveItemDto = {
  ...ISSUED,
  invoice_uuid: '22222222-2222-2222-2222-222222222222',
  direction: 'RECEIVED',
  document_kind: 'STANDARD_INVOICE',
  invoice_number: 'SOHAR-1002',
  tdd: { status: null, ack: 'NONE' },
  artefacts: {
    ...ISSUED.artefacts,
    pdf: artefact(false),
    qr: artefact(false),
    tdd: artefact(true, null),
    mls_count: 0,
  },
  retention: {
    ...ISSUED.retention,
    legal_hold: {
      held: true,
      reason: 'Tax audit 2026',
      set_by: 'u-9',
      set_at: '2026-09-10T06:00:00Z',
    },
  },
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let page: () => ArchiveListDto
let refuse = false

const calls = (prefix: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix))

beforeEach(async () => {
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }),
  )
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
      return found
        ? json(200, found)
        : json(404, { type: 'https://api.fawtir.om/problems/not-found' })
    }
    if (url.startsWith('/api/v1/compliance/documents')) {
      return refuse
        ? json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' })
        : json(200, page())
    }
    if (url.startsWith('/api/v1/invoices/'))
      return new Response('<Invoice/>', {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      })
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
    const issued = (await screen.findByRole('link', { name: 'INV-2026-000004' })).closest(
      'li',
    ) as HTMLElement
    const received = screen.getByRole('link', { name: 'SOHAR-1002' }).closest('li') as HTMLElement
    // The archive names the other party by identifier only, so that is what the title carries.
    expect(within(issued).getByText(/OM1100628391/)).toBeTruthy()
    expect(within(received).getByText(/OM1100628391/)).toBeTruthy()
    // The row's chip: how the tax document fared, and a hold before anything else.
    expect(within(issued).getByText('TDD accepted')).toBeTruthy()
    expect(within(received).getByText('Legal hold')).toBeTruthy()
    expect(within(issued).getByText('31 Dec 2037')).toBeTruthy()
    expect(within(received).getByText(/on hold/)).toBeTruthy()
    // Only what is held gets a format tag.
    expect(within(issued).getByText('QR')).toBeTruthy()
    expect(within(received).queryByText('QR')).toBeNull()
    // No total exists, so the page says what it is showing, and the figures say they are not known.
    expect(screen.getByText('Showing 1 to 2')).toBeTruthy()
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0)
  })

  it('asks the server for each filter, and narrows the legal-hold tab itself', async () => {
    renderArchive()
    await screen.findByRole('link', { name: 'INV-2026-000004' })

    fireEvent.click(screen.getByRole('tab', { name: 'Bills received' }))
    await waitFor(() =>
      expect(
        calls('/api/v1/compliance/documents?').some((call) =>
          String(call[0]).includes('direction=RECEIVED'),
        ),
      ).toBe(true),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kind' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Credit note' }))
    await waitFor(() =>
      expect(
        calls('/api/v1/compliance/documents?').some((call) =>
          String(call[0]).includes('document_kind=CREDIT_NOTE'),
        ),
      ).toBe(true),
    )

    fireEvent.change(screen.getByPlaceholderText('Search here...'), {
      target: { value: 'INV-2026' },
    })
    await waitFor(() =>
      expect(
        calls('/api/v1/compliance/documents?').some((call) =>
          String(call[0]).includes('invoice_number=INV-2026'),
        ),
      ).toBe(true),
    )

    // The archive has no legal-hold filter, so that tab narrows the page it was given.
    fireEvent.click(screen.getByRole('tab', { name: 'Legal hold' }))
    expect(await screen.findByRole('link', { name: 'SOHAR-1002' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'INV-2026-000004' })).toBeNull()
  })

  it('pages with what the server gives it, having no total to count', async () => {
    renderArchive()
    await screen.findByRole('link', { name: 'INV-2026-000004' })
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    page = () => ({ items: [RECEIVED], page: 1, page_size: 20, has_more: false })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(
        calls('/api/v1/compliance/documents?').some((call) => String(call[0]).includes('page=1')),
      ).toBe(true),
    )
    expect(await screen.findByText('Showing 21 to 21')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens a row to its files and downloads only what the archive serves', async () => {
    const saved: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download)
    })
    renderArchive()
    await screen.findByRole('link', { name: 'INV-2026-000004' })
    fireEvent.click(screen.getByRole('button', { name: 'Show the files of INV-2026-000004' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download INV-2026-000004.xml' }))
    await waitFor(() => expect(calls('/api/v1/invoices/sub-1/document')).toHaveLength(1))
    expect(saved).toEqual(['INV-2026-000004.xml'])
    // The transport receipt exists with nothing serving it: named, not offered.
    expect(
      (screen.getByRole('button', { name: 'Download Transport receipt' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('lays a record out from the signed XML the archive serves', async () => {
    const saved: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download)
    })
    renderArchive(`/compliance/documents/${ISSUED.invoice_uuid}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'INV-2026-000004' })).toBeTruthy()
    // The preview reads the XML from the address the archive gives.
    await waitFor(() => expect(calls('/api/v1/invoices/sub-1/document')).toHaveLength(1))
    expect(await screen.findByText('Tax invoice INV-2026-000004')).toBeTruthy()
    expect(
      screen.getByText('Nobody can edit or delete this until 2037, including you.'),
    ).toBeTruthy()
    // No hold route exists: the button is drawn and sends nothing.
    expect(
      (screen.getByRole('button', { name: 'Place a legal hold' }) as HTMLButtonElement).disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(calls('/api/v1/invoices/sub-1/document')).toHaveLength(2))
    expect(saved).toHaveLength(1)

    // The transport receipt exists with nothing serving it: named, not offered.
    fireEvent.click(screen.getByRole('button', { name: /Transport receipt/ }))
    expect(await screen.findByText('Held, no download yet')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    // The delivery record is a screen, not a file.
    fireEvent.click(screen.getByRole('button', { name: /MLS responses/ }))
    expect(
      (await screen.findByRole('link', { name: 'Open the delivery record' })).getAttribute('href'),
    ).toBe('/compliance/activity')
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

  it('draws the empty archive as the design does, with the upload offered', async () => {
    page = () => ({ items: [], page: 0, page_size: 20, has_more: false })
    renderArchive()
    expect(await screen.findByText('Nothing filed here yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Upload a document' }).getAttribute('href')).toBe(
      '/compliance/documents/upload',
    )
    // An empty archive is the one case the page can count itself.
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2)
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderArchive()
    expect(await screen.findByRole('heading', { level: 1, name: 'المستندات' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'الفواتير المستلمة' })).toBeTruthy()
  })
})

describe('archive helpers', () => {
  it('lists every artefact, saying which can be downloaded', () => {
    const rows = artefactRows(ISSUED.artefacts)
    expect(rows.map((row) => row.id)).toEqual([
      'xml',
      'tdd',
      'pdf',
      'qr',
      'mls',
      'delivery_notification',
    ])
    expect(rows.find((row) => row.id === 'delivery_notification')).toMatchObject({
      available: true,
      href: null,
    })
    expect(rows.find((row) => row.id === 'mls')).toMatchObject({ opens: true, count: 2 })
    expect(artefactRows(RECEIVED.artefacts).find((row) => row.id === 'pdf')?.available).toBe(false)
  })

  it('says why a document is frozen, hold before retention', () => {
    expect(frozenNote(RECEIVED)).toEqual({ key: 'documents.frozen.legalHold' })
    expect(frozenNote(ISSUED)).toEqual({
      key: 'documents.frozen.retention',
      values: { date: '2037-12-31' },
    })
    expect(
      frozenNote({ ...ISSUED, retention: { ...ISSUED.retention, under_retention: false } }),
    ).toBeNull()
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

describe('the design reading of an archive row', () => {
  it('names the record, its chip and the time left', () => {
    expect(recordKind(ISSUED)).toBe('salesInvoice')
    expect(recordKind(RECEIVED)).toBe('billReceived')
    expect(recordKind({ ...ISSUED, document_kind: 'CREDIT_NOTE', direction: 'RECEIVED' })).toBe(
      'creditReceived',
    )
    expect(statusChip(ISSUED)).toEqual({ key: 'documents.chip.ACCEPTED', tone: 'green' })
    expect(statusChip(RECEIVED)).toEqual({ key: 'documents.chip.legalHold', tone: 'amber' })
    expect(timeLeft('2036-06-23', '2026-09-25')).toEqual({ years: 9, months: 8 })
    expect(timeLeft('2026-01-01', '2026-09-25')).toBeNull()
    expect(formatBytes(18 * 1024)).toBe('18 KB')
    // A size is summed only when every file has one.
    expect(recordBytes(ISSUED)).toBeNull()
  })

  it('reads the signed UBL into the sheet the record page lays out', () => {
    const sheet =
      readArchiveXml(`<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="c" xmlns:cac="a">
      <cbc:CustomizationID>urn:peppol:pint:billing-1@om-1</cbc:CustomizationID><cbc:ID>INV-9</cbc:ID><cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
      <cac:AccountingSupplierParty><cac:Party><cbc:EndpointID schemeID="0248">OM1</cbc:EndpointID><cac:PartyLegalEntity><cbc:RegistrationName>Al Bahja Coffee LLC</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
      <cac:TaxTotal><cbc:TaxAmount>5.000</cbc:TaxAmount></cac:TaxTotal>
      <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>100.000</cbc:TaxExclusiveAmount><cbc:PayableAmount>105.000</cbc:PayableAmount></cac:LegalMonetaryTotal>
      <cac:InvoiceLine><cbc:InvoicedQuantity unitCode="KGM">2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>100.000</cbc:LineExtensionAmount>
        <cac:Item><cbc:Name>Beans</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>5</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item></cac:InvoiceLine>
    </Invoice>`)
    expect(sheet).toMatchObject({
      number: 'INV-9',
      typeCode: '380',
      net: '100.000',
      vat: '5.000',
      total: '105.000',
      vatPercent: '5',
      isCredit: false,
    })
    expect(sheet?.sender).toMatchObject({ name: 'Al Bahja Coffee LLC', endpoint: '0248:OM1' })
    expect(sheet?.lines[0]).toMatchObject({ item: 'Beans', quantity: '2', unitCode: 'KGM' })
    expect(profileLabel(sheet?.profile ?? null)).toBe('PINT-OM')
    expect(readArchiveXml('not xml')).toBeNull()
  })
})
