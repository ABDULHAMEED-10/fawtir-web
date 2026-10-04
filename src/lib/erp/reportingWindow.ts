import { REPORT_MAX_WINDOW_DAYS } from '../../api/erp/reporting'
import { BUSINESS_TIME_ZONE } from '../format'

/**
 * The received-at window the ERP reports are read over, as the person picks it: two calendar days
 * in the business time zone, both included.
 *
 * Sent as instants, not as dates. The report routes read a bare date as a UTC day
 * (`ReportRequestParameters.parseInstant`), which for Muscat starts four hours late and would
 * leave a document received at 02:00 local time out of the day it was received on. The instant
 * of local midnight, and of the following local midnight as the exclusive end, is the window the
 * person meant.
 */

export type WindowProblem = 'missing' | 'invalid' | 'order' | 'tooLong'

export const DEFAULT_WINDOW_DAYS = 30

const DAY_MS = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Today's date in the business time zone, `yyyy-mm-dd`. */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

export function defaultWindow(now: Date = new Date()): { from: string; to: string } {
  const to = businessToday(now)
  return { from: addDays(to, -(DEFAULT_WINDOW_DAYS - 1)), to }
}

/** The zone's offset from UTC, in minutes, at a given instant. */
function zoneOffsetMinutes(at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return Math.round((wall - at) / 60_000)
}

/** The instant a calendar day begins in the business time zone, as ISO-8601 UTC. */
export function dayStartInstant(date: string): string {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`)
  // Read the offset at the guess, then again at the corrected instant, so a zone whose offset
  // changes around midnight still lands on the right one.
  let instant = utcMidnight - zoneOffsetMinutes(utcMidnight) * 60_000
  instant = utcMidnight - zoneOffsetMinutes(instant) * 60_000
  return new Date(instant).toISOString()
}

export function windowProblem(
  from: string,
  to: string,
  { required }: { required: boolean },
): WindowProblem | null {
  if (!from && !to) return required ? 'missing' : null
  if (!from || !to) return 'missing'
  if (!isIsoDate(from) || !isIsoDate(to)) return 'invalid'
  if (daysBetween(from, to) < 0) return 'order'
  // Both days are included, so the request spans one day more than the difference.
  if (daysBetween(from, to) + 1 > REPORT_MAX_WINDOW_DAYS) return 'tooLong'
  return null
}

/** The request bounds for a valid window: inclusive start, exclusive end. */
export function windowBounds(from: string, to: string): { from: string; to: string } {
  return { from: dayStartInstant(from), to: dayStartInstant(addDays(to, 1)) }
}
