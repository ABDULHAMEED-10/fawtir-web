import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi } from './CatalogShell'
import { FilterMenu, Pager, Rial } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { formatDate } from '../../lib/format'
import { lastDays, omr } from '../../lib/catalogRules'
import { muscatToday } from '../../lib/pos'
import { saveDownload } from '../../lib/supplierRecord'
import {
  downloadPriceRuleReport,
  loadPriceRule,
  loadPriceRuleLines,
  loadPriceRuleReport,
  priceRuleLinesPath,
  priceRulePath,
  priceRuleReportPath,
  type PriceRuleDto,
  type PriceRuleLinesDto,
  type PriceRuleReportDto,
} from '../../api/catalog/priceRules'
import { SECONDARY } from './PriceRuleParts'
import { usePriceRuleAccess, usePriceRuleFailureText } from './priceRuleAccess'
import kpiPercentIcon from '../../assets/catalog/kpi-percent.svg'
import kpiUpIcon from '../../assets/catalog/arrow-up.svg'
import kpiEarningIcon from '../../assets/catalog/kpi-earning.svg'
import kpiClockIcon from '../../assets/catalog/clock.svg'

type PeriodFilter = '30' | '90' | '365'
const LINES_PAGE_SIZE = 50

const TH = 'h-[38px] whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-[0.5px]'
const TD = 'px-3 py-2.5 text-sm font-medium text-text-secondary'

function PeriodMenu({
  value,
  onChange,
}: {
  value: PeriodFilter
  onChange: (v: PeriodFilter) => void
}) {
  const { t } = useTranslation()
  return (
    <FilterMenu<PeriodFilter>
      label={t('priceRules.filter.period')}
      value={value}
      defaultValue="90"
      onChange={onChange}
      options={(['30', '90', '365'] as PeriodFilter[]).map((v) => ({
        value: v,
        label: t('priceRules.filter.lastDays', { count: Number(v) }),
      }))}
    />
  )
}

/**
 * The price rules report (`GET /v1/price-rules/report`, CSV at `report.csv`): what each rule gave
 * away and brought in over the period, issued invoices less their credit notes, in the user's
 * branches. Most given away first, as the server orders it.
 */
