import { apiRequest } from '../client'
import { withQuery } from '../query'
import { RECURRING_RECIPIENTS_PATH, loadRecurringRecipients } from './recurringBills'

/**
 * Payables reminders (`BillReminderController`, E-14).
 *
 * Six rule types a tenant can configure, a delivery setting, a preview of what today's sweep
 * would send, and the caller's own inbox. `RECURRING_LATE` is a seventh reminder the ledger can
 * name but **not** a rule: "a recurring bill that has not arrived" is configured per recurring
 * instruction, so it has no row here and the server refuses one.
 */

export const BILL_REMINDERS_PATH = '/v1/bill-reminders'
export const BILL_REMINDER_RULES_PATH = `${BILL_REMINDERS_PATH}/rules`
export const BILL_REMINDER_SETTINGS_PATH = `${BILL_REMINDERS_PATH}/settings`
export const BILL_REMINDER_PREVIEW_PATH = `${BILL_REMINDERS_PATH}/preview`

/** The six a tenant may hold a rule for, in the order the screen lists them. */
export const CONFIGURABLE_RULE_TYPES = [
  'BEFORE_DUE',
  'LATE',
  'DISCOUNT_EXPIRY',
  'APPROVAL_STALE',
  'MISMATCH_STALE',
  'SCAN_UNCONFIRMED',
] as const

export type ConfigurableRuleType = (typeof CONFIGURABLE_RULE_TYPES)[number]

/** Includes the one that is never a rule, because the inbox and preview can still name it. */
export type ReminderRuleTypeDto = ConfigurableRuleType | 'RECURRING_LATE'

export type ReminderSubjectTypeDto = 'BILL' | 'PURCHASE_ORDER' | 'INTAKE' | 'RECURRING_BILL'

export type ReminderDeliveryDto = 'IN_APP' | 'DAILY_DIGEST' | 'IMMEDIATE_EMAIL'

/** `ReminderRule`: V123's `reminder_offsets_in_range` and V148's CHECKs, mirrored. */
export const MAX_OFFSETS = 10
export const MAX_OFFSET_DAYS = 365
export const MAX_RECIPIENTS = 10

/**
 * Which rules fire at nobody unless the rule names someone. The other two derive their
 * recipients from the thing being chased — the approvers who have not decided, and whoever
 * uploaded the intake — so they can be enabled with none.
 */
export const RECIPIENTS_REQUIRED_TO_ENABLE: Record<ConfigurableRuleType, boolean> = {
  BEFORE_DUE: true,
  LATE: true,
  DISCOUNT_EXPIRY: true,
  APPROVAL_STALE: false,
  MISMATCH_STALE: true,
  SCAN_UNCONFIRMED: false,
}

export type ReminderRuleDto = {
  type: ReminderRuleTypeDto
  offsets: number[]
  /** LATE only — "then every N days". The server refuses it on any other type. */
  repeatEveryDays: number | null
  /** APPROVAL_STALE only — when the tenant's owners are brought in. Refused elsewhere. */
  escalationOffsets: number[] | null
  /** Tenant user ids, at most ten. Never an address. */
  recipients: string[]
  enabled: boolean
}

export type ReminderRulesDto = { rules: ReminderRuleDto[] }

export type ReminderSettingsDto = {
  delivery: ReminderDeliveryDto
  /** `HH:mm`. The sweep matches on the hour, so the minutes are advisory. */
  digestTime: string
  skipWeekends: boolean
  stopWhenInRun: boolean
}

/**
 * `SettingsResponse`: the four saved values, and whether this server sends reminders at all
 * (`fawtir.expenditure.reminders.enabled`). Read-only and the same for every company; `false`
 * means rules and settings save, the preview answers, and nothing is ever sent. A server from
 * before the field leaves it out, which says nothing either way. Kept off
 * {@link ReminderSettingsDto} because that type is the request record, field for field.
 */
export type ReminderSettingsAnswerDto = ReminderSettingsDto & { sendingEnabled?: boolean }

export type ReminderPreviewItemDto = {
  ruleType: ReminderRuleTypeDto
  subjectType: ReminderSubjectTypeDto
  subjectId: string
  subjectDisplay: string | null
  daysFromDue: number
  headline: string
  amount: number | null
  currency: string | null
}

export type ReminderPreviewGroupDto = {
  recipientUserId: string
  displayName: string | null
  headline: string
  items: ReminderPreviewItemDto[]
}

export type ReminderPreviewDto = {
  date: string
  total: number
  groups: ReminderPreviewGroupDto[]
}

/**
 * What a notice is about, for the page to write its own sentence. For the six bill and scan rules
 * it is the rule type; the three recurring ones all arrive as rule type `RECURRING_LATE`.
 */
export type ReminderReasonDto =
  | ConfigurableRuleType
  | 'RECURRING_LATE'
  | 'RECURRING_CHASE'
  | 'RECURRING_OUT_OF_RANGE'

/**
 * `InboxItemResponse`. The first eleven fields are the original answer. The rest are what the bell
 * needs and are all optional here: a server from before them leaves them out, and a notice
 * recorded before them carries `subjectDisplay`, `amount` and `currency` as null.
 */
