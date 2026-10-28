import i18n from 'i18next'
import { PLAN } from './plans'
/**
 * Settings — the account's own facts (Figma section "Settings", 135:36090).
 *
 * One book, one clock. Every count, percentage, day-remaining and forecast on the fourteen
 * Settings screens is worked out from the constants here, so the hub card, the branch strip and
 * the plan forecast can never print three different versions of the same number.
 *
 * The design's own screens disagreed about the date: the certificate ("24 days left"), the next
 * bill ("in 27 days"), the activity log header and the export folder name all point at 4
 * September, while the plan screen's arithmetic — 441 invoices at about 17 a day, running out
 * before the 1 October reset — only works near the month's end. 441 is the load-bearing figure
 * (the hub, the branch strip and the plan all print it), so the clock moved to fit it and the
 * day-counts are derived rather than typed.
 */

/** The one clock. Every relative figure below is measured from here. */
export const TODAY = new Date(2026, 8, 26)

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from today to `date`, negative in the past. */
export const daysFrom = (date: Date) => Math.round((date.getTime() - TODAY.getTime()) / DAY_MS)

/** Whole months between two dates, as a person would say it. */
export const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 +
  (to.getMonth() - from.getMonth()) +
  (to.getDate() >= from.getDate() ? 0 : -1)

/**
 * Dates read in the reader's language: "26 September" in English, "٢٦ سبتمبر" in Arabic. They
 * used to be English month names glued together, which left every Arabic settings screen with an
 * English date in the middle of its sentence.
 */
const locale = () => (i18n.language?.startsWith('ar') ? 'ar' : 'en-GB')
const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale(), options).format(date)

/** "26 September" — the long form the screens use in prose. */
export const longDate = (date: Date) => format(date, { day: 'numeric', month: 'long' })

/** "28 Sep" — day and clipped month, for a pill that has to stay on one line. */
export const shortMonth = (date: Date) => format(date, { day: 'numeric', month: 'short' })

/** "26 Sep 2026" — the short form the side panels use. */
export const shortDate = (date: Date) =>
  format(date, { day: 'numeric', month: 'short', year: 'numeric' })

/** "2026-09-26" — the form the export folder is named after. */
export const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

/* ------------------------------------------------------------------ the company */

export const COMPANY = {
  legalName: 'Al Bahja Coffee LLC',
  arabicName: 'شركة البهجة للقهوة ش.م.م',
  tradingAs: 'Al Bahja Coffee',
  commercialRegistration: '1234567',
  vatNumber: 'OM1100234567',
  vatRegisteredSince: '1 April 2021',
  peppolId: '0248:OM1100234567',
  scheme: 'Oman VAT (0248)',
  accessPoint: 'Fawtir',
  /** The day the first invoice reached the Tax Authority through Fawtir. */
  liveSince: new Date(2025, 2, 14),

  street: 'Building 42, Souq Street',
  town: 'Nizwa',
  postalCode: '611',
  country: 'Oman',
  phone: '+968 2544 1180',
  email: 'accounts@albahja.om',
  website: 'albahja.om',

  brandColour: '#2C4EB7',
  receiptLogo: 'plainBlack',
  defaultLanguage: 'both',
  defaultCurrency: 'OMR',
  defaultPaymentTerms: 'NET30',
  invoiceFooterNote: '',

  owner: { name: 'Hafidh Saif', email: 'hafidh@albahja.om' },
}

/* ------------------------------------------------------------------- the volume */

/**
 * What the account has actually done. Stated at the lowest level the screens quote, so the
 * branch strip, the hub card and the plan forecast all add up to the same 441.
 */
export const BOOK = {
  /** This month, by branch. The three sum to the figure the plan screen bills against. */
  byBranch: { nizwa: 536, muscat: 268, sohar: 76 },
  /** Today, by branch. */
  todayByBranch: { nizwa: 9, muscat: 4, sohar: 2 },
  allowance: PLAN.business.documents,
  lastMonth: 936,
  /** Reports sent again after the Authority refused the first attempt. */
  resubmissions: 12,
  busiestDayCount: 44,
  busiestDay: new Date(2026, 8, 14),
  /** Everything ever sent, which is what the retention clock counts. */
  invoicesSent: 4_182,
  customers: 312,
  supplierBills: 612,
  catalogItems: 118,
  /** The one the Authority never accepted — the same INV-1974 the compliance report names. */
  neverReported: 1,
  openQuotations: 3,
  retentionYears: 10,
}

export const INVOICES_THIS_MONTH = BOOK.byBranch.nizwa + BOOK.byBranch.muscat + BOOK.byBranch.sohar

export const RAISED_TODAY =
  BOOK.todayByBranch.nizwa + BOOK.todayByBranch.muscat + BOOK.todayByBranch.sohar

/** The billing period always ends on the first of the next month. */
export const RESETS_ON = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1)

/** Days still to run in the period, counting today. */
export const DAYS_LEFT_IN_MONTH = daysFrom(RESETS_ON)

const DAYS_ELAPSED = TODAY.getDate()

/**
 * Everything the plan screen says about running out, worked out from the count and the clock
 * rather than typed. The design printed "9 days left" and "59 more than you have" against a
 * calendar that gave neither.
 */
export function usageForecast() {
  const used = INVOICES_THIS_MONTH
  const left = BOOK.allowance - used
  const perDay = Math.round(used / DAYS_ELAPSED)
  const daysOfHeadroom = Math.floor(left / perDay)
  const runOut = new Date(TODAY.getTime() + daysOfHeadroom * DAY_MS)
  /** What the rest of the period would need, beyond what is left. */
  const shortfall = DAYS_LEFT_IN_MONTH * perDay - left
  return {
    used,
    left,
    allowance: BOOK.allowance,
    perDay,
    daysOfHeadroom,
    runOut,
    shortfall,
    percent: Math.round((used / BOOK.allowance) * 1000) / 10,
    daysLeft: DAYS_LEFT_IN_MONTH,
  }
}

/* ---------------------------------------------------------------------- the tabs */

export const SETTINGS_TABS = [
  { id: 'all', labelKey: 'settings.tab.all' },
  { id: 'company', labelKey: 'settings.tab.company' },
  { id: 'people', labelKey: 'settings.tab.people' },
  { id: 'integration', labelKey: 'settings.tab.integration' },
  { id: 'billing', labelKey: 'settings.tab.billing' },
  { id: 'records', labelKey: 'settings.tab.records' },
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]['id']

/** Which group each hub card belongs to, and where it goes. */
export type HubCard = {
  id: string
  group: Exclude<SettingsTab, 'all'>
  titleKey: string
  bodyKey?: string
  to?: string
  /** Pill on the card's footer, and the muted line beside it. */
  pillKey: string
  pillTone: 'danger' | 'success' | 'neutral' | 'pending'
  footKey?: string
  /** Cards that fill the row instead of sitting in a third of it. */
  wide?: boolean
}
