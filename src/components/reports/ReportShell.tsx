import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Modal, Popover } from '../ui'
import { PermissionDeniedNotice } from '../feedback/ApiNotice'
import { downloadReport } from '../../api/reports/reports'
import { saveDownload } from '../../lib/supplierRecord'
import { REPORT_PERIODS } from '../../lib/reportPeriod'
import { useReportPeriod } from './useReportPeriod'
import chevronIcon from '../../assets/invoices/chevron.svg'
import chevronDownIcon from '../../assets/create-invoice/chevron.svg'
import exportIcon from '../../assets/bill-capture/file.svg'
import expandIcon from '../../assets/reports/expand.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import upIcon from '../../assets/reports/trend-up.svg'
import downIcon from '../../assets/reports/trend-down.svg'

/**
 * The frame every Reports screen sits in (Figma 154:105575 and its five siblings).
 *
 * All six share a breadcrumb, the period pill, "Export as PDF" and then either a row of four
 * figures over a grid of four charts, or the Lists page's sections, so the chrome lives here and
 * each page supplies only what makes it different.
 *
 * The pill is the reader's window: the four figures and the ranked cards cover it, and each
 * figure's pill compares it with the window of equal length before. It lives in the URL
 * (`?period=`) so a shared link opens on the same view. The export prints the page (the browser's
 * "Save as PDF"); a page whose report has server exports lists them under it as well, for the
 * same window the page shows.
 */

/** A server export offered under "Export as PDF", for the window on screen. */
export type ReportDownload = {
  /** `csv` or `xlsx`; names the menu item. */
  format: 'csv' | 'xlsx'
  path: string
  /** File name when the server names none. */
  name: string
}

