import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import {
  ConsoleBuildingIcon,
  ConsoleClockIcon,
  ConsoleIncidentIcon,
  ConsoleTickIcon,
} from '../../../layouts/ConsoleShell/consoleIcons'
import { ActionMenu, Modal, Rial, RowsView, type ActionMenuItem } from '../../../components/ui'
import { formatDay, formatMoment, localeFor } from '../../../lib/console/format'
import {
  NOW,
  consoleErpStore,
  pendingRequests,
  platformErpKpis,
  useConsoleErp,
  type AddonRequest,
} from '../../../lib/consoleErp'
import {
  planLabelKey,
  subscriptionOf,
  tenantIdentity,
  useSubscriptions,
  type SubscriptionState,
} from '../../../lib/consoleSubscriptions'
import { usePlatformSettings } from '../../../lib/platformSettings'
import { count, omr } from '../../../lib/superAdmin'
import {
  ModalFooter,
  QuickChips,
  SummaryLine,
  TextArea,
  focusFirstInvalidField,
  type Errors,
} from '../subscriptions/modalFields'
import { QueueKpiCard } from '../subscriptions/QueueKpiCard'
import pauseIcon from '../../../assets/actions/pause.svg'
import deleteIcon from '../../../assets/actions/delete.svg'

type Tab = 'pending' | 'history'
type Action = 'approve' | 'trial' | 'decline'
type Request = { action: Action; id: string }

const TRIAL_DAYS = [7, 14, 30]
const TRIAL_DOCUMENTS = [100, 200, 500]
const DAY = 24 * 60 * 60 * 1000

const PRIMARY_BUTTON =
  'inline-flex h-10 items-center whitespace-nowrap rounded-sm bg-primary-700 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-primary-700/40 disabled:hover:bg-primary-700/40'

/** The subscription states that should give an operator pause before switching a paid add-on on. */
const SUBSCRIPTION_WARNING: Partial<Record<SubscriptionState, 'danger' | 'pending'>> = {
  grace: 'danger',
  suspended: 'danger',
  awaitingPayment: 'pending',
}

const sameMonth = (date: Date | undefined) =>
  Boolean(date && date.getMonth() === NOW.getMonth() && date.getFullYear() === NOW.getFullYear())

/**
 * ERP › Add-on requests (docs/erp-and-console-plan.md §9.3): the "Ask to activate" queue. Approve
 * switches the add-on on and puts its line on the next invoice; a trial is free and short; a
 * decline carries a reason the tenant reads. History keeps every decision.
 */
