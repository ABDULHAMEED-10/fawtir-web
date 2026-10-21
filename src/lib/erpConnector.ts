import { useSyncExternalStore } from 'react'
import { COMPANY, TODAY } from './settings'
import { DEFAULT_SETTINGS } from './platformSettings'
import { overviewStatus, type MappingState, type OverviewStatus } from './erpMapping'

/**
 * A tenant's ERP connections, as Settings › Integration › Connected systems sees them
 * (docs/erp-and-console-plan.md §3 and Appendix B; ERP_CONNECTOR_SPEC-2026-09-11).
 *
 * The connector is the add-on that collects invoices *from* the ERP on a schedule, runs them
 * through the tenant's field mapping, submits them, and writes the outcome back into the ERP
 * record. The backend owns all of it — credentials, the scheduler, the outbox. This module stands
 * in with the same shapes and states so the screens are drawn against what will actually run.
 *
 * Al Bahja's story, Saturday 26 September 2026, 14:26: the add-on was bought on 1 August; three
 * systems are connected of five allowed. Head office runs Odoo 17 every half hour with write-back
 * and is healthy. The Salalah branch's ERPNext key was revoked on the 24th — three failed runs in
 * a row put the connection in ERROR. The Sohar warehouse's Odoo 16 was paused on the 15th for
 * stock-take and its watermark is now twelve days old.
 */

/* ------------------------------------------------------------------ enums */

export type Product =
  'ODOO' | 'ERPNEXT' | 'DYNAMICS_365' | 'SAP_S4' | 'ORACLE_FUSION' | 'ZOHO_BOOKS'
export const PRODUCTS: Product[] = [
  'ODOO',
  'ERPNEXT',
  'DYNAMICS_365',
  'SAP_S4',
  'ORACLE_FUSION',
  'ZOHO_BOOKS',
]
/** Adapters that ship today; the rest are tiles that say "coming". */
export const AVAILABLE_PRODUCTS: Product[] = ['ODOO', 'ERPNEXT']

export type AuthKind = 'API_KEY' | 'BASIC' | 'OAUTH2_CLIENT' | 'OAUTH2_AUTHCODE'
/** Which ways in each product accepts, first one preferred. */
export const AUTH_KINDS: Record<Product, AuthKind[]> = {
  ODOO: ['API_KEY', 'BASIC'],
  ERPNEXT: ['API_KEY', 'BASIC'],
  DYNAMICS_365: ['OAUTH2_CLIENT'],
  SAP_S4: ['BASIC', 'OAUTH2_CLIENT'],
  ORACLE_FUSION: ['BASIC'],
  ZOHO_BOOKS: ['OAUTH2_AUTHCODE'],
}
/** The secret fields each kind asks for. Secrets are write-only: the backend never echoes them. */
export const CREDENTIAL_FIELDS: Record<AuthKind, string[]> = {
  API_KEY: ['apiKey'],
  BASIC: ['username', 'password'],
  OAUTH2_CLIENT: ['tenantId', 'clientId', 'clientSecret'],
  OAUTH2_AUTHCODE: ['clientId', 'clientSecret'],
}
/** Non-secret fields a product needs on top — Odoo's database and login, ERPNext's key secret. */
export const PRODUCT_FIELDS: Partial<Record<Product, string[]>> = {
  ODOO: ['database', 'username'],
  ERPNEXT: ['apiSecret'],
}

export type Scope = 'READ' | 'WRITE'
export const SCHEDULES = [15, 30, 60, 240, 1440] as const
export type ScheduleMinutes = (typeof SCHEDULES)[number]

export type ConnectionState = 'DRAFT' | 'CONNECTED' | 'PAUSED' | 'ERROR' | 'DISCONNECTED'
export type MappingStatus = 'UNMAPPED' | 'DRAFT' | 'READY' | 'CERTIFIED' | 'STALE'
export type RunTrigger = 'SCHEDULE' | 'MANUAL' | 'RETRY'
export type RunState =
  'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'SKIPPED_QUOTA' | 'SKIPPED_LEASE'
export type RecordState =
  | 'COLLECTED'
  | 'MAPPED'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WRITTEN_BACK'
  | 'WRITEBACK_FAILED'
  | 'SUPERSEDED'
export const RECORD_STATES: RecordState[] = [
  'COLLECTED',
  'MAPPED',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
  'WRITTEN_BACK',
  'WRITEBACK_FAILED',
  'SUPERSEDED',
]
export type OutboxState = 'PENDING' | 'SENT' | 'FAILED' | 'ABANDONED'
export type AddonState = 'INACTIVE' | 'PENDING_PAYMENT' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'
export type AddonSource = 'PLAN_INCLUDED' | 'PURCHASED' | 'TRIAL'

/** Once a connection's watermark is this old the overview warns — nothing new has come in. */
export const STALE_WATERMARK_DAYS = 10
/** Three failed runs in a row and the connection goes to ERROR. */
export const FAILURES_TO_ERROR = 3
/** The write-back outbox gives up after this many attempts. */
export const WRITEBACK_MAX_ATTEMPTS = 5

/* ----------------------------------------------------------------- shapes */

export type Addon = {
  state: AddonState
  source: AddonSource
  since?: Date
  limits: { connections: number; documentsPerMonth: number }
  /** Documents collected since the period started. Connections are counted from the list. */
  collectedThisMonth: number
  periodStartedOn: Date
  resetsOn: Date
  /** Rial a month, the allowance and the per-document overage — from the console's config. */
  price: { monthly: number; documents: number; overage: number }
}

export type TestResult = {
  at: Date
  ok: boolean
  erpVersion?: string
  company?: string
  grantedScopes?: Scope[]
  latencyMs?: number
  /** Why it failed, when it did. */
  errorCode?: 'UNAUTHORIZED' | 'UNREACHABLE' | 'TLS' | 'FORBIDDEN_SCOPE' | 'TIMEOUT'
}

export type Template = {
  product: Product
  /** The ERP's schema the template was written against. */
  erpVersion: string
  /** Fawtir's mapping schema version. */
  schemaVersion: string
  entryCount: number
  publishedOn: Date
}

export type DiscoverResult = {
  at: Date
  /** Source paths seen on the sample invoices. */
  fields: string[]
  samples: number
  templateApplied?: Template
}

export type ConnectionEvent = {
  id: string
  at: Date
  by: string
  actionKey: string
  values?: Record<string, string | number>
}