export type ReminderInboxItemDto = {
  id: string
  ruleType: ReminderRuleTypeDto
  subjectType: ReminderSubjectTypeDto
  subjectId: string
  /** Set when the subject is a bill: where its line leads. */
  billId: string | null
  /**
   * Read by `reason`. Before due and discount: zero or negative, the days still to go. Late and
   * the two recurring "late" reasons: days late. Approval, mismatch, scan: days it has waited.
   */
  daysFromDue: number
  firedOn: string
  /** The English sentence the server wrote when it recorded the notice. */
  headline: string
  outcome: string
  createdAt: string
  acknowledgedAt: string | null
  reason?: ReminderReasonDto
  occasion?: 'LATE' | 'CHASE' | 'OUT_OF_RANGE' | null
  occasionDate?: string | null
  /** The bill's number, the uploaded file's name or the recurring bill's name. */
  subjectDisplay?: string | null
  amount?: number | null
  currency?: string | null
  recurringBillId?: string | null
  intakeId?: string | null
  /** `RECURRING_OUT_OF_RANGE` only: the bill that arrived outside the range. */
  arrivedBillId?: string | null
  /** `RECURRING_OUT_OF_RANGE` only: signed, for example `16.67`. */
  variancePercent?: number | null
  read?: boolean
}

export function loadReminderRules(): Promise<ReminderRulesDto> {
  return apiRequest<ReminderRulesDto>(BILL_REMINDER_RULES_PATH)
}

/**
 * Upserts by type: rules left out are kept, not deleted, so one rule can be saved on its own.
 * Recipients still travel with it — the request replaces the rule it names, so a rule saved
 * without the people already on it would quietly drop them.
 */
export function saveReminderRules(rules: ReminderRuleDto[]): Promise<ReminderRulesDto> {
  return apiRequest<ReminderRulesDto>(BILL_REMINDER_RULES_PATH, {
    method: 'PUT',
    body: { rules: rules.map(ruleRequest) },
  })
}

/**
 * `RuleRequest`, field for field. The page edits the object it loaded, and the server refuses a
 * JSON field its record does not declare: a field the response gains later must not ride back on
 * the save. The names are pinned by `billReminders.requestFields.json`.
 */
function ruleRequest(rule: ReminderRuleDto): ReminderRuleDto {
  return {
    type: rule.type,
    offsets: rule.offsets,
    repeatEveryDays: rule.repeatEveryDays,
    escalationOffsets: rule.escalationOffsets,
    recipients: rule.recipients,
    enabled: rule.enabled,
  }
}

export function loadReminderSettings(): Promise<ReminderSettingsAnswerDto> {
  return apiRequest<ReminderSettingsAnswerDto>(BILL_REMINDER_SETTINGS_PATH)
}

/** `SettingsRequest`, field for field, for the same reason as {@link ruleRequest}. */
export function saveReminderSettings(settings: ReminderSettingsDto): Promise<ReminderSettingsDto> {
  const body: ReminderSettingsDto = {
    delivery: settings.delivery,
    digestTime: settings.digestTime,
    skipWeekends: settings.skipWeekends,
    stopWhenInRun: settings.stopWhenInRun,
  }
  return apiRequest<ReminderSettingsDto>(BILL_REMINDER_SETTINGS_PATH, { method: 'PUT', body })
}

export function loadReminderPreview(): Promise<ReminderPreviewDto> {
  return apiRequest<ReminderPreviewDto>(BILL_REMINDER_PREVIEW_PATH)
}

export const INBOX_LIMIT = 20

export function reminderInboxPath(unread: boolean, limit = INBOX_LIMIT) {
  return withQuery(`${BILL_REMINDERS_PATH}/inbox`, { unread: unread ? 'true' : null, limit })
}

export function loadReminderInbox(path: string): Promise<ReminderInboxItemDto[]> {
  return apiRequest<ReminderInboxItemDto[]>(path)
}

/** Scoped to the caller: a reminder addressed to someone else answers 404. */
export async function acknowledgeReminder(id: string): Promise<void> {
  await apiRequest<unknown>(`${BILL_REMINDERS_PATH}/inbox/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' })
}

export const REMINDER_UNREAD_COUNT_PATH = `${BILL_REMINDERS_PATH}/inbox/unread-count`

/** The caller's own unread notices, which no page limit caps. */
export async function loadReminderUnreadCount(): Promise<number> {
  const answer = await apiRequest<{ unread?: number }>(REMINDER_UNREAD_COUNT_PATH)
  return answer.unread ?? 0
}

/** Marks every unread notice addressed to the caller as read; answers how many it marked. */
export async function acknowledgeAllReminders(): Promise<number> {
  const answer = await apiRequest<{ acknowledged?: number } | null>(
    `${BILL_REMINDERS_PATH}/inbox/acknowledge-all`,
    { method: 'POST' },
  )
  return answer?.acknowledged ?? 0
}

/**
 * The people a rule can name: the names-only list a recurring bill also picks from
 * (`GET /recurring-bills/recipients`). It needs `invoice.payment.manage`, the permission that
 * saves these rules, so whoever may save a rule may choose who it tells. It used to be the
 * admin-only `GET /users`, which a Finance Manager could not read.
 *
 * Names only: no e-mail, no role, no username. `name` is null for someone with no name on file
 * and the page words that person. A server from before the route refuses the read, so a caller
 * must still handle having no list.
 */
export type ReminderRecipientDto = { id: string; name: string | null }

/** The read's own URL, so the cache key and the request it stands for cannot drift apart. */
export const POSSIBLE_RECIPIENTS_PATH = RECURRING_RECIPIENTS_PATH

export async function loadPossibleRecipients(): Promise<ReminderRecipientDto[]> {
  const people = await loadRecurringRecipients()
  return people.map((person) => ({ id: person.id, name: person.displayName?.trim() || null }))
}
