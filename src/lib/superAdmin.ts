/**
 * The Fawtir console — Super Admin › Operations and Tenants (Figma 143:17005, 143:17411).
 *
 * This is the view from inside Fawtir rather than from inside a business: every tenant filing
 * through the platform, the health of the one connection they all depend on, and who somebody
 * should probably ring today.
 *
 * One population is stated here and every figure on both screens is derived from it. The design
 * printed its counts separately and they disagreed — the cards and the Operations panel all
 * corroborate 284 live tenants, but the Tenants tab strip claimed 169 in total, 106 needing
 * attention and 44 gone quiet, against cards reading 284, 11 and 6. The cards win: 284 − 241
 * filing is the stated 43 quiet, and 9 expiring certificates + 2 over quota is the stated 11 at
 * risk. See `TAB_COUNTS` for what each tab now reads.
 *
 * Revenue is no longer the design's OMR 14,206.000: that figure was 284 tenants at an average of
 * 50.020, which only the old 19/49/89 prices could produce. Since the catalogue moved to the
 * pricing doc's 12/28/55 (15 Sep 2026) the revenue is derived from a stated plan mix instead.
 */

import { CATALOGUE, type PlanId } from './plans'

/** The console's clock. Fixed so every figure on both screens tells the same story. */
export const NOW = new Date(2026, 8, 4, 14, 26)

/* ------------------------------------------------------------------ tenants */

/** How a tenant stands with the platform. */
export type TenantState = 'live' | 'onboarding' | 'closed'

/** Why a tenant is on the list of people to ring. */
export type Concern = 'certificateExpiring' | 'overQuota' | 'quiet' | 'refusals' | 'none'

export type Plan = {
  id: PlanId
  labelKey: string
  /** Documents included before overage. */
  quota: number
}

/** The launch catalogue (`plans.ts`) in the console's shape. */
export const PLANS: Record<Plan['id'], Plan> = Object.fromEntries(
  CATALOGUE.map((plan) => [
    plan.id,
    {
      id: plan.id,
      labelKey: `console.plan.${plan.id}`,
      quota: plan.documents,
    },
  ]),
) as Record<Plan['id'], Plan>

/** A day of filing health: how the tenant's submissions went. */
export type FilingDay = 'clear' | 'some' | 'bad' | 'none'

export type Tenant = {
  id: string
  name: string
  initials: string
  town: string
  vat: string
  /** When they joined, or started onboarding. */
  since: string
  sinceLabelKey: string
  /** How long they have been with us, already phrased. */
  ageKey: string
  ageValues?: Record<string, string | number>
  state: TenantState
  plan: Plan['id']
  /** Invoices filed this month, against the plan's quota. */
  used: number
  /** Seven days of filing health, oldest first. */
  week: FilingDay[]
  /** The one-line verdict under the week strip. */
  healthKey: string
  healthTone: 'bad' | 'watch' | 'calm'
  concern: Concern
  /** The chip beside the name, when there is something to say. */
  chipKey?: string
  chipValues?: Record<string, string | number>
  chipTone?: 'bad' | 'watch' | 'calm'
  /** A second chip — a tenant can be short of certificate *and* near quota. */
  chip2Key?: string
  chip2Values?: Record<string, string | number>
  chip2Tone?: 'bad' | 'watch' | 'calm'
}

/**
 * The tenants the design names, in its order.
 *
 * These are the seven the console shows first — the ones with something to say. The other 296
 * are counted in the totals below but not listed; a console lists what needs a person, and the
 * full list is a search away.
 */
