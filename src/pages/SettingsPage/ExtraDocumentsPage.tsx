import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { OutstandingBill, formatRate } from './SubscriptionBillingSection'
import { ReconnectBeforePayingNote } from './ReconnectBeforePayingNote'
import { usePayingHeldUntilReconnected } from '../../hooks/usePayingHeldUntilReconnected'
import { useApiRead, type ApiRead } from '../../hooks'
import { usePlanName } from '../../hooks/usePlanName'
import { useCan } from '../../lib/session/session'
import { ApiError } from '../../api'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { Button, OmAmount } from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { Pill } from '../ErpPage/ErpShell'
import { SECONDARY_BUTTON, SectionCard } from '../ErpPage/overview/idiom'
import { formatAmount, formatCount, formatDate, formatInstantDay } from '../../lib/format'
import { BILLING_PATH, loadBillingOverview, type BillingOverviewDto } from '../../api/settings/billing'
import {
  EXTRA_DOCUMENTS_PATH,
  loadExtraDocuments,
  orderExtraDocuments,
  quoteExtraDocuments,
  type ExtraDocumentCreditDto,
  type ExtraDocumentQuoteDto,
  type ExtraDocumentsOverviewDto,
  type ExtraDocumentsPurchaseDto,
} from '../../api/settings/extraDocuments'

/** Ordering and paying are `tenant.plan.manage`, as on Bills and payment; reading is `tenant.plan.read`. */
const PLAN_MANAGE = 'tenant.plan.manage'
const LIVE_PAYMENT = ['SUBMITTED', 'RECEIPT_RECORDED', 'AWAITING_SECOND_APPROVAL']
const QUOTE_DELAY_MS = 300

/**
 * Settings › Plan and usage › Buy extra documents (no Figma frame: house standard, the Plan and
 * Bills pages' idiom). Extra documents are bought ahead, between the console's minimum and maximum
 * per purchase, at the plan's per-document rate; the price, VAT and limits are all the server's
 * (`GET /v1/settings/plan/extra-documents` and its `/quote`). Ordering issues a bill
 * (`POST …/purchases`) that is paid with the same form as every subscription bill, and the
 * documents are added only once the server confirms the payment: by card at once, by bank transfer
 * or cash when Fawtir confirms it.
 */
export function ExtraDocumentsPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="billing">
      <SettingsHeader
        title={t('extraDocuments.title')}
        subtitle={t('extraDocuments.subtitle')}
        actions={
          <Link to="/settings/plan" className={SECONDARY_BUTTON}>
            {t('extraDocuments.backToPlan')}
          </Link>
        }
      />
      <ReconnectBeforePayingNote />
      <ExtraDocumentsBody />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permission is read from. */
