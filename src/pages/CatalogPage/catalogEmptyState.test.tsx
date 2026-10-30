import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { SIGNUP_BUSINESS_TYPES } from '../../test/businessTypes'
import { CatalogEmptyState } from './CatalogEmptyState'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const named = (name: string) => ({ name, nameAr: null, kinds: [] })
let template: () => Response

describe('the empty catalogue names the company’s own business type (L-7)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    forgetEntitlements()
    resetSharedRequests()
    template = () =>
      json({
        subBusinessTypeCode: 'COFFEE_SHOP',
        version: 1,
        publishedAt: '2026-10-25T12:00:00Z',
        groups: [named('Hot drinks'), named('Cold drinks'), named('Bakery')],
      })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/v1/me/entitlements')
          return json({
            userId: 'u-1',
            username: 'owner',
            tenantId: 't-1',
            roles: [],
            // The upload route is offered only with product.manage.
            permissions: ['product.manage'],
            scopes: [],
            featureFlags: {},
          })
        if (url === '/api/v1/branches')
          return json([{ id: 'b-1', code: 'MCT', name: 'Muscat', type: 'STORE', city: 'Muscat' }])
        if (url === '/api/v1/catalog/templates') return template()
        if (url === '/api/v1/auth/signup/business-types') return json(SIGNUP_BUSINESS_TYPES)
        return new Response('', { status: 404 })
      }),
    )
  })

  const renderEmpty = () =>
    render(
      <MemoryRouter>
        <CatalogEmptyState />
      </MemoryRouter>,
    )

  it('says the sub type and its template’s groups, never the sample roastery', async () => {
    renderEmpty()
    expect(await screen.findByText('Coffee shop')).toBeTruthy()
    expect(screen.getByText(/Hot drinks, Cold drinks, and Bakery/)).toBeTruthy()
    expect(screen.queryByText(/roastery/i)).toBeNull()
  })

  it('offers no suggestion when the business type has no template', async () => {
    template = () => json({ type: 'https://api.fawtir.om/problems/resource-not-found' }, 404)
    renderEmpty()
    expect(await screen.findByText(i18n.t('catalogEmpty.uploadTitle'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('catalogEmpty.letFawtirSuggest'))).toBeNull()
  })
})
