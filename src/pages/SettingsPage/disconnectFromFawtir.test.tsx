import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { DisconnectFromFawtirSection } from './DisconnectFromFawtirSection'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  tenantName: 'Real Trading',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.settings.manage'],
  scopes: [],
  featureFlags: {},
}
/** A custom role given the settings permission: the server still refuses it (LV-1). */
const CUSTOM: Entitlements = {
  ...ADMIN,
  roles: [{ id: 'r-2', code: 'OFFICE_MANAGER', name: 'Office manager', systemRole: false }],
}
const READER: Entitlements = { ...ADMIN, permissions: ['invoice.read'] }

const PATH = '/api/v1/settings/fawtir-disconnection'
const WITHDRAWAL = `${PATH}/withdrawal`

const NONE = { companyName: 'Real Trading LLC', connected: true, canRequest: true, canWithdraw: false, request: null }

const request = (extra: Record<string, unknown>) => ({
  path: 'ASK_FAWTIR',
  status: 'REQUESTED',
  origin: 'CUSTOMER',
  askedVia: null,
  requestedAt: '2026-10-12T06:00:00Z',
  portalRequestRaisedAt: null,
  approvalDueAt: null,
  approvalExpired: false,
  disconnectedAt: null,
  smpRemovedAt: null,
  notCompletedReason: null,
  closedAt: null,
  subscriptionEndsOn: null,
  steps: [
    { step: 'REQUESTED', statusAfter: 'REQUESTED', occurredAt: '2026-10-12T06:00:00Z', recordedAt: '2026-10-12T06:00:00Z', actorType: 'CUSTOMER' },
  ],
  ...extra,
})

const WAITING = {
  ...NONE,
  canRequest: false,
  canWithdraw: true,
  request: request({
    status: 'WAITING_FOR_CUSTOMER_APPROVAL',
    portalRequestRaisedAt: '2026-10-13T05:00:00Z',
    approvalDueAt: '2026-10-16T05:00:00Z',
    steps: [
      { step: 'REQUESTED', statusAfter: 'REQUESTED', occurredAt: '2026-10-12T06:00:00Z', recordedAt: '2026-10-12T06:00:00Z', actorType: 'CUSTOMER' },
      { step: 'PORTAL_REQUEST_RAISED', statusAfter: 'WAITING_FOR_CUSTOMER_APPROVAL', occurredAt: '2026-10-13T05:00:00Z', recordedAt: '2026-10-13T05:10:00Z', actorType: 'OPERATOR' },
    ],
  }),
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let who: Entitlements
let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  who = ADMIN
  answers = { [PATH]: () => json(200, NONE) }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, who)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderSection() {
  return render(
    <MemoryRouter>
      <DisconnectFromFawtirSection />
    </MemoryRouter>,
  )
}

function zone() {
  return screen.getByRole('region', { name: i18n.t('fawtirDisconnection.dangerZone') })
}

function writes() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')
}

function reads(path: string) {
  return fetchMock.mock.calls.filter(([url, init]) => url === path && (!init?.method || init.method === 'GET'))
}

