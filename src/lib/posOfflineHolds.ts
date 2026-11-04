import type { TFunction } from 'i18next'
import type { OfflineHeldFor } from '../api/pos/offlineBinding'

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

/**
 * A message key under `pos.offline.detail.heldFor` and what fills it. With `line` the message is
 * shown after that line's number, reusing the approved `invoiceIssue.stockWarning.line` wrapper
 * (PRV43-OFF3 L-2). `notOnSaleNow` is owner-approved in English (Round 27); its Arabic is a draft
 * awaiting native sign-off.
 */
export type HeldForText = {
  key: string
  values: Record<string, string | number>
  line?: number
}

/** The text of one entry of {@link heldForText}, in the current language. */
export function heldForMessage(t: TFunction, entry: HeldForText): string {
  const text = t(`pos.offline.detail.heldFor.${entry.key}`, entry.values)
  return entry.line === undefined ? text : t('invoiceIssue.stockWarning.line', { line: entry.line, text })
}

const KNOWN_CAUSES = new Set([
  'LEGACY_DISCOUNT_MAKER_UNPROVEN',
  'LEGACY_PRICE_BELOW_CATALOGUE',
  'LEGACY_PRICE_UNIT_NOT_COMPARABLE',
  'LEGACY_PRICE_NOT_ESTABLISHED',
])

/** Three places as the till prints, more when the price has them (a catalogue price keeps six). */
function price(value: number | null): string {
  if (value === null) return ''
  const places = String(value).split('.')[1]?.length ?? 0
  return value.toFixed(Math.min(6, Math.max(3, places)))
}

/**
 * The server's causes and the lines they name, as messages (PRV43-OFF2 N-1). A cause this build
 * does not know is shown by its code rather than dropped: the reviewer must see every reason the
 * server gave. Nothing here judges the sale; it only says what the server recorded.
 */
export function heldForText(heldFor: OfflineHeldFor): {
  causes: HeldForText[]
  lines: HeldForText[]
} {
  const causes = heldFor.causes.map((cause) =>
    KNOWN_CAUSES.has(cause)
      ? { key: `cause.${cause}`, values: {} }
      : { key: 'unknownCause', values: { cause } },
  )
  const lines = heldFor.lines.flatMap((held): HeldForText[] => {
    const values = {
      line: held.line,
      price: price(held.unitPrice),
      catalogue: price(held.cataloguePriceAtFiling),
      unit: held.unitCode ?? '',
      productUnit: held.productUnitCode ?? '',
    }
    if (held.cause === 'LEGACY_PRICE_UNIT_NOT_COMPARABLE') {
      const unit: HeldForText = { key: 'unit', values }
      // Its own key, not pos.warning.POS_PRODUCT_NOT_SELLABLE_ACCEPTED: that one is the till's sale
      // warning (PosDonePage, PosRefundPage) and keeps its meaning. notOnSale says the product is off
      // sale, never when it went off sale, so the wording must not claim an order (owner Round 27).
      return held.notOnSale ? [unit, { key: 'notOnSaleNow', values: { line: held.line } }] : [unit]
    }
    if (held.cause === 'LEGACY_PRICE_NOT_ESTABLISHED') return [{ key: 'notEstablished', values }]
    if (held.cause === 'LEGACY_PRICE_BELOW_CATALOGUE') {
      return [{ key: held.notOnSale ? 'belowNotOnSale' : 'below', values }]
    }
    return [{ key: 'unknownCause', values: { cause: held.cause }, line: held.line }]
  })
  return { causes, lines }
}
