import { useSyncExternalStore } from 'react'
import { SUBSCRIPTIONS_NOW, OPERATOR } from './consoleSubscriptions'
import { PLATFORM, OTA } from './superAdmin'

/**
 * The running side of the console — docs/erp-and-console-plan.md §9: the cross-tenant submission
 * queue (what is waiting at the OTA or on the Peppol network right now, what was refused, what is
 * stuck) and the platform's incidents with the notices posted to tenants.
 *
 * Console clock: Friday 4 September 2026 14:26. The Operations home already says the OTA slowed at
 * `OTA.slowedAt`; the open incident here is that same slowdown, so the two screens agree.
 */

export const NOW = SUBSCRIPTIONS_NOW
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * MINUTE)
const at = (daysAgo: number, hour = 10, minute = 0) => {
  const d = new Date(NOW.getTime() - daysAgo * DAY)
  d.setHours(hour, minute, 0, 0)
  return d
}

let idSeq = 7000
const nextId = (prefix: string) => `${prefix}-${++idSeq}`

/* ------------------------------------------------------------ submissions */

export type DocumentKind = 'invoice' | 'creditNote' | 'debitNote' | 'selfBilling' | 'posReceipt'
/** Where a submission stands in the pipeline. */
export type Stage =
  'queued' | 'validating' | 'signing' | 'sending' | 'awaitingOta' | 'refused' | 'stuck' | 'accepted'
export const STAGES: Stage[] = [
  'queued',
  'validating',
  'signing',
  'sending',
  'awaitingOta',
  'stuck',
  'refused',
  'accepted',
]
export type Lane = 'waiting' | 'stuck' | 'refused' | 'done'

export type Submission = {
  id: string
  tenantId: string
  documentNo: string
  kind: DocumentKind
  stage: Stage
  /** When it entered its current stage. */
  since: Date
  /** When the tenant issued it. */
  issuedAt: Date
  attempts: number
  /** Refused or stuck: what the OTA or the network said. */
  error?: { code: string; message: string }
  /** Stuck: an operator can push it back through. */
  canRedrive: boolean
  /** Refused: the tenant was told. */
  tenantNotifiedAt?: Date
  amount: number
}

export const laneOf = (s: Submission): Lane =>
  s.stage === 'stuck'
    ? 'stuck'
    : s.stage === 'refused'
      ? 'refused'
      : s.stage === 'accepted'
        ? 'done'
        : 'waiting'

export const waitingMinutes = (s: Submission, now = NOW) =>
  Math.max(0, Math.round((now.getTime() - s.since.getTime()) / MINUTE))

/* -------------------------------------------------------------- incidents */

export type IncidentState = 'investigating' | 'identified' | 'monitoring' | 'resolved'
export const INCIDENT_STATES: IncidentState[] = [
  'investigating',
  'identified',
  'monitoring',
  'resolved',
]
export type Severity = 'minor' | 'major' | 'critical'
export type Component = 'ota' | 'peppol' | 'signing' | 'platform' | 'connector'

export type IncidentUpdate = {
  id: string
  at: Date
  by: string
  state: IncidentState
  text: string
}
export type Notice = { at: Date; by: string; textEn: string; textAr: string }

export type Incident = {
  id: string
  /** INC-2026-014 */
  number: string
  title: string
  state: IncidentState
  severity: Severity
  component: Component
  startedAt: Date
  resolvedAt?: Date
  /** Tenants whose submissions were touched. */
  affectedTenants: number
  updates: IncidentUpdate[]
  notice?: Notice
}

export type OpsEvent = {
  id: string
  at: Date
  by: string
  /** `console.ops.event.*` */
  actionKey: string
  tenantId?: string
  values?: Record<string, string | number>
}

export type ConsoleOpsState = {
  submissions: Submission[]
  incidents: Incident[]
  events: OpsEvent[]
}

/* ------------------------------------------------------------------ story */

