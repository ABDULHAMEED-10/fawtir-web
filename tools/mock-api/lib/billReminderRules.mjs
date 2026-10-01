/**
 * The reminder rules and settings as the backend checks them, for the mock API and for the page's
 * tests. A stand-in that takes any body hides what the real server refuses, so this follows
 * `BillReminderController`, `ReminderRule`, `ReminderSettings` and `ReminderRuleService`:
 *
 * - a field the request record does not declare is refused (`fail-on-unknown-properties`);
 * - days are folded and sorted ascending, people are folded;
 * - a rule's own refusals carry their code;
 * - `PUT /rules` replaces the rules it names and answers all six; `PUT /settings` replaces whole.
 *
 * One thing is not checked: that a person's id is a UUID. The mock's own user ids are not.
 *
 * Kept outside `routes/`, where every file is loaded as a route module.
 */

/** `RulesRequest`, `RuleRequest` and `SettingsRequest`: the only fields each body may carry. */
export const RULES_REQUEST_FIELDS = ['rules']
export const RULE_REQUEST_FIELDS = [
  'type',
  'offsets',
  'repeatEveryDays',
  'escalationOffsets',
  'recipients',
  'enabled',
]
export const SETTINGS_REQUEST_FIELDS = ['delivery', 'digestTime', 'skipWeekends', 'stopWhenInRun']
/**
 * Read-only on the settings answer. The record also declares it, so a body that carries it back
 * is read, and the value is ignored. The page does not send it.
 */
export const SETTINGS_IGNORED_FIELDS = ['sendingEnabled']

const CONFIGURABLE = [
  'BEFORE_DUE',
  'LATE',
  'DISCOUNT_EXPIRY',
  'APPROVAL_STALE',
  'MISMATCH_STALE',
  'SCAN_UNCONFIRMED',
]
const RULE_TYPES = [...CONFIGURABLE, 'RECURRING_LATE']
const NEEDS_RECIPIENT = ['BEFORE_DUE', 'LATE', 'DISCOUNT_EXPIRY', 'MISMATCH_STALE']
const DELIVERIES = ['IN_APP', 'DAILY_DIGEST', 'IMMEDIATE_EMAIL']
const MAXIMUM_DAYS = 365
const MAXIMUM_OFFSETS = 10
const MAXIMUM_RECIPIENTS = 10

const PROBLEMS = 'https://api.fawtir.om/problems/'

const rule = (type, offsets, repeatEveryDays = null, escalationOffsets = null) => ({
  type,
  offsets,
  repeatEveryDays,
  escalationOffsets,
  recipients: [],
  enabled: false,
})

/** `ReminderRule.defaults()` as `GET /rules` answers them for a company that has saved nothing. */
export function defaultRules() {
  return [
    rule('BEFORE_DUE', [0, 2, 7]),
    rule('LATE', [1], 3),
    rule('DISCOUNT_EXPIRY', [3]),
    rule('APPROVAL_STALE', [2, 3], null, [5, 7]),
    rule('MISMATCH_STALE', [1, 3, 7]),
    rule('SCAN_UNCONFIRMED', [2, 7]),
  ]
}

/** `ReminderSettings.defaults()`. */
export function defaultSettings() {
  return { delivery: 'DAILY_DIGEST', digestTime: '08:00', skipWeekends: true, stopWhenInRun: true }
}

class Refused extends Error {
  constructor(code, detail) {
    super(detail)
    this.code = code
  }
}

/** A body Jackson cannot read into the record: unknown field, unknown enum word, wrong type. */
const malformed = () => ({
  status: 400,
  body: {
    type: `${PROBLEMS}malformed-request`,
    title: 'Malformed request',
    status: 400,
    detail: 'The request body is missing or malformed.',
  },
})

/** Bean validation on the record: a required field left out. */
const invalid = (field) => ({
  status: 400,
  body: {
    type: `${PROBLEMS}validation-failed`,
    title: 'Validation failed',
    status: 400,
    detail: 'One or more request fields are invalid.',
    errors: [{ field, message: 'must not be null' }],
  },
})

/**
 * A rule the domain refuses. `coded` is the Expenditure refusal, with the rule's code in `error`;
 * `legacy` is what the controller answered before it kept the code: a plain validation failure.
 */
