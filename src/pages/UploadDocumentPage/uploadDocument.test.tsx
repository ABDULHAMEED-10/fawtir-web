import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { UploadDocumentPage } from './UploadDocumentPage'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'hafidh',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'OWNER', name: 'Owner', systemRole: true }],
  permissions: ['invoice.read', 'supplier.read', 'supplier.manage'],
  scopes: [],
  featureFlags: {},
}

/** Reads suppliers, may not change them: the seeded roles below the administrator. */
const READER: Entitlements = {
  ...MANAGER,
  username: 'reader',
  roles: [{ id: 'r-2', code: 'VIEWER', name: 'Viewer', systemRole: true }],
  permissions: ['invoice.read', 'supplier.read'],
}

const NOT_ALLOWED = 'Filing a paper needs permission to manage suppliers. Ask an administrator.'

const SUPPLIER = {
  id: 's-gulf',
  displayName: 'Gulf Cold Logistics',
  vatNumber: 'OM1100528841',
  billingChannel: 'PEPPOL',
  participantId: '0248:OM1100528841',
  selfBilling: false,
  terms: {
    paymentTerms: null,
    netDays: null,
    earlyPaymentDiscountPercent: null,
    earlyPaymentDiscountDays: null,
    earlyPaymentDiscount: null,
  },
  youOwe: { amount: 0, currency: 'OMR', openBills: 0, onHold: 0 },
  record: { health: [], paidOnTimeCount: 0, settledCount: 0, paidOnTime: '', bankChangedAt: null },
  status: 'ACTIVE',
}

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url.startsWith('/api/v1/suppliers?'))
      return json(200, { items: [SUPPLIER], page: 0, pageSize: 20, count: 1, total: 1 })
    if (url === '/api/v1/suppliers/s-gulf/documents' && (!init?.method || init.method === 'GET'))
      return json(200, [])
    if (url === '/api/v1/suppliers/s-gulf/documents' && init?.method === 'POST')
      // The server's own answer: filing needs `supplier.manage`.
      return who.permissions.includes('supplier.manage')
        ? json(201, {})
        : json(403, { type: 'https://api.fawtir.om/problems/forbidden', status: 403 })
    throw new Error(`unexpected request to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Upload a document', () => {
  it('files the paper against the chosen supplier, with what the API takes', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/compliance/documents/upload']}>
        <Routes>
          <Route path="/compliance/documents/upload" element={<UploadDocumentPage />} />
          <Route path="/suppliers/:slug" element={<p>supplier page</p>} />
        </Routes>
      </MemoryRouter>,
    )

    // Nothing is sent without a file, a name and an owner.
    fireEvent.click(await screen.findByRole('button', { name: /Save Document/ }))
    expect(await screen.findByText('Choose a file first.')).toBeTruthy()
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST'),
    ).toBe(false)

    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const file = new File(['%PDF-1.4'], 'GCL-rate-card-Aug-2026.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText('GCL-rate-card-Aug-2026.pdf')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Gulf Cold Logistics rate card'), {
      target: { value: 'Gulf Cold Logistics rate card' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Who or what it belongs to' }))
    fireEvent.click(await screen.findByRole('option', { name: /Gulf Cold Logistics/ }))

    fireEvent.click(screen.getByRole('button', { name: /Save Document/ }))
    expect(await screen.findByText('supplier page')).toBeTruthy()

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(post?.[0]).toBe('/api/v1/suppliers/s-gulf/documents')
    const form = (post?.[1] as RequestInit).body as FormData
    expect(form.get('title')).toBe('Gulf Cold Logistics rate card')
    expect(form.get('kind')).toBe('AGREEMENT')
    expect(form.get('series')).toBe('Gulf Cold Logistics rate card')
    expect((form.get('file') as File).name).toBe('GCL-rate-card-Aug-2026.pdf')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })

  // Owner's answer 4 (2 Oct): the "How long to keep it" choice is sent with the paper.
  const fileAPaper = async (choose?: string) => {
    const { container } = render(
      <MemoryRouter initialEntries={['/compliance/documents/upload']}>
        <Routes>
          <Route path="/compliance/documents/upload" element={<UploadDocumentPage />} />
          <Route path="/suppliers/:slug" element={<p>supplier page</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: /Save Document/ })
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const file = new File(['%PDF-1.4'], 'lapsed-quote.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText('lapsed-quote.pdf')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Who or what it belongs to' }))
    fireEvent.click(await screen.findByRole('option', { name: /Gulf Cold Logistics/ }))
    if (choose) fireEvent.click(screen.getByRole('radio', { name: new RegExp(choose) }))
    fireEvent.click(screen.getByRole('button', { name: /Save Document/ }))
    expect(await screen.findByText('supplier page')).toBeTruthy()
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    )
    return (post?.[1] as RequestInit).body as FormData
  }

  it('sends the screen\'s own default, "Keep it indefinitely", as kept until deleted', async () => {
    // Left out, the server keeps the paper under the ten-year rule: the default has to be sent.
    const form = await fileAPaper()
    expect(form.get('keep')).toBe('UNTIL_DELETED')
  })

  it('sends "Match the invoice it\'s attached to" as the ten-year rule', async () => {
    const form = await fileAPaper("Match the invoice it's attached to")
    expect(form.get('keep')).toBe('TEN_YEAR_RULE')
  })

  it('sends "Until a date I choose" as kept until deleted: the server has no dated deletion', async () => {
    const form = await fileAPaper('Until a date I choose')
    expect(form.get('keep')).toBe('UNTIL_DELETED')
    // No date field exists on the route.
    expect([...form.keys()].sort()).toEqual(['file', 'keep', 'kind', 'series', 'title'])
  })

  /**
   * The two cases below mount the bare page, which draws the shell itself: who is signed in comes
   * only from the shell's own question to the server, as it does in the app.
   */
  const renderBare = () =>
    render(
      <MemoryRouter initialEntries={['/compliance/documents/upload']}>
        <Routes>
          <Route path="/compliance/documents/upload" element={<UploadDocumentPage />} />
          <Route path="/suppliers/:slug" element={<p>supplier page</p>} />
        </Routes>
      </MemoryRouter>,
    )
  const posts = () =>
    fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')

  it('tells someone who may not manage suppliers so, and holds the save back', async () => {
    who = READER
    renderBare()
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
    expect(await screen.findByText(NOT_ALLOWED)).toBeTruthy()
    const save = screen.getByRole('button', { name: /Save Document/ }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    expect(screen.queryByText('Choose a file first.')).toBeNull()
    expect(posts()).toHaveLength(0)
  })

  it('shows no such notice to someone who may, and leaves the save open', async () => {
    renderBare()
    const save = (await screen.findByRole('button', { name: /Save Document/ })) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    expect(screen.queryByText(NOT_ALLOWED)).toBeNull()
  })
})
