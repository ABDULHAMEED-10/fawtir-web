import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, peekEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { CompanyDetail, HistoryEntry } from '../../lib/console/companyVerification'
import { VerificationCompanyPage } from './VerificationCompanyPage'

const ID = '11111111-1111-4111-8111-111111111111'
const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const DETAIL_URL = `/api/v1/platform/companies/${ID}`
const HISTORY_URL = `/api/v1/platform/companies/${ID}/verification-history`
const EVIDENCE_URL = `/api/v1/platform/companies/${ID}/verification-evidence`
const ATTEST_URL = `/api/v1/tenants/${ID}/company-verification/manual-attestation`
const REJECT_URL = `/api/v1/tenants/${ID}/company-verification/rejection`
const CSRF = 'csrf-token-value'

const OPERATOR: Entitlements = {
  userId: 'u-operator',
  username: 'ops.reviewer',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform tenant administrator', systemRole: true }],
  permissions: ['platform.tenants.manage'],
  scopes: ['platform.tenants.manage'],
  featureFlags: {},
}

const PENDING: CompanyDetail = {
  tenantId: ID,
  tenantCode: 'FT3GDWM54D',
  tenantName: 'Al Noor Bakery',
  legalName: 'Al Noor Bakery LLC',
  taxNumber: 'OM1100000001',
  commercialRegistrationNumber: '1234567',
  country: 'OM',
  registeredAddress: 'Building 4, Way 2301, Sohar',
  timezone: 'Asia/Muscat',
  verificationStatus: 'PENDING_VERIFICATION',
  verificationMethod: null,
  rejectionReason: null,
  tenantStatus: 'PENDING',
  identityStatus: 'READY',
  profileRevision: 2,
  expectedRevision: 2,
  submittedAt: '2026-09-12T05:10:00Z',
  submittedBy: 'u-registrant',
  decidedAt: null,
  decidedBy: null,
  attestationReference: null,
  evidenceReference: null,
  evidenceRecorded: false,
  signupAdministrator: { userId: 'u-registrant', signInEnabled: false, emailVerified: true },
  createdAt: '2026-09-12T04:00:00Z',
  updatedAt: '2026-09-12T05:10:00Z',
}

const VERIFIED: CompanyDetail = {
  ...PENDING,
  verificationStatus: 'VERIFIED',
  verificationMethod: 'MANUAL_ATTESTATION',
  tenantStatus: 'ACTIVE',
  decidedAt: '2026-09-12T06:00:00Z',
  decidedBy: 'u-operator',
  attestationReference: 'ATT-2026-0142',
  evidenceReference: 'e-1',
  evidenceRecorded: true,
  signupAdministrator: { userId: 'u-registrant', signInEnabled: true, emailVerified: true },
}

const HISTORY: HistoryEntry[] = [
  {
    event: 'PROFILE_SUBMITTED',
    profileRevision: 2,
    verificationStatus: 'PENDING_VERIFICATION',
    verificationMethod: null,
    rejectionReason: null,
    attestationReference: null,
    evidenceReference: null,
    performedBy: 'u-registrant',
    occurredAt: '2026-09-12T05:10:00Z',
  },
]

