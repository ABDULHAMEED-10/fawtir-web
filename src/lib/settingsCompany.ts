/**
 * Settings › Company — branches, and the Peppol identity that lets any of them invoice.
 *
 * Figma 135:37541 (Branches), 135:37971 (Add a branch), 135:36580 (Peppol and tax).
 */

import { PLAN } from './plans'
import { BOOK, COMPANY, TODAY, daysFrom, INVOICES_THIS_MONTH } from './settings'
import { MEMBERS } from './settingsPeople'

/* ------------------------------------------------------------------- branches */

export type Branch = {
  id: string
  name: string
  initials: string
  headOffice?: boolean
  state: 'open' | 'closed'
  address: string
  addressNoteKey?: string
  /** The invoice series. The head office has no prefix, so its numbers are the company's. */
  prefix: string
  numberingKey: string
  nextNumber: string
  invoicesThisMonth: number
  turnoverThisMonth: string
  turnoverNoteKey?: string
  /** Initials of everyone who works here — the roster the people count is taken from. */
  staff: string[]
  managedBy: string
  tills: number
  tillNoteKey: string
  /** Only a closed branch carries these. */
  closedOn?: string
  closedInvoices?: number
  needsTill?: boolean
}

export const BRANCHES: Branch[] = [
  {
    id: 'nizwa',
    name: 'Nizwa',
    initials: 'NZ',
    headOffice: true,
    state: 'open',
    address: 'Building 42, Souq Street, Nizwa 611',
    addressNoteKey: 'branches.theRegisteredAddress',
    prefix: '',
    numberingKey: 'branches.noPrefix',
    nextNumber: '2,047',
    invoicesThisMonth: BOOK.byBranch.nizwa,
    turnoverThisMonth: '21,480.600',
    staff: ['HS', 'YB', 'MA', 'SK'],
    managedBy: 'Hafidh',
    tills: 2,
    tillNoteKey: 'branches.bothUsedToday',
  },
  {
    id: 'muscat',
    name: 'Muscat',
    initials: 'MC',
    state: 'open',
    address: 'Shop 8, Al Mouj Marina, Muscat 130',
    prefix: 'MC',
    numberingKey: 'branches.ownSeries',
    nextNumber: '0412',
    invoicesThisMonth: BOOK.byBranch.muscat,
    turnoverThisMonth: '14,204.900',
    staff: ['YB', 'MA'],
    managedBy: 'Yusuf',
    tills: 1,
    tillNoteKey: 'branches.lastUsed40Minutes',
  },
  {
    id: 'sohar',
    name: 'Sohar',
    initials: 'SH',
    state: 'open',
    needsTill: true,
    address: 'Unit 12, Sohar Industrial Estate, Sohar 311',
    prefix: 'SH',
    numberingKey: 'branches.ownSeries',
    nextNumber: '0039',
    invoicesThisMonth: BOOK.byBranch.sohar,
    turnoverThisMonth: '8,412.400',
    turnoverNoteKey: 'branches.wholesaleOnly',
    staff: ['SK'],
    managedBy: 'Salim',
    tills: 0,
    tillNoteKey: 'branches.raisedOnTheWeb',
  },
  {
    id: 'salalah',
    name: 'Salalah',
    initials: 'SL',
    state: 'closed',
    address: 'Was at Al Haffa Road, Salalah 211',
    addressNoteKey: 'branches.leaseEnded',
    prefix: 'SL',
    numberingKey: 'branches.ownSeries',
    nextNumber: '—',
    invoicesThisMonth: 0,
    turnoverThisMonth: '0.000',
    staff: [],
    managedBy: '',
    tills: 0,
    tillNoteKey: 'branches.raisedOnTheWeb',
    closedOn: '30 Apr',
    closedInvoices: 612,
  },
]

export const OPEN_BRANCHES = BRANCHES.filter((branch) => branch.state === 'open')

/** Everyone who can work at a branch — a roster name, or a role that reaches all of them. */
export const PEOPLE_ACROSS_BRANCHES = MEMBERS.length

/**
 * People rostered at more than one branch — the reason the headcount is not a simple sum.
 * The design said two; its own rosters put Salim at Nizwa as well as Sohar, which makes three.
 */
export const PEOPLE_AT_MORE_THAN_ONE = (() => {
  const seen = new Map<string, number>()
  for (const branch of OPEN_BRANCHES) {
    for (const person of branch.staff) seen.set(person, (seen.get(person) ?? 0) + 1)
  }
  return [...seen.values()].filter((count) => count > 1).length
})()

/** The branch that raises the most, as a share out of ten. */
export const BUSIEST_BRANCH = (() => {
  const top = [...OPEN_BRANCHES].sort((a, b) => b.invoicesThisMonth - a.invoicesThisMonth)[0]
  return {
    name: top.name,
    inEveryTen: Math.round((top.invoicesThisMonth / INVOICES_THIS_MONTH) * 10),
  }
})()

