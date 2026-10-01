import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  ReminderInboxItemDto,
  ReminderPreviewDto,
  ReminderRuleDto,
  ReminderSettingsDto,
} from '../../api/expenditure/billReminders'
import { offsetsProblem, ruleChanged } from '../../lib/billReminders'
import { chipOptions, flattenPreview, rulesOn, toggleOffset } from '../../lib/expenditureReminders'
import { ExpenditureRemindersPage, ReminderInbox } from './ExpenditureRemindersPage'

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
  return {
    type,
    offsets: [],
    repeatEveryDays: null,
    escalationOffsets: null,
    recipients: [],
    enabled: false,
    ...over,
  }
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
/** `GET /recurring-bills/recipients`: the names-only list. 404 is a server from before it. */
let rosterStatus: number
let roster: { id: string; displayName: string | null }[]
let savedRules: unknown
let savedSettings: unknown
let inbox: ReminderInboxItemDto[]
let acknowledged: string[]
let preview: ReminderPreviewDto

const inboxCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/bill-reminders/inbox?'))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  rosterStatus = 200
  roster = [{ id: 'u-2', displayName: 'Hafidh Al Balushi' }]
  savedRules = null
  savedSettings = null
  inbox = []
  acknowledged = []
  preview = { date: '2026-09-21', total: 0, groups: [] }
  rules = [
    rule('BEFORE_DUE', { offsets: [7, 2], recipients: ['u-2'], enabled: true }),
    rule('LATE', { offsets: [1], repeatEveryDays: 3, recipients: ['u-2'], enabled: true }),
    rule('DISCOUNT_EXPIRY', { offsets: [3] }),
    rule('APPROVAL_STALE', { offsets: [2], escalationOffsets: [5], enabled: true }),
    rule('MISMATCH_STALE', { offsets: [2] }),
    rule('SCAN_UNCONFIRMED', { offsets: [1] }),
  ]

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
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
    if (url.includes('/bill-reminders/preview')) return json(200, preview)
    if (url.includes('/bill-reminders/inbox') && url.includes('/acknowledge')) {
      acknowledged.push(url.split('/inbox/')[1].split('/')[0])
      inbox = []
      return json(204)
    }
    if (url.includes('/bill-reminders/inbox')) return json(200, inbox)
    if (url.includes('/recurring-bills/recipients')) {
      return rosterStatus === 200
        ? json(200, roster)
        : json(rosterStatus, { type: 'https://api.fawtir.om/problems/resource-not-found' })
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

const card = (title: string) => screen.getByText(title).closest('article')!

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
    expect(
      ruleChanged(
        saved,
        rule('BEFORE_DUE', { offsets: [7], recipients: ['a', 'b'], enabled: true }),
      ),
    ).toBe(false)
    // The server dedupes recipients into a set, so a different order is not a change.
    expect(
      ruleChanged(
        saved,
        rule('BEFORE_DUE', { offsets: [7], recipients: ['b', 'a'], enabled: true }),
      ),
    ).toBe(false)
    // Another day on the ladder is a change.
    expect(
      ruleChanged(
        saved,
        rule('BEFORE_DUE', { offsets: [7, 2], recipients: ['a', 'b'], enabled: true }),
      ),
    ).toBe(true)
    // The same days in another order are not: the server sorts the ladder and answers it
    // ascending, so a chip switched off and on again must not read as something to save.
    const sorted = [
      rule('APPROVAL_STALE', { offsets: [0, 2, 7], escalationOffsets: [5, 7], enabled: true }),
    ]
    expect(
      ruleChanged(
        sorted,
        rule('APPROVAL_STALE', { offsets: [7, 0, 2], escalationOffsets: [7, 5], enabled: true }),
      ),
    ).toBe(false)
    expect(
      ruleChanged(
        sorted,
        rule('APPROVAL_STALE', { offsets: [7, 0, 3], escalationOffsets: [7, 5], enabled: true }),
      ),
    ).toBe(true)
    expect(
      ruleChanged(saved, rule('BEFORE_DUE', { offsets: [7], recipients: ['a'], enabled: true })),
    ).toBe(true)

    // A rule with nothing on it and nothing said is not worth writing on every save.
    expect(ruleChanged([], rule('MISMATCH_STALE'))).toBe(false)
    expect(ruleChanged([], rule('MISMATCH_STALE', { enabled: true }))).toBe(true)
  })

  it('draws the frame chips over the ladder, keeping a saved day the frame does not draw', () => {
    const options = [
      { offset: 7, labelKey: 'a' },
      { offset: 2, labelKey: 'b' },
    ]
    expect(chipOptions(options, [7, 14]).map((option) => option.offset)).toEqual([7, 2, 14])
    expect(toggleOffset([7, 2], 2, true)).toEqual([7])
    expect(toggleOffset([7], 2, true)).toEqual([7, 2])
    expect(toggleOffset([3], 1, false)).toEqual([1])
    expect(toggleOffset([3], 3, false)).toEqual([])
    // Only what can be switched, and is: the recurring row is not a rule and is not counted.
    expect(rulesOn([rule('LATE', { enabled: true }), rule('BEFORE_DUE')])).toBe(1)
    expect(rulesOn([rule('LATE'), rule('BEFORE_DUE')])).toBe(0)
    const lines = flattenPreview({
      date: '2026-09-25',
      total: 2,
      groups: [
        {
          recipientUserId: 'a',
          displayName: 'Yusuf',
          headline: '',
          items: [
            {
              ruleType: 'LATE',
              subjectType: 'BILL',
              subjectId: 'b-1',
              subjectDisplay: null,
              daysFromDue: -9,
              headline: 'Late',
              amount: 1,
              currency: 'OMR',
            },
          ],
        },
        {
          recipientUserId: 'b',
          displayName: 'Hafidh',
          headline: '',
          items: [
            {
              ruleType: 'LATE',
              subjectType: 'BILL',
              subjectId: 'b-1',
              subjectDisplay: null,
              daysFromDue: -9,
              headline: 'Late',
              amount: 1,
              currency: 'OMR',
            },
          ],
        },
      ],
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].recipients).toEqual(['Yusuf', 'Hafidh'])
  })
})

