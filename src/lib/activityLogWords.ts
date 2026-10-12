import type { i18n as I18n } from 'i18next'

/**
 * "ApiKeyRotationStarted" as "Api key rotation started", "OAuthTokenIssued" as "O auth token
 * issued". Only reached for an event type this build has no words for: the server adds event
 * types before the front end learns them, and the owner's QA found every one of those reading
 * "Recorded event", which tells a reader nothing. The type's own name is the most honest thing
 * left to show.
 */
export function readableCode(code: string): string {
  const words = code.match(/[A-Z]+\d*(?![a-z])|[A-Z]?[a-z]+\d*|\d+/g) ?? [code]
  return words
    .map((word, index) => {
      // An acronym the server spelled in capitals (ERP, SMP, AS4) stays one.
      if (word.length > 1 && word === word.toUpperCase()) return word
      const lower = word.toLowerCase()
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower
    })
    .join(' ')
}

/**
 * The words for an activity-log event. "Recorded event" is kept for an entry that names no
 * event at all; an unknown name is shown readably rather than hidden behind it.
 */
export function activityEventWords(i18n: I18n, eventType: string | null | undefined): string {
  if (!eventType) return i18n.t('activityLog.event.other')
  const key = `activityLog.event.${eventType}`
  return i18n.exists(key) ? i18n.t(key) : readableCode(eventType)
}