export const TENANTS: Tenant[] = [
  {
    id: 'sur-trading',
    name: 'Sur Trading Co',
    initials: 'ST',
    town: 'Sur',
    vat: 'OM1100891204',
    since: 'May 2026',
    sinceLabelKey: 'console.tenants.joined',
    ageKey: 'console.age.months',
    ageValues: { count: 4 },
    state: 'live',
    plan: 'starter',
    used: 51,
    week: ['clear', 'clear', 'bad', 'clear', 'some', 'clear', 'clear'],
    healthKey: 'console.health.renewalNotStarted',
    healthTone: 'bad',
    concern: 'certificateExpiring',
    chipKey: 'console.chip.certInDays',
    chipValues: { days: 6 },
    chipTone: 'bad',
  },
  {
    id: 'al-bahja',
    name: 'Al Bahja Coffee LLC',
    initials: 'AB',
    town: 'Nizwa',
    vat: 'OM1100234567',
    since: 'Mar 2025',
    sinceLabelKey: 'console.tenants.joined',
    ageKey: 'console.age.months',
    ageValues: { count: 18 },
    state: 'live',
    plan: 'business',
    used: 880,
    // Three branches on a plan of two: the plan plus one extra branch, as Subscriptions bills it.
    week: ['clear', 'clear', 'clear', 'clear', 'some', 'clear', 'clear'],
    healthKey: 'console.health.overageOff',
    healthTone: 'watch',
    concern: 'certificateExpiring',
    chipKey: 'console.chip.certInDays',
    chipValues: { days: 24 },
    chipTone: 'bad',
    chip2Key: 'console.chip.quotaUsed',
    chip2Values: { percent: 88 },
    chip2Tone: 'watch',
  },
  {
    id: 'muscat-grand',
    name: 'Muscat Grand Hotel',
    initials: 'MG',
    town: 'Muscat',
    vat: 'OM1100445890',
    since: 'Sep 2024',
    sinceLabelKey: 'console.tenants.joined',
    ageKey: 'console.age.years',
    ageValues: { count: 2 },
    state: 'live',
    plan: 'businessPlus',
    used: 934,
    week: ['clear', 'clear', 'clear', 'bad', 'some', 'bad', 'clear'],
    healthKey: 'console.health.sameCause',
    healthTone: 'watch',
    concern: 'refusals',
    chipKey: 'console.chip.refusedToday',
    chipValues: { percent: 31 },
    chipTone: 'watch',
  },
  {
    id: 'nizwa-wholesale',
    name: 'Nizwa Wholesale',
    initials: 'NW',
    town: 'Nizwa',
    vat: 'OM1100337712',
    since: 'Oct 2025',
    sinceLabelKey: 'console.tenants.joined',
    ageKey: 'console.age.months',
    ageValues: { count: 11 },
    state: 'live',
    plan: 'business',
    used: 56,
    week: ['clear', 'clear', 'clear', 'none', 'none', 'none', 'none'],
    healthKey: 'console.health.stoppedAfterKey',
    healthTone: 'watch',
    concern: 'quiet',
    chipKey: 'console.chip.quietDays',
    chipValues: { days: 9 },
    chipTone: 'watch',
  },
  {
    id: 'barka-beach',
    name: 'Barka Beach Resort',
    initials: 'BR',
    town: 'Barka',
    vat: 'OM1100902341',
    since: '2 Sep',
    sinceLabelKey: 'console.tenants.started',
    ageKey: 'console.age.days',
    ageValues: { count: 3 },
    state: 'onboarding',
    plan: 'business',
    used: 11,
    week: ['clear', 'clear', 'none', 'none', 'none', 'none', 'none'],
    healthKey: 'console.health.peppolTesting',
    healthTone: 'calm',
    concern: 'none',
    chipKey: 'console.chip.onboarding',
    chipTone: 'calm',
  },
  {
    id: 'salalah-spice',
    name: 'Salalah Spice House',
    initials: 'SS',
    town: 'Salalah',
    vat: 'OM1100118845',
    since: 'Jan 2025',
    sinceLabelKey: 'console.tenants.joined',
    ageKey: 'console.age.months',
    ageValues: { count: 20 },
    state: 'live',
    plan: 'business',
    used: 221,
    /** The plan plus one person beyond the five included. */
    week: ['clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'clear'],
    healthKey: 'console.health.nothingToReport',
    healthTone: 'calm',
    concern: 'none',
  },
  {
    id: 'oman-marine',
    name: 'Oman Marine Supplies',
    initials: 'OM',
    town: 'Sohar',
    vat: 'OM1100664471',
    since: 'Jun 2024',
    sinceLabelKey: 'console.tenants.joined',
    ageKey: 'console.age.years',
    ageValues: { count: 2 },
    state: 'live',
    plan: 'businessPlus',
    used: 1062,
    /** The plan plus two people beyond the ten included. */
    week: ['clear', 'clear', 'clear', 'clear', 'clear', 'some', 'clear'],
    healthKey: 'console.health.oneRefusal',
    healthTone: 'calm',
    concern: 'none',
  },
]

/* ------------------------------------------------------- the whole platform */

/**
 * The platform's own numbers.
 *
 * Stated rather than summed from `TENANTS`, because seven tenants are listed and there are 303.
 * Everything below that *can* be derived from these is derived.
 */
export const PLATFORM = {
  live: 284,
  onboarding: 7,
  closed: 12,
  /** Live tenants that filed anything today. */
  filingToday: 241,
  joinedThisMonth: 11,
  leftThisMonth: 2,
  /** Invoices filed to the OTA today, across everyone. */
  filedToday: 18412,
  /** Of today's filings, the share the OTA took first time. */
  acceptedFirstTimeToday: 0.984,
  /** Waiting in the queue right now. */
  waiting: 41,
  oldestWaitMinutes: 6,
  normalWaitSeconds: 90,
  /** Failures that are the OTA's or ours — timeouts and 5xx — not a tenant's mistake. */
  ourFault: 23,
  invoicesThisMonth: 412880,
  acceptedFirstTimeThisMonth: 0.981,
  nearQuota: 31,
  certificatesExpiring: 9,
  /** Over quota with overage switched off, so the next invoice would be blocked. */
  overQuotaBlocked: 2,
  /** Live tenants that have filed nothing for a week or more. */
  quiet: 6,
  /** Of those, the ones that look like a broken integration rather than a lost customer. */
  quietLooksBroken: 4,
  /** Who is on which plan. The three sum to `live`. */
  onPlan: { starter: 118, business: 131, businessPlus: 35 },
} as const

/** Everyone on the platform, whatever state they are in. */
export const ALL_TENANTS = PLATFORM.live + PLATFORM.onboarding + PLATFORM.closed

/** Live tenants that filed nothing today — mostly weekend-only businesses. */
export const QUIET_TODAY = PLATFORM.live - PLATFORM.filingToday

/** Certificates about to lapse plus accounts that would be blocked — one list to work through. */
export const NEEDS_ATTENTION = PLATFORM.certificatesExpiring + PLATFORM.overQuotaBlocked

/** Of today's filings, the ones the OTA sent back. */
export const REFUSED_TODAY = Math.round(PLATFORM.filedToday * (1 - PLATFORM.acceptedFirstTimeToday))

/**
 * The tab strip over the tenant list.
 *
 * Each count comes from the population above rather than being typed in, which is what the design
 * did — its All/Needs attention/Gone quiet read 169/106/44 while its own cards read 303/11/6.
 */
export const TAB_COUNTS = {
  all: ALL_TENANTS,
  needsAttention: NEEDS_ATTENTION,
  onboarding: PLATFORM.onboarding,
  quiet: PLATFORM.quiet,
  nearQuota: PLATFORM.nearQuota,
  closed: PLATFORM.closed,
} as const

export const TENANT_TABS = [
  { id: 'all', labelKey: 'console.tenants.tab.all', count: TAB_COUNTS.all },
  {
    id: 'needsAttention',
    labelKey: 'console.tenants.tab.needsAttention',
    count: TAB_COUNTS.needsAttention,
  },
  { id: 'onboarding', labelKey: 'console.tenants.tab.onboarding', count: TAB_COUNTS.onboarding },
  { id: 'quiet', labelKey: 'console.tenants.tab.quiet', count: TAB_COUNTS.quiet },
  { id: 'nearQuota', labelKey: 'console.tenants.tab.nearQuota', count: TAB_COUNTS.nearQuota },
  { id: 'closed', labelKey: 'console.tenants.tab.closed', count: TAB_COUNTS.closed },
] as const

export type TenantTabId = (typeof TENANT_TABS)[number]['id']

/** Which of the listed tenants belong under a tab. */
export function tenantsForTab(tab: TenantTabId): Tenant[] {
  if (tab === 'all') return TENANTS
  if (tab === 'onboarding') return TENANTS.filter((t) => t.state === 'onboarding')
  if (tab === 'closed') return TENANTS.filter((t) => t.state === 'closed')
  if (tab === 'quiet') return TENANTS.filter((t) => t.concern === 'quiet')
  if (tab === 'nearQuota') return TENANTS.filter((t) => t.used / PLANS[t.plan].quota >= 0.8)
  return TENANTS.filter((t) => t.concern === 'certificateExpiring' || t.concern === 'overQuota')
}

/* --------------------------------------------------------- the OTA connection */

export type OtaLine = { labelKey: string; value: string; tone?: 'bad' | 'calm' }

/** How the one connection every tenant depends on is behaving right now. */
export const OTA = {
  /** Slow enough to be worth saying, not down. */
  state: 'degraded' as 'healthy' | 'degraded' | 'down',
  answering: true,
  roundTripNow: 31.4,
  roundTripNormal: 4.2,
  errorsInAnHour: PLATFORM.ourFault,
  as4Healthy: true,
  smpHealthy: true,
  /** When the round trip started climbing, which is where the chart is annotated. */
  slowedAt: '13:40',
}

/* ----------------------------------------------------------- filed by the hour */

/**
 * Filings per hour, today against the same day last week.
 *
 * The two series track each other until the OTA slows at 13:40; after that today falls away while
 * last week carries on. The work has not gone anywhere — it is the queue, which is why `waiting`
 * is climbing at the same time.
 */
export const BY_HOUR = {
  hours: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
  today: [320, 640, 1180, 1480, 1720, 1560, 1270, 1520, 1720, 900],
  lastWeek: [300, 700, 1210, 1500, 1780, 1580, 1300, 1560, 1680, 1180],
  /** Where the annotation sits, as an index into `hours`. */
  slowedAfter: 8,
} as const

/** The axis stops above the busiest hour of either day. */
export const BY_HOUR_MAX = 2400

/* ------------------------------------------------------ tenants worth a look */

export type Worth = {
  tenantId: string
  /** The headline concern. */
  noteKey: string
  noteValues?: Record<string, string | number>
  tone: 'bad' | 'watch'
  /** The detail under it — what makes it worth a call rather than a ticket. */
  detailKey: string
  detailValues?: Record<string, string | number>
}

/**
 * Not incidents — nobody is broken. These are the four a person should ring today, in the order
 * the design puts them: soonest deadline first, then the ones losing money quietly.
 */
export const WORTH_A_LOOK: Worth[] = [
  {
    tenantId: 'al-bahja',
    noteKey: 'console.worth.certificate',
    noteValues: { days: 24 },
    tone: 'bad',
    detailKey: 'console.worth.notStarted',
    detailValues: { percent: 88 },
  },
  {
    tenantId: 'sur-trading',
    noteKey: 'console.worth.certificate',
    noteValues: { days: 6 },
    tone: 'bad',
    detailKey: 'console.worth.emailsUnopened',
    detailValues: { count: 2 },
  },
  {
    tenantId: 'muscat-grand',
    noteKey: 'console.worth.refusedToday',
    noteValues: { percent: 31 },
    tone: 'watch',
    detailKey: 'console.worth.sameCause',
  },
  {
    tenantId: 'nizwa-wholesale',
    noteKey: 'console.worth.quiet',
    noteValues: { days: 9 },
    tone: 'watch',
    detailKey: 'console.worth.wasFiling',
    detailValues: { count: 40 },
  },
]

/** Look a listed tenant up by id — the "worth a look" rows carry only a reference. */
export function tenantById(id: string): Tenant {
  const found = TENANTS.find((t) => t.id === id)
  if (!found) throw new Error(`No tenant ${id}`)
  return found
}

/* ------------------------------------------------------------------ formatting */

/** OMR to three decimals, as the rest of the app writes money. */
export function omr(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

/** Whole numbers with thousands separators. */
export function count(value: number): string {
  return value.toLocaleString('en-US')
}

/** A share as a percentage, to one decimal only when it needs one. */
export function percent(share: number): string {
  const value = share * 100
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}
