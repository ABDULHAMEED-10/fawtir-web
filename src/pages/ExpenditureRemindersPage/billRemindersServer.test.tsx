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
import { withOneTiming } from '../../lib/expenditureReminders'
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
let entitlements: Entitlements
let onFile: MockReminderRule[]
let settingsOnFile: MockReminderSettings
let refusals: 'coded' | 'legacy'
/** A refusal the page cannot provoke by itself: someone else changed the rules meanwhile. */
let forced: { status: number; body: Record<string, unknown> } | null
/** The settings save refused whatever it carries, as a server fault or a lost permission would. */
let forcedSettings: { status: number; body: Record<string, unknown> } | null
let rulesBodies: Record<string, unknown>[]
let settingsBodies: Record<string, unknown>[]
let preview: ReminderPreviewDto
/** What `GET /settings` says about sending. `undefined` is a server from before the field. */
let sending: boolean | undefined
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
  entitlements = MANAGER
  onFile = defaultRules()
  settingsOnFile = defaultSettings()
  refusals = 'coded'
  forced = null
  forcedSettings = null
  rulesBodies = []
  settingsBodies = []
  extraOnRead = {}
  sending = true
  preview = { date: '2026-10-01', total: 0, groups: [] }

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.includes('/me/entitlements')) return json(200, entitlements)
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
      if (init?.method !== 'PUT')
        return json(
          200,
          sending === undefined
            ? settingsOnFile
            : settingsAnswer(settingsOnFile, { sendingEnabled: sending }),
        )
      const body = JSON.parse(String(init.body))
      settingsBodies.push(body)
      if (forcedSettings) return json(forcedSettings.status, forcedSettings.body)
      const answer = saveSettings(body, { sendingEnabled: sending ?? true })
      if (answer.settings) settingsOnFile = answer.settings
      return json(
        answer.status,
        answer.settings && sending === undefined ? answer.settings : answer.body,
      )
    }
    if (url.includes('/bill-reminders/preview')) return json(200, preview)
    if (url.includes('/recurring-bills/recipients'))
      return json(200, [{ id: HAFIDH, displayName: 'Hafidh Al Balushi' }])
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

/**
 * The editor is up AND its mount effects have run. `findByText` alone can answer in the gap
 * between React committing the editor and running its effects; one of those effects copies the
 * rules on file into the draft, so a click made in that gap is overwritten and the test fails
 * about once in sixty. The preview's read is started by the same round of effects, so once it has
 * been asked for, the round is over.
 */
async function editorReady(title = 'Before a bill is due') {
  await screen.findByText(title)
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/bill-reminders/preview')),
    ).toBe(true),
  )
}

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
    await editorReady()

    fireEvent.click(within(card('A scanned receipt still unconfirmed')).getByRole('switch'))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    await waitFor(() => expect(rulesBodies).toHaveLength(1))
    expect(Object.keys(rulesBodies[0])).toEqual(RULES_PUT.fields)
    const sent = (rulesBodies[0] as { rules: Record<string, unknown>[] }).rules
    expect(sent).toHaveLength(1)
    expect(Object.keys(sent[0]).sort()).toEqual([...RULES_PUT.each.fields].sort())
    // The row takes one timing: of the server's two starting days, the earlier is sent.
    expect(sent[0]).toEqual({
      type: 'SCAN_UNCONFIRMED',
      offsets: [2],
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
    await editorReady()

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
    await editorReady()

    // Six rules, all off; the recurring row is the bills' own, reads on and is counted.
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
    expect(
      within(card("A recurring bill that hasn't arrived"))
        .getByRole('switch')
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(screen.getByText('1 rule on')).toBeTruthy()
    expect(screen.getByText(/one daily email at 08:00, weekends skipped/)).toBeTruthy()

    // The server answers a ladder ascending (0, 2, 7); the chips light by day, not by position.
    const before = card('Before a bill is due')
    expect(pressed(before, '7 days before')).toBe('true')
    expect(pressed(before, '2 days before')).toBe('true')
    expect(pressed(before, 'On the day')).toBe('true')
    const late = card('Once a bill is late')
    expect(pressed(late, 'The day after')).toBe('true')
    expect(pressed(late, 'Then every 3 days')).toBe('true')
    // The server's defaults carry two or three days on the rows below, which take one. Each
    // starts where the design starts it: 2 days then the owner after 5, 3 days, 2 days.
    const approval = card('An approval nobody has answered')
    expect(pressed(approval, '1 day')).toBe('false')
    expect(pressed(approval, '2 days')).toBe('true')
    expect(pressed(approval, '3 days')).toBe('false')
    expect(pressed(approval, '5 days')).toBe('true')
    expect(pressed(approval, '7 days')).toBe('false')
    const mismatch = card('A mismatch nobody has resolved')
    expect(pressed(mismatch, '1 day')).toBe('false')
    expect(pressed(mismatch, '3 days')).toBe('true')
    expect(pressed(mismatch, 'A week')).toBe('false')
    const scan = card('A scanned receipt still unconfirmed')
    expect(pressed(scan, '2 days')).toBe('true')
    expect(pressed(scan, 'A week')).toBe('false')

    // Nothing was touched, so nothing is offered to save and nothing was written.
    expect(saveButton()).toHaveProperty('disabled', true)
    expect(rulesBodies).toHaveLength(0)
    expect(settingsBodies).toHaveLength(0)
  })
})