export type Connection = {
  id: string
  label: string
  product: Product
  erpVersion?: string
  baseUrl: string
  authKind: AuthKind
  /** What the screens may show of the credential: the login or key tail, never the secret. */
  credentialHint: string
  /** Odoo's database name, when the product has one. */
  database?: string
  scopes: Scope[]
  scheduleMinutes: ScheduleMinutes
  writeBackEnabled: boolean
  state: ConnectionState
  /** The reason the state is ERROR, when it is. */
  errorKey?: 'credentials' | 'unreachable' | 'threeFailures'
  consecutiveFailures: number
  mapping: {
    /** The Odoo head office runs the tenant's own certified mapping (`erpMapping.ts`). */
    usesTenantMapping?: boolean
    status: MappingStatus
    origin: 'TEMPLATE' | 'EDIT' | 'NONE'
    template?: Template & { appliedAt: Date }
    entryCount: number
    certifiedRoutes: number
    lastEditedAt?: Date
  }
  /** The newest ERP invoice collected so far — the point the next run starts from. */
  watermark?: { erpNumber: string; issuedAt: Date }
  lastRunAt?: Date
  nextRunAt?: Date
  createdAt: Date
  createdBy: string
  pausedAt?: Date
  /** Why it was paused, when the operator said. */
  pauseReason?: string
  lastTest?: TestResult
  discovery?: DiscoverResult
  events: ConnectionEvent[]
}

export type RunError = { code: string; count: number }

export type Run = {
  id: string
  connectionId: string
  trigger: RunTrigger
  state: RunState
  startedAt: Date
  finishedAt?: Date
  fetched: number
  created: number
  duplicates: number
  errors: number
  watermarkBefore?: string
  watermarkAfter?: string
  errorSummary: RunError[]
  /** Why a run was skipped, when it was. */
  skipReason?: string
}

export type Finding = { rule: string; path: string; message: string }

export type WriteBack = {
  state: OutboxState
  attempts: number
  lastAttemptAt?: Date
  nextAttemptAt?: Date
  lastError?: string
  /** The fields the connector writes into the ERP record. */
  fields: {
    fawtirStatus: string
    invoiceNumber?: string
    uuid?: string
    submittedAt?: Date
    rejectionReason?: string
    qr?: boolean
  }
}

export type ErpRecord = {
  id: string
  connectionId: string
  runId: string
  erpNumber: string
  erpId: string
  state: RecordState
  collectedAt: Date
  updatedAt: Date
  customer: string
  total: number
  fawtirInvoiceNo?: string
  fawtirInvoiceId?: string
  fawtirUuid?: string
  rejection?: Finding[]
  /** SUPERSEDED — the ERP record changed after it was submitted. */
  supersededBy?: { changedAt: Date; note: string }
  writeBack?: WriteBack
  payload: unknown
}

export type ConnectorState = {
  addon: Addon
  connections: Connection[]
  runs: Run[]
  records: ErpRecord[]
}

/* ------------------------------------------------------------------ clock */

export const NOW = new Date(TODAY)
NOW.setHours(14, 26, 0, 0)
export const OPERATOR = COMPANY.owner.name
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** `ago(2)` is two days ago at 10:00; `ago(0, 13, 30)` is today at 13:30. */
const ago = (daysAgo: number, hour = 10, minute = 0) => {
  const d = new Date(NOW.getTime() - daysAgo * DAY)
  d.setHours(hour, minute, 0, 0)
  return d
}
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * MINUTE)
const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * MINUTE)

let idSeq = 1000
const nextId = (prefix: string) => `${prefix}-${++idSeq}`

/* -------------------------------------------------------------- templates */

export const TEMPLATES: Template[] = [
  {
    product: 'ODOO',
    erpVersion: '17',
    schemaVersion: '2026-09-A',
    entryCount: 41,
    publishedOn: new Date(2026, 8, 12),
  },
  {
    product: 'ODOO',
    erpVersion: '16',
    schemaVersion: '2026-09-A',
    entryCount: 39,
    publishedOn: new Date(2026, 8, 12),
  },
  {
    product: 'ERPNEXT',
    erpVersion: '15',
    schemaVersion: '2026-09-A',
    entryCount: 38,
    publishedOn: new Date(2026, 8, 14),
  },
]

export const templateFor = (product: Product, erpVersion?: string) =>
  TEMPLATES.find(
    (tpl) => tpl.product === product && (!erpVersion || tpl.erpVersion === erpVersion),
  ) ?? TEMPLATES.find((tpl) => tpl.product === product)

/* ------------------------------------------------------------------ story */

const HO = 'cx-odoo-ho'
const SALALAH = 'cx-erpnext-salalah'
const SOHAR = 'cx-odoo-sohar'

const event = (
  at: Date,
  actionKey: string,
  values?: Record<string, string | number>,
  by = OPERATOR,
): ConnectionEvent => ({ id: nextId('ev'), at, by, actionKey, values })

const CUSTOMERS = [
  'Muscat Pharmacy & Stores LLC',
  'Al Jazeera Trading Co.',
  'Oman Oil Marketing Company',
  'Bahwan Engineering',
  'Al Maha Ceramics',
  'Salalah Mills Co.',
  'Nizwa Hypermarket',
  'Omantel',
  'Sohar Aluminium',
  'Dhofar Beverages',
  'Al Anwar Holdings',
  'Majan Electricity',
]
const VATINS = [
  'OM1100012345',
  'OM1100077712',
  'OM1100003390',
  'OM1100055501',
  'OM1100090876',
  'OM1100061240',
]

/** An Odoo `account.move` as the connector fetches it, trimmed to what the screens show. */
function odooPayload(
  erpNumber: string,
  id: number,
  customer: string,
  total: number,
  issuedAt: Date,
  vatin?: string,
) {
  const net = Math.round((total / 1.05) * 1000) / 1000
  const tax = Math.round((total - net) * 1000) / 1000
  return {
    id,
    name: erpNumber,
    move_type: 'out_invoice',
    state: 'posted',
    invoice_date: issuedAt.toISOString().slice(0, 10),
    invoice_date_due: new Date(issuedAt.getTime() + 30 * DAY).toISOString().slice(0, 10),
    currency_id: [1, 'OMR'],
    partner_id: {
      id: 100 + (id % 37),
      name: customer,
      vat: vatin ?? false,
      street: 'Way 3011, Al Khuwair',
      city: 'Muscat',
      country_id: [166, 'Oman'],
      phone: '+968 2448 1200',
    },
    amount_untaxed: net,
    amount_tax: tax,
    amount_total: total,
    payment_reference: erpNumber,
    invoice_line_ids: [
      {
        id: id * 10 + 1,
        name: 'Arabica beans 1 kg, Dhofar roast',
        quantity: 24,
        price_unit: Math.round((net / 24) * 1000) / 1000,
        tax_ids: [[5, 'VAT 5%']],
        price_subtotal: net,
      },
    ],
    write_date: `${issuedAt.toISOString().slice(0, 10)} ${String(issuedAt.getHours()).padStart(2, '0')}:${String(issuedAt.getMinutes()).padStart(2, '0')}:12`,
  }
}

