import { useSyncExternalStore } from 'react'
import { SUBSCRIPTIONS_NOW, OPERATOR, tenantIdentity } from './consoleSubscriptions'
import { STORY_ENTRIES, type Entry } from './erpMapping'
import { DEFAULT_SETTINGS } from './platformSettings'
import type {
  AddonSource,
  AddonState,
  ConnectionState,
  MappingStatus,
  Product,
  RunState,
  ScheduleMinutes,
} from './erpConnector'

/**
 * The ERP side of the console — docs/erp-and-console-plan.md §9: every tenant's connections seen
 * from the platform, the add-on each tenant holds, the requests to switch it on, and the mapping
 * templates the connect wizard applies.
 *
 * The console clock is the subscriptions clock, Friday 4 September 2026 14:26. The tenant-side
 * connector story (`erpConnector.ts`, 26 September) is Al Bahja's own view; here Al Bahja is one
 * of nine tenants on the add-on, and the same three connections appear with the same ids.
 */

export const NOW = SUBSCRIPTIONS_NOW
const DAY = 24 * 60 * 60 * 1000
const MINUTE = 60 * 1000
const at = (daysAgo: number, hour = 10, minute = 0) => {
  const d = new Date(NOW.getTime() - daysAgo * DAY)
  d.setHours(hour, minute, 0, 0)
  return d
}
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * MINUTE)
const inMinutes = (m: number) => new Date(NOW.getTime() + m * MINUTE)

/** Fawtir's own operators, as the audit lines name them. */
export const OPERATORS = [OPERATOR, 'Maryam Al Balushi', 'Hamed Al Kindi'] as const

let idSeq = 5000
const nextId = (prefix: string) => `${prefix}-${++idSeq}`

/* ----------------------------------------------------------------- shapes */

export type PlatformRun = {
  at: Date
  state: RunState
  fetched: number
  created: number
  errors: number
}

export type PlatformConnection = {
  id: string
  tenantId: string
  label: string
  product: Product
  erpVersion: string
  state: ConnectionState
  errorKey?: 'credentials' | 'unreachable' | 'threeFailures'
  mappingStatus: MappingStatus
  /** The template version the mapping started from; undefined when hand-written. */
  templateVersionId?: string
  scheduleMinutes: ScheduleMinutes
  writeBackEnabled: boolean
  lastRunAt?: Date
  nextRunAt?: Date
  /** When the newest ERP invoice collected was issued. */
  watermarkAt?: Date
  collectedThisMonth: number
  rejections: number
  consecutiveFailures: number
  createdAt: Date
  recentRuns: PlatformRun[]
}

export type QuotaGrant = {
  id: string
  documents: number
  expires: Date
  reason: string
  by: string
  at: Date
}

export type TenantAddon = {
  tenantId: string
  state: AddonState
  source: AddonSource
  since?: Date
  /** Trial only. */
  trialEndsAt?: Date
  limits: { connections: number; documentsPerMonth: number }
  collectedThisMonth: number
  grants: QuotaGrant[]
  /** Suspended: why. */
  suspendedReason?: string
}

export type RequestStatus = 'pending' | 'approved' | 'declined'
export type AddonRequest = {
  id: string
  tenantId: string
  requestedAt: Date
  requestedBy: string
  /** The tenant's plan when they asked — Enterprise gets the add-on included. */
  plan: 'starter' | 'business' | 'businessPlus' | 'enterprise'
  source: AddonSource
  status: RequestStatus
  decidedAt?: Date
  decidedBy?: string
  /** Declined: why. Approved: an optional note. */
  note?: string
}

export type TemplateVersionState = 'draft' | 'published' | 'retired'
export type TemplateVersion = {
  id: string
  version: number
  state: TemplateVersionState
  /** Fawtir's mapping schema the version targets. */
  schemaVersion: string
  entries: Entry[]
  note: string
  savedAt: Date
  savedBy: string
  publishedAt?: Date
  publishedBy?: string
}

export type MappingTemplate = {
  id: string
  product: Product
  erpVersion: string
  name: string
  versions: TemplateVersion[]
}

export type ErpEvent = {
  id: string
  at: Date
  by: string
  /** `console.erp.event.*` */
  actionKey: string
  tenantId?: string
  values?: Record<string, string | number>
}

export type ConsoleErpState = {
  connections: PlatformConnection[]
  addons: TenantAddon[]
  requests: AddonRequest[]
  templates: MappingTemplate[]
  events: ErpEvent[]
}

/* ------------------------------------------------------------- templates */

