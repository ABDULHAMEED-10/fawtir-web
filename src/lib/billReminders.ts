import {
  MAX_OFFSETS,
  MAX_OFFSET_DAYS,
  type ReminderRuleDto,
  type ReminderRuleTypeDto,
} from '../api/expenditure/billReminders'

/**
 * Rules for the payables reminder screen (E-14), kept out of the page so the server's constraints
 * can be tested without rendering anything.
 */

/**
 * Where each rule's title and note live. The labels were written for the prototype and already
 * cover all seven — including the one that is never a rule, because the inbox and the preview can
 * still name it.
 */
export const RULE_LABEL_KEY: Record<ReminderRuleTypeDto, string> = {
  BEFORE_DUE: 'expenditureReminders.rules.beforeDue',
  LATE: 'expenditureReminders.rules.whenLate',
  DISCOUNT_EXPIRY: 'expenditureReminders.rules.discountExpiry',
  APPROVAL_STALE: 'expenditureReminders.rules.approvalStuck',
  MISMATCH_STALE: 'expenditureReminders.rules.mismatch',
  SCAN_UNCONFIRMED: 'expenditureReminders.rules.scannedReceipt',
  RECURRING_LATE: 'expenditureReminders.rules.recurringMissing',
}

export type OffsetProblem = 'tooMany' | 'outOfRange' | 'repeated' | 'notWhole'

/**
 * What the server would refuse, checked here so a save is not spent learning it.
 *
 * <p>Mirrors V123's {@code reminder_offsets_in_range} and V148's CHECKs: at most ten, each a
 * whole number of days from 0 to 365, and no day named twice — the server folds duplicates out
 * silently, which would look like the page losing an entry.</p>
 */
export function offsetsProblem(offsets: number[]): OffsetProblem | null {
  if (offsets.length > MAX_OFFSETS) return 'tooMany'
  if (offsets.some((value) => !Number.isInteger(value))) return 'notWhole'
  if (offsets.some((value) => value < 0 || value > MAX_OFFSET_DAYS)) return 'outOfRange'
  if (new Set(offsets).size !== offsets.length) return 'repeated'
  return null
}

/**
 * A rule switched on with nothing saying when: no day, no repeat and no escalation. The server
 * refuses exactly this (`REMINDER_RULE_EMPTY`), so the page says so under the rule before a save
 * is spent learning it. A rule that is off may be empty.
 */
export function hasNoTiming(rule: ReminderRuleDto): boolean {
  return (
    rule.enabled &&
    rule.offsets.length === 0 &&
    rule.repeatEveryDays === null &&
    (rule.escalationOffsets ?? []).length === 0
  )
}

/** Whether a rule differs from the one on file, so only what changed is sent. */
export function ruleChanged(saved: ReminderRuleDto[], rule: ReminderRuleDto): boolean {
  const before = saved.find((entry) => entry.type === rule.type)
  if (!before) {
    // Not on file. Worth sending only if it says something — an all-defaults rule nobody
    // touched would otherwise be written on every save.
    return rule.enabled || rule.offsets.length > 0 || rule.recipients.length > 0
  }
  return (
    before.enabled !== rule.enabled ||
    before.repeatEveryDays !== rule.repeatEveryDays ||
    !sameNumbers(before.offsets, rule.offsets) ||
    !sameNumbers(before.escalationOffsets ?? [], rule.escalationOffsets ?? []) ||
    !sameIds(before.recipients, rule.recipients)
  )
}

/**
 * Order does not matter: the server sorts the ladder and answers it ascending, so the same days
 * in another order are the same ladder. A chip switched off and on again is not a change.
 */
function sameNumbers(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort((x, y) => x - y)
  const right = [...b].sort((x, y) => x - y)
  return left.every((value, index) => value === right[index])
}

/** Order does not: a recipient set is a set, and the server dedupes it into one. */
function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((value, index) => value === right[index])
}
