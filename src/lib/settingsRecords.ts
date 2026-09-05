/**
 * Settings › Records — what was changed, what can be taken away, and what closing would cost.
 *
 * Figma 135:41482 (Activity log), 135:41931 (Take your data with you), 135:42365 (Closing the
 * account).
 */

import { BOOK, COMPANY, TODAY, isoDate, longDate, monthsBetween } from './settings'
import { CERT_EXPIRES } from './settingsCompany'
import { MEMBERS } from './settingsPeople'
import { nextBill } from './settingsBilling'

/* ------------------------------------------------------------- activity log */

/** Who or what made a change. The three sources are counted separately on the cards. */
export type Actor =
  { kind: 'person'; name: string; initials: string } | { kind: 'system' } | { kind: 'api' }

export type LogEntry = {
  id: string
  /** Days back from today, so the groups re-label themselves if the clock moves. */
  daysAgo: number
  at: string
  actor: Actor
  bodyKey: string
  values?: Record<string, string | number>
  /** Named links inside the sentence, resolved to routes by the page. */
  link?: { label: string; to: string }
  tags: {
    id: string
    labelKey?: string
    label?: string
    tone: 'plain' | 'api' | 'warn' | 'danger' | 'money'
  }[]
  /** A price or figure that moved, shown as before → after. */
  change?: { from: string; to: string }
  category: 'person' | 'fawtir' | 'api' | 'money'
}

export const LOG: LogEntry[] = [
  {
    id: 'l1',
    daysAgo: 0,
    at: '14:22',
    actor: { kind: 'person', name: 'Hafidh Saif', initials: 'HS' },
    bodyKey: 'activityLog.entry.changedPrice',
    link: { label: 'Flat White', to: '/catalog/flat-white' },
    tags: [{ id: 'catalog', labelKey: 'activityLog.tag.catalog', tone: 'plain' }],
    change: { from: 'OMR 1.400', to: 'OMR 1.450' },
    category: 'person',
  },
  {
    id: 'l2',
    daysAgo: 0,
    at: '11:48',
    actor: { kind: 'api' },
    bodyKey: 'activityLog.entry.apiRaised',
    values: { customer: 'Muscat Grand Hotel' },
    link: { label: 'INV-2047', to: '/invoices/INV-2047' },
    tags: [
      { id: 'api', labelKey: 'activityLog.tag.byApi', tone: 'api' },
      { id: 'amount', label: 'OMR 48.720', tone: 'plain' },
    ],
    category: 'api',
  },
  {
    id: 'l3',
    daysAgo: 0,
    at: '11:47',
    actor: { kind: 'system' },
    bodyKey: 'activityLog.entry.reportedAccepted',
    link: { label: 'INV-2046', to: '/compliance/activity/INV-2046' },
    tags: [
      { id: 'automatic', labelKey: 'activityLog.tag.automatic', tone: 'plain' },
      { id: 'ref', label: 'Fawtara ref OM-2026-0084417', tone: 'plain' },
    ],
    category: 'fawtir',
  },
  {
    id: 'l4',
    daysAgo: 0,
    at: '09:30',
    actor: { kind: 'person', name: 'Hafidh Saif', initials: 'HS' },
    bodyKey: 'activityLog.entry.invited',
    values: { person: 'Rashid Al Amri', role: 'accountant' },
    tags: [
      { id: 'people', labelKey: 'activityLog.tag.people', tone: 'plain' },
      { id: 'money', labelKey: 'activityLog.tag.costsMoney', tone: 'money' },
    ],
    category: 'money',
  },
  {
    id: 'l5',
    daysAgo: 0,
    at: '08:12',
    actor: { kind: 'person', name: 'Yusuf Al Balushi', initials: 'YB' },
    bodyKey: 'activityLog.entry.newDevice',
    values: { branch: 'Muscat' },
    tags: [
      { id: 'signin', labelKey: 'activityLog.tag.signingIn', tone: 'danger' },
      { id: 'device', label: 'iPhone · Muscat', tone: 'plain' },
    ],
    category: 'person',
  },
  {
    id: 'l6',
    daysAgo: 1,
    at: '17:02',
    actor: { kind: 'system' },
    bodyKey: 'activityLog.entry.refusedNoPeppol',
    link: { label: 'INV-2041', to: '/compliance/activity/INV-2041' },
    tags: [
      { id: 'automatic', labelKey: 'activityLog.tag.automatic', tone: 'plain' },
      { id: 'code', label: 'OTA-E-2041', tone: 'danger' },
    ],
    category: 'fawtir',
  },
  {
    id: 'l7',
    daysAgo: 1,
    at: '16:40',
    actor: { kind: 'person', name: 'Maryam Al Hinai', initials: 'MA' },
    bodyKey: 'activityLog.entry.wroteOff',
    values: { count: 1 },
    link: { label: 'Yirgacheffe', to: '/catalog/yirgacheffe' },
    tags: [
      { id: 'stock', labelKey: 'activityLog.tag.stock', tone: 'plain' },
      { id: 'reason', labelKey: 'activityLog.tag.splitBag', tone: 'plain' },
    ],
    category: 'person',
  },
  {
    id: 'l8',
    daysAgo: 1,
    at: '14:15',
    actor: { kind: 'person', name: 'Hafidh Saif', initials: 'HS' },
    bodyKey: 'activityLog.entry.bulkPriceChange',
    values: { count: 34, group: 'Brewed drinks' },
    tags: [
      { id: 'catalog', labelKey: 'activityLog.tag.catalog', tone: 'plain' },
      { id: 'bulk', labelKey: 'activityLog.tag.bulkChange', tone: 'plain' },
      { id: 'delta', label: '+4% across the group', tone: 'plain' },
      { id: 'left', labelKey: 'activityLog.tag.leftAlone', tone: 'plain' },
    ],
    category: 'person',
  },
  {
    id: 'l9',
    daysAgo: 1,
    at: '09:55',
    actor: { kind: 'system' },
    bodyKey: 'activityLog.entry.certChecked',
    tags: [
      { id: 'automatic', labelKey: 'activityLog.tag.automatic', tone: 'plain' },
      { id: 'daily', labelKey: 'activityLog.tag.dailyCheck', tone: 'plain' },
    ],
    category: 'fawtir',
  },
]

