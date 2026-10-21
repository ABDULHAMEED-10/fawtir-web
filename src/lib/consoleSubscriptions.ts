import { useSyncExternalStore } from 'react'
import { CATALOGUE, PLAN, SUBSCRIPTION_VAT, TRIAL, annualTotal, type PlanId } from './plans'
import { PLATFORM, NOW, TENANTS } from './superAdmin'
import { PLATFORM_SETTINGS } from './platformSettings'

/**
 * Subscriptions, as the console sees them — Super Admin › Subscriptions and the Subscription tab
 * of a tenant (docs/erp-and-console-plan.md §7).
 *
 * The rule the client set on 15 Sep 2026: every subscription is activated by an operator here.
 * Money arrives four ways — a Paymob payment link sent over WhatsApp, email or any channel, a
 * bank transfer, cash at the office, or a cheque — and how it arrives changes who confirms it,
 * not what happens next: someone at Insight sees it, an operator records it, the account is
 * activated for the period.
 *
 * One population. The tenants with something to do about them are listed in full — everyone
 * awaiting payment, in grace, suspended or on trial — so the queue's figures are sums of its rows;
 * the 268 active and 12 cancelled are counted (`SUBSCRIPTIONS_PLATFORM`) and only the ones a
 * person might open are listed. 268 + 9 + 4 + 3 is the console's 284 live tenants; 7 on trial are
 * its 7 onboarding; 12 cancelled are its 12 closed. The clock is the console's: Friday 4 September
 * 2026, 14:26.
 */

export type SubscriptionState =
  'trial' | 'awaitingPayment' | 'active' | 'grace' | 'suspended' | 'cancelled'

export type Term = 'monthly' | 'quarterly' | 'annual'
export type PaymentMethod = 'cardLink' | 'bankTransfer' | 'cash' | 'cheque'
export type LinkChannel = 'whatsapp' | 'email' | 'copied'
export type LinkStatus = 'unpaid' | 'paid' | 'expired'
export type InvoiceStatus = 'unpaid' | 'paid' | 'overdue' | 'waived'
export type SubscriptionPlanId = PlanId | 'enterprise'

export type TenantIdentity = {
  id: string
  name: string
  initials: string
  town: string
  vat: string
  /** Who Insight talks to about money. */
  contact: { name: string; phone: string; email: string }
}

export type SubscriptionInvoice = {
  id: string
  tenantId: string
  /** Fawtir's own series, separate from any tenant's documents. */
  number: string
  periodStart: Date
  periodEnd: Date
  issued: Date
  due: Date
  /** Excluding VAT. */
  amount: number
  vat: number
  total: number
  status: InvoiceStatus
  paidOn?: Date
  method?: PaymentMethod
  /** What the amount covers, for the line under the number. */
  coverKey: string
  coverValues?: Record<string, string | number>
}

export type Payment = {
  id: string
  tenantId: string
  invoiceId: string
  method: PaymentMethod
  amount: number
  receivedOn: Date
  /** A transfer reference, a cheque number and bank, a Paymob transaction id. */
  reference?: string
  confirmedBy: string
  note?: string
  recordedAt: Date
}

export type PaymentLink = {
  id: string
  tenantId: string
  invoiceId: string
  url: string
  sentVia: LinkChannel
  sentAt: Date
  sentBy: string
  expiresAt: Date
  status: LinkStatus
}

export type SubscriptionEvent = {
  id: string
  tenantId: string
  at: Date
  by: string
  /** `console.subscriptions.event.*` */
  actionKey: string
  values?: Record<string, string | number>
}

export type QuotaGrant = {
  id: string
  tenantId: string
  documents: number
  expires: Date
  reason: string
  by: string
  at: Date
}

export type EnterpriseTerms = {
  monthly: number
  documents: number
  people: number | null
  branches: number | null
  overage: number | null
  contractFrom: Date
  contractTo: Date
  sla: string
}

export type Subscription = {
  tenantId: string
  plan: SubscriptionPlanId
  term: Term
  state: SubscriptionState
  periodStart: Date
  periodEnd: Date
  /** The open invoice's total, or 0. */
  amountDue: number
  preferredMethod: PaymentMethod
  lastPayment?: { at: Date; method: PaymentMethod; amount: number }
  /** Trial only. */
  trialEndsAt?: Date
  trialUsed?: number
  /** Grace only: the day the unpaid invoice fell due. */
  graceSince?: Date
  /** Suspended or cancelled: when. */
  stateSince?: Date
  /** A plan change waiting for the period to end. */
  scheduledChange?: { plan: SubscriptionPlanId; term: Term; at: Date }
  /** Tenants who joined before a price change keep their price until they change plan. */
  grandfatheredSince?: Date
  enterprise?: EnterpriseTerms
  usage: { documents: number; people: number; branches: number }
  overageOn: boolean
}

/* --------------------------------------------------------------- the clock */

