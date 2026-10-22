import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../i18n'
import { forgetEntitlements, type Entitlements } from '../lib/identity/entitlements'
import { resetSharedRequests } from '../api'
import { ComplianceReportPage } from './ActivityPage/ComplianceReportPage'
import { CatalogPage } from './CatalogPage'
import { ModuleUnavailablePage } from '../components/feedback/ModuleUnavailable'

/**
 * The screens that used to draw a sample company (Al Bahja Coffee, Hafidh Saif, VAT OM1100392000,
 * a Bank Muscat IBAN) as if it were the reader's. Each one now shows the reader's own records, or
 * says plainly that the module is not available.
 */
const SAMPLE = /Al Bahja|albahja|Hafidh|OM1100392000|0248:OM1100392000|muscatgrand|OM55 0018|Insight Technology/

const READER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'reports.read', 'product.read'],
  scopes: [],
  featureFlags: {},
}

const PROFILE = {
  tenantId: 't-1', tenantCode: 'RT', tenantName: 'Real Trading', legalName: 'Real Trading LLC', legalNameAr: null,
  tradingName: null, taxNumber: 'OM1100777001', commercialRegistrationNumber: '7770001', country: 'OM',
  registeredAddress: 'Way 1', registeredAddressLine2: null, registeredAddressLine3: null, registeredCity: 'Muscat',
  registeredPostalCode: '112', registeredCountrySubdivision: null, registeredPoBox: null, contactPersonName: null,
  contactPhone: null, contactEmail: null, profileRevision: 1, verificationStatus: 'VERIFIED',
}

const standing = (state: string) => ({
  state,
  currentPolicySatisfied: state === 'VERIFIED',
  reverificationRequired: false,
  reverificationAvailable: false,
  policyInForce: null,
  verification:
    state === 'VERIFIED'
      ? { submissionId: 's', submissionVersion: 1, participantScheme: '0248', participantValue: 'OM1100777001',
          policyVersionId: 'p', policyVersionNumber: 1, verifiedAt: '2026-10-01T00:00:00Z' }
      : null,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let answers: Record<string, () => Response>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  answers = {
    '/api/v1/company-profile': () => json(200, PROFILE),
    '/api/v1/peppol/smp/data-submissions/standing': () => json(200, standing('VERIFIED')),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(200, READER)
      if (url.startsWith('/api/v1/compliance/activity?'))
        return json(200, { items: [{ invoice_number: 'INV-001' }, { invoice_number: 'INV-002' }], page: 0, page_size: 100, has_more: false })
      if (url.startsWith('/api/v1/products'))
        return json(200, {
          content: [{ id: 'p-1', code: 'SKU-1', name: 'Real Widget', description: null, defaultUnitCode: 'EA',
            defaultUnitPrice: 2.5, defaultTaxCategory: 'S', defaultTaxRate: 5, active: true, version: 0 }],
          page: 0, size: 100, totalElements: 1,
        })
      const answer = answers[url]
      return answer ? answer() : json(404, { type: 'about:blank' })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const at = (path: string, element: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  )

describe('the compliance report', () => {
  it("names the company from its own profile, the Participant ID once verified, and labels the document unavailable", async () => {
    vi.stubEnv('VITE_FAWTIR_DEMO_MODULES', 'false')
    at('/compliance/activity/report', <ComplianceReportPage />)
    expect(await screen.findByText('Real Trading LLC')).toBeTruthy()
    expect(screen.getByText('OM1100777001')).toBeTruthy()
    expect(await screen.findByText('0248:OM1100777001')).toBeTruthy()
    expect(screen.getByText(i18n.t('reportReal.documentUnavailable'))).toBeTruthy()
    expect(await screen.findByText(/Numbering runs unbroken from INV-001 to INV-002/)).toBeTruthy()
    // The backend accepts only its own kinds; INVOICE was refused with a 400 (local browser run).
    const numbering = vi.mocked(fetch).mock.calls.map(([url]) => String(url)).find((url) => url.startsWith('/api/v1/compliance/activity?'))
    expect(new URL(numbering!, 'http://x').searchParams.get('document_kind')).toBe('STANDARD_INVOICE')
    expect(document.body.textContent).not.toMatch(SAMPLE)
  })

  it('shows no Participant ID until Fawtir has verified one', async () => {
    answers['/api/v1/peppol/smp/data-submissions/standing'] = () => json(200, standing('AWAITING_REVIEW'))
    at('/compliance/activity/report', <ComplianceReportPage />)
    expect(await screen.findByText(i18n.t('reportReal.participantNotVerified'))).toBeTruthy()
    expect(screen.queryByText(/^0248:/)).toBeNull()
  })
})

describe('the catalog', () => {
  it("lists the company's own products and says the other tools are not available", async () => {
    vi.stubEnv('VITE_FAWTIR_DEMO_MODULES', 'false')
    at('/catalog', <CatalogPage />)
    const row = (await screen.findByText('Real Widget')).closest('tr')!
    expect(within(row).getByText('SKU-1')).toBeTruthy()
    // The price carries the drawn rial sign (read aloud as OMR), never "OMR" written beside it.
    expect(row.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    expect(row.textContent).toContain('2.500')
    expect(screen.getByText(i18n.t('catalogReal.toolsUnavailable'))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Flat White|Muscat Roastery/)
  })
})

describe('prototypes shown by default (owner decision 2026-10-08)', () => {
  it('the compliance report prototype names the reader\'s own company and keeps sample figures under the ribbon', async () => {
    at('/compliance/activity/report', <ComplianceReportPage />)
    expect((await screen.findAllByText('Real Trading LLC')).length).toBeGreaterThan(0)
    expect(await screen.findByText('0248:OM1100777001')).toBeTruthy()
    expect(screen.getAllByRole('status').some((node) => node.textContent === i18n.t('demoModule.ribbon'))).toBe(true)
    // The sample company's identity never stands in for the reader's.
    expect(document.body.textContent).not.toMatch(/Al Bahja|OM1100392000|Hafidh/)
  })

  it('the catalog keeps its real product list and offers the prototype tools', async () => {
    at('/catalog', <CatalogPage />)
    expect(await screen.findByText('Real Widget')).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('catalog.newItem') }).getAttribute('href')).toBe('/catalog/new')
    expect(screen.queryByText(i18n.t('catalogReal.toolsUnavailable'))).toBeNull()
  })
})

describe('modules with no server yet', () => {
  it.each(['pos', 'stock', 'tradeDocuments', 'billing', 'closing', 'export', 'otaCallLog'] as const)(
    '%s says it is not available, in English and Arabic, with no sample records',
    async (module) => {
      const view = at('/x', <ModuleUnavailablePage module={module} />)
      expect(await screen.findByRole('heading', { name: i18n.t(`moduleUnavailable.${module}.title`) })).toBeTruthy()
      expect(screen.getByText(i18n.t('moduleUnavailable.badge'))).toBeTruthy()
      expect(document.body.textContent).not.toMatch(SAMPLE)
      view.unmount()
      await i18n.changeLanguage('ar')
      at('/x', <ModuleUnavailablePage module={module} />)
      expect(await screen.findByText(i18n.t(`moduleUnavailable.${module}.body`))).toBeTruthy()
      expect(i18n.t(`moduleUnavailable.${module}.body`)).not.toBe(i18n.t(`moduleUnavailable.${module}.body`, { lng: 'en' }))
    },
  )
})

