import { formatCount } from './format'
import { changePercent } from './reportPeriod'

/**
 * How the Reports frames print their figures (154:105574): money cards to three decimals,
 * chart figures and footers in whole rials, and a tinted pill for the change against the window
 * before ("↑ 17.4%", "↑ 212", "↓ 38s", "Steady").
 */

export type ChangePill = { text: string; direction: 'up' | 'down' | 'flat' }

function oneDecimal(value: number, language: string) {
  return new Intl.NumberFormat(language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

/** A percentage change pill, or null when the window before holds nothing to compare with. */
export function percentPill(
  current: number,
  previous: number,
  language: string,
): ChangePill | null {
  const change = changePercent(current, previous)
  if (change === null) return null
  return {
    text: `${oneDecimal(Math.abs(change), language)}%`,
    direction: change >= 0 ? 'up' : 'down',
  }
}

/** A count difference pill ("↑ 212"), or null when both windows are empty. */
export function countPill(current: number, previous: number, language: string): ChangePill | null {
  if (current === 0 && previous === 0) return null
  const diff = current - previous
  return { text: formatCount(Math.abs(diff), language), direction: diff >= 0 ? 'up' : 'down' }
}

/** Whole rials, as the charts and their footers print them. */
export function wholeFigure(value: number, language: string): string {
  return formatCount(Math.round(value), language)
}

/** A share with one decimal, without a trailing ".0" ("5%", "97.1%"). */
export function shortPercent(value: number, language: string): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? formatCount(rounded, language) : oneDecimal(rounded, language)
}
