import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ReminderInboxItemDto, ReminderRuleDto, ReminderSettingsDto } from '../../api/expenditure/billReminders'
import { offsetsProblem, ruleChanged } from '../../lib/billReminders'
import { ExpenditureRemindersPage } from './ExpenditureRemindersPage'

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage'],
  scopes: [],
  featureFlags: {},
}

const READER: Entitlements = { ...MANAGER, permissions: ['invoice.read'] }

const SETTINGS: ReminderSettingsDto = {
  delivery: 'DAILY_DIGEST',
  digestTime: '08:00',
  skipWeekends: true,
  stopWhenInRun: true,
}

function rule(type: ReminderRuleDto['type'], over: Partial<ReminderRuleDto> = {}): ReminderRuleDto {
  return { type, offsets: [], repeatEveryDays: null, escalationOffsets: null, recipients: [], enabled: false, ...over }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let rules: ReminderRuleDto[]
let usersStatus: number
let savedRules: unknown
let savedSettings: unknown
let inbox: ReminderInboxItemDto[]
let acknowledged: string[]

const inboxCalls = () =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/bill-reminders/inbox?'))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  usersStatus = 200
  savedRules = null
  savedSettings = null
  inbox = []
  acknowledged = []
  rules = [
    rule('BEFORE_DUE', { offsets: [7, 2], recipients: ['u-2'], enabled: true }),
    rule('LATE', { offsets: [1], repeatEveryDays: 3, recipients: ['u-2'], enabled: true }),
    rule('DISCOUNT_EXPIRY', { offsets: [3] }),
    rule('APPROVAL_STALE', { offsets: [2], escalationOffsets: [5], enabled: true }),
    rule('MISMATCH_STALE', { offsets: [2] }),
    rule('SCAN_UNCONFIRMED', { offsets: [1] }),
  ]

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.includes('/me/entitlements')) return json(200, who)
    if (url.includes('/bill-reminders/rules')) {
      if (init?.method === 'PUT') {
        savedRules = JSON.parse(String(init.body))
        return json(200, { rules })
      }
      return json(200, { rules })
    }
    if (url.includes('/bill-reminders/settings')) {
      if (init?.method === 'PUT') {
        savedSettings = JSON.parse(String(init.body))
        return json(200, SETTINGS)
      }
      return json(200, SETTINGS)
    }
    if (url.includes('/bill-reminders/preview')) return json(200, { date: '2026-09-21', total: 0, groups: [] })
    if (url.includes('/bill-reminders/inbox') && url.includes('/acknowledge')) {
      acknowledged.push(url.split('/inbox/')[1].split('/')[0])
      inbox = []
      return json(204)
    }
    if (url.includes('/bill-reminders/inbox')) return json(200, inbox)
    if (url.includes('/v1/users')) {
      return usersStatus === 200
        ? json(200, { content: [{ id: 'u-2', username: 'hafidh', firstName: 'Hafidh', lastName: 'Al Balushi' }] })
        : json(403, { type: 'https://api.fawtir.om/problems/forbidden' })
    }
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/expenditure/reminders']}>
      <Routes>
        <Route path="/expenditure/reminders" element={<ExpenditureRemindersPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('payables reminder rules', () => {
  it('refuses what the server would, before a save is spent learning it', () => {
    expect(offsetsProblem([1, 2, 3])).toBeNull()
    expect(offsetsProblem(Array.from({ length: 11 }, (_, i) => i))).toBe('tooMany')
    expect(offsetsProblem([400])).toBe('outOfRange')
    expect(offsetsProblem([-1])).toBe('outOfRange')
    expect(offsetsProblem([2, 2])).toBe('repeated')
    expect(offsetsProblem([1.5])).toBe('notWhole')
  })

  it('sends only what changed, and counts a recipient set as a set', () => {
    const saved = [rule('BEFORE_DUE', { offsets: [7], recipients: ['a', 'b'], enabled: true })]
    expect(ruleChanged(saved, rule('BEFORE_DUE', { offsets: [7], recipients: ['a', 'b'], enabled: true }))).toBe(false)
    // The server dedupes recipients into a set, so a different order is not a change.
    expect(ruleChanged(saved, rule('BEFORE_DUE', { offsets: [7], recipients: ['b', 'a'], enabled: true }))).toBe(false)
    // The ladder is stored as given, so its order IS a change.
    expect(ruleChanged(saved, rule('BEFORE_DUE', { offsets: [7, 2], recipients: ['a', 'b'], enabled: true }))).toBe(true)
    expect(ruleChanged(saved, rule('BEFORE_DUE', { offsets: [7], recipients: ['a'], enabled: true }))).toBe(true)

    // A rule with nothing on it and nothing said is not worth writing on every save.
    expect(ruleChanged([], rule('MISMATCH_STALE'))).toBe(false)
    expect(ruleChanged([], rule('MISMATCH_STALE', { enabled: true }))).toBe(true)
  })
})

describe('the reminders screen', () => {
  it('shows the six rules it can edit, and says where the seventh lives', async () => {
    renderPage()
    expect(await screen.findByText('Before a bill is due')).toBeTruthy()
    expect(screen.getByText('Once a bill is late')).toBeTruthy()
    // The seventh is named but not offered as a rule: it is configured per recurring instruction
    // and the server refuses a row for it.
    expect(screen.getByText(/set on each recurring bill rather than here/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'open a recurring bill' })).toBeTruthy()
  })

  it('offers a repeat on the late rule alone, and an escalation on the stale-approval rule alone', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    // The server refuses either field on any other type, so neither is drawn there. The repeat
    // is a label wrapping its own input, so it is found by that input rather than by loose text.
    const late = screen.getByText('Once a bill is late').closest('article')!
    expect(within(late).getByLabelText(/Then every/)).toBeTruthy()

    const before = screen.getByText('Before a bill is due').closest('article')!
    expect(within(before).queryByLabelText(/Then every/)).toBeNull()
    expect(within(before).queryByText('Bring in the owners after')).toBeNull()

    const approval = screen.getByText('An approval nobody has answered').closest('article')!
    expect(within(approval).getByText('Bring in the owners after')).toBeTruthy()
    expect(within(approval).queryByLabelText(/Then every/)).toBeNull()
  })

  it('will not switch on a rule that would fire at nobody', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    const mismatch = screen.getByText('A mismatch nobody has resolved').closest('article')!
    fireEvent.click(within(mismatch).getByRole('checkbox', { name: /Off|On/ }))

    expect(await within(mismatch).findByRole('alert')).toHaveProperty(
      'textContent',
      'Switching this on needs at least one person to tell',
    )
    expect(screen.getByRole('button', { name: 'Save the rules' })).toHaveProperty('disabled', true)
  })

  it('switches on a rule that finds its own people without naming anyone', async () => {
    // APPROVAL_STALE and SCAN_UNCONFIRMED derive their recipients, so the guard above must not
    // catch them — a "cannot enable" check that caught everything would pass either way.
    renderPage()
    await screen.findByText('Before a bill is due')

    const scan = screen.getByText('A scanned receipt still unconfirmed').closest('article')!
    expect(within(scan).getByText(/Whoever uploaded it/)).toBeTruthy()
    fireEvent.click(within(scan).getByRole('checkbox', { name: /Off|On/ }))

    expect(within(scan).queryByRole('alert')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save the rules' })).toHaveProperty('disabled', false))
  })

  it('sends only the changed rules, with their people still on them', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    const discount = screen.getByText('Before an early-payment discount runs out').closest('article')!
    fireEvent.click(within(discount).getByRole('button', { name: 'Add a day' }))
    // Adding a day is what makes the rule savable, and that lands on a later render. Clicking
    // before it does is a click on a disabled button -- a no-op the assertion below would then
    // blame on the request.
    const save = screen.getByRole('button', { name: 'Save the rules' })
    await waitFor(() => expect(save).toHaveProperty('disabled', false))
    fireEvent.click(save)

    await waitFor(() => expect(savedRules).not.toBeNull())
    const sent = (savedRules as { rules: ReminderRuleDto[] }).rules
    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('DISCOUNT_EXPIRY')
  })

  it('keeps the people on a rule when it cannot list them', async () => {
    // GET /users needs admin.users.manage, which this reader may not hold. The rule stays
    // editable and its recipients travel back untouched -- saving without them would empty it.
    usersStatus = 403
    renderPage()
    await screen.findByText('Before a bill is due')

    expect(await screen.findByText(/needs user-admin rights/)).toBeTruthy()
    const before = screen.getByText('Before a bill is due').closest('article')!
    expect(within(before).getByText('1 person already chosen')).toBeTruthy()

    fireEvent.click(within(before).getByRole('button', { name: 'Add a day' }))
    const save = screen.getByRole('button', { name: 'Save the rules' })
    await waitFor(() => expect(save).toHaveProperty('disabled', false))
    fireEvent.click(save)

    await waitFor(() => expect(savedRules).not.toBeNull())
    expect((savedRules as { rules: ReminderRuleDto[] }).rules[0].recipients).toEqual(['u-2'])
  })

  it('saves how the reader is told', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    fireEvent.click(screen.getByRole('radio', { name: /In Fawtir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save how you are told' }))

    await waitFor(() => expect(savedSettings).toMatchObject({ delivery: 'IN_APP', digestTime: '08:00', skipWeekends: true }))
  })

  it('acknowledges a reminder addressed to the reader, then reads the inbox again', async () => {
    inbox = [
      {
        id: 'i-1',
        ruleType: 'LATE',
        subjectType: 'BILL',
        subjectId: 'b-2',
        billId: 'b-2',
        daysFromDue: -3,
        firedOn: '2026-09-20',
        headline: 'ME-991 is 3 days late',
        outcome: 'SENT',
        createdAt: '2026-09-20T04:00:00Z',
        acknowledgedAt: null,
      },
    ]
    renderPage()
    expect(await screen.findByText('ME-991 is 3 days late')).toBeTruthy()

    // The default is unread only, because the bell's count is what brings someone here.
    expect(inboxCalls().at(-1)).toContain('unread=true')

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    await waitFor(() => expect(acknowledged).toEqual(['i-1']))
    // Read again rather than crossed off locally: the server decides what is still unread.
    await waitFor(() => expect(inboxCalls().length).toBeGreaterThan(1))
  })

  it('offers no save to someone who may only read', async () => {
    who = READER
    renderPage()
    await screen.findByText('Before a bill is due')
    expect(screen.queryByRole('button', { name: 'Save the rules' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save how you are told' })).toBeNull()
  })
})
