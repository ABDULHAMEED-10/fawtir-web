/** The locale the app writes dates in for a language, as `pricing.ts` and `notifications.ts` do. */
export function localeFor(language: string): string {
  return language.startsWith('ar') ? 'ar' : 'en-GB'
}

/** A backend instant as a day, in the reader's language and the browser's time zone. */
export function formatDay(iso: string, language: string): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

/** A backend instant as a day and a time, for a record where the order of events matters. */
export function formatMoment(iso: string, language: string): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * A policy's effective instant, in UTC and labelled so. The operator guide defines a policy day as
 * starting at 00:00 UTC, and the editor stores that instant; shown in the browser's zone it would
 * read as another hour, and west of UTC as the day before the one chosen.
 */
export function formatUtcMoment(iso: string, language: string): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

/**
 * An ISO 3166 code as the country's name in the reader's language. The code itself is shown if the
 * runtime cannot name it, rather than a guess.
 */
export function countryName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([localeFor(language)], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}
