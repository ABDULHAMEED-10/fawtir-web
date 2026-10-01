import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  ReminderPreviewDto,
  ReminderRuleDto,
  ReminderSettingsDto,
} from '../../api/expenditure/billReminders'
import REQUEST_FIELDS from '../../api/expenditure/billReminders.requestFields.json'
import {
  RULES_REQUEST_FIELDS,
  RULE_REQUEST_FIELDS,
  SETTINGS_IGNORED_FIELDS,
  SETTINGS_REQUEST_FIELDS,
  defaultRules,
  defaultSettings,
  saveRules,
  saveSettings,
  settingsAnswer,
  type MockReminderRule,
  type MockReminderSettings,
} from '../../../tools/mock-api/lib/billReminderRules.mjs'
import { ExpenditureRemindersPage } from './ExpenditureRemindersPage'

/**
 * The Reminders page against the server as it really answers.
 *
 * The neighbouring file stubs a server that takes any body and never refuses. This one answers
 * with the mock API's own checks (`tools/mock-api/lib/billReminderRules.mjs`), which follow
 * `BillReminderController` and `ReminderRule`: a field the record does not declare is refused,
 * days come back sorted, a rule the domain refuses is a 400. Both refusal shapes are covered: the
 * plain validation failure the controller sent before it kept the code, and the Expenditure
 * refusal with the code in `error`, so the page behaves with either backend.
 */

const RULES_PUT = REQUEST_FIELDS['PUT /v1/bill-reminders/rules']
const SETTINGS_PUT = REQUEST_FIELDS['PUT /v1/bill-reminders/settings']

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'invoice.payment.manage'],
  scopes: [],
  featureFlags: {},
}

const HAFIDH = '5c2f6f0e-6f0b-4b7e-9d0a-0b1f3a2c4d5e'
const GONE = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let onFile: MockReminderRule[]
let settingsOnFile: MockReminderSettings
let refusals: 'coded' | 'legacy'
/** A refusal the page cannot provoke by itself: someone else changed the rules meanwhile. */
let forced: { status: number; body: Record<string, unknown> } | null
let rulesBodies: Record<string, unknown>[]
let settingsBodies: Record<string, unknown>[]
let preview: ReminderPreviewDto
/** Fields on each rule the server answers that `RuleRequest` does not declare. */
let extraOnRead: Record<string, unknown>

const rulesReads = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).includes('/bill-reminders/rules') && (init as RequestInit)?.method !== 'PUT',
  ).length

/** One rule on file as the server would store it: through its own save. */
function seed(rule: Partial<MockReminderRule> & { type: string }) {
  const base = defaultRules().find((entry) => entry.type === rule.type)!
  const answer = saveRules(onFile, { rules: [{ ...base, ...rule }] })
  if (!answer.rules) throw new Error(`seed refused: ${JSON.stringify(answer.body)}`)
  onFile = answer.rules
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  onFile = defaultRules()
  settingsOnFile = defaultSettings()
  refusals = 'coded'
  forced = null
  rulesBodies = []
  settingsBodies = []
  extraOnRead = {}
  preview = { date: '2026-10-01', total: 0, groups: [] }

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.includes('/me/entitlements')) return json(200, MANAGER)
    if (url.includes('/bill-reminders/rules')) {
      // `revision` stands for any field the answer may gain that the request record lacks.
      if (init?.method !== 'PUT')
        return json(200, { rules: onFile.map((rule) => ({ ...rule, ...extraOnRead })) })
      const body = JSON.parse(String(init.body))
      rulesBodies.push(body)
      if (forced) return json(forced.status, forced.body)
      const answer = saveRules(onFile, body, { refusals })
      if (answer.rules) onFile = answer.rules
      return json(answer.status, answer.body)
    }
    if (url.includes('/bill-reminders/settings')) {
      // The answer carries `sendingEnabled`, read-only; the page must not need to send it back.
      if (init?.method !== 'PUT') return json(200, settingsAnswer(settingsOnFile))
      const body = JSON.parse(String(init.body))
      settingsBodies.push(body)
      const answer = saveSettings(body)
      if (answer.settings) settingsOnFile = answer.settings
      return json(answer.status, answer.body)
    }
    if (url.includes('/bill-reminders/preview')) return json(200, preview)
    if (url.includes('/v1/users')) {
      return json(200, {
        content: [{ id: HAFIDH, username: 'hafidh', firstName: 'Hafidh', lastName: 'Al Balushi' }],
      })
    }
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en')
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/expenditure/reminders']}>
      <Routes>
        <Route path="/expenditure/reminders" element={<ExpenditureRemindersPage />} />
      </Routes>
    </MemoryRouter>,
  )

