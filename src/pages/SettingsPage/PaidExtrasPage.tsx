import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { OutstandingBill, formatRate } from './SubscriptionBillingSection'
import { ReconnectBeforePayingNote } from './ReconnectBeforePayingNote'
import { StaysReadOnlyUntilPaidNote } from './StaysReadOnlyUntilPaidNote'
import { usePayingHeldUntilReconnected } from '../../hooks/usePayingHeldUntilReconnected'
import { noteLeftFawtirRefusal } from '../../lib/leftFawtirRefusal'
import { LeftFawtirRefusal } from '../../components/billing/LeftFawtirRefusal'
import { useApiRead, type ApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import { ApiError } from '../../api'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { Button, Checkbox, Modal, OmAmount } from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { Pill } from '../ErpPage/ErpShell'
import { SECONDARY_BUTTON, SectionCard } from '../ErpPage/overview/idiom'
import { formatAmount, formatCount, formatDate, formatInstantDay } from '../../lib/format'
import {
  BILLING_PATH,
  loadBillingOverview,
  type BillingOverviewDto,
} from '../../api/settings/billing'
import {
  SUBSCRIPTION_PATH,
  loadSubscription,
  type SubscriptionStatusDto,
} from '../../api/settings/subscription'
import {
  PAID_EXTRAS_PATH,
  keepErpAddon,
  loadPaidExtras,
  orderPaidExtras,
  quotePaidExtras,
  stopErpAddon,
  type ErpAddonOverviewDto,
  type PaidExtraPlaceDto,
  type PaidExtrasOrderDto,
  type PaidExtrasOverviewDto,
  type PaidExtrasQuoteDto,
  type PaidExtrasSelection,
  type PlaceKind,
  type PlaceKindOverviewDto,
} from '../../api/settings/paidExtras'

/** Ordering, paying and stopping the add-on are `tenant.plan.manage`; reading is `tenant.plan.read`. */
const PLAN_MANAGE = 'tenant.plan.manage'
const LIVE_PAYMENT = ['SUBMITTED', 'RECEIPT_RECORDED', 'AWAITING_SECOND_APPROVAL']
const QUOTE_DELAY_MS = 300
const NOTHING: PaidExtrasSelection = { users: 0, branches: 0, erpAddon: false }

/**
 * Settings › Plan and usage › Extra users, branches and add-on (no Figma frame: house standard,
 * copied from Buy extra documents). Above what the plan includes, each extra user or branch is a
 * paid place: pro rata for the rest of the period, then on the renewal bill (US-1, BR-3). The ERP
 * and API add-on is bought and stopped the same way on the plans that offer it (ER-1, ER-2).
 * Removing a user or branch takes effect at the renewal and nothing is refunded (US-2, BR-4).
 *
 * Every figure is the server's (`GET /v1/settings/plan/extras` and its `/quote`); ordering issues a
 * bill paid with the same form as every subscription bill, and the places start only once the
 * server confirms the payment.
 */
export function PaidExtrasPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="billing">
      <SettingsHeader
        title={t('paidExtras.title')}
        subtitle={t('paidExtras.subtitle')}
        actions={
          <Link to="/settings/plan" className={SECONDARY_BUTTON}>
            {t('paidExtras.backToPlan')}
          </Link>
        }
      />
      <ReconnectBeforePayingNote />
      <PaidExtrasBody />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permission is read from. */
function PaidExtrasBody() {
  const { t } = useTranslation()
  const extras = useApiRead<PaidExtrasOverviewDto>(PAID_EXTRAS_PATH, loadPaidExtras)
  // Shared with the subscription section: whether buying is possible at all in this state.
  const subscription = useApiRead<SubscriptionStatusDto>(SUBSCRIPTION_PATH, loadSubscription).read
  const mayManage = useCan(PLAN_MANAGE)
  // LV-6: no users, branches or add-on are ordered once the company has left Fawtir (A3.8).
  const held = usePayingHeldUntilReconnected()
  const outstanding = extras.read.status === 'ready' ? extras.read.data.outstanding : null
  const billing = useApiRead<BillingOverviewDto>(
    outstanding ? BILLING_PATH : null,
    loadBillingOverview,
  )
  const [notice, setNotice] = useState<string | null>(null)
  // The bill being paid: once the server lists its places as active, the screen says so.
  const [watched, setWatched] = useState<string | null>(null)
  const [reportedCards, setReportedCards] = useState<ReadonlySet<string>>(new Set())
  // "Add the add-on" on its card opens the order form with the add-on ticked.
  const [preset, setPreset] = useState<PaidExtrasSelection>(NOTHING)
  useEffect(() => {
    if (outstanding) setWatched(outstanding.bill.id)
  }, [outstanding])

  if (extras.read.status === 'loading') return <LoadingNotice />
  if (extras.read.status === 'failed')
    return <ApiReadFailure error={extras.read.error} retry={extras.retry} />
  const data = extras.read.data

  const reload = (why?: string) => {
    setNotice(why ?? null)
    extras.retry()
    billing.retry()
  }
  const added =
    watched !== null && !outstanding
      ? data.places.some((place) => place.billId === watched && place.status === 'ACTIVE')
      : false
  const access = subscription.status === 'ready' ? subscription.data.access : null
  const blocked = !data.open
    ? t('paidExtras.notOpen')
    : access === 'TRIAL'
      ? t('paidExtras.refusal.paid-extras-not-in-trial')
      : access === 'NOT_TRACKED'
        ? t('paidExtras.refusal.subscription-not-tracked')
        : null
  const payFirst = data.open && (access === 'PAYMENT_REQUIRED' || access === 'CANCELLED')
  const canAddAddon =
    mayManage &&
    !held &&
    !blocked &&
    !payFirst &&
    !outstanding &&
    data.erpAddon.offered &&
    (data.erpAddon.status === null || data.erpAddon.status === 'ENDED')

  return (
    <>
      <PlacesCard data={data} />
      <StaysReadOnlyUntilPaidNote />
      {data.erpAddon.offered ? (
        <ErpAddonCard
          addon={data.erpAddon}
          mayManage={mayManage}
          onAdd={canAddAddon ? () => setPreset({ ...NOTHING, erpAddon: true }) : undefined}
          onChanged={reload}
        />
      ) : null}
      {added ? (
        <p
          role="status"
          className="rounded-sm bg-success-100 px-4 py-3 text-sm font-medium leading-[1.6] text-success-700"
        >
          {t('paidExtras.result.added')}
        </p>
      ) : null}
      {notice && !added ? (
        <p
          role="status"
          className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700"
        >
          {notice}
        </p>
      ) : null}
      {outstanding ? (
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
      ) : held ? (
        <LeftFawtirRefusal />
      ) : (
        <SectionCard title={t('paidExtras.buy.title')} note={t('paidExtras.buy.note')}>
          <div className="p-5 pt-0">
            {blocked ? (
              <Callout>{blocked}</Callout>
            ) : payFirst ? (
              <Callout>
                {t('paidExtras.refusal.subscription-state-conflict')}{' '}
                <Link to="/settings/bills" className="font-semibold underline">
                  {t('paidExtras.refusal.payFirstLink')}
                </Link>
              </Callout>
            ) : !mayManage ? (
              <Callout>{t('paidExtras.noPermission')}</Callout>
            ) : (
              <BuyForm
                key={JSON.stringify(preset)}
                data={data}
                initial={preset}
                onOrdered={() => {
                  setPreset(NOTHING)
                  reload()
                }}
              />
            )}
          </div>
        </SectionCard>
      )}
      <HistoryCard places={data.places} />
    </>
  )
}

/**
 * Users and branches against the plan: in use, the capacity (included plus paid places), and the
 * price of one more place a month. Unlimited branches have no capacity and are never sold.
 */
function PlacesCard({ data }: { data: PaidExtrasOverviewDto }) {
  const { t } = useTranslation()
  return (
    <SectionCard title={t('paidExtras.places.title')} note={t('paidExtras.places.note')}>
      <div className="flex flex-col gap-5 p-5 pt-0">
        <div className="grid gap-5 md:grid-cols-2">
          <KindFacts kind="USER" place={data.users} />
          <KindFacts kind="BRANCH" place={data.branches} />
        </div>
        <p className="text-xs font-medium leading-[1.6] text-text-tertiary">
          {t('paidExtras.places.removal')}
        </p>
      </div>
    </SectionCard>
  )
}

function KindFacts({ kind, place }: { kind: 'USER' | 'BRANCH'; place: PlaceKindOverviewDto }) {
  const { t, i18n } = useTranslation()
  const n = (value: number) => formatCount(value, i18n.language)
  const unlimited = place.capacity === null || place.included === null
  return (
    <div className="flex flex-col gap-1 rounded-sm bg-surface-background px-4 py-3">
      <span className="text-sm font-medium text-text-quaternary">
        {t(`paidExtras.places.kind.${kind}`)}
      </span>
      <span className="text-xl font-semibold tabular-nums text-text-primary">
        {unlimited
          ? t('paidExtras.places.unlimited', { inUse: n(place.inUse) })
          : t('paidExtras.places.inUseOf', {
              inUse: n(place.inUse),
              capacity: n(place.capacity ?? 0),
            })}
      </span>
      {unlimited ? null : (
        <span className="text-xs font-medium text-text-tertiary">
          {t('paidExtras.places.split', {
            included: n(place.included ?? 0),
            paid: n(place.paidPlacesNow),
          })}
        </span>
      )}
      <span className="text-xs font-medium text-text-tertiary">
        {place.offered && place.unitMonthlyPrice !== null ? (
          <span className="inline-flex flex-wrap items-center gap-1">
            {t('paidExtras.places.price')}{' '}
            <OmAmount
              amount={formatAmount(place.unitMonthlyPrice, 'OMR', i18n.language)}
              size="xs"
            />{' '}
            {t('paidExtras.places.perMonth')}
          </span>
        ) : unlimited ? null : (
          t('paidExtras.places.notSold')
        )}
      </span>
    </div>
  )
}

const ADDON_TONE = {
  NONE: 'neutral',
  PENDING_PAYMENT: 'pending',
  ACTIVE: 'success',
  ENDING: 'pending',
  ENDED: 'neutral',
} as const

/**
 * ER-1, ER-2: the ERP and API add-on on a plan that offers it. Added like a user (pro rata, through
 * the order form below); stopped at the end of the time already paid, with nothing refunded and
 * the mapping and history kept (ER-3). A stop can be withdrawn before its last day.
 */
function ErpAddonCard({
  addon,
  mayManage,
  onAdd,
  onChanged,
}: {
  addon: ErpAddonOverviewDto
  mayManage: boolean
  onAdd?: () => void
  onChanged: (why?: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const inFlight = useRef(false)
  const state = addon.status ?? 'NONE'
  const endsOn = addon.endsOn ? formatDate(addon.endsOn, i18n.language) : ''

  const act = async (call: () => Promise<ErpAddonOverviewDto>, why: string) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFailure(null)
    try {
      await call()
      setConfirming(false)
      onChanged(why)
    } catch (error) {
      setFailure(refusalMessage(t, error))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <SectionCard title={t('paidExtras.addon.title')} note={t('paidExtras.addon.note')}>
      <div className="flex flex-col gap-5 p-5 pt-0">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Pill
                tone={ADDON_TONE[state]}
                label={t(`paidExtras.addon.status.${state}`, { date: endsOn })}
              />
            </span>
            {addon.monthlyPrice !== null ? (
              <span className="inline-flex flex-wrap items-center gap-1 text-sm font-medium text-text-secondary">
                <OmAmount
                  amount={formatAmount(addon.monthlyPrice, 'OMR', i18n.language)}
                  size="xs"
                />{' '}
                {t('paidExtras.places.perMonth')}
              </span>
            ) : null}
            <p className="max-w-[560px] text-sm font-medium leading-[1.6] text-text-tertiary">
              {t(`paidExtras.addon.body.${state}`, { date: endsOn })}
            </p>
          </div>
          {/* No empty row when there is nothing to do, as once the company has left (A3.8). */}
          {mayManage && (state === 'ACTIVE' || state === 'ENDING' || onAdd) ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              {state === 'ACTIVE' ? (
                <Button variant="ghost" size="md" onClick={() => setConfirming(true)}>
                  {t('paidExtras.addon.stop')}
                </Button>
              ) : state === 'ENDING' ? (
                <Button
                  size="md"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => act(keepErpAddon, t('paidExtras.addon.kept'))}
                >
                  {t('paidExtras.addon.keep')}
                </Button>
              ) : onAdd ? (
                <Button size="md" onClick={onAdd}>
                  {t('paidExtras.addon.add')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {failure && !confirming ? <Alert>{failure}</Alert> : null}
      </div>
      <Modal
        open={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        title={t('paidExtras.addon.stopTitle')}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button variant="ghost" size="md" disabled={busy} onClick={() => setConfirming(false)}>
              {t('paidExtras.addon.stopCancel')}
            </Button>
            <Button
              size="md"
              disabled={busy}
              aria-busy={busy}
              onClick={() => act(stopErpAddon, t('paidExtras.addon.stopped'))}
            >
              {t('paidExtras.addon.stopConfirm')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {t('paidExtras.addon.stopBody')}
          </p>
          {failure ? <Alert>{failure}</Alert> : null}
        </div>
      </Modal>
    </SectionCard>
  )
}

/**
 * The numbers to buy and the server's price for them. Each field runs from 0 to the console's
 * per-order maximum (CF-3); the price is asked for once something is chosen, and the order button
 * waits for the price of exactly that choice. The quote's total goes back as `expectedTotal`.
 */
function BuyForm({
  data,
  initial,
  onOrdered,
  onCancel,
}: {
  data: PaidExtrasOverviewDto
  initial: PaidExtrasSelection
  onOrdered: () => void
  onCancel?: () => void
}) {
  const { t, i18n } = useTranslation()
  const [users, setUsers] = useState(String(initial.users))
  const [branches, setBranches] = useState(String(initial.branches))
  const [erpAddon, setErpAddon] = useState(initial.erpAddon)
  const [quote, setQuote] = useState<PaidExtrasQuoteDto | null>(null)
  const [quoteFailure, setQuoteFailure] = useState<ReactNode>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ReactNode>(null)
  const [priceMoved, setPriceMoved] = useState(false)
  // A new attempt asks the server again for the same numbers (after `extras-price-changed`).
  const [attempt, setAttempt] = useState(0)
  // Set before any re-render can disable the button: two clicks in one tick still order once.
  const inFlight = useRef(false)

  const sellUsers = data.users.offered && data.users.unitMonthlyPrice !== null
  const sellBranches =
    data.branches.offered &&
    data.branches.unitMonthlyPrice !== null &&
    data.branches.capacity !== null
  // The add-on can be ticked when it is offered and not already on (or being replaced unpaid).
  const sellAddon =
    data.erpAddon.offered &&
    (data.erpAddon.status === null ||
      data.erpAddon.status === 'ENDED' ||
      (data.erpAddon.status === 'PENDING_PAYMENT' && onCancel !== undefined))
  const parse = (text: string, max: number) => {
    const value = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null
    return { value, valid: value !== null && value >= 0 && value <= max }
  }
  const u = parse(users, data.maxUsersPerOrder)
  const b = parse(branches, data.maxBranchesPerOrder)
  const valid = (!sellUsers || u.valid) && (!sellBranches || b.valid)
  const selection: PaidExtrasSelection = {
    users: sellUsers ? (u.value ?? 0) : 0,
    branches: sellBranches ? (b.value ?? 0) : 0,
    erpAddon: sellAddon && erpAddon,
  }
  const chosen = selection.users > 0 || selection.branches > 0 || selection.erpAddon
  const key = `${selection.users}|${selection.branches}|${selection.erpAddon}`

  useEffect(() => {
    setQuoteFailure(null)
    if (!valid || !chosen) {
      setQuote(null)
      return
    }
    const [qUsers, qBranches, qAddon] = key.split('|')
    const request = new AbortController()
    const timer = setTimeout(() => {
      quotePaidExtras(
        { users: Number(qUsers), branches: Number(qBranches), erpAddon: qAddon === 'true' },
        request.signal,
      ).then(
        (answer) => setQuote(answer),
        (error: unknown) => {
          if (request.signal.aborted) return
          setQuote(null)
          setQuoteFailure(refusalNode(t, error))
        },
      )
    }, QUOTE_DELAY_MS)
    return () => {
      clearTimeout(timer)
      request.abort()
    }
  }, [key, valid, chosen, attempt, t])

  const priced =
    quote !== null &&
    quote.users === selection.users &&
    quote.branches === selection.branches &&
    quote.erpAddon === selection.erpAddon
      ? quote
      : null

  const order = async () => {
    if (inFlight.current || !priced) return
    inFlight.current = true
    setBusy(true)
    setFailure(null)
    setPriceMoved(false)
    try {
      await orderPaidExtras({ ...selection, expectedTotal: priced.total })
      onOrdered()
    } catch (error) {
      if (error instanceof ApiError && error.problemType === 'extras-price-changed') {
        // The server's total moved since the quote: show the new one and let them order again.
        setQuote(null)
        setPriceMoved(true)
        setAttempt((value) => value + 1)
      } else {
        setFailure(refusalNode(t, error))
      }
      setBusy(false)
    } finally {
      inFlight.current = false
    }
  }

  const money = (value: string) => (
    <OmAmount amount={formatAmount(value, 'OMR', i18n.language)} size="xs" />
  )
  const date = (iso: string) => formatDate(iso, i18n.language)

  return (
    <div className="flex flex-col gap-5">
      {sellUsers || sellBranches ? (
        <div className="grid gap-5 md:grid-cols-2">
          {sellUsers ? (
            <Stepper
              id="paid-extras-users"
              label={t('paidExtras.buy.users')}
              text={users}
              setText={setUsers}
              max={data.maxUsersPerOrder}
              valid={u.valid}
              disabled={busy}
            />
          ) : null}
          {sellBranches ? (
            <Stepper
              id="paid-extras-branches"
              label={t('paidExtras.buy.branches')}
              text={branches}
              setText={setBranches}
              max={data.maxBranchesPerOrder}
              valid={b.valid}
              disabled={busy}
            />
          ) : null}
        </div>
      ) : (
        <Callout>{t('paidExtras.buy.nothingSold')}</Callout>
      )}
      {sellAddon ? (
        <Checkbox
          label={t('paidExtras.buy.addon')}
          checked={erpAddon}
          disabled={busy}
          onChange={(event) => setErpAddon(event.target.checked)}
          className="text-sm"
        />
      ) : null}

      {priceMoved ? <Callout>{t('paidExtras.refusal.extras-price-changed')}</Callout> : null}
      {priced ? (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2 rounded-sm bg-surface-background px-4 py-3 text-sm">
            {priced.lines.map((line, index) => (
              <Line
                key={index}
                label={t(`paidExtras.quote.line.${line.kind}`, {
                  count: line.quantity,
                  n: formatCount(line.quantity, i18n.language),
                  from: date(line.from),
                  to: date(line.to),
                  days: formatCount(line.days, i18n.language),
                  periodDays: formatCount(line.periodDays, i18n.language),
                })}
                value={money(line.net)}
              />
            ))}
            {/* Rate 0 is how the server says no VAT is charged: no line, rather than "VAT 0%". */}
            {Number(priced.vatRate) === 0 ? null : (
              <Line
                label={t('billing.bill.vat', { rate: formatRate(priced.vatRate, i18n.language) })}
                value={money(priced.vatAmount)}
              />
            )}
            <Line label={t('billing.bill.total')} value={money(priced.total)} strong />
          </dl>
          {priced.placesEnd ? (
            <Callout>{t('paidExtras.quote.placesEnd', { date: date(priced.placesEnd) })}</Callout>
          ) : priced.renewalOn ? (
            <p className="text-xs font-medium leading-[1.6] text-text-tertiary">
              {t('paidExtras.quote.renewal', { date: date(priced.renewalOn) })}
            </p>
          ) : null}
        </div>
      ) : valid && chosen && !quoteFailure ? (
        <p role="status" className="text-sm font-medium text-text-tertiary">
          {t('paidExtras.quote.loading')}
        </p>
      ) : null}
      {quoteFailure ? <Alert>{quoteFailure}</Alert> : null}

      <p className="text-xs font-medium leading-[1.6] text-text-tertiary">
        {t('paidExtras.buy.howAdded')}
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="md" disabled={!priced || busy} aria-busy={busy} onClick={order}>
          {t('paidExtras.buy.submit')}
        </Button>
        {onCancel ? (
          <Button variant="ghost" size="md" disabled={busy} onClick={onCancel}>
            {t('paidExtras.order.keep')}
          </Button>
        ) : null}
      </div>
      {failure ? <Alert>{failure}</Alert> : null}
    </div>
  )
}

function Stepper({
  id,
  label,
  text,
  setText,
  max,
  valid,
  disabled,
}: {
  id: string
  label: string
  text: string
  setText: (value: string) => void
  max: number
  valid: boolean
  disabled: boolean
}) {
  const { t, i18n } = useTranslation()
  const parsed = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null
  const step = (by: number) => setText(String(Math.min(max, Math.max(0, (parsed ?? 0) + by))))
  const button =
    'flex size-[48px] items-center justify-center text-lg text-text-secondary transition-colors hover:text-primary-800 disabled:text-text-quaternary'
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium leading-[1.2] text-text-primary">
        {label}
      </label>
      <div className="flex w-fit items-center gap-1 rounded-sm border border-border-default bg-surface-tab-bar">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={disabled || (parsed !== null && parsed <= 0)}
          aria-label={t('paidExtras.buy.fewer', { what: label })}
          className={button}
        >
          −
        </button>
        <input
          id={id}
          inputMode="numeric"
          dir="ltr"
          value={text}
          disabled={disabled}
          onFocus={selectAllOnFocus}
          onChange={(event) => setText(event.target.value.replace(/[^\d]/g, ''))}
          aria-invalid={valid ? undefined : true}
          aria-describedby={`${id}-hint`}
          className="h-[48px] w-[90px] bg-transparent text-center text-base font-semibold tabular-nums text-text-primary outline-none"
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={disabled || (parsed !== null && parsed >= max)}
          aria-label={t('paidExtras.buy.more', { what: label })}
          className={button}
        >
          +
        </button>
      </div>
      <p
        id={`${id}-hint`}
        role={valid ? undefined : 'alert'}
        className={[
          'text-xs font-medium leading-[1.2]',
          valid ? 'text-text-quaternary' : 'text-text-danger',
        ].join(' ')}
      >
        {t('paidExtras.buy.limit', { max: formatCount(max, i18n.language) })}
      </p>
    </div>
  )
}

/** The order's quantities by kind; a kind bought for two periods has two places of the same size. */
function orderedOf(places: PaidExtraPlaceDto[]): PaidExtrasSelection {
  const first = (kind: PlaceKind) => places.find((place) => place.kind === kind)?.quantity ?? 0
  return { users: first('USER'), branches: first('BRANCH'), erpAddon: first('ERP_ADDON') > 0 }
}

function orderSummary(t: TFunction, language: string, ordered: PaidExtrasSelection): string {
  const parts: string[] = []
  if (ordered.users > 0)
    parts.push(
      t('paidExtras.order.users', {
        count: ordered.users,
        n: formatCount(ordered.users, language),
      }),
    )
  if (ordered.branches > 0)
    parts.push(
      t('paidExtras.order.branches', {
        count: ordered.branches,
        n: formatCount(ordered.branches, language),
      }),
    )
  if (ordered.erpAddon) parts.push(t('paidExtras.order.addon'))
  return parts.join(t('paidExtras.order.separator'))
}

/**
 * The order still to pay: what it buys, its bill and the same payment form as Bills and payment.
 * While nothing has been sent for it the numbers can be changed; the server then replaces the
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
  data: PaidExtrasOverviewDto
  order: PaidExtrasOrderDto
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
  const ordered = orderedOf(order.places)
  const summary = orderSummary(t, i18n.language, ordered)

  let body: ReactNode
  if (billing.status === 'loading') body = <LoadingNotice />
  else if (billing.status === 'failed')
    body = <ApiReadFailure error={billing.error} retry={retryBilling} />
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
        <p className="text-sm font-medium text-text-secondary">{t('paidExtras.order.replaces')}</p>
        <BuyForm
          data={data}
          initial={ordered}
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
          subtotalLabel={summary}
        />
        {changeable ? (
          <div>
            <Button variant="ghost" size="md" onClick={() => setChanging(true)}>
              {t('paidExtras.order.change')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <SectionCard
      title={t('paidExtras.order.title')}
      note={t('paidExtras.order.note', { what: summary })}
    >
      <div className="p-5 pt-0">{body}</div>
    </SectionCard>
  )
}

const PLACE_TONE = { PENDING: 'pending', ACTIVE: 'success', CANCELLED: 'neutral' } as const

/** The newest fifty places the server lists: bought, renewed, or recorded for places already in use. */
function HistoryCard({ places }: { places: PaidExtraPlaceDto[] }) {
  const { t, i18n } = useTranslation()
  if (places.length === 0) return null
  return (
    <SectionCard title={t('paidExtras.history.title')} note={t('paidExtras.history.note')}>
      <ul className="flex flex-col divide-y divide-surface-background border-t border-surface-background">
        {places.map((place) => (
          <li
            key={place.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold text-text-primary">
                {t(`paidExtras.history.kind.${place.kind}`, {
                  count: place.quantity,
                  n: formatCount(place.quantity, i18n.language),
                })}
              </span>
              <span className="text-xs font-medium text-text-tertiary">
                {t(`paidExtras.history.source.${place.source}`)} ·{' '}
                {t('paidExtras.history.covers', {
                  from: formatDate(place.coversFrom, i18n.language),
                  to: formatDate(place.coversTo, i18n.language),
                })}{' '}
                · {formatInstantDay(place.activatedAt ?? place.createdAt, i18n.language)}
              </span>
            </span>
            <span className="flex items-center gap-3">
              {place.netAmount ? (
                <OmAmount amount={formatAmount(place.netAmount, 'OMR', i18n.language)} size="xs" />
              ) : null}
              <Pill
                tone={PLACE_TONE[place.status]}
                label={t(`paidExtras.history.status.${place.status}`)}
              />
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: ReactNode
  value: ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt
        className={strong ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}
      >
        {label}
      </dt>
      <dd
        className={
          strong
            ? 'shrink-0 font-semibold text-text-primary'
            : 'shrink-0 font-medium text-text-primary'
        }
      >
        {value}
      </dd>
    </div>
  )
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700"
    >
      {children}
    </p>
  )
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
    >
      {children}
    </p>
  )
}

const KNOWN_REFUSALS = [
  'paid-extras-not-open',
  'paid-extras-not-offered',
  'paid-extras-not-in-trial',
  'subscription-not-tracked',
  'subscription-state-conflict',
  'billing-not-configured',
  'payment-state-conflict',
  'extras-price-changed',
  'erp-addon-already-active',
  'erp-addon-not-active',
  'erp-addon-not-ending',
  'disconnected-from-fawtir',
]

/** Our own sentence for each refusal the server gives; its English `detail` is never shown. */
function refusalMessage(t: TFunction, error: unknown): string {
  // LV-6: remembered, so every way to pay is held back from here on (A3.8).
  if (noteLeftFawtirRefusal(error)) return t('billing.refusal.disconnected-from-fawtir')
  if (error instanceof ApiError) {
    if (error.problemType === 'paid-extras-order-limit') {
      const max = (value: unknown) => (typeof value === 'number' ? String(value) : '')
      return t('paidExtras.refusal.paid-extras-order-limit', {
        users: max(error.problem.maxUsers),
        branches: max(error.problem.maxBranches),
      })
    }
    if (error.problemType && KNOWN_REFUSALS.includes(error.problemType)) {
      return t(`paidExtras.refusal.${error.problemType}`)
    }
  }
  return t('billing.refusal.other')
}

/** As {@link refusalMessage}, with the way to Bills and payment when the subscription must be paid first. */
function refusalNode(t: TFunction, error: unknown): ReactNode {
  if (error instanceof ApiError && error.problemType === 'subscription-state-conflict') {
    return (
      <>
        {t('paidExtras.refusal.subscription-state-conflict')}{' '}
        <Link to="/settings/bills" className="font-semibold underline">
          {t('paidExtras.refusal.payFirstLink')}
        </Link>
      </>
    )
  }
  return refusalMessage(t, error)
}