export function ReportShell({
  titleKey,
  subtitleKey,
  downloads = [],
  denied = false,
  children,
}: {
  titleKey: string
  subtitleKey: string
  downloads?: ReportDownload[]
  /**
   * The reader holds none of the permissions the page's reads take (`useReportReads`): the notice
   * the 403 drew stands in for the page, which asked nothing.
   */
  denied?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [period, setPeriod] = useReportPeriod()
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef<HTMLButtonElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<'failed' | 'truncated' | null>(null)

  const print = () => {
    setExportOpen(false)
    // TODO(backend): no server PDF of a report exists; the browser's print gives "Save as PDF".
    window.print()
  }

  const download = async (item: ReportDownload) => {
    setExportOpen(false)
    setBusy(item.format)
    setNotice(null)
    try {
      const file = await downloadReport(item.path)
      // A capped export says so in a header, since nothing inside the file does.
      if (file.headers.get('X-Fawtir-Export-Truncated') === 'true') setNotice('truncated')
      saveDownload(file, `${item.name}.${item.format}`)
    } catch {
      // The report is on screen and still readable, so a failed export is a line under the
      // header rather than a notice that replaces the page.
      setNotice('failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <AppShell>
      <div className="flex w-full max-w-[1138px] flex-col gap-4 pb-10 md:px-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[760px]">
            <div className="flex flex-wrap items-center gap-[11px]">
              <Link
                to="/reports/income"
                className="text-[30px] font-medium leading-[1.2] tracking-[-0.45px] text-[#8a8e96] hover:text-primary-700 max-md:text-2xl"
              >
                {t('reports.title')}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
              <h1 className="text-[30px] font-semibold leading-[1.2] tracking-[-0.45px] text-[#151c2d] max-md:text-2xl">
                {t(titleKey)}
              </h1>
            </div>
            <p className="pt-[7px] text-[14.5px] font-medium leading-[21.75px] text-[#494d56]">
              {t(subtitleKey)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <button
              ref={periodRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={periodOpen}
              onClick={() => setPeriodOpen((open) => !open)}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t(`reports.periods.${period}`)}
              <img src={chevronDownIcon} alt="" className="size-5 rotate-90 brightness-0 invert" />
            </button>
            <Popover
              anchorRef={periodRef}
              open={periodOpen}
              onClose={() => setPeriodOpen(false)}
              width={180}
            >
              <ul role="menu" className="py-1.5">
                {REPORT_PERIODS.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={option === period}
                      onClick={() => {
                        setPeriod(option)
                        setPeriodOpen(false)
                      }}
                      className={[
                        'flex w-full px-4 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25',
                        option === period ? 'text-primary-700' : 'text-text-secondary',
                      ].join(' ')}
                    >
                      {t(`reports.periods.${option}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </Popover>

            <button
              ref={exportRef}
              type="button"
              disabled={busy !== null}
              aria-haspopup={downloads.length > 0 ? 'menu' : undefined}
              aria-expanded={downloads.length > 0 ? exportOpen : undefined}
              onClick={() => (downloads.length > 0 ? setExportOpen((open) => !open) : print())}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-[#d0d2d5] bg-white px-5 text-[15px] font-medium text-[#494d56] transition-colors hover:bg-primary-25 disabled:opacity-60"
            >
              <img src={exportIcon} alt="" className="size-[17px]" />
              {busy ? t('common.saving') : t('reports.exportPdf')}
            </button>
            <Popover
              anchorRef={exportRef}
              open={exportOpen}
              onClose={() => setExportOpen(false)}
              width={220}
              align="end"
            >
              <ul role="menu" className="py-1.5">
                <li>
                  <MenuItem
                    label={t('reports.export.pdf')}
                    hint={t('reports.export.pdfHint')}
                    onClick={print}
                  />
                </li>
                {downloads.map((item) => (
                  <li key={item.format}>
                    <MenuItem
                      label={t(`reports.export.${item.format}`)}
                      hint={t('reports.export.fileHint')}
                      onClick={() => void download(item)}
                    />
                  </li>
                ))}
              </ul>
            </Popover>
          </div>
        </div>

        {notice ? (
          <p
            role="alert"
            className={[
              'rounded-md p-3 text-sm font-medium',
              notice === 'failed'
                ? 'bg-warning-100 text-warning-700'
                : 'bg-pending-100 text-pending-700',
            ].join(' ')}
          >
            {t(notice === 'failed' ? 'reports.controls.exportFailed' : 'reports.export.truncated')}
          </p>
        ) : null}

        {denied ? <PermissionDeniedNotice /> : children}
      </div>
    </AppShell>
  )
}

function MenuItem({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full flex-col px-4 py-2.5 text-start transition-colors hover:bg-primary-25"
    >
      <span className="text-sm font-semibold text-text-secondary">{label}</span>
      <span className="text-xs font-medium text-text-quaternary">{hint}</span>
    </button>
  )
}

/* ---------------------------------------------------------------- figures */

/** One of the four figures across the top of a report. */
export function KpiCard({
  label,
  value,
  /** Shows the rial sign before the figure, as the money cards do. */
  currency,
  change,
  note,
  pending,
}: {
  label: string
  value: string
  currency?: boolean
  /** The value is a sentence saying the figure is not reported yet. */
  pending?: boolean
  /** The tinted pill: a direction and an amount, or a plain word like "Steady". */
  change?: { text: string; direction: 'up' | 'down' | 'flat' } | null
  note: ReactNode
}) {
  const tone =
    change?.direction === 'down'
      ? 'bg-danger-100 text-danger-700'
      : change?.direction === 'flat'
        ? 'bg-[#f1f2f4] text-[#494d56]'
        : 'bg-[#e6efea] text-[#4c6c5a]'

  return (
    <article className="min-w-0 rounded-sm bg-surface-card p-5">
      <h3 className="text-[13px] font-semibold leading-[16px] text-[#494d56]">{label}</h3>
      {pending ? (
        // A figure the platform does not report yet: the card keeps its place and says so, in
        // a quieter type than a real figure so the two are never confused.
        <p className="mt-[11px] flex h-[30px] items-center text-base font-semibold text-[#8a8e96]">
          {value}
        </p>
      ) : (
        <p className="mt-[11px] flex h-[30px] items-center gap-1 text-[25px] font-semibold tracking-[-0.375px] text-[#151c2d] tabular-nums">
          {currency ? <img src={omrRowIcon} alt="" className="h-auto w-[24px] shrink-0" /> : null}
          <span className="min-w-0 truncate">{value}</span>
        </p>
      )}
      <p className="mt-[9px] flex min-h-[22px] flex-wrap items-center gap-[7px]">
        {change ? (
          <span
            className={[
              'inline-flex h-[22px] items-center gap-1 rounded-sm px-[7px] text-[12.5px] font-semibold',
              tone,
            ].join(' ')}
          >
            {change.direction === 'flat' ? null : (
              <img src={change.direction === 'up' ? upIcon : downIcon} alt="" className="size-[11px]" />
            )}
            {change.text}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#8a8e96]">{note}</span>
      </p>
    </article>
  )
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div>
}

/* ----------------------------------------------------------- chart cards */

export type LegendEntry = { label: ReactNode; color: string }

function Legend({ legend }: { legend: LegendEntry[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-5">
      {legend.map((entry, index) => (
        <li key={index} className="flex items-center gap-[7px]">
          <span className="size-[11px] rounded-[3px]" style={{ backgroundColor: entry.color }} />
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#8a8e96]">
            {entry.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A titled chart with its legend and closing remark.
 *
 * The footer is one row in the design: the series keys on the start side, a single sentence
 * about what the chart shows on the end side. The corner button opens the chart on its own, at
 * the size of a dialog, which is where it can be printed or read closely.
 */
export function ChartCard({
  title,
  legend,
  note,
  children,
}: {
  title: string
  legend: LegendEntry[]
  note: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-sm bg-surface-card">
      <div className="flex items-center justify-between gap-3 border-b border-[#e8e8ea] px-5 py-4">
        <h2 className="text-xs font-bold uppercase tracking-[1.2px] text-primary-700">
          {title}
        </h2>
        <button
          type="button"
          aria-label={t('reports.expand')}
          onClick={() => setOpen(true)}
          className="inline-flex size-8 items-center justify-center rounded-sm border border-[#e8e8ea] bg-white transition-colors hover:bg-primary-25"
        >
          <img src={expandIcon} alt="" className="size-[15px]" />
        </button>
      </div>

      <div className="flex min-h-[284px] flex-1 items-center p-5 max-md:min-h-0">
        {children}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-[#e8e8ea] bg-[#fafafa] px-5 pb-4 pt-3">
        <Legend legend={legend} />
        <p className="text-[12.5px] font-medium text-[#8a8e96]">{note}</p>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={title} width={960}>
        <div className="flex flex-col gap-5 px-6 py-6">
          <div className="flex items-center">{children}</div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Legend legend={legend} />
            <p className="text-xs font-medium text-text-quaternary">{note}</p>
          </div>
        </div>
      </Modal>
    </section>
  )
}

export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-2">{children}</div>
}

/**
 * The chart area of a card whose figures the platform does not report yet. The card keeps its
 * place, title and legend, as the frame draws them, and says plainly what it is waiting for.
 */
export function ChartPending({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] w-full items-center justify-center rounded-sm border border-dashed border-border-subtle bg-surface-background/50 px-6 text-center text-sm font-medium leading-[1.5] text-text-quaternary">
      {message}
    </div>
  )
}

/**
 * Prints a rial figure inside a footer sentence, sign and all.
 *
 * Children are optional because `Trans` clones this with the interpolated figure as its
 * children; written in JSX it is handed them directly.
 */
export function OmrNote({ children }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <img src={omrRowIcon} alt="" className="h-auto w-3.5 shrink-0" />
      <span className="font-semibold text-[#151c2d] tabular-nums">{children}</span>
    </span>
  )
}

/** The rial sign alone, as a legend closes on it ("Invoiced this year, ⃁"). */
export function OmrSign() {
  return <img src={omrRowIcon} alt="" className="h-auto w-3.5 shrink-0" />
}
