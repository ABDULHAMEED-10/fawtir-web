import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { formatAmount, formatDate, formatCount } from '../../lib/format'
import type { AlertDto, ComplianceDto, VatPositionDto } from '../../api/reports/dashboard'
import type { PlanOverviewDto } from '../../api/settings/plan'
import { DashboardCard } from './DashboardCard'
import { omrRow, toNumber, type TileView } from './dashboardData'

function Unavailable({ view }: { view: TileView<unknown> }) {
  const { t } = useTranslation()
  return (
    <p className="text-sm font-medium text-text-quaternary">
      {view.kind === 'loading' ? t('dashboard.loading') : t('dashboard.notAvailableYet')}
    </p>
  )
}

const ALERT_TO: Record<AlertDto['code'], string> = {
  OVERDUE_INVOICES: '/invoices',
  DISPATCH_DEAD_LETTERED: '/compliance/activity',
  NEEDS_ATTENTION: '/compliance/activity',
  TDD_SLA_MISSED: '/compliance/activity',
}

/**
 * This month's outbound delivery, from the dashboard's compliance and alerts tiles. Always the whole
 * company: Peppol submissions carry no branch. The rate is the buyers' answers (accepted over
 * answered); with none answered it says so rather than drawing 0% or the frame's 98.7%.
 */
export function ComplianceHealth({
  compliance,
  alerts,
}: {
  compliance: TileView<ComplianceDto>
  alerts: TileView<AlertDto[]>
}) {
  const { t, i18n } = useTranslation()
  const count = (value: number) => formatCount(value, i18n.language)

  return (
    <section className="overflow-hidden rounded-md border border-black/[0.06] bg-surface-card">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-base font-semibold text-text-primary">
          {t('dashboard.compliance.title')}
        </h2>
        <span className="text-xs font-medium text-text-quaternary">
          {t('dashboard.thisMonth')}
        </span>
      </div>

      <div className="px-4 py-4">
        {compliance.kind !== 'ok' ? (
          <Unavailable view={compliance} />
        ) : (
          <ComplianceFigures data={compliance.data} count={count} />
        )}
      </div>

      {alerts.kind === 'ok'
        ? alerts.data
            .filter((alert) => alert.count > 0)
            .map((alert) => (
              <Link
                key={alert.code}
                to={ALERT_TO[alert.code]}
                className={[
                  'mx-1 mb-1 flex w-[calc(100%-8px)] items-center justify-between rounded-md px-4 py-2.5 text-start text-base font-semibold tracking-[0.16px]',
                  alert.severity === 'CRITICAL'
                    ? 'bg-danger-100 text-danger-700'
                    : 'bg-warning-100 text-warning-700',
                ].join(' ')}
              >
                {t(`dashboard.alert.${alert.code}`, { count: alert.count })}
                <span aria-hidden="true" className="font-medium rtl:rotate-180">
                  →
                </span>
              </Link>
            ))
        : null}
    </section>
  )
}

