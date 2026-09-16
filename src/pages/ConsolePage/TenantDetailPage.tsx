import { useCallback, useEffect, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice } from '../../layouts/ConsoleShell/ConsoleNotice'
import { ActionMenu, Rial, type ActionMenuItem } from '../../components/ui'
import {
  TENANT_IDENTITIES,
  openInvoiceOf,
  planLabelKey,
  subscriptionOf,
  useSubscriptions,
  type SubscriptionState,
} from '../../lib/consoleSubscriptions'
import { PLATFORM_SETTINGS } from '../../lib/platformSettings'
import { PLANS, TENANTS, count, omr, type FilingDay } from '../../lib/superAdmin'
import {
  ActivateModal,
  ChangePlanModal,
  GrantQuotaModal,
  RecordPaymentModal,
  SUBSCRIPTION_ACTIONS,
  SendLinkModal,
  StateChangeModal,
  SubscriptionStatePill,
  SubscriptionTab,
  WaiveOverageModal,
  type SubscriptionAction,
} from './subscriptions'
import { TenantErpTab } from './erp/TenantErpTab'
import invoiceIcon from '../../assets/actions/invoice.svg'
import creditNoteIcon from '../../assets/actions/credit-note.svg'
import deleteIcon from '../../assets/actions/delete.svg'

type Tab = 'subscription' | 'filing' | 'erp'
const TABS: Tab[] = ['subscription', 'filing', 'erp']

type Request = { action: SubscriptionAction; invoiceId?: string }

const CHIP_TONE = {
  bad: 'bg-danger-100 text-danger-700',
  watch: 'bg-pending-100 text-pending-700',
  calm: 'bg-primary-50 text-primary-800',
} as const

const HEALTH_TONE = {
  bad: 'text-danger-700',
  watch: 'text-pending-700',
  calm: 'text-text-quaternary',
} as const

/** A day of filing, drawn as one bar of the week strip — the Tenants screen's colours. */
const DAY_COLOUR: Record<FilingDay, string> = {
  clear: 'bg-success-700',
  some: 'bg-pending-500',
  bad: 'bg-danger-700',
  none: 'bg-neutral-100',
}

const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800'
const SECONDARY_BUTTON =
  'inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25'

