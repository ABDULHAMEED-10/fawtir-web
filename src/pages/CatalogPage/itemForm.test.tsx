import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { ItemFormPage } from './ItemFormPage'

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [],
  // New item needs product.manage: the form saves to /v1/products.
  permissions: ['product.read', 'product.manage'],
  scopes: [],
  featureFlags: {},
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

/** The item form follows the invoice line's rules (owner, 21 Oct 2026). */
describe('the catalogue item form', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    forgetEntitlements()
    // The HS search asks the server; an empty answer is enough here.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/v1/me/entitlements'
          ? json(OWNER)
          : String(input) === '/api/v1/branches'
            ? json([
                { id: 'b-1', code: 'MCT', name: 'Muscat', type: 'HEAD_OFFICE', city: 'Muscat' },
                { id: 'b-2', code: 'SHR', name: 'Sohar', type: 'STORE', city: 'Sohar' },
              ])
            : String(input).includes('/code-lists/hs')
              ? json({ items: [], total: 0 })
              : new Response('', { status: 404 }),
      ),
    )
  })

  const renderNew = async () => {
    render(
      <MemoryRouter initialEntries={['/catalog/new']}>
        <Routes>
          <Route path="/catalog/new" element={<ItemFormPage mode="new" />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findAllByText(/^HS code/)
  }

  it('reads the four kinds as goods or service, and the classification follows', async () => {
    await renderNew()
    expect(screen.getAllByText(/^HS code/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Something you do/ }))
    expect(screen.getAllByText(/^Service type/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/^HS code/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Several things/ }))
    expect(screen.getAllByText(/^HS code/).length).toBeGreaterThan(0)
  })

  it('works the shelf price out from the price typed with VAT in it', async () => {
    await renderNew()
    const shelf = screen.getByLabelText(/Price on the shelf/) as HTMLInputElement
    expect(shelf.readOnly).toBe(true)
    fireEvent.click(screen.getByRole('switch', { name: 'Price includes VAT' }))
    expect(shelf.readOnly).toBe(false)
    fireEvent.change(shelf, { target: { value: '1.050' } })
    expect((screen.getByLabelText(/Base price/) as HTMLInputElement).value).toBe('1.000')
  })

  it('asks for the zero-rating reason once the item is zero-rated', async () => {
    await renderNew()
    expect(screen.queryByText(/^Reason no VAT is charged/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tax category' }))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Zero/ }))
    expect(screen.getAllByText(/^Reason no VAT is charged/).length).toBeGreaterThan(0)
  })

  it('is one product for the company, sold in every branch or chosen ones, with a price per branch', async () => {
    await renderNew()
    const sohar = await screen.findByLabelText('Price before VAT at Sohar')
    // Every branch by default: no tick boxes, a price per branch is still possible.
    expect(screen.queryByRole('checkbox', { name: 'Sold at Sohar' })).toBeNull()
    fireEvent.change(sohar, { target: { value: '1.5' } })
    fireEvent.blur(sohar)
    expect((sohar as HTMLInputElement).value).toBe('1.500')
    fireEvent.click(screen.getByRole('radio', { name: /Chosen branches only/ }))
    expect((screen.getByLabelText('Price before VAT at Sohar') as HTMLInputElement).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sold at Sohar' }))
    expect((screen.getByLabelText('Price before VAT at Sohar') as HTMLInputElement).disabled).toBe(
      false,
    )
  })
})
