import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, DateField, Pager, Rial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { posSaleRowActions } from '../../lib/rowActions'
import { muscatToday, omr, toBaisa } from '../../lib/pos'
import { PosTillGate } from './PosTillGate'
import { ReceiptReprint } from './PosReprint'
import { saleCashierLabel } from '../../lib/posAttribution'
import { useApiRead } from '../../hooks'
import {
  posDayPath,
  posSalesPath,
  posTodayPath,
  type PosDaySummaryDto,
  type PosTodayDto,
  type PosTodaySaleRow,
  type PosTodaySalesPage,
} from '../../api/pos/pos'
import {
  TODAY_TABS,
  dayBefore,
  groupByShift,
  payDetail,
  payMethodKey,
  amountNote,
  saleState,
  saleStateText,
  type TodayTabId,
} from '../../lib/posToday'
import type { TillState } from '../../lib/posTill'

type Ready = Extract<TillState, { status: 'ready' }>

const PAGE_SIZE = 50

const STATE_TONE = {
  filed: 'bg-success-100 text-success-700',
  peppol: 'bg-neutral-25 text-text-tertiary',
  credited: 'bg-pending-100 text-pending-700',
  waiting: 'bg-neutral-25 text-text-tertiary',
  failed: 'bg-danger-100 text-danger-700',
} as const

/**
 * The day so far (Figma 143:20498): every till sale of the branch on the day
 * (`GET /v1/pos/sales`), its figures (`GET /v1/pos/today`) and, under them, the manager's daily
 * summary of every shift (`GET /v1/pos/days/{date}`; one close per shift, Abdul 17).
 */
export function PosTodayPage() {
  return (
    <AppShell>
      <PosTillGate showQueue>{(till) => <Today till={till} />}</PosTillGate>
    </AppShell>
  )
}