describe('rows that take one timing', () => {
  const singleDefaults = () =>
    defaultRules().map((rule) =>
      rule.type === 'APPROVAL_STALE'
        ? { ...rule, offsets: [2], escalationOffsets: [5] }
        : rule.type === 'MISMATCH_STALE'
          ? { ...rule, offsets: [3] }
          : rule.type === 'SCAN_UNCONFIRMED'
            ? { ...rule, offsets: [2] }
            : rule,
    )

  it('reads a switched-off row as holding one day only, and leaves the others alone', () => {
    const [before, late, discount, approval, mismatch, scan] = defaultRules().map((rule) =>
      withOneTiming(rule as ReminderRuleDto),
    )
    // Rows that take several keep every day.
    expect(before.offsets).toEqual([0, 2, 7])
    expect(late.offsets).toEqual([1])
    expect(late.repeatEveryDays).toBe(3)
    expect(discount.offsets).toEqual([3])
    // Rows that take one.
    expect(approval.offsets).toEqual([2])
    expect(approval.escalationOffsets).toEqual([5])
    // The mismatch row starts on three days, as the design does, not on its earliest.
    expect(mismatch.offsets).toEqual([3])
    expect(scan.offsets).toEqual([2])
    // Three days is kept only when it is one of the days on file; otherwise the earliest is.
    expect(withOneTiming({ ...mismatch, offsets: [7, 1] }).offsets).toEqual([1])
    expect(withOneTiming({ ...mismatch, offsets: [7, 3, 1] }).offsets).toEqual([3])
    // One day on file is that day, whatever it is: the page does not move it to three.
    const oneDay = { ...mismatch, offsets: [1] }
    expect(withOneTiming(oneDay)).toBe(oneDay)

    // Already one, or none: the same object back, nothing rewritten.
    const single = singleDefaults()[3] as ReminderRuleDto
    expect(withOneTiming(single)).toBe(single)
    const empty = { ...single, offsets: [], escalationOffsets: null }
    expect(withOneTiming(empty)).toBe(empty)
    // A rule that is on is firing on every day it holds: it is never read as fewer.
    const on = { ...(defaultRules()[4] as ReminderRuleDto), recipients: [HAFIDH], enabled: true }
    expect(withOneTiming(on)).toBe(on)
    // Whatever order the days come in, the earliest is kept.
    expect(withOneTiming({ ...single, offsets: [7, 3] }).offsets).toEqual([3])
  })

  it('sends one timing, and one for the owner, when the approval rule is switched on', async () => {
    renderPage()
    await editorReady()
    fireEvent.click(within(card('An approval nobody has answered')).getByRole('switch'))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    await waitFor(() => expect(rulesBodies).toHaveLength(1))
    expect((rulesBodies[0] as { rules: unknown[] }).rules).toEqual([
      {
        type: 'APPROVAL_STALE',
        offsets: [2],
        repeatEveryDays: null,
        escalationOffsets: [5],
        recipients: [],
        enabled: true,
      },
    ])
    await waitFor(() =>
      expect(onFile.find((rule) => rule.type === 'APPROVAL_STALE')).toMatchObject({
        offsets: [2],
        escalationOffsets: [5],
        enabled: true,
      }),
    )
  })

  it('sends three days when the mismatch rule is switched on untouched', async () => {
    seed({ type: 'MISMATCH_STALE', recipients: [HAFIDH] })
    renderPage()
    await editorReady()
    fireEvent.click(within(card('A mismatch nobody has resolved')).getByRole('switch'))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    await waitFor(() => expect(rulesBodies).toHaveLength(1))
    expect((rulesBodies[0] as { rules: unknown[] }).rules).toEqual([
      {
        type: 'MISMATCH_STALE',
        offsets: [3],
        repeatEveryDays: null,
        escalationOffsets: null,
        recipients: [HAFIDH],
        enabled: true,
      },
    ])
  })

  it('sends the one timing the reader picked instead', async () => {
    renderPage()
    await editorReady()
    const scan = card('A scanned receipt still unconfirmed')
    fireEvent.click(within(scan).getByRole('switch'))
    await waitFor(() =>
      expect(within(scan).getByRole('button', { name: 'A week' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(scan).getByRole('button', { name: 'A week' }))
    await waitFor(() => expect(pressed(scan, 'A week')).toBe('true'))
    expect(pressed(scan, '2 days')).toBe('false')
    fireEvent.click(saveButton())

    await waitFor(() => expect(rulesBodies).toHaveLength(1))
    expect((rulesBodies[0] as { rules: { offsets: number[] }[] }).rules[0].offsets).toEqual([7])
  })

  it('shows a rule that is on exactly as it is on file, and does not cut it down unasked', async () => {
    // Switched on before this change, so both days are on file and both are firing. The page
    // shows both; a change to anything else on the page does not send this rule at all.
    seed({ type: 'SCAN_UNCONFIRMED', offsets: [2, 7], enabled: true })
    seed({ type: 'MISMATCH_STALE', offsets: [1, 3, 7], recipients: [HAFIDH], enabled: true })
    renderPage()
    await editorReady()
    const scan = card('A scanned receipt still unconfirmed')
    expect(pressed(scan, '2 days')).toBe('true')
    expect(pressed(scan, 'A week')).toBe('true')
    const mismatch = card('A mismatch nobody has resolved')
    expect(pressed(mismatch, '1 day')).toBe('true')
    expect(pressed(mismatch, '3 days')).toBe('true')
    expect(pressed(mismatch, 'A week')).toBe('true')
    expect(saveButton()).toHaveProperty('disabled', true)

    // Picking one keeps one, as the row always has.
    await waitFor(() =>
      expect(within(mismatch).getByRole('button', { name: '3 days' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(mismatch).getByRole('button', { name: '3 days' }))
    await waitFor(() => expect(pressed(mismatch, '1 day')).toBe('false'))
    expect(pressed(mismatch, '3 days')).toBe('true')
    fireEvent.click(saveButton())
    await waitFor(() => expect(rulesBodies).toHaveLength(1))
    const sent = (rulesBodies[0] as { rules: { type: string; offsets: number[] }[] }).rules
    expect(sent.map((rule) => rule.type)).toEqual(['MISMATCH_STALE'])
    expect(sent[0].offsets).toEqual([3])
    // The scan rule was not touched and is still as it was.
    expect(onFile.find((rule) => rule.type === 'SCAN_UNCONFIRMED')!.offsets).toEqual([2, 7])
  })

  it('draws a server that already starts those rows on one timing the same way', async () => {
    onFile = singleDefaults()
    renderPage()
    await editorReady()
    const approval = card('An approval nobody has answered')
    expect(pressed(approval, '2 days')).toBe('true')
    expect(pressed(approval, '3 days')).toBe('false')
    expect(pressed(approval, '5 days')).toBe('true')
    expect(pressed(approval, '7 days')).toBe('false')
    expect(pressed(card('A mismatch nobody has resolved'), '3 days')).toBe('true')
    expect(pressed(card('A mismatch nobody has resolved'), '1 day')).toBe('false')
    expect(pressed(card('A scanned receipt still unconfirmed'), '2 days')).toBe('true')
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('shows a mismatch rule that holds one day as that day, and does not move it to three', async () => {
    // A server whose starting value for the row is one day, or a company that saved one day and
    // switched the rule off: the page cannot tell them apart, so it shows what is on file.
    onFile = singleDefaults().map((rule) =>
      rule.type === 'MISMATCH_STALE' ? { ...rule, offsets: [1] } : rule,
    )
    renderPage()
    await editorReady()
    const mismatch = card('A mismatch nobody has resolved')
    expect(pressed(mismatch, '1 day')).toBe('true')
    expect(pressed(mismatch, '3 days')).toBe('false')
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('shows a reader the same one timing, in Arabic too', async () => {
    entitlements = { ...MANAGER, permissions: ['invoice.read'] }
    await i18n.changeLanguage('ar')
    renderPage()
    const approval = (await screen.findByText('اعتماد لم يردّ عليه أحد')).closest('article')!
    expect(pressed(approval, 'يومان')).toBe('true')
    expect(pressed(approval, '٣ أيام')).toBe('false')
    expect(pressed(approval, '٥ أيام')).toBe('true')
    expect(pressed(approval, '٧ أيام')).toBe('false')
    expect(screen.queryByRole('button', { name: 'حفظ التغييرات' })).toBeNull()
  })
})

describe('saving', () => {
  it('does not leave Save lit when a day is switched off and on again', async () => {
    // On file ascending, as the server stores it. Off and on again puts the day at the end of
    // the page's list; the same days in another order are the same ladder.
    seed({ type: 'BEFORE_DUE', offsets: [2, 7], recipients: [HAFIDH], enabled: true })
    renderPage()
    await editorReady()
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
    await editorReady()
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

/** `REMINDER_RULE_EMPTY` as the server answers it, in the shape it sends now or the one before. */
function emptyRuleRefusal(shape: 'coded' | 'legacy') {
  const answer = saveRules(
    defaultRules(),
    { rules: [{ type: 'BEFORE_DUE', offsets: [], recipients: [HAFIDH], enabled: true }] },
    { refusals: shape },
  )
  return { status: answer.status, body: answer.body }
}

describe('a server that is not sending reminders', () => {
  const LINE = 'Reminders are not being sent yet.'

  it('says so in one line, and the page still works', async () => {
    sending = false
    renderPage()
    await editorReady()
    expect(screen.getAllByText(LINE)).toHaveLength(1)
    // The page's own notice, with nothing to press on it.
    const notice = screen.getByText(LINE).closest('section')!
    expect(within(notice).queryByRole('button')).toBeNull()

    // Rules still save while sending is off, the line stays, and the field is not sent back.
    fireEvent.click(within(card('A scanned receipt still unconfirmed')).getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())
    await waitFor(() => expect(settingsBodies).toHaveLength(1))
    expect(Object.keys(settingsBodies[0]).sort()).toEqual([...SETTINGS_PUT.fields].sort())
    expect(await screen.findByText('Saved.')).toBeTruthy()
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', true))
    expect(screen.getAllByText(LINE)).toHaveLength(1)
  })

  it('says nothing when the server is sending', async () => {
    sending = true
    renderPage()
    await editorReady()
    expect(screen.queryByText(LINE)).toBeNull()
  })

  it('says nothing when an older server does not say either way', async () => {
    sending = undefined
    renderPage()
    await editorReady()
    expect(screen.queryByText(LINE)).toBeNull()

    // And a save against that server still goes through.
    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())
    await waitFor(() => expect(settingsOnFile.delivery).toBe('IN_APP'))
    expect(screen.queryByText(LINE)).toBeNull()
  })

  it('tells a reader too', async () => {
    sending = false
    entitlements = { ...MANAGER, permissions: ['invoice.read'] }
    renderPage()
    await editorReady()
    expect(screen.getByText(LINE)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('says it in Arabic', async () => {
    sending = false
    await i18n.changeLanguage('ar')
    renderPage()
    await editorReady('قبل استحقاق الفاتورة')
    expect(screen.getByText('لا تُرسل التذكيرات بعد.')).toBeTruthy()
    expect(screen.queryByText(LINE)).toBeNull()
  })
})

describe('a rule switched on with no timing chosen', () => {
  /** The rule on file and on; both of its lit days are then switched off. */
  async function clearEveryDay() {
    seed({ type: 'BEFORE_DUE', offsets: [2, 7], recipients: [HAFIDH], enabled: true })
    renderPage()
    await editorReady()
    const before = card('Before a bill is due')
    await waitFor(() =>
      expect(within(before).getByRole('button', { name: '2 days before' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(before).getByRole('button', { name: '2 days before' }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    expect(within(before).queryByRole('alert')).toBeNull()
    fireEvent.click(within(before).getByRole('button', { name: '7 days before' }))
    await waitFor(() => expect(pressed(before, '7 days before')).toBe('false'))
    return before
  }

  it('blocks Save with a line under the rule, and never asks the server', async () => {
    const before = await clearEveryDay()

    expect(await within(before).findByRole('alert')).toHaveProperty(
      'textContent',
      'Choose when to remind, or switch this off.',
    )
    // Only under the rule it is about.
    expect(screen.getAllByText('Choose when to remind, or switch this off.')).toHaveLength(1)
    expect(saveButton()).toHaveProperty('disabled', true)
    fireEvent.click(saveButton())
    expect(rulesBodies).toHaveLength(0)
    expect(settingsBodies).toHaveLength(0)
  })

  it('lets the save go once a timing is chosen', async () => {
    const before = await clearEveryDay()
    await within(before).findByRole('alert')

    fireEvent.click(within(before).getByRole('button', { name: 'On the day' }))
    await waitFor(() => expect(within(before).queryByRole('alert')).toBeNull())
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    await waitFor(() => expect(rulesBodies).toHaveLength(1))
    await waitFor(() =>
      expect(onFile.find((rule) => rule.type === 'BEFORE_DUE')!.offsets).toEqual([0]),
    )
  })

  it('lets the save go once the rule is switched off, with no day on it', async () => {
    const before = await clearEveryDay()
    await within(before).findByRole('alert')

    fireEvent.click(within(before).getByRole('switch'))
    await waitFor(() => expect(within(before).queryByRole('alert')).toBeNull())
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    await waitFor(() => expect(rulesBodies).toHaveLength(1))
    await waitFor(() => {
      const saved = onFile.find((rule) => rule.type === 'BEFORE_DUE')!
      expect(saved.enabled).toBe(false)
      expect(saved.offsets).toEqual([])
    })
  })

  it('counts a repeat or an escalation as a timing, as the server does', async () => {
    // The late rule with its one day off still has "then every 3 days"; the approval rule with
    // its day off still has the owner's. The server takes both, so neither is blocked here.
    seed({ type: 'LATE', offsets: [1], repeatEveryDays: 3, recipients: [HAFIDH], enabled: true })
    seed({ type: 'APPROVAL_STALE', offsets: [2], escalationOffsets: [5], enabled: true })
    renderPage()
    await editorReady()
    const late = card('Once a bill is late')
    const approval = card('An approval nobody has answered')
    await waitFor(() =>
      expect(within(late).getByRole('button', { name: 'The day after' })).toHaveProperty(
        'disabled',
        false,
      ),
    )

    fireEvent.click(within(late).getByRole('button', { name: 'The day after' }))
    fireEvent.click(within(approval).getByRole('button', { name: '2 days' }))
    await waitFor(() => expect(pressed(approval, '2 days')).toBe('false'))
    expect(within(late).queryByRole('alert')).toBeNull()
    expect(within(approval).queryByRole('alert')).toBeNull()
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))

    // With the repeat off as well, the late rule has nothing left saying when.
    fireEvent.click(within(late).getByRole('button', { name: 'Then every 3 days' }))
    expect(await within(late).findByRole('alert')).toHaveProperty(
      'textContent',
      'Choose when to remind, or switch this off.',
    )
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('does not ask a rule that is off for a timing', async () => {
    seed({ type: 'BEFORE_DUE', offsets: [], recipients: [HAFIDH], enabled: false })
    renderPage()
    await editorReady()
    expect(within(card('Before a bill is due')).queryByRole('alert')).toBeNull()
    expect(screen.queryByText('Choose when to remind, or switch this off.')).toBeNull()
  })

  it('shows a reader a rule on file with no timing as it is, with no line', async () => {
    // Nothing to choose and nothing to save for someone who may only read.
    entitlements = { ...MANAGER, permissions: ['invoice.read'] }
    onFile = onFile.map((rule) =>
      rule.type === 'BEFORE_DUE' ? { ...rule, offsets: [], enabled: true } : rule,
    )
    renderPage()
    await editorReady()
    expect(screen.queryByText('Choose when to remind, or switch this off.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    seed({ type: 'BEFORE_DUE', offsets: [2], recipients: [HAFIDH], enabled: true })
    renderPage()
    await editorReady('قبل استحقاق الفاتورة')
    const before = screen.getByText('قبل استحقاق الفاتورة').closest('article')!
    await waitFor(() =>
      expect(within(before).getByRole('button', { name: 'قبل يومين' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(before).getByRole('button', { name: 'قبل يومين' }))
    expect(await within(before).findByRole('alert')).toHaveProperty(
      'textContent',
      'اختر موعد التذكير، أو أوقف هذا التذكير.',
    )
    expect(screen.getByRole('button', { name: 'حفظ التغييرات' })).toHaveProperty('disabled', true)
  })
})

describe('a save the server refuses', () => {
  /**
   * The page now stops a rule with no timing itself, so the server's refusal of one can only come
   * from outside the page (an older tab, another person's change). It is answered here to a save
   * the page does allow: one day of two switched off.
   */
  async function saveAnEmptyRule(shape: 'coded' | 'legacy') {
    seed({ type: 'BEFORE_DUE', offsets: [2, 7], recipients: [HAFIDH], enabled: true })
    forced = emptyRuleRefusal(shape)
    renderPage()
    await editorReady()
    const before = card('Before a bill is due')
    await waitFor(() =>
      expect(within(before).getByRole('button', { name: '2 days before' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(before).getByRole('button', { name: '2 days before' }))
    await waitFor(() => expect(pressed(before, '2 days before')).toBe('false'))
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
    const before = await saveAnEmptyRule('legacy')

    expect(
      await screen.findByText('Some details were not accepted. Check the form and try again.'),
    ).toBeTruthy()
    expect(screen.getByText('Not done')).toBeTruthy()
    // The server's own English sentence is never printed.
    expect(screen.queryByText(/needs at least one offset/)).toBeNull()
    await expectNothingSaved(before)
  })

  it('in the shape it sends now: the Expenditure refusal with its code', async () => {
    const before = await saveAnEmptyRule('coded')

    // REMINDER_RULE_EMPTY has its own sentence, the one the page shows under a rule it stops
    // itself: never the raw code, the server's English detail, or an invitation to retry.
    const notice = (await screen.findByText('Not done')).closest('section')!
    expect(within(notice).getByText('Choose when to remind, or switch this off.')).toBeTruthy()
    expect(screen.queryByText(/^The server refused this\./)).toBeNull()
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
    await editorReady()
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

  it('tells someone whose chosen person has left the team to choose again', async () => {
    // Someone is switched off between the page reading the list and Save. The mock refuses a
    // person added who is not one of the company's, as the server does.
    forced = {
      status: 400,
      body: {
        type: 'https://api.fawtir.om/problems/expenditure-refused',
        title: 'Request refused',
        status: 400,
        detail: `${GONE} is not an active user of this company`,
        error: 'REMINDER_RULE_RECIPIENT_UNKNOWN',
      },
    }
    renderPage()
    await editorReady()
    fireEvent.click(within(card('A scanned receipt still unconfirmed')).getByRole('switch'))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    expect(
      await screen.findByText('One of the people chosen is no longer on the team. Choose again.'),
    ).toBeTruthy()
    expect(screen.getByText('Not done')).toBeTruthy()
    expect(screen.queryByText(new RegExp(GONE))).toBeNull()
    expect(screen.queryByText('Saved.')).toBeNull()

    await i18n.changeLanguage('ar')
    forced = { ...forced, body: { ...forced.body, error: 'REMINDER_RULE_OFFSET_OUT_OF_RANGE' } }
    fireEvent.click(await screen.findByRole('button', { name: 'حفظ التغييرات' }))
    expect(await screen.findByText('هذا العدد من الأيام غير مسموح هنا.')).toBeTruthy()

    // The same refusal in English, and the same sentence for a day count refused on the escalation.
    await i18n.changeLanguage('en')
    forced = { ...forced, body: { ...forced.body, error: 'REMINDER_RULE_ESCALATION_OUT_OF_RANGE' } }
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText("That number of days isn't allowed here.")).toBeTruthy()
    expect(screen.queryByText(/the server/)).toBeNull()
  })

  it('does not go on to save the settings when the rules were refused', async () => {
    // Two calls, rules first. A refusal stops the second, so the page never reports a half.
    seed({ type: 'BEFORE_DUE', offsets: [2, 7], recipients: [HAFIDH], enabled: true })
    forced = emptyRuleRefusal('coded')
    renderPage()
    await editorReady()
    const before = card('Before a bill is due')
    await waitFor(() =>
      expect(within(before).getByRole('button', { name: '2 days before' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(before).getByRole('button', { name: '2 days before' }))
    await waitFor(() => expect(pressed(before, '2 days before')).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    expect(await screen.findByText('Choose when to remind, or switch this off.')).toBeTruthy()
    expect(rulesBodies).toHaveLength(1)
    expect(settingsBodies).toHaveLength(0)
    expect(settingsOnFile.delivery).toBe('DAILY_DIGEST')
    // Both edits are kept, and Save is still offered for them.
    expect(screen.queryByText('Saved.')).toBeNull()
    expect(screen.getByRole('button', { name: /In Fawtir/ }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(pressed(before, '2 days before')).toBe('false')
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
  })

  it('shows the rules as saved when they were, and only the settings as still to save', async () => {
    // Rules first, then settings. The rules are written; the settings are refused. The rules
    // must then read as on file (they are), and the settings edit stays for another go.
    forcedSettings = {
      status: 400,
      body: {
        type: 'https://api.fawtir.om/problems/validation-failed',
        title: 'Request rejected',
        status: 400,
        detail: 'digestTime must be HH:mm',
      },
    }
    renderPage()
    await editorReady()
    const readsBefore = rulesReads()

    fireEvent.click(within(card('A scanned receipt still unconfirmed')).getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    // Where the page shows any failed save, in the owner's sentence: it says which half went
    // through. Nothing claims the lot was saved, and the settings' own refusal is not shown.
    expect(
      await screen.findByText(
        "The rules were saved, but the settings couldn't be saved. Try again.",
      ),
    ).toBeTruthy()
    expect(screen.getByText('Not done')).toBeTruthy()
    expect(
      screen.queryByText('Some details were not accepted. Check the form and try again.'),
    ).toBeNull()
    expect(screen.queryByText('Saved.')).toBeNull()
    expect(rulesBodies).toHaveLength(1)
    expect(settingsBodies).toHaveLength(1)
    expect(onFile.find((rule) => rule.type === 'SCAN_UNCONFIRMED')!.enabled).toBe(true)
    expect(settingsOnFile.delivery).toBe('DAILY_DIGEST')

    // The rule reads on, the settings edit is still there, and Save is lit for it.
    const scan = card('A scanned receipt still unconfirmed')
    expect(within(scan).getByRole('switch').getAttribute('aria-checked')).toBe('true')
    const inFawtir = screen.getByRole('button', { name: /In Fawtir/ })
    expect(inFawtir.getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    // The rows that take one timing still hold one: the save's answer is read as the page's
    // own read is, so a rule that is off does not come back with two or three days lit.
    expect(pressed(scan, '2 days')).toBe('true')
    expect(pressed(scan, 'A week')).toBe('false')
    const mismatch = card('A mismatch nobody has resolved')
    expect(pressed(mismatch, '1 day')).toBe('false')
    expect(pressed(mismatch, '3 days')).toBe('true')
    // The editor was not taken down to learn this: the failure and the edit are both still up.
    expect(rulesReads()).toBe(readsBefore)

    // Save again sends the settings alone: the rules are on file and are not sent twice.
    forcedSettings = null
    fireEvent.click(saveButton())
    await waitFor(() => expect(settingsBodies).toHaveLength(2))
    await waitFor(() => expect(settingsOnFile.delivery).toBe('IN_APP'))
    expect(rulesBodies).toHaveLength(1)
    expect(await screen.findByText('Saved.')).toBeTruthy()
  })

  it('says the same in Arabic, and the same whatever the settings failed on', async () => {
    await i18n.changeLanguage('ar')
    forcedSettings = {
      status: 500,
      body: { type: 'https://api.fawtir.om/problems/internal-error' },
    }
    renderPage()
    await editorReady('قبل استحقاق الفاتورة')

    fireEvent.click(
      within(screen.getByText('إيصال ممسوح لم يُؤكَّد بعد').closest('article')!).getByRole(
        'switch',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: /داخل فوتر/ }))
    const save = screen.getByRole('button', { name: 'حفظ التغييرات' })
    await waitFor(() => expect(save).toHaveProperty('disabled', false))
    fireEvent.click(save)

    expect(
      await screen.findByText('حُفظت القواعد، لكن تعذّر حفظ الإعدادات. حاول مرة أخرى.'),
    ).toBeTruthy()
    expect(rulesBodies).toHaveLength(1)
    expect(settingsBodies).toHaveLength(1)
    await waitFor(() => expect(save).toHaveProperty('disabled', false))
  })

  it('keeps the settings own failure when no rule was part of the save', async () => {
    // Nothing was saved, so nothing says the rules were.
    forcedSettings = {
      status: 400,
      body: {
        type: 'https://api.fawtir.om/problems/validation-failed',
        title: 'Request rejected',
        status: 400,
        detail: 'digestTime must be HH:mm',
      },
    }
    renderPage()
    await editorReady()
    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())

    expect(
      await screen.findByText('Some details were not accepted. Check the form and try again.'),
    ).toBeTruthy()
    expect(rulesBodies).toHaveLength(0)
    expect(settingsBodies).toHaveLength(1)
    expect(screen.queryByText(/The rules were saved/)).toBeNull()
  })

  it('reads the rules as saved even when the save answers with no rules', async () => {
    // A rules save that answers 204, or without the list: the rules are on file all the same.
    forcedSettings = {
      status: 500,
      body: { type: 'https://api.fawtir.om/problems/internal-error' },
    }
    const answering = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await answering(input, init)
      const isRulesSave = String(input).includes('/bill-reminders/rules') && init?.method === 'PUT'
      return isRulesSave && response.ok ? json(200, {}) : response
    })
    renderPage()
    await editorReady()

    fireEvent.click(within(card('A scanned receipt still unconfirmed')).getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())
    expect(
      await screen.findByText(
        "The rules were saved, but the settings couldn't be saved. Try again.",
      ),
    ).toBeTruthy()
    expect(
      within(card('A scanned receipt still unconfirmed'))
        .getByRole('switch')
        .getAttribute('aria-checked'),
    ).toBe('true')

    // Only the settings are left: Save sends them alone, and taking the edit back leaves nothing.
    forcedSettings = null
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())
    await waitFor(() => expect(settingsBodies).toHaveLength(2))
    expect(rulesBodies).toHaveLength(1)
    expect(await screen.findByText('Saved.')).toBeTruthy()
  })

  it('has nothing left to save once the refused settings edit is taken back', async () => {
    forcedSettings = {
      status: 500,
      body: { type: 'https://api.fawtir.om/problems/internal-error' },
    }
    renderPage()
    await editorReady()

    fireEvent.click(within(card('A scanned receipt still unconfirmed')).getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: /In Fawtir/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())
    await waitFor(() => expect(settingsBodies).toHaveLength(1))
    await screen.findByText('Not done')

    // Back to the delivery on file: the only thing unsaved was the settings edit.
    fireEvent.click(screen.getByRole('button', { name: /One email a day/ }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', true))
    expect(
      within(card('A scanned receipt still unconfirmed'))
        .getByRole('switch')
        .getAttribute('aria-checked'),
    ).toBe('true')
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

  it('says only that nothing would go out when the preview is empty, rules on or off', async () => {
    // The empty preview used to blame switched-off rules. It is just as empty with every rule on
    // and nothing due, or on a held weekend, so it says what is true in all of them.
    seed({ type: 'BEFORE_DUE', offsets: [2, 7], recipients: [HAFIDH], enabled: true })
    renderPage()
    await editorReady()
    expect(await screen.findByText('Nothing would go out today.')).toBeTruthy()
    expect(screen.queryByText(/switched off/)).toBeNull()
    // No badge and no count over an empty list.
    expect(screen.queryByText(/needs? attention this morning/)).toBeNull()
  })

  it('says the same to a company with every rule off, and to a reader', async () => {
    entitlements = { ...MANAGER, permissions: ['invoice.read'] }
    renderPage()
    await editorReady()
    expect(await screen.findByText('Nothing would go out today.')).toBeTruthy()
    expect(screen.queryByText(/switched off/)).toBeNull()
  })

  it('says it in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    await editorReady('قبل استحقاق الفاتورة')
    expect(await screen.findByText('لن يُرسل شيء اليوم.')).toBeTruthy()
    expect(screen.queryByText(/كل قاعدة قد تُفعّل مُطفأة/)).toBeNull()
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

    await editorReady('قبل استحقاق الفاتورة')
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
    // One rule is on, and the recurring row, drawn on, is counted with it.
    expect(
      within(card('فاتورة متكررة لم تصل')).getByRole('switch').getAttribute('aria-checked'),
    ).toBe('true')
    expect(screen.getByText('قاعدتان مفعّلتان')).toBeTruthy()

    // The unnamed person, in Arabic.
    expect(await screen.findByText('بريد واحد · 08:00 · إلى أحد أعضاء الفريق')).toBeTruthy()
    expect(screen.queryByText(new RegExp(GONE))).toBeNull()

    // A refused save: the Arabic sentence, never the server's English detail.
    forced = emptyRuleRefusal('coded')
    await waitFor(() =>
      expect(within(before).getByRole('button', { name: 'قبل يومين' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(within(before).getByRole('button', { name: 'قبل يومين' }))
    await waitFor(() => expect(pressed(before, 'قبل يومين')).toBe('false'))
    const save = screen.getByRole('button', { name: 'حفظ التغييرات' })
    await waitFor(() => expect(save).toHaveProperty('disabled', false))
    fireEvent.click(save)
    expect(await screen.findByText('اختر موعد التذكير، أو أوقف هذا التذكير.')).toBeTruthy()
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