const TENANT_POOL = [
  'al-bahja',
  'sur-trading',
  'muscat-grand',
  'nizwa-wholesale',
  'barka-beach',
  'salalah-spice',
  'oman-marine',
  'al-noor',
  'sohar-steel',
  'bahla-pottery',
  'ibri-dates',
  'seeb-pharmacy',
  'qurum-dental',
  'rustaq-motors',
  'salalah-tours',
  'muttrah-souq',
  'buraimi-hardware',
  'amerat-bakery',
  'duqm-logistics',
  'sur-fisheries',
  'shinas-print',
  'mabela-parts',
  'nakhal-honey',
  'jalan-fish',
  'sumail-poultry',
  'bidbid-cafe',
  'bahwan-group',
]
const KINDS: DocumentKind[] = [
  'invoice',
  'invoice',
  'invoice',
  'creditNote',
  'invoice',
  'posReceipt',
  'invoice',
  'debitNote',
  'invoice',
  'selfBilling',
]
const PREFIX: Record<DocumentKind, string> = {
  invoice: 'INV',
  creditNote: 'CRN',
  debitNote: 'DBN',
  selfBilling: 'SBI',
  posReceipt: 'POS',
}

function submission(
  i: number,
  stage: Stage,
  sinceMinutes: number,
  extra: Partial<Submission> = {},
): Submission {
  const kind = KINDS[i % KINDS.length]
  const tenantId = TENANT_POOL[(i * 7) % TENANT_POOL.length]
  const since = minutesAgo(sinceMinutes)
  return {
    id: `sub-${1000 + i}`,
    tenantId,
    documentNo: `${PREFIX[kind]}-2026-${String(1800 + ((i * 37) % 900)).padStart(4, '0')}`,
    kind,
    stage,
    since,
    issuedAt: new Date(since.getTime() - (3 + (i % 9)) * MINUTE),
    attempts: 1,
    canRedrive: false,
    amount: Math.round((40 + ((i * 131) % 2600) + 0.25) * 1000) / 1000,
    ...extra,
  }
}