/** An ERPNext `Sales Invoice`, the same way. */
function erpnextPayload(
  erpNumber: string,
  customer: string,
  total: number,
  issuedAt: Date,
  vatin?: string,
) {
  const net = Math.round((total / 1.05) * 1000) / 1000
  return {
    name: erpNumber,
    doctype: 'Sales Invoice',
    docstatus: 1,
    posting_date: issuedAt.toISOString().slice(0, 10),
    posting_time: `${String(issuedAt.getHours()).padStart(2, '0')}:${String(issuedAt.getMinutes()).padStart(2, '0')}:00`,
    customer_name: customer,
    tax_id: vatin ?? null,
    currency: 'OMR',
    net_total: net,
    total_taxes_and_charges: Math.round((total - net) * 1000) / 1000,
    grand_total: total,
    items: [
      {
        item_code: 'BEAN-AR-1KG',
        item_name: 'Arabica beans 1 kg, Dhofar roast',
        qty: 18,
        rate: Math.round((net / 18) * 1000) / 1000,
        amount: net,
      },
    ],
    taxes: [
      { charge_type: 'On Net Total', rate: 5, tax_amount: Math.round((total - net) * 1000) / 1000 },
    ],
    modified: issuedAt.toISOString(),
  }
}

type RecordSeed = {
  id: string
  connectionId: string
  runId: string
  erpNumber: string
  erpId: string
  state: RecordState
  collectedAt: Date
  customer: string
  total: number
  vatin?: string
  fawtirNo?: number
  rejection?: Finding[]
  supersededBy?: ErpRecord['supersededBy']
  writeBack?: WriteBack
}

const written = (at: Date, invoiceNumber: string, uuid: string): WriteBack => ({
  state: 'SENT',
  attempts: 1,
  lastAttemptAt: at,
  fields: { fawtirStatus: 'ACCEPTED', invoiceNumber, uuid, submittedAt: at, qr: true },
})

function seedRecord(seed: RecordSeed): ErpRecord {
  const product: Product = seed.connectionId === SALALAH ? 'ERPNEXT' : 'ODOO'
  const issuedAt = new Date(seed.collectedAt.getTime() - 25 * MINUTE)
  const fawtirInvoiceNo = seed.fawtirNo
    ? `INV-2026-${String(seed.fawtirNo).padStart(4, '0')}`
    : undefined
  const fawtirUuid = seed.fawtirNo
    ? `9f3c1a7e-4b2d-4c8e-9${String(seed.fawtirNo).padStart(3, '0')}-0a1b2c3d4e5f`
    : undefined
  const submitted =
    seed.state === 'ACCEPTED' ||
    seed.state === 'WRITTEN_BACK' ||
    seed.state === 'WRITEBACK_FAILED' ||
    seed.state === 'SUPERSEDED'
  return {
    id: seed.id,
    connectionId: seed.connectionId,
    runId: seed.runId,
    erpNumber: seed.erpNumber,
    erpId: seed.erpId,
    state: seed.state,
    collectedAt: seed.collectedAt,
    updatedAt: plusMinutes(seed.collectedAt, seed.state === 'COLLECTED' ? 0 : 2),
    customer: seed.customer,
    total: seed.total,
    fawtirInvoiceNo: submitted ? fawtirInvoiceNo : undefined,
    fawtirInvoiceId: submitted && fawtirInvoiceNo ? fawtirInvoiceNo.toLowerCase() : undefined,
    fawtirUuid: submitted ? fawtirUuid : undefined,
    rejection: seed.rejection,
    supersededBy: seed.supersededBy,
    writeBack:
      seed.writeBack ??
      (seed.state === 'WRITTEN_BACK' && fawtirInvoiceNo && fawtirUuid
        ? written(plusMinutes(seed.collectedAt, 4), fawtirInvoiceNo, fawtirUuid)
        : undefined),
    payload:
      product === 'ERPNEXT'
        ? erpnextPayload(seed.erpNumber, seed.customer, seed.total, issuedAt, seed.vatin)
        : odooPayload(
            seed.erpNumber,
            Number(seed.erpId),
            seed.customer,
            seed.total,
            issuedAt,
            seed.vatin,
          ),
  }
}

const BUYER_VATIN_FINDING: Finding[] = [
  {
    rule: 'BR-OM-06',
    path: 'buyer.vatin',
    message: 'A standard tax invoice needs the buyer’s VATIN; the ERP partner has no VAT number.',
  },
]
const ISIC_FINDING: Finding[] = [
  {
    rule: 'BR-OM-10',
    path: 'seller.isicCode',
    message: 'The seller’s ISIC activity code is missing.',
  },
]

