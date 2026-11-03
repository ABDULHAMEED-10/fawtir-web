/**
 * The signed envelope as a reviewer sees it. From fix/b39-off cf49f0447 the server itself sends the
 * buyer's identifier and contact as `[masked]` (C3); an earlier build sent them whole. The screen
 * keeps the last four characters of a value that still arrives whole, and shows the server's
 * marker as it is, so the two never compound into a half-masked marker.
 */
const MASKED = new Set(['identifierValue', 'contact'])
const SERVER_MASK = '[masked]'

function mask(text: string): string {
  if (text === SERVER_MASK) return text
  return text.length <= 4 ? '••••' : `••••${text.slice(-4)}`
}

export function maskedPayload(value: unknown, key: string | null = null): unknown {
  if (typeof value === 'string') return key !== null && MASKED.has(key) ? mask(value) : value
  if (Array.isArray(value)) return value.map((item) => maskedPayload(item, null))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([name, member]) => [
        name,
        maskedPayload(member, name),
      ]),
    )
  }
  return value
}

/**
 * Every hold, key, candidate and sale time on the offline holds page, in Muscat time with the zone
 * printed beside it (owner W41-2 Option 1, round 9), so a reviewer comparing it with a receipt or a
 * device clock never takes it for their own zone. 'shortOffset' rather than 'short': 'short' prints
 * whatever abbreviation the ICU data holds for Asia/Muscat ("GST" in Node, so in jsdom, and not the
 * same in every browser), while 'shortOffset' is derived from the offset itself and reads "GMT+4"
 * wherever it is supported (ES2021 Intl.DateTimeFormat). Display only: the instant and every rule
 * judged on it are the server's.
 *
 * Safari before 15.4 and Chrome before 95 refuse 'shortOffset' with a RangeError, which would take
 * the whole page down (PRV43-OFF L-3). There the zone is written out instead: Asia/Muscat has kept
 * +04:00 with no daylight saving, so the literal is the same text 'shortOffset' prints.
 */
export function offlineHoldTime(instant: string | null | undefined): string {
  if (!instant) return ''
  const at = new Date(instant)
  try {
    return at.toLocaleString('en-GB', {
      timeZone: 'Asia/Muscat',
      hour12: false,
      timeZoneName: 'shortOffset',
    })
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return `${at.toLocaleString('en-GB', { timeZone: 'Asia/Muscat', hour12: false })} GMT+4`
  }
}
