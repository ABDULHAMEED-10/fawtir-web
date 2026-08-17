/**
 * Local-date helpers.
 *
 * Everything is a local `yyyy-mm-dd` string. `toISOString()` converts to UTC and silently loses
 * a day east of Greenwich, which is exactly wrong for Muscat — so it is never used here.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const MONTH_NAMES = MONTHS
export const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (n: number) => String(n).padStart(2, '0')

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

/** `2026-07-18` → `18 Jul 2026`, the format the rest of the app prints. */
export function formatDisplayDate(key: string): string {
  const date = parseDateKey(key)
  if (!date) return ''
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`
}

/** Add days to a date key, staying in local time. */
export function addDays(key: string, days: number): string {
  const date = parseDateKey(key)
  if (!date) return key
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}
