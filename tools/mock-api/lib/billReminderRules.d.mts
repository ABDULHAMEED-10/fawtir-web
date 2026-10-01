/** Types for `billReminderRules.mjs`, so the page's tests can use the mock's checks. */

export type MockReminderRule = {
  type: string
  offsets: number[]
  repeatEveryDays: number | null
  escalationOffsets: number[] | null
  recipients: string[]
  enabled: boolean
}

export type MockReminderSettings = {
  delivery: string
  digestTime: string
  skipWeekends: boolean
  stopWhenInRun: boolean
}

export type MockReply = { status: number; body: Record<string, unknown> }

export const RULES_REQUEST_FIELDS: string[]
export const RULE_REQUEST_FIELDS: string[]
export const SETTINGS_REQUEST_FIELDS: string[]
export const SETTINGS_IGNORED_FIELDS: string[]

export function defaultRules(): MockReminderRule[]
export function defaultSettings(): MockReminderSettings

export function saveRules(
  current: MockReminderRule[],
  body: unknown,
  options?: { refusals?: 'coded' | 'legacy'; users?: string[] },
): MockReply & { rules?: MockReminderRule[] }

export function saveSettings(
  body: unknown,
  options?: { sendingEnabled?: boolean },
): MockReply & { settings?: MockReminderSettings }

export function settingsAnswer(
  settings: MockReminderSettings,
  options?: { sendingEnabled?: boolean },
): MockReminderSettings & { sendingEnabled: boolean }
