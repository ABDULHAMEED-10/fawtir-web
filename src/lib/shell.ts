import { CUSTOMER_ROWS } from './customers'
import { DOC_RECORDS } from './documents'
import { INVOICE_ROWS } from './invoices'
import { SUPPLIERS } from './suppliers'
import { POS_ITEMS } from './pos'

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

/**
 * One flat index over the things somebody would actually search for.
 *
 * Built from the same lists the screens render, so a record can never be findable here and absent
 * there — or, worse, findable under a name it no longer has.
 */
export const SEARCH_INDEX: Hit[] = [
  ...INVOICE_ROWS.map((row) => ({
    id: row.id,
    kind: 'invoice' as const,
    title: row.id,
    subtitle: row.customer,
    to: `/invoices/${row.id}`,
    trailing: row.amount,
  })),
  ...CUSTOMER_ROWS.map((row) => ({
    id: row.id,
    kind: 'customer' as const,
    title: row.name,
    subtitle: row.subtitle,
    to: '/customers',
  })),
  ...SUPPLIERS.map((row) => ({
    id: row.id,
    kind: 'supplier' as const,
    title: row.name,
    subtitle: row.vat ? `VAT ${row.vat}` : '',
    to: `/suppliers/${row.slug}`,
  })),
  ...DOC_RECORDS.map((row) => ({
    id: row.id,
    kind: 'document' as const,
    title: row.title,
    subtitle: row.party,
    to: `/compliance/documents/${row.id}`,
  })),
  ...POS_ITEMS.map((item) => ({
    id: item.id,
    kind: 'item' as const,
    title: item.name,
    subtitle: '',
    to: `/catalog/${item.id}`,
  })),
]

/** The order results are grouped in — what people look for most, first. */
export const HIT_KINDS: HitKind[] = ['invoice', 'customer', 'supplier', 'document', 'item']

/**
 * Matches on any word of the query, in the title or the subtitle.
 *
 * Deliberately forgiving: somebody typing "salalah beach" should find the invoice as readily as
 * the customer, and typing an invoice number should find it whatever case they use.
 */
export function search(query: string, limit = 8): Hit[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored = SEARCH_INDEX.map((hit) => {
    const haystack = `${hit.title} ${hit.subtitle}`.toLowerCase()
    const every = words.every((word) => haystack.includes(word))
    if (!every) return null
    // A hit at the start of the title beats one buried in a subtitle.
    const rank = hit.title.toLowerCase().startsWith(words[0]) ? 0 : 1
    return { hit, rank }
  }).filter((entry): entry is { hit: Hit; rank: number } => entry !== null)

  return scored
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((entry) => entry.hit)
}

/** What somebody might be looking for before they have typed anything. */
export const SEARCH_SUGGESTIONS = [
  { labelKey: 'shell.search.suggestOverdue', to: '/invoices' },
  { labelKey: 'shell.search.suggestRejected', to: '/compliance/activity' },
  { labelKey: 'shell.search.suggestBills', to: '/expenditure/bills' },
]

/* ----------------------------------------------------------- notifications */

export type NoticeTone = 'attention' | 'info' | 'good'

export type Notice = {
  id: string
  tone: NoticeTone
  titleKey: string
  titleValues?: Record<string, string | number>
  bodyKey: string
  bodyValues?: Record<string, string | number>
  whenKey: string
  whenValues?: Record<string, string | number>
  to: string
  read: boolean
}

/**
 * The two the bell is counting.
 *
 * Both are things the Tax Authority has said, because those are the ones that cost money if they
 * sit unread. Anything the app can settle by itself does not ring a bell.
 */
export const NOTICES: Notice[] = [
  {
    id: 'n1',
    tone: 'attention',
    titleKey: 'shell.notice.rejected.title',
    titleValues: { invoice: 'INV-2041' },
    bodyKey: 'shell.notice.rejected.body',
    whenKey: 'shell.when.minutesAgo',
    whenValues: { count: 12 },
    to: '/compliance/activity',
    read: false,
  },
  {
    id: 'n2',
    tone: 'attention',
    titleKey: 'shell.notice.certificate.title',
    titleValues: { days: 24 },
    bodyKey: 'shell.notice.certificate.body',
    whenKey: 'shell.when.today',
    to: '/settings/peppol',
    read: false,
  },
  {
    id: 'n3',
    tone: 'good',
    titleKey: 'shell.notice.paid.title',
    titleValues: { invoice: 'INV-2039' },
    bodyKey: 'shell.notice.paid.body',
    bodyValues: { amount: '92.400' },
    whenKey: 'shell.when.yesterday',
    to: '/invoices',
    read: true,
  },
  {
    id: 'n4',
    tone: 'info',
    titleKey: 'shell.notice.quota.title',
    titleValues: { used: 441, quota: 500 },
    bodyKey: 'shell.notice.quota.body',
    whenKey: 'shell.when.daysAgo',
    whenValues: { count: 2 },
    to: '/settings/plan',
    read: true,
  },
]

export function unreadCount(notices: Notice[]): number {
  return notices.filter((notice) => !notice.read).length
}

/* -------------------------------------------------------- account and user */

export type Branch = {
  id: string
  name: string
  town: string
  /** The plan the whole account is on — branches share it. */
  planKey: string
  current?: boolean
}

export const ACCOUNTS: Branch[] = [
  {
    id: 'nizwa',
    name: 'Al Bahja Coffee',
    town: 'Nizwa',
    planKey: 'shell.plan.premium',
    current: true,
  },
  { id: 'seeb', name: 'Al Bahja Coffee', town: 'Seeb', planKey: 'shell.plan.premium' },
  { id: 'sohar', name: 'Al Bahja Roastery', town: 'Sohar', planKey: 'shell.plan.premium' },
]

export const USER_MENU = [
  { id: 'profile', labelKey: 'shell.user.profile', to: '/settings/team' },
  { id: 'settings', labelKey: 'shell.user.settings', to: '/settings' },
  { id: 'signingIn', labelKey: 'shell.user.signingIn', to: '/settings/signing-in' },
]