const EVIDENCE = {
  evidenceReference: '33333333-3333-4333-8333-333333333333',
  evidenceSha256: 'a'.repeat(64),
  profileRevision: 2,
  sizeBytes: 52_000,
  filename: 'cr-scan.pdf',
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
const problem = (status: number, type: string) =>
  json(status, { type: `https://api.fawtir.om/problems/${type}`, detail: 'Server prose that must not be shown.' })

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

function answer(handlers: Record<string, Handler | Handler[]>) {
  const queues = Object.fromEntries(
    Object.entries(handlers).map(([url, handler]) => [url, Array.isArray(handler) ? [...handler] : handler]),
  )
  fetchMock.mockImplementation(async (url: string) => {
    const entry = queues[url]
    const handler = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler()
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)
const initOf = (url: string, index = 0) => callsTo(url)[index][1] as RequestInit

function Probe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/console/onboarding/${ID}`]}>
      <Routes>
        <Route path="/console/onboarding/:companyId" element={<VerificationCompanyPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const reads = (detail: Handler | Handler[] = () => json(200, PENDING)) => ({
  [ENTITLEMENTS_URL]: () => json(200, OPERATOR),
  [DETAIL_URL]: detail,
  [HISTORY_URL]: () => json(200, HISTORY),
})

const button = (key: string, options: Record<string, string> = {}) =>
  screen.getByRole('button', { name: i18n.t(key, options) }) as HTMLButtonElement
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!
const referenceInput = () => document.querySelector<HTMLInputElement>('input[name="attestationReference"]')!
const pdf = (name = 'cr-scan.pdf', bytes = 1024) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })

async function dropEvidence(file = pdf()) {
  await act(async () => {
    fireEvent.change(fileInput(), { target: { files: [file] } })
  })
}

async function openPending(extra: Record<string, Handler | Handler[]> = {}) {
  answer({ ...reads(), ...extra })
  renderDetail()
  await screen.findByRole('heading', { level: 2, name: i18n.t('console.verification.decision.title') })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Decision panel visibility', () => {
  it.each([
    ['a verified company', { ...VERIFIED }],
    ['a rejected company', { ...PENDING, verificationStatus: 'REJECTED' as const, rejectionReason: 'COMPANY_PROFILE_MISMATCH' as const }],
    ['a registration never submitted', { ...PENDING, submittedAt: null }],
  ])('offers no decision on %s', async (_label, company) => {
    answer(reads(() => json(200, company)))
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'Al Noor Bakery' })

    expect(screen.queryByText(i18n.t('console.verification.decision.title'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.decision.verify') })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('tells the reviewer who submitted the registration that someone else must decide', async () => {
    answer(reads(() => json(200, { ...PENDING, submittedBy: OPERATOR.userId })))
    renderDetail()

    expect(await screen.findByText(i18n.t('console.verification.decision.ownSubmission'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.decision.verify') })).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.decision.reject') })).toBeNull()
  })
})

describe('Evidence', () => {
  it('uploads the file once as multipart, with the CSRF token and no JSON content type', async () => {
    let release: (response: Response) => void = () => {}
    await openPending({ [EVIDENCE_URL]: () => new Promise<Response>((resolve) => (release = resolve)) })

    await dropEvidence()
    await dropEvidence()
    expect(screen.getByText(i18n.t('console.verification.decision.uploading'))).toBeTruthy()
    await act(async () => release(json(201, EVIDENCE)))

    expect(await screen.findByText('cr-scan.pdf')).toBeTruthy()
    expect(callsTo(EVIDENCE_URL)).toHaveLength(1)
    const init = initOf(EVIDENCE_URL)
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect(((init.body as FormData).get('file') as File).name).toBe('cr-scan.pdf')
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers['X-CSRF-Token']).toBe(CSRF)
    expect(screen.getByText(i18n.t('console.verification.decision.replace'))).toBeTruthy()
  })

  it.each([
    ['a file of the wrong type', pdf('evidence.docx'), 'console.verification.decision.wrongType'],
    ['a file over 10 MB', pdf('big.pdf', 10 * 1024 * 1024 + 1), 'console.verification.decision.tooLargeLocal'],
  ])('refuses %s before sending anything', async (_label, file, key) => {
    await openPending()
    await dropEvidence(file)

    expect(screen.getByText(i18n.t(key))).toBeTruthy()
    expect(callsTo(EVIDENCE_URL)).toHaveLength(0)
  })

  it.each([
    ['a decided case (409)', () => problem(409, 'resource-conflict'), 'console.verification.decision.conflict'],
    ['an edge size refusal (413)', () => problem(413, 'payload-too-large'), 'console.verification.decision.tooLarge'],
    ['a server fault', () => problem(500, 'internal-error'), 'identityErrors.service'],
  ])('reports %s without English server text', async (_label, respond, key) => {
    await openPending({ [EVIDENCE_URL]: respond })
    await dropEvidence()

    expect(await screen.findByText(i18n.t(key))).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(button('console.verification.decision.verify').disabled).toBe(true)
  })
})

describe('Verify', () => {
  async function readyToVerify(extra: Record<string, Handler | Handler[]> = {}) {
    await openPending({ [EVIDENCE_URL]: () => json(201, EVIDENCE), ...extra })
    await dropEvidence()
    await screen.findByText('cr-scan.pdf')
    fireEvent.change(referenceInput(), { target: { value: '  ATT-2026/0142 ' } })
  }

  it('stays disabled until evidence is filed and the reference is valid', async () => {
    await openPending({ [EVIDENCE_URL]: () => json(201, EVIDENCE) })
    expect(button('console.verification.decision.verify').disabled).toBe(true)

    await dropEvidence()
    await screen.findByText('cr-scan.pdf')
    expect(button('console.verification.decision.verify').disabled).toBe(true)

    fireEvent.change(referenceInput(), { target: { value: 'ATT 0142' } })
    fireEvent.blur(referenceInput())
    expect(screen.getByText(i18n.t('console.verification.decision.referenceInvalid'))).toBeTruthy()
    expect(button('console.verification.decision.verify').disabled).toBe(true)

    fireEvent.change(referenceInput(), { target: { value: 'ATT-0142' } })
    expect(button('console.verification.decision.verify').disabled).toBe(false)
    expect(callsTo(ATTEST_URL)).toHaveLength(0)
  })

  it('asks for confirmation, then attests once with the exact backend body and re-reads the company', async () => {
    let release: (response: Response) => void = () => {}
    await readyToVerify({
      [ATTEST_URL]: () => new Promise<Response>((resolve) => (release = resolve)),
      [DETAIL_URL]: [() => json(200, PENDING), () => json(200, VERIFIED)],
    })

    fireEvent.click(button('console.verification.decision.verify'))
    const dialog = screen.getByRole('dialog', { name: i18n.t('console.verification.decision.verifyTitle', { name: 'Al Noor Bakery' }) })
    expect(within(dialog).getByText('ATT-2026/0142')).toBeTruthy()
    expect(callsTo(ATTEST_URL)).toHaveLength(0)

    const confirm = within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.verifyConfirm') })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(callsTo(ATTEST_URL)).toHaveLength(1)
    expect(within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.verifying') })).toBeTruthy()

    await act(async () => release(json(200, { tenantId: ID, verificationStatus: 'VERIFIED', verificationMethod: 'MANUAL_ATTESTATION', tenantStatus: 'ACTIVE', decidedAt: '2026-09-12T06:00:00Z' })))

    expect(await screen.findByText(i18n.t('console.verification.decision.verified'))).toBeTruthy()
    expect(JSON.parse(initOf(ATTEST_URL).body as string)).toEqual({
      expectedRevision: 2,
      attestationReference: 'ATT-2026/0142',
      evidenceReference: EVIDENCE.evidenceReference,
      evidenceSha256: EVIDENCE.evidenceSha256,
    })
    expect((initOf(ATTEST_URL).headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    await waitFor(() => expect(callsTo(DETAIL_URL)).toHaveLength(2))
    expect(callsTo(HISTORY_URL)).toHaveLength(2)
    await waitFor(() => expect(screen.queryByText(i18n.t('console.verification.decision.title'))).toBeNull())
  })

  it('refuses locally when the evidence was filed against an older revision', async () => {
    await openPending({ [EVIDENCE_URL]: () => json(201, { ...EVIDENCE, profileRevision: 1 }) })
    await dropEvidence()
    fireEvent.change(referenceInput(), { target: { value: 'ATT-0142' } })

    expect(await screen.findByText(i18n.t('console.verification.decision.staleEvidence'))).toBeTruthy()
    expect(button('console.verification.decision.verify').disabled).toBe(true)
  })

  it('on a moved case (409) explains it and reloads the company when asked', async () => {
    await readyToVerify({ [ATTEST_URL]: () => problem(409, 'resource-conflict') })
    fireEvent.click(button('console.verification.decision.verify'))
    fireEvent.click(button('console.verification.decision.verifyConfirm'))

    expect(await screen.findByText(i18n.t('console.verification.decision.conflict'))).toBeTruthy()
    expect(button('console.verification.decision.verifyConfirm').disabled).toBe(true)
    fireEvent.click(button('console.verification.decision.reload'))
    await waitFor(() => expect(callsTo(DETAIL_URL)).toHaveLength(2))
    expect(callsTo(HISTORY_URL)).toHaveLength(2)
    expect(callsTo(ATTEST_URL)).toHaveLength(1)
  })

  it('reports a refusal (403) as such', async () => {
    await readyToVerify({ [ATTEST_URL]: () => problem(403, 'insufficient-permission') })
    fireEvent.click(button('console.verification.decision.verify'))
    fireEvent.click(button('console.verification.decision.verifyConfirm'))

    expect(await screen.findByText(i18n.t('console.verification.decision.forbidden'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('console.verification.decision.verified'))).toBeNull()
  })

  it('sends a session that died to Login', async () => {
    await readyToVerify({ [ATTEST_URL]: () => problem(401, 'unauthenticated') })
    fireEvent.click(button('console.verification.decision.verify'))
    fireEvent.click(button('console.verification.decision.verifyConfirm'))

    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(peekEntitlements()).toBeNull()
  })
})

describe('Reject', () => {
  it('needs a reason, then rejects once with the exact backend body and re-reads the company', async () => {
    await openPending({
      [REJECT_URL]: () => json(200, { tenantId: ID, verificationStatus: 'REJECTED', verificationMethod: null, tenantStatus: 'PENDING', decidedAt: '2026-09-12T06:00:00Z' }),
      [DETAIL_URL]: [() => json(200, PENDING), () => json(200, { ...PENDING, verificationStatus: 'REJECTED', rejectionReason: 'TAX_IDENTITY_EVIDENCE_MISSING' })],
    })

    fireEvent.click(button('console.verification.decision.reject'))
    const dialog = screen.getByRole('dialog', { name: i18n.t('console.verification.decision.rejectTitle') })
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.rejectConfirm') }))
    expect(within(dialog).getByText(i18n.t('console.verification.decision.reasonRequired'))).toBeTruthy()
    expect(callsTo(REJECT_URL)).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.reason') }))
    fireEvent.click(screen.getByRole('option', { name: i18n.t('console.verification.detail.reason.TAX_IDENTITY_EVIDENCE_MISSING') }))
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.rejectConfirm') }))

    expect(await screen.findByText(i18n.t('console.verification.decision.rejected'))).toBeTruthy()
    expect(callsTo(REJECT_URL)).toHaveLength(1)
    expect(JSON.parse(initOf(REJECT_URL).body as string)).toEqual({
      expectedRevision: 2,
      reason: 'TAX_IDENTITY_EVIDENCE_MISSING',
    })
    await waitFor(() => expect(callsTo(DETAIL_URL)).toHaveLength(2))
  })

  it('can be cancelled without sending anything', async () => {
    await openPending()
    fireEvent.click(button('console.verification.decision.reject'))
    fireEvent.click(button('common.cancel'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo(REJECT_URL)).toHaveLength(0)
  })
})

describe('Language and privacy', () => {
  it('speaks Arabic in the panel and its dialogs', async () => {
    await i18n.changeLanguage('ar')
    await openPending()

    expect(screen.getByRole('heading', { level: 2, name: 'القرار' })).toBeTruthy()
    fireEvent.click(button('console.verification.decision.reject'))
    expect(screen.getByRole('dialog', { name: 'رفض هذا التسجيل؟' })).toBeTruthy()
  })

  it('keeps evidence details out of storage and the console', async () => {
    const consoleCalls = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level))
    await openPending({ [EVIDENCE_URL]: () => json(201, EVIDENCE) })
    await dropEvidence()
    await screen.findByText('cr-scan.pdf')

    const stored = JSON.stringify({ ...sessionStorage, ...localStorage })
    for (const value of [EVIDENCE.evidenceReference, EVIDENCE.evidenceSha256, 'OM1100000001']) {
      expect(stored).not.toContain(value)
      for (const spy of consoleCalls) expect(JSON.stringify(spy.mock.calls)).not.toContain(value)
    }
  })
})

describe('Peppol Participant ID', () => {
  const PID_URL = `/api/v1/platform/peppol/smp/tenants/${ID}/data-submissions/current`
  const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222'
  const VERIFY_URL = `/api/v1/platform/peppol/smp/tenants/${ID}/data-submissions/${SUBMISSION_ID}/verify`

  const submission = (overrides: Record<string, unknown> = {}) => ({
    id: SUBMISSION_ID,
    tenantId: ID,
    status: 'SUBMITTED',
    candidatePidScheme: '0248',
    candidatePidValue: 'OM1100000001',
    verifiedPidScheme: null,
    verifiedPidValue: null,
    reasonCode: null,
    createdBy: 'u-registrant',
    submittedBy: 'u-registrant',
    optimisticLockVersion: 3,
    ...overrides,
  })

  async function openWithPid(pid: Handler | Handler[] = () => json(200, submission())) {
    answer({ ...reads(), [PID_URL]: pid })
    renderDetail()
    await screen.findByRole('heading', { level: 2, name: i18n.t('console.verification.participant.title') })
  }

  /** Scoped to this card alone: some of its status words (e.g. "Submitted for review") also
   * appear in the History card's event log, which lists the same registration's own events. */
  const participantCard = () =>
    within(screen.getByText(i18n.t('console.verification.participant.title')).closest('section')!)

  it('shows the tenant’s real candidate ID and status once submitted', async () => {
    await openWithPid()

    // The card's own read resolves after the heading (present in every state) mounts, so the
    // first check waits for it; everything else here is stable once this one settles.
    expect(await screen.findByText('0248:OM1100000001')).toBeTruthy()
    // Scoped: "Submitted for review" is also the History card's own label for a PROFILE_SUBMITTED
    // event on this same registration, so an unscoped query would find both.
    expect(
      participantCard().getByText(i18n.t('console.verification.participant.submissionStatus.SUBMITTED')),
    ).toBeTruthy()
    expect(button('console.verification.participant.approve').disabled).toBe(false)
    expect(button('console.verification.participant.reject').disabled).toBe(false)
  })

  it('shows a plain "not submitted" state, with no actions, when there is no submission yet', async () => {
    await openWithPid(() => json(200, null))

    expect(await screen.findByText(i18n.t('console.verification.participant.notSubmitted'))).toBeTruthy()
    expect(screen.getByText(i18n.t('console.verification.participant.awaitingSubmission'))).toBeTruthy()
    // The proposed 0248:VAT preview still shows, computed locally, since nothing was filed to show instead.
    expect(screen.getByText('0248:OM1100000001')).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.participant.approve') })).toBeNull()
  })

  it('reports the operator has no access, distinctly from any other failure', async () => {
    await openWithPid(() => problem(403, 'insufficient-permission'))

    expect(await screen.findByText(i18n.t('console.access.missingPermission'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.participant.approve') })).toBeNull()
  })

  it('shows the verified ID and offers no action once decided', async () => {
    await openWithPid(() =>
      json(200, submission({ status: 'VERIFIED', verifiedPidScheme: '0248', verifiedPidValue: 'OM1100000001' })),
    )

    expect(
      await screen.findByText(i18n.t('console.verification.participant.submissionStatus.VERIFIED')),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('console.verification.participant.verifiedId'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.participant.approve') })).toBeNull()
  })

  it('tells the submitter someone else must decide their own filing', async () => {
    await openWithPid(() => json(200, submission({ createdBy: OPERATOR.userId, submittedBy: OPERATOR.userId })))

    expect(await screen.findByText(i18n.t('console.verification.participant.ownSubmission'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.participant.approve') })).toBeNull()
  })

  it('warns that a group VAT number may not be a Participant ID', async () => {
    answer({ ...reads(() => json(200, { ...PENDING, taxNumber: 'OM1200000009' })), [PID_URL]: () => json(200, null) })
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'Al Noor Bakery' })

    expect(await screen.findByText(i18n.t('console.verification.participant.groupVat'))).toBeTruthy()
  })

  it('is not shown before the registration is submitted', async () => {
    answer(reads(() => json(200, { ...PENDING, submittedAt: null })))
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'Al Noor Bakery' })

    expect(screen.queryByText(i18n.t('console.verification.participant.title'))).toBeNull()
    // No PID read either: the card that would trigger it never mounts.
    expect(fetchMock.mock.calls.some(([url]) => url === PID_URL)).toBe(false)
  })

  it('approves the candidate as filed, with a reason code, and re-reads the submission', async () => {
    let release: (response: Response) => void = () => {}
    answer({
      ...reads(),
      [PID_URL]: [
        () => json(200, submission()),
        () => json(200, submission({ status: 'VERIFIED', verifiedPidScheme: '0248', verifiedPidValue: 'OM1100000001' })),
      ],
      [VERIFY_URL]: () => new Promise<Response>((resolve) => (release = resolve)),
    })
    renderDetail()
    const approve = await screen.findByRole('button', { name: i18n.t('console.verification.participant.approve') })

    fireEvent.click(approve)
    const dialog = screen.getByRole('dialog', { name: i18n.t('console.verification.participant.approveTitle') })
    const confirm = within(dialog).getByRole('button', { name: i18n.t('console.verification.participant.approveConfirm') })
    fireEvent.click(confirm)
    expect(within(dialog).getByText(i18n.t('console.verification.participant.reasonRequired'))).toBeTruthy()
    expect(callsTo(VERIFY_URL)).toHaveLength(0)

    const reasonInput = document.querySelector<HTMLInputElement>('input[name="participantReasonCode"]')!
    fireEvent.change(reasonInput, { target: { value: 'verified_by_compliance' } })
    expect(reasonInput.value).toBe('VERIFIED_BY_COMPLIANCE')
    fireEvent.click(confirm)

    expect(callsTo(VERIFY_URL)).toHaveLength(1)
    expect(JSON.parse(initOf(VERIFY_URL).body as string)).toEqual({
      expectedOptimisticLockVersion: 3,
      approved: true,
      reasonCode: 'VERIFIED_BY_COMPLIANCE',
    })
    await act(async () => release(json(200, submission({ status: 'VERIFIED' }))))
    await waitFor(() => expect(callsTo(PID_URL)).toHaveLength(2))
  })

  it('rejects with a reason code the same way', async () => {
    answer({ ...reads(), [PID_URL]: () => json(200, submission()), [VERIFY_URL]: () => json(200, submission({ status: 'REJECTED' })) })
    renderDetail()
    const reject = await screen.findByRole('button', { name: i18n.t('console.verification.participant.reject') })

    fireEvent.click(reject)
    const dialog = screen.getByRole('dialog', { name: i18n.t('console.verification.participant.rejectTitle') })
    const reasonInput = document.querySelector<HTMLInputElement>('input[name="participantReasonCode"]')!
    fireEvent.change(reasonInput, { target: { value: 'MISSING_EVIDENCE' } })
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.participant.rejectConfirm') }))

    await waitFor(() => expect(callsTo(VERIFY_URL)).toHaveLength(1))
    expect(JSON.parse(initOf(VERIFY_URL).body as string)).toEqual({
      expectedOptimisticLockVersion: 3,
      approved: false,
      reasonCode: 'MISSING_EVIDENCE',
    })
  })

  it('on a moved case (409) explains it and reloads when asked', async () => {
    answer({ ...reads(), [PID_URL]: () => json(200, submission()), [VERIFY_URL]: () => problem(409, 'resource-conflict') })
    renderDetail()
    const approve = await screen.findByRole('button', { name: i18n.t('console.verification.participant.approve') })

    fireEvent.click(approve)
    const reasonInput = document.querySelector<HTMLInputElement>('input[name="participantReasonCode"]')!
    fireEvent.change(reasonInput, { target: { value: 'VERIFIED_BY_COMPLIANCE' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.verification.participant.approveConfirm') }))

    expect(await screen.findByText(i18n.t('console.verification.participant.conflict'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.verification.decision.reload') }))
    await waitFor(() => expect(callsTo(PID_URL)).toHaveLength(2))
  })
})