const card = (title: string) => screen.getByText(title).closest('article')!
const pressed = (within_: HTMLElement, name: string) =>
  within(within_).getByRole('button', { name }).getAttribute('aria-pressed')
const saveButton = () => screen.getByRole('button', { name: 'Save changes' })

describe('the two request bodies, field for field', () => {
  it('keeps the fixture, the mock and the page types naming the same fields', () => {
    // The backend refuses a JSON field its record does not declare, so a field added on one side
    // only is a save that stops working. Three lists, one answer.
    expect(RULES_REQUEST_FIELDS).toEqual(RULES_PUT.fields)
    expect(RULE_REQUEST_FIELDS).toEqual(RULES_PUT.each.fields)
    expect(SETTINGS_REQUEST_FIELDS).toEqual(SETTINGS_PUT.fields)
    expect(SETTINGS_IGNORED_FIELDS).toEqual(SETTINGS_PUT.acceptedAndIgnored)

    // Typed on the page's own DTOs: a field added to either type does not compile until it is
    // named here, and then does not pass until the fixture (and so the backend record) has it.
    const rule: Record<keyof ReminderRuleDto, true> = {
      type: true,
      offsets: true,
      repeatEveryDays: true,
      escalationOffsets: true,
      recipients: true,
      enabled: true,
    }
    const settings: Record<keyof ReminderSettingsDto, true> = {
      delivery: true,
      digestTime: true,
      skipWeekends: true,
      stopWhenInRun: true,
    }
    expect(Object.keys(rule)).toEqual(RULES_PUT.each.fields)
    expect(Object.keys(settings)).toEqual(SETTINGS_PUT.fields)
    expect(RULES_PUT.each.fields).toHaveLength(6)
    expect(SETTINGS_PUT.fields).toHaveLength(4)
  })

  it('sends a switched-on rule as exactly the six fields the record declares', async () => {
    // The page edits the object it loaded. A field the answer carries and the record does not
    // would be refused if it rode back on the save.
    extraOnRead = { revision: 4 }
    renderPage()
    await screen.findByText('Before a bill is due')

    fireEvent.click(within(card('A scanned receipt still unconfirmed')).getByRole('switch'))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    await waitFor(() => expect(rulesBodies).toHaveLength(1))
    expect(Object.keys(rulesBodies[0])).toEqual(RULES_PUT.fields)
    const sent = (rulesBodies[0] as { rules: Record<string, unknown>[] }).rules
    expect(sent).toHaveLength(1)
    expect(Object.keys(sent[0]).sort()).toEqual([...RULES_PUT.each.fields].sort())
    // The server's own default days travel back as they came.
    expect(sent[0]).toEqual({
      type: 'SCAN_UNCONFIRMED',
      offsets: [2, 7],
      repeatEveryDays: null,
      escalationOffsets: null,
      recipients: [],
      enabled: true,
    })
    // Accepted by the server's checks, and nothing about delivery was sent.
    await waitFor(() =>
      expect(onFile.find((rule) => rule.type === 'SCAN_UNCONFIRMED')!.enabled).toBe(true),
    )
    expect(settingsBodies).toHaveLength(0)
  })

  it('sends the settings as exactly the four fields the record declares', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    await waitFor(() => expect(settingsBodies).toHaveLength(1))
    // `sendingEnabled` came with the settings and is not sent back.
    expect(Object.keys(settingsBodies[0]).sort()).toEqual([...SETTINGS_PUT.fields].sort())
    expect(settingsBodies[0]).toEqual({
      delivery: 'IN_APP',
      digestTime: '08:00',
      skipWeekends: true,
      stopWhenInRun: true,
    })
    await waitFor(() => expect(settingsOnFile.delivery).toBe('IN_APP'))
    expect(rulesBodies).toHaveLength(0)
  })
})