export function ConsoleAddonRequestsPage() {
  const { t, i18n } = useTranslation()
  const state = useConsoleErp()
  const ledger = useSubscriptions()
  // The add-on's price and which plans may have it — the console's own Add-ons settings.
  const { settings } = usePlatformSettings()
  const ADDON = settings.addons.erpExtraction
  const availability = ADDON.availability
  const [tab, setTab] = useState<Tab>('pending')
  const [request, setRequest] = useState<Request | null>(null)
  const [done, setDone] = useState<{ message: string; tenantId: string } | null>(null)

  const pending = pendingRequests(state).sort(
    (a, b) => a.requestedAt.getTime() - b.requestedAt.getTime(),
  )
  const history = state.requests
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))
  const approvedThisMonth = history.filter(
    (r) => r.status === 'approved' && sameMonth(r.decidedAt),
  ).length
  const declinedThisMonth = history.filter(
    (r) => r.status === 'declined' && sameMonth(r.decidedAt),
  ).length
  const kpis = platformErpKpis(state)
  const month = NOW.toLocaleDateString(localeFor(i18n.language), { month: 'long' })
  const day = (date: Date) => formatDay(date.toISOString(), i18n.language)
  const moment = (date: Date) => formatMoment(date.toISOString(), i18n.language)

  const open = (action: Action, id: string) => {
    setDone(null)
    setRequest({ action, id })
  }
  const finish = (message: string, tenantId: string) => {
    setRequest(null)
    setDone({ message, tenantId })
  }

  const priceOf = (r: AddonRequest) =>
    r.source === 'PLAN_INCLUDED' || availability[r.plan] === 'included' ? (
      <span className="text-xs font-medium text-text-quaternary">
        {t('console.erp.requests.price.included')}
      </span>
    ) : r.source === 'TRIAL' ? (
      <span className="text-xs font-medium text-text-quaternary">
        {t('console.erp.requests.price.trial')}
      </span>
    ) : (
      <span className="whitespace-nowrap text-xs font-medium text-text-quaternary">
        <span className="me-1 text-text-secondary">
          <Rial />
        </span>
        {t('console.erp.requests.price.monthly', { amount: omr(ADDON.monthly) })}
      </span>
    )

  const tenantCell = (tenantId: string) => {
    const tenant = tenantIdentity(tenantId)
    return (
      <span className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background text-xs font-semibold text-text-tertiary">
          {tenant.initials}
        </span>
        <span className="min-w-0">
          <Link
            to={`/console/tenants/${tenant.id}?tab=erp`}
            className="text-base font-medium leading-[1.2] text-text-primary transition-colors hover:text-primary-700"
          >
            {tenant.name}
          </Link>
          <span className="mt-1 block text-xs font-medium text-text-quaternary">
            {tenant.town} · {t('console.tenants.vat')} {tenant.vat}
          </span>
        </span>
      </span>
    )
  }

  const current = request ? state.requests.find((r) => r.id === request.id) : undefined

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs
          items={[
            { labelKey: 'console.nav.group.erp', to: '/console/erp' },
            { labelKey: 'console.nav.erpRequests' },
          ]}
        />
        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary max-md:text-2xl">
            {t('console.erp.requests.title')}
          </h1>
          <p className="mt-1.5 max-w-[760px] text-sm font-medium leading-[1.5] text-text-quaternary">
            {t('console.erp.requests.subtitle')}
          </p>
        </div>

        {done ? (
          <ConsoleNotice
            badge={t('console.erp.requests.done.badge')}
            body={done.message}
            action={{
              label: t('console.erp.requests.done.link'),
              to: `/console/tenants/${done.tenantId}?tab=erp`,
            }}
          />
        ) : null}

        <div className="flex flex-wrap gap-4">
          <QueueKpiCard
            icon={<ConsoleClockIcon className="size-[18px] text-pending-700" />}
            title={t('console.erp.requests.kpi.pending')}
            value={String(pending.length)}
            note={
              pending[0]
                ? t('console.erp.requests.kpi.pendingOldest', { date: day(pending[0].requestedAt) })
                : t('console.erp.requests.kpi.pendingNote')
            }
            tone={pending.length ? 'watch' : 'calm'}
          />
          <QueueKpiCard
            icon={<ConsoleTickIcon className="size-[18px] text-success-700" />}
            title={t('console.erp.requests.kpi.approved', { month })}
            value={String(approvedThisMonth)}
            note={t('console.erp.requests.kpi.approvedNote')}
          />
          <QueueKpiCard
            icon={<ConsoleIncidentIcon className="size-[18px] text-danger-700" />}
            title={t('console.erp.requests.kpi.declined', { month })}
            value={String(declinedThisMonth)}
            note={t('console.erp.requests.kpi.declinedNote')}
          />
          <QueueKpiCard
            icon={<ConsoleBuildingIcon className="size-[18px] text-primary-700" />}
            title={t('console.erp.requests.kpi.onAddon')}
            value={count(kpis.tenantsOnAddon)}
            note={t('console.erp.requests.kpi.onAddonNote', {
              paying: kpis.tenantsPaying,
              monthly: `OMR ${omr(ADDON.monthly)}`,
            })}
          />
        </div>

        <section className="flex flex-col rounded-md bg-surface-card">
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border-subtle px-6 pt-4">
            {(['pending', 'history'] as Tab[]).map((entry) => {
              const active = entry === tab
              const total = entry === 'pending' ? pending.length : history.length
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
                  {t(`console.erp.requests.tab.${entry}`)}
                  <span className="text-xs font-semibold text-text-quaternary">{count(total)}</span>
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary-700" />
                  ) : null}
                </button>
              )
            })}
          </div>

          {tab === 'pending' ? (
            <RowsView className="px-6 pb-6 pt-4">
              <table className="w-full min-w-[980px] border-collapse text-start">
                <thead>
                  <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                    <th className="w-[260px] px-4 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.tenant')}
                    </th>
                    <th className="w-[210px] px-2 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.plan')}
                    </th>
                    <th className="px-2 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.requested')}
                    </th>
                    <th className="px-2 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.source')}
                    </th>
                    <th className="px-2 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.subscription')}
                    </th>
                    <th className="w-[200px] px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pending.map((r) => {
                    const subscription = subscriptionOf(ledger, r.tenantId)
                    const warning = subscription
                      ? SUBSCRIPTION_WARNING[subscription.state]
                      : undefined
                    // The plan does not carry the add-on: the tenant moves up first.
                    const notOffered = availability[r.plan] === 'notOffered'
                    const planName = t(planLabelKey(r.plan))
                    const menu: ActionMenuItem[] = [
                      {
                        id: 'trial',
                        labelKey: 'console.erp.requests.approveTrial',
                        icon: pauseIcon,
                        onSelect: () => open('trial', r.id),
                      },
                      {
                        id: 'decline',
                        labelKey: 'console.erp.requests.decline',
                        icon: deleteIcon,
                        danger: true,
                        onSelect: () => open('decline', r.id),
                      },
                    ]
                    return (
                      <tr key={r.id} className="border-b border-[#f3f3f3] last:border-b-0">
                        <td className="px-4 py-4">{tenantCell(r.tenantId)}</td>
                        <td className="px-2 py-4">
                          <span className="block text-sm font-medium text-text-primary">
                            {planName}
                          </span>
                          {subscription ? (
                            <span className="mt-1 block text-xs font-medium text-text-quaternary">
                              {t(`console.subscriptions.term.${subscription.term}`)}
                            </span>
                          ) : null}
                          {notOffered ? (
                            // Wraps, unlike the status pill: the cell is narrow and the plan name
                            // is in the sentence.
                            <span
                              role="note"
                              title={t('console.erp.requests.notOfferedHint', { plan: planName })}
                              className="mt-2 inline-flex max-w-[220px] items-start gap-1.5 rounded-md bg-pending-100 px-2.5 py-1.5 text-xs font-semibold leading-[1.4] text-pending-700"
                            >
                              <span
                                aria-hidden="true"
                                className="mt-[5px] size-1.5 shrink-0 rounded-full bg-current"
                              />
                              {t('console.erp.requests.notOffered', { plan: planName })}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-4">
                          <span className="block whitespace-nowrap text-sm font-medium text-text-primary">
                            {moment(r.requestedAt)}
                          </span>
                          <span className="mt-1 block text-xs font-medium text-text-quaternary">
                            {t('console.erp.requests.by', { by: r.requestedBy })}
                          </span>
                        </td>
                        <td className="px-2 py-4">
                          <span className="block text-sm font-medium text-text-primary">
                            {t(`console.erp.requests.source.${r.source}`)}
                          </span>
                          <span className="mt-1 block">{priceOf(r)}</span>
                        </td>
                        <td className="px-2 py-4">
                          {subscription ? (
                            warning ? (
                              <ConsoleStatusPill
                                tone={warning}
                                label={t(`console.erp.requests.subscription.${subscription.state}`)}
                              />
                            ) : (
                              <ConsoleStatusPill
                                tone={subscription.state === 'trial' ? 'neutral' : 'success'}
                                label={t(
                                  subscription.state === 'trial'
                                    ? 'console.erp.requests.subscription.trial'
                                    : 'console.erp.requests.subscription.ok',
                                )}
                              />
                            )
                          ) : (
                            <span className="text-sm font-medium text-text-quaternary">—</span>
                          )}
                        </td>
                        <td className="px-2 py-4">
                          <span className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => open('approve', r.id)}
                              disabled={notOffered}
                              title={
                                notOffered
                                  ? t('console.erp.requests.notOfferedHint', { plan: planName })
                                  : undefined
                              }
                              className={PRIMARY_BUTTON}
                            >
                              {t('console.erp.requests.approve')}
                            </button>
                            <ActionMenu
                              items={menu}
                              label={t('console.erp.requests.rowMenu')}
                              floating
                            />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {pending.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
                  {t('console.erp.requests.empty.pending')}
                </p>
              ) : null}
            </RowsView>
          ) : (
            <RowsView className="px-6 pb-6 pt-4">
              <table className="w-full min-w-[980px] border-collapse text-start">
                <thead>
                  <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                    <th className="px-4 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.tenant')}
                    </th>
                    <th className="px-2 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.plan')}
                    </th>
                    <th className="px-2 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.requested')}
                    </th>
                    <th className="px-2 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.decided')}
                    </th>
                    <th className="px-2 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.outcome')}
                    </th>
                    <th className="px-2 py-3 text-start font-semibold">
                      {t('console.erp.requests.col.note')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id} className="border-b border-[#f3f3f3] align-top last:border-b-0">
                      <td className="px-4 py-4">{tenantCell(r.tenantId)}</td>
                      <td className="px-2 py-4">
                        <span className="block text-sm font-medium text-text-primary">
                          {t(planLabelKey(r.plan))}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t(`console.erp.requests.source.${r.source}`)}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <span className="block whitespace-nowrap text-sm font-medium text-text-primary">
                          {moment(r.requestedAt)}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t('console.erp.requests.by', { by: r.requestedBy })}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <span className="block whitespace-nowrap text-sm font-medium text-text-primary">
                          {r.decidedAt ? moment(r.decidedAt) : '—'}
                        </span>
                        {r.decidedBy ? (
                          <span className="mt-1 block text-xs font-medium text-text-quaternary">
                            {t('console.erp.requests.by', { by: r.decidedBy })}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-4">
                        <ConsoleStatusPill
                          tone={r.status === 'approved' ? 'success' : 'danger'}
                          label={t(`console.erp.requests.outcome.${r.status}`)}
                        />
                      </td>
                      <td className="max-w-[280px] px-2 py-4">
                        <span className="block text-sm font-medium leading-[1.5] text-text-secondary">
                          {r.note ?? t('console.erp.requests.noNote')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
                  {t('console.erp.requests.empty.history')}
                </p>
              ) : null}
            </RowsView>
          )}
        </section>
      </div>

      {current && request?.action === 'approve' ? (
        <ApproveModal request={current} onClose={() => setRequest(null)} onDone={finish} />
      ) : null}
      {current && request?.action === 'trial' ? (
        <TrialModal request={current} onClose={() => setRequest(null)} onDone={finish} />
      ) : null}
      {current && request?.action === 'decline' ? (
        <DeclineModal request={current} onClose={() => setRequest(null)} onDone={finish} />
      ) : null}
    </ConsoleShell>
  )
}