function initialState(): ConnectorState {
  idSeq = 1000
  const addonConfig = DEFAULT_SETTINGS.addons.erpExtraction
  const addon: Addon = {
    state: 'ACTIVE',
    source: 'PURCHASED',
    since: new Date(2026, 7, 1),
    limits: { connections: 5, documentsPerMonth: addonConfig.documents },
    collectedThisMonth: 412,
    periodStartedOn: new Date(2026, 8, 1),
    resetsOn: new Date(2026, 9, 1),
    price: {
      monthly: addonConfig.monthly,
      documents: addonConfig.documents,
      overage: addonConfig.overage,
    },
  }

  const odoo17 = templateFor('ODOO', '17')!
  const odoo16 = templateFor('ODOO', '16')!
  const erpnext15 = templateFor('ERPNEXT', '15')!

  /* ---- head office: healthy, every 30 minutes, write-back on */
  const hoRuns: Run[] = []
  let hoRecordSeeds: RecordSeed[] = []
  let fawtirNo = 1180
  let erpSeq = 380
  // Twelve scheduled runs back from 14:00 today, plus one manual at 11:47 and one lease skip.
  const slots = [
    ago(0, 14, 0),
    ago(0, 13, 30),
    ago(0, 13, 0),
    ago(0, 12, 30),
    ago(0, 12, 0),
    ago(0, 11, 30),
    ago(0, 11, 0),
    ago(0, 10, 30),
    ago(0, 10, 0),
    ago(0, 9, 30),
    ago(0, 9, 0),
    ago(0, 8, 30),
  ]
  slots.forEach((startedAt, i) => {
    const runId = `run-ho-${slots.length - i}`
    const fetched = [6, 3, 0, 4, 2, 5, 1, 3, 0, 2, 4, 3][i]
    const dup = i === 4 ? 1 : 0
    const created = fetched - dup
    const partial = i === 3
    const errors = partial ? 2 : 0
    const before = `INV/2026/09/${String(erpSeq).padStart(4, '0')}`
    for (let k = 0; k < created; k++) {
      erpSeq += 1
      const erpNumber = `INV/2026/09/${String(erpSeq).padStart(4, '0')}`
      const customer = CUSTOMERS[(erpSeq + k) % CUSTOMERS.length]
      const total = Math.round((180 + ((erpSeq * 37) % 1900) + 0.35) * 1000) / 1000
      const collectedAt = plusMinutes(startedAt, 1 + k)
      let state: RecordState = 'WRITTEN_BACK'
      let rejection: Finding[] | undefined
      let vatin: string | undefined = VATINS[erpSeq % VATINS.length]
      let no: number | undefined = ++fawtirNo
      if (partial && k < 2) {
        state = 'REJECTED'
        rejection = k === 0 ? BUYER_VATIN_FINDING : ISIC_FINDING
        vatin = k === 0 ? undefined : vatin
        no = undefined
        fawtirNo -= 1
      } else if (i === 0 && k >= 4) {
        state = k === 4 ? 'SUBMITTED' : 'MAPPED'
        no = undefined
        fawtirNo -= 1
      } else if (i === 1 && k === 0) {
        state = 'WRITEBACK_FAILED'
      } else if (i === 7 && k === 1) {
        state = 'SUPERSEDED'
      }
      hoRecordSeeds.push({
        id: `rec-${erpSeq}`,
        connectionId: HO,
        runId,
        erpNumber,
        erpId: String(4000 + erpSeq),
        state,
        collectedAt,
        customer,
        total,
        vatin,
        fawtirNo: no,
        rejection,
      })
    }
    hoRuns.push({
      id: runId,
      connectionId: HO,
      trigger: i === 5 ? 'MANUAL' : 'SCHEDULE',
      state: partial ? 'PARTIAL' : 'SUCCEEDED',
      startedAt,
      finishedAt: plusMinutes(startedAt, fetched ? 2 : 1),
      fetched,
      created,
      duplicates: dup,
      errors,
      watermarkBefore: before,
      watermarkAfter: `INV/2026/09/${String(erpSeq).padStart(4, '0')}`,
      errorSummary: partial
        ? [
            { code: 'BR-OM-06', count: 1 },
            { code: 'BR-OM-10', count: 1 },
          ]
        : [],
    })
  })
  // A lease skip at 11:47 — the manual run overlapped the schedule.
  hoRuns.splice(6, 0, {
    id: 'run-ho-skip',
    connectionId: HO,
    trigger: 'SCHEDULE',
    state: 'SKIPPED_LEASE',
    startedAt: ago(0, 11, 47),
    finishedAt: ago(0, 11, 47),
    fetched: 0,
    created: 0,
    duplicates: 0,
    errors: 0,
    errorSummary: [],
    skipReason: 'run-ho-7',
  })
  // Special-case detail on the seeds that carry a story.
  hoRecordSeeds = hoRecordSeeds.map((seed) => {
    if (seed.state === 'WRITEBACK_FAILED') {
      const no = `INV-2026-${String(seed.fawtirNo).padStart(4, '0')}`
      return {
        ...seed,
        writeBack: {
          state: 'FAILED',
          attempts: 3,
          lastAttemptAt: minutesAgo(9),
          nextAttemptAt: new Date(NOW.getTime() + 21 * MINUTE),
          lastError: 'HTTP 409: the Odoo record is locked by another user (uid 14).',
          fields: {
            fawtirStatus: 'ACCEPTED',
            invoiceNumber: no,
            uuid: `9f3c1a7e-4b2d-4c8e-9${String(seed.fawtirNo).padStart(3, '0')}-0a1b2c3d4e5f`,
            submittedAt: plusMinutes(seed.collectedAt, 2),
            qr: true,
          },
        },
      }
    }
    if (seed.state === 'SUPERSEDED') {
      return {
        ...seed,
        supersededBy: {
          changedAt: ago(0, 12, 41),
          note: 'amount_total changed 1,312.350 → 1,248.900 after submission',
        },
      }
    }
    return seed
  })

  /* ---- Salalah: key revoked on the 24th; three failures → ERROR */
  const salalahRuns: Run[] = [
    ...[ago(0, 14, 0), ago(0, 13, 0), ago(0, 12, 0)].map((startedAt, i) => ({
      id: `run-sl-f${3 - i}`,
      connectionId: SALALAH,
      trigger: 'SCHEDULE' as RunTrigger,
      state: 'FAILED' as RunState,
      startedAt,
      finishedAt: plusMinutes(startedAt, 0.2),
      fetched: 0,
      created: 0,
      duplicates: 0,
      errors: 1,
      watermarkBefore: 'SINV-2026-00871',
      watermarkAfter: 'SINV-2026-00871',
      errorSummary: [{ code: 'UNAUTHORIZED', count: 1 }],
    })),
    {
      id: 'run-sl-ok3',
      connectionId: SALALAH,
      trigger: 'SCHEDULE',
      state: 'SUCCEEDED',
      startedAt: ago(2, 16, 0),
      finishedAt: plusMinutes(ago(2, 16, 0), 1),
      fetched: 3,
      created: 3,
      duplicates: 0,
      errors: 0,
      watermarkBefore: 'SINV-2026-00868',
      watermarkAfter: 'SINV-2026-00871',
      errorSummary: [],
    },
    {
      id: 'run-sl-ok2',
      connectionId: SALALAH,
      trigger: 'SCHEDULE',
      state: 'SUCCEEDED',
      startedAt: ago(3, 11, 0),
      finishedAt: plusMinutes(ago(3, 11, 0), 1),
      fetched: 5,
      created: 5,
      duplicates: 0,
      errors: 0,
      watermarkBefore: 'SINV-2026-00863',
      watermarkAfter: 'SINV-2026-00868',
      errorSummary: [],
    },
  ]
  const salalahSeeds: RecordSeed[] = Array.from({ length: 8 }, (_, k) => {
    const n = 864 + k
    const runId = k < 5 ? 'run-sl-ok2' : 'run-sl-ok3'
    const collectedAt = plusMinutes(k < 5 ? ago(3, 11, 0) : ago(2, 16, 0), 1 + (k % 5))
    return {
      id: `rec-sl-${n}`,
      connectionId: SALALAH,
      runId,
      erpNumber: `SINV-2026-${String(n).padStart(5, '0')}`,
      erpId: `SINV-2026-${String(n).padStart(5, '0')}`,
      state: 'ACCEPTED' as RecordState,
      collectedAt,
      customer: CUSTOMERS[(k + 5) % CUSTOMERS.length],
      total: Math.round((95 + ((n * 53) % 760) + 0.5) * 1000) / 1000,
      vatin: VATINS[k % VATINS.length],
      fawtirNo: 1160 + k,
    }
  })

  /* ---- Sohar: paused for stock-take */
  const soharRuns: Run[] = [
    {
      id: 'run-so-1',
      connectionId: SOHAR,
      trigger: 'SCHEDULE',
      state: 'SUCCEEDED',
      startedAt: ago(12, 8, 0),
      finishedAt: plusMinutes(ago(12, 8, 0), 1),
      fetched: 2,
      created: 2,
      duplicates: 0,
      errors: 0,
      watermarkBefore: 'INV/2026/09/0058',
      watermarkAfter: 'INV/2026/09/0060',
      errorSummary: [],
    },
    {
      id: 'run-so-0',
      connectionId: SOHAR,
      trigger: 'MANUAL',
      state: 'SUCCEEDED',
      startedAt: ago(13, 15, 10),
      finishedAt: plusMinutes(ago(13, 15, 10), 1),
      fetched: 3,
      created: 3,
      duplicates: 0,
      errors: 0,
      watermarkBefore: 'INV/2026/09/0055',
      watermarkAfter: 'INV/2026/09/0058',
      errorSummary: [],
    },
  ]
  const soharSeeds: RecordSeed[] = Array.from({ length: 5 }, (_, k) => {
    const n = 56 + k
    const runId = k < 3 ? 'run-so-0' : 'run-so-1'
    const collectedAt = plusMinutes(k < 3 ? ago(13, 15, 10) : ago(12, 8, 0), 1 + (k % 3))
    return {
      id: `rec-so-${n}`,
      connectionId: SOHAR,
      runId,
      erpNumber: `INV/2026/09/${String(n).padStart(4, '0')}`,
      erpId: String(700 + n),
      state: 'ACCEPTED' as RecordState,
      collectedAt,
      customer: CUSTOMERS[(k + 8) % CUSTOMERS.length],
      total: Math.round((640 + ((n * 91) % 2400) + 0.75) * 1000) / 1000,
      vatin: VATINS[(k + 2) % VATINS.length],
      fawtirNo: 1140 + k,
    }
  })

  const connections: Connection[] = [
    {
      id: HO,
      label: 'Head office (Odoo 17)',
      product: 'ODOO',
      erpVersion: '17.0+e',
      baseUrl: 'https://erp.albahja.om',
      authKind: 'API_KEY',
      credentialHint: 'integrations@albahja.om · key ····c41e',
      database: 'albahja_prod',
      scopes: ['READ', 'WRITE'],
      scheduleMinutes: 30,
      writeBackEnabled: true,
      state: 'CONNECTED',
      consecutiveFailures: 0,
      mapping: {
        usesTenantMapping: true,
        status: 'CERTIFIED',
        origin: 'EDIT',
        template: { ...odoo17, appliedAt: new Date(2026, 7, 3, 10, 12) },
        entryCount: 44,
        certifiedRoutes: 1,
        lastEditedAt: new Date(2026, 8, 19, 15, 40),
      },
      watermark: {
        erpNumber: `INV/2026/09/${String(erpSeq).padStart(4, '0')}`,
        issuedAt: ago(0, 13, 36),
      },
      lastRunAt: ago(0, 14, 0),
      nextRunAt: ago(0, 14, 30),
      createdAt: new Date(2026, 7, 3, 9, 58),
      createdBy: OPERATOR,
      lastTest: {
        at: new Date(2026, 8, 19, 15, 42),
        ok: true,
        erpVersion: '17.0+e',
        company: COMPANY.legalName,
        grantedScopes: ['READ', 'WRITE'],
        latencyMs: 412,
      },
      discovery: {
        at: new Date(2026, 7, 3, 10, 11),
        fields: [
          'name',
          'invoice_date',
          'partner_id.name',
          'partner_id.vat',
          'amount_untaxed',
          'amount_tax',
          'amount_total',
          'invoice_line_ids[].name',
          'invoice_line_ids[].quantity',
          'invoice_line_ids[].price_unit',
          'invoice_line_ids[].tax_ids',
          'payment_reference',
          'currency_id',
        ],
        samples: 5,
        templateApplied: odoo17,
      },
      events: [
        event(ago(0, 14, 0), 'runSucceeded', { fetched: 6, created: 6 }, 'Scheduler'),
        event(new Date(2026, 8, 19, 15, 42), 'tested', { latency: 412 }),
        event(new Date(2026, 8, 19, 15, 40), 'mappingEdited', { entries: 44 }),
        event(new Date(2026, 7, 3, 10, 14), 'writeBackEnabled'),
        event(new Date(2026, 7, 3, 10, 12), 'templateApplied', { template: 'Odoo 17 · 2026-09-A' }),
        event(new Date(2026, 7, 3, 10, 11), 'discovered', { fields: 13, samples: 5 }),
        event(new Date(2026, 7, 3, 10, 2), 'tested', { latency: 388 }),
        event(new Date(2026, 7, 3, 9, 58), 'created'),
      ],
    },
    {
      id: SALALAH,
      label: 'Salalah branch (ERPNext)',
      product: 'ERPNEXT',
      erpVersion: '15.28',
      baseUrl: 'https://salalah.albahja.om',
      authKind: 'API_KEY',
      credentialHint: 'key ····9b07',
      scopes: ['READ'],
      scheduleMinutes: 60,
      writeBackEnabled: false,
      state: 'ERROR',
      errorKey: 'credentials',
      consecutiveFailures: 3,
      mapping: {
        status: 'DRAFT',
        origin: 'EDIT',
        template: { ...erpnext15, appliedAt: new Date(2026, 8, 20, 11, 5) },
        entryCount: 40,
        certifiedRoutes: 0,
        lastEditedAt: new Date(2026, 8, 22, 9, 30),
      },
      watermark: { erpNumber: 'SINV-2026-00871', issuedAt: ago(2, 15, 48) },
      lastRunAt: ago(0, 14, 0),
      nextRunAt: undefined,
      createdAt: new Date(2026, 8, 20, 10, 50),
      createdBy: 'Salim Al Rawahi',
      lastTest: {
        at: ago(0, 14, 0),
        ok: false,
        errorCode: 'UNAUTHORIZED',
        latencyMs: 96,
      },
      discovery: {
        at: new Date(2026, 8, 20, 11, 4),
        fields: [
          'name',
          'posting_date',
          'posting_time',
          'customer_name',
          'tax_id',
          'net_total',
          'total_taxes_and_charges',
          'grand_total',
          'items[].item_name',
          'items[].qty',
          'items[].rate',
          'taxes[].rate',
          'currency',
        ],
        samples: 4,
        templateApplied: erpnext15,
      },
      events: [
        event(ago(0, 14, 0), 'wentToError', { failures: 3 }, 'Scheduler'),
        event(ago(0, 14, 0), 'runFailed', { code: 'UNAUTHORIZED' }, 'Scheduler'),
        event(ago(0, 13, 0), 'runFailed', { code: 'UNAUTHORIZED' }, 'Scheduler'),
        event(ago(0, 12, 0), 'runFailed', { code: 'UNAUTHORIZED' }, 'Scheduler'),
        event(new Date(2026, 8, 22, 9, 30), 'mappingEdited', { entries: 40 }, 'Salim Al Rawahi'),
        event(
          new Date(2026, 8, 20, 11, 5),
          'templateApplied',
          { template: 'ERPNext 15 · 2026-09-A' },
          'Salim Al Rawahi',
        ),
        event(
          new Date(2026, 8, 20, 11, 4),
          'discovered',
          { fields: 13, samples: 4 },
          'Salim Al Rawahi',
        ),
        event(new Date(2026, 8, 20, 10, 52), 'tested', { latency: 540 }, 'Salim Al Rawahi'),
        event(new Date(2026, 8, 20, 10, 50), 'created', undefined, 'Salim Al Rawahi'),
      ],
    },
    {
      id: SOHAR,
      label: 'Sohar warehouse (Odoo 16)',
      product: 'ODOO',
      erpVersion: '16.0',
      baseUrl: 'https://sohar-erp.albahja.om',
      authKind: 'BASIC',
      credentialHint: 'fawtir.bot',
      database: 'sohar_wh',
      scopes: ['READ'],
      scheduleMinutes: 240,
      writeBackEnabled: false,
      state: 'PAUSED',
      consecutiveFailures: 0,
      mapping: {
        status: 'READY',
        origin: 'TEMPLATE',
        template: { ...odoo16, appliedAt: new Date(2026, 8, 12, 14, 20) },
        entryCount: 39,
        certifiedRoutes: 0,
      },
      watermark: { erpNumber: 'INV/2026/09/0060', issuedAt: ago(12, 7, 52) },
      lastRunAt: ago(12, 8, 0),
      nextRunAt: undefined,
      createdAt: new Date(2026, 8, 12, 14, 5),
      createdBy: OPERATOR,
      pausedAt: new Date(2026, 8, 15, 8, 0),
      pauseReason: 'Stock-take until 30 September',
      lastTest: {
        at: new Date(2026, 8, 12, 14, 8),
        ok: true,
        erpVersion: '16.0',
        company: `${COMPANY.legalName}, Sohar`,
        grantedScopes: ['READ'],
        latencyMs: 655,
      },
      discovery: {
        at: new Date(2026, 8, 12, 14, 19),
        fields: [
          'name',
          'invoice_date',
          'partner_id.name',
          'partner_id.vat',
          'amount_untaxed',
          'amount_tax',
          'amount_total',
          'invoice_line_ids[].name',
          'invoice_line_ids[].quantity',
          'invoice_line_ids[].price_unit',
          'currency_id',
        ],
        samples: 3,
        templateApplied: odoo16,
      },
      events: [
        event(new Date(2026, 8, 15, 8, 0), 'paused', { reason: 'Stock-take until 30 September' }),
        event(ago(12, 8, 0), 'runSucceeded', { fetched: 2, created: 2 }, 'Scheduler'),
        event(new Date(2026, 8, 12, 14, 20), 'templateApplied', {
          template: 'Odoo 16 · 2026-09-A',
        }),
        event(new Date(2026, 8, 12, 14, 19), 'discovered', { fields: 11, samples: 3 }),
        event(new Date(2026, 8, 12, 14, 8), 'tested', { latency: 655 }),
        event(new Date(2026, 8, 12, 14, 5), 'created'),
      ],
    },
  ]

  return {
    addon,
    connections,
    runs: [...hoRuns, ...salalahRuns, ...soharRuns],
    records: [...hoRecordSeeds, ...salalahSeeds, ...soharSeeds].map(seedRecord),
  }
}