function Chip({ label, tone }: { label: string; tone: 'bad' | 'watch' | 'calm' }) {
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold uppercase tracking-[0.03em] ${CHIP_TONE[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

/**
 * The buttons that fit a state: the first is the next sensible thing and is drawn as primary; the
 * rest sit beside it; the last three live in the "More" menu. Recording a payment and sending a
 * link need an open invoice, and a link needs the card method to be on.
 */
function actionsFor(
  state: SubscriptionState,
  hasOpenInvoice: boolean,
): { bar: SubscriptionAction[]; menu: SubscriptionAction[] } {
  const money: SubscriptionAction[] = hasOpenInvoice
    ? PLATFORM_SETTINGS.payments.methods.cardLink
      ? ['recordPayment', 'sendLink']
      : ['recordPayment']
    : []
  switch (state) {
    case 'trial':
      return { bar: ['activate', 'changePlan'], menu: ['grantQuota', 'waiveOverage', 'cancel'] }
    case 'awaitingPayment':
    case 'grace':
      return {
        bar: [...money, 'activate', 'changePlan', 'suspend'],
        menu: ['grantQuota', 'waiveOverage', 'cancel'],
      }
    case 'active':
      return {
        bar: ['changePlan', ...money, 'suspend'],
        menu: ['grantQuota', 'waiveOverage', 'cancel'],
      }
    case 'suspended':
      return {
        bar: ['resume', ...money, 'changePlan'],
        menu: ['grantQuota', 'waiveOverage', 'cancel'],
      }
    default:
      return { bar: ['activate', 'changePlan'], menu: ['grantQuota', 'waiveOverage'] }
  }
}

const MENU_ICON: Partial<Record<SubscriptionAction, string>> = {
  grantQuota: invoiceIcon,
  waiveOverage: creditNoteIcon,
  cancel: deleteIcon,
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
 * `?action=recordPayment|sendLink|activate|changePlan|suspend|resume|cancel|grantQuota|waiveOverage`
 * (with an optional `&invoice=`) opens that modal on arrival, so the queue can deep-link to it.
 */
export function TenantDetailPage() {
  const { id = '' } = useParams()
  const identity = TENANT_IDENTITIES[id]
  const { t } = useTranslation()

  if (!identity) {
    return (
      <ConsoleShell>
        <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
          <ConsoleBreadcrumbs
            items={[{ labelKey: 'console.nav.tenants', to: '/console/tenants' }]}
          />
          <ConsoleNotice
            body={t('console.tenantDetail.notFound')}
            action={{ to: '/console/tenants', label: t('console.tenantDetail.notFoundBack') }}
          />
        </div>
      </ConsoleShell>
    )
  }

  return (
    <ConsoleShell>
      <TenantDetail tenantId={id} />
    </ConsoleShell>
  )
}

function TenantDetail({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const ledger = useSubscriptions()
  const identity = TENANT_IDENTITIES[tenantId]
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
  const parentCrumbs =
    from === 'subscriptions'
      ? [{ labelKey: 'console.nav.subscriptions', to: '/console/subscriptions' }]
      : from === 'invoices'
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
  const { bar, menu } = actionsFor(state, Boolean(openInvoice))
  const menuItems: ActionMenuItem[] = menu.map((action) => ({
    id: action,
    labelKey: `console.tenantDetail.actions.${action}`,
    icon: MENU_ICON[action] ?? invoiceIcon,
    danger: action === 'cancel',
    onSelect: () => open(action),
  }))

  const modalProps = {
    tenantId,
    ledger,
    invoiceId: request?.invoiceId,
    onClose: close,
    onDone: finish,
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <ConsoleBreadcrumbs items={[...parentCrumbs, { label: identity.name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface-card text-base font-semibold text-text-tertiary">
            {identity.initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary max-md:text-2xl">
                {identity.name}
              </h1>
              {subscription ? <SubscriptionStatePill state={subscription.state} /> : null}
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
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              {identity.town} · {t('console.tenants.vat')} {identity.vat} · {identity.contact.name}{' '}
              · <span dir="ltr">{identity.contact.phone}</span>
            </p>
          </div>
        </div>

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
          <ActionMenu
            items={menuItems}
            label={t('console.tenantDetail.actions.more')}
            variant="bordered"
            size="md"
          />
        </div>
      </div>

      {done ? (
        <p
          role="status"
          className="rounded-md bg-success-100 px-5 py-4 text-sm font-medium leading-[1.6] text-success-700"
        >
          {done}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md bg-surface-card px-6 pt-4">
        {TABS.map((entry) => {
          const active = entry === tab
          return (
            <button
              key={entry}
              type="button"
              onClick={() => setTab(entry)}
              aria-pressed={active}
              className={[
                'relative flex items-center gap-1.5 pb-3 text-base transition-colors',
                active
                  ? 'font-semibold text-primary-800'
                  : 'font-medium text-text-tertiary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(`console.tenantDetail.tabs.${entry}`)}
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary-700" />
              ) : null}
            </button>
          )
        })}
      </div>

      {tab === 'subscription' ? (
        <SubscriptionTab tenantId={tenantId} ledger={ledger} onAction={open} />
      ) : tab === 'filing' ? (
        filing ? (
          <section className="grid grid-cols-3 gap-4 rounded-md bg-surface-card p-5 max-md:grid-cols-1">
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
          <p className="rounded-md bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('console.tenantDetail.filing.noData')}
          </p>
        )
      ) : (
        <TenantErpTab tenantId={tenantId} />
      )}

      {request?.action === 'recordPayment' ? <RecordPaymentModal {...modalProps} /> : null}
      {request?.action === 'sendLink' ? <SendLinkModal {...modalProps} /> : null}
      {request?.action === 'activate' ? <ActivateModal {...modalProps} /> : null}
      {request?.action === 'changePlan' ? <ChangePlanModal {...modalProps} /> : null}
      {request?.action === 'suspend' ||
      request?.action === 'resume' ||
      request?.action === 'cancel' ? (
        <StateChangeModal mode={request.action} {...modalProps} />
      ) : null}
      {request?.action === 'grantQuota' ? <GrantQuotaModal {...modalProps} /> : null}
      {request?.action === 'waiveOverage' ? <WaiveOverageModal {...modalProps} /> : null}
    </div>
  )
}