describe('a company that has saved nothing', () => {
  it('draws the defaults exactly as the server returns them, and has nothing to save', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')

    // Six rules, all off. The recurring row is not a rule: no switch, and not counted.
    for (const title of [
      'Before a bill is due',
      'Once a bill is late',
      'Before an early-payment discount runs out',
      'An approval nobody has answered',
      'A mismatch nobody has resolved',
      'A scanned receipt still unconfirmed',
    ]) {
      expect(within(card(title)).getByRole('switch').getAttribute('aria-checked'), title).toBe(
        'false',
      )
    }
    expect(within(card("A recurring bill that hasn't arrived")).queryByRole('switch')).toBeNull()
    expect(screen.getByText('0 rules on')).toBeTruthy()
    expect(screen.getByText(/one daily email at 08:00, weekends skipped/)).toBeTruthy()

    // The server answers a ladder ascending (0, 2, 7); the chips light by day, not by position.
    const before = card('Before a bill is due')
    expect(pressed(before, '7 days before')).toBe('true')
    expect(pressed(before, '2 days before')).toBe('true')
    expect(pressed(before, 'On the day')).toBe('true')
    const late = card('Once a bill is late')
    expect(pressed(late, 'The day after')).toBe('true')
    expect(pressed(late, 'Then every 3 days')).toBe('true')
    // The defaults carry more than one day on the rows below; every day on file is shown lit.
    const approval = card('An approval nobody has answered')
    expect(pressed(approval, '1 day')).toBe('false')
    expect(pressed(approval, '2 days')).toBe('true')
    expect(pressed(approval, '3 days')).toBe('true')
    expect(pressed(approval, '5 days')).toBe('true')
    expect(pressed(approval, '7 days')).toBe('true')
    const mismatch = card('A mismatch nobody has resolved')
    expect(pressed(mismatch, '1 day')).toBe('true')
    expect(pressed(mismatch, '3 days')).toBe('true')
    expect(pressed(mismatch, 'A week')).toBe('true')
    const scan = card('A scanned receipt still unconfirmed')
    expect(pressed(scan, '2 days')).toBe('true')
    expect(pressed(scan, 'A week')).toBe('true')

    // Nothing was touched, so nothing is offered to save and nothing was written.
    expect(saveButton()).toHaveProperty('disabled', true)
    expect(rulesBodies).toHaveLength(0)
    expect(settingsBodies).toHaveLength(0)
  })
})