/** Odoo's paths spoken the ERPNext way, for the ERPNext template. */
const ERPNEXT_PATHS: Record<string, string> = {
  'erp.name': 'erp.name',
  'erp.invoice_date': 'erp.posting_date',
  'erp.move_type': 'erp.is_return',
  'erp.currency': 'erp.currency',
  'erp.invoice_date_due': 'erp.due_date',
  'erp.ref': 'erp.po_no',
  'erp.reversed_entry.name': 'erp.return_against',
  'erp.reversed_entry.invoice_date': 'erp.return_against_date',
  'erp.partner_id.name': 'erp.customer_name',
  'erp.partner_id.vat': 'erp.tax_id',
  'erp.amount_untaxed': 'erp.net_total',
  'erp.amount_tax': 'erp.total_taxes_and_charges',
  'erp.amount_total': 'erp.grand_total',
  'erp.invoice_line_ids': 'erp.items',
}
const erpnextEntries = (entries: Entry[]): Entry[] =>
  entries.map((e) => ({
    ...e,
    sourcePath: e.sourcePath
      ? Object.entries(ERPNEXT_PATHS).reduce(
          (path, [odoo, erpnext]) =>
            path.startsWith(odoo) ? erpnext + path.slice(odoo.length) : path,
          e.sourcePath,
        )
      : e.sourcePath,
    valueMap: e.businessTermId === 'IBT-003' ? { '0': '380', '1': '381' } : e.valueMap,
  }))

/** Odoo 16 has no `reversed_entry` on refunds — its template maps five fewer terms. */
const odoo16Entries = (entries: Entry[]): Entry[] =>
  entries
    .filter((e) => !e.sourcePath?.startsWith('erp.reversed_entry'))
    .slice(0, 39)
    .map((e, ordinal) => ({ ...e, ordinal }))

/** Small ERP payloads for the template editor's dry-run. */
export const TEMPLATE_SAMPLES: Record<'ODOO' | 'ERPNEXT', unknown> = {
  ODOO: {
    id: 4412,
    name: 'INV/2026/09/0412',
    move_type: 'out_invoice',
    state: 'posted',
    invoice_date: '2026-09-04',
    invoice_date_due: '2026-10-04',
    currency: 'OMR',
    ref: 'PO-2211',
    partner_id: {
      id: 124,
      name: 'Nizwa Hypermarket',
      vat: 'OM1100061240',
      street: 'Way 3011, Al Khuwair',
      city: 'Muscat',
      country_code: 'OM',
      phone: '+968 2448 1200',
    },
    amount_untaxed: 1247.952,
    amount_tax: 62.398,
    amount_total: 1310.35,
    invoice_line_ids: [
      {
        id: 44121,
        name: 'Arabica beans 1 kg, Dhofar roast',
        quantity: 24,
        price_unit: 51.998,
        tax_rate: 5,
        price_subtotal: 1247.952,
      },
    ],
  },
  ERPNEXT: {
    name: 'SINV-2026-00871',
    doctype: 'Sales Invoice',
    docstatus: 1,
    is_return: 0,
    posting_date: '2026-09-02',
    due_date: '2026-10-02',
    customer_name: 'Salalah Mills Co.',
    tax_id: 'OM1100077712',
    currency: 'OMR',
    po_no: 'PO-0093',
    net_total: 612.4,
    total_taxes_and_charges: 30.62,
    grand_total: 643.02,
    items: [
      {
        item_code: 'BEAN-AR-1KG',
        item_name: 'Arabica beans 1 kg, Dhofar roast',
        qty: 12,
        rate: 51.033,
        amount: 612.4,
      },
    ],
  },
}

/* ------------------------------------------------------------------ story */

const run = (
  at: Date,
  state: RunState,
  fetched: number,
  created = fetched,
  errors = 0,
): PlatformRun => ({
  at,
  state,
  fetched,
  created,
  errors,
})

const healthyRuns = (every: number, count = 5, fetched = [4, 2, 0, 3, 1]) =>
  Array.from({ length: count }, (_, i) =>
    run(minutesAgo(every * (i + 1) - 6), 'SUCCEEDED', fetched[i] ?? 0),
  )

