import type { Amount } from '../../lib/format'

/**
 * `GET /v1/dashboard?branchId=` (`DashboardController`, permission `reports.read`): every tile the
 * dashboard draws, in one response. A tile the server could not compute is `UNAVAILABLE` with no
 * data and the others still answer, so a screen shows "not available" per tile, never a failed page.
 * The plan quota is not here (it is `tenant.plan.read`, on `/settings/plan`), nor are payables
 * (`/bills/summary`).
 */
export const DASHBOARD_PATH = '/v1/dashboard'

export type Tile<T> = { status: 'OK'; data: T } | { status: 'UNAVAILABLE'; data: null }

export type ReceivableRowDto = {
  currency: string
  outstanding: Amount
  overdue: Amount
  overdueCount: number
  openCount: number
  dueThisMonth: Amount
  /**
   * D-30(a), from 0c2d034d4: what over-credited or overpaid documents hold, at or below zero. Not
   * in `outstanding`; the server sends no net, so the tile adds the two itself and says so.
   */
  unappliedCredit?: Amount
}

export type CashDto = {
  from: string
  to: string
  previousFrom: string
  previousTo: string
  byCurrency: { currency: string; received: Amount; previousReceived: Amount }[]
}

export type VatRowDto = {
  /** `INPUT_WITHOUT_OMR_VAT`: input VAT whose rial figure is not known, never netted. */
  side: 'OUTPUT' | 'INPUT' | 'NET' | 'INPUT_WITHOUT_OMR_VAT'
  currency: string
  vatAmount: Amount
}

/** `input` and `net` are null when the dashboard is filtered to a branch: bills carry no branch. */
export type VatPositionDto = {
  from: string
  to: string
  branchScoped: boolean
  output: VatRowDto[]
  input: VatRowDto[] | null
  net: VatRowDto[] | null
}

export type VolumeRowDto = {
  period: string
  periodStart: string
  currency: string
  documents: number
  totalAmount: Amount
}

export type VolumeTrendDto = { from: string; to: string; months: VolumeRowDto[] }

export type AckCountsDto = { ap: number; ab: number; re: number; none: number }

export type ComplianceDto = {
  from: string
  to: string
  scope: string
  documents: number
  outboundInvoiceAck: AckCountsDto
  /** `null` when no outbound invoice has been answered yet: no data, not zero. */
  deliverySuccessRate: number | null
  deadLettered: number
  attention: number
}

export type RecentInvoiceDto = {
  id: string
  invoiceNumber: string | null
  invoiceType: string
  state: string
  issueDate: string | null
  customerName: string | null
  currency: string
  /** Null for a draft: it is priced only at issue (`InvoicePayableSql` over no totals). */
  total: Amount | null
  dispatch: 'PENDING' | 'DISPATCHED' | 'DEAD_LETTERED' | null
  transportState: string | null
  invoiceAck: 'AP' | 'AB' | 'RE' | null
}

export type AlertDto = {
  code: 'OVERDUE_INVOICES' | 'DISPATCH_DEAD_LETTERED' | 'NEEDS_ATTENTION' | 'TDD_SLA_MISSED'
  severity: 'WARNING' | 'CRITICAL'
  count: number
}

export type DashboardDto = {
  asOf: string
  timeZone: string
  branchId: string | null
  receivables: Tile<ReceivableRowDto[]>
  cash: Tile<CashDto>
  vat: Tile<VatPositionDto>
  volumeTrend: Tile<VolumeTrendDto>
  compliance: Tile<ComplianceDto>
  recentInvoices: Tile<RecentInvoiceDto[]>
  alerts: Tile<AlertDto[]>
}
