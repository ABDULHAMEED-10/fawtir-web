import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { ConsoleOnboardPage } from './ConsoleOnboardPage'
import { subscriptionsStore } from '../../lib/consoleSubscriptions'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const CREATE_URL = '/api/v1/platform/companies'
const TENANT_ID = '9f1c7e2a-51b4-4a60-9a1e-3c7b2d5e8f04'

const OPERATOR: Entitlements = {
  userId: 'u-1',
  username: 'ops.reviewer',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform', systemRole: true }],
  permissions: ['platform.tenants.manage'],
  scopes: ['platform.tenants.manage'],
  featureFlags: {},
}

const CREATED = {
  tenantId: TENANT_ID,
  tenantCode: 'WADISHAB',
  status: 'PENDING',
  companyVerificationStatus: 'PENDING_VERIFICATION',
  invitationId: 'b2d4a6c8-0e1f-4a2b-8c3d-5e6f7a8b9c0d',
  administratorEmail: 'first.admin@example.test',
  replayed: false,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Handler = (init?: RequestInit) => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

function answer(handlers: Record<string, Handler>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const handler = handlers[url]
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler(init)
  })
}

const createCalls = () => fetchMock.mock.calls.filter(([url]) => url === CREATE_URL)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/console/tenants/new']}>
      <Routes>
        <Route path="/console/tenants/new" element={<ConsoleOnboardPage />} />
        <Route path="/console/tenants/:id" element={<p>detail for the created business</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * Chooses the first real option from one of the console listbox fields.
 *
 * These are not native selects: the control is a button that opens a portalled listbox, so the
 * test drives it the way a person does rather than setting a value the UI would never receive.
 */
async function pick(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name }))
  const options = await screen.findAllByRole('option')
  await user.click(options[0])
}

/**
 * Drives the four-step wizard to the review step with a complete company, and presses Create.
 *
 * Assertions are grouped per walk rather than split one per case, and that is deliberate. The walk
 * is what makes the evidence worth having — it proves the request is what the form actually
 * produces, not what a hand-built payload claims — but it is slow in jsdom, and repeating it once
 * per assertion starved the rest of the suite of workers until unrelated files timed out.
 */
async function onboardThroughTheForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/legal name/i), 'Wadi Shab Provisions LLC')
  await user.type(screen.getByLabelText(/trading name/i), 'Wadi Shab Provisions')
  await user.type(screen.getByLabelText(/tenant code/i), 'wadishab')
  await user.type(screen.getByLabelText(/commercial registration/i), '1234567')
  await user.type(screen.getByLabelText(/vatin/i), 'OM1100000000')
  await user.type(screen.getByLabelText(/registered address/i), 'Way 4412, Muscat')
  await pick(user, /^town$/i)
  await pick(user, /business type/i)
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.type(await screen.findByLabelText(/full name/i), 'Probe Owner')
  await user.type(screen.getByLabelText(/mobile/i), '91234567')
  await user.type(screen.getByLabelText(/email/i), 'first.admin@example.test')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.click(await screen.findByRole('button', { name: /continue/i }))
  const create = await screen.findByRole('button', { name: /create tenant/i })
  await user.click(create)
  return create
}

