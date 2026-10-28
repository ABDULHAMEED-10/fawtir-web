import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { Rial, withRial } from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { PosFootNote } from './PosFootNote'
import { PosTillGate } from './PosTillGate'
import { CashIcon, CheckIcon, ClockIcon } from './posIcons'
import { omr, omrSigned, tillTime, toBaisa } from '../../lib/pos'
import { parseBaisa } from '../../lib/posPayment'
import {
  DENOMINATIONS,
  SHORT_REASONS,
  closeRequest,
  countedTotal,
  denominationLabel,
  figuresOf,
  type Counted,
} from '../../lib/posClose'
import { posRefusalKey, refusalValues } from '../../lib/posRefusals'
import { useApiRead } from '../../hooks'
import {
  addCashMovement,
  closePosShift,
  closePreviewPath,
  newPosKey,
  setShiftFloat,
  type OverShortReason,
  type PosClosePreviewDto,
  type PosShiftCloseDto,
} from '../../api/pos/pos'
import type { TillState } from '../../lib/posTill'

type Ready = Extract<TillState, { status: 'ready' }>

const FIELD =
  'h-11 w-full rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand'

function Line({
  label,
  note,
  value,
  tone,
  icon,
}: {
  label: string
  note?: string
  value: string
  tone?: 'add' | 'take' | 'sum'
  icon?: ReactNode
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 border-b border-border-subtle px-5 last:border-b-0',
        // The total sits on a grey band, a step larger, as the frame draws it.
        tone === 'sum' ? 'rounded-b-md bg-surface-tab-bar py-4' : 'py-3.5',
      ].join(' ')}
    >
      <span
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-sm text-sm',
          tone === 'take'
            ? 'bg-danger-100 text-danger-700'
            : tone === 'add'
              ? 'bg-success-100 text-success-700'
              : tone === 'sum'
                ? 'bg-white text-text-tertiary'
                : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        {icon ?? (tone === 'take' ? '−' : tone === 'add' ? '+' : '=')}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={[
            'block font-medium text-text-primary',
            tone === 'sum' ? 'text-base' : 'text-sm',
          ].join(' ')}
        >
          {label}
        </span>
        {note ? (
          <span className="mt-0.5 block text-xs font-medium text-text-quaternary">{note}</span>
        ) : null}
      </span>
      <span
        dir="ltr"
        className={[
          'shrink-0 font-semibold tabular-nums',
          tone === 'sum' ? 'text-lg' : 'text-base',
          tone === 'take'
            ? 'text-danger-700'
            : tone === 'add'
              ? 'text-success-700'
              : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Closing the till (Figma 143:20055): the shift on this till, its close preview, the count, the
 * card check against the bank machine and the close itself (`POST .../close`, once per shift).
 */
export function PosClosePage() {
  return (
    <AppShell>
      <PosTillGate>
        {(till) =>
          till.till.openShift ? (
            <CloseShift till={till} shiftId={till.till.openShift.shiftId} />
          ) : (
            <NothingOpen />
          )
        }
      </PosTillGate>
    </AppShell>
  )
}

/** No shift is open on this till: nothing to count (the next sale opens one). */
function NothingOpen() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <Link
        to="/pos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
      >
        ‹ {t('pos.backToTill')}
      </Link>
      <p className="rounded-md bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('pos.close.noShift')}
      </p>
    </div>
  )
}

function CloseShift({ till, shiftId }: { till: Ready; shiftId: string }) {
  const preview = useApiRead<PosClosePreviewDto>(closePreviewPath(shiftId))
  if (preview.read.status === 'loading') return <LoadingNotice />
  if (preview.read.status === 'failed') {
    return <ApiReadFailure error={preview.read.error} retry={preview.retry} />
  }
  return <CloseForm till={till} preview={preview.read.data} reload={preview.retry} />
}