export function PriceRuleReportPage() {
  const { t, i18n } = useTranslation()
  const access = usePriceRuleAccess()
  const failureText = usePriceRuleFailureText()
  const [period, setPeriod] = useState<PeriodFilter>('90')
  const [problem, setProblem] = useState<string | null>(null)
  const { from, to } = lastDays(Number(period), muscatToday())
  const path = access.canRead ? priceRuleReportPath({ from, to }) : null
  const report = useApiRead<PriceRuleReportDto>(path, () => loadPriceRuleReport(path!))

  const exportReport = async () => {
    setProblem(null)
    try {
      saveDownload(await downloadPriceRuleReport({ from, to }), `price-rules-${from}-${to}.csv`)
    } catch (error) {
      setProblem(failureText(error))
    }
  }

  const shell = (body: React.ReactNode) => (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'priceRules.title', to: '/catalog/rules' },
        { labelKey: 'priceRules.report.title' },
      ]}
      title={t('priceRules.report.title')}
      subtitle={t('priceRules.report.subtitle', {
        from: formatDate(from, i18n.language),
        to: formatDate(to, i18n.language),
      })}
      actions={
        access.canRead ? (
          <button type="button" onClick={exportReport} className={SECONDARY}>
            {t('priceRules.report.export')}
          </button>
        ) : undefined
      }
    >
      {body}
    </CatalogShell>
  )

  if (!access.ready) return shell(<LoadingNotice />)
  if (!access.canRead) return shell(<PermissionDeniedNotice />)
  if (report.read.status === 'loading') return shell(<LoadingNotice />)
  if (report.read.status === 'failed')
    return shell(<ApiReadFailure error={report.read.error} retry={report.retry} />)
  const data = report.read.data

  return shell(
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiPercentIcon}
          label={t('priceRules.kpi.rules')}
          value={String(data.totals.rules)}
          note={t('priceRules.report.period', { count: Number(period) })}
        />
        <Kpi
          icon={kpiUpIcon}
          tint="bg-success-100"
          label={t('priceRules.kpi.givenAway')}
          value={omr(data.totals.givenAway)}
          currency
          note={
            data.totals.shareOfSalesPercent === null
              ? t('priceRules.kpi.givenAwayNoSales')
              : t('priceRules.kpi.givenAwayNote', {
                  share: Number(data.totals.shareOfSalesPercent.toFixed(1)),
                })
          }
        />
        <Kpi
          icon={kpiEarningIcon}
          label={t('priceRules.kpi.broughtIn')}
          value={omr(data.totals.broughtIn)}
          currency
          note={t('priceRules.kpi.broughtInNote', {
            count: data.totals.used.toLocaleString('en-US'),
          })}
        />
        <Kpi
          icon={kpiClockIcon}
          solidIcon
          tone="pending"
          label={t('priceRules.kpi.runningNow')}
          value={String(data.totals.runningNow)}
          note={t('priceRules.report.runningNowNote')}
        />
      </div>

      <section className="rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('priceRules.report.byRule')}
          </h2>
          <PeriodMenu value={period} onChange={setPeriod} />
        </div>
        {problem ? (
          <p
            role="alert"
            className="mx-5 mb-4 rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
          >
            {problem}
          </p>
        ) : null}
        {data.rules.length === 0 ? (
          <p className="p-5 pt-0 text-sm font-medium text-text-tertiary">
            {t('priceRules.report.none')}
          </p>
        ) : (
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="bg-[#151c2d] text-white">
                  <th className={`${TH} text-start`}>{t('priceRules.report.col.rule')}</th>
                  <th className={`${TH} text-start`}>{t('priceRules.report.col.state')}</th>
                  <th className={`${TH} text-end`}>{t('priceRules.report.col.used')}</th>
                  <th className={`${TH} text-end`}>{t('priceRules.report.col.givenAway')}</th>
                  <th className={`${TH} text-end`}>{t('priceRules.report.col.broughtIn')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rules.map((row) => (
                  <tr key={row.ruleId} className="border-b border-surface-background">
                    <td className={TD}>
                      <Link
                        to={`/catalog/rules/${row.ruleId}/sales`}
                        className="font-semibold text-primary-700 hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="block text-xs text-text-quaternary">
                        {t(`priceRules.kindName.${row.kind}`)}
                      </span>
                    </td>
                    <td className={TD}>
                      {row.archived
                        ? t('priceRules.archived')
                        : row.runningNow
                          ? t('priceRules.onRightNow')
                          : row.enabled
                            ? t('priceRules.running')
                            : t('priceRules.switchedOff')}
                    </td>
                    <td className={`${TD} text-end tabular-nums`}>
                      {row.used.toLocaleString('en-US')}
                    </td>
                    <td className={`${TD} text-end tabular-nums`}>
                      <Rial /> {omr(row.givenAway)}
                    </td>
                    <td className={`${TD} text-end tabular-nums`}>
                      <Rial /> {omr(row.broughtIn)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={`${TD} font-semibold text-text-primary`} colSpan={2}>
                    {t('priceRules.report.total')}
                  </td>
                  <td className={`${TD} text-end font-semibold tabular-nums`}>
                    {data.totals.used.toLocaleString('en-US')}
                  </td>
                  <td className={`${TD} text-end font-semibold tabular-nums`}>
                    <Rial /> {omr(data.totals.givenAway)}
                  </td>
                  <td className={`${TD} text-end font-semibold tabular-nums`}>
                    <Rial /> {omr(data.totals.broughtIn)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>,
  )
}

/**
 * The invoice lines behind one rule (`GET /v1/price-rules/{id}/lines`), newest first. Credit-note
 * lines are negative, so a period's lines add up to the report. TODO(backend): there is no CSV of
 * one rule's lines; Export takes the report's CSV (INCOME.md row P.37).
 */
export function PriceRuleSalesPage() {
  const { t, i18n } = useTranslation()
  const { ruleId = '' } = useParams()
  const access = usePriceRuleAccess()
  const [period, setPeriod] = useState<PeriodFilter>('90')
  const [page, setPage] = useState(0)
  const { from, to } = lastDays(Number(period), muscatToday())
  const rulePath = access.canRead ? priceRulePath(ruleId, { from, to }) : null
  const rule = useApiRead<PriceRuleDto>(rulePath, () => loadPriceRule(rulePath!))
  const linesPath = access.canRead
    ? priceRuleLinesPath(ruleId, { from, to, page, size: LINES_PAGE_SIZE })
    : null
  const lines = useApiRead<PriceRuleLinesDto>(linesPath, () => loadPriceRuleLines(linesPath!))
  const name = rule.read.status === 'ready' ? rule.read.data.name : ''

  const shell = (body: React.ReactNode) => (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'priceRules.title', to: '/catalog/rules' },
        { labelKey: 'priceRules.sales.crumb' },
      ]}
      title={name ? t('priceRules.sales.title', { name }) : t('priceRules.sales.crumb')}
      subtitle={t('priceRules.report.subtitle', {
        from: formatDate(from, i18n.language),
        to: formatDate(to, i18n.language),
      })}
    >
      {body}
    </CatalogShell>
  )

  if (!access.ready) return shell(<LoadingNotice />)
  if (!access.canRead) return shell(<PermissionDeniedNotice />)
  if (rule.read.status === 'failed')
    return shell(<ApiReadFailure error={rule.read.error} retry={rule.retry} />)
  if (lines.read.status === 'failed')
    return shell(<ApiReadFailure error={lines.read.error} retry={lines.retry} />)
  if (lines.read.status === 'loading') return shell(<LoadingNotice />)
  const data = lines.read.data
  const pageCount = Math.max(1, Math.ceil(data.total / data.size))

  return shell(
    <section className="rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <h2 className="text-lg font-semibold text-text-primary">
          {t('priceRules.sales.count', { count: data.total })}
        </h2>
        <PeriodMenu
          value={period}
          onChange={(next) => {
            setPeriod(next)
            setPage(0)
          }}
        />
      </div>
      {data.items.length === 0 ? (
        <p className="p-5 pt-0 text-sm font-medium text-text-tertiary">
          {t('priceRules.sales.none')}
        </p>
      ) : (
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="bg-[#151c2d] text-white">
                <th className={`${TH} text-start`}>{t('priceRules.sales.col.invoice')}</th>
                <th className={`${TH} text-start`}>{t('priceRules.sales.col.date')}</th>
                <th className={`${TH} text-start`}>{t('priceRules.sales.col.line')}</th>
                <th className={`${TH} text-end`}>{t('priceRules.report.col.givenAway')}</th>
                <th className={`${TH} text-end`}>{t('priceRules.sales.col.taxable')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((line) => (
                <tr
                  key={`${line.invoiceId}-${line.lineNumber}`}
                  className="border-b border-surface-background"
                >
                  <td className={TD}>
                    <Link
                      to={`/invoices/${line.invoiceId}`}
                      dir="ltr"
                      className="font-semibold text-primary-700 hover:underline"
                    >
                      {line.invoiceNumber}
                    </Link>
                    <span className="block text-xs text-text-quaternary">
                      <bdi>{line.branchName}</bdi>
                    </span>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {formatDate(line.issueDate, i18n.language)}
                  </td>
                  <td className={TD}>
                    {line.lineNumber}. {line.description}
                  </td>
                  <td className={`${TD} text-end tabular-nums`}>
                    <Rial /> {omr(line.givenAway)}
                  </td>
                  <td className={`${TD} text-end tabular-nums`}>
                    <Rial /> {omr(line.taxable)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageCount > 1 ? (
            <div className="mt-4">
              <Pager
                page={page + 1}
                pageCount={pageCount}
                onChange={(next) => setPage(next - 1)}
                labels={{
                  nav: t('priceRules.sales.pages'),
                  previous: t('priceRules.sales.previous'),
                  next: t('priceRules.sales.next'),
                }}
              />
            </div>
          ) : null}
        </div>
      )}
    </section>,
  )
}
