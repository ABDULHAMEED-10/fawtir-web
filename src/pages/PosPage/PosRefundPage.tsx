import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { Rial, TableCheckbox, withRial } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { PosFootNote } from './PosFootNote'
import { PosTillGate } from './PosTillGate'
import { CheckIcon, DocumentIcon } from './posIcons'
import { omr, omrSigned, tillTime, toBaisa } from '../../lib/pos'
import {
  WHY_OPTIONS,
  creditFor,
  moneyBackMethod,
  onlyGivenAway,
  refundRequest,
  remaining,
  standsAt,
  type PutRightChoice,
  type ReturnLine,
  type StockChoice,
  type WhyId,
} from '../../lib/posRefund'
import { posRefusalKey, problemNumber, refusalCode, refusalValues } from '../../lib/posRefusals'
import { creditCapRefusal } from '../../lib/salesNote'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import {
  createPosRefund,
  loadPosSale,
  newPosKey,
  refundLookupPath,
  type PosSaleDto,
  type PosRefundDto,
  type PosRefundLookupDto,
} from '../../api/pos/pos'
import { startNewSale } from '../../lib/posSale'
import { useCan } from '../../lib/session/session'
import type { TillState } from '../../lib/posTill'

type Ready = Extract<TillState, { status: 'ready' }>

/**
 * A refund at the till (Figma 143:20983): only for whoever holds "Refund at the till"
 * (`pos.refund`, managers by default), never while read-only (the server answers
 * `subscription-restricted`). The sale is found by its invoice number, from Today or the receipt.
 */
export function PosRefundPage() {
  return (
    <AppShell>
      <PosTillGate>
        {(till) => (till.can.refund ? <FindSale till={till} /> : <PermissionDeniedNotice />)}
      </PosTillGate>
    </AppShell>
  )
}

function FindSale({ till }: { till: Ready }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const invoice = params.get('invoice')?.trim() ?? ''
  const [typed, setTyped] = useState(invoice)
  const lookup = useApiRead<PosRefundLookupDto>(invoice ? refundLookupPath(invoice) : null)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <Link
        to="/pos/today"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
      >
        ‹ {t('pos.backToSale')}
      </Link>
      {!invoice || lookup.read.status === 'failed' ? (
        <div className="rounded-md bg-surface-card p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (typed.trim()) setParams({ invoice: typed.trim() })
            }}
          >
            <label className="flex h-[50px] w-full items-center gap-3 rounded-sm border border-primary-700 bg-surface-card px-4">
              <span className="sr-only">{t('pos.refund.findSale')}</span>
              <input
                value={typed}
                dir="ltr"
                maxLength={50}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={t('pos.refund.findSale')}
                className="h-full w-full min-w-0 border-0 bg-transparent text-base font-medium text-text-primary outline-none placeholder:text-text-placeholder rtl:text-end"
              />
            </label>
          </form>
          {lookup.read.status === 'failed' ? (
            refusalCode(lookup.read.error) === 'POS_SALE_NOT_FOUND' ? (
              <p className="mt-3 text-sm font-medium text-text-tertiary">
                {t('pos.refusal.POS_SALE_NOT_FOUND')}
              </p>
            ) : (
              <div className="mt-3">
                <ApiReadFailure error={lookup.read.error} retry={lookup.retry} />
              </div>
            )
          ) : null}
        </div>
      ) : lookup.read.status === 'loading' ? (
        <LoadingNotice />
      ) : (
        <Refund key={lookup.read.data.saleId} till={till} sale={lookup.read.data} />
      )}
    </div>
  )
}