function ExtraDocumentsBody() {
  const { t, i18n } = useTranslation()
  const extras = useApiRead<ExtraDocumentsOverviewDto>(EXTRA_DOCUMENTS_PATH, loadExtraDocuments)
  const mayManage = useCan(PLAN_MANAGE)
  // LV-6: no extra documents are ordered once the company has left Fawtir (A3.8).
  const held = usePayingHeldUntilReconnected()
  const outstanding = extras.read.status === 'ready' ? extras.read.data.outstanding : null
  // The bill's payments and the ways to pay come from Bills and payment, read only once there is
  // a bill to pay.
  const billing = useApiRead<BillingOverviewDto>(outstanding ? BILLING_PATH : null, loadBillingOverview)
  const [notice, setNotice] = useState<string | null>(null)
  // The order being paid: once the server lists it as added, the screen says so.
  const [watched, setWatched] = useState<string | null>(null)
  const [reportedCards, setReportedCards] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (outstanding) setWatched(outstanding.credit.id)
  }, [outstanding])

  if (extras.read.status === 'loading') return <LoadingNotice />
  if (extras.read.status === 'failed') return <ApiReadFailure error={extras.read.error} retry={extras.retry} />
  const data = extras.read.data

  const reload = (why?: string) => {
    setNotice(why ?? null)
    extras.retry()
    billing.retry()
  }
  const added = watched
    ? data.credits.find((credit) => credit.id === watched && credit.status === 'ACTIVE')
    : undefined

  return (
    <>
      <AllowanceCard data={data} />
      {added ? (
        <p role="status" className="rounded-sm bg-success-100 px-4 py-3 text-sm font-medium leading-[1.6] text-success-700">
          {t('extraDocuments.result.added', {
            count: added.documents,
            documents: formatCount(added.documents, i18n.language),
          })}
        </p>
      ) : null}
      {notice && !added ? (
        <p role="status" className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700">
          {notice}
        </p>
      ) : null}
      {!data.offered ? (
        <SectionCard title={t('extraDocuments.buy.title')}>
          <div className="p-5 pt-0">
            <Callout>{t('extraDocuments.notOffered')}</Callout>
          </div>
        </SectionCard>
      ) : outstanding ? (
        <OrderCard
          data={data}
          order={outstanding}
          billing={billing.read}
          retryBilling={billing.retry}
          mayManage={mayManage}
          held={held}
          reportedCards={reportedCards}
          onChanged={reload}
          onCardFinished={(paymentId, why) => {
            setReportedCards((seen) => new Set(seen).add(paymentId))
            reload(why)
          }}
        />
      ) : held ? null : mayManage ? (
        <SectionCard title={t('extraDocuments.buy.title')} note={t('extraDocuments.buy.note')}>
          <div className="p-5 pt-0">
            <BuyForm data={data} initial={data.minPerPurchase} onOrdered={() => reload()} />
          </div>
        </SectionCard>
      ) : (
        <SectionCard title={t('extraDocuments.buy.title')}>
          <div className="p-5 pt-0">
            <Callout>{t('extraDocuments.noPermission')}</Callout>
          </div>
        </SectionCard>
      )}
      <HistoryCard credits={data.credits} />
    </>
  )
}

/** This month's allowance as the server splits it: the plan's own documents, then the extras. */
function AllowanceCard({ data }: { data: ExtraDocumentsOverviewDto }) {
  const { t, i18n } = useTranslation()
  const number = (value: number) => formatCount(value, i18n.language)
  const date = (iso: string) => formatDate(iso, i18n.language)
  const { allowance } = data
  return (
    <SectionCard
      title={t('extraDocuments.month.title')}
      note={t('extraDocuments.month.period', {
        start: date(allowance.periodStart),
        end: date(allowance.periodEnd),
        reset: date(allowance.resetsOn),
      })}
    >
      <div className="flex flex-col gap-5 p-5 pt-0">
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label={t('extraDocuments.month.plan')} value={number(allowance.planDocuments)} />
          <Fact label={t('extraDocuments.month.extra')} value={number(allowance.extraDocuments)} />
          <Fact
            label={t('extraDocuments.month.used')}
            value={t('extraDocuments.month.usedOf', {
              used: number(allowance.used),
              total: number(allowance.totalAllowance),
            })}
          />
          <Fact label={t('extraDocuments.month.left')} value={number(allowance.left)} />
        </dl>
        {!allowance.issuingAllowed ? <Callout tone="danger">{t('extraDocuments.month.none')}</Callout> : null}
        {allowance.receivedHidden > 0 ? (
          <Callout>
            {t('extraDocuments.month.held', {
              count: allowance.receivedHidden,
              documents: number(allowance.receivedHidden),
            })}
          </Callout>
        ) : null}
        <p className="text-xs font-medium leading-[1.6] text-text-tertiary">
          {t('extraDocuments.month.expiry', { date: date(allowance.extrasExpireOn) })}
        </p>
      </div>
    </SectionCard>
  )
}

/**
 * The number to buy and the server's price for it. The field takes whole numbers between the
 * console's minimum and maximum; the price is asked for only once the number is within them, and
 * the order button waits for the price of exactly that number.
 */