function initialState(): ConsoleOpsState {
  idSeq = 7000
  const submissions: Submission[] = [
    // Waiting — 41 on the Operations home; the queue lists the oldest of them by stage.
    ...Array.from({ length: 14 }, (_, i) => submission(i, 'awaitingOta', 6 - (i % 6) * 0.9)),
    ...Array.from({ length: 9 }, (_, i) => submission(20 + i, 'sending', 1 + (i % 4) * 0.5)),
    ...Array.from({ length: 6 }, (_, i) => submission(40 + i, 'signing', 0.4 + (i % 3) * 0.3)),
    ...Array.from({ length: 7 }, (_, i) => submission(60 + i, 'validating', 0.2 + (i % 4) * 0.2)),
    ...Array.from({ length: 5 }, (_, i) => submission(80 + i, 'queued', 0.1 + (i % 3) * 0.1)),
    // Stuck — three failed sends, an operator can redrive.
    submission(90, 'stuck', 48, {
      attempts: 3,
      canRedrive: true,
      error: {
        code: 'AP_TIMEOUT',
        message: 'The access point did not answer in 30 s, three times.',
      },
    }),
    submission(91, 'stuck', 31, {
      attempts: 3,
      canRedrive: true,
      error: {
        code: 'AP_TIMEOUT',
        message: 'The access point did not answer in 30 s, three times.',
      },
    }),
    submission(92, 'stuck', 125, {
      attempts: 4,
      canRedrive: true,
      error: { code: 'SMP_LOOKUP', message: 'The buyer’s Peppol id is not in the SMP.' },
    }),
    // Refused today — the tenant has to fix and resubmit.
    submission(100, 'refused', 22, {
      error: { code: 'BR-OM-06', message: 'Buyer VATIN is missing on a standard tax invoice.' },
    }),
    submission(101, 'refused', 74, {
      error: { code: 'BR-OM-10', message: 'Seller ISIC activity code is missing.' },
      tenantNotifiedAt: minutesAgo(70),
    }),
    submission(102, 'refused', 138, {
      error: { code: 'BR-CO-15', message: 'Invoice total does not equal the sum of its lines.' },
      tenantNotifiedAt: minutesAgo(130),
    }),
    submission(103, 'refused', 201, {
      error: { code: 'BR-OM-06', message: 'Buyer VATIN is missing on a standard tax invoice.' },
    }),
    submission(104, 'refused', 296, {
      error: { code: 'PEPPOL-EN16931-R020', message: 'Payment due date precedes the issue date.' },
      tenantNotifiedAt: minutesAgo(290),
    }),
    // Accepted in the last hour — the tail of the day, for the "done" lane.
    ...Array.from({ length: 12 }, (_, i) => submission(120 + i, 'accepted', 2 + i * 4.5)),
  ]

  const incidents: Incident[] = [
    {
      id: 'inc-014',
      number: 'INC-2026-014',
      title: 'OTA responses slowed to 40 s',
      state: 'identified',
      severity: 'major',
      component: 'ota',
      startedAt: at(0, 13, 40),
      affectedTenants: 96,
      updates: [
        {
          id: 'u-3',
          at: at(0, 14, 12),
          by: OPERATOR,
          state: 'identified',
          text: `The OTA confirms a capacity issue on their side since ${OTA.slowedAt}. Submissions are queued, none are lost; expect 5–40 s per document until they scale.`,
        },
        {
          id: 'u-2',
          at: at(0, 13, 55),
          by: 'Maryam Al Balushi',
          state: 'investigating',
          text: 'Our access point and signing are healthy; the wait is at the OTA acknowledgement.',
        },
        {
          id: 'u-1',
          at: at(0, 13, 44),
          by: 'Scheduler',
          state: 'investigating',
          text: 'Median OTA acknowledgement passed 20 s for five minutes.',
        },
      ],
      notice: {
        at: at(0, 14, 15),
        by: OPERATOR,
        textEn:
          'The Tax Authority is answering slowly since 13:40. Your documents are queued and will be accepted; nothing needs resending.',
        textAr:
          'جهاز الضرائب يستجيب ببطء منذ 13:40. مستنداتكم في قائمة الانتظار وستُقبل؛ لا حاجة لإعادة الإرسال.',
      },
    },
    {
      id: 'inc-013',
      number: 'INC-2026-013',
      title: 'Peppol access point certificate rotation',
      state: 'resolved',
      severity: 'minor',
      component: 'peppol',
      startedAt: at(2, 2, 0),
      resolvedAt: at(2, 2, 40),
      affectedTenants: 0,
      updates: [
        {
          id: 'u-6',
          at: at(2, 2, 40),
          by: 'Hamed Al Kindi',
          state: 'resolved',
          text: 'New certificate live on both access points; SMP bindings verified.',
        },
        {
          id: 'u-5',
          at: at(2, 2, 5),
          by: 'Hamed Al Kindi',
          state: 'monitoring',
          text: 'Rotation done on AP-1; AP-2 carrying traffic.',
        },
        {
          id: 'u-4',
          at: at(2, 2, 0),
          by: 'Hamed Al Kindi',
          state: 'investigating',
          text: 'Planned rotation started.',
        },
      ],
    },
    {
      id: 'inc-012',
      number: 'INC-2026-012',
      title: 'Signing latency after HSM firmware update',
      state: 'resolved',
      severity: 'major',
      component: 'signing',
      startedAt: at(9, 9, 5),
      resolvedAt: at(9, 10, 30),
      affectedTenants: 212,
      updates: [
        {
          id: 'u-9',
          at: at(9, 10, 30),
          by: OPERATOR,
          state: 'resolved',
          text: 'Rolled back the firmware; signing back under 300 ms.',
        },
        {
          id: 'u-8',
          at: at(9, 9, 40),
          by: OPERATOR,
          state: 'identified',
          text: 'Firmware 4.2.1 doubles the sign time under load.',
        },
        {
          id: 'u-7',
          at: at(9, 9, 5),
          by: 'Scheduler',
          state: 'investigating',
          text: 'Signing p95 above 2 s.',
        },
      ],
      notice: {
        at: at(9, 9, 50),
        by: OPERATOR,
        textEn:
          'Signing is slower than usual this morning. Documents are being sent; no action needed.',
        textAr: 'التوقيع أبطأ من المعتاد هذا الصباح. المستندات تُرسل؛ لا حاجة لأي إجراء.',
      },
    },
    {
      id: 'inc-011',
      number: 'INC-2026-011',
      title: 'Duqm Logistics connector unreachable (tenant network)',
      state: 'monitoring',
      severity: 'minor',
      component: 'connector',
      startedAt: at(0, 10, 40),
      affectedTenants: 1,
      updates: [
        {
          id: 'u-11',
          at: at(0, 13, 10),
          by: 'Maryam Al Balushi',
          state: 'monitoring',
          text: 'Tenant confirms a firewall change on their side; waiting for them to allow our address.',
        },
        {
          id: 'u-10',
          at: at(0, 10, 40),
          by: 'Scheduler',
          state: 'investigating',
          text: 'Four failed runs in a row on cx-duqm: connection refused.',
        },
      ],
    },
    {
      id: 'inc-010',
      number: 'INC-2026-010',
      title: 'Planned maintenance: database upgrade',
      state: 'resolved',
      severity: 'minor',
      component: 'platform',
      startedAt: at(16, 1, 0),
      resolvedAt: at(16, 2, 15),
      affectedTenants: 0,
      updates: [
        {
          id: 'u-13',
          at: at(16, 2, 15),
          by: 'Hamed Al Kindi',
          state: 'resolved',
          text: 'Upgrade complete; all services back.',
        },
        {
          id: 'u-12',
          at: at(16, 1, 0),
          by: 'Hamed Al Kindi',
          state: 'monitoring',
          text: 'Maintenance window opened.',
        },
      ],
      notice: {
        at: at(17, 16, 0),
        by: 'Hamed Al Kindi',
        textEn: 'Fawtir will be unavailable on 19 August between 01:00 and 02:30 for maintenance.',
        textAr: 'سيكون فوتر غير متاح يوم 19 أغسطس بين 01:00 و02:30 للصيانة.',
      },
    },
  ]

  const events: OpsEvent[] = [
    {
      id: nextId('ev'),
      at: at(0, 14, 15),
      by: OPERATOR,
      actionKey: 'noticePosted',
      values: { incident: 'INC-2026-014' },
    },
    {
      id: nextId('ev'),
      at: at(0, 14, 12),
      by: OPERATOR,
      actionKey: 'incidentUpdated',
      values: { incident: 'INC-2026-014', state: 'identified' },
    },
    {
      id: nextId('ev'),
      at: at(0, 13, 44),
      by: 'Scheduler',
      actionKey: 'incidentOpened',
      values: { incident: 'INC-2026-014' },
    },
    {
      id: nextId('ev'),
      at: at(2, 2, 40),
      by: 'Hamed Al Kindi',
      actionKey: 'incidentResolved',
      values: { incident: 'INC-2026-013' },
    },
    {
      id: nextId('ev'),
      at: at(1, 9, 30),
      by: 'Maryam Al Balushi',
      actionKey: 'redriven',
      tenantId: 'sur-fisheries',
      values: { document: 'INV-2026-1871' },
    },
  ]

  return { submissions, incidents, events }
}

