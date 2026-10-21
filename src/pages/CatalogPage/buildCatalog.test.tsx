import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { suggestedFrom } from '../../lib/catalogTemplates'
import { BuildCatalogPage } from './BuildCatalogPage'

const OWNER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [],
  permissions: [],
  scopes: [],
  featureFlags: {},
}

const BRANCHES = [
  { id: 'b-1', code: 'MCT', name: 'Muscat', type: 'STORE', city: 'Muscat' },
  { id: 'b-2', code: 'HO', name: 'Head office', type: 'HEAD_OFFICE', city: 'Muscat' },
  { id: 'b-3', code: 'NZW', name: 'Nizwa', type: 'STORE', city: 'Nizwa' },
]

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

/** Catalogue templates by sub-business type (owner, 21 Oct 2026). */
describe('building a catalog from a template', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    forgetEntitlements()
    window.localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/v1/me/entitlements'
          ? json(OWNER)
          : String(input) === '/api/v1/branches'
            ? json(BRANCHES)
            : new Response('', { status: 404 }),
      ),
    )
  })

  const renderBuild = async () => {
    render(
      <MemoryRouter initialEntries={['/catalog/build']}>
        <Routes>
          <Route path="/catalog/build" element={<BuildCatalogPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findAllByText(/^Coffee shop$/)
  }

  it('opens on a template and switches to another business type', async () => {
    await renderBuild()
    expect(await screen.findByText('Cakes & Pastries')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Business type' }))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Grocery' }))
    expect(await screen.findByText('Household & Cleaning')).toBeTruthy()
  })

  it('starts an own catalog with nothing suggested', async () => {
    await renderBuild()
    fireEvent.click(screen.getByRole('button', { name: 'Business type' }))
    fireEvent.click(
      within(screen.getByRole('listbox')).getByRole('option', { name: 'Start my own catalog' }),
    )
    expect(await screen.findByText('Your own catalog starts empty.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add your first item' }).getAttribute('href')).toBe(
      '/catalog/new',
    )
  })

  it('lets every suggested price be typed and keeps it at three decimals', async () => {
    await renderBuild()
    const [price] = await screen.findAllByLabelText('Price')
    expect((price as HTMLInputElement).value).toBe('')
    fireEvent.change(price, { target: { value: '1.2' } })
    fireEvent.blur(price)
    expect((price as HTMLInputElement).value).toBe('1.200')
  })

  it('starts infant formula the sheet marks zero-rated as Z with its reason', () => {
    const [group] = suggestedFrom([
      {
        name: 'Baby Formula & Food',
        kinds: [
          {
            name: 'Baby Milk',
            items: [
              { name: 'Formula 400 g', unit: 'EA', zeroRated: 'VATZR-OM-01' },
              { name: 'Wipes', unit: 'PK' },
            ],
          },
        ],
      },
    ])
    expect(group.kinds[0].sizes.map((size) => [size.taxCode, size.reasonCode])).toEqual([
      ['Z0', 'VATZR-OM-01'],
      ['S5', undefined],
    ])
  })

  it('works in the head office first and remembers the branch picked (owner, 21 Oct 2026)', async () => {
    await renderBuild()
    const picker = await screen.findByRole('button', { name: 'Branch' })
    await waitFor(() => expect(picker.textContent).toContain('Head office'))
    fireEvent.click(picker)
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Nizwa' }))
    expect(picker.textContent).toContain('Nizwa')
    expect(window.localStorage.getItem('fawtir.workingBranch')).toBe('b-3')
  })
})