function CloseForm({
  till,
  preview,
  reload,
}: {
  till: Ready
  preview: PosClosePreviewDto
  reload: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const figures = figuresOf(preview)
  const [byNote, setByNote] = useState(false)
  const [total, setTotal] = useState(figures.expected)
  const [counted, setCounted] = useState<Counted>({})
  const [reason, setReason] = useState<OverShortReason>(SHORT_REASONS[0].id)
  const [note, setNote] = useState('')
  const [terminalText, setTerminalText] = useState((figures.terminal / 1000).toFixed(3))
  const [cardNote, setCardNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<unknown>(null)
  const [closed, setClosed] = useState<PosShiftCloseDto | null>(null)
  const key = useRef<{ fingerprint: string; key: string } | null>(null)

  const cash = byNote ? countedTotal(counted) : total
  const gap = cash - figures.expected
  const share = figures.cashTaken ? Math.abs(gap) / figures.cashTaken : 0
  const terminal = terminalText.trim() ? parseBaisa(terminalText) : null
  const cardDiffers = terminal != null && terminal !== figures.terminal
  const floatLeft = Math.min(toBaisa(till.till.defaultFloat), Math.max(0, cash))
  const day = new Date(`${preview.businessDate}T12:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const ready = !busy && !closed && (!cardDiffers || cardNote.trim().length > 0)

  const close = async () => {
    setBusy(true)
    setRefusal(null)
    const body = closeRequest({
      byNote,
      counted,
      total,
      floatLeft,
      terminal,
      terminalExpected: figures.terminal,
      cardNote,
      reason,
      overShort: gap,
      note,
    })
    const fingerprint = JSON.stringify(body)
    if (!key.current || key.current.fingerprint !== fingerprint) {
      key.current = { fingerprint, key: newPosKey('close') }
    }
    try {
      setClosed(await closePosShift(preview.shiftId, body, key.current.key))
      till.retry()
    } catch (error) {
      setRefusal(error)
    } finally {
      setBusy(false)
    }
  }

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
            {t('pos.close.title')}
          </h1>
          <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
            {t('pos.close.subtitle', {
              branch: till.branchName ?? '',
              till: preview.tillNumber,
              who: preview.cashier.name ?? '',
              from: tillTime(preview.openedAt, locale),
              to: tillTime(preview.endedAt ?? preview.at, locale),
              day,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-11 shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('pos.close.printSummary')}
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <Kpi
          title={t('pos.close.takenToday')}
          value={omr(figures.taken)}
          note={t('pos.close.takenNote', {
            sales: figures.sales,
            average: omr(figures.sales ? Math.round(figures.taken / figures.sales) : 0),
          })}
        />
        <Kpi
          title={t('pos.close.cash')}
          value={omr(figures.cashTaken)}
          note={t('pos.close.cashNote', {
            percent: figures.taken ? Math.round((figures.cashTaken / figures.taken) * 100) : 0,
            sales: figures.cashSales,
          })}
        />
        <Kpi
          title={t('pos.close.card')}
          value={omr(figures.card)}
          note={t('pos.close.cardNote', { sales: figures.cardSales })}
        />
        <Kpi
          title={t('pos.close.onCompany')}
          value={omr(figures.onAccount)}
          note={t('pos.close.companyNote', { count: figures.companyInvoices })}
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[320px] flex-1 flex-col gap-4">
          <section className="rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div>
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.close.countDrawer')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.close.cashOnly')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setByNote((v) => !v)}
                className="text-sm font-semibold text-primary-700"
              >
                {byNote ? t('pos.close.enterTotal') : t('pos.close.byDenomination')}
              </button>
            </div>

            <div className="flex flex-wrap gap-4 px-5 py-4">
              <div className="min-w-[260px] flex-1">
                <p className="text-xs font-semibold text-text-tertiary">
                  {t('pos.close.actuallyIn')}
                </p>
                <input
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  readOnly={byNote}
                  value={(cash / 1000).toFixed(3)}
                  onFocus={selectAllOnFocus}
                  onChange={(event) => setTotal(parseBaisa(event.target.value))}
                  aria-label={t('pos.close.actuallyIn')}
                  className="mt-2 h-[60px] w-full rounded-sm border-2 border-primary-700 bg-primary-25 px-4 text-end text-2xl font-semibold text-text-primary outline-none"
                />
                {byNote ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {DENOMINATIONS.map((value) => (
                      <label
                        key={value}
                        className="flex h-9 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-2 text-sm font-medium text-text-tertiary"
                      >
                        <span dir="ltr" className="shrink-0">
                          {denominationLabel(value)}
                        </span>
                        <span className="text-xs text-text-quaternary">×</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          dir="ltr"
                          value={String(counted[value] ?? 0)}
                          onFocus={selectAllOnFocus}
                          aria-label={t('pos.close.howMany', { note: denominationLabel(value) })}
                          onChange={(event) =>
                            setCounted((current) => ({
                              ...current,
                              [value]: Math.max(
                                0,
                                Number(event.target.value.replace(/\D/g, '')) || 0,
                              ),
                            }))
                          }
                          className="h-full w-full min-w-0 border-0 bg-transparent text-end text-sm font-semibold text-text-primary outline-none"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>

              <div
                className={[
                  'min-w-[260px] flex-1 rounded-sm p-4',
                  gap === 0 ? 'bg-success-100' : 'bg-pending-100',
                ].join(' ')}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                  {gap === 0
                    ? t('pos.close.balances')
                    : gap < 0
                      ? t('pos.close.shortBy')
                      : t('pos.close.overBy')}
                </p>
                <p
                  className={[
                    'mt-1 inline-flex items-baseline gap-1.5 text-[30px] font-semibold leading-none',
                    gap === 0 ? 'text-success-700' : 'text-pending-700',
                  ].join(' ')}
                >
                  <Rial />
                  {omr(Math.abs(gap))}
                </p>
                {gap !== 0 ? (
                  <p className="mt-2 text-xs font-medium leading-[1.6] text-text-tertiary">
                    {t('pos.close.shortStory', {
                      expected: omr(figures.expected),
                      counted: omr(cash),
                      percent: (share * 100).toFixed(1),
                    })}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="border-t border-border-subtle">
              <Line
                label={t('pos.close.float')}
                note={t('pos.close.floatNote', { time: tillTime(preview.openedAt, locale) })}
                value={omr(figures.float)}
                icon={<CashIcon className="size-4" />}
              />
              <Line
                label={t('pos.close.cashTaken')}
                note={t('pos.close.cashTakenNote', { sales: figures.cashSales })}
                value={`+${omr(figures.cashTaken)}`}
                tone="add"
              />
              {figures.cashTips ? (
                <Line
                  label={t('pos.close.cashTips')}
                  value={`+${omr(figures.cashTips)}`}
                  tone="add"
                />
              ) : null}
              {figures.paidIn ? (
                <Line label={t('pos.close.paidIn')} value={`+${omr(figures.paidIn)}`} tone="add" />
              ) : null}
              <Line
                label={t('pos.close.refundedInCash')}
                value={omrSigned(-figures.cashRefunded)}
                tone="take"
              />
              <Line
                label={t('pos.close.paidOut')}
                note={preview.movements
                  .filter((movement) => movement.type === 'PAID_OUT' && movement.note)
                  .map((movement) => movement.note)
                  .join(' · ')}
                value={omrSigned(-figures.paidOut)}
                tone="take"
              />
              <Line label={t('pos.close.shouldHold')} value={omr(figures.expected)} tone="sum" />
            </div>
          </section>

          <CashMovements
            shiftId={preview.shiftId}
            canSetFloat={preview.salesCount === 0}
            onRecorded={reload}
          />

          {gap !== 0 ? (
            <section className="rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-5 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {gap < 0 ? t('pos.close.whyShort') : t('pos.close.whyOver')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.close.guessIsFine')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 px-5 py-4 max-md:grid-cols-1">
                {SHORT_REASONS.map((option) => {
                  const chosen = option.id === reason
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setReason(option.id)}
                      aria-pressed={chosen}
                      className={[
                        'flex items-start gap-3 rounded-md border px-4 py-3.5 text-start transition-colors',
                        chosen
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                          chosen ? 'border-primary-700' : 'border-border-default',
                        ].join(' ')}
                      >
                        {chosen ? <span className="size-2 rounded-full bg-primary-700" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={[
                            'text-sm font-semibold',
                            chosen ? 'text-primary-800' : 'text-text-primary',
                          ].join(' ')}
                        >
                          {t(option.labelKey)}
                        </span>{' '}
                        <span className="text-xs font-medium text-text-quaternary">
                          {t(option.noteKey)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="px-5 pb-5">
                <textarea
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t('pos.close.anythingToAdd')}
                  className="w-full resize-none rounded-sm border border-border-subtle bg-white px-4 py-3 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand"
                />
              </div>
            </section>
          ) : null}

          <section className="rounded-md bg-surface-card">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.close.looseEnds')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('pos.close.beforeClosing')}
              </p>
            </div>
            <ul>
              {preview.looseEnds.onAccountOpen.count > 0 ? (
                <LooseEnd
                  done={false}
                  title={t('pos.close.tabsOpen', { count: preview.looseEnds.onAccountOpen.count })}
                  note={withRial(
                    t('pos.close.tabsNoteLive', {
                      amount: `OMR ${omr(toBaisa(preview.looseEnds.onAccountOpen.amount))}`,
                    }),
                  )}
                />
              ) : null}
              <LooseEnd
                done={preview.looseEnds.notYetAccepted === 0}
                title={
                  preview.looseEnds.notYetAccepted === 0
                    ? t('pos.close.allFiled')
                    : t('pos.close.notYetFiled', { count: preview.looseEnds.notYetAccepted })
                }
                note={
                  preview.looseEnds.notYetAccepted === 0
                    ? t('pos.close.allFiledNote', { count: preview.salesCount })
                    : t('pos.close.notYetFiledNote')
                }
              />
              {/* The card check against the bank machine's end-of-day report (owner, 27 Oct 2026). */}
              <li className="flex flex-wrap items-start gap-3 border-b border-border-subtle px-5 py-4 last:border-b-0">
                <span
                  className={[
                    'flex size-8 shrink-0 items-center justify-center rounded-sm text-sm',
                    cardDiffers
                      ? 'bg-pending-100 text-pending-700'
                      : 'bg-success-100 text-success-700',
                  ].join(' ')}
                >
                  {cardDiffers ? (
                    <ClockIcon className="size-4" />
                  ) : (
                    <CheckIcon className="size-4" />
                  )}
                </span>
                <span className="flex min-w-[200px] flex-1 flex-col gap-2">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t('pos.close.terminalTotal')}
                  </span>
                  <span className="block text-xs font-medium leading-[1.5] text-text-quaternary">
                    {withRial(
                      t('pos.close.terminalTotalNote', {
                        amount: `OMR ${omr(figures.terminal)}`,
                        payments: preview.looseEnds.cardSalesForTerminalCheck.count,
                      }),
                    )}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={terminalText}
                    onFocus={selectAllOnFocus}
                    onChange={(event) => setTerminalText(event.target.value)}
                    aria-label={t('pos.close.terminalTotal')}
                    className={`${FIELD} max-w-[220px] text-end`}
                  />
                  {cardDiffers && terminal != null ? (
                    <>
                      <span className="text-xs font-medium text-pending-700">
                        {t('pos.close.terminalDiffers', {
                          difference: omrSigned(terminal - figures.terminal),
                        })}
                      </span>
                      <input
                        value={cardNote}
                        maxLength={500}
                        onChange={(event) => setCardNote(event.target.value)}
                        placeholder={t('pos.close.terminalNotePlaceholder')}
                        aria-label={t('pos.close.terminalNotePlaceholder')}
                        className={FIELD}
                      />
                    </>
                  ) : null}
                </span>
              </li>
            </ul>
          </section>
        </div>

        <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-base font-medium leading-[1.2] text-text-primary">
              {t('pos.close.shiftInShort')}
            </h2>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {t('pos.close.savedAndPrinted')}
            </p>
          </div>
          <div className="px-5">
            <Sum label={t('pos.close.sales')} value={String(figures.sales)} />
            <Sum label={t('pos.close.taken')} value={omr(figures.taken)} money />
            <Sum label={t('pos.close.vatWithin')} value={omr(toBaisa(preview.vatWithin))} money />
            <Sum
              label={t('pos.close.discountsGiven')}
              value={omr(toBaisa(preview.discounts))}
              money
            />
            <Sum label={t('pos.close.tips')} value={omr(toBaisa(preview.tips))} money />
            <Sum label={t('pos.close.refundedInCash')} value={omr(figures.cashRefunded)} money />
            <Sum
              label={t('pos.close.drawer')}
              value={
                gap === 0
                  ? t('pos.close.balances')
                  : gap < 0
                    ? t('pos.close.shortValue', { amount: omr(Math.abs(gap)) })
                    : t('pos.day.overValue', { amount: omr(gap) })
              }
              tone={gap === 0 ? undefined : 'watch'}
            />
            <Sum
              label={t('pos.close.toBank')}
              value={omr(closed ? toBaisa(closed.toBank) : cash - floatLeft)}
              money
            />
            <Sum
              label={t('pos.close.floatTomorrow')}
              value={omr(closed ? toBaisa(closed.floatLeft) : floatLeft)}
              money
            />
          </div>
          {refusal ? (
            <p
              role="alert"
              className="mx-5 mb-2 rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700"
            >
              {t(posRefusalKey(refusal), refusalValues(refusal))}
            </p>
          ) : null}
          <div className="border-t border-border-subtle px-5 py-5">
            {closed ? (
              <p className="flex items-center gap-2 rounded-sm bg-success-100 px-3 py-3 text-sm font-medium text-success-700">
                <CheckIcon className="size-4 shrink-0" />
                {t('pos.close.closedAt', { time: tillTime(closed.closedAt, locale) })}
              </p>
            ) : (
              <button
                type="button"
                disabled={!ready || !till.can.close}
                onClick={() => void close()}
                className="inline-flex h-[52px] w-full items-center justify-center rounded-sm bg-primary-700 text-base font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
              >
                {t('pos.close.closeTill')}
              </button>
            )}
          </div>
          <PosFootNote icon="lock">
            {t('pos.close.onceClosedLive', { float: omr(floatLeft) })}
          </PosFootNote>
        </aside>
      </div>
    </div>
  )
}

/** Cash in or out of the drawer outside a sale, and the float while nothing is sold yet. */
function CashMovements({
  shiftId,
  canSetFloat,
  onRecorded,
}: {
  shiftId: string
  canSetFloat: boolean
  onRecorded: () => void
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<'PAID_OUT' | 'PAID_IN' | 'FLOAT'>('PAID_OUT')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const kinds = canSetFloat
    ? (['PAID_OUT', 'PAID_IN', 'FLOAT'] as const)
    : (['PAID_OUT', 'PAID_IN'] as const)

  const record = async () => {
    setBusy(true)
    setError(null)
    try {
      const value = parseBaisa(amount) / 1000
      if (type === 'FLOAT') await setShiftFloat(shiftId, value)
      else await addCashMovement(shiftId, { type, amount: value, note: note.trim() || null })
      setAmount('')
      setNote('')
      onRecorded()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-md bg-surface-card">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="text-base font-medium leading-[1.2] text-text-primary">
          {t('pos.close.cashMoves')}
        </h2>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t('pos.close.cashMovesNote')}
        </p>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="inline-flex w-fit max-w-full flex-wrap rounded-sm bg-surface-background p-1">
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setType(kind)}
              aria-pressed={type === kind}
              className={[
                'inline-flex h-9 items-center whitespace-nowrap rounded-sm px-3 text-sm transition-colors',
                type === kind
                  ? 'bg-surface-card font-semibold text-text-primary shadow-sm'
                  : 'font-medium text-text-quaternary',
              ].join(' ')}
            >
              {t(`pos.close.move.${kind}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex min-w-0 flex-1 basis-[140px] flex-col gap-1.5">
            <span className="text-xs font-medium text-text-tertiary">{t('pos.pay.amount')}</span>
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={amount}
              placeholder="0.000"
              onFocus={selectAllOnFocus}
              onChange={(event) => setAmount(event.target.value)}
              className={`${FIELD} text-end`}
            />
          </label>
          {type !== 'FLOAT' ? (
            <label className="flex min-w-0 flex-[2] basis-[200px] flex-col gap-1.5">
              <span className="text-xs font-medium text-text-tertiary">
                {t('pos.close.whatFor')}
              </span>
              <input
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder={type === 'PAID_IN' ? t('pos.pay.optional') : undefined}
                className={FIELD}
              />
            </label>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-xs font-medium text-danger-700">
            {t(posRefusalKey(error), refusalValues(error))}
          </p>
        ) : null}
        <div>
          <button
            type="button"
            disabled={busy || parseBaisa(amount) <= 0 || (type === 'PAID_OUT' && !note.trim())}
            onClick={() => void record()}
            className="inline-flex h-10 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
          >
            {t('pos.close.record')}
          </button>
        </div>
      </div>
    </section>
  )
}

function LooseEnd({ done, title, note }: { done: boolean; title: string; note: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-4 last:border-b-0">
      <span
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-sm text-sm',
          done ? 'bg-success-100 text-success-700' : 'bg-pending-100 text-pending-700',
        ].join(' ')}
      >
        {done ? <CheckIcon className="size-4" /> : <ClockIcon className="size-4" />}
      </span>
      <span className="min-w-[200px] flex-1">
        <span className="block text-sm font-semibold text-text-primary">{title}</span>
        <span className="mt-0.5 block text-xs font-medium leading-[1.5] text-text-quaternary">
          {note}
        </span>
      </span>
    </li>
  )
}

function Kpi({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <article className="flex min-w-[240px] flex-1 flex-col gap-2 rounded-md bg-surface-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
        {title}
      </p>
      <p className="inline-flex items-baseline gap-1.5 text-[30px] font-semibold leading-[1.2] text-text-primary">
        <Rial />
        {value}
      </p>
      <p className="text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

function Sum({
  label,
  value,
  tone,
  money,
}: {
  label: string
  value: string
  tone?: 'watch'
  /** An amount of money: the rial sign goes before it. */
  money?: boolean
}) {
  return (
    <div className="flex min-h-[35px] items-center justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0">
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      <span
        className={[
          'inline-flex items-baseline gap-1 text-sm font-semibold tabular-nums',
          tone === 'watch' ? 'text-pending-700' : 'text-text-primary',
        ].join(' ')}
      >
        {money ? <Rial /> : null}
        {value}
      </span>
    </div>
  )
}