describe('the reminders screen', () => {
  it('shows the six rules it can edit, and the seventh as set per recurring bill', async () => {
    renderPage()
    expect(await screen.findByText('Before a bill is due')).toBeTruthy()
    expect(screen.getByText('Once a bill is late')).toBeTruthy()
    // The seventh is drawn as the frame draws it: a link to where its timing lives, no rule row
    // behind it, since the server refuses one.
    const recurring = card("A recurring bill that hasn't arrived")
    expect(within(recurring).getByText('Set per bill on')).toBeTruthy()
    expect(
      within(recurring).getByRole('link', { name: 'Recurring bills' }).getAttribute('href'),
    ).toBe('/expenditure/recurring-bills')
    // It cannot be switched here, so it has no switch; the six rules keep theirs.
    expect(within(recurring).queryByRole('switch')).toBeNull()
    expect(screen.getAllByRole('switch').filter((node) => node.closest('article'))).toHaveLength(6)
    // Not dimmed like a rule that is off: its link and who it tells stay readable.
    expect(within(recurring).getByText('The person named on each')).toBeTruthy()
    // The three sections of the frame, and its footer.
    expect(screen.getByText('Money leaving')).toBeTruthy()
    expect(screen.getByText('Work sitting still')).toBeTruthy()
    expect(screen.getByText('How you get told')).toBeTruthy()
    // Three rules are on. The recurring row is not one of them and is not counted.
    expect(screen.getByText('3 rules on')).toBeTruthy()
  })

  it('offers a repeat on the late rule alone, and an escalation on the stale-approval rule alone', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    // The server refuses either field on any other type, so neither is drawn there.
    const late = card('Once a bill is late')
    expect(
      within(late).getByRole('button', { name: 'Then every 3 days' }).getAttribute('aria-pressed'),
    ).toBe('true')

    const before = card('Before a bill is due')
    expect(within(before).queryByRole('button', { name: /Then every/ })).toBeNull()
    expect(within(before).queryByText('then the owner after')).toBeNull()

    const approval = card('An approval nobody has answered')
    expect(within(approval).getByText('then the owner after')).toBeTruthy()
    expect(
      within(approval).getByRole('button', { name: '5 days' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(within(approval).queryByRole('button', { name: /Then every/ })).toBeNull()
  })

  it('will not switch on a rule that would fire at nobody', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    const mismatch = card('A mismatch nobody has resolved')
    fireEvent.click(within(mismatch).getByRole('switch'))

    expect(await within(mismatch).findByRole('alert', {}, { timeout: 8000 })).toHaveProperty(
      'textContent',
      'Switching this on needs at least one person to tell',
    )
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty('disabled', true)
  })

  it('switches on a rule that finds its own people without naming anyone', async () => {
    // APPROVAL_STALE and SCAN_UNCONFIRMED derive their recipients, so the guard above must not
    // catch them: a "cannot enable" check that caught everything would pass either way.
    renderPage()
    await screen.findByText('Before a bill is due')

    const scan = card('A scanned receipt still unconfirmed')
    expect(within(scan).getByText('Whoever scanned it')).toBeTruthy()
    fireEvent.click(within(scan).getByRole('switch'))

    expect(within(scan).queryByRole('alert')).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
  })

  it('sends only the changed rules, with their people still on them', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    // A rule that is off has its chips dimmed and still, as the frame draws; the late rule is on.
    const discount = card('Before an early-payment discount runs out')
    expect(
      within(discount).getByRole('button', { name: '3 days before it expires' }),
    ).toHaveProperty('disabled', true)
    const late = card('Once a bill is late')
    fireEvent.click(within(late).getByRole('button', { name: 'Then every 3 days' }))
    // Switching the repeat off is what makes the rule savable, and that lands on a later render.
    const save = screen.getByRole('button', { name: 'Save changes' })
    await waitFor(() => expect(save).toHaveProperty('disabled', false))
    fireEvent.click(save)

    await waitFor(() => expect(savedRules).not.toBeNull())
    const sent = (savedRules as { rules: ReminderRuleDto[] }).rules
    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('LATE')
    expect(sent[0].repeatEveryDays).toBeNull()
    expect(sent[0].recipients).toEqual(['u-2'])
    // Nothing about delivery changed, so nothing about delivery was sent.
    expect(savedSettings).toBeNull()
  })

  it('keeps the people on a rule when it cannot list them', async () => {
    // A server from before the names-only list refuses the read. The rule stays editable and
    // its recipients travel back untouched: saving without them would empty it.
    rosterStatus = 404
    renderPage()
    await screen.findByText('Before a bill is due')

    expect(await screen.findByText(/needs user-admin rights/)).toBeTruthy()
    const before = card('Before a bill is due')
    expect(within(before).getByText('1 person already chosen')).toBeTruthy()

    fireEvent.click(within(before).getByRole('button', { name: 'On the day' }))
    const save = screen.getByRole('button', { name: 'Save changes' })
    await waitFor(() => expect(save).toHaveProperty('disabled', false))
    fireEvent.click(save)

    await waitFor(() => expect(savedRules).not.toBeNull())
    expect((savedRules as { rules: ReminderRuleDto[] }).rules[0].recipients).toEqual(['u-2'])
    expect((savedRules as { rules: ReminderRuleDto[] }).rules[0].offsets).toEqual([7, 2, 0])
  })

  it('lets whoever may save the rules choose who is told, from the names-only list', async () => {
    // A Finance Manager: may save the rules, may not manage users. The people come from the
    // list a recurring bill also picks from, and the admin-only users list is never asked.
    who = {
      ...MANAGER,
      roles: [{ id: 'r-2', code: 'FINANCE_MANAGER', name: 'Finance Manager', systemRole: true }],
    }
    roster = [
      { id: 'u-2', displayName: 'Hafidh Al Balushi' },
      { id: 'u-3', displayName: 'Aisha Al Hinai' },
    ]
    renderPage()
    await screen.findByText('Before a bill is due')
    const before = card('Before a bill is due')

    // The person on the rule by first name, and no line about user-admin rights.
    fireEvent.click(await within(before).findByRole('button', { name: 'Hafidh' }))
    expect(screen.queryByText(/needs user-admin rights/)).toBeNull()
    // Names, and nothing else about anyone.
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Hafidh Al Balushi',
      'Aisha Al Hinai',
    ])
    fireEvent.click(options[1])

    const save = screen.getByRole('button', { name: 'Save changes' })
    await waitFor(() => expect(save).toHaveProperty('disabled', false))
    fireEvent.click(save)
    await waitFor(() => expect(savedRules).not.toBeNull())
    const sent = (savedRules as { rules: ReminderRuleDto[] }).rules
    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('BEFORE_DUE')
    expect(sent[0].recipients).toEqual(['u-3'])

    const asked = fetchMock.mock.calls.map(([url]) => String(url))
    expect(asked.filter((url) => url.includes('/recurring-bills/recipients'))).toHaveLength(1)
    expect(asked.some((url) => url.includes('/v1/users'))).toBe(false)
  })

  it('adds a person to a rule that had nobody, which then can be switched on', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')
    const mismatch = card('A mismatch nobody has resolved')
    fireEvent.click(within(mismatch).getByRole('switch'))
    expect(await within(mismatch).findByRole('alert', {}, { timeout: 8000 })).toBeTruthy()

    fireEvent.click(await within(mismatch).findByRole('button', { name: 'Add another person' }))
    expect(await within(mismatch).findByRole('button', { name: 'Hafidh' })).toBeTruthy()
    await waitFor(() => expect(within(mismatch).queryByRole('alert')).toBeNull())
  })

  it('words a person with no name on file, in the chip and in the list', async () => {
    // The list answers a null name for someone who has entered none: never a username or an
    // address, and never the id.
    roster = [
      { id: 'u-2', displayName: null },
      { id: 'u-3', displayName: 'Aisha Al Hinai' },
    ]
    renderPage()
    await screen.findByText('Before a bill is due')
    const before = card('Before a bill is due')

    fireEvent.click(await within(before).findByRole('button', { name: 'Someone on the team' }))
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Someone on the team',
      'Aisha Al Hinai',
    ])
    expect(screen.queryByText(/u-2/)).toBeNull()

    await i18n.changeLanguage('ar')
    const arabic = (await screen.findByText('قبل استحقاق الفاتورة')).closest('article')!
    expect(await within(arabic).findByRole('button', { name: 'أحد أعضاء الفريق' })).toBeTruthy()
  })

  it('does not ask for the list of people for someone who may only read', async () => {
    who = READER
    renderPage()
    await screen.findByText('Before a bill is due')
    // The people on a rule are counted, not named, and no list is read.
    expect(within(card('Before a bill is due')).getByText('1 person already chosen')).toBeTruthy()
    const asked = fetchMock.mock.calls.map(([url]) => String(url))
    expect(asked.some((url) => url.includes('/recurring-bills/recipients'))).toBe(false)
    expect(asked.some((url) => url.includes('/v1/users'))).toBe(false)
  })

  it('saves how the reader is told with the same Save', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(
      () =>
        expect(savedSettings).toMatchObject({
          delivery: 'IN_APP',
          digestTime: '08:00',
          skipWeekends: true,
        }),
      { timeout: 8000 },
    )
    expect(savedRules).toBeNull()
  })

  it('shows what today would send, naming everyone a thing goes to', async () => {
    preview = {
      date: '2026-09-25',
      total: 2,
      groups: [
        {
          recipientUserId: 'u-2',
          displayName: 'Yusuf Al Balushi',
          headline: 'x',
          items: [
            {
              ruleType: 'LATE',
              subjectType: 'BILL',
              subjectId: 'b-1',
              subjectDisplay: null,
              daysFromDue: -9,
              headline: 'Al Noor Dates unpaid for 9 days',
              amount: 411.5,
              currency: 'OMR',
            },
          ],
        },
        {
          recipientUserId: 'u-3',
          displayName: 'Hafidh Saif',
          headline: 'x',
          items: [
            {
              ruleType: 'LATE',
              subjectType: 'BILL',
              subjectId: 'b-1',
              subjectDisplay: null,
              daysFromDue: -9,
              headline: 'Al Noor Dates unpaid for 9 days',
              amount: 411.5,
              currency: 'OMR',
            },
          ],
        },
      ],
    }
    renderPage()
    expect(await screen.findByText('Al Noor Dates unpaid for 9 days')).toBeTruthy()
    expect(screen.getByText('One email · 08:00 · to Yusuf and Hafidh')).toBeTruthy()
    expect(screen.getByText('1 thing needs attention this morning.')).toBeTruthy()
  })

  it('acknowledges a reminder addressed to the reader, then reads the inbox again', async () => {
    // The frame keeps the reader's reminders on the bell, so the inbox is not on the page; its
    // read and its acknowledge are kept for the bell and are exercised here on their own.
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
    render(
      <MemoryRouter>
        <ReminderInbox />
      </MemoryRouter>,
    )
    expect(await screen.findByText('ME-991 is 3 days late')).toBeTruthy()

    // The default is unread only, because the bell's count is what brings someone here.
    expect(inboxCalls().at(-1)).toContain('unread=true')

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    await waitFor(() => expect(acknowledged).toEqual(['i-1']))
    // Read again rather than crossed off locally: the server decides what is still unread.
    await waitFor(() => expect(inboxCalls().length).toBeGreaterThan(1))
  })

  it('does not draw "Send me today\'s now", which nothing behind it can do', async () => {
    // No route sends today's summary on request. What cannot be done is not shown, to a manager
    // as much as to a reader, and the footer keeps its count and its Save.
    renderPage()
    await screen.findByText('Before a bill is due')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: "Send me today's now" })).toBeNull()
    expect(screen.queryByText("Send me today's now")).toBeNull()
    expect(screen.queryByText(/Not available yet/)).toBeNull()

    await i18n.changeLanguage('ar')
    expect(await screen.findByRole('button', { name: 'حفظ التغييرات' })).toBeTruthy()
    expect(screen.queryByText('أرسل لي ملخص اليوم الآن')).toBeNull()
  })

  it('offers no save to someone who may only read', async () => {
    who = READER
    renderPage()
    await screen.findByText('Before a bill is due')
    // The recurring row has no switch for a reader either; the six rules show theirs, greyed.
    expect(within(card("A recurring bill that hasn't arrived")).queryByRole('switch')).toBeNull()
    expect(within(card('Before a bill is due')).getByRole('switch')).toHaveProperty(
      'disabled',
      true,
    )
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    expect(screen.queryByRole('button', { name: "Send me today's now" })).toBeNull()
  })
})
