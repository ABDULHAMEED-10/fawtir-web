import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, Modal, OmAmount, Popover, RowsView } from '../../components/ui'
import { OverpaidBy } from '../../components/bills'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import {
  downloadSupplierStatement,
  emailSupplierStatement,
  loadSupplierOverview,
  loadSupplierStatement,
  supplierOverviewPath,
  supplierStatementPath,
  type StatementEntryKind,
  type StatementFormat,
  type SupplierOverviewDto,
  type SupplierStatementDto,
} from '../../api/expenditure/supplierRecord'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstant } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { addressLine, saveDownload, termsNote } from '../../lib/supplierRecord'
import {
  AGEING_BUCKETS,
  PERIODS,
  ageingNote,
  everLateOf,
  columnsOf,
  customRangeProblem,
  STATEMENT_EMAIL_REFUSALS,
  emailBlocker,
  entryLink,
  entryOpen,
  memoAmountOf,
  issuerAddress,
  periodRange,
  periodTotals,
  type Period,
} from '../../lib/supplierStatement'
import chevronIcon from '../../assets/invoices/chevron.svg'
import chevronDownIcon from '../../assets/create-invoice/chevron.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import mailIcon from '../../assets/suppliers/chip-email.svg'

/**
 * The later kinds take the tone of the kind they move like: a discount lowers what was billed as
 * a credit does, a supplier's refund (of an overpayment or of a credit note) gives something back
 * as a reversal does, and credit used on another bill moves nothing, so it is as plain as a bill.
 */
const KIND_CHIP: Record<StatementEntryKind, string> = {
  BILL: 'bg-surface-background text-text-tertiary',
  CREDIT_NOTE: 'bg-pending-100 text-pending-700',
  PAYMENT: 'bg-success-100 text-[#3d5648]',
  REVERSAL: 'bg-warning-100 text-[#6d5a39]',
  DISCOUNT: 'bg-pending-100 text-pending-700',
  OVERPAYMENT_REFUND: 'bg-warning-100 text-[#6d5a39]',
  OVERPAYMENT_CREDIT_APPLIED: 'bg-surface-background text-text-tertiary',
  CREDIT_NOTE_REFUND: 'bg-warning-100 text-[#6d5a39]',
}

const BUCKET_TONE = [
  'border-[#4c6c5a]',
  'border-[#6d5a39]',
  'border-pending-200',
  'border-warning-700',
]

const muscatToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

/**
 * `/suppliers/:slug/statement` (Suppliers › Statement, Figma 163:28602); the list and the
 * supplier page link by id.
 *
 * Every figure is the server's: the running balance, the period totals and the closing balance
 * come from `GET /suppliers/{id}/statement`, and the downloads and the e-mail are asked for the
 * same period, so the page and the files it hands over cannot disagree.
 */
export function SupplierStatementPage() {
  const { slug = '' } = useParams()
  return (
    <AppShell>
      <SupplierStatement key={slug} id={slug} />
    </AppShell>
  )
}