/* ------------------------------------------------------------------ store */

let state: ConnectorState = initialState()
const listeners = new Set<() => void>()
function set(next: ConnectorState) {
  state = next
  listeners.forEach((listener) => listener())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const patchConnection = (id: string, patch: (c: Connection) => Connection) =>
  set({ ...state, connections: state.connections.map((c) => (c.id === id ? patch(c) : c)) })

const log = (c: Connection, actionKey: string, values?: Record<string, string | number>) => ({
  ...c,
  events: [event(new Date(), actionKey, values), ...c.events],
})

export type CollectResult =
  | { ok: true; run: Run }
  | { ok: false; error: 'IN_PROGRESS' | 'QUOTA' | 'NOT_CERTIFIED' | 'PAUSED' | 'CREDENTIALS' }

export type NewConnection = {
  label: string
  product: Product
  baseUrl: string
  authKind: AuthKind
  /** The non-secret parts the screens keep: login, database. Secrets are sent and forgotten. */
  credentialHint: string
  database?: string
  scopes: Scope[]
  scheduleMinutes: ScheduleMinutes
  writeBackEnabled: boolean
}

/** What the Test step returns for a draft — the mock refuses the obvious mistakes. */
export function testDraft(
  draft: Pick<NewConnection, 'baseUrl' | 'product' | 'scopes'>,
): TestResult {
  const at = new Date()
  const url = draft.baseUrl.trim().toLowerCase()
  if (!url.startsWith('https://')) return { at, ok: false, errorCode: 'TLS', latencyMs: 40 }
  if (url.includes('localhost') || url.includes('127.0.0.1'))
    return { at, ok: false, errorCode: 'UNREACHABLE', latencyMs: 3000 }
  if (url.includes('revoked')) return { at, ok: false, errorCode: 'UNAUTHORIZED', latencyMs: 120 }
  return {
    at,
    ok: true,
    erpVersion: draft.product === 'ODOO' ? '17.0+e' : draft.product === 'ERPNEXT' ? '15.28' : '—',
    company: COMPANY.legalName,
    grantedScopes: draft.scopes,
    latencyMs: 300 + ((url.length * 7) % 400),
  }
}

export const connectorStore = {
  /** The connect flow's last step: the tested, discovered draft becomes a connection. */
  create(draft: NewConnection, test: TestResult, discovery: DiscoverResult): Connection {
    const now = new Date()
    const template = discovery.templateApplied
    const connection: Connection = {
      id: nextId('cx'),
      ...draft,
      erpVersion: test.erpVersion,
      state: 'CONNECTED',
      consecutiveFailures: 0,
      mapping: {
        status: template ? 'READY' : 'UNMAPPED',
        origin: template ? 'TEMPLATE' : 'NONE',
        template: template ? { ...template, appliedAt: now } : undefined,
        entryCount: template?.entryCount ?? 0,
        certifiedRoutes: 0,
      },
      nextRunAt: plusMinutes(now, draft.scheduleMinutes),
      createdAt: now,
      createdBy: OPERATOR,
      lastTest: test,
      discovery,
      events: [
        ...(template
          ? [event(now, 'templateApplied', { template: `${templateLabel(template)}` })]
          : []),
        event(now, 'discovered', { fields: discovery.fields.length, samples: discovery.samples }),
        event(now, 'tested', { latency: test.latencyMs ?? 0 }),
        event(now, 'created'),
      ],
    }
    set({ ...state, connections: [connection, ...state.connections] })
    return connection
  },

  discover(draft: Pick<NewConnection, 'product'>, erpVersion?: string): DiscoverResult {
    const template = templateFor(draft.product, erpVersion?.split('.')[0])
    const fields =
      draft.product === 'ERPNEXT'
        ? [
            'name',
            'posting_date',
            'posting_time',
            'customer_name',
            'tax_id',
            'net_total',
            'total_taxes_and_charges',
            'grand_total',
            'items[].item_name',
            'items[].qty',
            'items[].rate',
            'taxes[].rate',
            'currency',
          ]
        : [
            'name',
            'invoice_date',
            'partner_id.name',
            'partner_id.vat',
            'amount_untaxed',
            'amount_tax',
            'amount_total',
            'invoice_line_ids[].name',
            'invoice_line_ids[].quantity',
            'invoice_line_ids[].price_unit',
            'invoice_line_ids[].tax_ids',
            'payment_reference',
            'currency_id',
          ]
    return { at: new Date(), fields, samples: 5, templateApplied: template }
  },

  pause(id: string, reason?: string) {
    patchConnection(id, (c) =>
      log(
        { ...c, state: 'PAUSED', pausedAt: new Date(), pauseReason: reason, nextRunAt: undefined },
        reason ? 'paused' : 'pausedNoReason',
        reason ? { reason } : undefined,
      ),
    )
  },

  resume(id: string) {
    patchConnection(id, (c) =>
      log(
        {
          ...c,
          state: c.consecutiveFailures >= FAILURES_TO_ERROR ? 'ERROR' : 'CONNECTED',
          pausedAt: undefined,
          pauseReason: undefined,
          nextRunAt: plusMinutes(new Date(), c.scheduleMinutes),
        },
        'resumed',
      ),
    )
  },

  /** Reset to template: the operator's edits go, the platform's starter mapping comes back. */
  resetToTemplate(id: string) {
    patchConnection(id, (c) => {
      const template =
        c.mapping.template ??
        (templateFor(c.product, c.erpVersion?.split('.')[0]) && {
          ...templateFor(c.product, c.erpVersion?.split('.')[0])!,
          appliedAt: new Date(),
        })
      if (!template) return c
      return log(
        {
          ...c,
          mapping: {
            ...c.mapping,
            status: 'READY',
            origin: 'TEMPLATE',
            template: { ...template, appliedAt: new Date() },
            entryCount: template.entryCount,
            certifiedRoutes: 0,
            lastEditedAt: undefined,
          },
        },
        'templateApplied',
        { template: templateLabel(template) },
      )
    })
  },

  /** Delete: the secret is destroyed; runs and records stay for the audit. */
  remove(id: string) {
    patchConnection(id, (c) =>
      log({ ...c, state: 'DISCONNECTED', credentialHint: '—', nextRunAt: undefined }, 'deleted'),
    )
  },

  update(
    id: string,
    patch: Partial<
      Pick<Connection, 'label' | 'scheduleMinutes' | 'scopes' | 'baseUrl' | 'writeBackEnabled'>
    >,
  ) {
    patchConnection(id, (c) => {
      let next: Connection = { ...c, ...patch }
      if (patch.scheduleMinutes && next.state === 'CONNECTED')
        next = { ...next, nextRunAt: plusMinutes(new Date(), patch.scheduleMinutes) }
      if (patch.writeBackEnabled !== undefined && patch.writeBackEnabled !== c.writeBackEnabled)
        next = log(next, patch.writeBackEnabled ? 'writeBackEnabled' : 'writeBackDisabled')
      if (patch.scopes && patch.scopes.join() !== c.scopes.join())
        next = log(next, 'scopesChanged', { scopes: patch.scopes.join(', ') })
      if (patch.scheduleMinutes && patch.scheduleMinutes !== c.scheduleMinutes)
        next = log(next, 'scheduleChanged', { minutes: patch.scheduleMinutes })
      if (patch.label && patch.label !== c.label)
        next = log(next, 'renamed', { label: patch.label })
      if (patch.baseUrl && patch.baseUrl !== c.baseUrl)
        next = log(next, 'baseUrlChanged', { url: patch.baseUrl })
      return next
    })
  },

  /** New credentials re-test at once; a pass clears an ERROR caused by the old ones. */
  rotateCredentials(id: string, authKind: AuthKind, credentialHint: string): TestResult {
    const c = state.connections.find((x) => x.id === id)
    if (!c) return { at: new Date(), ok: false, errorCode: 'UNREACHABLE' }
    const test = testDraft(c)
    patchConnection(id, (cur) =>
      log(
        {
          ...cur,
          authKind,
          credentialHint,
          lastTest: test,
          ...(test.ok && cur.state === 'ERROR' && cur.errorKey === 'credentials'
            ? {
                state: 'CONNECTED' as ConnectionState,
                errorKey: undefined,
                consecutiveFailures: 0,
                nextRunAt: plusMinutes(new Date(), cur.scheduleMinutes),
              }
            : {}),
        },
        test.ok ? 'credentialsRotated' : 'credentialsRotationFailed',
        test.ok ? { latency: test.latencyMs ?? 0 } : { code: test.errorCode ?? 'UNREACHABLE' },
      ),
    )
    return test
  },

  test(id: string): TestResult {
    const c = state.connections.find((x) => x.id === id)
    if (!c) return { at: new Date(), ok: false, errorCode: 'UNREACHABLE' }
    const test =
      c.state === 'ERROR' && c.errorKey === 'credentials'
        ? { at: new Date(), ok: false, errorCode: 'UNAUTHORIZED' as const, latencyMs: 90 }
        : testDraft(c)
    patchConnection(id, (cur) =>
      log(
        { ...cur, lastTest: test },
        test.ok ? 'tested' : 'testFailed',
        test.ok ? { latency: test.latencyMs ?? 0 } : { code: test.errorCode ?? 'UNREACHABLE' },
      ),
    )
    return test
  },

  /** Collect now — the backend's 409 / 422 answers become the refusals here. */
  collectNow(id: string, mappingStatus: MappingStatus): CollectResult {
    const c = state.connections.find((x) => x.id === id)
    if (!c) return { ok: false, error: 'PAUSED' }
    if (c.state === 'PAUSED' || c.state === 'DISCONNECTED') return { ok: false, error: 'PAUSED' }
    if (c.state === 'ERROR' && c.errorKey === 'credentials')
      return { ok: false, error: 'CREDENTIALS' }
    if (state.runs.some((r) => r.connectionId === id && r.state === 'RUNNING'))
      return { ok: false, error: 'IN_PROGRESS' }
    if (state.addon.collectedThisMonth >= state.addon.limits.documentsPerMonth)
      return { ok: false, error: 'QUOTA' }
    if (mappingStatus !== 'CERTIFIED') return { ok: false, error: 'NOT_CERTIFIED' }
    const now = new Date()
    const run: Run = {
      id: nextId('run'),
      connectionId: id,
      trigger: 'MANUAL',
      state: 'SUCCEEDED',
      startedAt: now,
      finishedAt: plusMinutes(now, 1),
      fetched: 0,
      created: 0,
      duplicates: 0,
      errors: 0,
      watermarkBefore: c.watermark?.erpNumber,
      watermarkAfter: c.watermark?.erpNumber,
      errorSummary: [],
    }
    set({
      ...state,
      runs: [run, ...state.runs],
      connections: state.connections.map((x) =>
        x.id === id
          ? log(
              { ...x, lastRunAt: now, nextRunAt: plusMinutes(now, x.scheduleMinutes) },
              'collectedNow',
              { fetched: 0 },
            )
          : x,
      ),
    })
    return { ok: true, run }
  },

  /** Retry a rejected record: it goes back through mapping and submission. */
  retryRecord(recordId: string) {
    const now = new Date()
    set({
      ...state,
      records: state.records.map((r) =>
        r.id === recordId ? { ...r, state: 'MAPPED', rejection: undefined, updatedAt: now } : r,
      ),
    })
  },

  requeueWriteBack(recordId: string) {
    const now = new Date()
    set({
      ...state,
      records: state.records.map((r) =>
        r.id === recordId && r.writeBack
          ? {
              ...r,
              state: 'ACCEPTED',
              updatedAt: now,
              writeBack: {
                ...r.writeBack,
                state: 'PENDING',
                lastError: undefined,
                nextAttemptAt: plusMinutes(now, 1),
              },
            }
          : r,
      ),
    })
  },

  /** "Ask to activate" — plan-included is immediate, purchased waits for billing. */
  requestAddon(source: AddonSource) {
    set({
      ...state,
      addon: {
        ...state.addon,
        state: source === 'PLAN_INCLUDED' ? 'ACTIVE' : 'PENDING_PAYMENT',
        source,
        since: source === 'PLAN_INCLUDED' ? new Date() : state.addon.since,
      },
    })
  },

  /** For the screenshots and tests: the add-on not yet bought — the list is the card alone. */
  setAddonState(addonState: AddonState) {
    set({ ...state, addon: { ...state.addon, state: addonState } })
  },

  restoreStory() {
    set(initialState())
  },
}

/** The store as it stands — for modules that read it once at load (the bell's notes). */
export const getConnectorState = () => state

export function useConnector() {
  return useSyncExternalStore(subscribe, () => state)
}

/* ---------------------------------------------------------------- readers */

export const templateLabel = (tpl: Template) =>
  `${tpl.product === 'ODOO' ? 'Odoo' : tpl.product === 'ERPNEXT' ? 'ERPNext' : tpl.product} ${tpl.erpVersion} · ${tpl.schemaVersion}`

/** Live connections — DISCONNECTED ones are kept for their records but not listed or counted. */
export const liveConnections = (s: ConnectorState) =>
  s.connections.filter((c) => c.state !== 'DISCONNECTED')

export const connectionById = (s: ConnectorState, id: string | undefined) =>
  id ? s.connections.find((c) => c.id === id) : undefined

export const runsFor = (s: ConnectorState, connectionId: string) =>
  s.runs
    .filter((r) => r.connectionId === connectionId)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())

