import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ParticipantIdStanding } from '../../api/peppol/participantStanding'
import { PeppolTaxPage } from './PeppolTaxPage'

const URL = {
  entitlements: '/api/v1/me/entitlements',
  standing: '/api/v1/peppol/smp/data-submissions/standing',
  smp: '/api/v1/peppol/smp/participants',
  profile: '/api/v1/company-profile',
  overview: '/api/v1/branches/overview',
}
const t = (key: string, values?: Record<string, unknown>) => i18n.t(key, values)

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['smp.participant.view'],
  scopes: [],
  featureFlags: {},
}

const VERIFIED: ParticipantIdStanding = {
  state: 'VERIFIED',
  currentPolicySatisfied: true,
  reverificationRequired: false,
  reverificationAvailable: false,
  policyInForce: { id: 'p-2', versionNumber: 2 },
  verification: {
    submissionId: 's-1',
    submissionVersion: 1,
    participantScheme: '0248',
    participantValue: 'OM1199999999',
    policyVersionId: 'p-2',
    policyVersionNumber: 2,
    verifiedAt: '2026-09-01T08:00:00Z',
  },
}

const PROFILE = { taxNumber: 'OM1199999999', legalName: 'Real Tenant LLC' }

const OVERVIEW = {
  openCount: 1,
  everCount: 2,
  peopleAcross: 0,
  invoicesThisMonth: 0,
  branches: [
    { id: 'b-1', code: 'HQ', name: 'Ruwi', headOffice: true, active: true, closedOn: null },
    { id: 'b-2', code: 'OLD', name: 'Closed Branch', headOffice: false, active: false, closedOn: '2026-01-01' },
  ],
}

