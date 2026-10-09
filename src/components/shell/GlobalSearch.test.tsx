import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { GlobalSearch } from './GlobalSearch'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const spring = <T,>(content: T[]) => ({ content, page: 0, size: 10, totalElements: content.length })

const INVOICE = {
  id: 'inv-1',
  invoiceNumber: 'RT-0007',
  customerName: 'Real Buyer LLC',
  currency: 'OMR',
  totals: { totalAmount: 120 },
}
const CUSTOMER = { id: 'c-1', displayName: 'Real Buyer LLC', profile: { details: { vatRegistrationNumber: 'OM1122334455' } } }
const SUPPLIER = { id: 's-1', displayName: 'Real Supplier', vatNumber: null }

let fetchMock: ReturnType<typeof vi.fn>
type Lists = {
  invoices: () => Response
  customers: () => Response
  suppliers: () => Response
  documents: () => Response
  items: () => Response
}
const DOCUMENT = {
  invoice_uuid: 'doc-1',
  invoice_number: 'RT-0042',
  counterparty_name: 'Archive Buyer',
  total_amount: 55.5,
  currency: 'OMR',
}
const ITEM = { id: 'p-1', code: 'FLAT-W', name: 'Real Flat White' }

function answer(lists: Partial<Lists> = {}) {
  const all: Lists = {
    invoices: () => json(200, spring([INVOICE])),
    customers: () => json(200, spring([CUSTOMER])),
    suppliers: () => json(200, { items: [SUPPLIER], page: 0, pageSize: 4, count: 1, total: 1 }),
    documents: () => json(200, { items: [], page: 0, page_size: 4, has_more: false }),
    items: () => json(200, spring([])),
    ...lists,
  }
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/v1/authored-invoices?')) return all.invoices()
    if (url.startsWith('/api/v1/customers?')) return all.customers()
    if (url.startsWith('/api/v1/suppliers?')) return all.suppliers()
    if (url.startsWith('/api/v1/compliance/documents?')) return all.documents()
    if (url.startsWith('/api/v1/products?')) return all.items()
    throw new Error(`unexpected ${url}`)
  })
}

function renderBox() {
  render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>,
  )
  return screen.getByRole('combobox')
}

const t = (key: string, values?: Record<string, unknown>) => i18n.t(key, values)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en')
})

describe('GlobalSearch, asked of the server', () => {
  it('also finds documents by number and catalogue items, with amounts in rials', async () => {
    answer({
      documents: () => json(200, { items: [DOCUMENT], page: 0, page_size: 4, has_more: false }),
      items: () => json(200, spring([ITEM])),
    })
    const box = renderBox()
    fireEvent.change(box, { target: { value: 'real' } })

    expect(await screen.findByText('RT-0042')).toBeTruthy()
    expect(screen.getByText('Real Flat White')).toBeTruthy()
    expect(screen.getByText(t('shell.search.kind.document'))).toBeTruthy()
    expect(screen.getByText(t('shell.search.kind.item'))).toBeTruthy()
    // The figure carries the rial sign (an svg; "OMR" is only its hidden spoken name).
    expect(screen.getByText('55.500').closest('span')?.querySelector('svg')).toBeTruthy()
    const asked = fetchMock.mock.calls.map(([url]) => url as string)
    expect(asked.some((url) => url.includes('/compliance/documents?') && url.includes('invoice_number=real'))).toBe(true)
    expect(asked.some((url) => url.startsWith('/api/v1/products?') && url.includes('q=real'))).toBe(true)
  })

  it('asks the three lists once the typing pauses and shows what they answer', async () => {
    answer()
    const box = renderBox()
    fireEvent.change(box, { target: { value: 'real' } })

    expect(await screen.findByText('RT-0007')).toBeTruthy()
    expect(screen.getByText('Real Supplier')).toBeTruthy()
    expect(screen.getAllByText('Real Buyer LLC').length).toBeGreaterThan(0)
    const asked = fetchMock.mock.calls.map(([url]) => url as string)
    expect(asked.some((url) => url.startsWith('/api/v1/authored-invoices?') && url.includes('q=real'))).toBe(true)
    expect(asked.some((url) => url.startsWith('/api/v1/customers?') && url.includes('search=real'))).toBe(true)
    expect(asked.some((url) => url.startsWith('/api/v1/suppliers?') && url.includes('q=real'))).toBe(true)
  })

  it('asks nothing for one character, and finds nothing from a built-in sample', async () => {
    answer()
    const box = renderBox()
    fireEvent.change(box, { target: { value: 'a' } })

    expect(screen.getByText(t('shell.search.keepTyping'))).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Muscat Grand Hotel')
    expect(document.body.textContent).not.toContain('Al Bahja')
  })

  it('leaves out a list the reader may not see, without failing the others', async () => {
    answer({ customers: () => json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission' }) })
    const box = renderBox()
    fireEvent.change(box, { target: { value: 'real' } })

    expect(await screen.findByText('RT-0007')).toBeTruthy()
    expect(screen.queryByText(t('shell.search.kind.customer'))).toBeNull()
  })

  it('says search is not available when no list answers, not that nothing matched', async () => {
    const down = () => json(503, { type: 'about:blank' })
    answer({ invoices: down, customers: down, suppliers: down, documents: down, items: down })
    const box = renderBox()
    fireEvent.change(box, { target: { value: 'real' } })

    expect(await screen.findByText(t('shell.search.unavailable'))).toBeTruthy()
    expect(screen.queryByText(t('shell.search.nothing', { query: 'real' }))).toBeNull()
  })

  it('says nothing matched, in Arabic, when every list answers empty', async () => {
    await i18n.changeLanguage('ar')
    answer({
      invoices: () => json(200, spring([])),
      customers: () => json(200, spring([])),
      suppliers: () => json(200, { items: [], page: 0, pageSize: 4, count: 0, total: 0 }),
    })
    const box = renderBox()
    fireEvent.change(box, { target: { value: 'zz' } })

    await waitFor(() => expect(screen.getByText(t('shell.search.nothing', { query: 'zz' }))).toBeTruthy())
  })
})