/* ----------------------------------------------------------------- modals */

type ModalProps = {
  request: AddonRequest
  onClose: () => void
  onDone: (message: string, tenantId: string) => void
}

function ApproveModal({ request, onClose, onDone }: ModalProps) {
  const { t } = useTranslation()
  const tenant = tenantIdentity(request.tenantId)
  const [note, setNote] = useState('')
  const ADDON = usePlatformSettings().settings.addons.erpExtraction
  const included =
    ADDON.availability[request.plan] === 'included' || request.source === 'PLAN_INCLUDED'
  const planName = t(planLabelKey(request.plan))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    consoleErpStore.approveRequest(request.id, note.trim() || undefined)
    onDone(t('console.erp.requests.done.approved', { tenant: tenant.name }), request.tenantId)
  }

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t('console.erp.requests.approveModal.title', { tenant: tenant.name })}
      subtitle={t('console.erp.requests.approveModal.subtitle')}
      footer={
        <ModalFooter
          formId="approve-request"
          onCancel={onClose}
          submitLabel={t('console.erp.requests.approveModal.confirm')}
        />
      }
    >
      <form id="approve-request" noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="rounded-sm bg-surface-background px-4">
          <SummaryLine label={t('console.erp.requests.approveModal.tenant')} value={tenant.name} />
          <SummaryLine label={t('console.erp.requests.approveModal.plan')} value={planName} />
          <SummaryLine
            label={t('console.erp.requests.approveModal.price')}
            value={
              included ? (
                t('console.erp.requests.approveModal.priceIncluded')
              ) : (
                <span className="whitespace-nowrap">
                  <span className="me-1">
                    <Rial />
                  </span>
                  {t('console.erp.requests.price.monthly', { amount: omr(ADDON.monthly) })}
                </span>
              )
            }
          />
          <SummaryLine
            label={t('console.erp.requests.approveModal.allowance')}
            value={t('console.erp.requests.approveModal.allowanceValue', {
              connections: 5,
              documents: count(ADDON.documents),
            })}
          />
          <SummaryLine
            label={t('console.erp.requests.approveModal.billing')}
            value={t(
              included
                ? 'console.erp.requests.approveModal.billingIncluded'
                : 'console.erp.requests.approveModal.billingValue',
              { plan: planName },
            )}
          />
        </div>
        <TextArea
          name="note"
          label={t('console.erp.requests.approveModal.note')}
          placeholder={t('console.erp.requests.approveModal.notePlaceholder')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </form>
    </Modal>
  )
}

