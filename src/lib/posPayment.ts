import { BAISA, OPEN_SALE, totalsFor } from './pos'

/**
 * Taking the money (Figma 143:18592) and what happens after (143:18997).
 *
 * A sale can be settled several ways at once — the design splits 6.000 across a card and cash —
 * so payment is a list rather than a choice, and "still to collect" is the sale less what has
 * been taken. The design's header printed 3.000 still to collect while its own footer said all
 * 6.000 was covered; here it is derived, so the two cannot disagree.
 */

export type MethodId = 'cash' | 'card' | 'transfer' | 'account'

export const METHODS: { id: MethodId; labelKey: string; hotkey: string }[] = [
  { id: 'cash', labelKey: 'pos.pay.cash', hotkey: 'F1' },
  { id: 'card', labelKey: 'pos.pay.card', hotkey: 'F2' },
  { id: 'transfer', labelKey: 'pos.pay.transfer', hotkey: 'F3' },
  { id: 'account', labelKey: 'pos.pay.account', hotkey: 'F4' },
]

export type Taken = {
  id: string
  method: MethodId
  /** What this payment settles, in baisa. */
  amount: number
  /** Cash only — what was put on the counter. */
  handedOver?: number
  /** Card only — the approval line. */
  approvalKey?: string
  approvalValues?: Record<string, string>
}

/** The tip sits on top of the sale and carries no VAT, which the design says twice. */
export type TipChoice = 'none' | 'p5' | 'p10' | 'p15' | 'roundUp'

export const SALE_TOTALS = totalsFor(OPEN_SALE)

/** Rounding the total up to the next whole rial is the default the design has selected. */
export function roundUpTip(sale: number): number {
  return (BAISA - (sale % BAISA)) % BAISA
}

export function tipFor(choice: TipChoice, sale: number): number {
  if (choice === 'none') return 0
  if (choice === 'roundUp') return roundUpTip(sale)
  const percent = choice === 'p5' ? 5 : choice === 'p10' ? 10 : 15
  return Math.round((sale * percent) / 100)
}

export const TIP_CHOICES: TipChoice[] = ['none', 'p5', 'p10', 'p15', 'roundUp']

/** What the customer owes: the sale, plus whatever tip they chose. */
export function toPay(sale: number, tip: number): number {
  return sale + tip
}

/** The two payments the design has already taken. */
export const TAKEN: Taken[] = [
  {
    id: 't1',
    method: 'card',
    amount: 3000,
    approvalKey: 'pos.pay.approved',
    approvalValues: { card: 'Visa 2291', time: '14:31' },
  },
  { id: 't2', method: 'cash', amount: 3000, handedOver: 5000 },
]

export function collected(taken: Taken[]): number {
  return taken.reduce((sum, entry) => sum + entry.amount, 0)
}

/** Nothing left to collect once the payments cover what is owed. */
export function stillToCollect(owed: number, taken: Taken[]): number {
  return Math.max(0, owed - collected(taken))
}

/** Cash back out of the drawer — only ever from the cash payments. */
export function changeDue(taken: Taken[]): number {
  return taken.reduce((sum, entry) => sum + Math.max(0, (entry.handedOver ?? 0) - entry.amount), 0)
}

/** The buttons beside the cash field: the exact amount, then the notes above it. */
export function quickCash(owed: number): number[] {
  const notes = [5000, 10000, 20000]
  return [owed, ...notes.filter((note) => note > owed)]
}

/* -------------------------------------------------------- what happens next */

/** The four steps the finish runs through (Figma 143:18997). */
export const FILING_STEPS = [
  { id: 'raised', labelKey: 'pos.done.raised', noteKey: 'pos.done.raisedNote' },
  { id: 'signed', labelKey: 'pos.done.signed', noteKey: 'pos.done.signedNote' },
  { id: 'filed', labelKey: 'pos.done.filed', noteKey: 'pos.done.filedNote' },
  { id: 'accepted', labelKey: 'pos.done.accepted', noteKey: 'pos.done.acceptedNote' },
]

export const RECEIPT = {
  invoice: 'INV-2048',
  sentAt: '14:32:06',
  acceptedAt: '14:32:07',
  /** From pressing finish to the Authority's answer. */
  seconds: 1.4,
  date: '4 Sep',
  time: '14:32',
  otaReference: 'OM-2026-0084419',
  business: {
    name: 'Al Bahja Coffee LLC',
    address: 'Building 42, Souq Street',
    town: 'Nizwa 611',
    vat: 'OM1100234567',
    site: 'albahja.om',
  },
}

/** How the receipt can be handed over. */
export const RECEIPT_WAYS = [
  { id: 'print', labelKey: 'pos.done.printed', noteKey: 'pos.done.printedNote', hotkey: 'P' },
  { id: 'email', labelKey: 'pos.done.email', noteKey: 'pos.done.emailNote', hotkey: 'E' },
  { id: 'text', labelKey: 'pos.done.text', noteKey: 'pos.done.textNote', hotkey: 'T' },
  { id: 'qr', labelKey: 'pos.done.qr', noteKey: 'pos.done.qrNote', hotkey: 'Q' },
]

/* ------------------------------------------------------- on the company */

export type Company = {
  id: string
  name: string
  initials: string
  vat: string
  peppol: string
  address: string
  sinceKey: string
  sinceValues: Record<string, string>
  termsKey: string
  accountKey: string
  accountValues: Record<string, string | number>
  /** How recently they were served, for the shortcut row. */
  seenKey: string
}

export const COMPANIES: Company[] = [
  {
    id: 'muscat-grand',
    name: 'Muscat Grand Hotel LLC',
    initials: 'MG',
    vat: 'OM1100445890',
    peppol: '0208:OM1100445890',
    address: 'Al Kharjiyah Street, Muscat 112',
    sinceKey: 'pos.company.customerSince',
    sinceValues: { when: 'April 2025' },
    termsKey: 'pos.company.terms30',
    accountKey: 'pos.company.accountOff',
    accountValues: { account: 'Hotel accounts', percent: 12 },
    seenKey: 'pos.company.twiceThisWeek',
  },
  {
    id: 'nizwa-souq',
    name: 'Nizwa Souq Café',
    initials: 'NS',
    vat: 'OM1100554027',
    peppol: '0208:OM1100554027',
    address: 'Souq Street, Nizwa 611',
    sinceKey: 'pos.company.customerSince',
    sinceValues: { when: 'January 2025' },
    termsKey: 'pos.company.terms30',
    accountKey: 'pos.company.accountOff',
    accountValues: { account: 'Trade', percent: 8 },
    seenKey: 'pos.company.weeklyOrder',
  },
  {
    id: 'barka-beach',
    name: 'Barka Beach Resort',
    initials: 'BB',
    vat: 'OM1100902341',
    peppol: '0208:OM1100902341',
    address: 'Beach Road, Barka 320',
    sinceKey: 'pos.company.customerSince',
    sinceValues: { when: 'September 2026' },
    termsKey: 'pos.company.terms30',
    accountKey: 'pos.company.accountOff',
    accountValues: { account: 'Hotel accounts', percent: 12 },
    seenKey: 'pos.company.lastThursday',
  },
]

/** What changes when a walk-in becomes a company sale. */
export const WALK_IN_IS = ['simplified', 'printed', 'filed', 'paidNow']
export const COMPANY_IS = ['addressed', 'sentToAccounts', 'filedB2B', 'claimVat']