function initialState(): ConsoleErpState {
  idSeq = 5000
  const addonConfig = DEFAULT_SETTINGS.addons.erpExtraction
  const limits = { connections: 5, documentsPerMonth: addonConfig.documents }

  const templates: MappingTemplate[] = [
    {
      id: 'tpl-odoo-17',
      product: 'ODOO',
      erpVersion: '17',
      name: 'Odoo 17',
      versions: [
        {
          id: 'tpl-odoo-17-v1',
          version: 1,
          state: 'retired',
          schemaVersion: '2026-07-A',
          entries: odoo16Entries(STORY_ENTRIES),
          note: 'First cut from the Al Bahja pilot.',
          savedAt: at(60, 11, 0),
          savedBy: OPERATOR,
          publishedAt: at(58, 9, 30),
          publishedBy: OPERATOR,
        },
        {
          id: 'tpl-odoo-17-v2',
          version: 2,
          state: 'retired',
          schemaVersion: '2026-08-A',
          entries: STORY_ENTRIES.slice(0, 41).map((e, ordinal) => ({ ...e, ordinal })),
          note: 'Preceding invoice terms for credit and debit notes.',
          savedAt: at(33, 15, 0),
          savedBy: 'Maryam Al Balushi',
          publishedAt: at(32, 10, 0),
          publishedBy: OPERATOR,
        },
        {
          id: 'tpl-odoo-17-v3',
          version: 3,
          state: 'published',
          schemaVersion: '2026-09-A',
          entries: STORY_ENTRIES,
          note: 'Buyer contact and payment reference; ISIC default by route.',
          savedAt: at(8, 16, 20),
          savedBy: 'Maryam Al Balushi',
          publishedAt: at(7, 9, 15),
          publishedBy: OPERATOR,
        },
        {
          id: 'tpl-odoo-17-v4',
          version: 4,
          state: 'draft',
          schemaVersion: '2026-09-A',
          entries: STORY_ENTRIES,
          note: 'Draft: allowance charges on lines (IBG-20).',
          savedAt: at(1, 17, 5),
          savedBy: 'Hamed Al Kindi',
        },
      ],
    },
    {
      id: 'tpl-odoo-16',
      product: 'ODOO',
      erpVersion: '16',
      name: 'Odoo 16',
      versions: [
        {
          id: 'tpl-odoo-16-v1',
          version: 1,
          state: 'published',
          schemaVersion: '2026-09-A',
          entries: odoo16Entries(STORY_ENTRIES),
          note: 'Same as Odoo 17 without reversed-entry terms.',
          savedAt: at(7, 11, 40),
          savedBy: 'Maryam Al Balushi',
          publishedAt: at(7, 12, 0),
          publishedBy: OPERATOR,
        },
      ],
    },
    {
      id: 'tpl-erpnext-15',
      product: 'ERPNEXT',
      erpVersion: '15',
      name: 'ERPNext 15',
      versions: [
        {
          id: 'tpl-erpnext-15-v1',
          version: 1,
          state: 'retired',
          schemaVersion: '2026-08-A',
          entries: erpnextEntries(STORY_ENTRIES.slice(0, 38)).map((e, ordinal) => ({
            ...e,
            ordinal,
          })),
          note: 'First ERPNext template.',
          savedAt: at(30, 10, 0),
          savedBy: 'Hamed Al Kindi',
          publishedAt: at(29, 9, 0),
          publishedBy: OPERATOR,
        },
        {
          id: 'tpl-erpnext-15-v2',
          version: 2,
          state: 'published',
          schemaVersion: '2026-09-A',
          entries: erpnextEntries(STORY_ENTRIES.slice(0, 40)).map((e, ordinal) => ({
            ...e,
            ordinal,
          })),
          note: 'Return-against terms; tax_id as buyer VATIN.',
          savedAt: at(4, 14, 0),
          savedBy: 'Hamed Al Kindi',
          publishedAt: at(3, 9, 45),
          publishedBy: OPERATOR,
        },
      ],
    },
  ]

  const addons: TenantAddon[] = [
    {
      tenantId: 'al-bahja',
      state: 'ACTIVE',
      source: 'PURCHASED',
      since: at(34),
      limits,
      collectedThisMonth: 412,
      grants: [],
    },
    {
      tenantId: 'bahwan-group',
      state: 'ACTIVE',
      source: 'PLAN_INCLUDED',
      since: at(90),
      limits: { connections: 10, documentsPerMonth: 5000 },
      collectedThisMonth: 1_840,
      grants: [],
    },
    {
      tenantId: 'muscat-grand',
      state: 'ACTIVE',
      source: 'PURCHASED',
      since: at(21),
      limits,
      collectedThisMonth: 233,
      grants: [],
    },
    {
      tenantId: 'sohar-steel',
      state: 'ACTIVE',
      source: 'PURCHASED',
      since: at(48),
      limits,
      collectedThisMonth: 964,
      grants: [
        {
          id: 'grant-1',
          documents: 300,
          expires: at(-27),
          reason: 'Backlog after their ERP migration',
          by: OPERATOR,
          at: at(2, 9, 10),
        },
      ],
    },
    {
      tenantId: 'duqm-logistics',
      state: 'ACTIVE',
      source: 'PURCHASED',
      since: at(12),
      limits,
      collectedThisMonth: 58,
      grants: [],
    },
    {
      tenantId: 'nizwa-wholesale',
      state: 'ACTIVE',
      source: 'PURCHASED',
      since: at(40),
      limits,
      collectedThisMonth: 0,
      grants: [],
    },
    {
      tenantId: 'seeb-pharmacy',
      state: 'ACTIVE',
      source: 'PURCHASED',
      since: at(55),
      limits,
      collectedThisMonth: 121,
      grants: [],
    },
    {
      tenantId: 'qurum-dental',
      state: 'ACTIVE',
      source: 'TRIAL',
      since: at(5),
      trialEndsAt: at(-9),
      limits: { connections: 1, documentsPerMonth: 200 },
      collectedThisMonth: 14,
      grants: [],
    },
    {
      tenantId: 'rustaq-motors',
      state: 'PENDING_PAYMENT',
      source: 'PURCHASED',
      limits,
      collectedThisMonth: 0,
      grants: [],
    },
    {
      tenantId: 'khasab-ferry',
      state: 'SUSPENDED',
      source: 'PURCHASED',
      since: at(70),
      limits,
      collectedThisMonth: 0,
      grants: [],
      suspendedReason: 'Subscription suspended, bill unpaid',
    },
  ]

  const connections: PlatformConnection[] = [
    {
      id: 'cx-odoo-ho',
      tenantId: 'al-bahja',
      label: 'Head office, Odoo 17',
      product: 'ODOO',
      erpVersion: '17.0+e',
      state: 'CONNECTED',
      mappingStatus: 'CERTIFIED',
      templateVersionId: 'tpl-odoo-17-v3',
      scheduleMinutes: 30,
      writeBackEnabled: true,
      lastRunAt: minutesAgo(26),
      nextRunAt: inMinutes(4),
      watermarkAt: minutesAgo(50),
      collectedThisMonth: 318,
      rejections: 2,
      consecutiveFailures: 0,
      createdAt: at(32, 9, 58),
      recentRuns: [
        run(minutesAgo(26), 'SUCCEEDED', 6),
        run(minutesAgo(56), 'SUCCEEDED', 3),
        run(minutesAgo(86), 'SUCCEEDED', 0),
        run(minutesAgo(116), 'PARTIAL', 4, 4, 2),
        run(minutesAgo(146), 'SUCCEEDED', 2, 1),
      ],
    },
    {
      id: 'cx-erpnext-salalah',
      tenantId: 'al-bahja',
      label: 'Salalah branch, ERPNext',
      product: 'ERPNEXT',
      erpVersion: '15.28',
      state: 'ERROR',
      errorKey: 'credentials',
      mappingStatus: 'DRAFT',
      templateVersionId: 'tpl-erpnext-15-v2',
      scheduleMinutes: 60,
      writeBackEnabled: false,
      lastRunAt: minutesAgo(26),
      watermarkAt: at(2, 15, 48),
      collectedThisMonth: 71,
      rejections: 0,
      consecutiveFailures: 3,
      createdAt: at(15, 10, 50),
      recentRuns: [
        run(minutesAgo(26), 'FAILED', 0, 0, 1),
        run(minutesAgo(86), 'FAILED', 0, 0, 1),
        run(minutesAgo(146), 'FAILED', 0, 0, 1),
        run(at(2, 16, 0), 'SUCCEEDED', 3),
        run(at(3, 11, 0), 'SUCCEEDED', 5),
      ],
    },
    {
      id: 'cx-odoo-sohar',
      tenantId: 'al-bahja',
      label: 'Sohar warehouse, Odoo 16',
      product: 'ODOO',
      erpVersion: '16.0',
      state: 'PAUSED',
      mappingStatus: 'READY',
      templateVersionId: 'tpl-odoo-16-v1',
      scheduleMinutes: 240,
      writeBackEnabled: false,
      lastRunAt: at(12, 8, 0),
      watermarkAt: at(12, 7, 52),
      collectedThisMonth: 23,
      rejections: 0,
      consecutiveFailures: 0,
      createdAt: at(23, 14, 5),
      recentRuns: [run(at(12, 8, 0), 'SUCCEEDED', 2), run(at(13, 15, 10), 'SUCCEEDED', 3)],
    },
    {
      id: 'cx-bahwan-sap-bridge',
      tenantId: 'bahwan-group',
      label: 'Group finance, ERPNext bridge',
      product: 'ERPNEXT',
      erpVersion: '15.31',
      state: 'CONNECTED',
      mappingStatus: 'CERTIFIED',
      scheduleMinutes: 15,
      writeBackEnabled: true,
      lastRunAt: minutesAgo(11),
      nextRunAt: inMinutes(4),
      watermarkAt: minutesAgo(14),
      collectedThisMonth: 1_402,
      rejections: 0,
      consecutiveFailures: 0,
      createdAt: at(88, 9, 0),
      recentRuns: healthyRuns(15, 5, [9, 12, 7, 11, 8]),
    },
    {
      id: 'cx-bahwan-retail',
      tenantId: 'bahwan-group',
      label: 'Retail arm, Odoo 17',
      product: 'ODOO',
      erpVersion: '17.0',
      state: 'CONNECTED',
      mappingStatus: 'CERTIFIED',
      templateVersionId: 'tpl-odoo-17-v2',
      scheduleMinutes: 30,
      writeBackEnabled: true,
      lastRunAt: minutesAgo(21),
      nextRunAt: inMinutes(9),
      watermarkAt: minutesAgo(33),
      collectedThisMonth: 438,
      rejections: 1,
      consecutiveFailures: 0,
      createdAt: at(61, 13, 20),
      recentRuns: healthyRuns(30, 5, [3, 5, 2, 4, 6]),
    },
    {
      id: 'cx-muscat-grand',
      tenantId: 'muscat-grand',
      label: 'Front office, Odoo 17',
      product: 'ODOO',
      erpVersion: '17.0',
      state: 'CONNECTED',
      mappingStatus: 'CERTIFIED',
      templateVersionId: 'tpl-odoo-17-v3',
      scheduleMinutes: 60,
      writeBackEnabled: false,
      lastRunAt: minutesAgo(41),
      nextRunAt: inMinutes(19),
      watermarkAt: minutesAgo(95),
      collectedThisMonth: 233,
      rejections: 3,
      consecutiveFailures: 0,
      createdAt: at(20, 11, 30),
      recentRuns: [
        run(minutesAgo(41), 'PARTIAL', 5, 5, 3),
        ...healthyRuns(60, 4, [2, 4, 1, 3]).map((r) => ({
          ...r,
          at: new Date(r.at.getTime() - 60 * MINUTE),
        })),
      ],
    },
    {
      id: 'cx-sohar-steel',
      tenantId: 'sohar-steel',
      label: 'Plant ERP, ERPNext',
      product: 'ERPNEXT',
      erpVersion: '15.29',
      state: 'CONNECTED',
      mappingStatus: 'CERTIFIED',
      templateVersionId: 'tpl-erpnext-15-v1',
      scheduleMinutes: 30,
      writeBackEnabled: true,
      lastRunAt: minutesAgo(16),
      nextRunAt: inMinutes(14),
      watermarkAt: minutesAgo(22),
      collectedThisMonth: 964,
      rejections: 0,
      consecutiveFailures: 0,
      createdAt: at(46, 10, 0),
      recentRuns: healthyRuns(30, 5, [14, 9, 11, 8, 12]),
    },
    {
      id: 'cx-duqm',
      tenantId: 'duqm-logistics',
      label: 'Duqm yard, ERPNext',
      product: 'ERPNEXT',
      erpVersion: '15.30',
      state: 'ERROR',
      errorKey: 'unreachable',
      mappingStatus: 'CERTIFIED',
      templateVersionId: 'tpl-erpnext-15-v2',
      scheduleMinutes: 60,
      writeBackEnabled: false,
      lastRunAt: minutesAgo(38),
      watermarkAt: at(1, 9, 12),
      collectedThisMonth: 58,
      rejections: 0,
      consecutiveFailures: 4,
      createdAt: at(11, 15, 45),
      recentRuns: [
        run(minutesAgo(38), 'FAILED', 0, 0, 1),
        run(minutesAgo(98), 'FAILED', 0, 0, 1),
        run(minutesAgo(158), 'FAILED', 0, 0, 1),
        run(minutesAgo(218), 'FAILED', 0, 0, 1),
        run(at(1, 9, 20), 'SUCCEEDED', 6),
      ],
    },
    {
      id: 'cx-nizwa',
      tenantId: 'nizwa-wholesale',
      label: 'Warehouse, Odoo 17',
      product: 'ODOO',
      erpVersion: '17.0',
      state: 'PAUSED',
      mappingStatus: 'READY',
      templateVersionId: 'tpl-odoo-17-v3',
      scheduleMinutes: 240,
      writeBackEnabled: false,
      lastRunAt: at(6, 8, 0),
      watermarkAt: at(6, 7, 40),
      collectedThisMonth: 0,
      rejections: 0,
      consecutiveFailures: 0,
      createdAt: at(38, 9, 15),
      recentRuns: [run(at(6, 8, 0), 'SUCCEEDED', 0), run(at(6, 4, 0), 'SUCCEEDED', 1)],
    },
    {
      id: 'cx-seeb',
      tenantId: 'seeb-pharmacy',
      label: 'Pharmacy ERP, Odoo 16',
      product: 'ODOO',
      erpVersion: '16.0',
      state: 'CONNECTED',
      mappingStatus: 'CERTIFIED',
      templateVersionId: 'tpl-odoo-16-v1',
      scheduleMinutes: 1440,
      writeBackEnabled: true,
      lastRunAt: at(0, 6, 0),
      nextRunAt: at(-1, 6, 0),
      watermarkAt: at(14, 18, 30),
      collectedThisMonth: 121,
      rejections: 0,
      consecutiveFailures: 0,
      createdAt: at(52, 12, 0),
      recentRuns: [
        run(at(0, 6, 0), 'SUCCEEDED', 0),
        run(at(1, 6, 0), 'SUCCEEDED', 0),
        run(at(2, 6, 0), 'SUCCEEDED', 0),
        run(at(3, 6, 0), 'SUCCEEDED', 0),
        run(at(4, 6, 0), 'SUCCEEDED', 0),
      ],
    },
    {
      id: 'cx-qurum',
      tenantId: 'qurum-dental',
      label: 'Clinic, Odoo 17',
      product: 'ODOO',
      erpVersion: '17.0',
      state: 'CONNECTED',
      mappingStatus: 'READY',
      templateVersionId: 'tpl-odoo-17-v3',
      scheduleMinutes: 60,
      writeBackEnabled: false,
      lastRunAt: minutesAgo(52),
      nextRunAt: inMinutes(8),
      watermarkAt: at(5, 10, 0),
      collectedThisMonth: 14,
      rejections: 0,
      consecutiveFailures: 0,
      createdAt: at(5, 9, 40),
      recentRuns: [
        run(minutesAgo(52), 'SKIPPED_QUOTA', 0),
        run(minutesAgo(112), 'SKIPPED_QUOTA', 0),
      ],
    },
    {
      id: 'cx-khasab',
      tenantId: 'khasab-ferry',
      label: 'Ticketing, ERPNext',
      product: 'ERPNEXT',
      erpVersion: '15.22',
      state: 'PAUSED',
      mappingStatus: 'CERTIFIED',
      templateVersionId: 'tpl-erpnext-15-v1',
      scheduleMinutes: 60,
      writeBackEnabled: false,
      lastRunAt: at(9, 13, 0),
      watermarkAt: at(9, 12, 40),
      collectedThisMonth: 0,
      rejections: 0,
      consecutiveFailures: 0,
      createdAt: at(68, 11, 0),
      recentRuns: [run(at(9, 13, 0), 'SUCCEEDED', 2)],
    },
  ]

  const requests: AddonRequest[] = [
    {
      id: 'req-1',
      tenantId: 'amerat-bakery',
      requestedAt: minutesAgo(140),
      requestedBy: 'Owner',
      plan: 'business',
      source: 'PURCHASED',
      status: 'pending',
    },
    {
      id: 'req-2',
      tenantId: 'salalah-tours',
      requestedAt: at(1, 16, 22),
      requestedBy: 'Owner',
      plan: 'businessPlus',
      source: 'PURCHASED',
      status: 'pending',
    },
    {
      id: 'req-3',
      tenantId: 'oman-marine',
      requestedAt: at(2, 9, 5),
      requestedBy: 'Finance manager',
      plan: 'business',
      source: 'TRIAL',
      status: 'pending',
    },
    {
      id: 'req-4',
      tenantId: 'rustaq-motors',
      requestedAt: at(3, 11, 0),
      requestedBy: 'Owner',
      plan: 'starter',
      source: 'PURCHASED',
      status: 'approved',
      decidedAt: at(3, 11, 40),
      decidedBy: OPERATOR,
      note: 'Activates once the add-on line is paid.',
    },
    {
      id: 'req-5',
      tenantId: 'qurum-dental',
      requestedAt: at(5, 9, 0),
      requestedBy: 'Owner',
      plan: 'starter',
      source: 'TRIAL',
      status: 'approved',
      decidedAt: at(5, 9, 30),
      decidedBy: 'Maryam Al Balushi',
      note: '14-day trial, 200 documents.',
    },
    {
      id: 'req-6',
      tenantId: 'duqm-logistics',
      requestedAt: at(12, 14, 0),
      requestedBy: 'Owner',
      plan: 'business',
      source: 'PURCHASED',
      status: 'approved',
      decidedAt: at(12, 15, 10),
      decidedBy: OPERATOR,
    },
    {
      id: 'req-7',
      tenantId: 'bidbid-cafe',
      requestedAt: at(8, 10, 0),
      requestedBy: 'Owner',
      plan: 'starter',
      source: 'PURCHASED',
      status: 'declined',
      decidedAt: at(8, 10, 25),
      decidedBy: 'Hamed Al Kindi',
      note: 'Subscription is in grace, settle the open bill first.',
    },
    {
      id: 'req-8',
      tenantId: 'muscat-grand',
      requestedAt: at(21, 12, 0),
      requestedBy: 'Owner',
      plan: 'businessPlus',
      source: 'PURCHASED',
      status: 'approved',
      decidedAt: at(21, 12, 30),
      decidedBy: OPERATOR,
    },
  ]

  const events: ErpEvent[] = [
    {
      id: nextId('ev'),
      at: at(1, 17, 5),
      by: 'Hamed Al Kindi',
      actionKey: 'templateDraftSaved',
      values: { template: 'Odoo 17', version: 4 },
    },
    {
      id: nextId('ev'),
      at: at(2, 9, 10),
      by: OPERATOR,
      actionKey: 'quotaGranted',
      tenantId: 'sohar-steel',
      values: { documents: 300 },
    },
    {
      id: nextId('ev'),
      at: at(3, 9, 45),
      by: OPERATOR,
      actionKey: 'templatePublished',
      values: { template: 'ERPNext 15', version: 2 },
    },
    {
      id: nextId('ev'),
      at: at(3, 11, 40),
      by: OPERATOR,
      actionKey: 'requestApproved',
      tenantId: 'rustaq-motors',
    },
    {
      id: nextId('ev'),
      at: at(5, 9, 30),
      by: 'Maryam Al Balushi',
      actionKey: 'requestApprovedTrial',
      tenantId: 'qurum-dental',
      values: { days: 14 },
    },
    {
      id: nextId('ev'),
      at: at(7, 9, 15),
      by: OPERATOR,
      actionKey: 'templatePublished',
      values: { template: 'Odoo 17', version: 3 },
    },
    {
      id: nextId('ev'),
      at: at(7, 12, 0),
      by: OPERATOR,
      actionKey: 'templatePublished',
      values: { template: 'Odoo 16', version: 1 },
    },
    {
      id: nextId('ev'),
      at: at(8, 10, 25),
      by: 'Hamed Al Kindi',
      actionKey: 'requestDeclined',
      tenantId: 'bidbid-cafe',
    },
    {
      id: nextId('ev'),
      at: at(9, 13, 30),
      by: 'Scheduler',
      actionKey: 'addonSuspended',
      tenantId: 'khasab-ferry',
    },
    {
      id: nextId('ev'),
      at: at(12, 15, 10),
      by: OPERATOR,
      actionKey: 'requestApproved',
      tenantId: 'duqm-logistics',
    },
  ]

  return { connections, addons, requests, templates, events }
}