export const recordsFor = (s: ConnectorState, connectionId: string) =>
  s.records
    .filter((r) => r.connectionId === connectionId)
    .sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime())

export const pendingRejections = (s: ConnectorState, connectionId: string) =>
  s.records.filter((r) => r.connectionId === connectionId && r.state === 'REJECTED').length

/**
 * The mapping status the list shows. The head office runs the tenant's own mapping, so its status
 * follows `erpMapping.ts`; the others carry their own.
 */
export function mappingStatusOf(c: Connection, mapping: MappingState): MappingStatus {
  if (!c.mapping.usesTenantMapping) return c.mapping.status
  const map: Record<OverviewStatus, MappingStatus> = {
    NOT_SET_UP: 'UNMAPPED',
    DRAFT: 'DRAFT',
    READY_UNCERTIFIED: 'READY',
    PARTIALLY_CERTIFIED: 'CERTIFIED',
    CERTIFIED: 'CERTIFIED',
    STALE: 'STALE',
  }
  return map[overviewStatus(mapping)]
}

/** Days since the newest ERP invoice came in; `null` when nothing has. */
export function watermarkAgeDays(c: Connection, now = NOW) {
  if (!c.watermark) return null
  return Math.floor((now.getTime() - c.watermark.issuedAt.getTime()) / DAY)
}

