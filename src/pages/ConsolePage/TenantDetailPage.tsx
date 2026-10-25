import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ApiError } from '../../api'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { TenantDisconnectionCard } from './disconnections/TenantDisconnectionCard'
import { TenantOwnerHandoverCard } from './owners/TenantOwnerHandoverCard'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import { isCompanyId } from '../../lib/console/companyVerification'
import {
  TENANT_OVERVIEW_PERMISSION,
  addressLine,
  initialsOf,
  tenantOverviewPath,
  verificationRouteFor,
  type OverviewInvoicing,
  type TenantOverview,
} from '../../lib/console/tenantOverview'
import { Rial, withRial } from '../../components/ui'
import {
  TENANT_IDENTITIES,
  documentsAllowance,
  openInvoiceOf,
  periodAmount,
  planLabelKey,
  subscriptionOf,
  useSubscriptions,
  type Subscription,
  type SubscriptionState,
} from '../../lib/consoleSubscriptions'
import { formatAmount, formatCount } from '../../lib/format'
import { PLATFORM_SETTINGS } from '../../lib/platformSettings'
import { PLANS, TENANTS, count, omr, type FilingDay } from '../../lib/superAdmin'
import {
  ActivateModal,
  ChangePlanModal,
  RecordPaymentModal,
  SUBSCRIPTION_ACTIONS,
  SendLinkModal,
  StateChangeModal,
  SubscriptionStatePill,
  SubscriptionTab,
  type SubscriptionAction,
} from './subscriptions'
import { CompanySubscriptionCards } from './tenant/CompanySubscriptionCards'
import { CompanyBillingCard } from './tenant/CompanyBillingCard'
import { TenantErpEntitlementCard } from './erp/TenantErpEntitlementCard'
import { EnterpriseTermsLink } from './enterprise/EnterpriseTermsLink'
import { CONSOLE_H1, CONSOLE_PAGE, CONSOLE_PRIMARY, CONSOLE_SECONDARY, CONSOLE_SUBTITLE, CONSOLE_TAB_LINE } from '../../layouts/ConsoleShell/consoleStyle'
import { consoleTab } from '../../layouts/ConsoleShell/consoleTones'
import { demoModulesEnabled } from '../../lib/demoModules'
import { DemoRibbon } from '../../components/feedback/DemoModule'

// No ERP tab: it drew a fixture's add-on state. A real tenant's ERP access is the entitlement
// card below the facts, read from and changed through the platform API.
type Tab = 'subscription' | 'filing'
const TABS: Tab[] = ['subscription', 'filing']

type Request = { action: SubscriptionAction; invoiceId?: string }

const CHIP_TONE = {
  bad: 'bg-danger-100 text-danger-700',
  watch: 'bg-pending-100 text-pending-500',
  calm: 'bg-primary-50 text-primary-800',
} as const

const HEALTH_TONE = {
  bad: 'text-danger-700',
  watch: 'text-pending-500',
  calm: 'text-text-quaternary',
} as const

/** A day of filing, drawn as one bar of the week strip — the Tenants screen's colours. */
const DAY_COLOUR: Record<FilingDay, string> = {
  clear: 'bg-success-700',
  some: 'bg-pending-500',
  bad: 'bg-danger-700',
  none: 'bg-neutral-100',
}

const PRIMARY_BUTTON = CONSOLE_PRIMARY
const SECONDARY_BUTTON = CONSOLE_SECONDARY