const DAY = 24 * 60 * 60 * 1000
const d = (month: number, day: number, year = 2026) => new Date(year, month - 1, day)
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY)
const addMonths = (date: Date, months: number) => {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

export const MONTHS_OF: Record<Term, number> = { monthly: 1, quarterly: 3, annual: 12 }

/** What a period costs before VAT, from the catalogue or the tenant's own terms. */
export function periodAmount(plan: SubscriptionPlanId, term: Term, enterprise?: EnterpriseTerms) {
  if (plan === 'enterprise') return (enterprise?.monthly ?? 0) * MONTHS_OF[term]
  return term === 'annual' ? annualTotal(PLAN[plan]) : PLAN[plan].monthly * MONTHS_OF[term]
}

export const withVat = (amount: number) => Math.round(amount * (1 + SUBSCRIPTION_VAT) * 1000) / 1000
export const vatOn = (amount: number) => Math.round(amount * SUBSCRIPTION_VAT * 1000) / 1000

/* ---------------------------------------------------------------- tenants */

/**
 * Tenants the subscription screens list that the Tenants screen does not — the ones whose story
 * is about money rather than filing. The seven the Tenants screen names keep their identity from
 * there; contacts are added here.
 */
const EXTRA_TENANTS: TenantIdentity[] = [
  tenant(
    'al-noor',
    'Al Noor Trading LLC',
    'Muscat',
    'OM1100447102',
    'Khalid Al Noori',
    '+968 9912 3344',
  ),
  tenant(
    'sohar-steel',
    'Sohar Steel Works',
    'Sohar',
    'OM1100558813',
    'Salim Al Balushi',
    '+968 9223 4455',
  ),
  tenant(
    'bahla-pottery',
    'Bahla Pottery Co-op',
    'Bahla',
    'OM1100226690',
    'Aisha Al Hinai',
    '+968 9334 5566',
  ),
  tenant(
    'ibri-dates',
    'Ibri Dates Farm',
    'Ibri',
    'OM1100773421',
    'Hamad Al Yaqoubi',
    '+968 9445 6677',
  ),
  tenant(
    'seeb-pharmacy',
    'Seeb Pharmacy',
    'Seeb',
    'OM1100612287',
    'Dr Mona Al Rawahi',
    '+968 9556 7788',
  ),
  tenant(
    'qurum-dental',
    'Qurum Dental Clinic',
    'Muscat',
    'OM1100398754',
    'Dr Faisal Al Lawati',
    '+968 9667 8899',
  ),
  tenant(
    'rustaq-motors',
    'Rustaq Motors',
    'Rustaq',
    'OM1100841126',
    'Yousuf Al Kindi',
    '+968 9778 9900',
  ),
  tenant(
    'salalah-tours',
    'Salalah Coastal Tours',
    'Salalah',
    'OM1100287763',
    'Latifa Al Mahri',
    '+968 9889 0011',
  ),
  tenant(
    'muttrah-souq',
    'Muttrah Souq Traders',
    'Muscat',
    'OM1100154498',
    'Abdullah Al Zadjali',
    '+968 9990 1122',
  ),
  tenant(
    'buraimi-hardware',
    'Buraimi Hardware',
    'Al Buraimi',
    'OM1100930275',
    'Saeed Al Kaabi',
    '+968 9101 2233',
  ),
  tenant(
    'khasab-ferry',
    'Khasab Ferry Services',
    'Khasab',
    'OM1100467709',
    'Nasser Al Shehhi',
    '+968 9212 3344',
  ),
  tenant(
    'amerat-bakery',
    'Al Amerat Bakery',
    'Muscat',
    'OM1100589932',
    'Zainab Al Abri',
    '+968 9323 4455',
  ),
  tenant(
    'duqm-logistics',
    'Duqm Logistics',
    'Duqm',
    'OM1100718840',
    'Majid Al Junaibi',
    '+968 9434 5566',
  ),
  tenant(
    'sur-fisheries',
    'Sur Fisheries',
    'Sur',
    'OM1100265183',
    'Ali Al Araimi',
    '+968 9545 6677',
  ),
  tenant('saham-farms', 'Saham Farms', 'Saham', 'OM1100893327', 'Fatma Al Saadi', '+968 9656 7788'),
  tenant(
    'shinas-print',
    'Shinas Print House',
    'Shinas',
    'OM1100341560',
    'Talal Al Farsi',
    '+968 9767 8899',
  ),
  tenant(
    'mabela-parts',
    'Mabela Auto Parts',
    'Mabela',
    'OM1100672294',
    'Rashid Al Wahaibi',
    '+968 9878 9900',
  ),
  tenant(
    'nakhal-honey',
    'Nakhal Honey',
    'Nakhal',
    'OM1100118246',
    'Maryam Al Ghafri',
    '+968 9989 0011',
  ),
  tenant(
    'jalan-fish',
    'Jalan Fish Market',
    'Jalan Bani Bu Ali',
    'OM1100520417',
    'Said Al Hashmi',
    '+968 9190 1122',
  ),
  tenant(
    'sumail-poultry',
    'Sumail Poultry',
    'Sumail',
    'OM1100769051',
    'Khalfan Al Riyami',
    '+968 9201 2233',
  ),
  tenant(
    'bidbid-cafe',
    'Bidbid Café',
    'Bidbid',
    'OM1100433875',
    'Huda Al Maamari',
    '+968 9312 3344',
  ),
  tenant(
    'bahwan-group',
    'Bahwan Group',
    'Muscat',
    'OM1100001122',
    'Group finance',
    '+968 2470 0000',
  ),
  tenant(
    'adam-transport',
    'Adam Transport',
    'Adam',
    'OM1100355698',
    'Sultan Al Harthi',
    '+968 9423 4455',
  ),
  tenant(
    'mirbat-resort',
    'Mirbat Bay Resort',
    'Mirbat',
    'OM1100687304',
    'Reservations',
    '+968 9534 5566',
  ),
]

function tenant(
  id: string,
  name: string,
  town: string,
  vat: string,
  contactName: string,
  phone: string,
): TenantIdentity {
  return {
    id,
    name,
    initials: name
      .split(' ')
      .filter((word) => /^[A-Z]/.test(word))
      .slice(0, 2)
      .map((word) => word[0])
      .join(''),
    town,
    vat,
    contact: {
      name: contactName,
      phone,
      email: `accounts@${id.replace(/-/g, '')}.om`,
    },
  }
}

const KNOWN_CONTACTS: Record<string, TenantIdentity['contact']> = {
  'sur-trading': {
    name: 'Hilal Al Araimi',
    phone: '+968 9911 2233',
    email: 'accounts@surtrading.om',
  },
  'al-bahja': { name: 'Hafidh Saif', phone: '+968 2544 1180', email: 'hafidh@albahja.om' },
  'muscat-grand': { name: 'Finance office', phone: '+968 2460 0100', email: 'ap@muscatgrand.om' },
  'nizwa-wholesale': {
    name: 'Saif Al Adawi',
    phone: '+968 9922 3344',
    email: 'saif@nizwawholesale.om',
  },
  'barka-beach': { name: 'Reem Al Balushi', phone: '+968 9933 4455', email: 'reem@barkabeach.om' },
  'salalah-spice': {
    name: 'Omar Al Kathiri',
    phone: '+968 9944 5566',
    email: 'omar@salalahspice.om',
  },
  'oman-marine': { name: 'Accounts', phone: '+968 2684 0200', email: 'accounts@omanmarine.om' },
}

/** Every tenant the subscription screens can open, by id. */
export const TENANT_IDENTITIES: Record<string, TenantIdentity> = Object.fromEntries([
  ...TENANTS.map((t) => [
    t.id,
    {
      id: t.id,
      name: t.name,
      initials: t.initials,
      town: t.town,
      vat: t.vat,
      contact: KNOWN_CONTACTS[t.id],
    },
  ]),
  ...EXTRA_TENANTS.map((t) => [t.id, t]),
])

export function tenantIdentity(id: string): TenantIdentity {
  const found = TENANT_IDENTITIES[id]
  if (!found) throw new Error(`No tenant ${id}`)
  return found
}

/** "Al Noor Trading LLC" → `al-noor-trading-llc`, made unique against the tenants already known. */
function slugOf(name: string) {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tenant'
  let slug = base
  for (let n = 2; TENANT_IDENTITIES[slug]; n += 1) slug = `${base}-${n}`
  return slug
}

/** A tenant an operator onboarded at the desk: known to `tenantIdentity` from now on. */
function registerTenant(identity: TenantIdentity) {
  TENANT_IDENTITIES[identity.id] = identity
}

/* ------------------------------------------------------------ the population */

type Seed = {
  tenantId: string
  plan: SubscriptionPlanId
  term: Term
  state: SubscriptionState
  /** The current period's first day. */
  from: Date
  method: PaymentMethod
  usage?: Partial<Subscription['usage']>
  /** For the open invoice, when one is unpaid: what has happened to it. */
  open?: { due: Date; link?: { via: LinkChannel; sentAt: Date; status: LinkStatus } }
  paid?: { on: Date; method: PaymentMethod; reference?: string; by?: string }
  trial?: { started: Date; used: number }
  graceSince?: Date
  stateSince?: Date
  extras?: { people?: number; branches?: number }
  enterprise?: EnterpriseTerms
  grandfatheredSince?: Date
  overageOn?: boolean
}

/** The operator signed in to the mock console; the real name comes from the session. */
export const OPERATOR = 'Nasser Al Habsi'
const OPERATORS = [OPERATOR, 'Aisha Al Hinai', 'Saif Al Lawati']

/** Renewal invoices fall due on the first day of the period; the trial's first invoice on its last day. */
const SEEDS: Seed[] = [
  /* awaiting payment — nine, listed in full so the KPI is their sum */
  {
    tenantId: 'al-noor',
    plan: 'business',
    term: 'monthly',
    state: 'awaitingPayment',
    from: d(9, 1),
    method: 'cardLink',
    open: {
      due: d(9, 1),
      link: { via: 'whatsapp', sentAt: new Date(2026, 8, 2, 10, 14), status: 'unpaid' },
    },
    usage: { documents: 41, people: 4, branches: 1 },
  },
  {
    tenantId: 'sohar-steel',
    plan: 'businessPlus',
    term: 'quarterly',
    state: 'awaitingPayment',
    from: d(9, 1),
    method: 'bankTransfer',
    open: { due: d(9, 1) },
    usage: { documents: 212, people: 8, branches: 3 },
  },
  {
    tenantId: 'bahla-pottery',
    plan: 'starter',
    term: 'monthly',
    state: 'awaitingPayment',
    from: d(9, 3),
    method: 'cash',
    open: { due: d(9, 3) },
    usage: { documents: 6, people: 1, branches: 1 },
  },
  {
    tenantId: 'ibri-dates',
    plan: 'starter',
    term: 'annual',
    state: 'awaitingPayment',
    from: d(9, 4),
    method: 'cheque',
    open: { due: d(9, 4) },
    usage: { documents: 3, people: 2, branches: 1 },
  },
  {
    tenantId: 'seeb-pharmacy',
    plan: 'business',
    term: 'monthly',
    state: 'awaitingPayment',
    from: d(9, 1),
    method: 'cardLink',
    open: {
      due: d(9, 1),
      link: { via: 'email', sentAt: new Date(2026, 7, 20, 9, 5), status: 'expired' },
    },
    usage: { documents: 118, people: 5, branches: 2 },
  },
  {
    tenantId: 'qurum-dental',
    plan: 'business',
    term: 'monthly',
    state: 'awaitingPayment',
    from: d(9, 1),
    method: 'bankTransfer',
    open: { due: d(9, 1) },
    usage: { documents: 27, people: 3, branches: 1 },
  },
  {
    tenantId: 'nizwa-wholesale',
    plan: 'business',
    term: 'monthly',
    state: 'awaitingPayment',
    from: d(9, 1),
    method: 'cardLink',
    open: { due: d(9, 1) },
    usage: { documents: 56, people: 5, branches: 2 },
  },
  {
    tenantId: 'rustaq-motors',
    plan: 'business',
    term: 'monthly',
    state: 'awaitingPayment',
    from: d(9, 1),
    method: 'cardLink',
    open: {
      due: d(9, 1),
      link: { via: 'whatsapp', sentAt: new Date(2026, 8, 3, 16, 40), status: 'unpaid' },
    },
    usage: { documents: 33, people: 2, branches: 1 },
  },
  {
    tenantId: 'salalah-tours',
    plan: 'starter',
    term: 'monthly',
    state: 'awaitingPayment',
    from: d(9, 2),
    method: 'cash',
    open: { due: d(9, 2) },
    usage: { documents: 9, people: 2, branches: 1 },
  },

  /* in grace — the invoice fell due, fourteen days run from there */
  {
    tenantId: 'muttrah-souq',
    plan: 'business',
    term: 'monthly',
    state: 'grace',
    from: d(8, 25),
    method: 'cardLink',
    open: {
      due: d(8, 25),
      link: { via: 'whatsapp', sentAt: new Date(2026, 7, 26, 11, 0), status: 'unpaid' },
    },
    graceSince: d(8, 25),
    usage: { documents: 64, people: 5, branches: 2 },
  },
  {
    tenantId: 'buraimi-hardware',
    plan: 'starter',
    term: 'monthly',
    state: 'grace',
    from: d(8, 28),
    method: 'bankTransfer',
    open: { due: d(8, 28) },
    graceSince: d(8, 28),
    usage: { documents: 12, people: 2, branches: 1 },
  },
  {
    tenantId: 'khasab-ferry',
    plan: 'businessPlus',
    term: 'monthly',
    state: 'grace',
    from: d(8, 22),
    method: 'cardLink',
    open: {
      due: d(8, 22),
      link: { via: 'email', sentAt: new Date(2026, 7, 22, 8, 30), status: 'expired' },
    },
    graceSince: d(8, 22),
    usage: { documents: 340, people: 9, branches: 4 },
  },
  {
    tenantId: 'amerat-bakery',
    plan: 'starter',
    term: 'monthly',
    state: 'grace',
    from: d(8, 30),
    method: 'cash',
    open: { due: d(8, 30) },
    graceSince: d(8, 30),
    usage: { documents: 8, people: 2, branches: 1 },
  },

  /* suspended — read-only; the compliance record stays open */
  {
    tenantId: 'duqm-logistics',
    plan: 'business',
    term: 'monthly',
    state: 'suspended',
    from: d(8, 6),
    method: 'bankTransfer',
    open: { due: d(8, 6) },
    stateSince: d(8, 20),
    usage: { documents: 0, people: 4, branches: 2 },
  },
  {
    tenantId: 'sur-fisheries',
    plan: 'starter',
    term: 'monthly',
    state: 'suspended',
    from: d(7, 29),
    method: 'cash',
    open: { due: d(7, 29) },
    stateSince: d(8, 12),
    usage: { documents: 0, people: 1, branches: 1 },
  },
  {
    tenantId: 'saham-farms',
    plan: 'starter',
    term: 'monthly',
    state: 'suspended',
    from: d(8, 18),
    method: 'cardLink',
    open: {
      due: d(8, 18),
      link: { via: 'whatsapp', sentAt: new Date(2026, 7, 18, 12, 0), status: 'expired' },
    },
    stateSince: d(9, 1),
    usage: { documents: 0, people: 2, branches: 1 },
  },

  /* on trial — the seven onboarding tenants; fifteen days, twenty-five documents */
  {
    tenantId: 'barka-beach',
    plan: 'business',
    term: 'monthly',
    state: 'trial',
    from: d(9, 2),
    method: 'cardLink',
    trial: { started: d(9, 2), used: 11 },
    usage: { people: 3, branches: 1 },
  },
  {
    tenantId: 'shinas-print',
    plan: 'business',
    term: 'monthly',
    state: 'trial',
    from: d(8, 22),
    method: 'cardLink',
    trial: { started: d(8, 22), used: 21 },
    usage: { people: 2, branches: 1 },
  },
  {
    tenantId: 'mabela-parts',
    plan: 'starter',
    term: 'monthly',
    state: 'trial',
    from: d(8, 25),
    method: 'cash',
    trial: { started: d(8, 25), used: 9 },
    usage: { people: 1, branches: 1 },
  },
  {
    tenantId: 'nakhal-honey',
    plan: 'starter',
    term: 'annual',
    state: 'trial',
    from: d(8, 30),
    method: 'bankTransfer',
    trial: { started: d(8, 30), used: 3 },
    usage: { people: 1, branches: 1 },
  },
  {
    tenantId: 'jalan-fish',
    plan: 'business',
    term: 'monthly',
    state: 'trial',
    from: d(8, 21),
    method: 'cash',
    trial: { started: d(8, 21), used: 25 },
    usage: { people: 2, branches: 1 },
  },
  {
    tenantId: 'sumail-poultry',
    plan: 'starter',
    term: 'monthly',
    state: 'trial',
    from: d(9, 1),
    method: 'cardLink',
    trial: { started: d(9, 1), used: 0 },
    usage: { people: 1, branches: 1 },
  },
  {
    tenantId: 'bidbid-cafe',
    plan: 'starter',
    term: 'monthly',
    state: 'trial',
    from: d(8, 28),
    method: 'cardLink',
    trial: { started: d(8, 28), used: 6 },
    usage: { people: 2, branches: 1 },
  },

  /* active — the tenants the console already names, plus one Enterprise */
  {
    tenantId: 'sur-trading',
    plan: 'starter',
    term: 'monthly',
    state: 'active',
    from: d(9, 1),
    method: 'cash',
    paid: { on: d(9, 1), method: 'cash', by: 'Aisha Al Hinai' },
    usage: { documents: 51, people: 2, branches: 1 },
    grandfatheredSince: d(5, 12),
  },
  {
    tenantId: 'al-bahja',
    plan: 'business',
    term: 'monthly',
    state: 'active',
    from: d(9, 1),
    method: 'cardLink',
    paid: { on: d(9, 1), method: 'cardLink', reference: 'THW-2026-09-01-4417' },
    usage: { documents: 880, people: 5, branches: 3 },
    extras: { branches: 1 },
  },
  {
    tenantId: 'muscat-grand',
    plan: 'businessPlus',
    term: 'annual',
    state: 'active',
    from: d(9, 1),
    method: 'bankTransfer',
    paid: { on: d(8, 28), method: 'bankTransfer', reference: 'BM-TRF-88213' },
    usage: { documents: 934, people: 10, branches: 4 },
  },
  {
    tenantId: 'salalah-spice',
    plan: 'business',
    term: 'monthly',
    state: 'active',
    from: d(9, 1),
    method: 'cardLink',
    paid: { on: d(9, 1), method: 'cardLink', reference: 'THW-2026-09-01-2210' },
    usage: { documents: 221, people: 6, branches: 2 },
    extras: { people: 1 },
  },
  {
    tenantId: 'oman-marine',
    plan: 'businessPlus',
    term: 'quarterly',
    state: 'active',
    from: d(7, 1),
    method: 'bankTransfer',
    paid: { on: d(6, 29), method: 'bankTransfer', reference: 'NBO-TRF-51920' },
    usage: { documents: 1062, people: 12, branches: 5 },
    extras: { people: 2 },
    overageOn: true,
  },
  {
    tenantId: 'bahwan-group',
    plan: 'enterprise',
    term: 'annual',
    state: 'active',
    from: d(1, 1),
    method: 'bankTransfer',
    paid: { on: d(1, 5), method: 'bankTransfer', reference: 'BG-2026-0001' },
    usage: { documents: 8_420, people: 46, branches: 19 },
    enterprise: {
      monthly: 480,
      documents: 15_000,
      people: null,
      branches: null,
      overage: null,
      contractFrom: d(1, 1),
      contractTo: d(12, 31),
      sla: '99.9 % · 4 h response',
    },
  },

  /* cancelled — two of the twelve, the recent ones */
  {
    tenantId: 'adam-transport',
    plan: 'business',
    term: 'monthly',
    state: 'cancelled',
    from: d(8, 1),
    method: 'bankTransfer',
    stateSince: d(8, 15),
    usage: { documents: 0, people: 3, branches: 1 },
  },
  {
    tenantId: 'mirbat-resort',
    plan: 'starter',
    term: 'monthly',
    state: 'cancelled',
    from: d(6, 1),
    method: 'cash',
    stateSince: d(7, 1),
    usage: { documents: 0, people: 2, branches: 1 },
  },
]

/** Platform-wide counts by state; the listed rows are the ones a person might act on. */
export const SUBSCRIPTIONS_PLATFORM = {
  active: 268,
  awaitingPayment: 9,
  grace: 4,
  suspended: 3,
  trial: PLATFORM.onboarding,
  cancelled: PLATFORM.closed,
} as const

/* --------------------------------------------------------------- building */

type Ledger = {
  subscriptions: Subscription[]
  invoices: SubscriptionInvoice[]
  payments: Payment[]
  links: PaymentLink[]
  events: SubscriptionEvent[]
  grants: QuotaGrant[]
}

let sequence = 900

function invoiceNumber(issued: Date) {
  sequence += 1
  return `FWT-${issued.getFullYear()}-${String(issued.getMonth() + 1).padStart(2, '0')}${String(sequence).padStart(2, '0')}`
}

function extrasAmount(seed: Seed) {
  if (seed.plan === 'enterprise') return 0
  const plan = PLAN[seed.plan]
  const people = (seed.extras?.people ?? 0) * plan.extraPerson
  const branches = (seed.extras?.branches ?? 0) * (plan.extraBranch ?? 0)
  return (people + branches) * MONTHS_OF[seed.term]
}

function build(): Ledger {
  const ledger: Ledger = {
    subscriptions: [],
    invoices: [],
    payments: [],
    links: [],
    events: [],
    grants: [],
  }
  SEEDS.forEach((seed, index) => {
    const months = MONTHS_OF[seed.term]
    const periodEnd = seed.trial
      ? addDays(seed.trial.started, TRIAL.days)
      : addMonths(seed.from, months)
    const base = periodAmount(seed.plan, seed.term, seed.enterprise) + extrasAmount(seed)
    const usage = { documents: seed.trial?.used ?? 0, people: 1, branches: 1, ...seed.usage }
    const subscription: Subscription = {
      tenantId: seed.tenantId,
      plan: seed.plan,
      term: seed.term,
      state: seed.state,
      periodStart: seed.from,
      periodEnd,
      amountDue: 0,
      preferredMethod: seed.method,
      trialEndsAt: seed.trial ? periodEnd : undefined,
      trialUsed: seed.trial?.used,
      graceSince: seed.graceSince,
      stateSince: seed.stateSince,
      grandfatheredSince: seed.grandfatheredSince,
      enterprise: seed.enterprise,
      usage,
      overageOn: seed.overageOn ?? PLATFORM_SETTINGS.overage.enabledByDefault,
    }

    if (!seed.trial) {
      const issued = addDays(seed.from, -7)
      const invoice: SubscriptionInvoice = {
        id: `inv-${seed.tenantId}-${index}`,
        tenantId: seed.tenantId,
        number: invoiceNumber(issued),
        periodStart: seed.from,
        periodEnd,
        issued,
        due: seed.open?.due ?? seed.from,
        amount: base,
        vat: vatOn(base),
        total: withVat(base),
        status: seed.paid
          ? 'paid'
          : seed.state === 'cancelled'
            ? 'waived'
            : seed.state === 'awaitingPayment' && (seed.open?.due ?? seed.from) >= NOW
              ? 'unpaid'
              : seed.paid
                ? 'paid'
                : 'overdue',
        paidOn: seed.paid?.on,
        method: seed.paid?.method,
        // Only the extras that exist are named, so a bill with one extra branch does not read
        // "0 extra people · 1 extra branches".
        coverKey:
          seed.extras?.people && seed.extras?.branches
            ? 'console.subscriptions.cover.planExtras'
            : seed.extras?.people
              ? 'console.subscriptions.cover.planPeople'
              : seed.extras?.branches
                ? 'console.subscriptions.cover.planBranches'
                : 'console.subscriptions.cover.plan',
        coverValues: {
          plan: seed.plan,
          people: seed.extras?.people ?? 0,
          branches: seed.extras?.branches ?? 0,
          count: seed.extras?.people || seed.extras?.branches || 0,
        },
      }
      if (
        seed.state === 'awaitingPayment' &&
        invoice.status === 'overdue' &&
        invoice.due >= addDays(NOW, -4)
      )
        invoice.status = 'unpaid'
      ledger.invoices.push(invoice)
      if (!seed.paid && seed.state !== 'cancelled') subscription.amountDue = invoice.total

      if (seed.paid) {
        subscription.lastPayment = {
          at: seed.paid.on,
          method: seed.paid.method,
          amount: invoice.total,
        }
        const by = seed.paid.method === 'cardLink' ? 'Paymob' : (seed.paid.by ?? OPERATOR)
        ledger.payments.push({
          id: `pay-${seed.tenantId}-${index}`,
          tenantId: seed.tenantId,
          invoiceId: invoice.id,
          method: seed.paid.method,
          amount: invoice.total,
          receivedOn: seed.paid.on,
          reference: seed.paid.reference,
          confirmedBy: by,
          recordedAt: seed.paid.on,
        })
        ledger.events.push(
          event(seed.tenantId, seed.paid.on, by, 'paymentRecorded', {
            method: seed.paid.method,
            amount: invoice.total,
          }),
          event(
            seed.tenantId,
            seed.paid.on,
            seed.paid.method === 'cardLink' ? OPERATORS[1] : (seed.paid.by ?? OPERATOR),
            'activated',
            { until: periodEnd.getTime() },
          ),
        )
      }
      if (seed.open?.link) {
        const sentAt = seed.open.link.sentAt
        ledger.links.push({
          id: `link-${seed.tenantId}`,
          tenantId: seed.tenantId,
          invoiceId: invoice.id,
          url: `https://accept.paymob.com/unifiedcheckout/?publicKey=pk_live&clientSecret=${seed.tenantId.replace(/-/g, '')}${index}`,
          sentVia: seed.open.link.via,
          sentAt,
          sentBy: OPERATORS[index % OPERATORS.length],
          expiresAt: addDays(sentAt, PLATFORM_SETTINGS.payments.linkExpiryDays),
          status: seed.open.link.status,
        })
        ledger.events.push(
          event(seed.tenantId, sentAt, OPERATORS[index % OPERATORS.length], 'linkSent', {
            via: seed.open.link.via,
          }),
        )
      }
    }
    if (seed.stateSince && seed.state === 'suspended')
      ledger.events.push(
        event(seed.tenantId, seed.stateSince, OPERATOR, 'suspended', {
          reason: 'Unpaid after fourteen days of grace',
        }),
      )
    if (seed.stateSince && seed.state === 'cancelled')
      ledger.events.push(
        event(seed.tenantId, seed.stateSince, OPERATORS[2], 'cancelled', {
          reason: 'Customer closed the business',
        }),
      )
    if (seed.trial)
      ledger.events.push(
        event(seed.tenantId, seed.trial.started, 'Sign-up', 'trialStarted', { days: TRIAL.days }),
      )
    ledger.subscriptions.push(subscription)
  })
  ledger.events.sort((a, b) => b.at.getTime() - a.at.getTime())
  return ledger
}

let eventSequence = 0
function event(
  tenantId: string,
  at: Date,
  by: string,
  actionKey: string,
  values?: Record<string, string | number>,
): SubscriptionEvent {
  eventSequence += 1
  return { id: `ev-${eventSequence}`, tenantId, at, by, actionKey, values }
}

/* ------------------------------------------------------------------- store */

let state: Ledger = build()
const listeners = new Set<() => void>()

function set(next: Ledger) {
  state = next
  listeners.forEach((listener) => listener())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function patchSubscription(ledger: Ledger, tenantId: string, patch: Partial<Subscription>): Ledger {
  return {
    ...ledger,
    subscriptions: ledger.subscriptions.map((s) =>
      s.tenantId === tenantId ? { ...s, ...patch } : s,
    ),
  }
}

let actionSequence = 0
const nextId = (prefix: string) => `${prefix}-${++actionSequence}`

export type RecordPaymentInput = {
  tenantId: string
  invoiceId: string
  method: PaymentMethod
  amount: number
  receivedOn: Date
  reference?: string
  note?: string
  /** Bring the account live for the period the invoice covers. */
  activate: boolean
}

export type SendLinkInput = { tenantId: string; invoiceId: string; via: LinkChannel }

export type ActivateInput = {
  tenantId: string
  plan: SubscriptionPlanId
  term: Term
  start: Date
  reason: string
}

export type ChangePlanInput = {
  tenantId: string
  plan: SubscriptionPlanId
  term: Term
  when: 'now' | 'periodEnd'
  reason: string
}

export type OnboardInput = {
  legalName: string
  tradingName: string
  /** Commercial registration number. */
  cr: string
  vat: string
  town: string
  businessType: string
  owner: { name: string; phone: string; email: string }
  plan: SubscriptionPlanId
  term: Term
  method: PaymentMethod
  /** Money already in hand — the first invoice is marked paid on creation. */
  payment?: {
    amount: number
    receivedOn: Date
    reference?: string
    note?: string
    /** Bring the account live at once, rather than leaving it Awaiting payment. */
    activate: boolean
  }
}

/**
 * The platform totals are stated, not summed (`SUBSCRIPTIONS_PLATFORM`), so a tenant created here
 * has to be counted by hand or the queue's tab would claim "10 of 9". `as const` is type-only;
 * the objects are plain and the queue reads them at render time.
 */
function countOnboarded(state: SubscriptionState) {
  const platform = SUBSCRIPTIONS_PLATFORM as unknown as Record<SubscriptionState, number>
  platform[state] += 1
  const tabs = SUBSCRIPTION_TABS as unknown as { id: string; count: number }[]
  tabs.forEach((tab) => {
    if (tab.id === 'all' || tab.id === state) tab.count += 1
  })
}

/**
 * What an operator does about a subscription. Kept outside React so a payment recorded in the
 * queue is already there when the tenant's page opens; every action leaves an event behind.
 */
export const subscriptionsStore = {
  recordPayment(input: RecordPaymentInput) {
    const now = NOW
    const invoice = state.invoices.find((i) => i.id === input.invoiceId)
    if (!invoice) return
    let next: Ledger = {
      ...state,
      invoices: state.invoices.map((i) =>
        i.id === input.invoiceId
          ? { ...i, status: 'paid', paidOn: input.receivedOn, method: input.method }
          : i,
      ),
      payments: [
        {
          id: nextId('pay'),
          tenantId: input.tenantId,
          invoiceId: input.invoiceId,
          method: input.method,
          amount: input.amount,
          receivedOn: input.receivedOn,
          reference: input.reference,
          note: input.note,
          confirmedBy: OPERATOR,
          recordedAt: now,
        },
        ...state.payments,
      ],
      links: state.links.map((l) =>
        l.invoiceId === input.invoiceId ? { ...l, status: 'paid' } : l,
      ),
      events: [
        event(input.tenantId, now, OPERATOR, 'paymentRecorded', {
          method: input.method,
          amount: input.amount,
        }),
        ...state.events,
      ],
    }
    next = patchSubscription(next, input.tenantId, {
      amountDue: 0,
      lastPayment: { at: input.receivedOn, method: input.method, amount: input.amount },
    })
    if (input.activate) {
      next = patchSubscription(next, input.tenantId, {
        state: 'active',
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        graceSince: undefined,
        stateSince: undefined,
      })
      next = {
        ...next,
        events: [
          event(input.tenantId, now, OPERATOR, 'activated', { until: invoice.periodEnd.getTime() }),
          ...next.events,
        ],
      }
    }
    set(next)
  },

  sendLink(input: SendLinkInput) {
    const now = NOW
    const link: PaymentLink = {
      id: nextId('link'),
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      url: `https://accept.paymob.com/unifiedcheckout/?publicKey=pk_live&clientSecret=${input.tenantId.replace(/-/g, '')}${actionSequence}`,
      sentVia: input.via,
      sentAt: now,
      sentBy: OPERATOR,
      expiresAt: addDays(now, PLATFORM_SETTINGS.payments.linkExpiryDays),
      status: 'unpaid',
    }
    set({
      ...state,
      links: [
        link,
        ...state.links.map((l) =>
          l.invoiceId === input.invoiceId && l.status === 'unpaid'
            ? { ...l, status: 'expired' as LinkStatus }
            : l,
        ),
      ],
      events: [
        event(input.tenantId, now, OPERATOR, 'linkSent', { via: input.via }),
        ...state.events,
      ],
    })
    return link
  },

  activate(input: ActivateInput) {
    const now = NOW
    const current = state.subscriptions.find((s) => s.tenantId === input.tenantId)
    if (!current) return
    const periodEnd = addMonths(input.start, MONTHS_OF[input.term])
    let next = patchSubscription(state, input.tenantId, {
      state: 'active',
      plan: input.plan,
      term: input.term,
      periodStart: input.start,
      periodEnd,
      amountDue: 0,
      trialEndsAt: undefined,
      trialUsed: undefined,
      graceSince: undefined,
      stateSince: undefined,
    })
    next = {
      ...next,
      events: [
        event(input.tenantId, now, OPERATOR, 'activatedWithoutPayment', {
          until: periodEnd.getTime(),
          reason: input.reason,
        }),
        ...next.events,
      ],
    }
    set(next)
  },

  changePlan(input: ChangePlanInput) {
    const now = NOW
    const current = state.subscriptions.find((s) => s.tenantId === input.tenantId)
    if (!current) return
    let next: Ledger
    if (input.when === 'now') {
      next = patchSubscription(state, input.tenantId, {
        plan: input.plan,
        term: input.term,
        scheduledChange: undefined,
        grandfatheredSince: undefined,
      })
    } else {
      next = patchSubscription(state, input.tenantId, {
        scheduledChange: { plan: input.plan, term: input.term, at: current.periodEnd },
      })
    }
    set({
      ...next,
      events: [
        event(
          input.tenantId,
          now,
          OPERATOR,
          input.when === 'now' ? 'planChanged' : 'planChangeScheduled',
          {
            plan: input.plan,
            term: input.term,
            reason: input.reason,
            at: current.periodEnd.getTime(),
          },
        ),
        ...next.events,
      ],
    })
  },

  suspend(tenantId: string, reason: string) {
    const next = patchSubscription(state, tenantId, { state: 'suspended', stateSince: NOW })
    set({
      ...next,
      events: [event(tenantId, NOW, OPERATOR, 'suspended', { reason }), ...next.events],
    })
  },

  resume(tenantId: string, reason: string) {
    const next = patchSubscription(state, tenantId, {
      state: 'active',
      stateSince: undefined,
      graceSince: undefined,
    })
    set({
      ...next,
      events: [event(tenantId, NOW, OPERATOR, 'resumed', { reason }), ...next.events],
    })
  },

  /**
   * A business that never signed up online (§9.3 "Onboard a business"). The identity is
   * registered so every screen can name it, the first period's invoice is issued today, and the
   * account is Awaiting payment — or Active at once when the money is already in hand and the
   * operator asked for it. Every step leaves the same events the queue's own actions would.
   */
  onboard(input: OnboardInput): { tenantId: string } {
    const now = NOW
    const tenantId = slugOf(input.tradingName)
    registerTenant({
      id: tenantId,
      name: input.tradingName.trim(),
      initials: input.tradingName
        .trim()
        .split(/\s+/)
        .filter((word) => /^[A-Za-z]/.test(word))
        .slice(0, 2)
        .map((word) => word[0].toUpperCase())
        .join(''),
      town: input.town,
      vat: input.vat,
      contact: { name: input.owner.name, phone: input.owner.phone, email: input.owner.email },
    })

    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const periodEnd = addMonths(periodStart, MONTHS_OF[input.term])
    const base = periodAmount(input.plan, input.term)
    const paid = input.payment
    const activate = Boolean(paid?.activate)
    const invoice: SubscriptionInvoice = {
      id: nextId('inv'),
      tenantId,
      number: invoiceNumber(now),
      periodStart,
      periodEnd,
      issued: now,
      due: periodStart,
      amount: base,
      vat: vatOn(base),
      total: withVat(base),
      status: paid ? 'paid' : 'unpaid',
      paidOn: paid?.receivedOn,
      method: paid ? input.method : undefined,
      coverKey: 'console.subscriptions.cover.plan',
      coverValues: { plan: input.plan, people: 0, branches: 0, count: 0 },
    }
    const subscription: Subscription = {
      tenantId,
      plan: input.plan,
      term: input.term,
      state: activate ? 'active' : 'awaitingPayment',
      periodStart,
      periodEnd,
      amountDue: paid ? 0 : invoice.total,
      preferredMethod: input.method,
      lastPayment: paid
        ? { at: paid.receivedOn, method: input.method, amount: paid.amount }
        : undefined,
      usage: { documents: 0, people: 1, branches: 1 },
      overageOn: PLATFORM_SETTINGS.overage.enabledByDefault,
    }
    const events: SubscriptionEvent[] = [
      event(tenantId, now, OPERATOR, 'tenantOnboarded', {
        plan: input.plan,
        term: input.term,
        method: input.method,
        owner: input.owner.name,
      }),
    ]
    const payments: Payment[] = []
    if (paid) {
      payments.push({
        id: nextId('pay'),
        tenantId,
        invoiceId: invoice.id,
        method: input.method,
        amount: paid.amount,
        receivedOn: paid.receivedOn,
        reference: paid.reference,
        note: paid.note,
        confirmedBy: OPERATOR,
        recordedAt: now,
      })
      events.unshift(
        event(tenantId, now, OPERATOR, 'paymentRecorded', {
          method: input.method,
          amount: paid.amount,
        }),
      )
      if (activate)
        events.unshift(event(tenantId, now, OPERATOR, 'activated', { until: periodEnd.getTime() }))
    }
    countOnboarded(subscription.state)
    set({
      ...state,
      subscriptions: [...state.subscriptions, subscription],
      invoices: [invoice, ...state.invoices],
      payments: [...payments, ...state.payments],
      events: [...events, ...state.events],
    })
    return { tenantId }
  },
}

export function useSubscriptions() {
  return useSyncExternalStore(subscribe, () => state)
}

/* ------------------------------------------------------------------ readers */

export function subscriptionOf(ledger: Ledger, tenantId: string): Subscription | undefined {
  return ledger.subscriptions.find((s) => s.tenantId === tenantId)
}

export function openInvoiceOf(ledger: Ledger, tenantId: string): SubscriptionInvoice | undefined {
  return ledger.invoices.find(
    (i) => i.tenantId === tenantId && (i.status === 'unpaid' || i.status === 'overdue'),
  )
}

export function invoicesOf(ledger: Ledger, tenantId: string) {
  return ledger.invoices
    .filter((i) => i.tenantId === tenantId)
    .sort((a, b) => b.issued.getTime() - a.issued.getTime())
}
export function paymentsOf(ledger: Ledger, tenantId: string) {
  return ledger.payments
    .filter((p) => p.tenantId === tenantId)
    .sort((a, b) => b.receivedOn.getTime() - a.receivedOn.getTime())
}
export function linksOf(ledger: Ledger, tenantId: string) {
  return ledger.links
    .filter((l) => l.tenantId === tenantId)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
}
export function eventsOf(ledger: Ledger, tenantId: string) {
  return ledger.events.filter((e) => e.tenantId === tenantId)
}
export function grantsOf(ledger: Ledger, tenantId: string) {
  return ledger.grants.filter((g) => g.tenantId === tenantId)
}

/** The current open link on an invoice, if any, with expiry applied at the console's clock. */
export function linkStatusAt(link: PaymentLink, now = NOW): LinkStatus {
  if (link.status !== 'unpaid') return link.status
  return link.expiresAt < now ? 'expired' : 'unpaid'
}

/** Day of grace, 1-based, at the console's clock. */
export function graceDay(subscription: Subscription, now = NOW) {
  if (!subscription.graceSince) return 0
  return Math.floor((now.getTime() - subscription.graceSince.getTime()) / DAY) + 1
}

/** When a subscription in grace will be suspended if nothing arrives. */
export function suspendsOn(subscription: Subscription) {
  return subscription.graceSince
    ? addDays(subscription.graceSince, PLATFORM_SETTINGS.lifecycle.graceDays)
    : undefined
}

export function daysUntil(date: Date, now = NOW) {
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)
  return Math.round((date.getTime() - from.getTime()) / DAY)
}

/** The allowance a subscription is measured against: the plan's, the trial's, or the contract's. */
export function documentsAllowance(subscription: Subscription) {
  if (subscription.state === 'trial') return TRIAL.documents
  if (subscription.plan === 'enterprise') return subscription.enterprise?.documents ?? 0
  return PLAN[subscription.plan].documents
}

export function planLabelKey(plan: SubscriptionPlanId) {
  return plan === 'enterprise' ? 'plan.planName.enterprise' : PLAN[plan].labelKey
}

/** The queue's tabs, with counts drawn from the platform totals rather than the listed rows. */
export const SUBSCRIPTION_TABS = [
  { id: 'all', count: Object.values(SUBSCRIPTIONS_PLATFORM).reduce((a, b) => a + b, 0) },
  { id: 'awaitingPayment', count: SUBSCRIPTIONS_PLATFORM.awaitingPayment },
  { id: 'grace', count: SUBSCRIPTIONS_PLATFORM.grace },
  { id: 'trial', count: SUBSCRIPTIONS_PLATFORM.trial },
  { id: 'active', count: SUBSCRIPTIONS_PLATFORM.active },
  { id: 'suspended', count: SUBSCRIPTIONS_PLATFORM.suspended },
  { id: 'cancelled', count: SUBSCRIPTIONS_PLATFORM.cancelled },
] as const

export type SubscriptionTabId = (typeof SUBSCRIPTION_TABS)[number]['id']

export function subscriptionsForTab(ledger: Ledger, tab: SubscriptionTabId) {
  const rows =
    tab === 'all' ? ledger.subscriptions : ledger.subscriptions.filter((s) => s.state === tab)
  const order: SubscriptionState[] = [
    'awaitingPayment',
    'grace',
    'trial',
    'suspended',
    'active',
    'cancelled',
  ]
  return [...rows].sort(
    (a, b) =>
      order.indexOf(a.state) - order.indexOf(b.state) ||
      a.periodEnd.getTime() - b.periodEnd.getTime(),
  )
}

/** The figures the queue's cards print, every one a sum over the rows or a platform total. */
export function queueKpis(ledger: Ledger) {
  const awaiting = ledger.subscriptions.filter((s) => s.state === 'awaitingPayment')
  const trialsEnding = ledger.subscriptions.filter(
    (s) => s.state === 'trial' && s.trialEndsAt && daysUntil(s.trialEndsAt) <= 7,
  )
  return {
    awaitingCount: awaiting.length,
    awaitingTotal: awaiting.reduce((sum, s) => sum + s.amountDue, 0),
    graceCount: ledger.subscriptions.filter((s) => s.state === 'grace').length,
    trialsEnding: trialsEnding.length,
    trialsTotal: SUBSCRIPTIONS_PLATFORM.trial,
    collectedThisMonth: ledger.payments
      .filter(
        (p) =>
          p.receivedOn.getMonth() === NOW.getMonth() &&
          p.receivedOn.getFullYear() === NOW.getFullYear(),
      )
      .reduce((sum, p) => sum + p.amount, 0),
  }
}

export const PLAN_OPTIONS: SubscriptionPlanId[] = [...CATALOGUE.map((p) => p.id), 'enterprise']
export const TERMS: Term[] = ['monthly', 'quarterly', 'annual']
export const METHODS: PaymentMethod[] = ['cardLink', 'bankTransfer', 'cash', 'cheque']

/** A WhatsApp deep link with the message a customer receives; the phone loses everything but digits. */
export function whatsappUrl(phone: string, message: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}

export { NOW as SUBSCRIPTIONS_NOW }
