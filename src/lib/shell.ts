/**
 * The chrome every screen shares: the search box, the bell, the account switcher and the user
 * card. They were drawn but inert; this is what they know.
 */

/* ------------------------------------------------------------------ search */

export type HitKind = 'invoice' | 'customer' | 'supplier' | 'document' | 'item'

export type Hit = {
  id: string
  kind: HitKind
  title: string
  subtitle: string
  to: string
  /** Shown at the trailing edge — an amount, a date, whatever identifies it. */
  trailing?: string
}

/** The order results are grouped in — what people look for most, first. */
export const HIT_KINDS: HitKind[] = ['invoice', 'customer', 'supplier', 'document', 'item']

/** What somebody might be looking for before they have typed anything. */
export const SEARCH_SUGGESTIONS = [
  { labelKey: 'shell.search.suggestOverdue', to: '/invoices' },
  { labelKey: 'shell.search.suggestRejected', to: '/compliance/activity' },
  { labelKey: 'shell.search.suggestBills', to: '/expenditure/bills' },
]

/* -------------------------------------------------------- account and user */

export const USER_MENU = [
  { id: 'settings', labelKey: 'shell.user.settings', to: '/settings' },
  { id: 'signingIn', labelKey: 'shell.user.signingIn', to: '/settings/signing-in' },
]
