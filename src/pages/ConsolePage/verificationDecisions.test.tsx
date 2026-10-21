import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements, peekEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { CompanyDetail, HistoryEntry } from '../../lib/console/companyVerification'
import { formatInstant } from '../../lib/format'
import { VerificationCompanyPage } from './VerificationCompanyPage'

const ID = '11111111-1111-4111-8111-111111111111'
const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const DETAIL_URL = `/api/v1/platform/companies/${ID}`
const HISTORY_URL = `/api/v1/platform/companies/${ID}/verification-history`
const EVIDENCE_URL = `/api/v1/platform/companies/${ID}/verification-evidence`
const ATTEST_URL = `/api/v1/tenants/${ID}/company-verification/manual-attestation`
const REJECT_URL = `/api/v1/tenants/${ID}/company-verification/rejection`
const PAYMENT_URL = `/api/v1/platform/companies/${ID}/signup-payment`
const HELD = (status: string) => ({
  id: 'pay-1',
  method: 'BANK_TRANSFER',
  status,
  amount: '84.000',
  reference: 'TRF-1',
  customerNote: null,
  submittedAt: '2026-09-12T05:00:00Z',
  proofContentType: 'application/pdf',
})
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
  // Several tests end right after a click that starts a re-read. Left in the shared registry, that
  // read would be joined by the next test on the same company (see `inflight.ts`).
  resetSharedRequests()
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

  it('says in the confirm dialog when the payment sent with the application is not confirmed yet', async () => {
    await readyToVerify({ [PAYMENT_URL]: () => json(200, { payment: HELD('SUBMITTED'), refundCase: null }) })
    await screen.findAllByText(i18n.t('console.billing.status.SUBMITTED'))
    fireEvent.click(button('console.verification.decision.verify'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(i18n.t('console.verification.decision.verifyBody'))).toBeTruthy()
    expect(within(dialog).getByText(i18n.t('console.verification.decision.paymentNotConfirmed'))).toBeTruthy()
  })

  it('says nothing more in the confirm dialog once Finance has verified the payment', async () => {
    await readyToVerify({ [PAYMENT_URL]: () => json(200, { payment: HELD('FUNDS_VERIFIED'), refundCase: null }) })
    await screen.findAllByText(i18n.t('console.billing.status.FUNDS_VERIFIED'))
    fireEvent.click(button('console.verification.decision.verify'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(i18n.t('console.verification.decision.paymentNotConfirmed'))).toBeNull()
  })

  it('names the cash receipt Finance recorded instead of "None" (H1)', async () => {
    const cash = {
      ...HELD('AWAITING_SECOND_APPROVAL'),
      method: 'CASH',
      reference: null,
      proofContentType: null,
      receiptNumber: 'RC-RT1015-C1',
    }
    await readyToVerify({ [PAYMENT_URL]: () => json(200, { payment: cash, refundCase: null }) })
    expect(await screen.findByText('RC-RT1015-C1')).toBeTruthy()
    expect(screen.queryByText(i18n.t('console.verification.payment.noReceipt'))).toBeNull()
    // Above the threshold the verifier confirms it again (CS-2), not a second approver.
    expect(screen.getByText(i18n.t('console.billing.status.AWAITING_SECOND_APPROVAL'))).toBeTruthy()
  })

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
    expect(within(dialog).getByText(i18n.t('console.verification.decision.rejectBody'))).toBeTruthy()
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
      // Correctable unless the reviewer chooses otherwise.
      classification: 'CORRECTABLE',
      finalReason: null,
    })
    await waitFor(() => expect(callsTo(DETAIL_URL)).toHaveLength(2))
  })

  it('a final rejection needs its own reason, and sends it with the classification', async () => {
    await openPending({
      [REJECT_URL]: () => json(200, { tenantId: ID, verificationStatus: 'REJECTED', verificationMethod: null, tenantStatus: 'PENDING', decidedAt: '2026-09-12T06:00:00Z' }),
      [DETAIL_URL]: [() => json(200, PENDING), () => json(200, { ...PENDING, verificationStatus: 'REJECTED', rejectionReason: 'TAX_IDENTITY_EVIDENCE_MISSING' })],
    })

    fireEvent.click(button('console.verification.decision.reject'))
    const dialog = screen.getByRole('dialog', { name: i18n.t('console.verification.decision.rejectTitle') })
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.reason') }))
    fireEvent.click(screen.getByRole('option', { name: i18n.t('console.verification.detail.reason.TAX_IDENTITY_EVIDENCE_MISSING') }))
    fireEvent.click(
      within(dialog).getByRole('radio', {
        name: new RegExp(i18n.t('console.verification.decision.classificationOption.FINAL.title')),
      }),
    )
    // A final rejection closes the application, and the dialog says so instead of "back to correct".
    expect(within(dialog).getByText(i18n.t('console.verification.decision.rejectBodyFinal'))).toBeTruthy()
    expect(within(dialog).queryByText(i18n.t('console.verification.decision.rejectBody'))).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.rejectConfirm') }))
    expect(within(dialog).getByText(i18n.t('console.verification.decision.finalReasonRequired'))).toBeTruthy()
    expect(callsTo(REJECT_URL)).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText(i18n.t('console.verification.decision.finalReason')), {
      target: { value: 'Forged registration certificate' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.rejectConfirm') }))

    expect(await screen.findByText(i18n.t('console.verification.decision.rejectedFinal'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('console.verification.decision.rejected'))).toBeNull()
    expect(screen.queryByText(i18n.t('console.verification.decision.refundOpened'), { exact: false })).toBeNull()
    expect(JSON.parse(initOf(REJECT_URL).body as string)).toEqual({
      expectedRevision: 2,
      reason: 'TAX_IDENTITY_EVIDENCE_MISSING',
      classification: 'FINAL',
      finalReason: 'Forged registration certificate',
    })
  })

  it('after a final rejection with confirmed money, says the refund case was opened', async () => {
    await openPending({
      [REJECT_URL]: () => json(200, { tenantId: ID, verificationStatus: 'REJECTED', verificationMethod: null, tenantStatus: 'PENDING', decidedAt: '2026-09-12T06:00:00Z' }),
      [DETAIL_URL]: [() => json(200, PENDING), () => json(200, { ...PENDING, verificationStatus: 'REJECTED', rejectionReason: 'TAX_IDENTITY_EVIDENCE_MISSING' })],
      [PAYMENT_URL]: [
        () => json(200, { payment: HELD('FUNDS_VERIFIED'), refundCase: null }),
        () => json(200, { payment: HELD('FUNDS_VERIFIED'), refundCase: { reason: 'FINAL_REJECTION', amount: '84.000', status: 'OPEN' } }),
      ],
    })
    fireEvent.click(button('console.verification.decision.reject'))
    const dialog = screen.getByRole('dialog', { name: i18n.t('console.verification.decision.rejectTitle') })
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.reason') }))
    fireEvent.click(screen.getByRole('option', { name: i18n.t('console.verification.detail.reason.TAX_IDENTITY_EVIDENCE_MISSING') }))
    fireEvent.click(
      within(dialog).getByRole('radio', {
        name: new RegExp(i18n.t('console.verification.decision.classificationOption.FINAL.title')),
      }),
    )
    fireEvent.change(within(dialog).getByLabelText(i18n.t('console.verification.decision.finalReason')), {
      target: { value: 'Forged registration certificate' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.decision.rejectConfirm') }))

    const banner = await screen.findByText(i18n.t('console.verification.decision.rejectedFinal'), { exact: false })
    await waitFor(() => expect(banner.textContent).toContain(i18n.t('console.verification.decision.refundOpened')))
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

  // A reviewable candidate that is not the reviewer's own makes the card ask whether the taxpayer
  // Participant ID validation policy is in force, before it offers an approval.
  const POLICY_URL = '/api/v1/platform/peppol/smp/data-blockers/TAXPAYER_PID_CONTRACT/current'
  const POLICY_IN_FORCE = {
    [POLICY_URL]: () => json(200, { id: 'p-1', type: 'TAXPAYER_PID_CONTRACT', status: 'ACTIVE' }),
  }
  const coded = (status: number, type: string, code: string) =>
    json(status, {
      type: `https://api.fawtir.om/problems/${type}`,
      detail: 'Server prose that must not be shown.',
      correlationId: 'corr-pid-42',
      code,
    })

  async function openWithPid(
    pid: Handler | Handler[] = () => json(200, submission()),
    extra: Record<string, Handler | Handler[]> = POLICY_IN_FORCE,
  ) {
    answer({ ...reads(), [PID_URL]: pid, ...extra })
    renderDetail()
    await screen.findByRole('heading', { level: 2, name: i18n.t('console.verification.participant.title') })
  }

  // The example the backend's own contract test approves with (SmpDataBlockerHttpContractTest).
  const EVIDENCE = 'evidence://tickets/SUP-1200'
  const JUSTIFICATION = 'Commercial register extract SUP-1200 matches the VAT number'
  const evidenceInput = () => document.querySelector<HTMLInputElement>('input[name="participantEvidenceReference"]')
  const justificationInput = () => document.querySelector<HTMLInputElement>('input[name="participantJustification"]')

  /** Fills what only an approval asks for; a rejection dialog has neither field. */
  function fillApproval(evidence = EVIDENCE, justification = JUSTIFICATION) {
    fireEvent.change(evidenceInput()!, { target: { value: evidence } })
    fireEvent.change(justificationInput()!, { target: { value: justification } })
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
    // Approve waits for the policy read, so it is awaited; it is still required to be there and enabled.
    const approve = await screen.findByRole('button', { name: i18n.t('console.verification.participant.approve') })
    expect((approve as HTMLButtonElement).disabled).toBe(false)
    expect(button('console.verification.participant.reject').disabled).toBe(false)
    expect(callsTo(POLICY_URL)).toHaveLength(1)
  })

  it('shows a plain "not submitted" state, with no actions, when there is no submission yet', async () => {
    await openWithPid(() => json(200, null), {})

    expect(await screen.findByText(i18n.t('console.verification.participant.notSubmitted'))).toBeTruthy()
    expect(screen.getByText(i18n.t('console.verification.participant.awaitingSubmission'))).toBeTruthy()
    // The proposed 0248:VAT preview still shows, computed locally, since nothing was filed to show instead.
    expect(screen.getByText('0248:OM1100000001')).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.participant.approve') })).toBeNull()
  })

  it('treats the empty 200 the backend really sends for "no submission" as not submitted', async () => {
    // The server's actual answer: no body, no content type. json(200, null) above is a body the
    // backend never sends, which is how the crash on console-onboarded companies went unseen.
    await openWithPid(() => new Response(null, { status: 200 }), {})

    expect(await screen.findByText(i18n.t('console.verification.participant.notSubmitted'))).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Al Noor Bakery' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.participant.approve') })).toBeNull()
  })

  it('reports the operator has no access, distinctly from any other failure', async () => {
    await openWithPid(() => problem(403, 'insufficient-permission'), {})

    expect(await screen.findByText(i18n.t('console.access.missingPermission'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.participant.approve') })).toBeNull()
  })

  it('shows the verified ID and offers no action once decided', async () => {
    await openWithPid(
      () => json(200, submission({ status: 'VERIFIED', verifiedPidScheme: '0248', verifiedPidValue: 'OM1100000001' })),
      {},
    )

    expect(
      await screen.findByText(i18n.t('console.verification.participant.submissionStatus.VERIFIED')),
    ).toBeTruthy()
    expect(screen.getByText(i18n.t('console.verification.participant.verifiedId'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.verification.participant.approve') })).toBeNull()
  })

  it('tells the submitter someone else must decide their own filing', async () => {
    await openWithPid(() => json(200, submission({ createdBy: OPERATOR.userId, submittedBy: OPERATOR.userId })), {})

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

  it('approves the candidate as filed, with a reason code, evidence and justification, once, and re-reads the submission', async () => {
    let release: (response: Response) => void = () => {}
    answer({
      ...reads(),
      ...POLICY_IN_FORCE,
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
    expect(within(dialog).getByText(i18n.t('console.verification.participant.evidenceError.required'))).toBeTruthy()
    expect(within(dialog).getByText(i18n.t('console.verification.participant.justificationError.required'))).toBeTruthy()
    expect(callsTo(VERIFY_URL)).toHaveLength(0)

    const reasonInput = document.querySelector<HTMLInputElement>('input[name="participantReasonCode"]')!
    fireEvent.change(reasonInput, { target: { value: 'verified_by_compliance' } })
    expect(reasonInput.value).toBe('VERIFIED_BY_COMPLIANCE')
    // A reason code alone, the body this console sent before the owner policy, is still held back.
    fireEvent.click(confirm)
    expect(callsTo(VERIFY_URL)).toHaveLength(0)

    fillApproval(`  ${EVIDENCE} `)
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    expect(callsTo(VERIFY_URL)).toHaveLength(1)
    expect(JSON.parse(initOf(VERIFY_URL).body as string)).toEqual({
      expectedOptimisticLockVersion: 3,
      approved: true,
      reasonCode: 'VERIFIED_BY_COMPLIANCE',
      evidenceReference: EVIDENCE,
      justification: JUSTIFICATION,
    })
    await act(async () => release(json(200, submission({ status: 'VERIFIED' }))))
    await waitFor(() => expect(callsTo(PID_URL)).toHaveLength(2))
    // The policy was asked once, before the decision; a decided submission asks nothing more.
    expect(callsTo(POLICY_URL)).toHaveLength(1)
  })

  it('rejects with a reason code alone, asking for no evidence or justification', async () => {
    answer({ ...reads(), ...POLICY_IN_FORCE, [PID_URL]: () => json(200, submission()), [VERIFY_URL]: () => json(200, submission({ status: 'REJECTED' })) })
    renderDetail()
    const reject = await screen.findByRole('button', { name: i18n.t('console.verification.participant.reject') })

    fireEvent.click(reject)
    const dialog = screen.getByRole('dialog', { name: i18n.t('console.verification.participant.rejectTitle') })
    expect(evidenceInput()).toBeNull()
    expect(justificationInput()).toBeNull()
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
    answer({ ...reads(), ...POLICY_IN_FORCE, [PID_URL]: () => json(200, submission()), [VERIFY_URL]: () => problem(409, 'resource-conflict') })
    renderDetail()
    const approve = await screen.findByRole('button', { name: i18n.t('console.verification.participant.approve') })

    fireEvent.click(approve)
    const reasonInput = document.querySelector<HTMLInputElement>('input[name="participantReasonCode"]')!
    fireEvent.change(reasonInput, { target: { value: 'VERIFIED_BY_COMPLIANCE' } })
    fillApproval()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.verification.participant.approveConfirm') }))

    expect(await screen.findByText(i18n.t('console.verification.participant.conflict'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('console.verification.decision.reload') }))
    await waitFor(() => expect(callsTo(PID_URL)).toHaveLength(2))
  })

  describe('validation policy in force', () => {
    const approveName = () => i18n.t('console.verification.participant.approve')
    const blocked =
      'Participant ID approval is blocked because the Taxpayer Participant ID validation policy is not active.'

    function fillReasonAndConfirm(confirmKey: string, code = 'VERIFIED_BY_COMPLIANCE') {
      const reasonInput = document.querySelector<HTMLInputElement>('input[name="participantReasonCode"]')!
      fireEvent.change(reasonInput, { target: { value: code } })
      if (evidenceInput()) fillApproval()
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: i18n.t(confirmKey) }))
    }

    it('asks for no policy when there is nothing to decide', async () => {
      await openWithPid(() => json(200, submission({ createdBy: OPERATOR.userId })), {})
      await screen.findByText(i18n.t('console.verification.participant.ownSubmission'))

      expect(callsTo(POLICY_URL)).toHaveLength(0)
    })

    it('with no policy in force (404) explains why approval is blocked, links to the policy, and offers no Approve', async () => {
      await openWithPid(undefined, { [POLICY_URL]: () => problem(404, 'resource-not-found') })

      // Waited for on the screen first: the card is replaced when its own read settles.
      expect(await screen.findByText(blocked)).toBeTruthy()
      expect(participantCard().getByText(blocked)).toBeTruthy()
      expect(i18n.t('console.verification.participant.policyNotActive')).toBe(blocked)
      const link = participantCard().getByRole('link', { name: i18n.t('console.verification.participant.viewPolicy') })
      expect(link.getAttribute('href')).toBe('/console/policies/TAXPAYER_PID_CONTRACT')
      expect(screen.queryByRole('button', { name: approveName() })).toBeNull()
      expect(button('console.verification.participant.reject').disabled).toBe(false)
      expect(callsTo(POLICY_URL)).toHaveLength(1)
      // Nothing was written to make the policy active: opening the card is reads only.
      expect(
        fetchMock.mock.calls.every(([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === 'GET'),
      ).toBe(true)
      expect(document.body.textContent).not.toContain('Server prose')
    })

    it('still lets a candidate be rejected when no policy is in force, with the same body as ever', async () => {
      await openWithPid(undefined, {
        [POLICY_URL]: () => problem(404, 'resource-not-found'),
        [VERIFY_URL]: () => json(200, submission({ status: 'REJECTED' })),
      })
      await screen.findByText(blocked)

      fireEvent.click(button('console.verification.participant.reject'))
      fillReasonAndConfirm('console.verification.participant.rejectConfirm', 'MISSING_EVIDENCE')

      await waitFor(() => expect(callsTo(VERIFY_URL)).toHaveLength(1))
      expect(JSON.parse(initOf(VERIFY_URL).body as string)).toEqual({
        expectedOptimisticLockVersion: 3,
        approved: false,
        reasonCode: 'MISSING_EVIDENCE',
      })
    })

    it.each([
      ['a reviewer who may not read policies (403)', () => problem(403, 'insufficient-permission')],
      ['a server fault', () => problem(500, 'internal-error')],
      ['a request that never arrived', () => Promise.reject(new TypeError('offline'))],
    ])('does not block approval for %s: the server decides', async (_label, respond) => {
      await openWithPid(undefined, { [POLICY_URL]: respond })

      expect(await screen.findByRole('button', { name: approveName() })).toBeTruthy()
      expect(participantCard().queryByText(blocked)).toBeNull()
      // The policy read's own failure is not shown as a failure of this card.
      expect(participantCard().queryByText(i18n.t('console.access.missingPermission'))).toBeNull()
      expect(participantCard().queryByRole('button', { name: i18n.t('console.access.retry') })).toBeNull()
    })

    it('on PID_POLICY_NOT_ACTIVE explains it in the dialog with the link, reads the policy again, and does not resend', async () => {
      await openWithPid(undefined, {
        [POLICY_URL]: [() => json(200, { id: 'p-1' }), () => problem(404, 'resource-not-found')],
        [VERIFY_URL]: () => coded(400, 'validation-failed', 'PID_POLICY_NOT_ACTIVE'),
      })

      fireEvent.click(await screen.findByRole('button', { name: approveName() }))
      fillReasonAndConfirm('console.verification.participant.approveConfirm')

      const dialog = screen.getByRole('dialog')
      expect(await within(dialog).findByText(blocked)).toBeTruthy()
      expect(
        within(dialog)
          .getByRole('link', { name: i18n.t('console.verification.participant.viewPolicy') })
          .getAttribute('href'),
      ).toBe('/console/policies/TAXPAYER_PID_CONTRACT')
      expect(within(dialog).getByText('corr-pid-42').getAttribute('dir')).toBe('ltr')
      const confirm = within(dialog).getByRole('button', {
        name: i18n.t('console.verification.participant.approveConfirm'),
      }) as HTMLButtonElement
      expect(confirm.disabled).toBe(true)
      fireEvent.click(confirm)

      await waitFor(() => expect(callsTo(POLICY_URL)).toHaveLength(2))
      expect(callsTo(VERIFY_URL)).toHaveLength(1)
      expect(JSON.parse(initOf(VERIFY_URL).body as string)).toEqual({
        expectedOptimisticLockVersion: 3,
        approved: true,
        reasonCode: 'VERIFIED_BY_COMPLIANCE',
        evidenceReference: EVIDENCE,
        justification: JUSTIFICATION,
      })
      expect(document.body.textContent).not.toContain('Server prose')
      // Behind the dialog the card has caught up: the approval is no longer offered.
      fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common.cancel') }))
      expect(await participantCard().findByText(blocked)).toBeTruthy()
      expect(screen.queryByRole('button', { name: approveName() })).toBeNull()
    })

    it.each([
      [400, 'validation-failed', 'PID_CANDIDATE_REJECTED', 'console.verification.participant.candidateRejected'],
      [400, 'validation-failed', 'REVIEWER_EVIDENCE_REQUIRED', 'console.verification.participant.evidenceRefused'],
      [400, 'validation-failed', 'REVIEWER_JUSTIFICATION_REQUIRED', 'console.verification.participant.justificationRefused'],
      [409, 'resource-conflict', 'PID_ALREADY_VERIFIED', 'console.verification.participant.alreadyVerified'],
      [409, 'resource-conflict', 'PID_HELD_BY_TEST_BINDING', 'console.verification.participant.heldByTestBinding'],
      [409, 'resource-conflict', 'PID_HELD_BY_MANAGED_REGISTRATION', 'console.verification.participant.heldByManagedRegistration'],
      [409, 'resource-conflict', 'PID_HELD_BY_QUARANTINED_CLAIM', 'console.verification.participant.heldByQuarantinedClaim'],
      [409, 'resource-conflict', 'PID_CLAIM_CONFLICT', 'console.verification.participant.claimConflict'],
      [409, 'resource-conflict', 'PID_CLAIM_CONTESTED', 'console.verification.participant.claimContested'],
      [409, 'resource-conflict', 'SELF_VERIFICATION_NOT_ALLOWED', 'console.verification.participant.ownSubmission'],
      [409, 'resource-conflict', 'STALE_VERSION', 'console.verification.participant.conflict'],
      [409, 'resource-conflict', 'INVALID_STATE', 'console.verification.participant.conflict'],
    ])('reads a %i %s refusal coded %s by its code, with the reference', async (status, type, code, key) => {
      await openWithPid(undefined, { ...POLICY_IN_FORCE, [VERIFY_URL]: () => coded(status, type, code) })

      fireEvent.click(await screen.findByRole('button', { name: approveName() }))
      fillReasonAndConfirm('console.verification.participant.approveConfirm')

      const dialog = screen.getByRole('dialog')
      expect(await within(dialog).findByText(i18n.t(key))).toBeTruthy()
      expect(within(dialog).getByText('corr-pid-42')).toBeTruthy()
      expect(callsTo(VERIFY_URL)).toHaveLength(1)
      expect(callsTo(POLICY_URL)).toHaveLength(1)
      expect(document.body.textContent).not.toContain('Server prose')
      // A stale or already-decided submission keeps the reload it always offered.
      const reload = within(dialog).queryByRole('button', { name: i18n.t('console.verification.decision.reload') })
      expect(reload !== null).toBe(key === 'console.verification.participant.conflict')
    })

    it('holds back an approval whose evidence carries credentials or whose justification is a placeholder', async () => {
      await openWithPid(undefined, { ...POLICY_IN_FORCE, [VERIFY_URL]: () => json(200, submission({ status: 'VERIFIED' })) })

      fireEvent.click(await screen.findByRole('button', { name: approveName() }))
      const dialog = screen.getByRole('dialog')
      const reasonInput = document.querySelector<HTMLInputElement>('input[name="participantReasonCode"]')!
      fireEvent.change(reasonInput, { target: { value: 'PID_OK' } })
      fillApproval('https://reviewer:secret@tickets.example.test/SUP-1200', 'OKOK')
      fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.participant.approveConfirm') }))

      expect(within(dialog).getByText(i18n.t('console.verification.participant.evidenceError.credentials'))).toBeTruthy()
      expect(within(dialog).getByText(i18n.t('console.verification.participant.justificationError.length'))).toBeTruthy()
      expect(callsTo(VERIFY_URL)).toHaveLength(0)
    })

    it.each([
      ['n/a', 'placeholder'],
      ['https://jira.fawtir.om/', 'invalid'],
    ])('holds back the evidence reference %j as %s, naming the accepted forms', async (evidence, problem) => {
      await openWithPid(undefined, { ...POLICY_IN_FORCE, [VERIFY_URL]: () => json(200, submission({ status: 'VERIFIED' })) })

      fireEvent.click(await screen.findByRole('button', { name: approveName() }))
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(i18n.t('console.verification.participant.evidenceHint'))).toBeTruthy()
      const reasonInput = document.querySelector<HTMLInputElement>('input[name="participantReasonCode"]')!
      fireEvent.change(reasonInput, { target: { value: 'PID_OK' } })
      fillApproval(evidence)
      fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('console.verification.participant.approveConfirm') }))

      expect(within(dialog).getByText(i18n.t(`console.verification.participant.evidenceError.${problem}`))).toBeTruthy()
      expect(callsTo(VERIFY_URL)).toHaveLength(0)
    })

    it('reads a 403 on the decision as a refusal of the decision', async () => {
      await openWithPid(undefined, { ...POLICY_IN_FORCE, [VERIFY_URL]: () => problem(403, 'insufficient-permission') })

      fireEvent.click(await screen.findByRole('button', { name: approveName() }))
      fillReasonAndConfirm('console.verification.participant.approveConfirm')

      const dialog = screen.getByRole('dialog')
      expect(await within(dialog).findByText(i18n.t('console.verification.participant.forbidden'))).toBeTruthy()
      expect(callsTo(VERIFY_URL)).toHaveLength(1)
      expect(document.body.textContent).not.toContain('Server prose')
    })

    it('asks for evidence and explains a claim refusal in Arabic', async () => {
      await i18n.changeLanguage('ar')
      await openWithPid(undefined, {
        ...POLICY_IN_FORCE,
        [VERIFY_URL]: () => coded(409, 'resource-conflict', 'PID_HELD_BY_MANAGED_REGISTRATION'),
      })

      fireEvent.click(await screen.findByRole('button', { name: approveName() }))
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByLabelText(/مرجع الدليل/)).toBeTruthy()
      expect(within(dialog).getByLabelText(/المبرّر/)).toBeTruthy()
      expect(within(dialog).getByText(/^اذكر السجل الذي اعتمدت عليه/)).toBeTruthy()
      fillReasonAndConfirm('console.verification.participant.approveConfirm')

      expect(
        await within(dialog).findByText('معرّف المشارك هذا مسجّل في SMP لشركة أخرى، لذا لا يمكن اعتماده هنا.'),
      ).toBeTruthy()
      expect(document.body.textContent).not.toContain('Server prose')
    })

    it('says it in Arabic', async () => {
      await i18n.changeLanguage('ar')
      await openWithPid(undefined, { [POLICY_URL]: () => problem(404, 'resource-not-found') })

      expect(await screen.findByText(i18n.t('console.verification.participant.policyNotActive'))).toBeTruthy()
      expect(screen.getByRole('link', { name: 'عرض سياسة التحقق من الصحة' })).toBeTruthy()
    })
  })

  describe('verification standing', () => {
    const NEW_SUBMISSION_ID = '99999999-9999-4999-8999-999999999999'
    const NEW_VERIFY_URL = `/api/v1/platform/peppol/smp/tenants/${ID}/data-submissions/${NEW_SUBMISSION_ID}/verify`
    const POLICY_V2 = { id: '55555555-5555-4555-8555-555555555555', versionNumber: 2 }
    const EARLIER = {
      submissionId: SUBMISSION_ID,
      submissionVersion: 1,
      participantScheme: '0248',
      participantValue: 'OM1100000001',
      policyVersionId: '44444444-4444-4444-8444-444444444444',
      policyVersionNumber: 1,
      verifiedAt: '2026-09-01T08:00:00Z',
    }
    const standingOf = (overrides: Record<string, unknown> = {}) => ({
      state: 'VERIFIED',
      currentPolicySatisfied: true,
      reverificationRequired: false,
      reverificationAvailable: false,
      policyInForce: POLICY_V2,
      verification: EARLIER,
      ...overrides,
    })
    const verifiedRow = (standing: Record<string, unknown>) =>
      submission({
        status: 'VERIFIED',
        verifiedPidScheme: '0248',
        verifiedPidValue: 'OM1100000001',
        verificationStanding: standing,
      })
    // The re-verification the company opened: a new row, reviewable, its own lock version.
    const reopened = (standing: Record<string, unknown>) =>
      submission({
        id: NEW_SUBMISSION_ID,
        status: 'SUBMITTED',
        optimisticLockVersion: 0,
        createdBy: 'u-tenant-admin',
        submittedBy: 'u-tenant-admin',
        verificationStanding: standing,
      })
    const statusLine = () =>
      participantCard().getByText(i18n.t('console.verification.participant.status')).parentElement!
    const version = (number: number) =>
      i18n.t('console.verification.participant.policyVersion', { number })

    it('keeps the earlier row qualified after a re-verification is rejected', async () => {
      await openWithPid(
        () =>
          json(
            200,
            verifiedRow(
              standingOf({
                state: 'REJECTED',
                currentPolicySatisfied: false,
                reverificationRequired: true,
                reverificationAvailable: true,
              }),
            ),
          ),
        {},
      )

      expect(
        await screen.findByText(
          i18n.t('console.verification.participant.standing.REVERIFICATION_REQUIRED'),
        ),
      ).toBeTruthy()
      expect(
        within(statusLine()).queryByText(
          i18n.t('console.verification.participant.submissionStatus.VERIFIED'),
        ),
      ).toBeNull()
      expect(
        participantCard().getByText(
          i18n.t('console.verification.participant.standingNote.rejectedWithPrevious'),
        ),
      ).toBeTruthy()
    })

    it('qualifies a verification under an earlier policy version instead of calling it verified', async () => {
      await openWithPid(
        () =>
          json(
            200,
            verifiedRow(
              standingOf({
                state: 'REVERIFICATION_REQUIRED',
                currentPolicySatisfied: false,
                reverificationRequired: true,
                reverificationAvailable: true,
              }),
            ),
          ),
        {},
      )

      expect(
        await screen.findByText(
          i18n.t('console.verification.participant.standing.REVERIFICATION_REQUIRED'),
        ),
      ).toBeTruthy()
      expect(
        within(statusLine()).queryByText(
          i18n.t('console.verification.participant.submissionStatus.VERIFIED'),
        ),
      ).toBeNull()
      // The stored verification is still shown, and still left to right.
      expect(
        participantCard().getByText(i18n.t('console.verification.participant.verifiedId')),
      ).toBeTruthy()
      expect(
        participantCard()
          .getAllByText('0248:OM1100000001')
          .every((node) => node.getAttribute('dir') === 'ltr'),
      ).toBe(true)
      expect(
        participantCard().getByText(
          i18n.t('console.verification.participant.standingNote.REVERIFICATION_REQUIRED'),
        ),
      ).toBeTruthy()
      expect(participantCard().getByText(version(1))).toBeTruthy()
      expect(participantCard().getByText(version(2))).toBeTruthy()
      // It is the verified row itself, so no separate "previous" ID is repeated.
      expect(
        participantCard().queryByText(i18n.t('console.verification.participant.previousId')),
      ).toBeNull()
      expect(
        screen.queryByRole('button', { name: i18n.t('console.verification.participant.approve') }),
      ).toBeNull()
      expect(callsTo(POLICY_URL)).toHaveLength(0)
      expect(
        fetchMock.mock.calls.every(
          ([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === 'GET',
        ),
      ).toBe(true)
    })

    it('qualifies a verification while no policy is in force', async () => {
      await openWithPid(
        () =>
          json(
            200,
            verifiedRow(
              standingOf({
                state: 'NO_POLICY_IN_FORCE',
                currentPolicySatisfied: false,
                policyInForce: null,
              }),
            ),
          ),
        {},
      )

      expect(
        await screen.findByText(
          i18n.t('console.verification.participant.standing.NO_POLICY_IN_FORCE'),
        ),
      ).toBeTruthy()
      expect(
        participantCard().getByText(
          i18n.t('console.verification.participant.standingNote.NO_POLICY_IN_FORCE'),
        ),
      ).toBeTruthy()
      expect(
        participantCard().getByText(i18n.t('console.verification.participant.noPolicyInForce')),
      ).toBeTruthy()
    })

    it('reads a VERIFIED standing exactly as the card always did', async () => {
      await openWithPid(() => json(200, verifiedRow(standingOf())), {})
      await screen.findByText(i18n.t('console.verification.participant.verifiedId'))

      expect(
        await within(statusLine()).findByText(
          i18n.t('console.verification.participant.submissionStatus.VERIFIED'),
        ),
      ).toBeTruthy()
      expect(participantCard().queryByRole('note')).toBeNull()
      expect(participantCard().queryByText(version(1))).toBeNull()
    })

    it('shows an open re-verification with its earlier verification, approves it as before, and then reads as verified under the current policy', async () => {
      const awaiting = standingOf({
        state: 'AWAITING_REVIEW',
        currentPolicySatisfied: false,
        reverificationRequired: true,
      })
      const approved = standingOf({
        verification: {
          ...EARLIER,
          submissionId: NEW_SUBMISSION_ID,
          submissionVersion: 2,
          policyVersionId: POLICY_V2.id,
          policyVersionNumber: 2,
          verifiedAt: '2026-10-03T09:00:00Z',
        },
      })
      answer({
        ...reads(),
        ...POLICY_IN_FORCE,
        [PID_URL]: [
          () => json(200, reopened(awaiting)),
          () =>
            json(
              200,
              submission({
                id: NEW_SUBMISSION_ID,
                status: 'VERIFIED',
                verifiedPidScheme: '0248',
                verifiedPidValue: 'OM1100000001',
                optimisticLockVersion: 1,
                verificationStanding: approved,
              }),
            ),
        ],
        [NEW_VERIFY_URL]: () =>
          json(200, submission({ id: NEW_SUBMISSION_ID, status: 'VERIFIED' })),
      })
      renderDetail()

      const approve = await screen.findByRole('button', {
        name: i18n.t('console.verification.participant.approve'),
      })
      expect(
        participantCard().getByText(
          i18n.t('console.verification.participant.standingNote.reverificationOpen'),
        ),
      ).toBeTruthy()
      expect(
        participantCard().getByText(i18n.t('console.verification.participant.previousId')),
      ).toBeTruthy()
      expect(
        participantCard()
          .getAllByText('0248:OM1100000001')
          .every((node) => node.getAttribute('dir') === 'ltr'),
      ).toBe(true)
      expect(participantCard().getByText(version(1))).toBeTruthy()
      expect(participantCard().getByText(version(2))).toBeTruthy()
      expect(participantCard().getByText(formatInstant(EARLIER.verifiedAt, 'en'))).toBeTruthy()
      // Safe context only: no operator or tenant user identity reaches the card.
      expect(participantCard().queryByText(/u-tenant-admin|u-registrant|u-operator/)).toBeNull()

      fireEvent.click(approve)
      const reasonInput = document.querySelector<HTMLInputElement>(
        'input[name="participantReasonCode"]',
      )!
      fireEvent.change(reasonInput, { target: { value: 'POLICY_V2_RECHECKED' } })
      fillApproval()
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('console.verification.participant.approveConfirm'),
        }),
      )

      await waitFor(() => expect(callsTo(NEW_VERIFY_URL)).toHaveLength(1))
      expect(JSON.parse(initOf(NEW_VERIFY_URL).body as string)).toEqual({
        expectedOptimisticLockVersion: 0,
        approved: true,
        reasonCode: 'POLICY_V2_RECHECKED',
        evidenceReference: EVIDENCE,
        justification: JUSTIFICATION,
      })
      await waitFor(() => expect(callsTo(PID_URL)).toHaveLength(2))
      // The card shows its loading state while the second read is in flight, so the status line
      // itself is looked up inside the retry, not once before it.
      await waitFor(() =>
        expect(
          within(statusLine()).getByText(
            i18n.t('console.verification.participant.submissionStatus.VERIFIED'),
          ),
        ).toBeTruthy(),
      )
      expect(
        participantCard().queryByText(i18n.t('console.verification.participant.previousId')),
      ).toBeNull()
      expect(participantCard().queryByRole('note')).toBeNull()
    })

    it('keeps the stale-version answer on an open re-verification', async () => {
      await openWithPid(
        () =>
          json(
            200,
            reopened(
              standingOf({
                state: 'AWAITING_REVIEW',
                currentPolicySatisfied: false,
                reverificationRequired: true,
              }),
            ),
          ),
        {
          ...POLICY_IN_FORCE,
          [NEW_VERIFY_URL]: () => coded(409, 'resource-conflict', 'STALE_VERSION'),
        },
      )

      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n.t('console.verification.participant.reject'),
        }),
      )
      const reasonInput = document.querySelector<HTMLInputElement>(
        'input[name="participantReasonCode"]',
      )!
      fireEvent.change(reasonInput, { target: { value: 'MISSING_EVIDENCE' } })
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('console.verification.participant.rejectConfirm'),
        }),
      )

      const dialog = screen.getByRole('dialog')
      expect(
        await within(dialog).findByText(i18n.t('console.verification.participant.conflict')),
      ).toBeTruthy()
      expect(
        within(dialog).getByRole('button', {
          name: i18n.t('console.verification.decision.reload'),
        }),
      ).toBeTruthy()
      expect(JSON.parse(initOf(NEW_VERIFY_URL).body as string)).toEqual({
        expectedOptimisticLockVersion: 0,
        approved: false,
        reasonCode: 'MISSING_EVIDENCE',
      })
    })

    it('notes an earlier verification behind a rejected request', async () => {
      await openWithPid(
        () =>
          json(
            200,
            submission({
              id: NEW_SUBMISSION_ID,
              status: 'REJECTED',
              reasonCode: 'MISSING_EVIDENCE',
              verificationStanding: standingOf({
                state: 'REJECTED',
                currentPolicySatisfied: false,
                reverificationRequired: true,
                reverificationAvailable: true,
              }),
            }),
          ),
        {},
      )

      expect(
        await screen.findByText(
          i18n.t('console.verification.participant.standingNote.rejectedWithPrevious'),
        ),
      ).toBeTruthy()
      expect(
        participantCard().getByText(i18n.t('console.verification.participant.previousId')),
      ).toBeTruthy()
    })
  })
})