const smpPage = (remoteState: string | null) => ({
  items: remoteState
    ? [
        {
          registrationId: 'r-1',
          participantReference: '0248:OM11****99',
          desiredState: 'ACTIVE',
          remoteState,
          countryCode: 'OM',
          effectiveAt: null,
          deadlineAt: null,
        },
      ]
    : [],
  page: 0,
  size: 20,
  totalElements: remoteState ? 1 : 0,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const FORBIDDEN = () =>
  json(403, { type: 'https://api.fawtir.om/problems/insufficient-permission', detail: 'no' })

type Answers = Partial<Record<keyof typeof URL, () => Response>>
let fetchMock: ReturnType<typeof vi.fn>

function answer(answers: Answers) {
  const all: Required<Answers> = {
    entitlements: () => json(200, ADMIN),
    standing: () => json(200, VERIFIED),
    smp: () => json(200, smpPage('CONFIRMED_ACTIVE')),
    profile: () => json(200, PROFILE),
    overview: () => json(200, OVERVIEW),
    ...answers,
  }
  fetchMock.mockImplementation(async (url: string) => {
    const key = (Object.keys(URL) as (keyof typeof URL)[]).find((k) => URL[k] === url)
    if (!key) throw new Error(`unexpected ${url}`)
    return all[key]()
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/peppol']}>
      <PeppolTaxPage />
    </MemoryRouter>,
  )
}

const registration = () =>
  within(screen.getByRole('heading', { name: t('peppolTax.registration') }).closest('section')!)

const fact = (rowKey: string) =>
  registration().getByText(t(rowKey)).closest('div')!.querySelector('dd')!.textContent

async function settled() {
  await screen.findByRole('heading', { name: t('peppolTax.registration') })
  await waitFor(() => expect(screen.queryAllByText(t('peppolTax.fact.checking'))).toHaveLength(0))
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  document.documentElement.lang = 'en'
  document.documentElement.dir = 'ltr'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Settings › Peppol and tax: hero and registration', () => {
  it('names the verified Participant ID, copies exactly it, and reads the standing once', async () => {
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    answer({})
    renderPage()

    expect(await screen.findByText(t('peppolTax.hero.VERIFIED'))).toBeTruthy()
    const ids = screen.getAllByText('0248:OM1199999999')
    expect(ids[0].closest('[dir="ltr"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('peppolTax.copyId') }))
    expect(writeText).toHaveBeenCalledWith('0248:OM1199999999')
    await settled()
    expect(fetchMock.mock.calls.filter(([url]) => url === URL.standing)).toHaveLength(1)
  })

  it.each([
    ['AWAITING_REVIEW' as const],
    ['REVERIFICATION_REQUIRED' as const],
    ['NOT_SUBMITTED' as const],
    ['REJECTED' as const],
  ])('in %s says so honestly and shows no ID to copy', async (state) => {
    answer({ standing: () => json(200, { ...VERIFIED, state, currentPolicySatisfied: false }) })
    renderPage()

    expect(await screen.findByText(t(`peppolTax.hero.${state}`))).toBeTruthy()
    expect(screen.queryByText(t('peppolTax.hero.VERIFIED'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('peppolTax.copyId') })).toBeNull()
    await settled()
    expect(fact('peppolTax.row.verification')).toBe(t('peppolTax.fact.notVerified'))
  })

  it('fails closed when the standing cannot be read: no ID, no claim', async () => {
    answer({ standing: () => json(500, { type: 'about:blank', correlationId: 'c-1' }) })
    renderPage()

    await settled()
    expect(screen.queryByText(t('peppolTax.hero.VERIFIED'))).toBeNull()
    expect(screen.queryByText('0248:OM1199999999')).toBeNull()
    expect(screen.queryByRole('button', { name: t('peppolTax.copyId') })).toBeNull()
    expect(fact('peppolTax.row.verification')).toBe(t('peppolTax.fact.notAvailable'))
  })

  it('states the three facts separately: verified, SMP confirmed, SML not checked', async () => {
    answer({})
    renderPage()
    await settled()

    expect(fact('peppolTax.row.verification')).toBe(t('peppolTax.fact.verified'))
    expect(fact('peppolTax.row.smpPublication')).toBe(t('peppolTax.fact.published'))
    expect(fact('peppolTax.row.smlDiscovery')).toBe(t('peppolTax.fact.notChecked'))
    expect(fact('peppolTax.row.vatNumber')).toBe('OM1199999999')
  })

  it.each([
    ['no registration', () => json(200, smpPage(null)), 'peppolTax.fact.notConfirmed'],
    ['an UNKNOWN registration', () => json(200, smpPage('UNKNOWN')), 'peppolTax.fact.notConfirmed'],
    ['a removed registration', () => json(200, smpPage('CONFIRMED_REMOVED')), 'peppolTax.fact.notConfirmed'],
    ['a 403', FORBIDDEN, 'peppolTax.fact.notAvailable'],
    ['a failure', () => json(503, { type: 'about:blank' }), 'peppolTax.fact.notAvailable'],
  ])('says SMP publication is not confirmed on %s', async (_label, smp, key) => {
    answer({ smp })
    renderPage()
    await settled()

    expect(fact('peppolTax.row.smpPublication')).toBe(t(key))
  })

  it('leaves the VAT row out when the profile cannot be read', async () => {
    answer({ profile: FORBIDDEN })
    renderPage()
    await settled()

    expect(registration().queryByText(t('peppolTax.row.vatNumber'))).toBeNull()
  })

  it('lists only open branches from the overview', async () => {
    answer({})
    renderPage()

    expect(await screen.findByText(`Ruwi · ${t('peppolTax.headOffice')}`)).toBeTruthy()
    expect(screen.queryByText(/Closed Branch/)).toBeNull()
  })

  it('never claims "live", never draws certificates to renew, and prints no sample company', async () => {
    answer({})
    renderPage()
    await settled()

    const text = document.body.textContent ?? ''
    for (const leak of ['Al Bahja', 'OM1100234567', 'Hafidh']) expect(text).not.toContain(leak)
    expect(text.toLowerCase()).not.toMatch(/\blive\b|reachable/)
    // The visibility switches are drawn but cannot be changed, and no certificate has dates to renew.
    const switches = screen.getAllByRole('switch') as HTMLButtonElement[]
    expect(switches).toHaveLength(4)
    expect(switches.every((control) => control.disabled)).toBe(true)
    expect(text).not.toContain(t('peppolTax.renewIt'))
    expect(text).not.toMatch(/days? left|months? left/)
    expect(screen.getByText(t('peppolTax.certificatesManaged'))).toBeTruthy()
    expect(screen.getByRole('link', { name: t('peppolTax.seeTddLog') })).toBeTruthy()
  })

  it('renders in Arabic with the ID in a left-to-right island', async () => {
    await i18n.changeLanguage('ar')
    answer({})
    const { container } = render(
      <div dir="rtl">
        <MemoryRouter initialEntries={['/settings/peppol']}>
          <PeppolTaxPage />
        </MemoryRouter>
      </div>,
    )

    expect(await screen.findByText(t('peppolTax.hero.VERIFIED'))).toBeTruthy()
    expect(t('peppolTax.hero.VERIFIED')).not.toBe(i18n.getFixedT('en')('peppolTax.hero.VERIFIED'))
    await settled()
    expect(fact('peppolTax.row.smlDiscovery')).toBe(t('peppolTax.fact.notChecked'))
    const id = screen.getAllByText('0248:OM1199999999')[0]
    expect(id.closest('[dir="ltr"]')).toBeTruthy()
    expect(container.firstElementChild!.getAttribute('dir')).toBe('rtl')
    expect(document.body.textContent).not.toContain('Al Bahja')
  })
})
