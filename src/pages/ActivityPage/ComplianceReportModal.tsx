import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateField, Modal, withRial } from '../../components/ui'
import { useApiRead } from '../../hooks'
import {
  activitySummaryPath,
  loadActivitySummary,
  type ActivitySummaryDto,
} from '../../api/compliance/activity'
import { deliveredCount, shareOf1 } from '../../lib/activityLedger'
import {
  REPORT_PERIODS,
  REPORT_SECTIONS,
  periodFigures,
  periodRange,
  formatOmr,
  type ReportPeriodId,
} from '../../lib/complianceReport'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'
import pdfIcon from '../../assets/invoice-details/pdf.svg'
import excelIcon from '../../assets/reports/list-catalog.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import reportShieldIcon from '../../assets/activity/report-shield.svg'

/** What "Build Report" asks for: the period's window and the formats ticked. */
export type ReportRequest = {
  period: ReportPeriodId
  from: string
  to: string
  formats: ('pdf' | 'excel')[]
}

/**
 * "Compliance report" (Figma 154:111604), opened from Activity's "Compliance report" button.
 *
 * Builds the pack an auditor or the Authority asks for. Everything in the summary follows from
 * the period chosen, so switching from a quarter to a year moves the counts and the money with
 * it rather than leaving a stale figure behind.
 */
