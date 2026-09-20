import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ImportBatchDto } from '../../api/counterpartyImport'
import { batchBlocker, commitSelection, comingIn, fieldLabel, fileProblem, initialSelection, problemNote, rowsInTab, tabCount } from '../../lib/stagedImport'
import { ImportCustomersPage, ImportSuppliersPage } from './StagedImportPage'

const BATCH_ID = '7f1d3d4e-2b6a-4d51-8b3c-7c6a19f0a111'

const IMPORTER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['supplier.read', 'customer.read', 'customer.import'],
  scopes: [],
  featureFlags: {},
}
const READER: Entitlements = { ...IMPORTER, username: 'viewer', permissions: ['supplier.read'] }

const BATCH: ImportBatchDto = {
  id: BATCH_ID,
  target: 'SUPPLIER',
  state: 'CHECKED',
  filename: 'suppliers.csv',
  fileSha256: 'a'.repeat(64),
  totalRows: 4,
  // Relative, not a fixed date: a review that has not expired is the premise of almost every
  // case below, and batchBlocker() disables the commit once expiresAt passes. Written down as a
  // literal it silently turned every one of those cases into "expired" on the day it arrived.
  // The expiry cases set their own dates explicitly.
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  committedAt: null,
  rows: [
    { rowNumber: 2, displayName: 'Rustaq Timber Trading', severity: 'CANNOT_IMPORT', field: 'vatRegistrationNumber', message: 'Ten digits — an Oman VATIN has twelve', cells: [], outcome: null, outcomeMessage: null },
    { rowNumber: 3, displayName: 'Sohar Packaging LLC', severity: 'NEEDS_A_LOOK', field: 'vatRegistrationNumber', message: 'A counterparty with this VAT number is already on file', cells: [], outcome: null, outcomeMessage: null },
    { rowNumber: 4, displayName: 'Barka Glass Works', severity: 'READY', field: null, message: null, cells: [], outcome: null, outcomeMessage: null },
    { rowNumber: 5, displayName: 'Ibri Motors', severity: 'READY', field: null, message: null, cells: [], outcome: null, outcomeMessage: null },
  ],
  counts: { ready: 2, needsALook: 1, cannotImport: 1, wouldImport: 3 },
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let batch: ImportBatchDto
let commitResponse: () => Response

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method)