export const watermarkIsStale = (c: Connection, now = NOW) =>
  (watermarkAgeDays(c, now) ?? 0) >= STALE_WATERMARK_DAYS

/** Usage of the add-on's two limits, as fractions for the bars. */
export function addonUsage(s: ConnectorState) {
  const connections = liveConnections(s).length
  return {
    connections,
    connectionsLimit: s.addon.limits.connections,
    connectionsSpent: connections / s.addon.limits.connections,
    collected: s.addon.collectedThisMonth,
    collectedLimit: s.addon.limits.documentsPerMonth,
    collectedSpent: s.addon.collectedThisMonth / s.addon.limits.documentsPerMonth,
  }
}

/** The pending outbox for a connection's Write-back tab. */
export const outboxFor = (s: ConnectorState, connectionId: string) =>
  s.records.filter((r) => r.connectionId === connectionId && r.writeBack)

/** Counts by record state for the filter chips. */
export function recordCounts(records: ErpRecord[]) {
  const counts = Object.fromEntries(RECORD_STATES.map((st) => [st, 0])) as Record<
    RecordState,
    number
  >
  for (const r of records) counts[r.state] += 1
  return counts
}

export const productName = (product: Product) =>
  ({
    ODOO: 'Odoo',
    ERPNEXT: 'ERPNext',
    DYNAMICS_365: 'Microsoft Dynamics 365',
    SAP_S4: 'SAP S/4HANA',
    ORACLE_FUSION: 'Oracle Fusion',
    ZOHO_BOOKS: 'Zoho Books',
  })[product]