function SupplierStatement({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'supplier.manage')
  const today = muscatToday()
  const [period, setPeriod] = useState<Period>('year')
  const [range, setRange] = useState(() => periodRange('year', today))
  const [custom, setCustom] = useState(range)
  const [customProblem, setCustomProblem] = useState<string | null>(null)
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef<HTMLButtonElement>(null)
  const [notice, setNotice] = useState<
    { key: string; values?: Record<string, string> } | { body: string } | null
  >(null)
  const [emailing, setEmailing] = useState(false)

  const supplier = useApiRead<SupplierDetailDto>(supplierPath(id), () => loadSupplier(id))
  const path = supplierStatementPath(id, range.from, range.to)
  const statement = useApiRead<SupplierStatementDto>(path, () => loadSupplierStatement(path))
  // Whether they were ever paid late is on the supplier's overview, not on the statement: read
  // for the ageing strip's "Never been late with them". If it cannot be read the strip says less.
  const overview = useApiRead<SupplierOverviewDto>(supplierOverviewPath(id), () =>
    loadSupplierOverview(id),
  )
  // When the figures were read, for "Prepared": a new period is a new statement.
  const preparedAt = useMemo(
    () => (statement.read.status === 'ready' ? new Date().toISOString() : null),
    [statement.read],
  )

  if (supplier.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {supplier.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={supplier.read.error} retry={supplier.retry} />
        )}
      </div>
    )
  }

  const record = supplier.read.data
  const profile = record.profile
  const name = profile.legalName ?? profile.displayName
  const day = (value: string) => formatDate(value, language)
  const blocker = emailBlocker(profile, canManage)

  const failed = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice({
      body: message.reference
        ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
        : body,
    })
  }

  const choose = (next: Period) => {
    setPeriodOpen(false)
    setPeriod(next)
    setCustomProblem(null)
    if (next === 'custom') {
      setCustom(range)
      return
    }
    setRange(periodRange(next, today))
  }

  const applyCustom = () => {
    const problem = customRangeProblem(custom.from, custom.to, today)
    setCustomProblem(problem)
    if (!problem) setRange(custom)
  }

  const fileName = (format: StatementFormat) =>
    `statement-${profile.displayName}-${range.from}-${range.to}.${format}`

  const download = async (format: StatementFormat) => {
    setNotice(null)
    try {
      saveDownload(
        await downloadSupplierStatement(id, format, range.from, range.to),
        fileName(format),
      )
    } catch (error) {
      failed(error)
    }
  }

  // The tab is opened before the request, while the click still counts as the person's own:
  // a window opened after an await is a popup the browser may block.
  const print = async () => {
    setNotice(null)
    const tab = window.open('', '_blank')
    try {
      const file = await downloadSupplierStatement(id, 'pdf', range.from, range.to)
      if (tab) {
        tab.location.href = URL.createObjectURL(file.blob)
      } else {
        saveDownload(file, fileName('pdf'))
      }
    } catch (error) {
      tab?.close()
      failed(error)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/suppliers"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
            >
              {t('suppliersPage.title')}
            </Link>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            <Link
              to={`/suppliers/${id}`}
              className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
            >
              {profile.displayName}
            </Link>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            <span className="text-2xl font-medium leading-[1.2] text-text-primary">
              {t('supplierStatement.title')}
            </span>
          </div>
          <h1 className="mt-1 text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('supplierStatement.title')}
          </h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('supplierStatement.subtitle')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <button
            type="button"
            onClick={() => void print()}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={printIcon} alt="" className="size-5" />
            {t('supplierStatement.print')}
          </button>
          <button
            ref={periodRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={periodOpen}
            onClick={() => setPeriodOpen((open) => !open)}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t(`supplierStatement.period.${period}`)}
            <img src={chevronDownIcon} alt="" className="size-4 rotate-90 brightness-0 invert" />
          </button>
          <Popover anchorRef={periodRef} open={periodOpen} onClose={() => setPeriodOpen(false)}>
            <ul role="menu" className="w-[200px] py-1.5">
              {PERIODS.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => choose(option)}
                    className={[
                      'flex w-full px-4 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25',
                      option === period ? 'text-primary-700' : 'text-text-secondary',
                    ].join(' ')}
                  >
                    {t(`supplierStatement.period.${option}`)}
                  </button>
                </li>
              ))}
            </ul>
          </Popover>
        </div>
      </div>

      {period === 'custom' ? (
        <section className="flex flex-wrap items-end gap-3 rounded-md bg-surface-card p-4">
          <label className="flex min-w-[180px] flex-col gap-1.5 text-sm font-semibold text-text-secondary">
            {t('supplierStatement.customFrom')}
            <DateField
              value={custom.from}
              max={today}
              ariaLabel={t('supplierStatement.customFrom')}
              onChange={(from) => setCustom((current) => ({ ...current, from }))}
            />
          </label>
          <label className="flex min-w-[180px] flex-col gap-1.5 text-sm font-semibold text-text-secondary">
            {t('supplierStatement.customTo')}
            <DateField
              value={custom.to}
              max={today}
              ariaLabel={t('supplierStatement.customTo')}
              onChange={(to) => setCustom((current) => ({ ...current, to }))}
            />
          </label>
          <button
            type="button"
            onClick={applyCustom}
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('supplierStatement.apply')}
          </button>
          {customProblem ? (
            <p role="alert" className="w-full text-sm font-medium text-danger-700">
              {t(customProblem)}
            </p>
          ) : null}
        </section>
      ) : null}

      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key, notice.values) : notice.body}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {statement.read.status === 'loading' ? <LoadingNotice /> : null}
      {statement.read.status === 'failed' ? (
        <ApiReadFailure error={statement.read.error} retry={statement.retry} />
      ) : null}

      {statement.read.status === 'ready' ? body(statement.read.data) : null}

      <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-border-subtle bg-white/95 backdrop-blur lg:start-[248px]">
        <div className="mx-auto flex w-full max-w-[1176px] flex-wrap items-center justify-between gap-3 px-4 py-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary">
            {statement.read.status === 'ready' ? (
              <>
                <OmAmount
                  size="xs"
                  amount={formatAmount(
                    statement.read.data.closing,
                    statement.read.data.currencyCode,
                    language,
                  )}
                  amountClassName="font-semibold text-text-primary tabular-nums"
                />
                {t('supplierStatement.footer', { count: statement.read.data.entries.length })}
                {typeof statement.read.data.unusedCredits === 'number' &&
                statement.read.data.unusedCredits > 0
                  ? ` · ${t('supplierStatement.unusedCredits', { count: statement.read.data.unusedCredits })}`
                  : null}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            {/* The CSV export stays on the supplier page's Statement menu; the design's bar offers PDF and Excel. */}
            {(['pdf', 'xlsx'] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => void download(format)}
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t(`supplierStatement.download.${format}`)}
              </button>
            ))}
            {canManage ? (
              <button
                type="button"
                disabled={blocker !== null}
                title={blocker ? t(blocker) : undefined}
                onClick={() => setEmailing(true)}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
              >
                <img src={mailIcon} alt="" className="size-4 brightness-0 invert" />
                {t('supplierStatement.emailIt')}
              </button>
            ) : null}
          </div>
          {canManage && blocker ? (
            <p className="w-full text-end text-xs font-medium text-text-quaternary">{t(blocker)}</p>
          ) : null}
        </div>
      </div>

      {emailing ? (
        <EmailStatementModal
          supplierId={id}
          recipients={profile.emailRecipients ?? []}
          from={range.from}
          to={range.to}
          onClose={() => setEmailing(false)}
          onSent={(recipient) => {
            setEmailing(false)
            setNotice({ key: 'supplierStatement.email.sent', values: { recipient } })
          }}
        />
      ) : null}
    </div>
  )

  /** The statement itself, once it is here. A closure, not a component: it holds no state of its own. */
  function body(data: SupplierStatementDto) {
    const detail = record
    const supplierName = name
    const prepared = preparedAt
    const dayOf = day
    const money = (value: number) => formatAmount(value, data.currencyCode, language)
    const signed = (value: number) => `${value < 0 ? '−' : ''}${money(Math.abs(value))}`
    const totals = periodTotals(data)
    const issuer = data.issuer
    const issuerName = issuer
      ? language === 'ar' && issuer.legalNameAr
        ? issuer.legalNameAr
        : issuer.legalName
      : null
    const terms = termsNote(detail.profile.paymentTerms)
    const supplierFacts = [
      detail.profile.vatNumber
        ? t('supplierStatement.vat', { number: detail.profile.vatNumber })
        : null,
      detail.profile.participantId,
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="grid gap-6 p-6 md:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
              {t('supplierStatement.statementFor')}
            </p>
            <p className="mt-2 text-base font-semibold leading-[1.3] text-text-primary">
              {supplierName}
            </p>
            {supplierFacts ? (
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-tertiary">
                {supplierFacts}
              </p>
            ) : null}
            {addressLine(detail.invoiceAddress) ? (
              <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
                {addressLine(detail.invoiceAddress)}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
              {t('supplierStatement.issuedBy')}
            </p>
            <p className="mt-2 text-base font-semibold leading-[1.3] text-text-primary">
              {issuerName ?? '—'}
            </p>
            {issuer?.vatNumber ? (
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-tertiary">
                {t('supplierStatement.vat', { number: issuer.vatNumber })}
              </p>
            ) : null}
            {issuerAddress(issuer) ? (
              <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
                {issuerAddress(issuer)}
              </p>
            ) : null}
          </div>
          <div className="md:text-end">
            <p className="text-xl font-semibold leading-[1.2] text-text-primary">
              {dayOf(data.from)} – {dayOf(data.to)}
            </p>
            {prepared ? (
              <p className="mt-1.5 text-xs font-medium leading-[1.5] text-text-tertiary">
                {t('supplierStatement.prepared', { when: formatInstant(prepared, language) })}
              </p>
            ) : null}
            {terms ? (
              <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
                {t(terms.key, terms.values)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-y border-surface-background bg-surface-background/40 px-6 py-5">
          <Figure
            label={t('supplierStatement.owedOn', { date: dayOf(data.from) })}
            value={money(data.opening)}
          />
          <Operator>+</Operator>
          <Figure label={t('supplierStatement.theyBilledYou')} value={money(data.bills)} />
          <Operator>−</Operator>
          <Figure label={t('supplierStatement.youPaid')} value={money(data.payments)} />
          <Operator>−</Operator>
          <Figure label={t('supplierStatement.credits')} value={money(data.credits)} />
          {/* The two later totals, each only when the period has one, so the sum still reads
              to the closing balance. */}
          {(data.discounts ?? 0) > 0 ? (
            <>
              <Operator>−</Operator>
              <Figure
                label={t('supplierStatement.kind.DISCOUNT')}
                value={money(data.discounts ?? 0)}
              />
            </>
          ) : null}
          {(data.overpaymentRefunds ?? 0) > 0 ? (
            <>
              <Operator>+</Operator>
              <Figure
                label={t('supplierStatement.kind.OVERPAYMENT_REFUND')}
                value={money(data.overpaymentRefunds ?? 0)}
              />
            </>
          ) : null}
          <div className="ms-auto text-end">
            <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
              {t('supplierStatement.owedOn', { date: dayOf(data.to) })}
            </p>
            <OmAmount
              size="lg"
              amount={money(data.closing)}
              className="mt-1.5 justify-end"
              amountClassName="text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums"
            />
            {/* "Overpaid by" today (owner's answer 13, 8 Oct 2026), beside the closing balance
                and never read from it: the closing nets it against their other bills. */}
            {(data.overpaid ?? 0) > 0 ? (
              <p className="mt-1.5 text-sm font-semibold text-text-primary">
                <OverpaidBy amount={money(data.overpaid ?? 0)} />
              </p>
            ) : null}
          </div>
        </div>

        <RowsView>
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                {(['date', 'whatItWas', 'kind', 'theyBilled', 'youPaid', 'owedAfter'] as const).map(
                  (key, index) => (
                    <th
                      key={key}
                      className={[
                        'h-[46px] px-5 font-semibold',
                        index >= 3 ? 'text-end' : 'text-start',
                      ].join(' ')}
                    >
                      {t(`supplierStatement.col.${key}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-surface-background">
                <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">
                  {dayOf(data.from)}
                </td>
                <td className="px-5 py-4 align-top">
                  <p className="text-sm font-semibold text-text-primary">
                    {t('supplierStatement.broughtForward')}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('supplierStatement.broughtForwardNote')}
                  </p>
                </td>
                <td />
                <td />
                <td />
                <td className="px-5 py-4 align-top text-end text-sm font-semibold text-text-primary tabular-nums">
                  {money(data.opening)}
                </td>
              </tr>
              {data.entries.map((entry, index) => {
                const { billed, paid } = columnsOf(entry.kind, entry.amount)
                const link = entryLink(entry.kind, entry.documentId)
                const reference = entry.reference ?? t('supplierStatement.noReference')
                const memo = memoAmountOf(entry.kind, entry.amount)
                return (
                  <tr
                    // A bill can have more than one refund or use of its credit, so its id alone
                    // does not name a line.
                    key={`${entry.kind}-${entry.documentId}-${index}`}
                    className={[
                      'border-b border-surface-background',
                      entryOpen(entry) ? 'bg-surface-background/40' : '',
                    ].join(' ')}
                  >
                    <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">
                      {dayOf(entry.date)}
                    </td>
                    <td className="px-5 py-4 align-top">
                      {link ? (
                        <Link
                          to={link}
                          className="text-sm font-semibold text-primary-700 hover:underline"
                        >
                          {reference}
                        </Link>
                      ) : (
                        <p className="text-sm font-semibold text-text-primary">{reference}</p>
                      )}
                      {entry.detail ? (
                        <p className="mt-1 max-w-[280px] text-xs font-medium leading-[1.5] text-text-quaternary">
                          {entry.detail}
                        </p>
                      ) : null}
                      {/* Credit used on another bill moves no balance, so its amount is shown
                          here rather than in a column. */}
                      {memo !== null ? (
                        <OmAmount
                          size="xs"
                          amount={money(memo)}
                          className="mt-1"
                          amountClassName="text-xs font-medium text-text-quaternary tabular-nums"
                        />
                      ) : null}
                      {/* Its balance would only repeat the line before, so the cell is left blank
                          and this says why (owner, 9 Oct 2026). */}
                      {memo !== null ? (
                        <p className="mt-1 max-w-[280px] text-xs font-medium leading-[1.5] text-text-quaternary">
                          {t('supplierStatement.alreadyCounted')}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span
                        className={[
                          'inline-flex h-[24px] items-center rounded-sm px-2 text-[11px] font-semibold uppercase tracking-[0.4px]',
                          KIND_CHIP[entry.kind] ?? KIND_CHIP.BILL,
                        ].join(' ')}
                      >
                        {/* On a credit-used line the server's reference is the bill the credit
                            was set against. */}
                        {entry.kind === 'OVERPAYMENT_CREDIT_APPLIED' && entry.reference
                          ? t('supplierStatement.creditUsedOn', { bill: entry.reference })
                          : // A kind added after this build reads by its name, as the API asks.
                            t(`supplierStatement.kind.${entry.kind}`, { defaultValue: entry.kind })}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-end text-sm font-semibold text-text-primary tabular-nums">
                      {billed === null ? '' : signed(billed)}
                    </td>
                    <td className="px-5 py-4 align-top text-end text-sm font-semibold text-text-primary tabular-nums">
                      {paid === null ? '' : signed(paid)}
                    </td>
                    <td className="px-5 py-4 align-top text-end text-sm font-semibold text-text-primary tabular-nums">
                      {memo !== null ? '' : money(entry.runningBalance)}
                    </td>
                  </tr>
                )
              })}
              {data.entries.length === 0 ? (
                <tr className="border-b border-surface-background">
                  <td
                    colSpan={6}
                    className="px-5 py-6 text-center text-sm font-medium text-text-quaternary"
                  >
                    {t('supplierStatement.noEntries')}
                  </td>
                </tr>
              ) : null}
              <tr className="bg-surface-background/40">
                <td colSpan={3} className="px-5 py-4 text-sm font-semibold text-text-primary">
                  {t('supplierStatement.overThePeriod')}
                </td>
                <td className="px-5 py-4 text-end text-sm font-semibold text-text-primary tabular-nums">
                  {signed(totals.billedNet)}
                </td>
                <td className="px-5 py-4 text-end text-sm font-semibold text-text-primary tabular-nums">
                  {money(totals.paid)}
                </td>
                <td className="px-5 py-4 text-end">
                  <OmAmount
                    size="xs"
                    amount={money(data.closing)}
                    className="justify-end"
                    amountClassName="text-sm font-semibold text-text-primary tabular-nums"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </RowsView>

        <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
          {AGEING_BUCKETS.map((bucket, index) => {
            const note = ageingNote(bucket, {
              ageingDetail: data.ageingDetail,
              everLate: everLateOf(
                data,
                overview.read.status === 'ready' ? overview.read.data : null,
              ),
            })
            return (
              <div key={bucket} className={['border-s-2 ps-3', BUCKET_TONE[index]].join(' ')}>
                <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
                  {t(`supplierStatement.ageing.${bucket}`)}
                </p>
                {data.ageing[bucket] > 0 ? (
                  <OmAmount
                    size="sm"
                    amount={money(data.ageing[bucket])}
                    className="mt-1.5"
                    amountClassName="text-xl font-semibold leading-[1.2] text-text-primary tabular-nums"
                  />
                ) : (
                  <p className="mt-1.5 text-[15px] font-medium leading-[1.3] text-text-quaternary">
                    {t('supplierStatement.nothing')}
                  </p>
                )}
                {/* TODO(backend): the bill count and next due date under each figure (§7.14).
                    "Never been late with them" is read from the supplier's overview. */}
                <p className="mt-1.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                  {note
                    ? t(note.key, {
                        ...note.values,
                        date:
                          typeof note.values?.date === 'string'
                            ? dayOf(note.values.date)
                            : undefined,
                      })
                    : '—'}
                </p>
              </div>
            )
          })}
        </div>
      </section>
    )
  }
}

function EmailStatementModal({
  supplierId,
  recipients,
  from,
  to,
  onClose,
  onSent,
}: {
  supplierId: string
  recipients: string[]
  from: string
  to: string
  onClose: () => void
  onSent: (recipient: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [recipient, setRecipient] = useState(recipients[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const send = async () => {
    if (!recipient || busy) return
    setBusy(true)
    setFailure(null)
    try {
      const sent = await emailSupplierStatement(supplierId, from, to, recipient)
      onSent(sent.recipient)
    } catch (error) {
      // The server names why. The page already keeps a switched-off supplier, one with no address
      // and any address not on the record from getting here, so most of these show only when the
      // record changed after the page loaded.
      const refusal =
        error instanceof ApiError && error.code ? STATEMENT_EMAIL_REFUSALS[error.code] : undefined
      if (refusal) {
        setFailure(t(refusal, { address: recipient }))
      } else if (error instanceof ApiError && error.status === 400 && error.code === null) {
        // A server from before the codes: its one 400 is a deployment that cannot send e-mail.
        setFailure(t('supplierStatement.email.unavailable'))
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setFailure(
          message.reference
            ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
            : body,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      width={520}
      onClose={onClose}
      title={t('supplierStatement.email.title')}
      subtitle={t('supplierStatement.email.subtitle', {
        from: formatDate(from, i18n.language),
        to: formatDate(to, i18n.language),
      })}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !recipient}
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? t('supplierStatement.email.sending') : t('supplierStatement.email.send')}
          </button>
        </div>
      }
    >
      {failure ? <Notice body={failure} /> : null}
      <fieldset className="mt-2 flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-text-secondary">
          {t('supplierStatement.email.to')}
        </legend>
        {recipients.map((address) => (
          <label
            key={address}
            className="flex items-center gap-2 rounded-sm border border-border-subtle px-3 py-2.5 text-sm font-medium text-text-primary"
          >
            <input
              type="radio"
              name="recipient"
              value={address}
              checked={recipient === address}
              onChange={() => setRecipient(address)}
            />
            <span dir="ltr">{address}</span>
          </label>
        ))}
      </fieldset>
      <p className="mt-3 text-xs font-medium leading-[1.5] text-text-quaternary">
        {t('supplierStatement.email.note')}
      </p>
    </Modal>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {label}
      </p>
      <OmAmount
        size="sm"
        amount={value}
        className="mt-1.5"
        amountClassName="text-lg font-semibold leading-[1.2] text-text-primary tabular-nums"
      />
    </div>
  )
}

function Operator({ children }: { children: ReactNode }) {
  return <span className="mt-4 text-lg font-semibold text-text-quaternary">{children}</span>
}