/* ------------------------------------------------------------------ store */

let state: ConsoleErpState = initialState()
const listeners = new Set<() => void>()
function set(next: ConsoleErpState) {
  state = next
  listeners.forEach((l) => l())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const logged = (
  s: ConsoleErpState,
  actionKey: string,
  tenantId?: string,
  values?: Record<string, string | number>,
  by: string = OPERATOR,
): ConsoleErpState => ({
  ...s,
  events: [{ id: nextId('ev'), at: new Date(), by, actionKey, tenantId, values }, ...s.events],
})

const addonConfig = DEFAULT_SETTINGS.addons.erpExtraction

export const consoleErpStore = {
  /** Approve: plan-included and purchased start now (the add-on line joins the next invoice). */
  approveRequest(id: string, note?: string) {
    const request = state.requests.find((r) => r.id === id)
    if (!request || request.status !== 'pending') return
    const now = new Date()
    const source: AddonSource = request.plan === 'enterprise' ? 'PLAN_INCLUDED' : 'PURCHASED'
    const addon: TenantAddon = {
      tenantId: request.tenantId,
      state: 'ACTIVE',
      source,
      since: now,
      limits: { connections: 5, documentsPerMonth: addonConfig.documents },
      collectedThisMonth: 0,
      grants: [],
    }
    set(
      logged(
        {
          ...state,
          requests: state.requests.map((r) =>
            r.id === id
              ? { ...r, status: 'approved', decidedAt: now, decidedBy: OPERATOR, note }
              : r,
          ),
          addons: [...state.addons.filter((a) => a.tenantId !== request.tenantId), addon],
        },
        'requestApproved',
        request.tenantId,
      ),
    )
  },

  approveRequestOnTrial(id: string, days: number, documents: number, note?: string) {
    const request = state.requests.find((r) => r.id === id)
    if (!request || request.status !== 'pending') return
    const now = new Date()
    const addon: TenantAddon = {
      tenantId: request.tenantId,
      state: 'ACTIVE',
      source: 'TRIAL',
      since: now,
      trialEndsAt: new Date(now.getTime() + days * DAY),
      limits: { connections: 1, documentsPerMonth: documents },
      collectedThisMonth: 0,
      grants: [],
    }
    set(
      logged(
        {
          ...state,
          requests: state.requests.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: 'approved',
                  source: 'TRIAL',
                  decidedAt: now,
                  decidedBy: OPERATOR,
                  note,
                }
              : r,
          ),
          addons: [...state.addons.filter((a) => a.tenantId !== request.tenantId), addon],
        },
        'requestApprovedTrial',
        request.tenantId,
        { days },
      ),
    )
  },

  declineRequest(id: string, reason: string) {
    const request = state.requests.find((r) => r.id === id)
    if (!request || request.status !== 'pending') return
    set(
      logged(
        {
          ...state,
          requests: state.requests.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: 'declined',
                  decidedAt: new Date(),
                  decidedBy: OPERATOR,
                  note: reason,
                }
              : r,
          ),
        },
        'requestDeclined',
        request.tenantId,
      ),
    )
  },

  grantQuota(tenantId: string, documents: number, expires: Date, reason: string) {
    set(
      logged(
        {
          ...state,
          addons: state.addons.map((a) =>
            a.tenantId === tenantId
              ? {
                  ...a,
                  grants: [
                    {
                      id: nextId('grant'),
                      documents,
                      expires,
                      reason,
                      by: OPERATOR,
                      at: new Date(),
                    },
                    ...a.grants,
                  ],
                }
              : a,
          ),
        },
        'quotaGranted',
        tenantId,
        { documents },
      ),
    )
  },

  suspendAddon(tenantId: string, reason: string) {
    set(
      logged(
        {
          ...state,
          addons: state.addons.map((a) =>
            a.tenantId === tenantId ? { ...a, state: 'SUSPENDED', suspendedReason: reason } : a,
          ),
        },
        'addonSuspended',
        tenantId,
      ),
    )
  },

  resumeAddon(tenantId: string) {
    set(
      logged(
        {
          ...state,
          addons: state.addons.map((a) =>
            a.tenantId === tenantId ? { ...a, state: 'ACTIVE', suspendedReason: undefined } : a,
          ),
        },
        'addonResumed',
        tenantId,
      ),
    )
  },

  /** Save the template's draft (creating one when none exists). Returns the draft's id. */
  saveTemplateDraft(templateId: string, entries: Entry[], note: string): string | undefined {
    const template = state.templates.find((t) => t.id === templateId)
    if (!template) return undefined
    const now = new Date()
    const draft = template.versions.find((v) => v.state === 'draft')
    const next: TemplateVersion = draft
      ? { ...draft, entries, note, savedAt: now, savedBy: OPERATOR }
      : {
          id: nextId(`${templateId}-v`),
          version: Math.max(...template.versions.map((v) => v.version)) + 1,
          state: 'draft',
          schemaVersion: '2026-09-A',
          entries,
          note,
          savedAt: now,
          savedBy: OPERATOR,
        }
    set(
      logged(
        {
          ...state,
          templates: state.templates.map((t) =>
            t.id === templateId
              ? {
                  ...t,
                  versions: draft
                    ? t.versions.map((v) => (v.id === draft.id ? next : v))
                    : [...t.versions, next],
                }
              : t,
          ),
        },
        'templateDraftSaved',
        undefined,
        { template: template.name, version: next.version },
      ),
    )
    return next.id
  },

  /** Publish the draft: it becomes the published version, the previous one retires. */
  publishTemplate(templateId: string) {
    const template = state.templates.find((t) => t.id === templateId)
    const draft = template?.versions.find((v) => v.state === 'draft')
    if (!template || !draft) return
    const now = new Date()
    set(
      logged(
        {
          ...state,
          templates: state.templates.map((t) =>
            t.id === templateId
              ? {
                  ...t,
                  versions: t.versions.map((v) =>
                    v.id === draft.id
                      ? { ...v, state: 'published', publishedAt: now, publishedBy: OPERATOR }
                      : v.state === 'published'
                        ? { ...v, state: 'retired' }
                        : v,
                  ),
                }
              : t,
          ),
        },
        'templatePublished',
        undefined,
        { template: template.name, version: draft.version },
      ),
    )
  },

  discardTemplateDraft(templateId: string) {
    const template = state.templates.find((t) => t.id === templateId)
    const draft = template?.versions.find((v) => v.state === 'draft')
    if (!template || !draft) return
    set(
      logged(
        {
          ...state,
          templates: state.templates.map((t) =>
            t.id === templateId
              ? { ...t, versions: t.versions.filter((v) => v.id !== draft.id) }
              : t,
          ),
        },
        'templateDraftDiscarded',
        undefined,
        { template: template.name, version: draft.version },
      ),
    )
  },

  restoreStory() {
    set(initialState())
  },
}

