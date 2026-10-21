import { VAT_RATE } from './pos'

/**
 * Cashing up (Figma 143:20055) and the day behind it (143:20498).
 *
 * The drawer is the only thing anybody counts — card and transfers reconcile themselves — so the
 * shape here is: what the drawer should hold, what it actually holds, and the gap between them
 * with somewhere to say why.
 */

/** Everything taken today, split by how it was paid. */
export const TAKINGS = {
  cash: 218450,
  card: 604150,
  company: 88000,
  cashSales: 31,
  cardSales: 61,
  companyInvoices: 4,
}

export const TAKEN_TODAY = TAKINGS.cash + TAKINGS.card + TAKINGS.company

export const SALES_TODAY = TAKINGS.cashSales + TAKINGS.cardSales + TAKINGS.companyInvoices

/** What the average sale came to. */
export const AVERAGE_SALE = Math.round(TAKEN_TODAY / SALES_TODAY)

/** The share of takings that came through the drawer, which the design prints as a percentage. */
export const CASH_SHARE = TAKINGS.cash / TAKEN_TODAY

/* ----------------------------------------------------------- the drawer */

export const DRAWER = {
  /** What the till started the day with, and starts tomorrow with. */
  float: 30000,
  floatSetAt: '07:02',
  /** Cash refunded to a customer, out of the drawer. */
  refunded: 4200,
  refundedNoteKey: 'pos.close.refundedNote',
  refundedValues: { time: '11:20' },
  /** Cash paid out for something else, with the receipt left in the drawer. */
  paidOut: 12000,
  paidOutNoteKey: 'pos.close.paidOutNote',
  paidOutValues: { who: 'Maryam' },
}

/** What should be in there if nothing went astray. */
export const SHOULD_HOLD = DRAWER.float + TAKINGS.cash - DRAWER.refunded - DRAWER.paidOut

/** What was counted, note by note (Figma 143:20055 — "Count by denomination"). */
export const COUNTED_BY_NOTE = [
  { value: 20000, count: 8 },
  { value: 10000, count: 4 },
  { value: 5000, count: 5 },
  { value: 1000, count: 4 },
  { value: 500, count: 3 },
  { value: 100, count: 4 },
]

export const COUNTED = COUNTED_BY_NOTE.reduce((sum, note) => sum + note.value * note.count, 0)

/** Negative when the drawer is short, which is the case the design draws. */
export const OVER_OR_SHORT = COUNTED - SHOULD_HOLD

/** The shortfall measured against the cash taken, which is what makes it small or alarming. */
export const SHORT_SHARE = Math.abs(OVER_OR_SHORT) / TAKINGS.cash

/** Why the count came up short — a guess is fine, the point is that somebody looked. */
export const SHORT_REASONS = [
  { id: 'changeWrong', labelKey: 'pos.close.changeWrong', noteKey: 'pos.close.changeWrongNote' },
  { id: 'payoutMissed', labelKey: 'pos.close.payoutMissed', noteKey: 'pos.close.payoutMissedNote' },
  { id: 'miscounted', labelKey: 'pos.close.miscounted', noteKey: 'pos.close.miscountedNote' },
  { id: 'dontKnow', labelKey: 'pos.close.dontKnow', noteKey: 'pos.close.dontKnowNote' },
]

/* ------------------------------------------------------- the shift in short */

export const TIPS_TODAY = 9420
export const DISCOUNTS_TODAY = 62140
export const REFUNDS_TODAY = { count: 1, amount: 4200 }

/**
 * VAT inside today's takings.
 *
 * The design printed 43.362, which is 5/105 of the whole 910.600 — tips included. A tip carries
 * no VAT, as the payment screen says in as many words ("the 0.351 carries no tax"), so the tax
 * has to come out of the takings *less* the tips. That is 901.180, and 42.913 of VAT. The
 * difference is 0.449, which is exactly 5/105 of the 9.420 of tips.
 */
export const VATABLE_TODAY = TAKEN_TODAY - TIPS_TODAY

export const VAT_WITHIN = Math.round(VATABLE_TODAY * (VAT_RATE / (1 + VAT_RATE)))

/** What goes to the bank: everything counted, less the float left for tomorrow. */
export const TO_BANK = COUNTED - DRAWER.float

/** The shift being closed. */
export const SHIFT = {
  cashier: 'Maryam',
  from: '07:00',
  to: '17:14',
  /** Who gets the summary once the till is closed. */
  ownerName: 'Hafidh',
}

/* ---------------------------------------------------------- loose ends */

export const LOOSE_ENDS = [
  {
    id: 'tabs',
    state: 'todo' as const,
    titleKey: 'pos.close.tabsOpen',
    titleValues: { count: 3 },
    noteKey: 'pos.close.tabsNote',
    // Written with its currency so the screen can set the rial sign beside it (withRial).
    noteValues: { amount: 'OMR 59.588' },
    actionKey: 'pos.close.dealWithThem',
  },
  {
    id: 'filed',
    state: 'done' as const,
    titleKey: 'pos.close.allFiled',
    noteKey: 'pos.close.allFiledNote',
    noteValues: { count: SALES_TODAY },
  },
  {
    id: 'terminal',
    state: 'done' as const,
    titleKey: 'pos.close.terminalAgrees',
    noteKey: 'pos.close.terminalNote',
    noteValues: { amount: '604.150', payments: TAKINGS.cardSales },
  },
]