const refusal = (code, detail, shape) =>
  shape === 'legacy'
    ? {
        status: 400,
        body: {
          type: `${PROBLEMS}validation-failed`,
          title: 'Request rejected',
          status: 400,
          detail,
        },
      }
    : {
        status: 400,
        body: {
          type: `${PROBLEMS}expenditure-refused`,
          title: 'Request refused',
          status: 400,
          detail,
          error: code,
        },
      }

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const onlyKnown = (value, fields) => Object.keys(value).every((key) => fields.includes(key))
const isWhole = (value) => typeof value === 'number' && Number.isInteger(value)
const isDays = (value) =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.every((day) => day === null || isWhole(day)))

/** `ReminderRule.normaliseOffsets`: folded and sorted, refused outside the range. */
function normaliseOffsets(raw, prefix) {
  if (raw === undefined || raw === null) return []
  const unique = new Set()
  for (const offset of raw) {
    if (offset === null)
      throw new Refused(`${prefix}_REQUIRED`, 'An offset must be a number of days')
    if (offset < 0 || offset > MAXIMUM_DAYS)
      throw new Refused(
        `${prefix}_OUT_OF_RANGE`,
        `An offset must be between 0 and ${MAXIMUM_DAYS} days, got: ${offset}`,
      )
    unique.add(offset)
  }
  if (unique.size > MAXIMUM_OFFSETS)
    throw new Refused(
      `${prefix}S_TOO_MANY`,
      `A rule may have at most ${MAXIMUM_OFFSETS} offsets, got: ${unique.size}`,
    )
  return [...unique].sort((a, b) => a - b)
}

/** The `ReminderRule` constructor, check for check and in its order. */
function toRule(request) {
  const type = request.type
  if (!CONFIGURABLE.includes(type))
    throw new Refused(
      'REMINDER_RULE_NOT_CONFIGURABLE',
      `${type} is configured per recurring bill, not as a tenant rule`,
    )
  const offsets = normaliseOffsets(request.offsets, 'REMINDER_RULE_OFFSET')
  const repeatEveryDays = request.repeatEveryDays ?? null
  if (repeatEveryDays !== null) {
    if (type !== 'LATE')
      throw new Refused(
        'REMINDER_RULE_REPEAT_NOT_ALLOWED',
        `Only the LATE rule repeats; ${type} does not`,
      )
    if (repeatEveryDays < 1 || repeatEveryDays > MAXIMUM_DAYS)
      throw new Refused(
        'REMINDER_RULE_REPEAT_OUT_OF_RANGE',
        `A repeat must be between 1 and ${MAXIMUM_DAYS} days, got: ${repeatEveryDays}`,
      )
  }
  let escalationOffsets = request.escalationOffsets ?? null
  if (escalationOffsets !== null) {
    if (type !== 'APPROVAL_STALE')
      throw new Refused(
        'REMINDER_RULE_ESCALATION_NOT_ALLOWED',
        `Only APPROVAL_STALE escalates to the owners; ${type} does not`,
      )
    escalationOffsets = normaliseOffsets(escalationOffsets, 'REMINDER_RULE_ESCALATION')
  }
  const named = request.recipients ?? []
  if (named.some((id) => id === null))
    throw new Refused('REMINDER_RULE_RECIPIENT_REQUIRED', 'A recipient must be a user id')
  const recipients = [...new Set(named)]
  if (recipients.length > MAXIMUM_RECIPIENTS)
    throw new Refused(
      'REMINDER_RULE_TOO_MANY_RECIPIENTS',
      `A reminder rule may name at most ${MAXIMUM_RECIPIENTS} recipients, got: ${recipients.length}`,
    )
  const enabled = request.enabled ?? false
  if (enabled) {
    const hasRung =
      offsets.length > 0 ||
      repeatEveryDays !== null ||
      (escalationOffsets !== null && escalationOffsets.length > 0)
    if (!hasRung)
      throw new Refused(
        'REMINDER_RULE_EMPTY',
        `An enabled ${type} rule needs at least one offset; disable it instead of leaving it empty`,
      )
    if (NEEDS_RECIPIENT.includes(type) && recipients.length === 0)
      throw new Refused(
        'REMINDER_RULE_NEEDS_RECIPIENT',
        `An enabled ${type} rule needs at least one recipient`,
      )
  }
  return { type, offsets, repeatEveryDays, escalationOffsets, recipients, enabled }
}

/**
 * `PUT /bill-reminders/rules`.
 *
 * @param current the six rules on file, in the screen's order
 * @param body    the parsed request body
 * @param options `refusals`: `coded` (default) or `legacy`. `users`: the ids of the company's
 *                active users; when given, a person the request adds who is not one of them is
 *                refused, while people already on the rule travel back untouched
 * @returns `{ status, body }`, and on a 200 also `rules`, the six to keep on file
 */
