import type { CompanySummary, TenantStatus } from '../../../lib/console/companyVerification'

/**
 * The Tenants list's tabs, search, filter and sort, worked out over the rows the list request
 * already returned. Nothing here asks the backend for anything: the screen's one request
 * (`GET /v1/platform/companies?page&size`) stays exactly as it was, and these helpers only decide
 * which of its rows to show and in what order.
 */

export const TENANT_TABS = [
  'all',
  'needsAttention',
  'onboarding',
  'quiet',
  'nearQuota',
  'closed',
] as const
export type TenantTab = (typeof TENANT_TABS)[number]

/**
 * Tabs the list's fields cannot answer: filing activity and quota use are not on the summary.
 * They are drawn, counted as "—" and list nothing until the backend reports them.
 */
export const UNREPORTED_TABS: ReadonlySet<TenantTab> = new Set<TenantTab>(['quiet', 'nearQuota'])

/** A refused registration keeps its tenant pending; it is not "still onboarding". */
const refused = (row: CompanySummary) => row.verificationStatus === 'REJECTED'

/** Submitted and waiting for an operator's decision. */
export const awaitingReview = (row: CompanySummary) =>
  row.verificationStatus === 'PENDING_VERIFICATION' && row.submittedAt !== null

/** Which tabs a row belongs to, from the fields the summary carries. */
export function inTab(row: CompanySummary, tab: TenantTab): boolean {
  switch (tab) {
    case 'all':
      return true
    case 'needsAttention':
      // Work for a person: a registration to review or refused, or a suspended tenant.
      return awaitingReview(row) || refused(row) || row.tenantStatus === 'SUSPENDED'
    case 'onboarding':
      return row.tenantStatus === 'PENDING' && !refused(row)
    case 'closed':
      return row.tenantStatus === 'CLOSED'
    case 'quiet':
    case 'nearQuota':
      return false
  }
}

/** Rows per tab over the loaded rows; `null` for a tab the data cannot count. */
export function tabCounts(rows: CompanySummary[]): Record<TenantTab, number | null> {
  const counts = {} as Record<TenantTab, number | null>
  for (const tab of TENANT_TABS) {
    counts[tab] = UNREPORTED_TABS.has(tab) ? null : rows.filter((row) => inTab(row, tab)).length
  }
  return counts
}

export type StatusFilter = 'all' | TenantStatus | 'REFUSED'
export const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'ACTIVE',
  'PENDING',
  'SUSPENDED',
  'CLOSED',
  'REFUSED',
]

function matchesStatus(row: CompanySummary, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'REFUSED') return refused(row)
  return row.tenantStatus === filter
}

/** Name, legal name or tenant code, ignoring case. */
function matchesQuery(row: CompanySummary, needle: string): boolean {
  if (!needle) return true
  return [row.tenantName, row.legalName ?? '', row.tenantCode]
    .join(' ')
    .toLowerCase()
    .includes(needle)
}

export type TenantSort = 'newest' | 'oldest' | 'name'

const submitted = (row: CompanySummary) =>
  row.submittedAt ? new Date(row.submittedAt).getTime() : Number.NEGATIVE_INFINITY

/** The rows a tab, search, filter and sort leave on screen. `newest` keeps the backend's order. */
export function visibleRows(
  rows: CompanySummary[],
  {
    tab,
    query,
    status,
    sort,
    language,
  }: { tab: TenantTab; query: string; status: StatusFilter; sort: TenantSort; language: string },
): CompanySummary[] {
  const needle = query.trim().toLowerCase()
  const shown = rows.filter(
    (row) => inTab(row, tab) && matchesStatus(row, status) && matchesQuery(row, needle),
  )
  if (sort === 'oldest') shown.sort((a, b) => submitted(a) - submitted(b))
  if (sort === 'name') shown.sort((a, b) => a.tenantName.localeCompare(b.tenantName, language))
  return shown
}

/** Up to two letters for the row's tile: the first letters of the first two words. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? '')
  return letters.join('').toUpperCase()
}

/** Time since a backend instant, in whole days, months or years. */
export function tenureOf(
  iso: string,
  now: Date = new Date(),
): { unit: 'days' | 'months' | 'years'; count: number } {
  const since = new Date(iso)
  const days = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000))
  let months =
    (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth())
  if (now.getDate() < since.getDate()) months -= 1
  if (months < 1) return { unit: 'days', count: days }
  if (months < 24) return { unit: 'months', count: months }
  return { unit: 'years', count: Math.floor(months / 12) }
}