export function ComplianceReportModal({
  open,
  onClose,
  onBuild,
}: {
  open: boolean
  onClose: () => void
  onBuild: (request: ReportRequest) => void
}) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<ReportPeriodId>('quarter')
  const [sections, setSections] = useState<string[]>(
    REPORT_SECTIONS.filter((section) => section.defaultOn && !section.always).map((s) => s.id),
  )
  // Both, as the frame opens: the signed PDF for the auditor and the ledger for whoever checks it.
  const [formats, setFormats] = useState<('pdf' | 'excel')[]>(['pdf', 'excel'])

  const [custom, setCustom] = useState(() => {
    const quarter = periodRange('quarter')
    return { from: quarter.from, to: quarter.to }
  })
  const range = useMemo(() => periodRange(period, new Date(), custom), [period, custom])
  // The period's counts come from the ledger summary for that window. TODO(backend): the
  // corrected count, the total invoiced and the VAT are not on the summary (asks row 2.9), so
  // those three stay the design's figures until they are.
  const summaryPath = open ? activitySummaryPath(range.from, range.to) : null
  const summary = useApiRead<ActivitySummaryDto>(summaryPath, () =>
    loadActivitySummary(summaryPath as string),
  )
  const figures = useMemo(() => {
    const base = periodFigures(period)
    if (summary.read.status !== 'ready') return base
    const book = summary.read.data
    const accepted = deliveredCount(book.tdd_ack)
    return {
      ...base,
      invoices: book.documents,
      accepted,
      acceptedRate: shareOf1(accepted, book.documents),
      notReported: book.tdd_ack.re + book.tdd_ack.none,
    }
  }, [period, summary.read])

  const toggleSection = (id: string) =>
    setSections((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )

  const toggleFormat = (id: 'pdf' | 'excel') =>
    setFormats((current) => {
      if (current.includes(id))
        return current.length > 1 ? current.filter((x) => x !== id) : current
      return [...current, id]
    })

  const formatLabel = formats
    .map((id) => t(`complianceReport.format.${id}`))
    .join(t('complianceReport.and'))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('complianceReport.title')}
      icon={reportShieldIcon}
      width={660}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-text-tertiary">
            <span className="font-semibold text-text-primary">
              {t(range.labelKey, range.values)}
            </span>{' '}
            ·{' '}
            <span className="font-semibold text-text-primary">
              {t('complianceReport.nInvoices', { count: figures.invoices })}
            </span>{' '}
            · {formatLabel}
          </p>
          <button
            type="button"
            onClick={() => onBuild({ period, from: range.from, to: range.to, formats })}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={downloadIcon} alt="" className="size-5 brightness-0 invert" />
            {t('complianceReport.build')}
          </button>
        </div>
      }
    >
      {/* Period */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {t('complianceReport.whichPeriod')}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {REPORT_PERIODS.map((entry) => {
          const active = entry.id === period
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setPeriod(entry.id)}
              aria-pressed={active}
              className={[
                'inline-flex h-[46px] items-center justify-center rounded-sm border text-sm font-medium transition-colors',
                active
                  ? 'border-primary-700 bg-primary-25 text-primary-700'
                  : 'border-border-subtle bg-white text-text-secondary hover:border-primary-300',
              ].join(' ')}
            >
              {entry.id === 'quarter'
                ? t('complianceReport.period.quarter', periodRange('quarter').values)
                : t(entry.labelKey)}
            </button>
          )
        })}
      </div>

      {/* The frame draws no control for Custom; two date fields, only once it is chosen. */}
      {period === 'custom' ? (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <DateField
            value={custom.from}
            max={custom.to}
            ariaLabel={t('complianceReport.customFrom')}
            onChange={(from) => setCustom((current) => ({ ...current, from }))}
          />
          <DateField
            value={custom.to}
            min={custom.from}
            ariaLabel={t('complianceReport.customTo')}
            onChange={(to) => setCustom((current) => ({ ...current, to }))}
          />
        </div>
      ) : null}

      {/* Sections */}
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {t('complianceReport.whatGoesIn')}
      </p>
      <ul className="mt-3 overflow-hidden rounded-sm border border-border-subtle">
        {REPORT_SECTIONS.map((section, index) => {
          const checked = section.always || sections.includes(section.id)
          return (
            <li key={section.id}>
              <button
                type="button"
                disabled={section.always}
                onClick={() => toggleSection(section.id)}
                aria-pressed={checked}
                className={[
                  'flex w-full items-start gap-3 p-4 text-start transition-colors',
                  index > 0 ? 'border-t border-border-subtle' : '',
                  section.always
                    ? 'cursor-default bg-surface-background/50'
                    : 'bg-white hover:bg-primary-25',
                ].join(' ')}
              >
                <span
                  className={[
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] border',
                    section.always
                      ? 'border-border-default bg-border-default'
                      : checked
                        ? 'border-primary-700 bg-primary-700'
                        : 'border-border-default bg-white',
                  ].join(' ')}
                >
                  {checked ? <img src={tickIcon} alt="" className="size-3" /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-[1.3] text-text-primary">
                    {t(section.titleKey)}
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t(section.noteKey, section.values)}
                  </span>
                </span>

                {section.always ? (
                  <span className="shrink-0 rounded-sm bg-surface-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                    {t('complianceReport.always')}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {/* Format */}
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {t('complianceReport.formatLabel')}
      </p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {(
          [
            { id: 'pdf', icon: pdfIcon, tile: 'bg-[#fdf4f2]' },
            { id: 'excel', icon: excelIcon, tile: 'bg-success-100' },
          ] as const
        ).map((entry) => {
          const active = formats.includes(entry.id)
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => toggleFormat(entry.id)}
              aria-pressed={active}
              className={[
                'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors',
                active
                  ? 'border-primary-700 bg-primary-25'
                  : 'border-border-subtle bg-white hover:border-primary-300',
              ].join(' ')}
            >
              <span
                className={[
                  'flex size-9 shrink-0 items-center justify-center rounded-sm',
                  entry.tile,
                ].join(' ')}
              >
                <img src={entry.icon} alt="" className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-[1.3] text-text-primary">
                  {t(`complianceReport.format.${entry.id}`)}
                </span>
                <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t(`complianceReport.formatNote.${entry.id}`)}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Summary */}
      <div className="mt-5 rounded-sm bg-surface-background p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-primary-700">
          {t('complianceReport.whatYoullGet')}
        </p>
        <dl className="mt-3 flex flex-col gap-2.5">
          <SummaryRow
            label={t('complianceReport.summary.invoices')}
            value={String(figures.invoices)}
          />
          <SummaryRow
            label={t('complianceReport.summary.accepted')}
            value={`${figures.accepted} · ${figures.acceptedRate}%`}
            tone="text-[#3d5648]"
          />
          <SummaryRow
            label={t('complianceReport.summary.correctedAfterRejection')}
            value={String(figures.corrected)}
          />
          <SummaryRow
            label={t('complianceReport.summary.stillNotReported')}
            value={String(figures.notReported)}
            tone={figures.notReported > 0 ? 'text-pending-700' : undefined}
          />
          <SummaryRow
            label={t('complianceReport.summary.totalInvoiced')}
            value={`OMR ${formatOmr(figures.netInvoiced)}`}
          />
          <SummaryRow
            label={t('complianceReport.summary.vatReported')}
            value={`OMR ${formatOmr(figures.vat)}`}
          />
        </dl>
      </div>
    </Modal>
  )
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd
        className={[
          'shrink-0 text-sm font-semibold tabular-nums',
          tone ?? 'text-text-primary',
        ].join(' ')}
      >
        {withRial(value)}
      </dd>
    </div>
  )
}