function TrialModal({ request, onClose, onDone }: ModalProps) {
  const { t, i18n } = useTranslation()
  const tenant = tenantIdentity(request.tenantId)
  const [days, setDays] = useState(14)
  const [documents, setDocuments] = useState(200)
  const dayOptions = TRIAL_DAYS.map((d) => ({
    id: String(d),
    label: t('console.erp.requests.trialModal.daysChip', { count: d }),
  }))
  const documentOptions = TRIAL_DOCUMENTS.map((d) => ({
    id: String(d),
    label: t('console.erp.requests.trialModal.documentsChip', { count: count(d) }),
  }))
  const endsOn = formatDay(new Date(NOW.getTime() + days * DAY).toISOString(), i18n.language)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    consoleErpStore.approveRequestOnTrial(request.id, days, documents)
    onDone(t('console.erp.requests.done.trial', { tenant: tenant.name, days }), request.tenantId)
  }

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t('console.erp.requests.trialModal.title', { tenant: tenant.name })}
      subtitle={t('console.erp.requests.trialModal.subtitle')}
      footer={
        <ModalFooter
          formId="trial-request"
          onCancel={onClose}
          submitLabel={t('console.erp.requests.trialModal.confirm')}
        />
      }
    >
      <form id="trial-request" noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">
            {t('console.erp.requests.trialModal.days')}
          </span>
          <QuickChips
            options={dayOptions}
            value={dayOptions.find((o) => o.id === String(days))?.label ?? ''}
            onPick={(label) => {
              const picked = dayOptions.find((o) => o.label === label)
              if (picked) setDays(Number(picked.id))
            }}
          />
          <span className="text-xs font-medium text-text-tertiary">
            {t('console.erp.requests.trialModal.endsOn', { date: endsOn })}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">
            {t('console.erp.requests.trialModal.documents')}
          </span>
          <QuickChips
            options={documentOptions}
            value={documentOptions.find((o) => o.id === String(documents))?.label ?? ''}
            onPick={(label) => {
              const picked = documentOptions.find((o) => o.label === label)
              if (picked) setDocuments(Number(picked.id))
            }}
          />
        </div>
        <div className="rounded-sm bg-surface-background px-4">
          <SummaryLine label={t('console.erp.requests.approveModal.tenant')} value={tenant.name} />
          <SummaryLine
            label={t('console.erp.requests.approveModal.plan')}
            value={t(planLabelKey(request.plan))}
          />
          <SummaryLine
            label={t('console.erp.requests.approveModal.price')}
            value={t('console.erp.requests.price.trial')}
          />
        </div>
      </form>
    </Modal>
  )
}