function Chip({ label, tone }: { label: string; tone: 'bad' | 'watch' | 'calm' }) {
  return (
    <span
      className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-sm px-[11px] text-[11.5px] font-semibold uppercase tracking-[0.3px] ${CHIP_TONE[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

/**
 * The buttons that fit a state: the first is the next sensible thing and is drawn as primary; the
 * rest sit beside it. Recording a payment and sending a link need an open invoice, and a link needs
 * the card method to be on. Granting documents and cancelling are not here: both are real actions
 * on the company's subscription card (a reason and an expiry; abuse or fraud, two operators), and
 * waiving an overage does not exist, since extra documents are bought ahead.
 */
function actionsFor(state: SubscriptionState, hasOpenInvoice: boolean): SubscriptionAction[] {
  const money: SubscriptionAction[] = hasOpenInvoice
    ? PLATFORM_SETTINGS.payments.methods.cardLink
      ? ['recordPayment', 'sendLink']
      : ['recordPayment']
    : []
  switch (state) {
    case 'trial':
      return ['activate', 'changePlan']
    case 'awaitingPayment':
    case 'grace':
      return [...money, 'activate', 'changePlan', 'suspend']
    case 'active':
      return ['changePlan', ...money, 'suspend']
    case 'suspended':
      return ['resume', ...money, 'changePlan']
    default:
      return ['activate', 'changePlan']
  }
}

function isAction(value: string | null): value is SubscriptionAction {
  return SUBSCRIPTION_ACTIONS.includes(value as SubscriptionAction)
}

/**
 * One tenant, as the console sees them: who they are, what state their subscription is in, and
 * everything an operator can do about it (docs/erp-and-console-plan.md §7.3). The Subscription tab
 * is built in full; Filing reuses the Tenants screen's week strip for the tenants it knows; ERP is
 * not built yet and says so.
 *
 * `?action=recordPayment|sendLink|activate|changePlan|suspend|resume`
 * (with an optional `&invoice=`) opens that modal on arrival, so the queue can deep-link to it.
 *
 * A real tenant id is a UUID and is always read from the platform overview. A slug is one of the
 * console's own sample ids, still used by the subscriptions, invoices and ERP screens that link
 * here, and keeps the prototype rendering until those screens carry real ids.
 */
export function TenantDetailPage() {
  const { id } = useParams()
  // Compatibility only, and never a fallback: a UUID never reaches this lookup, so a tenant the
  // backend refuses can never be answered from sample data.
  const prototype = id && !isCompanyId(id) && demoModulesEnabled() ? prototypeOverview(id) : undefined

  return (
    <ConsoleShell requires={TENANT_OVERVIEW_PERMISSION}>
      {isCompanyId(id) ? (
        <TenantDetailLoader tenantId={id} />
      ) : prototype ? (
        <>
          <DemoRibbon />
          <TenantDetail tenantId={id!} overview={prototype} prototype />
        </>
      ) : (
        <DetailNotFound />
      )}
    </ConsoleShell>
  )
}

/** The tenants breadcrumb, for the states that have no tenant to name yet. */
function DetailFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.tenants', to: '/console/tenants' }]} />
      {children}
    </div>
  )
}

function DetailNotFound() {
  const { t } = useTranslation()
  return (
    <DetailFrame>
      <ConsoleNotice
        body={t('console.tenantDetail.notFound')}
        action={{ to: '/console/tenants', label: t('console.tenantDetail.notFoundBack') }}
      />
    </DetailFrame>
  )
}

/**
 * Loads one real tenant from the platform overview.
 *
 * There is deliberately no fixture fallback. A tenant the backend does not return is not found,
 * whatever the local sample data happens to contain — falling back would show one business's
 * prototype figures under another business's name.
 */
function TenantDetailLoader({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const { read, retry } = useConsoleRead<TenantOverview>(tenantOverviewPath(tenantId))

  if (read.status === 'loading') {
    return (
      <DetailFrame>
        <ConsoleNotice busy body={t('console.tenantDetail.loading')} />
      </DetailFrame>
    )
  }
  if (read.status === 'failed') {
    // A refused read is not a missing tenant: 403 keeps the established failure notice so a
    // reader can tell "not yours to see" from "not there". 401 never reaches here —
    // useConsoleRead leaves for Login.
    return read.error instanceof ApiError && read.error.status === 404 ? (
      <DetailNotFound />
    ) : (
      <DetailFrame>
        <ConsoleReadFailure error={read.error} retry={retry} />
      </DetailFrame>
    )
  }
  return <TenantDetail tenantId={tenantId} overview={read.data} />
}

/**
 * @param prototype whether this is the sample-data rendering for a slug id. The subscription,
 *        filing and ERP tabs, the action bar and every modal are driven entirely by that sample
 *        ledger — `tenantIdentity` throws outright on an id it does not hold — so a real tenant
 *        renders its real sections and none of them. They return when those features have a
 *        backend, not before.
 */
function TenantDetail({
  tenantId,
  overview,
  prototype = false,
}: {
  tenantId: string
  overview: TenantOverview
  prototype?: boolean
}) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const ledger = useSubscriptions()
  const subscription = subscriptionOf(ledger, tenantId)
  const filing = TENANTS.find((tenant) => tenant.id === tenantId)
  const openInvoice = openInvoiceOf(ledger, tenantId)

  const [tab, setTab] = useState<Tab>(() => {
    const wanted = searchParams.get('tab')
    return TABS.includes(wanted as Tab) ? (wanted as Tab) : 'subscription'
  })
  const [request, setRequest] = useState<Request | null>(() => {
    const action = searchParams.get('action')
    return isAction(action) ? { action, invoiceId: searchParams.get('invoice') ?? undefined } : null
  })
  const [done, setDone] = useState<string | null>(null)
  // Bumped when billing starts, so the subscription cards read the new lifecycle.
  const [subscriptionRead, setSubscriptionRead] = useState(0)

  // A deep link that arrives while the page is already open — the queue linking to another action.
  const wantedAction = searchParams.get('action')
  const wantedInvoice = searchParams.get('invoice')
  useEffect(() => {
    if (isAction(wantedAction))
      setRequest({ action: wantedAction, invoiceId: wantedInvoice ?? undefined })
  }, [wantedAction, wantedInvoice])

  // Where the reader came from — the queue, the invoices list, or the tenants list — is what the
  // breadcrumb leads back to. It rides in the URL so a deep link from a row menu keeps it too.
  const from = searchParams.get('from') ?? (location.state as { from?: string } | null)?.from
  // The subscriptions screens are sample data, so only the prototype path leads back to them.
  const parentCrumbs =
    prototype && from === 'subscriptions'
      ? [{ labelKey: 'console.nav.subscriptions', to: '/console/subscriptions' }]
      : prototype && from === 'invoices'
        ? [
            { labelKey: 'console.nav.subscriptions', to: '/console/subscriptions' },
            {
              labelKey: 'console.subscriptions.invoices.title',
              to: '/console/subscriptions/invoices',
            },
          ]
        : [{ labelKey: 'console.nav.tenants', to: '/console/tenants' }]

  const open = (action: SubscriptionAction, invoiceId?: string) => {
    setDone(null)
    setRequest({ action, invoiceId })
  }
  const close = useCallback(() => {
    setRequest(null)
    if (searchParams.has('action') || searchParams.has('invoice')) {
      const next = new URLSearchParams(searchParams)
      next.delete('action')
      next.delete('invoice')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const finish = useCallback(
    (message: string) => {
      close()
      setDone(message)
    },
    [close],
  )

  const state = subscription?.state ?? 'cancelled'
  const bar = actionsFor(state, Boolean(openInvoice))

  const modalProps = {
    tenantId,
    ledger,
    invoiceId: request?.invoiceId,
    onClose: close,
    onDone: finish,
  }

  return (
    <div className={CONSOLE_PAGE}>
      {/* A long company name ends in an ellipsis instead of pushing the trail onto three lines. */}
      <div className="min-w-0 [&_nav>span:last-child]:min-w-0 [&_nav>span:last-child]:max-w-full [&_nav>span:last-child>span]:min-w-0 [&_nav>span:last-child>span]:truncate">
        <ConsoleBreadcrumbs items={[...parentCrumbs, { label: overview.identity.tenantName }]} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-base font-bold text-primary-700">
            {initialsOf(overview.identity.tenantName)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className={`${CONSOLE_H1} max-md:text-2xl`}>
                {overview.identity.tenantName}
              </h1>
              {overview.identity.tenantStatus ? (
                <ConsoleStatusPill
                  tone={
                    overview.identity.tenantStatus === 'ACTIVE'
                      ? 'success'
                      : overview.identity.tenantStatus === 'SUSPENDED'
                        ? 'danger'
                        : overview.identity.tenantStatus === 'PENDING'
                          ? 'pending'
                          : 'neutral'
                  }
                  label={t(`console.tenants.status.${overview.identity.tenantStatus}`)}
                  size="header"
                />
              ) : null}
              {subscription ? <SubscriptionStatePill state={subscription.state} size="header" /> : null}
              {subscription ? (
                <Chip
                  tone="calm"
                  label={t('console.tenantDetail.planChip', {
                    plan: t(planLabelKey(subscription.plan)),
                    term: t(`console.subscriptions.term.${subscription.term}`),
                  })}
                />
              ) : null}
            </div>
            <p className={CONSOLE_SUBTITLE}>
              {[
                legalNameOf(overview, i18n.language),
                overview.company.taxNumber ? (
                  <>
                    {t('console.tenants.vat')} <bdi dir="ltr">{overview.company.taxNumber}</bdi>
                  </>
                ) : null,
                overview.company.contactPersonName,
              ]
                .filter(Boolean)
                .map((part, index) => (
                  <span key={index}>
                    {index > 0 ? ' · ' : null}
                    {part}
                  </span>
                ))}
              {overview.company.legalName ||
              overview.company.legalNameAr ||
              overview.company.taxNumber ||
              overview.company.contactPersonName
                ? null
                : t('console.tenantDetail.noCompanyDetails')}
              {overview.company.contactPhone ? (
                <>
                  {' · '}
                  <span dir="ltr">{overview.company.contactPhone}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {prototype ? (
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            {bar.map((action, index) => (
              <button
                key={action}
                type="button"
                onClick={() => open(action)}
                className={index === 0 ? PRIMARY_BUTTON : SECONDARY_BUTTON}
              >
                {t(`console.tenantDetail.actions.${action}`)}
              </button>
            ))}
          </div>
        ) : (
          <EnterpriseTermsLink tenantId={tenantId} />
        )}
      </div>

      {done ? (
        <p
          role="status"
          className="rounded-md bg-success-100 px-5 py-4 text-sm font-medium leading-[1.6] text-success-700"
        >
          {withRial(done)}
        </p>
      ) : null}

      <TenantFacts
        overview={prototype ? withLedger(overview, subscription, t) : overview}
      />

      {prototype ? null : (
        <CompanySubscriptionCards
          key={subscriptionRead}
          tenantId={tenantId}
          tenantCode={overview.identity.tenantCode}
        />
      )}

      {prototype ? null : (
        <CompanyBillingCard
          overview={overview}
          onStarted={() => setSubscriptionRead((n) => n + 1)}
        />
      )}

      {prototype ? null : (
        <TenantErpEntitlementCard
          tenantId={tenantId}
          tenantCode={overview.identity.tenantCode}
          onChanged={() => setSubscriptionRead((n) => n + 1)}
        />
      )}

      {prototype ? null : <TenantOwnerHandoverCard tenantId={tenantId} />}
      {prototype ? null : <TenantDisconnectionCard tenantId={tenantId} />}

      {/*
        Tabs, their content and every action modal are sample-data features: the subscription
        ledger, the filing week and the ERP panel have no backend, and tenantIdentity() throws on
        an id the sample does not hold. A real tenant shows its real sections instead of a tab
        strip that cannot load.
      */}
      {prototype ? (
        <>
          <div className="flex flex-wrap gap-x-6 rounded-sm bg-surface-card px-5">
            {TABS.map((entry) => {
              const active = entry === tab
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setTab(entry)}
                  aria-pressed={active}
                  className={consoleTab(active)}
                >
                  {t(`console.tenantDetail.tabs.${entry}`)}
                  {active ? (
                    <span className={CONSOLE_TAB_LINE} />
                  ) : null}
                </button>
              )
            })}
          </div>

          {tab === 'subscription' ? (
            <SubscriptionTab tenantId={tenantId} ledger={ledger} onAction={open} />
          ) : tab === 'filing' ? (
            filing ? (
              <section className="grid grid-cols-3 gap-4 rounded-sm bg-surface-card p-5 max-md:grid-cols-1">
                <div>
                  <p className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
                    {t('console.tenants.col.health')}
                  </p>
                  <span className="mt-3 flex items-center gap-1">
                    {filing.week.map((day, index) => (
                      <span key={index} className={`h-1.5 w-4 rounded-full ${DAY_COLOUR[day]}`} />
                    ))}
                  </span>
                  <span
                    className={`mt-1.5 block text-xs font-medium ${HEALTH_TONE[filing.healthTone]}`}
                  >
                    {t(filing.healthKey)}
                  </span>
                  <span className="mt-3 flex flex-wrap gap-2">
                    {filing.chipKey ? (
                      <Chip
                        label={t(filing.chipKey, filing.chipValues)}
                        tone={filing.chipTone ?? 'calm'}
                      />
                    ) : null}
                    {filing.chip2Key ? (
                      <Chip
                        label={t(filing.chip2Key, filing.chip2Values)}
                        tone={filing.chip2Tone ?? 'calm'}
                      />
                    ) : null}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
                    {t('console.tenants.col.quota')}
                  </p>
                  <span className="mt-3 block h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-neutral-50">
                    <span
                      className={`block h-full rounded-full ${filing.used / PLANS[filing.plan].quota >= 0.85 ? 'bg-pending-500' : 'bg-success-700'}`}
                      style={{
                        width: `${Math.round(Math.min(filing.used / PLANS[filing.plan].quota, 1) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="mt-1.5 block text-xs font-medium text-text-quaternary">
                    {t('console.tenants.ofQuota', {
                      used: count(filing.used),
                      quota: count(PLANS[filing.plan].quota),
                    })}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
                    {t('console.tenantDetail.filing.billed')}
                  </p>
                  <span className="mt-3 block text-sm font-semibold text-text-primary">
                    <span className="me-1">
                      <Rial />
                    </span>
                    {omr(filing.billed)}
                  </span>
                  <span className="mt-1 block text-xs font-medium text-text-quaternary">
                    {t(filing.ageKey, filing.ageValues)}
                  </span>
                </div>
              </section>
            ) : (
              <p className="rounded-sm bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary">
                {t('console.tenantDetail.filing.noData')}
              </p>
            )
          ) : null}

          {request?.action === 'recordPayment' ? <RecordPaymentModal {...modalProps} /> : null}
          {request?.action === 'sendLink' ? <SendLinkModal {...modalProps} /> : null}
          {request?.action === 'activate' ? <ActivateModal {...modalProps} /> : null}
          {request?.action === 'changePlan' ? <ChangePlanModal {...modalProps} /> : null}
          {request?.action === 'suspend' || request?.action === 'resume' ? (
            <StateChangeModal mode={request.action} {...modalProps} />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/**
 * What the platform actually knows about this tenant, from
 * `GET /platform/companies/{id}/overview`.
 *
 * Read-only by design. Verification data is shown because an operator needs to know where a
 * company stands, but the decision itself stays with the verification queue — a pending company
 * gets a link there, never an Approve button here.
 */
function TenantFacts({ overview }: { overview: TenantOverview }) {
  const { t, i18n } = useTranslation()
  const none = t('console.tenants.none')
  const { company, verification, subscription, operational, identity } = overview
  const address = addressLine(company)
  const pending = verification.status === 'PENDING_VERIFICATION'

  return (
    <section className="flex flex-col gap-5 rounded-sm bg-surface-card p-5">
      <div className="grid grid-cols-3 gap-x-8 gap-y-4 max-md:grid-cols-1">
        <Fact label={t('console.tenantDetail.field.code')} value={identity.tenantCode} ltr />
        <Fact
          label={t('console.tenantDetail.field.legalName')}
          value={legalNameOf(overview, i18n.language) ?? none}
        />
        <Fact
          label={t('console.tenantDetail.field.tradingName')}
          value={company.tradingName ?? none}
        />
        <Fact label={t('console.tenants.vat')} value={company.taxNumber ?? none} ltr />
        <Fact
          label={t('console.tenantDetail.field.cr')}
          value={company.commercialRegistrationNumber ?? none}
          ltr
        />
        <Fact
          label={t('console.tenantDetail.field.address')}
          value={address.length > 0 ? address.join(', ') : none}
        />
        <Fact
          label={t('console.tenantDetail.field.timezone')}
          value={company.timezone ?? none}
          ltr
        />
        <Fact
          label={t('console.tenantDetail.field.identityStatus')}
          value={
            identity.identityStatus
              ? t(`console.tenantDetail.identityStatus.${identity.identityStatus}`)
              : none
          }
        />
        <Fact
          label={t('console.tenantDetail.field.contactEmail')}
          value={company.contactEmail ?? none}
          ltr
        />
      </div>

      <div className="grid grid-cols-3 gap-x-8 gap-y-4 border-t border-border-subtle pt-5 max-md:grid-cols-1">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
            {t('console.tenantDetail.field.verification')}
          </p>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <ConsoleStatusPill
              tone={
                verification.status === 'VERIFIED'
                  ? 'success'
                  : verification.status === 'REJECTED'
                    ? 'danger'
                    : 'pending'
              }
              label={t(`console.verification.status.${verification.status}`)}
            />
            {pending ? (
              <Link
                to={verificationRouteFor(identity.tenantId)}
                className="text-sm font-semibold text-primary-800 hover:text-primary-700"
              >
                {t('console.tenants.review')}
              </Link>
            ) : null}
          </span>
          <span className="mt-1.5 block text-xs font-medium text-text-quaternary">
            {t('console.tenantDetail.field.revision')} {verification.profileRevision}
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
            {t('console.tenantDetail.field.plan')}
          </p>
          <span className="mt-2 block text-sm font-medium text-text-primary">
            {subscription.planName ?? none}
            {subscription.implicitDefault ? ` (${t('console.tenantDetail.planDefault')})` : ''}
          </span>
          {/*
            The plan's configured price, labelled as such. It is not an amount invoiced, collected
            or owed, and the domain holds no payment record that could make it one.
          */}
          <span className="mt-1 block text-xs font-medium text-text-quaternary">
            {subscription.monthlyPrice !== null
              ? withRial(
                  t('console.tenantDetail.planPrice', {
                    amount: formatAmount(subscription.monthlyPrice, 'OMR', i18n.language),
                  }),
                )
              : none}
          </span>
          {/*
            The allowance the plan grants. Consumption is NOT shown: the backend can compute it but
            this contract does not publish it, and deriving it here would be a guess.
          */}
          <span className="mt-1 block text-xs font-medium text-text-quaternary">
            {t('console.tenantDetail.planAllowance', {
              count: subscription.invoicesPerMonth,
              total: formatCount(subscription.invoicesPerMonth, i18n.language),
            })}
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
            {t('console.tenantDetail.field.readiness')}
          </p>
          <span className="mt-2 flex items-center gap-2">
            <ConsoleStatusPill
              tone={operational.ready ? 'success' : 'neutral'}
              label={t(
                operational.ready
                  ? 'console.tenantDetail.readiness.ready'
                  : 'console.tenantDetail.readiness.notReady',
              )}
            />
          </span>
          {/*
            The evaluator's reason, in words. It answers "may this tenant submit invoices", not
            filing health or activity. A code we have no words for yet is shown as the code.
          */}
          {operational.reasonCode ? (
            <span className="mt-1.5 block text-xs font-medium text-text-quaternary">
              {i18n.exists(`console.tenantDetail.readinessReason.${operational.reasonCode}`) ? (
                t(`console.tenantDetail.readinessReason.${operational.reasonCode}`)
              ) : (
                <bdi dir="ltr" className="font-mono [overflow-wrap:anywhere]">
                  {operational.reasonCode}
                </bdi>
              )}
            </span>
          ) : operational.ready ? null : (
            <span className="mt-1.5 block text-xs font-medium text-text-quaternary">{none}</span>
          )}
        </div>
      </div>

      <InvoicingFacts invoicing={overview.invoicing ?? null} />
    </section>
  )
}

/**
 * Whether the company can issue invoices, item by item: the company's own readiness answer, so the
 * operator and the company never read two different verdicts. An older backend that does not send
 * it gets "not reported", never a guess derived from the account gate.
 */
function InvoicingFacts({ invoicing }: { invoicing: OverviewInvoicing | null }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
          {t('console.tenantDetail.field.invoicing')}
        </p>
        {invoicing ? (
          <ConsoleStatusPill
            tone={invoicing.ready ? 'success' : 'neutral'}
            label={t(invoicing.ready ? 'console.tenantDetail.invoicing.ready' : 'console.tenantDetail.invoicing.notReady')}
          />
        ) : (
          <span className="text-xs font-medium text-text-quaternary">
            {t('console.tenantDetail.invoicing.unavailable')}
          </span>
        )}
      </div>
      {invoicing && invoicing.items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-x-8 gap-y-2 max-md:grid-cols-1">
          {invoicing.items.map((item) => (
            <li key={item.code} className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-text-primary">
                {i18n.exists(`readiness.item.${item.code}`) ? t(`readiness.item.${item.code}`) : item.code}
              </span>
              <span className="text-xs font-medium text-text-quaternary">
                {item.status === 'DONE'
                  ? t('readiness.done')
                  : item.status === 'AWAITING_PLATFORM'
                    ? t('readiness.awaitingFawtir')
                    : t('readiness.actionRequired')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Fact({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">{label}</p>
      <p className="mt-1 text-sm font-medium leading-[1.4] text-text-primary [overflow-wrap:anywhere]">
        {ltr ? <bdi dir="ltr">{value}</bdi> : value}
      </p>
    </div>
  )
}

/** The legal name in the reader's language: the Arabic one in Arabic when the company has it. */
function legalNameOf(overview: TenantOverview, language: string): string | null {
  const { legalName, legalNameAr } = overview.company
  return language.startsWith('ar') && legalNameAr ? legalNameAr : legalName
}

/**
 * The sample tenants' plan and readiness, told from the same subscription ledger the tabs below
 * read, so the summary card cannot say "no plan" over a Subscription tab that says Starter.
 * Sample-data rendering only; a real tenant's overview is never touched.
 */
function withLedger(
  overview: TenantOverview,
  subscription: Subscription | undefined,
  t: TFunction,
): TenantOverview {
  if (!subscription) return overview
  const live = subscription.state !== 'suspended' && subscription.state !== 'cancelled'
  return {
    ...overview,
    subscription: {
      ...overview.subscription,
      planCode: subscription.plan,
      planName: t(planLabelKey(subscription.plan)),
      monthlyPrice: periodAmount(subscription.plan, 'monthly', subscription.enterprise),
      invoicesPerMonth: documentsAllowance(subscription),
      overageEnabled: subscription.overageOn,
    },
    operational: {
      ready: live,
      reasonCode: live
        ? null
        : subscription.state === 'suspended'
          ? 'TENANT_SUSPENDED'
          : 'TENANT_NOT_ACTIVE',
    },
  }
}

/**
 * Compatibility only, for the console screens that still address tenants by slug.
 *
 * These ids never reach the platform overview — they are not tenants the backend knows — so their
 * pages are projected from the same sample data they have always used, purely to keep their deep
 * links working while they await integration.
 *
 * It must NEVER serve a UUID: a real tenant is always read from the backend, and one the backend
 * refuses is not found. Do not add tenants here. Delete it when the subscriptions, invoices and
 * ERP screens move onto real tenant identifiers.
 *
 * Read from the registry per call, not captured once: onboarding registers a tenant at runtime
 * and then navigates straight to it, so a snapshot taken when this module loaded would answer
 * "no such tenant" for the tenant the operator had just created.
 */
function prototypeOverview(id: string): TenantOverview | undefined {
  const identity = TENANT_IDENTITIES[id]
  if (!identity) return undefined
  return {
    identity: {
      tenantId: id,
      tenantCode: id.toUpperCase(),
      tenantName: identity.name,
      tenantStatus: null,
      identityStatus: null,
    },
    company: {
      legalName: identity.name,
      legalNameAr: null,
      tradingName: null,
      commercialRegistrationNumber: null,
      taxNumber: identity.vat,
      country: null,
      registeredAddressLine1: identity.town,
      registeredAddressLine2: null,
      registeredAddressLine3: null,
      registeredCity: null,
      registeredPostalCode: null,
      registeredCountrySubdivision: null,
      registeredPoBox: null,
      timezone: null,
      contactPersonName: identity.contact.name,
      contactPhone: identity.contact.phone,
      contactEmail: null,
    },
    verification: {
      status: 'VERIFIED',
      method: null,
      rejectionReason: null,
      attestationReference: null,
      evidenceRecorded: false,
      profileRevision: 0,
      submittedAt: null,
      submittedBy: null,
      decidedAt: null,
      decidedBy: null,
    },
    subscription: {
      planCode: null,
      planName: null,
      monthlyPrice: null,
      invoicesPerMonth: 0,
      overageEnabled: false,
      implicitDefault: false,
      startedOn: null,
      changedAt: null,
    },
    operational: { ready: false, reasonCode: null },
  }
}