describe('saving', () => {
  it('does not leave Save lit when a day is switched off and on again', async () => {
    // On file ascending, as the server stores it. Off and on again puts the day at the end of
    // the page's list; the same days in another order are the same ladder.
    seed({ type: 'BEFORE_DUE', offsets: [2, 7], recipients: [HAFIDH], enabled: true })
    renderPage()
    await screen.findByText('Before a bill is due')
    const before = card('Before a bill is due')
    await waitFor(() =>
      expect(within(before).getByRole('button', { name: '2 days before' })).toHaveProperty(
        'disabled',
        false,
      ),
    )

    fireEvent.click(within(before).getByRole('button', { name: '2 days before' }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))

    fireEvent.click(within(before).getByRole('button', { name: '2 days before' }))
    await waitFor(() => expect(pressed(before, '2 days before')).toBe('true'))
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('still says "Saved." once the page has read the saved values back', async () => {
    renderPage()
    await screen.findByText('Before a bill is due')
    const readsBefore = rulesReads()

    fireEvent.click(within(card('A scanned receipt still unconfirmed')).getByRole('switch'))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    // The save is followed by a fresh read; wait for the editor to come back on its answer.
    await waitFor(() => expect(rulesReads()).toBeGreaterThan(readsBefore))
    await waitFor(() =>
      expect(
        within(card('A scanned receipt still unconfirmed'))
          .getByRole('switch')
          .getAttribute('aria-checked'),
      ).toBe('true'),
    )
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', true))
    const saved = screen.getByText('Saved.').closest('section')!

    // And it can be put away.
    fireEvent.click(within(saved).getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Saved.')).toBeNull()
  })
})

describe('a save the server refuses', () => {
  /** Switched on with every day cleared: the one refusal the screen itself can reach. */
  async function saveAnEmptyRule() {
    seed({ type: 'BEFORE_DUE', offsets: [2, 7], recipients: [HAFIDH], enabled: true })
    renderPage()
    await screen.findByText('Before a bill is due')
    const before = card('Before a bill is due')
    await waitFor(() =>
      expect(within(before).getByRole('button', { name: '2 days before' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(before).getByRole('button', { name: '2 days before' }))
    fireEvent.click(within(before).getByRole('button', { name: '7 days before' }))
    await waitFor(() => expect(pressed(before, '7 days before')).toBe('false'))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())
    await waitFor(() => expect(rulesBodies).toHaveLength(1))
    return before
  }

  /** What every refused save must leave behind, whichever shape the refusal came in. */
  async function expectNothingSaved(before: HTMLElement) {
    // The edit is kept for another go, not thrown away, and nothing claims it was saved.
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    expect(screen.queryByText('Saved.')).toBeNull()
    expect(within(before).getByRole('switch').getAttribute('aria-checked')).toBe('true')
    expect(pressed(before, '2 days before')).toBe('false')
    expect(onFile.find((rule) => rule.type === 'BEFORE_DUE')!.offsets).toEqual([2, 7])
  }

  it('in the shape the controller sent before it kept the code: a plain validation failure', async () => {
    refusals = 'legacy'
    const before = await saveAnEmptyRule()

    expect(
      await screen.findByText('Some details were not accepted. Check the form and try again.'),
    ).toBeTruthy()
    expect(screen.getByText('Not done')).toBeTruthy()
    // The server's own English sentence is never printed.
    expect(screen.queryByText(/needs at least one offset/)).toBeNull()
    await expectNothingSaved(before)
  })

  it('in the shape it sends now: the Expenditure refusal with its code', async () => {
    refusals = 'coded'
    const before = await saveAnEmptyRule()

    // REMINDER_RULE_EMPTY has no sentence of its own yet, so it reads as a refusal, not as a
    // fault to retry, and never as the raw code or the server's English detail.
    expect(await screen.findByText(/^The server refused this\./)).toBeTruthy()
    expect(screen.getByText('Not done')).toBeTruthy()
    expect(screen.queryByText(/REMINDER_RULE_EMPTY/)).toBeNull()
    expect(screen.queryByText(/needs at least one offset/)).toBeNull()
    expect(screen.queryByText(/try again/i)).toBeNull()
    await expectNothingSaved(before)
  })

  it('shows a coded refusal its own sentence where one exists, with the reference', async () => {
    // The page blocks this one itself, so it can only arrive from outside the page: forced here.
    forced = {
      status: 400,
      body: {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        title: 'Request refused',
        status: 400,
        detail: 'An enabled BEFORE_DUE rule needs at least one recipient',
        error: 'REMINDER_RULE_NEEDS_RECIPIENT',
        trace_id: 'trace-77',
      },
    }
    renderPage()
    await screen.findByText('Before a bill is due')
    fireEvent.click(within(card('A scanned receipt still unconfirmed')).getByRole('switch'))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    expect(
      await screen.findByText(
        'This reminder has to name at least one person to tell. Reference: trace-77',
      ),
    ).toBeTruthy()
    expect(screen.queryByText('Saved.')).toBeNull()
  })

  it('does not go on to save the settings when the rules were refused', async () => {
    // Two calls, rules first. A refusal stops the second, so the page never reports a half.
    seed({ type: 'BEFORE_DUE', offsets: [2, 7], recipients: [HAFIDH], enabled: true })
    renderPage()
    await screen.findByText('Before a bill is due')
    const before = card('Before a bill is due')
    await waitFor(() =>
      expect(within(before).getByRole('button', { name: '2 days before' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(before).getByRole('button', { name: '2 days before' }))
    fireEvent.click(within(before).getByRole('button', { name: '7 days before' }))
    await waitFor(() => expect(pressed(before, '7 days before')).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    expect(await screen.findByText(/^The server refused this\./)).toBeTruthy()
    expect(rulesBodies).toHaveLength(1)
    expect(settingsBodies).toHaveLength(0)
    expect(settingsOnFile.delivery).toBe('DAILY_DIGEST')
  })
})

describe('what today would send', () => {
  const item = {
    ruleType: 'LATE' as const,
    subjectType: 'BILL' as const,
    subjectId: 'b-1',
    subjectDisplay: null,
    daysFromDue: -9,
    headline: 'Al Noor Dates unpaid for 9 days',
    amount: 411.5,
    currency: 'OMR',
  }

  it('words a person the server could not name, and never prints their id', async () => {
    // A user named on a rule and since switched off: the group arrives with no display name.
    preview = {
      date: '2026-10-01',
      total: 2,
      groups: [
        { recipientUserId: HAFIDH, displayName: 'Hafidh Al Balushi', headline: 'x', items: [item] },
        { recipientUserId: GONE, displayName: null, headline: 'x', items: [item] },
      ],
    }
    renderPage()
    expect(await screen.findByText('Al Noor Dates unpaid for 9 days')).toBeTruthy()

    // The wording the people picker already uses for someone it cannot name, whole.
    expect(screen.getByText('One email · 08:00 · to Hafidh and Someone on the team')).toBeTruthy()
    // Once in the badge, once on the line itself.
    expect(screen.getAllByText(/to Hafidh and Someone on the team$/)).toHaveLength(2)
    expect(screen.queryByText(new RegExp(GONE))).toBeNull()
  })

  it('counts several unnamed people once', async () => {
    preview = {
      date: '2026-10-01',
      total: 2,
      groups: [
        { recipientUserId: GONE, displayName: null, headline: 'x', items: [item] },
        { recipientUserId: HAFIDH, displayName: null, headline: 'x', items: [item] },
      ],
    }
    renderPage()
    expect(await screen.findByText('Al Noor Dates unpaid for 9 days')).toBeTruthy()
    expect(screen.getByText('One email · 08:00 · to Someone on the team')).toBeTruthy()
  })
})

describe('the reminders screen in Arabic', () => {
  it('draws the page, a refusal and an unnamed person in Arabic, with no key left showing', async () => {
    await i18n.changeLanguage('ar')
    seed({ type: 'BEFORE_DUE', offsets: [2, 7], recipients: [HAFIDH], enabled: true })
    preview = {
      date: '2026-10-01',
      total: 1,
      groups: [
        {
          recipientUserId: GONE,
          displayName: null,
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
    const { container } = renderPage()

    expect(await screen.findByText('قبل استحقاق الفاتورة')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'التذكيرات' })).toBeTruthy()
    for (const title of [
      'بعد تأخر الفاتورة',
      'قبل انتهاء خصم السداد المبكر',
      'اعتماد لم يردّ عليه أحد',
      'اختلاف لم يحلّه أحد',
      'إيصال ممسوح لم يُؤكَّد بعد',
      'فاتورة متكررة لم تصل',
      'الأموال الخارجة',
      'عمل متوقف',
      'كيف تصلك الإشعارات',
      'ما الذي سيُرسل اليوم',
    ]) {
      expect(screen.getByText(title), title).toBeTruthy()
    }
    const before = card('قبل استحقاق الفاتورة')
    expect(pressed(before, 'قبل ٧ أيام')).toBe('true')
    expect(pressed(before, 'قبل يومين')).toBe('true')
    expect(pressed(before, 'في اليوم نفسه')).toBe('false')
    // One rule is on. The recurring row has no switch and is not counted.
    expect(within(card('فاتورة متكررة لم تصل')).queryByRole('switch')).toBeNull()
    expect(screen.getByText('قاعدة واحدة مفعّلة')).toBeTruthy()

    // The unnamed person, in Arabic.
    expect(await screen.findByText('بريد واحد · 08:00 · إلى أحد أعضاء الفريق')).toBeTruthy()
    expect(screen.queryByText(new RegExp(GONE))).toBeNull()

    // A refused save: the Arabic sentence, never the server's English detail.
    await waitFor(() =>
      expect(within(before).getByRole('button', { name: 'قبل يومين' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(before).getByRole('button', { name: 'قبل يومين' }))
    fireEvent.click(within(before).getByRole('button', { name: 'قبل ٧ أيام' }))
    await waitFor(() => expect(pressed(before, 'قبل ٧ أيام')).toBe('false'))
    const save = screen.getByRole('button', { name: 'حفظ التغييرات' })
    await waitFor(() => expect(save).toHaveProperty('disabled', false))
    fireEvent.click(save)
    expect(await screen.findByText(/^رفض الخادم هذا الطلب\./)).toBeTruthy()
    expect(screen.queryByText(/needs at least one offset/)).toBeNull()

    // No message key and no English page string left on the Arabic page.
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/expenditureReminders\.|apiErrors\.|common\./)
    for (const english of ['Reminders', 'Save changes', 'Before a bill is due', 'Saved.']) {
      expect(text, english).not.toContain(english)
    }
  })
})

describe('the mock API checks a save as the server does', () => {
  const body = (rule: Record<string, unknown>) => ({ rules: [rule] })
  const codeOf = (answer: { body: Record<string, unknown> }) => answer.body.error
  const typeOf = (answer: { body: Record<string, unknown> }) =>
    String(answer.body.type).split('/').pop()

  it('refuses a field the record does not declare, on either body', () => {
    const rules = saveRules(defaultRules(), body({ type: 'LATE', offsets: [1], foo: 1 }))
    expect(rules.status).toBe(400)
    expect(typeOf(rules)).toBe('malformed-request')
    expect(typeOf(saveRules(defaultRules(), { rules: [], extra: true }))).toBe('malformed-request')
    const settings = saveSettings({ ...defaultSettings(), locale: 'ar' })
    expect(settings.status).toBe(400)
    expect(typeOf(settings)).toBe('malformed-request')
    // The one field the settings record takes and ignores: an older page echoes it back.
    const echoed = saveSettings({ ...defaultSettings(), sendingEnabled: false })
    expect(echoed.status).toBe(200)
    expect(echoed.body.sendingEnabled).toBe(true)
    expect(echoed.settings).toEqual(defaultSettings())
    // An enum word the server does not know is a body it cannot read, not a validation failure.
    expect(typeOf(saveRules(defaultRules(), body({ type: 'WEEKLY' })))).toBe('malformed-request')
    expect(typeOf(saveSettings({ ...defaultSettings(), delivery: 'SMS' }))).toBe(
      'malformed-request',
    )
  })

  it('answers a missing required field as a validation failure naming the field', () => {
    const noRules = saveRules(defaultRules(), {})
    expect(typeOf(noRules)).toBe('validation-failed')
    expect(noRules.body.errors).toEqual([{ field: 'rules', message: 'must not be null' }])
    expect(typeOf(saveRules(defaultRules(), body({ offsets: [1] })))).toBe('validation-failed')
    expect(typeOf(saveSettings({ digestTime: '08:00' }))).toBe('validation-failed')
    expect(typeOf(saveSettings({ delivery: 'IN_APP' }))).toBe('validation-failed')
    const badTime = saveSettings({ ...defaultSettings(), digestTime: '8am' })
    expect(typeOf(badTime)).toBe('validation-failed')
    expect(badTime.body.detail).toBe('digestTime must be HH:mm')
  })

  it('folds and sorts days and people, keeps the rules not named, and answers all six', () => {
    const answer = saveRules(
      defaultRules(),
      body({
        type: 'BEFORE_DUE',
        offsets: [7, 0, 7, 2],
        recipients: [HAFIDH, HAFIDH],
        enabled: true,
      }),
    )
    expect(answer.status).toBe(200)
    const rules = answer.rules!
    expect(rules.map((rule) => rule.type)).toEqual([
      'BEFORE_DUE',
      'LATE',
      'DISCOUNT_EXPIRY',
      'APPROVAL_STALE',
      'MISMATCH_STALE',
      'SCAN_UNCONFIRMED',
    ])
    expect(rules[0]).toEqual({
      type: 'BEFORE_DUE',
      offsets: [0, 2, 7],
      repeatEveryDays: null,
      escalationOffsets: null,
      recipients: [HAFIDH],
      enabled: true,
    })
    expect(rules.slice(1)).toEqual(defaultRules().slice(1))
  })

  it('refuses what the rule itself refuses, by code', () => {
    const refusedWith = (rule: Record<string, unknown>) => {
      const answer = saveRules(defaultRules(), body(rule))
      expect(answer.status, JSON.stringify(rule)).toBe(400)
      expect(typeOf(answer)).toBe('expenditure-refused')
      return codeOf(answer)
    }
    expect(refusedWith({ type: 'RECURRING_LATE', offsets: [1] })).toBe(
      'REMINDER_RULE_NOT_CONFIGURABLE',
    )
    expect(refusedWith({ type: 'BEFORE_DUE', offsets: [366] })).toBe(
      'REMINDER_RULE_OFFSET_OUT_OF_RANGE',
    )
    expect(refusedWith({ type: 'BEFORE_DUE', offsets: [-3] })).toBe(
      'REMINDER_RULE_OFFSET_OUT_OF_RANGE',
    )
    expect(refusedWith({ type: 'APPROVAL_STALE', offsets: [2], escalationOffsets: [-1] })).toBe(
      'REMINDER_RULE_ESCALATION_OUT_OF_RANGE',
    )
    expect(
      refusedWith({ type: 'BEFORE_DUE', offsets: Array.from({ length: 11 }, (_, day) => day) }),
    ).toBe('REMINDER_RULE_OFFSETS_TOO_MANY')
    expect(refusedWith({ type: 'BEFORE_DUE', offsets: [1], repeatEveryDays: 3 })).toBe(
      'REMINDER_RULE_REPEAT_NOT_ALLOWED',
    )
    expect(refusedWith({ type: 'LATE', offsets: [1], repeatEveryDays: 0 })).toBe(
      'REMINDER_RULE_REPEAT_OUT_OF_RANGE',
    )
    expect(refusedWith({ type: 'LATE', offsets: [1], escalationOffsets: [5] })).toBe(
      'REMINDER_RULE_ESCALATION_NOT_ALLOWED',
    )
    expect(refusedWith({ type: 'LATE', offsets: [1], recipients: [null] })).toBe(
      'REMINDER_RULE_RECIPIENT_REQUIRED',
    )
    expect(
      refusedWith({
        type: 'LATE',
        offsets: [1],
        recipients: Array.from({ length: 11 }, (_, n) => `u-${n}`),
      }),
    ).toBe('REMINDER_RULE_TOO_MANY_RECIPIENTS')
    expect(refusedWith({ type: 'BEFORE_DUE', offsets: [], recipients: ['u'], enabled: true })).toBe(
      'REMINDER_RULE_EMPTY',
    )
    expect(refusedWith({ type: 'BEFORE_DUE', offsets: [2], enabled: true })).toBe(
      'REMINDER_RULE_NEEDS_RECIPIENT',
    )
    // The two rules that find their own people need nobody named.
    expect(
      saveRules(defaultRules(), body({ type: 'SCAN_UNCONFIRMED', offsets: [2], enabled: true }))
        .status,
    ).toBe(200)

    const twice = saveRules(defaultRules(), {
      rules: [
        { type: 'LATE', offsets: [1] },
        { type: 'LATE', offsets: [2] },
      ],
    })
    expect(codeOf(twice)).toBe('REMINDER_RULE_DUPLICATE')
  })

  it('refuses a person added who is not one of the company, and keeps one already on the rule', () => {
    const users = [HAFIDH]
    const added = saveRules(
      defaultRules(),
      body({ type: 'LATE', offsets: [1], recipients: [HAFIDH, GONE] }),
      { users },
    )
    expect(codeOf(added)).toBe('REMINDER_RULE_RECIPIENT_UNKNOWN')
    // Stored before they were switched off: the page sends the stored list back, so it passes.
    const stored = defaultRules().map((rule) =>
      rule.type === 'LATE' ? { ...rule, recipients: [GONE] } : rule,
    )
    const kept = saveRules(
      stored,
      body({ type: 'LATE', offsets: [1], recipients: [GONE, HAFIDH], enabled: true }),
      { users },
    )
    expect(kept.status).toBe(200)
    expect(kept.rules!.find((rule) => rule.type === 'LATE')!.recipients).toEqual([GONE, HAFIDH])
  })

  it('can answer in the older shape too: the same refusal with no code', () => {
    const answer = saveRules(
      defaultRules(),
      body({ type: 'BEFORE_DUE', offsets: [], recipients: ['u'], enabled: true }),
      { refusals: 'legacy' },
    )
    expect(answer.status).toBe(400)
    expect(typeOf(answer)).toBe('validation-failed')
    expect(answer.body.error).toBeUndefined()
    expect(answer.rules).toBeUndefined()
  })

  it('replaces the settings whole: a switch left out is off', () => {
    const answer = saveSettings({ delivery: 'IMMEDIATE_EMAIL', digestTime: '09:30' })
    expect(answer.status).toBe(200)
    expect(answer.settings).toEqual({
      delivery: 'IMMEDIATE_EMAIL',
      digestTime: '09:30',
      skipWeekends: false,
      stopWhenInRun: false,
    })
    expect(answer.body).toEqual({ ...answer.settings, sendingEnabled: true })
    expect(defaultSettings()).toEqual({
      delivery: 'DAILY_DIGEST',
      digestTime: '08:00',
      skipWeekends: true,
      stopWhenInRun: true,
    })
  })
})