export function useConsoleErp() {
  return useSyncExternalStore(subscribe, () => state)
}
export const getConsoleErpState = () => state

/* ---------------------------------------------------------------- readers */

export const STALE_DAYS = 10
export const tenantName = (id: string) => {
  try {
    return tenantIdentity(id).name
  } catch {
    return id
  }
}

export const connectionsFor = (s: ConsoleErpState, tenantId: string) =>
  s.connections.filter((c) => c.tenantId === tenantId)
export const connectionById = (s: ConsoleErpState, id: string | undefined) =>
  id ? s.connections.find((c) => c.id === id) : undefined
export const addonFor = (s: ConsoleErpState, tenantId: string) =>
  s.addons.find((a) => a.tenantId === tenantId)
export const templateById = (s: ConsoleErpState, id: string | undefined) =>
  id ? s.templates.find((t) => t.id === id) : undefined
export const publishedVersion = (t: MappingTemplate) =>
  t.versions.find((v) => v.state === 'published')
export const draftVersion = (t: MappingTemplate) => t.versions.find((v) => v.state === 'draft')
export const versionById = (s: ConsoleErpState, id: string | undefined) => {
  for (const t of s.templates) {
    const v = t.versions.find((x) => x.id === id)
    if (v) return { template: t, version: v }
  }
  return undefined
}
export const connectionsOnVersion = (s: ConsoleErpState, versionId: string) =>
  s.connections.filter((c) => c.templateVersionId === versionId)