export function saveRules(current, body, options = {}) {
  const shape = options.refusals ?? 'coded'
  if (!isObject(body) || !onlyKnown(body, RULES_REQUEST_FIELDS)) return malformed()
  if (body.rules === undefined || body.rules === null) return invalid('rules')
  if (!Array.isArray(body.rules)) return malformed()
  for (const [index, request] of body.rules.entries()) {
    if (!isObject(request) || !onlyKnown(request, RULE_REQUEST_FIELDS)) return malformed()
    if (request.type === undefined || request.type === null) return invalid(`rules[${index}].type`)
    if (!RULE_TYPES.includes(request.type)) return malformed()
    if (!isDays(request.offsets) || !isDays(request.escalationOffsets)) return malformed()
    if (request.repeatEveryDays != null && !isWhole(request.repeatEveryDays)) return malformed()
    if (request.enabled !== undefined && typeof request.enabled !== 'boolean') return malformed()
    if (
      request.recipients != null &&
      !(
        Array.isArray(request.recipients) &&
        request.recipients.every((id) => id === null || typeof id === 'string')
      )
    )
      return malformed()
  }
  try {
    const requested = body.rules.map((request) => toRule(request))
    const seen = new Set()
    for (const next of requested) {
      if (seen.has(next.type))
        throw new Refused('REMINDER_RULE_DUPLICATE', `Rule ${next.type} appears twice`)
      seen.add(next.type)
    }
    if (options.users) {
      for (const next of requested) {
        const stored = current.find((saved) => saved.type === next.type)?.recipients ?? []
        const stranger = next.recipients.find(
          (id) => !stored.includes(id) && !options.users.includes(id),
        )
        if (stranger !== undefined)
          throw new Refused(
            'REMINDER_RULE_RECIPIENT_UNKNOWN',
            `${stranger} is not an active user of this company`,
          )
      }
    }
    const rules = CONFIGURABLE.map(
      (type) =>
        requested.find((next) => next.type === type) ??
        current.find((saved) => saved.type === type) ??
        defaultRules().find((fallback) => fallback.type === type),
    )
    return { status: 200, body: { rules }, rules }
  } catch (error) {
    if (error instanceof Refused) return refusal(error.code, error.message, shape)
    throw error
  }
}

/** `LocalTime.parse`: `HH:mm`, seconds allowed. Answered back as `LocalTime.toString()` writes it. */
function parseDigestTime(text) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(text)
  if (!match) return null
  const [, hours, minutes, seconds] = match
  return seconds && seconds !== '00' ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`
}

/**
 * `PUT /bill-reminders/settings`. The four fields replace what is on file; a switch left out is
 * off, as a primitive boolean is. The answer carries `sendingEnabled`, which no body can change.
 *
 * @returns `{ status, body }`, and on a 200 also `settings`, the four values to keep on file
 */
export function saveSettings(body, options = {}) {
  const declared = [...SETTINGS_REQUEST_FIELDS, ...SETTINGS_IGNORED_FIELDS]
  if (!isObject(body) || !onlyKnown(body, declared)) return malformed()
  if (body.sendingEnabled != null && typeof body.sendingEnabled !== 'boolean') return malformed()
  if (body.delivery === undefined || body.delivery === null) return invalid('delivery')
  if (!DELIVERIES.includes(body.delivery)) return malformed()
  if (body.digestTime === undefined || body.digestTime === null) return invalid('digestTime')
  if (typeof body.digestTime !== 'string') return malformed()
  for (const flag of ['skipWeekends', 'stopWhenInRun'])
    if (body[flag] !== undefined && typeof body[flag] !== 'boolean') return malformed()
  const digestTime = parseDigestTime(body.digestTime)
  if (digestTime === null)
    return {
      status: 400,
      body: {
        type: `${PROBLEMS}validation-failed`,
        title: 'Request rejected',
        status: 400,
        detail: 'digestTime must be HH:mm',
      },
    }
  const settings = {
    delivery: body.delivery,
    digestTime,
    skipWeekends: body.skipWeekends ?? false,
    stopWhenInRun: body.stopWhenInRun ?? false,
  }
  return { status: 200, body: settingsAnswer(settings, options), settings }
}

/** `SettingsResponse`: the four saved values and whether this server sends reminders at all. */
export function settingsAnswer(settings, options = {}) {
  return { ...settings, sendingEnabled: options.sendingEnabled ?? true }
}