export const BRANCH_PLAN = {
  included: PLAN.business.branches ?? Infinity,
  extraMonthly: (PLAN.business.extraBranch ?? 0).toFixed(3),
}

export const BRANCHES_EVER = BRANCHES.length

/* ----------------------------------------------------------------- add a branch */

/** Sur is the worked example the design draws — a fourth branch about to open. */
export const NEW_BRANCH = {
  name: 'Sur',
  arabicName: 'صور',
  town: 'Sur',
  postalCode: '411',
  governorate: 'ashSharqiyahSouth',
  opens: '1 October 2026',
  prefix: 'SR',
  numbering: 'own',
}

export { GOVERNORATES } from './governorates'

/** What a new branch takes from the company rather than setting for itself. */
export const BRANCH_INHERITS = [
  { id: 'vat', value: COMPANY.vatNumber, mono: true },
  { id: 'peppol', value: COMPANY.peppolId, mono: true },
  { id: 'company', value: COMPANY.legalName },
  { id: 'logo', valueKey: 'addBranch.shared' },
  { id: 'tax', valueKey: 'addBranch.fivePercentStandard' },
]

export const BRANCH_BEHAVIOUR = [
  { id: 'sharesCatalog', on: true },
  { id: 'countsStock', on: true },
  { id: 'setUpTill', on: true },
  { id: 'showInReports', on: true },
]

/** The first number the new series would issue, from the prefix as typed. */
export const firstInvoiceFor = (prefix: string) =>
  prefix.trim() ? `${prefix.trim().toUpperCase()}-INV-0001` : 'INV-0001'

/* --------------------------------------------------------------- peppol and tax */

export type Certificate = {
  id: string
  /** Where it sits against its own life, which is what the bar and the colour show. */
  expires?: Date
  /** Credentials that roll over on their own have no expiry to count down. */
  renewsItself?: boolean
  issuedBy: string
  /** How long the certificate runs, so "days left" can be drawn as a share of it. */
  lifetimeDays?: number
}

export const CERTIFICATES: Certificate[] = [
  {
    id: 'signing',
    expires: new Date(2026, 8, 28),
    issuedBy: 'Oman CA',
    lifetimeDays: 365,
  },
  {
    id: 'transport',
    expires: new Date(2027, 1, 26),
    issuedBy: 'OpenPeppol',
    lifetimeDays: 730,
  },
  { id: 'reporting', renewsItself: true, issuedBy: 'Fawtara' },
]

/** Days left, and how far through its life the certificate is. */
export function certificateState(certificate: Certificate) {
  if (!certificate.expires) return { daysLeft: null, spent: 0, tone: 'ok' as const }
  const daysLeft = daysFrom(certificate.expires)
  const lifetime = certificate.lifetimeDays ?? 365
  const spent = Math.min(1, Math.max(0, (lifetime - daysLeft) / lifetime))
  /**
   * Green is reserved for a credential that needs nothing from anyone. Anything with a date on
   * it stays amber however far off it is, because somebody will have to act on it eventually.
   */
  const tone = daysLeft <= 14 ? ('urgent' as const) : ('soon' as const)
  return { daysLeft, spent, tone }
}

export const SIGNING_CERTIFICATE = CERTIFICATES[0]

/** Fawtir warns a month out; the design's stepper starts from that warning. */
export const CERT_WARNED_ON = new Date(2026, 7, 29)

export const RENEWAL_STEPS = [
  { id: 'warned', state: 'done' as const },
  { id: 'ask', state: 'current' as const },
  { id: 'issue', state: 'future' as const },
  { id: 'upload', state: 'future' as const },
]

/** How the business appears to anyone else on the network. */
export const PEPPOL_VISIBILITY = [
  { id: 'directory', on: true },
  { id: 'acceptBills', on: true },
  { id: 'acceptSelfBilling', on: true },
  { id: 'emailCopy', on: false },
]

export const REGISTRATION_ROWS = [
  { id: 'peppolId', value: COMPANY.peppolId, mono: true },
  { id: 'scheme', value: COMPANY.scheme },
  { id: 'accessPoint', value: COMPANY.accessPoint },
  { id: 'liveSince', value: 'liveSince' },
  { id: 'vatNumber', value: COMPANY.vatNumber, mono: true },
  { id: 'fawtaraAccount', valueKey: 'peppolTax.linked' },
]

export const CERT_DAYS_LEFT = daysFrom(SIGNING_CERTIFICATE.expires as Date)

/** Used by the hub card, which shows the expiry rather than the countdown. */
export const CERT_EXPIRES = SIGNING_CERTIFICATE.expires as Date

export { TODAY }