export const connectionsOnTemplate = (s: ConsoleErpState, templateId: string) =>
  s.connections.filter((c) => c.templateVersionId?.startsWith(`${templateId}-v`))

export const watermarkAgeDays = (c: PlatformConnection, now = NOW) =>
  c.watermarkAt ? Math.floor((now.getTime() - c.watermarkAt.getTime()) / DAY) : null
export const isStale = (c: PlatformConnection, now = NOW) =>
  c.state === 'CONNECTED' && (watermarkAgeDays(c, now) ?? 0) >= STALE_DAYS
export const needsAttention = (c: PlatformConnection) => c.state === 'ERROR' || isStale(c)
export const connectionsNeedingAttention = (s: ConsoleErpState) =>
  s.connections.filter(needsAttention)
export const pendingRequests = (s: ConsoleErpState) =>
  s.requests.filter((r) => r.status === 'pending')

/** The platform-wide figures on the ERP overview and the Operations card. */
export function platformErpKpis(s: ConsoleErpState) {
  const active = s.addons.filter((a) => a.state === 'ACTIVE')
  const live = s.connections.filter((c) => c.state !== 'DISCONNECTED')
  return {
    tenantsOnAddon: active.length,
    tenantsPaying: active.filter((a) => a.source === 'PURCHASED').length,
    connections: live.length,
    inError: live.filter((c) => c.state === 'ERROR').length,
    stale: live.filter((c) => isStale(c)).length,
    paused: live.filter((c) => c.state === 'PAUSED').length,
    collectedThisMonth: active.reduce((sum, a) => sum + a.collectedThisMonth, 0),
    rejections: live.reduce((sum, c) => sum + c.rejections, 0),
    /** Rial a month from purchased add-ons, before overage. */
    monthlyRevenue: active.filter((a) => a.source === 'PURCHASED').length * addonConfig.monthly,
    pendingRequests: pendingRequests(s).length,
  }
}

/** Allowance for the month including grants still valid. */
export const allowanceOf = (a: TenantAddon, now = NOW) =>
  a.limits.documentsPerMonth +
  a.grants
    .filter((g) => g.expires.getTime() > now.getTime())
    .reduce((sum, g) => sum + g.documents, 0)