function Today({ till }: { till: Ready }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const today = muscatToday()
  const [date, setDate] = useState(today)
  const [picking, setPicking] = useState(false)
  const [tab, setTab] = useState<TodayTabId>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [reprinting, setReprinting] = useState<string | null>(null)

  const apiTab = TODAY_TABS.find((entry) => entry.id === tab)?.api ?? 'ALL'
  const figures = useApiRead<PosTodayDto>(posTodayPath({ branchId: till.branchId, date }))
  const salesPath = posSalesPath({
    branchId: till.branchId,
    date,
    tab: apiTab,
    q: query,
    page: page - 1,
    size: PAGE_SIZE,
  })
  const sales = useApiRead<PosTodaySalesPage>(salesPath)
  const day = useApiRead<PosDaySummaryDto>(posDayPath(date, till.branchId))

  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const kpi = figures.read.status === 'ready' ? figures.read.data : null
  const rows = sales.read.status === 'ready' ? sales.read.data.content : []
  const pageCount =
    sales.read.status === 'ready'
      ? Math.max(1, Math.ceil(sales.read.data.totalElements / PAGE_SIZE))
      : 1

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <Link
        to="/pos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
      >
        ‹ {t('pos.backToTill')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {date === today ? t('pos.today.title') : dayLabel}
          </h1>
          <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
            {t('pos.today.subtitle', {
              branch: till.branchName ?? '',
              till: till.till.number,
              day: dayLabel,
              upTo: kpi?.lastSaleTime ?? '',
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <button
            type="button"
            onClick={() => {
              setDate(dayBefore(date))
              setPage(1)
            }}
            className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('pos.today.yesterday')}
          </button>
          {picking ? (
            <div className="w-[180px]">
              <DateField
                value={date}
                max={today}
                ariaLabel={t('pos.today.pickDate')}
                onChange={(value) => {
                  if (value) setDate(value)
                  setPage(1)
                  setPicking(false)
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('pos.today.pickDate')}
            </button>
          )}
          {till.can.close ? (
            <Link
              to="/pos/close"
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('pos.today.closingTill')}
            </Link>
          ) : null}
          {/* Not only where this build signs: an unsigned queued sale with a manual discount is held too
              (owner round 5, pts 6-8), so a reviewer needs the holds wherever the till sells offline. */}
          {till.can.close || till.can.manage ? (
            <Link
              to="/pos/offline-holds"
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('pos.offline.holds.link')}
            </Link>
          ) : null}
          {/* pos.close only: unlike the holds page, which also shows a till manager the device keys,
              this page has nothing for pos.till.manage alone, and its list would be refused. */}
          {till.can.close ? (
            <Link
              to="/pos/discount-flags"
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('pos.discountFlags.link')}
            </Link>
          ) : null}
          {/* Today's own list is read under pos.read (GET /pos/sales), the report's permission, so
              whoever sees this page may open it. */}
          <Link to="/pos/currency-exceptions" className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25">
            {t('pos.currencyExceptions.link')}
          </Link>
          <Link to="/pos/held-sales" className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25">
            {t('pos.heldSales.link')}
          </Link>
        </div>
      </div>

      {/* The search sits inside a white card, as the frame draws it. */}
      <div className="rounded-md bg-surface-card p-4">
        <label className="flex h-[50px] w-full items-center gap-3 rounded-sm border border-primary-700 bg-surface-card px-4">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0 text-primary-700"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="m20 20-3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={query}
            maxLength={100}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder={t('pos.today.searchPlaceholder')}
            className="h-full w-full min-w-0 border-0 bg-transparent text-base font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
      </div>

      {figures.read.status === 'failed' ? (
        <ApiReadFailure error={figures.read.error} retry={figures.retry} />
      ) : kpi ? (
        <div className="flex flex-wrap gap-4">
          <Kpi
            title={t('pos.today.soldSoFar')}
            value={omr(toBaisa(kpi.sales.amount))}
            money
            note={t('pos.today.soldNote', {
              count: kpi.sales.count,
              sales: kpi.sales.count,
              average: omr(toBaisa(kpi.sales.average)),
            })}
          />
          <Kpi
            title={t('pos.today.busiestHour')}
            value={
              kpi.busiestHour
                ? t('pos.today.salesCount', { count: kpi.busiestHour.sales })
                : t('pos.today.noneYet')
            }
            note={
              kpi.busiestHour
                ? `${kpi.busiestHour.from} ${t('pos.today.to')} ${kpi.busiestHour.to}`
                : ''
            }
          />
          <Kpi
            title={t('pos.today.refunded')}
            value={omr(toBaisa(kpi.refunds.amount))}
            money
            note={t('pos.today.refundNote', { count: kpi.refunds.count })}
          />
          <Kpi
            title={t('pos.today.bestSeller')}
            value={kpi.bestSeller?.name ?? t('pos.today.noneYet')}
            note={
              kpi.bestSeller
                ? t('pos.today.bestNote', {
                    sold: kpi.bestSeller.quantity,
                    takings: omr(toBaisa(kpi.bestSeller.takings)),
                    each: omr(
                      kpi.bestSeller.quantity
                        ? Math.round(toBaisa(kpi.bestSeller.takings) / kpi.bestSeller.quantity)
                        : 0,
                    ),
                  })
                : ''
            }
            small
          />
        </div>
      ) : (
        <LoadingNotice />
      )}

      <section className="flex flex-col rounded-md bg-surface-card">
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border-subtle px-6 pt-4">
          {TODAY_TABS.map((entry) => {
            const active = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setTab(entry.id)
                  setPage(1)
                }}
                aria-pressed={active}
                className={[
                  'relative flex items-center gap-1.5 pb-3 text-base transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-tertiary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
                <span className="text-xs font-semibold text-text-quaternary">
                  {kpi ? kpi.tabs[entry.count] : ''}
                </span>
                {active ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary-700" />
                ) : null}
              </button>
            )
          })}
        </div>

        {sales.read.status === 'loading' ? (
          <LoadingNotice />
        ) : sales.read.status === 'failed' ? (
          <ApiReadFailure error={sales.read.error} retry={sales.retry} />
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
            {t('pos.today.nothingYet')}
          </p>
        ) : (
          groupByShift(rows).map((group) => (
            <div key={group.shiftId}>
              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-background px-6 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                  {group.cashier
                    ? t('pos.today.shiftOf', { who: group.cashier, till: group.tillNumber })
                    : t('pos.today.shiftUnverified', { till: group.tillNumber })}
                </p>
                <p className="text-xs font-medium text-text-quaternary">
                  {t('pos.today.groupTotal', {
                    count: group.sales.length,
                    amount: omr(group.total),
                  })}
                </p>
              </div>
              <ul>
                {group.sales.map((sale) => (
                  <SaleRow
                    key={sale.saleId}
                    sale={sale}
                    canRefund={till.can.refund}
                    onReprint={() => setReprinting(sale.saleId)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
        {pageCount > 1 ? (
          <div className="flex justify-end border-t border-border-subtle px-6 py-3">
            <Pager
              page={page}
              pageCount={pageCount}
              onChange={setPage}
              labels={{
                nav: t('pos.today.pages'),
                previous: t('pos.today.previous'),
                next: t('pos.today.next'),
              }}
            />
          </div>
        ) : null}
      </section>

      {day.read.status === 'ready' ? <DaySummary day={day.read.data} /> : null}

      {reprinting ? (
        <ReceiptReprint
          saleId={reprinting}
          branchName={till.branchName}
          onClose={() => setReprinting(null)}
        />
      ) : null}
    </div>
  )
}

function SaleRow({
  sale,
  canRefund,
  onReprint,
}: {
  sale: PosTodaySaleRow
  canRefund: boolean
  onReprint: () => void
}) {
  const { t } = useTranslation()
  const detail = payDetail(sale)
  const note = amountNote(sale)
  const badge = saleStateText(sale)
  return (
    <li
      // Fixed columns from xl up, so payment, amount, badge and action line up on every row. From
      // md the badge and action take a second row under the items and the amount; a phone lets
      // them wrap.
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-6 py-3.5 last:border-b-0 md:grid md:grid-cols-[48px_96px_minmax(0,1fr)_132px_112px] xl:grid-cols-[48px_96px_minmax(0,1fr)_132px_112px_104px_148px]"
    >
      <span className="w-12 shrink-0 text-sm font-medium text-text-quaternary">{sale.time}</span>
      <span className="w-24 min-w-0 shrink-0">
        <Link
          to={`/invoices/${sale.invoiceId}`}
          dir="ltr"
          title={sale.invoiceNumber}
          className="block truncate text-sm font-semibold text-primary-700 hover:text-primary-800"
        >
          {sale.invoiceNumber.split('-').slice(-1)[0]}
        </Link>
        <span className="mt-0.5 block truncate text-xs font-medium text-text-quaternary">
          {saleCashierLabel(sale, t)}
        </span>
      </span>
      <span className="min-w-[180px] flex-1 md:min-w-0">
        <span className="block text-sm font-medium text-text-primary">{sale.summary}</span>
        <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
          {t('pos.today.itemCount', { count: sale.items })}
        </span>
      </span>
      <span className="w-[132px] shrink-0">
        <span className="block text-sm font-medium text-text-primary">{t(payMethodKey(sale))}</span>
        {detail ? (
          <span
            dir="ltr"
            className="mt-0.5 block text-xs font-medium text-text-quaternary rtl:text-end"
          >
            {detail.key ? t(detail.key, detail.values) : detail.text}
          </span>
        ) : null}
      </span>
      <span className="w-[112px] shrink-0 text-end">
        <span className="inline-flex items-baseline gap-1 text-base font-semibold text-text-primary">
          <Rial />
          {omr(toBaisa(sale.total))}
        </span>
        {note ? (
          <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
            {t(note.key, note.values)}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 md:col-start-3 md:row-start-2 xl:col-start-auto xl:row-start-auto">
        <span
          className={`inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${STATE_TONE[saleState(sale)]}`}
          title={badge.hintKey ? t(badge.hintKey) : undefined}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {t(badge.key)}
        </span>
      </span>
      <span className="flex shrink-0 items-center justify-end gap-1.5 md:col-span-2 md:col-start-4 md:row-start-2 xl:col-span-1 xl:col-start-auto xl:row-start-auto">
        {sale.refundable && canRefund ? (
          <Link
            to={`/pos/refund?invoice=${encodeURIComponent(sale.invoiceNumber)}`}
            className="inline-flex h-9 whitespace-nowrap items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('pos.today.refund')}
          </Link>
        ) : sale.credit.state !== 'NONE' ? (
          <Link
            to={`/invoices/${sale.invoiceId}`}
            className="inline-flex h-9 whitespace-nowrap items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('pos.today.seeNote')}
          </Link>
        ) : null}
        {/* The ⋮ as a bordered square the height of the button beside it. */}
        <span className="[&>div>button]:size-9 [&>div>button]:border [&>div>button]:border-border-subtle [&>div>button]:bg-white [&>div>button>img]:size-5">
          {/* A queued sale keeps the menu it had: its receipt printed a number and no QR that the
              server's answer cannot restate (QR E-5; its printed QR waits for E-1). */}
          <ActionMenu
            items={posSaleRowActions(sale.invoiceId, sale.queuedOffline ? undefined : onReprint)}
            label={t('pos.today.rowMenu')}
          />
        </span>
      </span>
    </li>
  )
}

/** The manager's day (`GET /v1/pos/days/{date}`): every shift and its close. */
function DaySummary({ day }: { day: PosDaySummaryDto }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  if (!day.shifts.length) return null
  return (
    <section className="flex flex-col rounded-md bg-surface-card">
      <div className="border-b border-border-subtle px-6 py-4">
        <h2 className="text-base font-medium leading-[1.2] text-text-primary">
          {t('pos.day.title')}
        </h2>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t('pos.day.note', {
            open: day.openShifts,
            handovers: day.uncountedHandovers,
          })}
        </p>
      </div>
      <ul>
        {day.shifts.map((shift) => (
          <li
            key={shift.shiftId}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-subtle px-6 py-3.5 last:border-b-0"
          >
            <span className="min-w-[160px] flex-1">
              <span className="block text-sm font-semibold text-text-primary">
                {t('pos.day.shift', { who: shift.cashier.name ?? '', till: shift.tillNumber })}
              </span>
              <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                {new Date(shift.openedAt).toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                  timeZone: 'Asia/Muscat',
                })}
                {' · '}
                {t('pos.today.salesCount', { count: shift.salesCount })}
              </span>
            </span>
            <span className="text-sm font-medium text-text-tertiary">
              {shift.status === 'OPEN'
                ? t('pos.day.open')
                : shift.uncountedHandover
                  ? t('pos.day.handedOver')
                  : shift.overShort == null
                    ? t('pos.close.notCounted')
                    : toBaisa(shift.overShort) === 0
                      ? t('pos.close.balances')
                      : toBaisa(shift.overShort) < 0
                        ? t('pos.close.shortValue', {
                            amount: omr(Math.abs(toBaisa(shift.overShort))),
                          })
                        : t('pos.day.overValue', { amount: omr(toBaisa(shift.overShort)) })}
            </span>
            {shift.cardTerminalDifference != null && toBaisa(shift.cardTerminalDifference) !== 0 ? (
              <span className="text-xs font-medium text-pending-700">
                {t('pos.day.cardDiffers', { amount: omr(toBaisa(shift.cardTerminalDifference)) })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {day.lateOfflineSales.length || day.filedPastRestriction ? (
        <p className="border-t border-border-subtle px-6 py-3 text-xs font-medium text-pending-700">
          {t('pos.day.late', {
            count: day.lateOfflineSales.length,
            restricted: day.filedPastRestriction,
          })}
        </p>
      ) : null}
    </section>
  )
}

function Kpi({
  title,
  value,
  note,
  small,
  money,
}: {
  title: string
  value: string
  note: string
  small?: boolean
  /** An amount of money: the rial sign goes before it. */
  money?: boolean
}) {
  return (
    <article className="flex min-w-[240px] flex-1 flex-col gap-2 rounded-md bg-surface-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
        {title}
      </p>
      <p
        className={[
          'inline-flex items-baseline gap-1.5 font-semibold leading-[1.2] text-text-primary',
          small ? 'text-2xl' : 'text-[30px]',
        ].join(' ')}
      >
        {money ? <Rial /> : null}
        {value}
      </p>
      <p className="text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}