/* ------------------------------------------------------------------ store */

let state: ConsoleOpsState = initialState()
const listeners = new Set<() => void>()
function set(next: ConsoleOpsState) {
  state = next
  listeners.forEach((l) => l())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const logged = (
  s: ConsoleOpsState,
  actionKey: string,
  values?: Record<string, string | number>,
  tenantId?: string,
  by: string = OPERATOR,
): ConsoleOpsState => ({
  ...s,
  events: [{ id: nextId('ev'), at: new Date(), by, actionKey, tenantId, values }, ...s.events],
})

export const consoleOpsStore = {
  /** Redrive a stuck submission: back to the queue with one more attempt. */
  redrive(id: string) {
    const sub = state.submissions.find((x) => x.id === id)
    if (!sub || !sub.canRedrive) return
    set(
      logged(
        {
          ...state,
          submissions: state.submissions.map((x) =>
            x.id === id
              ? {
                  ...x,
                  stage: 'queued',
                  since: new Date(),
                  attempts: x.attempts + 1,
                  canRedrive: false,
                  error: undefined,
                }
              : x,
          ),
        },
        'redriven',
        { document: sub.documentNo },
        sub.tenantId,
      ),
    )
  },

  /** Tell the tenant about a refusal — the same notice their bell would carry. */
  notifyTenant(id: string) {
    const sub = state.submissions.find((x) => x.id === id)
    if (!sub || sub.stage !== 'refused') return
    set(
      logged(
        {
          ...state,
          submissions: state.submissions.map((x) =>
            x.id === id ? { ...x, tenantNotifiedAt: new Date() } : x,
          ),
        },
        'tenantNotified',
        { document: sub.documentNo },
        sub.tenantId,
      ),
    )
  },

  openIncident(input: {
    title: string
    severity: Severity
    component: Component
    text: string
    affectedTenants?: number
  }) {
    const now = new Date()
    const number = `INC-2026-${String(state.incidents.length + 10).padStart(3, '0')}`
    const incident: Incident = {
      id: nextId('inc'),
      number,
      title: input.title,
      state: 'investigating',
      severity: input.severity,
      component: input.component,
      startedAt: now,
      affectedTenants: input.affectedTenants ?? 0,
      updates: [
        { id: nextId('u'), at: now, by: OPERATOR, state: 'investigating', text: input.text },
      ],
    }
    set(
      logged({ ...state, incidents: [incident, ...state.incidents] }, 'incidentOpened', {
        incident: number,
      }),
    )
    return incident
  },

  addUpdate(id: string, nextState: IncidentState, text: string) {
    const incident = state.incidents.find((x) => x.id === id)
    if (!incident) return
    const now = new Date()
    set(
      logged(
        {
          ...state,
          incidents: state.incidents.map((x) =>
            x.id === id
              ? {
                  ...x,
                  state: nextState,
                  resolvedAt: nextState === 'resolved' ? now : x.resolvedAt,
                  updates: [
                    { id: nextId('u'), at: now, by: OPERATOR, state: nextState, text },
                    ...x.updates,
                  ],
                }
              : x,
          ),
        },
        nextState === 'resolved' ? 'incidentResolved' : 'incidentUpdated',
        { incident: incident.number, state: nextState },
      ),
    )
  },

  postNotice(id: string, textEn: string, textAr: string) {
    const incident = state.incidents.find((x) => x.id === id)
    if (!incident) return
    set(
      logged(
        {
          ...state,
          incidents: state.incidents.map((x) =>
            x.id === id ? { ...x, notice: { at: new Date(), by: OPERATOR, textEn, textAr } } : x,
          ),
        },
        'noticePosted',
        { incident: incident.number },
      ),
    )
  },

  restoreStory() {
    set(initialState())
  },
}

export function useConsoleOps() {
  return useSyncExternalStore(subscribe, () => state)
}
export const getConsoleOpsState = () => state

/* ---------------------------------------------------------------- readers */

export const incidentById = (s: ConsoleOpsState, id: string | undefined) =>
  id ? s.incidents.find((x) => x.id === id) : undefined
export const openIncidents = (s: ConsoleOpsState) =>
  s.incidents.filter((x) => x.state !== 'resolved')
export const submissionsIn = (s: ConsoleOpsState, lane: Lane) =>
  s.submissions.filter((x) => laneOf(x) === lane)

/** The queue's figures — the listed rows are a sample; the platform totals come from the home. */
export function queueKpis(s: ConsoleOpsState) {
  const waiting = submissionsIn(s, 'waiting')
  const oldest = waiting.reduce((max, x) => Math.max(max, waitingMinutes(x)), 0)
  return {
    waiting: PLATFORM.waiting,
    oldestWaitMinutes: Math.max(PLATFORM.oldestWaitMinutes, Math.round(oldest)),
    stuck: submissionsIn(s, 'stuck').length,
    refusedToday: submissionsIn(s, 'refused').length + 291,
    acceptedToday: PLATFORM.filedToday,
    byStage: Object.fromEntries(
      STAGES.map((stage) => [stage, s.submissions.filter((x) => x.stage === stage).length]),
    ) as Record<Stage, number>,
  }
}
