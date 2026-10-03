import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ParticipantIdStanding } from '../../api/peppol/participantStanding'
import { PeppolTaxPage } from './PeppolTaxPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const STANDING_URL = '/api/v1/peppol/smp/data-submissions/standing'
const REVERIFY_URL = '/api/v1/peppol/smp/data-submissions/reverification'
const CSRF = 'csrf-token-value'
const t = (key: string, values?: Record<string, unknown>) => i18n.t(key, values)

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['smp.participant.view', 'smp.participant.manage'],
  scopes: [],
  featureFlags: {},
}

const POLICY_V2 = { id: '55555555-5555-4555-8555-555555555555', versionNumber: 2 }
const VERIFICATION = {
  submissionId: '66666666-6666-4666-8666-666666666666',
  submissionVersion: 1,
  participantScheme: '0248',
  participantValue: 'OM1100000001',
  policyVersionId: '44444444-4444-4444-8444-444444444444',
  policyVersionNumber: 1,
  verifiedAt: '2026-09-01T08:00:00Z',
}

const standing = (overrides: Partial<ParticipantIdStanding> = {}): ParticipantIdStanding => ({
  state: 'VERIFIED',
  currentPolicySatisfied: true,
  reverificationRequired: false,
  reverificationAvailable: false,
  policyInForce: POLICY_V2,
  verification: { ...VERIFICATION, policyVersionId: POLICY_V2.id, policyVersionNumber: 2 },
  ...overrides,
})

const OUTDATED = standing({
  state: 'REVERIFICATION_REQUIRED',
  currentPolicySatisfied: false,
  reverificationRequired: true,
  reverificationAvailable: true,
  verification: VERIFICATION,
})

const AWAITING = standing({
  state: 'AWAITING_REVIEW',
  currentPolicySatisfied: false,
  reverificationRequired: true,
  reverificationAvailable: false,
  verification: VERIFICATION,
})

/** The 201: the new submission, flattened, with the standing beside it. */
const CREATED = {
  id: '77777777-7777-4777-8777-777777777777',
  tenantId: 't-1',
  status: 'SUBMITTED',
  candidatePidScheme: '0248',
  candidatePidValue: 'OM1100000001',
  optimisticLockVersion: 0,
  verificationStanding: AWAITING,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const coded = (
  status: number,
  code: string | null,
  detail = 'Server prose that must not be shown.',
) =>
  json(status, {
    type: `https://api.fawtir.om/problems/${status === 409 ? 'resource-conflict' : 'validation-failed'}`,
    detail,
    correlationId: 'corr-pid-77',
    ...(code === null ? {} : { code }),
  })

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

/** Each URL and method answers from its own queue; the last answer repeats. */
function answer(get: Handler[], post: Handler[] = []) {
  const queues: Record<string, Handler[]> = { GET: [...get], POST: [...post] }
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === ENTITLEMENTS_URL) return json(200, ADMIN)
    const queue =
      url === STANDING_URL && method === 'GET'
        ? queues.GET
        : url === REVERIFY_URL && method === 'POST'
          ? queues.POST
          : null
    if (!queue || queue.length === 0) throw new Error(`unexpected ${method} ${url}`)
    const handler = queue.length > 1 ? queue.shift()! : queue[0]
    return handler()
  })
}

const standingReads = () => fetchMock.mock.calls.filter(([url]) => url === STANDING_URL)
const posts = () => fetchMock.mock.calls.filter(([url]) => url === REVERIFY_URL)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/peppol']}>
      <PeppolTaxPage />
    </MemoryRouter>,
  )
}

const section = () =>
  within(
    screen.getByRole('heading', { name: t('peppolTax.participant.title') }).closest('section')!,
  )

async function open(get: Handler[], post: Handler[] = []) {
  answer(get, post)
  renderPage()
  await screen.findByRole('heading', { name: t('peppolTax.participant.title') })
  await waitFor(() => expect(section().queryByText(t('peppolTax.participant.loading'))).toBeNull())
}