describe('Settings › Company profile: Disconnect from Fawtir', () => {
  it('is shown only to the owner or an Administrator, and nothing is read for anyone else (LV-1)', async () => {
    for (const person of [CUSTOM, READER]) {
      forgetEntitlements()
      resetSharedRequests()
      who = person
      const { unmount } = renderSection()
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/entitlements', expect.anything()))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(screen.queryByRole('region', { name: i18n.t('fawtirDisconnection.dangerZone') })).toBeNull()
      unmount()
    }
    expect(reads(PATH)).toHaveLength(0)
  })

  it('asks the question first, warns before confirming, and confirms with the typed company name (LV-1, LV-3, LV-5)', async () => {
    const user = userEvent.setup()
    answers[`POST ${PATH}`] = () =>
      json(200, { requestNeeded: true, disconnection: { ...NONE, canRequest: false, canWithdraw: true, request: request({}) } })
    renderSection()
    await user.click(await within(await screen.findByRole('region')).findByRole('button', { name: i18n.t('fawtirDisconnection.start') }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(i18n.t('fawtirDisconnection.dialog.question'))).toBeTruthy()
    // Nothing to confirm until the question is answered.
    expect(within(dialog).queryByRole('button', { name: i18n.t('fawtirDisconnection.dialog.confirm.ASK_FAWTIR') })).toBeNull()

    await user.click(within(dialog).getByLabelText(new RegExp(i18n.t('fawtirDisconnection.answer.ASK_FAWTIR.title').replace(/[.?]/g, '\\$&'))))
    for (const key of ['nothingSent', 'legalDuty', 'records', 'subscription', 'withdraw']) {
      expect(within(dialog).getByText(i18n.t(`fawtirDisconnection.dialog.warning.${key}`))).toBeTruthy()
    }
    expect(within(dialog).getByText(i18n.t('fawtirDisconnection.dialog.path.ASK_FAWTIR'))).toBeTruthy()

    const confirm = within(dialog).getByRole('button', { name: i18n.t('fawtirDisconnection.dialog.confirm.ASK_FAWTIR') })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    await user.type(
      within(dialog).getByLabelText(i18n.t('fawtirDisconnection.dialog.typeName', { name: 'Real Trading LLC' })),
      '  Real Trading LLC ',
    )
    await user.click(confirm)

    await waitFor(() => expect(writes()).toHaveLength(1))
    const [url, init] = writes()[0]
    expect(url).toBe(PATH)
    expect(JSON.parse(init.body as string)).toEqual({ answer: 'ASK_FAWTIR', companyNameConfirmation: 'Real Trading LLC' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(zone()).getAllByText(i18n.t('fawtirDisconnection.status.REQUESTED'))).toHaveLength(2)
    expect(within(zone()).getByRole('status').textContent).toBe(
      i18n.t('fawtirDisconnection.line.askReceived', { date: '12 Oct 2026' }),
    )
    expect(within(zone()).getByRole('button', { name: i18n.t('fawtirDisconnection.withdraw') })).toBeTruthy()
  })

  it('tells a yearly customer the whole months left go for a refund review, in English and Arabic (LV-6, E31)', async () => {
    const user = userEvent.setup()
    answers[PATH] = () => json(200, { ...NONE, yearlyRefundReview: true })
    renderSection()
    await user.click(await screen.findByRole('button', { name: i18n.t('fawtirDisconnection.start') }))
    let dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText(new RegExp(i18n.t('fawtirDisconnection.answer.ASK_FAWTIR.title').replace(/[.?]/g, '\\$&'))))
    expect(
      within(dialog).getByText(
        'You pay yearly, so Fawtir will review a refund of the whole months left after the month the disconnection takes effect in. Until the refund is decided, your subscription runs to the end of the period already paid. Once it is refunded, access ends at the end of the last month not refunded.',
      ),
    ).toBeTruthy()
    expect(dialog.textContent).not.toContain('The remaining days are not refunded')

    await user.click(within(dialog).getByRole('button', { name: i18n.t('fawtirDisconnection.dialog.back') }))
    await i18n.changeLanguage('ar')
    await user.click(await screen.findByRole('button', { name: i18n.t('fawtirDisconnection.start') }))
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText(new RegExp(i18n.t('fawtirDisconnection.answer.ASK_FAWTIR.title').replace(/[.?؟]/g, '\\$&'))))
    expect(
      within(dialog).getByText(
        'اشتراكك سنوي، لذا سيراجع فوتر استرداد الأشهر الكاملة المتبقية بعد الشهر الذي يتم فيه الفصل. حتى يُبتّ في الاسترداد يستمر اشتراكك حتى نهاية الفترة المدفوعة، وعند الاسترداد ينتهي الوصول بنهاية آخر شهر لم يُسترد.',
      ),
    ).toBeTruthy()
  })

  it('keeps the no-refund line for a monthly customer or a server older than the field', async () => {
    const user = userEvent.setup()
    answers[PATH] = () => json(200, { ...NONE, yearlyRefundReview: false })
    renderSection()
    await user.click(await screen.findByRole('button', { name: i18n.t('fawtirDisconnection.start') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText(new RegExp(i18n.t('fawtirDisconnection.answer.ASK_FAWTIR.title').replace(/[.?]/g, '\\$&'))))
    expect(dialog.textContent).toContain('The remaining days are not refunded')
    expect(dialog.textContent).not.toContain('refund of the whole months left')
  })

  it('says a move to another provider needs nothing in Fawtir, and sends nothing (LV-4)', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByRole('button', { name: i18n.t('fawtirDisconnection.start') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText(new RegExp(i18n.t('fawtirDisconnection.answer.MOVING_TO_ANOTHER_PROVIDER.title').replace(/[.?']/g, '\\$&'))))
    expect(within(dialog).getByRole('status').textContent).toBe(i18n.t('fawtirDisconnection.dialog.movingNote'))
    expect(within(dialog).queryByRole('textbox')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: i18n.t('fawtirDisconnection.dialog.close') }))
    expect(writes()).toHaveLength(0)
  })

  it('keeps the button off until the whole company name is typed, in any case (E30)', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByRole('button', { name: i18n.t('fawtirDisconnection.start') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText(new RegExp(i18n.t('fawtirDisconnection.answer.ASK_FAWTIR.title').replace(/[.?]/g, '\\$&'))))
    const confirm = within(dialog).getByRole('button', { name: i18n.t('fawtirDisconnection.dialog.confirm.ASK_FAWTIR') }) as HTMLButtonElement
    const field = within(dialog).getByRole('textbox')
    await user.type(field, 'Real Trading')
    expect(confirm.disabled).toBe(true)
    await user.clear(field)
    await user.type(field, 'Someone Else LLC')
    expect(confirm.disabled).toBe(true)
    await user.clear(field)
    await user.type(field, 'real  trading llc')
    expect(confirm.disabled).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  describe('with the Arabic legal name on the view (owner, 23 Oct)', () => {
    const AR_NAME = 'شركة التجارة الحقيقية'
    const openAskDialog = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('button', { name: i18n.t('fawtirDisconnection.start') }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByLabelText(new RegExp(i18n.t('fawtirDisconnection.answer.ASK_FAWTIR.title').replace(/[.?]/g, '\\$&'))))
      const confirm = within(dialog).getByRole('button', { name: i18n.t('fawtirDisconnection.dialog.confirm.ASK_FAWTIR') }) as HTMLButtonElement
      return { dialog, confirm, field: within(dialog).getByRole('textbox') }
    }

    it('opens the button for the Arabic name as well as the English one, and sends what was typed', async () => {
      const user = userEvent.setup()
      answers[PATH] = () => json(200, { ...NONE, companyNameAr: AR_NAME })
      answers[`POST ${PATH}`] = () => json(200, { requestNeeded: true, disconnection: NONE })
      renderSection()
      const { confirm, field } = await openAskDialog(user)
      await user.type(field, 'Real Trading LLC')
      expect(confirm.disabled).toBe(false)
      await user.clear(field)
      await user.type(field, 'شركة')
      expect(confirm.disabled).toBe(true)
      await user.clear(field)
      await user.type(field, ` ${AR_NAME} `)
      expect(confirm.disabled).toBe(false)
      await user.click(confirm)
      await vi.waitFor(() => expect(writes()).toHaveLength(1))
      const [, init] = writes()[0]
      expect(JSON.parse((init as RequestInit).body as string).companyNameConfirmation).toBe(AR_NAME)
    })

    it('asks for the English name in English and the Arabic name in Arabic', async () => {
      const user = userEvent.setup()
      answers[PATH] = () => json(200, { ...NONE, companyNameAr: AR_NAME })
      renderSection()
      let { dialog } = await openAskDialog(user)
      expect(within(dialog).getByLabelText(i18n.t('fawtirDisconnection.dialog.typeName', { name: 'Real Trading LLC' }))).toBeTruthy()
      cleanup()
      await i18n.changeLanguage('ar')
      renderSection()
      ;({ dialog } = await openAskDialog(user))
      expect(within(dialog).getByLabelText(i18n.t('fawtirDisconnection.dialog.typeName', { name: AR_NAME }))).toBeTruthy()
      expect(within(dialog).queryByLabelText(i18n.t('fawtirDisconnection.dialog.typeName', { name: 'Real Trading LLC' }))).toBeNull()
    })

    it('asks for the English name in Arabic, and takes only it, when the server sends no Arabic name', async () => {
      const user = userEvent.setup()
      await i18n.changeLanguage('ar')
      renderSection()
      const { dialog, confirm, field } = await openAskDialog(user)
      expect(within(dialog).getByLabelText(i18n.t('fawtirDisconnection.dialog.typeName', { name: 'Real Trading LLC' }))).toBeTruthy()
      await user.type(field, AR_NAME)
      expect(confirm.disabled).toBe(true)
      await user.clear(field)
      await user.type(field, 'Real Trading LLC')
      expect(confirm.disabled).toBe(false)
    })
  })

  it('shows a refused name in the field and keeps the dialog open', async () => {
    const user = userEvent.setup()
    // The name changed elsewhere meanwhile: the server's own check refuses it.
    answers[`POST ${PATH}`] = () => json(400, { type: 'about:blank', status: 400, detail: 'The name typed is not this company\'s name' })
    renderSection()
    await user.click(await screen.findByRole('button', { name: i18n.t('fawtirDisconnection.start') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText(/already disconnected/))
    await user.type(within(dialog).getByRole('textbox'), 'Real Trading LLC')
    await user.click(within(dialog).getByRole('button', { name: i18n.t('fawtirDisconnection.dialog.confirm.ALREADY_DISCONNECTED') }))
    expect(await within(dialog).findByText(i18n.t('fawtirDisconnection.error.nameMismatch'))).toBeTruthy()
    expect(dialog.textContent).not.toMatch(/The name typed/)
  })

  it('words the owner-only refusal instead of showing the server text', async () => {
    const user = userEvent.setup()
    answers[`POST ${PATH}`] = () => json(403, { type: 'https://api.fawtir.om/problems/admin-authority-required', status: 403 })
    renderSection()
    await user.click(await screen.findByRole('button', { name: i18n.t('fawtirDisconnection.start') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText(/already disconnected/))
    await user.type(within(dialog).getByRole('textbox'), 'Real Trading LLC')
    await user.click(within(dialog).getByRole('button', { name: i18n.t('fawtirDisconnection.dialog.confirm.ALREADY_DISCONNECTED') }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe(i18n.t('fawtirDisconnection.error.notOwner'))
  })

  it('shows the approval deadline and each step with its date, and withdraws the request (LV-4, LV-7)', async () => {
    const user = userEvent.setup()
    answers[PATH] = () => json(200, WAITING)
    answers[`POST ${WITHDRAWAL}`] = () =>
      json(200, {
        ...NONE,
        request: request({
          status: 'WITHDRAWN',
          closedAt: '2026-10-14T08:00:00Z',
          steps: [
            ...WAITING.request.steps,
            { step: 'WITHDRAWN', statusAfter: 'WITHDRAWN', occurredAt: '2026-10-14T08:00:00Z', recordedAt: '2026-10-14T08:00:00Z', actorType: 'CUSTOMER' },
          ],
        }),
      })
    renderSection()
    expect(await screen.findByText(i18n.t('fawtirDisconnection.status.WAITING_FOR_CUSTOMER_APPROVAL'))).toBeTruthy()
    expect(within(zone()).getByRole('status').textContent).toBe(
      i18n.t('fawtirDisconnection.line.approveByDate', { date: '16 Oct 2026' }),
    )
    const steps = within(zone()).getAllByRole('listitem')
    expect(steps.map((row) => row.textContent)).toEqual([
      `${i18n.t('fawtirDisconnection.step.REQUESTED')}12 Oct 2026`,
      `${i18n.t('fawtirDisconnection.step.PORTAL_REQUEST_RAISED')}13 Oct 2026`,
    ])
    expect(within(zone()).queryByRole('button', { name: i18n.t('fawtirDisconnection.requestAgain') })).toBeNull()

    await user.click(within(zone()).getByRole('button', { name: i18n.t('fawtirDisconnection.withdraw') }))
    await waitFor(() => expect(writes().map(([url]) => url)).toEqual([WITHDRAWAL]))
    expect(await within(zone()).findByText(i18n.t('fawtirDisconnection.line.withdrawn'))).toBeTruthy()
    expect(within(zone()).getByRole('button', { name: i18n.t('fawtirDisconnection.requestAgain') })).toBeTruthy()
  })

  it('reads a waiting request whose 3 days have run out as not completed, and offers to ask again (FC-4)', async () => {
    answers[PATH] = () =>
      json(200, { ...WAITING, canRequest: true, canWithdraw: false, request: { ...WAITING.request, approvalExpired: true } })
    renderSection()
    expect(await screen.findByText(i18n.t('fawtirDisconnection.status.NOT_COMPLETED'))).toBeTruthy()
    expect(within(zone()).getByRole('status').textContent).toBe(i18n.t('fawtirDisconnection.line.notCompleted'))
    expect(within(zone()).queryByRole('button', { name: i18n.t('fawtirDisconnection.withdraw') })).toBeNull()
    expect(within(zone()).getByRole('button', { name: i18n.t('fawtirDisconnection.requestAgain') })).toBeTruthy()
  })

  it('after a completed disconnection says when the subscription ends, with no refund, and offers nothing (LV-6)', async () => {
    answers[PATH] = () =>
      json(200, {
        ...NONE,
        connected: false,
        canRequest: false,
        request: request({
          path: 'ALREADY_DISCONNECTED',
          status: 'DISCONNECTED',
          origin: 'CONSOLE',
          askedVia: 'CALL',
          disconnectedAt: '2026-10-13T09:00:00Z',
          subscriptionEndsOn: '2026-11-08',
        }),
      })
    renderSection()
    expect(await screen.findByText(i18n.t('fawtirDisconnection.line.disconnected', { date: '13 Oct 2026' }))).toBeTruthy()
    expect(within(zone()).getByText(i18n.t('fawtirDisconnection.after.subscription', { date: '8 Nov 2026' }))).toBeTruthy()
    expect(within(zone()).getByText(i18n.t('fawtirDisconnection.onYourBehalfCall'))).toBeTruthy()
    expect(within(zone()).queryAllByRole('button')).toHaveLength(0)
  })

  it('has every string in Arabic', async () => {
    await i18n.changeLanguage('ar')
    answers[PATH] = () => json(200, WAITING)
    renderSection()
    expect(await screen.findByText(i18n.t('fawtirDisconnection.status.WAITING_FOR_CUSTOMER_APPROVAL'))).toBeTruthy()
    expect(zone().textContent).not.toMatch(/fawtirDisconnection\.|[A-Z]{2,}_[A-Z]/)
    expect(zone().textContent).toMatch(/منطقة الخطر/)
  })
})