/** The walk above is slow in jsdom, and the request under test only happens at the end of it. */
const WIZARD_TIMEOUT = 25_000

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Platform company onboarding', () => {
  it(
    'sends the real create request, keyed, and navigates by the identifier the backend returned',
    async () => {
      answer({
        [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
        [CREATE_URL]: () => json(201, CREATED),
      })
      const onboard = vi.spyOn(subscriptionsStore, 'onboard')
      const user = userEvent.setup({ delay: null })
      renderPage()

      await onboardThroughTheForm(user)

      await waitFor(() => expect(createCalls()).toHaveLength(1))
      const [, init] = createCalls()[0]
      expect(init?.method).toBe('POST')

      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({
        tenantCode: 'WADISHAB',
        tenantName: 'Wadi Shab Provisions',
        legalName: 'Wadi Shab Provisions LLC',
        taxNumber: 'OM1100000000',
        commercialRegistrationNumber: '1234567',
        country: 'OM',
        registeredAddress: 'Way 4412, Muscat',
        administratorEmail: 'first.admin@example.test',
      })
      // The operator never chooses a credential, and no plan or payment is theirs to record here.
      expect(Object.keys(body)).not.toContain('administratorPassword')
      expect(Object.keys(body)).not.toContain('administratorUsername')
      expect(Object.keys(body)).not.toContain('plan')
      expect(Object.keys(body)).not.toContain('payment')

      const headers = init?.headers as Record<string, string>
      expect(headers['Idempotency-Key']).toMatch(/^platform-company-/)
      // The session is a cookie the browser holds; a header here would be a second, weaker answer
      // to the same question.
      expect(Object.keys(headers)).not.toContain('Authorization')
      expect(Object.keys(headers)).not.toContain('X-Tenant-Id')

      expect(await screen.findByText(/detail for the created business/i)).toBeTruthy()
      // The register is the backend's. A local row here would be a second, divergent truth.
      expect(onboard).not.toHaveBeenCalled()
    },
    WIZARD_TIMEOUT,
  )

  it(
    'treats a replay as success and still lands on the company that already exists',
    async () => {
      answer({
        [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
        [CREATE_URL]: () => json(200, { ...CREATED, replayed: true }),
      })
      const user = userEvent.setup({ delay: null })
      renderPage()

      await onboardThroughTheForm(user)

      expect(await screen.findByText(/detail for the created business/i)).toBeTruthy()
      expect(createCalls()).toHaveLength(1)
    },
    WIZARD_TIMEOUT,
  )

  it(
    'a second press while the first request is in flight does not send a second create',
    async () => {
      // Annotated on the initialiser, not just the declaration: the assignment below happens
      // inside the promise callback, so TypeScript narrows this to null at the call site and
      // release?.() fails to compile as a call on never. Tests still ran, because vitest
      // transpiles without typechecking — only tsc saw it.
      let release: (() => void) | null = null as (() => void) | null
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      answer({
        [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
        [CREATE_URL]: async () => {
          await held
          return json(201, CREATED)
        },
      })
      const user = userEvent.setup({ delay: null })
      renderPage()

      const create = await onboardThroughTheForm(user)
      await waitFor(() => expect(createCalls()).toHaveLength(1))
      // Disabled rather than merely ignored, so the operator can see why the second press did
      // nothing.
      expect((create as HTMLButtonElement).disabled).toBe(true)
      await user.click(create).catch(() => undefined)

      expect(createCalls()).toHaveLength(1)
      release?.()
      await waitFor(() => expect(screen.getByText(/detail for the created business/i)).toBeTruthy())
    },
    WIZARD_TIMEOUT,
  )

  it(
    'explains a reused key or taken code (409) and stays on the form',
    async () => {
      answer({
        [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
        [CREATE_URL]: () => json(409, { type: 'conflict', title: 'Already used' }),
      })
      const user = userEvent.setup({ delay: null })
      renderPage()

      await onboardThroughTheForm(user)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(/tenant code or tax number/i)
      expect(screen.queryByText(/detail for the created business/i)).toBeNull()
    },
    WIZARD_TIMEOUT,
  )

  it(
    'explains a refused permission (403) without pretending the business was created',
    async () => {
      answer({
        [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
        [CREATE_URL]: () => json(403, { type: 'forbidden', title: 'Denied' }),
      })
      const user = userEvent.setup({ delay: null })
      renderPage()

      await onboardThroughTheForm(user)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(/permission/i)
      expect(screen.queryByText(/detail for the created business/i)).toBeNull()
    },
    WIZARD_TIMEOUT,
  )

  it('refuses a tenant code the server would reject, before any request is sent', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, OPERATOR) })
    const user = userEvent.setup({ delay: null })
    renderPage()

    await user.type(await screen.findByLabelText(/legal name/i), 'Wadi Shab Provisions LLC')
    await user.type(screen.getByLabelText(/trading name/i), 'Wadi Shab Provisions')
    // Starts with a digit, which the server's pattern refuses.
    await user.type(screen.getByLabelText(/tenant code/i), '1WADI')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/uppercase letters, digits/i)).toBeTruthy()
    expect(createCalls()).toHaveLength(0)
  })
})