/** Days left on the signing certificate at the moment yesterday's check ran. */
export const CERT_DAYS_AT_CHECK = Math.round(
  (CERT_EXPIRES.getTime() - (TODAY.getTime() - 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000),
)

/** Entries this month, split by what made them. Automatic is the remainder. */
export const LOG_BOOK = {
  thisMonth: 1_284,
  byPerson: { Hafidh: 141, Yusuf: 44, others: 33 },
  byApi: 312,
  /** Entries recorded on each of the two days the screen draws in full. */
  today: 38,
  yesterday: 44,
}

export const LOG_BY_PERSON =
  LOG_BOOK.byPerson.Hafidh + LOG_BOOK.byPerson.Yusuf + LOG_BOOK.byPerson.others

export const LOG_AUTOMATIC = LOG_BOOK.thisMonth - LOG_BY_PERSON - LOG_BOOK.byApi

export const LOG_TABS = [
  { id: 'all', labelKey: 'activityLog.tab.all' },
  { id: 'person', labelKey: 'activityLog.tab.people' },
  { id: 'fawtir', labelKey: 'activityLog.tab.fawtir' },
  { id: 'api', labelKey: 'activityLog.tab.api' },
  { id: 'money', labelKey: 'activityLog.tab.money' },
] as const

export type LogTab = (typeof LOG_TABS)[number]['id']

export const matchesLogTab = (entry: LogEntry, tab: LogTab) =>
  tab === 'all' ? true : entry.category === tab

export const countLogTab = (tab: LogTab) => LOG.filter((entry) => matchesLogTab(entry, tab)).length

export const LOG_SORTS = [
  { id: 'newest', labelKey: 'activityLog.sort.newest' },
  { id: 'oldest', labelKey: 'activityLog.sort.oldest' },
]

/* --------------------------------------------------- take your data with you */

export type ExportPart = {
  id: string
  /** The invoices are the legal record, so they cannot be left out. */
  always?: boolean
  megabytes: number
  countKey: string
  count: number
  formats: { label: string; tone: 'plain' | 'brand' | 'danger' }[]
  defaultOn: boolean
}

export const EXPORT_PARTS: ExportPart[] = [
  {
    id: 'invoices',
    always: true,
    megabytes: 1_800,
    countKey: 'export.files',
    count: BOOK.invoicesSent,
    formats: [
      { label: 'UBL XML', tone: 'brand' },
      { label: 'PDF', tone: 'danger' },
      { label: 'Acknowledgements', tone: 'plain' },
    ],
    defaultOn: true,
  },
  {
    id: 'bills',
    megabytes: 340,
    countKey: 'export.bills',
    count: BOOK.supplierBills,
    formats: [
      { label: 'UBL XML', tone: 'brand' },
      { label: 'PDF', tone: 'danger' },
      { label: 'CSV summary', tone: 'plain' },
    ],
    defaultOn: true,
  },
  {
    id: 'contacts',
    megabytes: 2,
    countKey: 'export.records',
    count: 438,
    formats: [
      { label: 'CSV', tone: 'plain' },
      { label: 'JSON', tone: 'plain' },
    ],
    defaultOn: true,
  },
  {
    id: 'catalog',
    megabytes: 1,
    countKey: 'export.items',
    count: BOOK.catalogItems,
    formats: [
      { label: 'CSV', tone: 'plain' },
      { label: 'JSON', tone: 'plain' },
    ],
    defaultOn: true,
  },
  {
    id: 'taxRecord',
    megabytes: 210,
    countKey: 'export.filings',
    count: BOOK.invoicesSent,
    formats: [
      { label: 'TDD XML', tone: 'brand' },
      { label: 'CSV register', tone: 'plain' },
      { label: 'Compliance report', tone: 'danger' },
    ],
    defaultOn: true,
  },
  {
    id: 'activityLog',
    megabytes: 48,
    countKey: 'export.entries',
    count: 31_904,
    formats: [{ label: 'CSV', tone: 'plain' }],
    defaultOn: true,
  },
  {
    id: 'reports',
    megabytes: 14,
    countKey: 'export.reports',
    count: 22,
    formats: [{ label: 'XLSX', tone: 'plain' }],
    defaultOn: false,
  },
]

export const EXPORT_SCHEDULES = ['weekly', 'monthly', 'quarterly', 'yearly']

/** Total size of a selection, in the units the footer prints. */
export function exportSize(selected: string[]) {
  const megabytes = EXPORT_PARTS.filter((part) => part.always || selected.includes(part.id)).reduce(
    (total, part) => total + part.megabytes,
    0,
  )
  return megabytes >= 1000 ? `${(megabytes / 1000).toFixed(1)} GB` : `${Math.round(megabytes)} MB`
}

/** The folder the zip unpacks to, named for the day it was taken. */
export const EXPORT_ROOT = `al-bahja-${isoDate(TODAY)}/`

export const PAST_EXPORTS = [
  {
    id: 'apr',
    date: '12 April 2026',
    scopeKey: 'export.everything',
    size: '1.9 GB',
    noteKey: 'export.forTheAccountant',
    expired: true,
  },
  {
    id: 'jan',
    date: '3 January 2026',
    scopeKey: 'export.invoicesOnly',
    size: '1.1 GB',
    expired: true,
  },
]

export const LAST_EXPORT_ON = new Date(2026, 3, 12)

export const MONTHS_SINCE_EXPORT = monthsBetween(LAST_EXPORT_ON, TODAY)

/* ---------------------------------------------------------- closing the account */

/** Something standing between the account and closing. Two of them stop it outright. */
export type Blocker = {
  id: string
  blocking: boolean
  tone: 'danger' | 'money' | 'pending' | 'clear'
  actionKey?: string
  to?: string
  values?: Record<string, string | number>
}

export const CLOSING_BLOCKERS: Blocker[] = [
  {
    id: 'neverAccepted',
    blocking: true,
    tone: 'danger',
    actionKey: 'closing.fixIt',
    to: '/compliance/activity/report',
    values: { invoice: 'INV-1974' },
  },
  {
    id: 'billNotCharged',
    blocking: true,
    tone: 'money',
    actionKey: 'closing.settleItNow',
    values: { amount: '49.000', date: longDate(nextBill().dueOn) },
  },
  {
    id: 'openQuotations',
    blocking: false,
    tone: 'pending',
    actionKey: 'closing.seeThem',
    to: '/quotations',
    values: { count: BOOK.openQuotations },
  },
  { id: 'nothingOwed', blocking: false, tone: 'clear' },
]

export const BLOCKING_COUNT = CLOSING_BLOCKERS.filter((blocker) => blocker.blocking).length

export const CLOSING_STAGES = [
  { id: 'theDay', tone: 'now' as const },
  { id: 'thirtyDays', tone: 'later' as const },
  { id: 'afterThirty', tone: 'later' as const },
  { id: 'tenYears', tone: 'final' as const },
]

export const REOPEN_WINDOW_DAYS = 30

/** The day the oldest invoice falls out of retention. */
export const RETENTION_ENDS = new Date(
  COMPANY.liveSince.getFullYear() + BOOK.retentionYears,
  COMPANY.liveSince.getMonth(),
  COMPANY.liveSince.getDate(),
)

export const ACCOUNT_FACTS = [
  { id: 'invoicesSent', value: BOOK.invoicesSent.toLocaleString('en-US') },
  { id: 'oldest', value: 'liveSince' },
  { id: 'customers', value: BOOK.customers.toLocaleString('en-US') },
  { id: 'peopleWithLogin', value: String(MEMBERS.filter((m) => !m.invited).length) },
  { id: 'neverReported', value: String(BOOK.neverReported), danger: true },
  { id: 'withYouSince', value: 'months' },
]

export const MONTHS_WITH_FAWTIR = monthsBetween(COMPANY.liveSince, TODAY)

export const KEEP_LIST = ['everyInvoice', 'taxRecord', 'contactLists', 'yourIdentifiers']

export const LOSE_LIST = ['raiseOrReport', 'peppolPlace', 'allLogins', 'reportsAndDashboards']

export { TODAY, longDate }