beforeEach(async () => {
  // jsdom has no object URLs, and saving a download mints one.
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }))
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = IMPORTER
  batch = BATCH
  commitResponse = () => json(200, { batchId: BATCH_ID, selected: 3, created: 3, skipped: 1 })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.endsWith('/import/check') && method === 'POST') return json(200, batch)
    if (url.endsWith('/import/template')) return new Response('customerType\n', { status: 200, headers: { 'Content-Type': 'text/csv' } })
    if (url.endsWith(`/import/${BATCH_ID}/commit`)) return commitResponse()
    if (url.endsWith(`/import/${BATCH_ID}/failed.csv`)) return new Response('customerType\n', { status: 200, headers: { 'Content-Type': 'text/csv' } })
    if (url.endsWith(`/import/${BATCH_ID}`)) return json(200, batch)
    throw new Error(`unexpected request to ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderImport(target: 'suppliers' | 'customers' = 'suppliers', at = `/${target}/import`) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/suppliers/import" element={<ImportSuppliersPage />} />
        <Route path="/customers/import" element={<ImportCustomersPage />} />
        <Route path="/suppliers" element={<p>suppliers list</p>} />
        <Route path="/customers" element={<p>customers list</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const csvFile = (name = 'suppliers.csv') => new File(['customerType\nBUSINESS\n'], name, { type: 'text/csv' })

async function uploadFile(file = csvFile()) {
  // The file input only exists once the session has loaded and the upload step is drawn.
  await waitFor(() => expect(document.querySelector('input[type=file]')).toBeTruthy())
  const before = calls('POST', '/api/v1/suppliers/import/check').length
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
  await waitFor(() => expect(calls('POST', '/api/v1/suppliers/import/check')).toHaveLength(before + 1))
}

describe('The staged import, wired to the API', () => {
  it('checks the file without importing anything, then shows what each row would do', async () => {
    renderImport()
    expect(await screen.findByText('Drop your file here, or choose one')).toBeTruthy()
    await uploadFile()

    expect(await screen.findByRole('heading', { level: 1, name: 'Check before importing' })).toBeTruthy()
    expect(screen.getByText('suppliers.csv · 4 rows', { exact: false })).toBeTruthy()
    // The three buckets come from the server's own counts.
    expect(within(screen.getByRole('tab', { name: /Can't import/ })).getByText('1')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: /Worth a look/ })).getByText('1')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: /Ready/ })).getByText('2')).toBeTruthy()
    expect(screen.getByText('Rustaq Timber Trading')).toBeTruthy()
    expect(screen.getByText('Ten digits — an Oman VATIN has twelve')).toBeTruthy()
    // Three of four would come in; the refused row is never sent.
    expect(screen.getByText('3 of 4 coming in')).toBeTruthy()
    expect(calls('POST', '/api/v1/suppliers/import/' + BATCH_ID + '/commit')).toHaveLength(0)
  })

  it('brings in every importable row by default, and only the ticked ones after a change', async () => {
    renderImport()
    await uploadFile()
    await screen.findByRole('heading', { level: 1, name: 'Check before importing' })

    fireEvent.click(screen.getByRole('button', { name: 'Bring in 3' }))
    await waitFor(() => expect(calls('POST', `/api/v1/suppliers/import/${BATCH_ID}/commit`)).toHaveLength(1))
    // Every importable row kept: the server reads an empty body as "all of them".
    expect(JSON.parse(String(calls('POST', `/api/v1/suppliers/import/${BATCH_ID}/commit`)[0][1]?.body))).toEqual({})
    expect(await screen.findByRole('heading', { name: '3 suppliers brought in' })).toBeTruthy()
    expect(screen.getByText('3 chosen, 1 left out.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Import another file' }))
    await uploadFile()
    fireEvent.click(await screen.findByRole('tab', { name: /Worth a look/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bring in row 3' }))
    expect(screen.getByText('2 of 4 coming in')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bring in 2' }))
    await waitFor(() => expect(calls('POST', `/api/v1/suppliers/import/${BATCH_ID}/commit`)).toHaveLength(2))
    expect(JSON.parse(String(calls('POST', `/api/v1/suppliers/import/${BATCH_ID}/commit`)[1][1]?.body))).toEqual({ rowNumbers: [4, 5] })
  })

  it('says when fewer rows were created than were chosen', async () => {
    commitResponse = () => json(200, { batchId: BATCH_ID, selected: 3, created: 2, skipped: 1 })
    renderImport()
    await uploadFile()
    fireEvent.click(await screen.findByRole('button', { name: 'Bring in 3' }))
    expect(await screen.findByText(/1 row could not be created after all/)).toBeTruthy()
  })

  it('downloads the template and the rows that failed, and refuses a file that is not a CSV', async () => {
    const clicked: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    })
    renderImport()
    fireEvent.click(await screen.findByRole('button', { name: 'Download the template' }))
    await waitFor(() => expect(calls('GET', '/api/v1/suppliers/import/template')).toHaveLength(1))

    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'suppliers.xlsx', { type: 'application/vnd.ms-excel' })] } })
    expect(await screen.findByText(/isn't a CSV file/)).toBeTruthy()
    expect(calls('POST', '/api/v1/suppliers/import/check')).toHaveLength(0)

    await uploadFile()
    fireEvent.click(await screen.findByRole('button', { name: 'Download the 1 that failed' }))
    await waitFor(() => expect(calls('GET', `/api/v1/suppliers/import/${BATCH_ID}/failed.csv`)).toHaveLength(1))
    expect(clicked.length).toBeGreaterThan(1)
  })

  it('refuses to commit an expired review and says to check the file again', async () => {
    batch = { ...BATCH, expiresAt: '2020-01-01T00:00:00Z' }
    renderImport()
    await uploadFile()
    expect(await screen.findByText(/it has expired/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Bring in 3' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps the batch in the address, so a reload returns to the same review', async () => {
    renderImport('suppliers', `/suppliers/import?batch=${BATCH_ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Check before importing' })).toBeTruthy()
    expect(calls('GET', `/api/v1/suppliers/import/${BATCH_ID}`)).toHaveLength(1)
    expect(calls('POST', '/api/v1/suppliers/import/check')).toHaveLength(0)
  })

  it('is the same page for customers, on the customer routes', async () => {
    renderImport('customers')
    expect(await screen.findByRole('heading', { level: 1, name: 'Import customers from a file' })).toBeTruthy()
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [csvFile('customers.csv')] } })
    await waitFor(() => expect(calls('POST', '/api/v1/customers/import/check')).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Bring in 3' }))
    expect(await screen.findByRole('heading', { name: '3 customers brought in' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See your customers' }).getAttribute('href')).toBe('/customers')
  })

  it('asks for nothing without the import permission', async () => {
    who = READER
    renderImport()
    expect(await screen.findByText(/doesn't have access to this part of Fawtir/)).toBeTruthy()
    expect(calls('POST', '/api/v1/suppliers/import/check')).toHaveLength(0)
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderImport()
    expect(await screen.findByRole('heading', { level: 1, name: 'استيراد الموردين من ملف' })).toBeTruthy()
    await uploadFile()
    expect(await screen.findByRole('heading', { level: 1, name: 'راجع قبل الاستيراد' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /تستحق نظرة/ }))
    expect(screen.getByText('لديك طرف بالرقم الضريبي نفسه. إدخاله ثانية يعطيك نسختين.')).toBeTruthy()
  })
})

describe('staged import helpers', () => {
  it('sends null for every importable row and a list otherwise', () => {
    const all = initialSelection(BATCH)
    expect([...all].sort()).toEqual([3, 4, 5])
    expect(commitSelection(BATCH, all)).toBeNull()
    expect(commitSelection(BATCH, new Set([4, 5]))).toEqual([4, 5])
    // A refused row is never sent, even if something ticks it.
    expect(commitSelection(BATCH, new Set([2, 4, 5]))).toEqual([4, 5])
    expect(comingIn(BATCH, new Set([4]))).toBe(1)
  })

  it('splits the rows into the buckets the server gave', () => {
    expect(rowsInTab(BATCH, 'cannotImport').map((row) => row.rowNumber)).toEqual([2])
    expect(rowsInTab(BATCH, 'all')).toHaveLength(4)
    expect(tabCount(BATCH, 'ready')).toBe(2)
    expect(tabCount(BATCH, 'all')).toBe(4)
  })

  it('says why a batch can no longer be used', () => {
    const now = new Date('2026-09-18T09:00:00Z')
    expect(batchBlocker(BATCH, now)).toBeNull()
    expect(batchBlocker({ ...BATCH, expiresAt: '2026-09-18T08:00:00Z' }, now)).toBe('expired')
    expect(batchBlocker({ ...BATCH, state: 'COMMITTED' }, now)).toBe('committed')
  })

  it('translates the duplicate verdict and the columns it knows, and passes the rest through', () => {
    expect(problemNote(BATCH.rows[1])).toEqual({ key: 'stagedImport.problem.duplicateVat' })
    expect(problemNote(BATCH.rows[0])).toEqual({ text: 'Ten digits — an Oman VATIN has twelve' })
    expect(problemNote(BATCH.rows[2])).toBeNull()
    expect(fieldLabel('vatRegistrationNumber')).toEqual({ key: 'stagedImport.field.vatNumber' })
    expect(fieldLabel('somethingNew')).toEqual({ text: 'somethingNew' })
    expect(fieldLabel(null)).toBeNull()
  })

  it('checks the file before it is uploaded', () => {
    expect(fileProblem(csvFile(), 5)).toBe('size')
    expect(fileProblem(csvFile('list.xlsx'), 10_000)).toBe('type')
    expect(fileProblem(csvFile(), 10_000)).toBeNull()
  })
})
