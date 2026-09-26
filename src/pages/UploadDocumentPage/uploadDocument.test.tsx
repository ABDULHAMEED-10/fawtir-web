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

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
    if (url.startsWith('/api/v1/suppliers?'))
      return json(200, { items: [SUPPLIER], page: 0, pageSize: 20, count: 1, total: 1 })
    if (url === '/api/v1/suppliers/s-gulf/documents' && (!init?.method || init.method === 'GET'))
      return json(200, [])
    if (url === '/api/v1/suppliers/s-gulf/documents' && init?.method === 'POST')
      return json(201, {})
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
})