const askButton = () => section().queryByRole('button', { name: t('peppolTax.participant.ask') })

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  document.documentElement.lang = 'en'
  document.documentElement.dir = 'ltr'
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Settings › Peppol and tax: Participant ID verification', () => {
  it('shows a verification under the current policy as verified, with one read and no request offered', async () => {
    await open([() => json(200, standing())])

    expect(section().getByText(t('peppolTax.participant.body.VERIFIED'))).toBeTruthy()
    expect(section().getByText(t('peppolTax.participant.pill.VERIFIED'))).toBeTruthy()
    expect(section().getByText('0248:OM1100000001').getAttribute('dir')).toBe('ltr')
    expect(askButton()).toBeNull()
    expect(standingReads()).toHaveLength(1)
    expect(posts()).toHaveLength(0)
  })

  it('qualifies a verification under an older policy version and offers the request', async () => {
    await open([() => json(200, OUTDATED)])

    expect(
      section().getByText(t('peppolTax.participant.body.REVERIFICATION_REQUIRED')),
    ).toBeTruthy()
    expect(section().getByText(t('peppolTax.participant.notDeleted'))).toBeTruthy()
    expect(
      section().getByText(t('peppolTax.participant.pill.REVERIFICATION_REQUIRED')),
    ).toBeTruthy()
    // Never presented as plainly verified while the policy in force is not satisfied.
    expect(section().queryByText(t('peppolTax.participant.pill.VERIFIED'))).toBeNull()
    expect(section().queryByText(t('peppolTax.participant.body.VERIFIED'))).toBeNull()
    expect(
      section().getByText(t('peppolTax.participant.policyVersion', { number: 1 })),
    ).toBeTruthy()
    expect(
      section().getByText(t('peppolTax.participant.policyVersion', { number: 2 })),
    ).toBeTruthy()
    expect(askButton()).toBeTruthy()
  })

  it('sends exactly one request, with only the policy it was shown and a correlation id, and shows the answered standing without reading again', async () => {
    let release: (response: Response) => void = () => {}
    await open(
      [() => json(200, OUTDATED)],
      [() => new Promise<Response>((resolve) => (release = resolve))],
    )

    const button = askButton()!
    // Two clicks before React re-renders: the in-flight guard, not the disabled attribute, stops the second.
    act(() => {
      button.click()
      button.click()
    })
    expect(posts()).toHaveLength(1)
    const busy = section().getByRole('button', {
      name: t('peppolTax.participant.asking'),
    }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(posts()).toHaveLength(1)

    const init = posts()[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ expectedPolicyVersionId: POLICY_V2.id })
    const headers = init.headers as Record<string, string>
    expect(headers['X-Correlation-Id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(headers['X-CSRF-Token']).toBe(CSRF)

    await act(async () => release(json(201, CREATED)))

    expect(await section().findByText(t('peppolTax.participant.sent'))).toBeTruthy()
    expect(section().getByText(t('peppolTax.participant.body.AWAITING_REVIEW'))).toBeTruthy()
    expect(section().getByText(t('peppolTax.participant.pill.AWAITING_REVIEW'))).toBeTruthy()
    expect(section().getByText(t('peppolTax.participant.notDeleted'))).toBeTruthy()
    expect(askButton()).toBeNull()
    expect(standingReads()).toHaveLength(1)
    expect(posts()).toHaveLength(1)
  })

  it('shows a rejection that may be asked again', async () => {
    await open([
      () =>
        json(
          200,
          standing({
            state: 'REJECTED',
            currentPolicySatisfied: false,
            reverificationRequired: true,
            reverificationAvailable: true,
            verification: VERIFICATION,
          }),
        ),
    ])

    expect(section().getByText(t('peppolTax.participant.body.REJECTED'))).toBeTruthy()
    expect(section().getByText(t('peppolTax.participant.canAskAgain'))).toBeTruthy()
    expect(section().getByText(t('peppolTax.participant.notDeleted'))).toBeTruthy()
    expect(askButton()).toBeTruthy()
  })

  it('shows a rejection that may not be asked again, with no request offered', async () => {
    await open([
      () =>
        json(
          200,
          standing({ state: 'REJECTED', currentPolicySatisfied: false, verification: null }),
        ),
    ])

    expect(section().getByText(t('peppolTax.participant.body.REJECTED'))).toBeTruthy()
    expect(section().queryByText(t('peppolTax.participant.canAskAgain'))).toBeNull()
    expect(section().queryByText(t('peppolTax.participant.notDeleted'))).toBeNull()
    expect(askButton()).toBeNull()
  })

  it.each([['NOT_SUBMITTED' as const], ['DRAFT' as const], ['NO_POLICY_IN_FORCE' as const]])(
    'says %s plainly, with no badge and nothing to ask',
    async (state) => {
      await open([
        () =>
          json(
            200,
            standing({
              state,
              currentPolicySatisfied: false,
              verification: state === 'NO_POLICY_IN_FORCE' ? VERIFICATION : null,
              policyInForce: null,
            }),
          ),
      ])

      expect(section().getByText(t(`peppolTax.participant.body.${state}`))).toBeTruthy()
      expect(section().queryByText(t('peppolTax.participant.pill.VERIFIED'))).toBeNull()
      expect(askButton()).toBeNull()
    },
  )

  describe('refusals', () => {
    it('on POLICY_CHANGED reads the standing once, explains, and does not resend', async () => {
      const newer = {
        ...OUTDATED,
        policyInForce: { id: '88888888-8888-4888-8888-888888888888', versionNumber: 3 },
      }
      // The detail says something else entirely: only the code may decide what is shown.
      await open(
        [() => json(200, OUTDATED), () => json(200, newer)],
        [() => coded(409, 'POLICY_CHANGED', 'Reverification is not required for this tenant.')],
      )

      fireEvent.click(askButton()!)

      expect(
        await section().findByText(
          new RegExp(t('peppolTax.participant.refused.policyChanged').slice(0, 40)),
        ),
      ).toBeTruthy()
      await waitFor(() => expect(standingReads()).toHaveLength(2))
      // The reloaded standing names the newer policy; the request is offered again but not sent.
      expect(
        await section().findByText(t('peppolTax.participant.policyVersion', { number: 3 })),
      ).toBeTruthy()
      expect(askButton()).toBeTruthy()
      expect(posts()).toHaveLength(1)
      expect(
        section().queryByText(t('peppolTax.participant.refused.notRequired'), { exact: false }),
      ).toBeNull()
      expect(document.body.textContent).not.toContain('Reverification is not required')
      expect(document.body.textContent).toContain('corr-pid-77')

      fireEvent.click(askButton()!)
      await waitFor(() => expect(posts()).toHaveLength(2))
      expect(JSON.parse((posts()[1][1] as RequestInit).body as string)).toEqual({
        expectedPolicyVersionId: '88888888-8888-4888-8888-888888888888',
      })
    })

    it.each([
      ['SUBMISSION_IN_PROGRESS', 'peppolTax.participant.refused.inProgress', AWAITING],
      ['REVERIFICATION_NOT_REQUIRED', 'peppolTax.participant.refused.notRequired', standing()],
    ])('on %s reads the standing once and explains', async (code, key, after) => {
      await open([() => json(200, OUTDATED), () => json(200, after)], [() => coded(409, code)])

      fireEvent.click(askButton()!)

      expect(await section().findByText(t(key), { exact: false })).toBeTruthy()
      await waitFor(() => expect(standingReads()).toHaveLength(2))
      await waitFor(() => expect(askButton()).toBeNull())
      expect(posts()).toHaveLength(1)
      expect(document.body.textContent).not.toContain('Server prose')
    })

    it.each([
      [
        'PID_POLICY_NOT_ACTIVE',
        400,
        'PID_POLICY_NOT_ACTIVE',
        'peppolTax.participant.refused.policyNotActive',
      ],
      ['a missing permission', 403, null, 'peppolTax.participant.refused.forbidden'],
      ['a server validation error', 400, null, 'identityErrors.validation'],
      ['an unknown conflict', 409, 'STALE_VERSION', 'apiErrors.conflict'],
      ['a known code on the wrong status', 400, 'POLICY_CHANGED', 'identityErrors.validation'],
    ])(
      'on %s explains with the reference and reads nothing again',
      async (_label, status, code, key) => {
        await open([() => json(200, OUTDATED)], [() => coded(status, code)])

        fireEvent.click(askButton()!)

        const alert = await section().findByRole('alert')
        expect(alert.textContent).toContain(t(key))
        expect(alert.textContent).toContain(t('apiErrors.reference', { id: 'corr-pid-77' }))
        expect(standingReads()).toHaveLength(1)
        expect(posts()).toHaveLength(1)
        // Still offered, and enabled: the person may try again by their own hand.
        expect((askButton() as HTMLButtonElement).disabled).toBe(false)
        expect(document.body.textContent).not.toContain('Server prose')
      },
    )
  })

  it('says the reader lacks access when the standing read is refused (403)', async () => {
    await open([
      () =>
        json(403, {
          type: 'https://api.fawtir.om/problems/insufficient-permission',
          detail: 'Server prose that must not be shown.',
        }),
    ])

    expect(section().getByText(t('peppolTax.participant.readForbidden'))).toBeTruthy()
    expect(askButton()).toBeNull()
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('renders right to left in Arabic, with the ID in a left-to-right island', async () => {
    await i18n.changeLanguage('ar')
    document.documentElement.lang = 'ar'
    document.documentElement.dir = 'rtl'
    answer([() => json(200, OUTDATED)])
    const { container } = render(
      <div dir="rtl">
        <MemoryRouter initialEntries={['/settings/peppol']}>
          <PeppolTaxPage />
        </MemoryRouter>
      </div>,
    )

    expect(
      await screen.findByText(t('peppolTax.participant.body.REVERIFICATION_REQUIRED')),
    ).toBeTruthy()
    expect(t('peppolTax.participant.title')).not.toBe(
      i18n.getFixedT('en')('peppolTax.participant.title'),
    )
    expect(document.documentElement.dir).toBe('rtl')
    expect(container.firstElementChild!.getAttribute('dir')).toBe('rtl')
    const id = screen.getByText('0248:OM1100000001')
    expect(id.getAttribute('dir')).toBe('ltr')
    expect(id.closest('[dir="rtl"]')).toBe(container.firstElementChild)
    expect(screen.getByRole('button', { name: t('peppolTax.participant.ask') })).toBeTruthy()
  })
})