function DeclineModal({ request, onClose, onDone }: ModalProps) {
  const { t } = useTranslation()
  const tenant = tenantIdentity(request.tenantId)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors<'reason'>>({})
  const quick = (['grace', 'plan', 'verify'] as const).map((id) => ({
    id,
    label: t(`console.erp.requests.declineModal.quick.${id}`),
  }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<'reason'> = {}
    if (!reason.trim()) next.reason = t('validation.required')
    setErrors(next)
    if (next.reason) {
      focusFirstInvalidField(event.currentTarget, ['reason'], next)
      return
    }
    consoleErpStore.declineRequest(request.id, reason.trim())
    onDone(t('console.erp.requests.done.declined', { tenant: tenant.name }), request.tenantId)
  }

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t('console.erp.requests.declineModal.title', { tenant: tenant.name })}
      subtitle={t('console.erp.requests.declineModal.subtitle')}
      footer={
        <ModalFooter
          formId="decline-request"
          onCancel={onClose}
          submitLabel={t('console.erp.requests.declineModal.confirm')}
          danger
        />
      }
    >
      <form id="decline-request" noValidate onSubmit={submit} className="flex flex-col gap-4">
        <QuickChips
          options={quick}
          value={reason}
          onPick={(label) => {
            setReason(label)
            setErrors({})
          }}
        />
        <TextArea
          name="reason"
          label={t('console.erp.requests.declineModal.reason')}
          required
          placeholder={t('console.erp.requests.declineModal.reasonPlaceholder')}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setErrors({})
          }}
          error={errors.reason}
        />
      </form>
    </Modal>
  )
}
