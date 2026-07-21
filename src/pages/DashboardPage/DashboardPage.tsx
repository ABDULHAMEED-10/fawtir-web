import { AppShell } from '../../layouts/AppShell'
import { DashboardHeader, KpiCards } from './KpiSection'
import { RevenueChart } from './RevenueChart'
import { RecentInvoices } from './RecentInvoices'
import { ComplianceHealth, InvoiceQuota, VatPosition } from './SidePanels'

export function DashboardPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <DashboardHeader />
        <KpiCards />

        <div className="grid gap-4 xl:grid-cols-[1.93fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <RevenueChart />
            <RecentInvoices />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <ComplianceHealth />
            <InvoiceQuota />
            <VatPosition />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