function Refund({ till, sale }: { till: Ready; sale: PosRefundLookupDto }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  // A refund issues its credit note through the same cap as the composer (DA-1, backend #817):
  // the category and rate refused, and what is left there, in the till's own refusal line.
  const refusalSentence = (error: unknown) => {
    const capped = creditCapRefusal(error, t, 'OMR', i18n.language)
    return capped
      ? withRial(t(capped.key, capped.values))
      : t(posRefusalKey(error), refusalValues(error))
  }
  const navigate = useNavigate()
  const refundable = sale.lines.filter((line) => line.refundable && line.role !== 'ADD_ON')
  const [returning, setReturning] = useState<ReturnLine[]>(
    refundable.map((line) => ({ lineNumber: line.lineNumber, qty: 0 })),
  )
  /** Null until the cashier answers: a given-away item alone is assumed to go back on the shelf. */
  const [stockAnswer, setStock] = useState<StockChoice | null>(null)
  const [choice, setChoice] = useState<PutRightChoice>('moneyBack')
  const [why, setWhy] = useState<WhyId>('madeWrong')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<unknown>(null)
  const [done, setDone] = useState<PosRefundDto | null>(null)
  /** The server's own figure, once it has said what the credit note comes to. */
  const [expected, setExpected] = useState<number | null>(null)
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)

  const credit = creditFor(sale, returning)
  const stockReturn = onlyGivenAway(sale, returning)
  const stock: StockChoice = stockAnswer ?? (stockReturn ? 'backInStock' : 'thrownAway')
  // The tip the customer paid on top, which is never refunded (F-11): on the lookup since backend
  // #810; from an older server, read from the sale itself (`pos.read`), 0 without it.
  const mayReadSale = useCan('pos.read')
  const soldPath = sale.tip == null && mayReadSale ? `/v1/pos/sales/${sale.saleId}` : null
  const sold = useApiRead<PosSaleDto>(soldPath, () => loadPosSale(sale.saleId))
  const tipPaid =
    sale.tip != null
      ? toBaisa(sale.tip)
      : sold.read.status === 'ready'
        ? toBaisa(sold.read.data.tip)
        : 0
  // "Accepted by the OTA" (P.31): the lookup's own `filing` since backend #808 (not deployed
  // yet); from an older server, the sale read above carries it when it is made.
  const filing =
    sale.filing ?? (sold.read.status === 'ready' ? (sold.read.data.filing ?? null) : null)
  const acceptedByOta = Boolean(filing?.acceptedAt)
  const back = expected ?? credit.back
  const anything = credit.items > 0 || stockReturn
  const was = toBaisa(sale.total)
  const credited = toBaisa(sale.credited)

  const setQty = (lineNumber: number, qty: number) => {
    setExpected(null)
    setReturning((current) =>
      current.map((entry) => {
        if (entry.lineNumber !== lineNumber) return entry
        const line = sale.lines.find((l) => l.lineNumber === lineNumber)
        return { ...entry, qty: Math.max(0, Math.min(line ? remaining(line) : 0, qty)) }
      }),
    )
  }

  const refund = async () => {
    setBusy(true)
    setRefusal(null)
    const body = refundRequest({
      tillId: till.till.id,
      why,
      note,
      returning,
      backOnShelf: stock === 'backInStock',
      method: moneyBackMethod(sale),
      amount: back,
      noMoney: stockReturn,
    })
    const fingerprint = JSON.stringify(body)
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: newPosKey('refund') }
    }
    try {
      setDone(await createPosRefund(sale.saleId, body, attempt.current.key))
    } catch (error) {
      setRefusal(error)
      // The credit note's own total: the money back is set to it, for the cashier to confirm.
      const server = problemNumber(error, 'expected')
      if (
        error instanceof ApiError &&
        error.code === 'POS_REFUND_MONEY_DOES_NOT_MATCH' &&
        server != null
      ) {
        setExpected(toBaisa(server))
      }
    } finally {
      setBusy(false)
    }
  }

  const paid = sale.paid.byMethod
    .filter((entry) => entry.amount > 0)
    .map((entry) => `${t(`pos.refund.method.${entry.method}`)} ${omr(toBaisa(entry.amount))}`)
    .join(' · ')

  // Nothing left to send back: no form that could only say "Refund 0.000".
  if (!done && !refundable.some((line) => remaining(line) > 0)) {
    return (
      <p
        role="status"
        className="rounded-md bg-surface-card p-5 text-sm font-medium text-text-secondary"
      >
        <span dir="ltr">{sale.invoiceNumber}</span>
        {': '}
        {credited > 0
          ? t('pos.refund.alreadyRefunded', { numbers: sale.creditNoteNumbers.join(', ') })
          : t('pos.refund.nothingToRefund')}
      </p>
    )
  }

  return (
    <>
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('pos.refund.title')}
        </h1>
        <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
          {t('pos.refund.soldAt', {
            invoice: sale.invoiceNumber,
            when: new Date(sale.soldAt).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'long',
              timeZone: 'Asia/Muscat',
            }),
            time: tillTime(sale.soldAt, locale),
            branch: sale.branch.name ?? '',
          })}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[320px] flex-1 flex-col gap-4">
          <section className="rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div>
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.refund.whatsGoingBack')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.refund.tickTheLines')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExpected(null)
                  setReturning(
                    refundable.map((line) => ({
                      lineNumber: line.lineNumber,
                      qty: remaining(line),
                    })),
                  )
                }}
                className="text-sm font-semibold text-primary-700"
              >
                {t('pos.refund.allOfIt')}
              </button>
            </div>

            {/* The invoice and its lines run the full width of the card, divided like rows. */}
            <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary-25 text-primary-700">
                <DocumentIcon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text-primary">
                  <span dir="ltr">{sale.invoiceNumber}</span> ·{' '}
                  {/* A walk-in's stored name is the server's English placeholder, not a person. */}
                  {sale.customer.kind === 'WALK_IN' || !sale.customer.name
                    ? t('pos.refund.walkIn')
                    : sale.customer.name}
                </span>
                <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                  {withRial(`${paid}${paid ? ' · ' : ''}OMR ${omr(was)}`)}
                </span>
              </span>
              {acceptedByOta ? (
                <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-success-700">
                  <span className="size-1.5 rounded-full bg-current" />
                  {t('pos.refund.acceptedByOta')}
                </span>
              ) : null}
            </div>

            <ul>
              {refundable.map((line) => {
                const entry = returning.find((r) => r.lineNumber === line.lineNumber)
                const qty = entry?.qty ?? 0
                const left = remaining(line)
                return (
                  <li
                    key={line.lineNumber}
                    className={[
                      'flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3.5 last:border-b-0',
                      qty > 0 ? 'bg-primary-25' : '',
                    ].join(' ')}
                  >
                    <TableCheckbox
                      checked={qty > 0}
                      onChange={() => setQty(line.lineNumber, qty > 0 ? 0 : left)}
                      ariaLabel={t('pos.refund.sendBack', { name: line.description })}
                    />
                    <span className="min-w-[180px] flex-1">
                      <span className="block text-base font-medium leading-[1.2] text-text-primary">
                        {line.description}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-text-quaternary">
                        {line.givenFree
                          ? t('pos.refund.givenFreeLine')
                          : line.discount && line.discount.value > 0
                            ? t('pos.refund.eachLessDiscount', {
                                each: omr(toBaisa(line.unitPrice)),
                                discount:
                                  line.discount.type === 'PERCENTAGE'
                                    ? `${line.discount.value}%`
                                    : omr(toBaisa(line.discount.value)),
                              })
                            : t('pos.refund.eachNoDiscountLive', {
                                each: omr(toBaisa(line.unitPrice)),
                              })}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-sm border border-border-subtle bg-white">
                      <button
                        type="button"
                        onClick={() => setQty(line.lineNumber, qty - 1)}
                        aria-label={t('pos.oneFewer', { name: line.description })}
                        className="flex size-8 items-center justify-center text-text-secondary"
                      >
                        −
                      </button>
                      <span className="min-w-[46px] text-center text-sm font-semibold tabular-nums text-text-primary">
                        {qty}{' '}
                        <span className="text-xs font-medium text-text-quaternary">
                          {t('pos.refund.ofSold', { count: left })}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setQty(line.lineNumber, qty + 1)}
                        aria-label={t('pos.oneMore', { name: line.description })}
                        className="flex size-8 items-center justify-center text-text-secondary"
                      >
                        +
                      </button>
                    </span>
                    <span className="w-[80px] shrink-0 text-end text-base font-semibold text-text-primary">
                      {omr(creditFor(sale, [{ lineNumber: line.lineNumber, qty }]).back)}
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
              <div className="min-w-[240px] flex-1">
                <p className="text-sm font-semibold text-text-primary">
                  {t('pos.refund.backOnShelf')}
                </p>
                <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('pos.refund.backOnShelfNote')}
                </p>
              </div>
              <div className="inline-flex shrink-0 rounded-sm bg-surface-background p-1">
                {(['backInStock', 'thrownAway'] as StockChoice[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStock(option)}
                    aria-pressed={stock === option}
                    className={[
                      'inline-flex h-9 items-center whitespace-nowrap rounded-sm px-3 text-sm transition-colors',
                      stock === option
                        ? 'bg-surface-card font-semibold text-text-primary shadow-sm'
                        : 'font-medium text-text-quaternary',
                    ].join(' ')}
                  >
                    {t(`pos.refund.${option}`)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-md bg-surface-card">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.refund.moneyOrSwap')}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 px-5 py-4 max-md:grid-cols-1">
              {(['moneyBack', 'makeAnother'] as PutRightChoice[]).map((option) => {
                const chosen = option === choice
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setChoice(option)}
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
                        {t(`pos.refund.${option}`)}
                      </span>{' '}
                      <span className="text-xs font-medium leading-[1.5] text-text-quaternary">
                        {t(`pos.refund.${option}NoteLive`, {
                          amount: omr(back),
                          method: t(`pos.refund.method.${moneyBackMethod(sale)}`),
                        })}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-md bg-surface-card">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.refund.why')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('pos.refund.whyNote')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {WHY_OPTIONS.map((option) => {
                const chosen = option === why
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setWhy(option)}
                    aria-pressed={chosen}
                    className={[
                      'inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-sm border px-3 text-sm transition-colors',
                      chosen
                        ? 'border-primary-700 bg-primary-25 font-semibold text-primary-800'
                        : 'border-border-subtle bg-white font-medium text-text-secondary hover:border-primary-300',
                    ].join(' ')}
                  >
                    {t(`pos.refund.reason.${option}`)}
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
                placeholder={t('pos.refund.anythingToAdd')}
                className="w-full resize-none rounded-sm border border-border-subtle bg-white px-4 py-3 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand"
              />
            </div>
          </section>
        </div>

        <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-base font-medium leading-[1.2] text-text-primary">
              {t('pos.refund.creditNote')}
            </h2>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {done
                ? done.creditNoteNumber
                  ? t('pos.refund.filedStraightAway', { number: done.creditNoteNumber })
                  : t('pos.refund.noCreditNote')
                : stockReturn
                  ? t('pos.refund.noCreditNote')
                  : t('pos.refund.willBeFiled')}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 px-5 py-4">
            {returning
              .filter((entry) => entry.qty > 0)
              .map((entry) => {
                const line = sale.lines.find((l) => l.lineNumber === entry.lineNumber)
                if (!line) return null
                return (
                  <Row
                    key={entry.lineNumber}
                    label={`${entry.qty} × ${line.description}`}
                    value={omr(toBaisa(line.unitPrice) * entry.qty)}
                  />
                )
              })}
            {!anything ? (
              <p className="py-6 text-center text-sm font-medium text-text-tertiary">
                {t('pos.refund.nothingSelected')}
              </p>
            ) : (
              <>
                {credit.discount > 0 ? (
                  <Row label={t('pos.refund.discountsBack')} value={omrSigned(-credit.discount)} />
                ) : null}
                <Row label={t('pos.done.beforeVat')} value={omr(credit.beforeVat)} />
                <Row label={t('pos.totals.vatMixed')} value={omr(credit.vat)} />
                <Row label={t('pos.refund.tipNotRefunded')} value={omr(tipPaid)} />
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
            <span className="text-lg font-medium text-text-primary">
              {t('pos.refund.backToThem')}
            </span>
            <span className="inline-flex items-baseline gap-1.5 text-[26px] font-semibold leading-none text-danger-700">
              <Rial />
              {omr(anything ? back : 0)}
            </span>
          </div>

          <div className="mx-5 rounded-sm bg-surface-background p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
              {t('pos.refund.worthAfterwards', { invoice: sale.invoiceNumber })}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <Row label={t('pos.refund.was')} value={omr(was)} />
              <Row
                label={t('pos.refund.credited')}
                value={omrSigned(-(credited + (anything ? back : 0)))}
              />
              <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
                <span className="text-sm font-semibold text-text-primary">
                  {t('pos.refund.standsAt')}
                </span>
                <span className="text-sm font-semibold tabular-nums text-text-primary">
                  {omr(standsAt(was, credited, anything ? back : 0))}
                </span>
              </div>
            </div>
          </div>

          {refusal ? (
            <p
              role="alert"
              className="mx-5 mt-4 rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700"
            >
              {refusalSentence(refusal)}
            </p>
          ) : null}

          <div className="mt-5 border-t border-border-subtle px-5 py-5">
            {done ? (
              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 rounded-sm bg-success-100 px-3 py-3 text-sm font-medium text-success-700">
                  <CheckIcon className="size-4 shrink-0" />
                  {done.creditNoteNumber
                    ? t('pos.refund.done', { number: done.creditNoteNumber })
                    : t('pos.refund.stockReturnDone')}
                </p>
                {done.warnings.map((warning, index) => (
                  <p
                    key={`${warning.code}-${index}`}
                    className="text-xs font-medium text-pending-700"
                  >
                    {t(`pos.warning.${warning.code}`, {
                      line: warning.line ?? '',
                      defaultValue: t('pos.warning.other'),
                    })}
                  </p>
                ))}
                {choice === 'makeAnother' ? (
                  <button
                    type="button"
                    onClick={() => {
                      startNewSale()
                      navigate('/pos')
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white"
                  >
                    {t('pos.refund.ringNew')}
                  </button>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                disabled={!anything || busy || (why === 'other' && !note.trim())}
                onClick={() => void refund()}
                className="inline-flex h-[52px] w-full items-center justify-center rounded-sm bg-danger-700 text-base font-semibold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {stockReturn
                  ? t('pos.refund.stockReturnButton')
                  : t('pos.refund.refundAmount', { amount: omr(anything ? back : 0) })}
              </button>
            )}
          </div>
          {stockReturn ? null : <PosFootNote>{t('pos.refund.filedNoteLive')}</PosFootNote>}
        </aside>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      <span dir="ltr" className="text-sm font-semibold tabular-nums text-text-primary">
        {value}
      </span>
    </div>
  )
}