function BuyForm({
  data,
  initial,
  onOrdered,
  onCancel,
}: {
  data: ExtraDocumentsOverviewDto
  initial: number
  onOrdered: () => void
  onCancel?: () => void
}) {
  const { t, i18n } = useTranslation()
  const { minPerPurchase: min, maxPerPurchase: max } = data
  const [text, setText] = useState(String(initial))
  const parsed = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null
  const valid = parsed !== null && parsed >= min && parsed <= max
  const [quote, setQuote] = useState<ExtraDocumentQuoteDto | null>(null)
  const [quoteFailure, setQuoteFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ReactNode>(null)
  // Set before any re-render can disable the button: two clicks in one tick still order once.
  const inFlight = useRef(false)
  const planName = usePlanName()

  useEffect(() => {
    setQuoteFailure(null)
    if (!valid || parsed === null) {
      setQuote(null)
      return
    }
    const request = new AbortController()
    const timer = setTimeout(() => {
      quoteExtraDocuments(parsed, request.signal).then(
        (answer) => setQuote(answer),
        (error: unknown) => {
          if (request.signal.aborted) return
          setQuote(null)
          setQuoteFailure(refusalMessage(t, error, min, max))
        },
      )
    }, QUOTE_DELAY_MS)
    return () => {
      clearTimeout(timer)
      request.abort()
    }
  }, [parsed, valid, min, max, t])

  const step = (by: number) => {
    const from = parsed ?? min
    setText(String(Math.min(max, Math.max(min, from + by))))
  }
  const priced = quote !== null && quote.documents === parsed ? quote : null
  const money = (value: string) => <OmAmount amount={formatAmount(value, 'OMR', i18n.language)} size="xs" />

  const order = async () => {
    if (inFlight.current || !priced) return
    inFlight.current = true
    setBusy(true)
    setFailure(null)
    try {
      await orderExtraDocuments(priced.documents)
      onOrdered()
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.problemType === 'subscription-state-conflict' ? (
          <>
            {t('extraDocuments.refusal.subscription-state-conflict')}{' '}
            <Link to="/settings/bills" className="font-semibold underline">
              {t('extraDocuments.refusal.payFirstLink')}
            </Link>
          </>
        ) : (
          refusalMessage(t, error, min, max)
        ),
      )
      setBusy(false)
    } finally {
      inFlight.current = false
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="extra-documents-count" className="text-sm font-medium leading-[1.2] text-text-primary">
          {t('extraDocuments.buy.count')}
        </label>
        <div className="flex w-fit items-center gap-1 rounded-sm border border-border-default bg-surface-tab-bar">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={busy || (parsed !== null && parsed <= min)}
            aria-label={t('extraDocuments.buy.fewer')}
            className="flex size-[48px] items-center justify-center text-lg text-text-secondary transition-colors hover:text-primary-800 disabled:text-text-quaternary"
          >
            −
          </button>
          <input
            id="extra-documents-count"
            inputMode="numeric"
            dir="ltr"
            value={text}
            disabled={busy}
            onFocus={selectAllOnFocus}
            onChange={(event) => setText(event.target.value.replace(/[^\d]/g, ''))}
            aria-invalid={valid ? undefined : true}
            aria-describedby="extra-documents-count-hint"
            className="h-[48px] w-[110px] bg-transparent text-center text-base font-semibold tabular-nums text-text-primary outline-none"
          />
          <button
            type="button"
            onClick={() => step(1)}
            disabled={busy || (parsed !== null && parsed >= max)}
            aria-label={t('extraDocuments.buy.more')}
            className="flex size-[48px] items-center justify-center text-lg text-text-secondary transition-colors hover:text-primary-800 disabled:text-text-quaternary"
          >
            +
          </button>
        </div>
        <p
          id="extra-documents-count-hint"
          role={valid ? undefined : 'alert'}
          className={[
            'text-xs font-medium leading-[1.2]',
            valid ? 'text-text-quaternary' : 'text-text-danger',
          ].join(' ')}
        >
          {t('extraDocuments.buy.limits', {
            min: formatCount(min, i18n.language),
            max: formatCount(max, i18n.language),
          })}
        </p>
      </div>

      {priced ? (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2 rounded-sm bg-surface-background px-4 py-3 text-sm">
            <Line
              label={
                <span className="inline-flex flex-wrap items-center gap-1">
                  {t('extraDocuments.quote.line', {
                    count: priced.documents,
                    documents: formatCount(priced.documents, i18n.language),
                  })}{' '}
                  × {money(priced.unitPrice)}
                </span>
              }
              value={money(priced.netAmount)}
            />
            {/* Rate 0 is how the server says no VAT is charged: no line, rather than "VAT 0%". */}
            {Number(priced.vatRate) === 0 ? null : (
              <Line
                label={t('billing.bill.vat', { rate: formatRate(priced.vatRate, i18n.language) })}
                value={money(priced.vatAmount)}
              />
            )}
            <Line label={t('billing.bill.total')} value={money(priced.total)} strong />
          </dl>
          <p className="text-xs font-medium leading-[1.6] text-text-tertiary">
            {t('extraDocuments.quote.expires', { date: formatDate(priced.expiresOn, i18n.language) })}
          </p>
          {priced.upgradeSuggested && priced.nextPlanCode ? (
            <Callout>
              {t('extraDocuments.quote.upgrade', { plan: planName(priced.nextPlanCode, priced.nextPlanCode) })}
            </Callout>
          ) : null}
        </div>
      ) : valid && !quoteFailure ? (
        <p role="status" className="text-sm font-medium text-text-tertiary">
          {t('extraDocuments.quote.loading')}
        </p>
      ) : null}
      {quoteFailure ? <Alert>{quoteFailure}</Alert> : null}

      <p className="text-xs font-medium leading-[1.6] text-text-tertiary">{t('extraDocuments.buy.howAdded')}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="md" disabled={!priced || busy} aria-busy={busy} onClick={order}>
          {t('extraDocuments.buy.submit')}
        </Button>
        {onCancel ? (
          <Button variant="ghost" size="md" disabled={busy} onClick={onCancel}>
            {t('extraDocuments.order.keep')}
          </Button>
        ) : null}
      </div>
      {failure ? <Alert>{failure}</Alert> : null}
    </div>
  )
}

/**
 * The order still to pay: what it buys, its bill and the same payment form as Bills and payment.
 * While nothing has been sent for it yet the number can be changed; the server then replaces the
 * unpaid order with a new one.
 */
function OrderCard({
  data,
  order,
  billing,
  retryBilling,
  mayManage,
  held,
  reportedCards,
  onChanged,
  onCardFinished,
}: {
  data: ExtraDocumentsOverviewDto
  order: ExtraDocumentsPurchaseDto
  billing: ApiRead<BillingOverviewDto>
  retryBilling: () => void
  mayManage: boolean
  /** Changing the order places a new one, which the server refuses once the company has left. */
  held: boolean
  reportedCards: ReadonlySet<string>
  onChanged: (why?: string) => void
  onCardFinished: (paymentId: string, why: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [changing, setChanging] = useState(false)
  const documents = formatCount(order.credit.documents, i18n.language)
  const line = t('extraDocuments.quote.line', { count: order.credit.documents, documents })

  let body: ReactNode
  if (billing.status === 'loading') body = <LoadingNotice />
  else if (billing.status === 'failed') body = <ApiReadFailure error={billing.error} retry={retryBilling} />
  else {
    // The newest bills are listed first, so the order just issued is among them; its payments and
    // the card option come from there. Without it, the bill alone is shown with no way to pay
    // that could invite paying twice.
    const listed = billing.data.bills.find((entry) => entry.bill.id === order.bill.id)
    const payments = listed?.payments ?? []
    const live = payments.some((payment) => LIVE_PAYMENT.includes(payment.status))
    const changeable = mayManage && !held && order.bill.status === 'OPEN' && !live && listed !== undefined
    body = changing && !held ? (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-text-secondary">{t('extraDocuments.order.replaces')}</p>
        <BuyForm
          data={data}
          initial={order.credit.documents}
          onOrdered={() => {
            setChanging(false)
            onChanged()
          }}
          onCancel={() => setChanging(false)}
        />
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        <OutstandingBill
          key={order.bill.id + order.bill.status}
          bill={listed?.bill ?? order.bill}
          payments={payments}
          card={listed?.card ?? null}
          overview={billing.data}
          canPay={mayManage && listed !== undefined}
          reportedCards={reportedCards}
          onChanged={onChanged}
          onCardFinished={onCardFinished}
          subtotalLabel={line}
        />
        {changeable ? (
          <div>
            <Button variant="ghost" size="md" onClick={() => setChanging(true)}>
              {t('extraDocuments.order.change')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <SectionCard
      title={t('extraDocuments.order.title')}
      note={t('extraDocuments.order.note', { count: order.credit.documents, documents })}
    >
      <div className="p-5 pt-0">{body}</div>
    </SectionCard>
  )
}

const SOURCE_KEY: Record<ExtraDocumentCreditDto['source'], string> = {
  PURCHASE: 'extraDocuments.history.source.PURCHASE',
  GRANT: 'extraDocuments.history.source.GRANT',
  GIVE_BACK: 'extraDocuments.history.source.GIVE_BACK',
}

const STATUS_TONE = { PENDING: 'pending', ACTIVE: 'success', CANCELLED: 'neutral' } as const

/** Every batch of extra documents the server lists: bought, granted or given back by Fawtir. */
function HistoryCard({ credits }: { credits: ExtraDocumentCreditDto[] }) {
  const { t, i18n } = useTranslation()
  if (credits.length === 0) return null
  return (
    <SectionCard title={t('extraDocuments.history.title')} note={t('extraDocuments.history.note')}>
      <ul className="flex flex-col divide-y divide-surface-background border-t border-surface-background">
        {credits.map((credit) => (
          <li key={credit.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold text-text-primary">
                {t('extraDocuments.quote.line', {
                  count: credit.documents,
                  documents: formatCount(credit.documents, i18n.language),
                })}
              </span>
              <span className="text-xs font-medium text-text-tertiary">
                {t(SOURCE_KEY[credit.source])} ·{' '}
                {formatInstantDay(credit.activatedAt ?? credit.createdAt, i18n.language)}
                {credit.status === 'ACTIVE' && credit.expiresOn
                  ? ` · ${t('extraDocuments.history.ends', { date: formatDate(credit.expiresOn, i18n.language) })}`
                  : ''}
              </span>
            </span>
            <span className="flex items-center gap-3">
              {credit.netAmount ? (
                <OmAmount amount={formatAmount(credit.netAmount, 'OMR', i18n.language)} size="xs" />
              ) : null}
              <Pill tone={STATUS_TONE[credit.status]} label={t(`extraDocuments.history.status.${credit.status}`)} />
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm font-medium text-text-quaternary">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-text-primary">{value}</dd>
    </div>
  )
}

function Line({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}>{label}</dt>
      <dd className={strong ? 'font-semibold text-text-primary' : 'font-medium text-text-primary'}>{value}</dd>
    </div>
  )
}

function Callout({ children, tone = 'pending' }: { children: ReactNode; tone?: 'pending' | 'danger' }) {
  return (
    <p
      role="status"
      className={[
        'rounded-sm px-4 py-3 text-sm font-medium leading-[1.6]',
        tone === 'danger' ? 'bg-danger-100 text-danger-700' : 'bg-pending-100 text-pending-700',
      ].join(' ')}
    >
      {children}
    </p>
  )
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700">
      {children}
    </p>
  )
}

const KNOWN_REFUSALS = [
  'extra-documents-not-offered',
  'billing-not-configured',
  'subscription-not-tracked',
  'subscription-state-conflict',
  'payment-state-conflict',
]

/** Our own sentence for each refusal the server gives; its English `detail` is never shown. */
function refusalMessage(
  t: (key: string, values?: Record<string, string>) => string,
  error: unknown,
  min: number,
  max: number,
): string {
  if (error instanceof ApiError) {
    if (error.problemType && KNOWN_REFUSALS.includes(error.problemType)) {
      return t(`extraDocuments.refusal.${error.problemType}`)
    }
    if (error.status === 400) {
      return t('extraDocuments.refusal.outOfRange', { min: String(min), max: String(max) })
    }
  }
  return t('billing.refusal.other')
}