function ComplianceFigures({
  data,
  count,
}: {
  data: ComplianceDto
  count: (value: number) => string
}) {
  const { t, i18n } = useTranslation()
  const ack = data.outboundInvoiceAck
  const rate = data.deliverySuccessRate
  const circumference = 2 * Math.PI * 46

  return (
    <div className="flex items-center gap-6">
      <div className="relative size-[112px] shrink-0">
        <svg viewBox="0 0 112 112" className="size-full -rotate-90">
          <circle cx="56" cy="56" r="46" fill="none" stroke="#EAEDF8" strokeWidth="12" />
          {rate !== null ? (
            <circle
              cx="56"
              cy="56"
              r="46"
              fill="none"
              stroke="#2C4EB7"
              strokeWidth="12"
              strokeDasharray={`${circumference * rate} ${circumference}`}
              strokeLinecap="round"
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-text-primary">
            {rate === null
              ? '—'
              : new Intl.NumberFormat(i18n.language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB', {
                  style: 'percent',
                  maximumFractionDigits: 1,
                }).format(rate)}
          </p>
          <p className="text-[10px] font-medium text-text-quaternary">
            {rate === null ? t('dashboard.compliance.noAnswersYet') : t('dashboard.compliance.accepted')}
          </p>
        </div>
      </div>

      <dl className="flex min-w-0 flex-1 flex-col gap-2.5 text-sm">
        <Line tone="bg-primary-700" label={t('dashboard.compliance.documents')} value={count(data.documents)} />
        <Line tone="bg-primary-300" label={t('dashboard.compliance.acceptedCount')} value={count(ack.ap + ack.ab)} />
        <Line tone="bg-danger-700" label={t('dashboard.compliance.rejected')} value={count(ack.re)} />
        <Line tone="bg-[#a8abb2]" label={t('dashboard.compliance.awaiting')} value={count(ack.none)} />
      </dl>
    </div>
  )
}

function Line({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-2 font-medium text-text-tertiary">
        <span className={['size-2.5 rounded-sm', tone].join(' ')} />
        {label}
      </dt>
      <dd className="font-semibold text-text-primary">{value}</dd>
    </div>
  )
}

/**
 * The plan's invoice allowance, from `GET /v1/settings/plan` (`tenant.plan.read`, which the
 * dashboard endpoint deliberately does not require). It used to be a sample 342 of 1,000.
 */
export function InvoiceQuota({ plan }: { plan: TileView<PlanOverviewDto> }) {
  const { t, i18n } = useTranslation()
  const usage = plan.kind === 'ok' ? plan.data.usage : undefined

  return (
    <DashboardCard title={t('dashboard.quota.title')}>
      {!usage || !usage.quota ? (
        <Unavailable view={plan.kind === 'ok' ? { kind: 'unavailable' } : plan} />
      ) : (
        <QuotaFigures
          used={usage.used}
          quota={usage.quota}
          ends={usage.period?.end ? formatDate(usage.period.end, i18n.language) : null}
        />
      )}
    </DashboardCard>
  )
}

function QuotaFigures({ used, quota, ends }: { used: number; quota: number; ends: string | null }) {
  const { t, i18n } = useTranslation()
  const percent = Math.min(100, Math.round((used / quota) * 100))
  return (
    <>
      <p className="font-semibold leading-[1.2] text-text-primary">
        <span className="text-[22px]">{formatCount(used, i18n.language)}</span>
        <span className="text-sm font-medium text-text-quaternary">
          {' '}
          / {formatCount(quota, i18n.language)} {t('dashboard.quota.used')}
        </span>
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-primary-50">
        <div className="h-full rounded-full bg-primary-700" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="font-medium text-text-quaternary">
          {ends ? t('dashboard.quota.periodEnds', { date: ends }) : ''}
        </span>
        <span className="font-semibold text-text-primary">{percent}%</span>
      </div>
    </>
  )
}

/** This VAT quarter, as `/reports/vat` computes it. Branch-filtered, input and net are not known. */
export function VatPosition({ vat }: { vat: TileView<VatPositionDto> }) {
  const { t, i18n } = useTranslation()
  const omr = (rows: VatPositionDto['output'] | null) =>
    rows === null ? null : formatAmount(toNumber(omrRow(rows)?.vatAmount), 'OMR', i18n.language)

  return (
    <DashboardCard
      title={t('dashboard.vat.title')}
      action={
        <Link to="/reports/vat-tax" className="text-sm font-medium text-primary-700">
          {t('dashboard.vat.report')}
        </Link>
      }
    >
      {vat.kind !== 'ok' ? (
        <Unavailable view={vat} />
      ) : (
        <>
          {omr(vat.data.net) !== null ? (
            <p className="flex flex-wrap items-center gap-2 font-semibold text-text-primary">
              <OmAmount
                size="md"
                amount={omr(vat.data.net)}
                amountClassName="text-[22px] font-semibold text-text-primary"
              />
              <span className="rounded-full bg-warning-100 px-2 py-1 text-sm font-medium text-warning-700">
                {t('dashboard.vat.net')}
              </span>
            </p>
          ) : (
            <p className="text-sm font-medium text-text-quaternary">{t('dashboard.vat.branchScoped')}</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-sm bg-primary-25 px-3.5 py-2.5">
              <p className="text-sm font-medium text-text-quaternary">{t('dashboard.vat.output')}</p>
              <OmAmount
                size="sm"
                amount={omr(vat.data.output)}
                className="mt-1"
                amountClassName="text-base font-semibold text-text-primary"
              />
            </div>
            <div className="rounded-sm bg-primary-25 px-3.5 py-2.5">
              <p className="text-sm font-medium text-text-quaternary">{t('dashboard.vat.input')}</p>
              {omr(vat.data.input) !== null ? (
                <OmAmount
                  size="sm"
                  amount={omr(vat.data.input)}
                  className="mt-1"
                  amountClassName="text-base font-semibold text-text-primary"
                />
              ) : (
                <p className="mt-1 text-base font-semibold text-text-primary">—</p>
              )}
            </div>
          </div>
        </>
      )}
    </DashboardCard>
  )
}
