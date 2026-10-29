import { AppShell } from '../../layouts/AppShell'
import { useApiRead } from '../../hooks/useApiRead'
import { DASHBOARD_PATH, type DashboardDto } from '../../api/reports/dashboard'
import { BILL_SUMMARY_PATH, loadBillSummary, type BillSummaryDto } from '../../api/expenditure/bills'
import { PLAN_OVERVIEW_PATH, loadPlanOverview, type PlanOverviewDto } from '../../api/settings/plan'
import { InvoicingReadinessCard } from '../../components/readiness/InvoicingReadinessCard'
import { BillDueCard } from '../../components/billing/BillDueCard'
import { DashboardHeader, KpiCards } from './KpiSection'
import { RevenueChart } from './RevenueChart'
import { RecentInvoices } from './RecentInvoices'
import { ComplianceHealth, InvoiceQuota, VatPosition } from './SidePanels'
import { tileOf, viewOf } from './dashboardData'
import { useMayRequest } from '../../lib/session/session'

/**
 * The dashboard, from three reads: `GET /v1/dashboard` for every tile it carries, `/bills/summary`
 * for payables and `/settings/plan` for the invoice allowance. Each card shows its own "not
 * available yet" when its tile or read has nothing, so one refused or failed read never blanks the
 * page. Every figure here used to be a sample company's.
 */
export function DashboardPage() {
  return (
    <AppShell>
      <DashboardBody />
    </AppShell>
  )
}

function DashboardBody() {
  const dashboard = useApiRead<DashboardDto>(DASHBOARD_PATH).read
  const bills = useApiRead<BillSummaryDto>(BILL_SUMMARY_PATH, loadBillSummary).read
  // `tenant.plan.read` only (B-14): without it the card says "Not available yet", as it did on
  // the refusal the read used to earn.
  const mayReadPlan = useMayRequest('tenant.plan.read')
  const plan = useApiRead<PlanOverviewDto>(
    mayReadPlan ? PLAN_OVERVIEW_PATH : null,
    loadPlanOverview,
  ).read

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <DashboardHeader />
      <BillDueCard />
      <InvoicingReadinessCard />
      <KpiCards
        cash={tileOf(dashboard, (data) => data.cash)}
        receivables={tileOf(dashboard, (data) => data.receivables)}
        payables={viewOf(bills)}
      />

      <div className="grid gap-4 xl:grid-cols-[1.93fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <RevenueChart trend={tileOf(dashboard, (data) => data.volumeTrend)} />
          <RecentInvoices invoices={tileOf(dashboard, (data) => data.recentInvoices)} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <ComplianceHealth
            compliance={tileOf(dashboard, (data) => data.compliance)}
            alerts={tileOf(dashboard, (data) => data.alerts)}
          />
          <InvoiceQuota plan={mayReadPlan ? viewOf(plan) : { kind: 'unavailable' }} />
          <VatPosition vat={tileOf(dashboard, (data) => data.vat)} />
        </div>
      </div>
    </div>
  )
}
