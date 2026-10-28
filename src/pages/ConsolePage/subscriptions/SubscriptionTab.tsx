import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Rial, RowsView, withRial } from '../../../components/ui'
import { formatMoment } from '../../../lib/console/format'
import {
  SUBSCRIPTIONS_NOW,
  daysUntil,
  documentsAllowance,
  eventsOf,
  graceDay,
  grantsOf,
  invoicesOf,
  linkStatusAt,
  linksOf,
  openInvoiceOf,
  paymentsOf,
  planLabelKey,
  subscriptionOf,
  suspendsOn,
  tenantIdentity,
  type SampleMoney,
  type Subscription,
  type SubscriptionEvent,
} from '../../../lib/consoleSubscriptions'
import { PLAN, TRIAL } from '../../../lib/plans'
import { PLATFORM_SETTINGS } from '../../../lib/platformSettings'
import { count, omr } from '../../../lib/superAdmin'
import { InvoiceStatusPill, LinkStatusPill } from './SubscriptionStatePill'
import { dayLabel, type Ledger } from './modalFields'
import {
  CONSOLE_CARD_HEAD,
  CONSOLE_CARD_TITLE,
  CONSOLE_TABLE,
  CONSOLE_THEAD,
} from '../../../layouts/ConsoleShell/consoleStyle'

export type SubscriptionAction =
  | 'recordPayment'
  | 'sendLink'
  | 'activate'
  | 'changePlan'
  | 'suspend'
  | 'resume'

export const SUBSCRIPTION_ACTIONS: SubscriptionAction[] = [
  'recordPayment',
  'sendLink',
  'activate',
  'changePlan',
  'suspend',
  'resume',
]

type Props = {
  tenantId: string
  ledger: Ledger
  onAction: (action: SubscriptionAction, invoiceId?: string) => void
}

/* ------------------------------------------------------------------ pieces */

/** The console's card: a titled header and a body, as the Operations screen draws its panels. */
function Card({
  title,
  aside,
  children,
  padded = true,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  padded?: boolean
}) {
  return (
    <section className="flex flex-col rounded-sm bg-surface-card">
      <div className={CONSOLE_CARD_HEAD}>
        <h2 className={CONSOLE_CARD_TITLE}>{title}</h2>
        {aside}
      </div>
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

function Line({ label, value, tone }: { label: string; value: ReactNode; tone?: 'bad' | 'watch' }) {
  const valueTone =
    tone === 'bad' ? 'text-danger-700' : tone === 'watch' ? 'text-pending-500' : 'text-text-primary'
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle py-[9px] text-[13.5px] last:border-b-0">
      <span className="shrink-0 font-medium text-text-muted">{label}</span>
      <span className={`min-w-0 text-end font-semibold ${valueTone}`}>{value}</span>
    </div>
  )
}

/** An amount with the rial sign in the amount's own colour, or a dash where the sample has none. */
function Money({ amount, className = '' }: { amount: SampleMoney; className?: string }) {
  if (amount === null) return <span className={className}>—</span>
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${className}`}>
      <Rial />
      {omr(amount)}
    </span>
  )
}

/** The Tenants screen's quota bar, with its label under it. */
function UsageBar({
  label,
  used,
  allowance,
  unlimitedLabel,
  ofLabel,
}: {
  label: string
  used: number
  allowance: number | null
  unlimitedLabel: string
  ofLabel: (used: string, allowance: string) => string
}) {
  const share = allowance ? Math.min(used / allowance, 1) : 0
  // Red only past the allowance: a seat or branch limit that is exactly used is full, not wrong.
  const over = allowance !== null && used > allowance
  const colour = over ? 'bg-danger-700' : share >= 0.85 ? 'bg-pending-500' : 'bg-success-700'
  return (
    <div className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-text-tertiary">{label}</span>
        <span className="text-xs font-medium text-text-quaternary">
          {allowance === null ? unlimitedLabel : ofLabel(count(used), count(allowance))}
        </span>
      </div>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-neutral-50">
        <span
          className={`block h-full rounded-full ${colour}`}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
    </div>
  )
}

const TH = 'px-3 py-3 text-start font-semibold first:ps-4 last:pe-4'
const TD = 'px-3 py-3.5 align-top first:ps-4 last:pe-4'

/* ------------------------------------------------------------------- the tab */

export function SubscriptionTab({ tenantId, ledger, onAction }: Props) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const tenant = tenantIdentity(tenantId)
  const subscription = subscriptionOf(ledger, tenantId)
  if (!subscription) return null

  const day = (date: Date) => dayLabel(date, language)
  const moment = (date: Date) => formatMoment(date.toISOString(), language)
  const planLabel = t(planLabelKey(subscription.plan))
  const termLabel = t(`console.subscriptions.term.${subscription.term}`)
  const catalogue = subscription.plan === 'enterprise' ? null : PLAN[subscription.plan]
  const enterprise = subscription.enterprise
  const openInvoice = openInvoiceOf(ledger, tenantId)
  const invoices = invoicesOf(ledger, tenantId)
  const payments = paymentsOf(ledger, tenantId)
  const links = linksOf(ledger, tenantId)
  const events = eventsOf(ledger, tenantId)
  const grants = grantsOf(ledger, tenantId).filter((grant) => grant.expires >= SUBSCRIPTIONS_NOW)
  const granted = grants.reduce((sum, grant) => sum + grant.documents, 0)
  const allowance = documentsAllowance(subscription) + granted
  const peopleAllowance = catalogue ? catalogue.people : (enterprise?.people ?? null)
  const branchesAllowance = catalogue ? catalogue.branches : (enterprise?.branches ?? null)
  const bank = PLATFORM_SETTINGS.payments.bank

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-4 max-lg:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-4">
        {/* 1 — plan and terms */}
        <Card title={t('console.tenantDetail.plan.title')}>
          <Line label={t('console.tenantDetail.plan.plan')} value={planLabel} />
          <Line label={t('console.tenantDetail.plan.term')} value={termLabel} />
          {/* The sample holds no prices (PY-2): the plan's price is the server's to state. */}
          <Line label={t('console.tenantDetail.plan.price')} value="—" />
          <Line
            label={t('console.tenantDetail.plan.documents')}
            value={count(catalogue ? catalogue.documents : (enterprise?.documents ?? 0))}
          />
          <Line
            label={t('console.tenantDetail.plan.people')}
            value={
              peopleAllowance === null
                ? t('console.tenantDetail.plan.unlimited')
                : count(peopleAllowance)
            }
          />
          <Line
            label={t('console.tenantDetail.plan.branches')}
            value={
              branchesAllowance === null
                ? t('console.tenantDetail.plan.unlimited')
                : count(branchesAllowance)
            }
          />
          {catalogue ? (
            <Line label={t('console.tenantDetail.plan.overageRate')} value="—" />
          ) : null}
          {enterprise ? (
            <>
              <Line
                label={t('console.tenantDetail.plan.contract')}
                value={t('console.tenantDetail.plan.contractValue', {
                  from: day(enterprise.contractFrom),
                  to: day(enterprise.contractTo),
                })}
              />
              <Line label={t('console.tenantDetail.plan.sla')} value={enterprise.sla} />
            </>
          ) : null}
          {subscription.grandfatheredSince ? (
            <p className="py-2.5 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('console.tenantDetail.plan.grandfathered', {
                date: day(subscription.grandfatheredSince),
              })}
            </p>
          ) : null}
          {subscription.scheduledChange ? (
            <p className="py-2.5 text-xs font-semibold leading-[1.5] text-pending-700">
              {t('console.tenantDetail.plan.scheduled', {
                plan: t(planLabelKey(subscription.scheduledChange.plan)),
                term: t(
                  `console.subscriptions.term.${subscription.scheduledChange.term}`,
                ).toLowerCase(),
                date: day(subscription.scheduledChange.at),
              })}
            </p>
          ) : null}
        </Card>

        {/* 2 — this period */}
        <Card title={t('console.tenantDetail.period.title')}>
          <Line
            label={t('console.tenantDetail.period.period')}
            value={t('console.tenantDetail.period.range', {
              from: day(subscription.periodStart),
              to: day(subscription.periodEnd),
            })}
          />
          <PeriodStatus subscription={subscription} openDue={openInvoice?.due} day={day} />

          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle py-3">
            <div>
              <p className="text-sm font-medium text-text-tertiary">
                {t('console.tenantDetail.period.amountDue')}
              </p>
              {subscription.amountDue === null || subscription.amountDue > 0 ? (
                <p
                  className={`mt-1 text-[28px] font-semibold leading-[1.1] ${openInvoice?.status === 'overdue' || subscription.state === 'grace' ? 'text-danger-700' : 'text-text-primary'}`}
                >
                  <Money amount={subscription.amountDue} />
                </p>
              ) : (
                <p className="mt-1 text-[28px] font-semibold leading-[1.1] text-text-quaternary">
                  {t('console.tenantDetail.period.nothingDue')}
                </p>
              )}
            </div>
            {openInvoice ? (
              <div className="flex items-center gap-2.5">
                <bdi dir="ltr" className="text-sm font-semibold text-text-secondary">
                  {openInvoice.number}
                </bdi>
                <InvoiceStatusPill status={openInvoice.status} />
              </div>
            ) : null}
          </div>

          <div className="py-1">
            <UsageBar
              label={t('console.tenantDetail.period.documents')}
              used={subscription.usage.documents}
              allowance={allowance}
              unlimitedLabel={t('console.tenantDetail.plan.unlimited')}
              ofLabel={(used, total) =>
                t('console.tenantDetail.period.ofAllowance', { used, allowance: total })
              }
            />
            {grants.map((grant) => (
              <p key={grant.id} className="-mt-1 pb-2 text-xs font-medium text-success-700">
                {t('console.tenantDetail.period.grant', {
                  documents: count(grant.documents),
                  date: day(grant.expires),
                  reason: grant.reason,
                })}
              </p>
            ))}
            <UsageBar
              label={t('console.tenantDetail.period.people')}
              used={subscription.usage.people}
              allowance={peopleAllowance}
              unlimitedLabel={t('console.tenantDetail.plan.unlimited')}
              ofLabel={(used, total) =>
                t('console.tenantDetail.period.ofAllowance', { used, allowance: total })
              }
            />
            <UsageBar
              label={t('console.tenantDetail.period.branches')}
              used={subscription.usage.branches}
              allowance={branchesAllowance}
              unlimitedLabel={t('console.tenantDetail.plan.unlimited')}
              ofLabel={(used, total) =>
                t('console.tenantDetail.period.ofAllowance', { used, allowance: total })
              }
            />
          </div>
          <p
            className={`border-t border-border-subtle py-2.5 text-xs font-medium leading-[1.5] ${subscription.overageOn ? 'text-text-quaternary' : 'text-pending-700'}`}
          >
            {subscription.state === 'trial'
              ? t('console.tenantDetail.period.trialAllowance', { documents: TRIAL.documents })
              : subscription.overageOn
                ? t('console.tenantDetail.period.overageOn')
                : t('console.tenantDetail.period.overageOff')}
          </p>
        </Card>

        {/* 3 — subscription invoices */}
        <Card title={t('console.tenantDetail.invoices.title')} padded={false}>
          {invoices.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm font-medium text-text-tertiary">
              {t('console.tenantDetail.invoices.empty')}
            </p>
          ) : (
            <RowsView className="px-0 pb-1">
              <table className={`${CONSOLE_TABLE} min-w-[640px]`}>
                <thead>
                  <tr className={CONSOLE_THEAD}>
                    <th className={TH}>{t('console.tenantDetail.invoices.col.number')}</th>
                    <th className={TH}>{t('console.tenantDetail.invoices.col.period')}</th>
                    <th className={`${TH} text-end`}>
                      {t('console.tenantDetail.invoices.col.total')}
                    </th>
                    <th className={TH}>{t('console.tenantDetail.invoices.col.status')}</th>
                    <th className={TH}>{t('console.tenantDetail.invoices.col.paid')}</th>
                    <th className={`${TH} w-24`}>
                      <span className="sr-only">{t('console.tenantDetail.invoices.download')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-[#f3f3f3] last:border-b-0">
                      <td className={TD}>
                        <span className="block text-sm font-semibold text-text-primary">
                          <bdi dir="ltr" className="whitespace-nowrap">{invoice.number}</bdi>
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t(invoice.coverKey, {
                            ...invoice.coverValues,
                            plan: t(planLabelKey(subscription.plan)),
                          })}
                        </span>
                      </td>
                      <td className={`${TD} text-sm font-medium text-text-secondary`}>
                        {t('console.tenantDetail.period.range', {
                          from: day(invoice.periodStart),
                          to: day(invoice.periodEnd),
                        })}
                      </td>
                      <td className={`${TD} text-end text-sm font-semibold text-text-primary`}>
                        <Money amount={invoice.total} />
                      </td>
                      <td className={TD}>
                        <InvoiceStatusPill status={invoice.status} />
                      </td>
                      <td className={`${TD} text-sm font-medium text-text-secondary`}>
                        {invoice.paidOn && invoice.method
                          ? t('console.tenantDetail.invoices.paidVia', {
                              date: day(invoice.paidOn),
                              method: t(`console.subscriptions.methodShort.${invoice.method}`),
                            })
                          : t('console.tenantDetail.invoices.notPaid')}
                      </td>
                      <td className={`${TD} text-end`}>
                        <button
                          type="button"
                          className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                        >
                          {t('console.tenantDetail.invoices.download')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RowsView>
          )}
        </Card>

        {/* 4 — payments ledger */}
        <Card title={t('console.tenantDetail.payments.title')} padded={false}>
          {payments.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm font-medium text-text-tertiary">
              {t('console.tenantDetail.payments.empty')}
            </p>
          ) : (
            <RowsView className="px-0 pb-1">
              <table className={`${CONSOLE_TABLE} min-w-[640px]`}>
                <thead>
                  <tr className={CONSOLE_THEAD}>
                    <th className={TH}>{t('console.tenantDetail.payments.col.date')}</th>
                    <th className={TH}>{t('console.tenantDetail.payments.col.method')}</th>
                    <th className={`${TH} text-end`}>
                      {t('console.tenantDetail.payments.col.amount')}
                    </th>
                    <th className={TH}>{t('console.tenantDetail.payments.col.reference')}</th>
                    <th className={TH}>{t('console.tenantDetail.payments.col.confirmedBy')}</th>
                    <th className={TH}>{t('console.tenantDetail.payments.col.note')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-[#f3f3f3] last:border-b-0">
                      <td className={`${TD} text-sm font-semibold text-text-primary`}>
                        {day(payment.receivedOn)}
                      </td>
                      <td className={`${TD} text-sm font-medium text-text-secondary`}>
                        {t(`console.subscriptions.method.${payment.method}`)}
                      </td>
                      <td className={`${TD} text-end text-sm font-semibold text-text-primary`}>
                        <Money amount={payment.amount} />
                      </td>
                      <td className={`${TD} text-sm font-medium text-text-secondary`}>
                        <span dir="ltr">{payment.reference ?? '—'}</span>
                      </td>
                      <td className={`${TD} text-sm font-medium text-text-secondary`}>
                        {payment.confirmedBy}
                      </td>
                      <td
                        className={`${TD} text-xs font-medium leading-[1.5] text-text-quaternary`}
                      >
                        {payment.note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RowsView>
          )}
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {/* 5 — payment links */}
        <Card
          title={t('console.tenantDetail.links.title')}
          aside={
            openInvoice ? (
              <button
                type="button"
                onClick={() => onAction('sendLink', openInvoice.id)}
                className="text-sm font-semibold text-primary-700 hover:text-primary-800"
              >
                {links.length > 0
                  ? t('console.tenantDetail.links.resend')
                  : t('console.tenantDetail.links.send')}
              </button>
            ) : null
          }
        >
          {links.length === 0 ? (
            <p className="py-4 text-sm font-medium leading-[1.5] text-text-tertiary">
              {t('console.tenantDetail.links.empty')}
            </p>
          ) : (
            links.map((link) => {
              const status = linkStatusAt(link)
              return (
                <div
                  key={link.id}
                  className="flex flex-col gap-1.5 border-b border-border-subtle py-3 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-text-primary">
                      {t(`console.subscriptions.channel.${link.sentVia}`)}
                    </span>
                    <LinkStatusPill status={status} />
                  </div>
                  <span dir="ltr" className="truncate text-xs font-medium text-text-quaternary">
                    {link.url}
                  </span>
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('console.tenantDetail.links.sent', {
                      when: moment(link.sentAt),
                      by: link.sentBy,
                    })}
                  </span>
                  <span
                    className={`text-xs font-medium ${status === 'expired' ? 'text-danger-700' : 'text-text-quaternary'}`}
                  >
                    {t('console.tenantDetail.links.expires', { date: day(link.expiresAt) })}
                  </span>
                </div>
              )
            })
          )}
        </Card>

        {/* 6 — how they pay */}
        <Card title={t('console.tenantDetail.pay.title')}>
          <Line
            label={t('console.tenantDetail.pay.preferred')}
            value={t(`console.subscriptions.method.${subscription.preferredMethod}`)}
          />
          <div className="flex flex-col gap-0.5 border-b border-border-subtle py-2.5 last:border-b-0">
            <span className="text-sm font-medium text-text-tertiary">
              {t('console.tenantDetail.pay.contact')}
            </span>
            <span className="text-sm font-semibold text-text-primary">{tenant.contact.name}</span>
            <a
              href={`tel:${tenant.contact.phone.replace(/\s/g, '')}`}
              dir="ltr"
              className="w-fit text-sm font-medium text-text-secondary hover:text-primary-800"
            >
              {tenant.contact.phone}
            </a>
            <a
              href={`mailto:${tenant.contact.email}`}
              dir="ltr"
              className="w-fit text-sm font-medium text-text-secondary hover:text-primary-800"
            >
              {tenant.contact.email}
            </a>
          </div>
          {subscription.preferredMethod === 'bankTransfer' ? (
            <div className="py-2.5">
              <p className="text-sm font-medium text-text-tertiary">
                {t('console.tenantDetail.pay.bank.title')}
              </p>
              {/* The same withholding as every tenant screen: an operator must not read out an
                  account nobody has confirmed (bankBeneficiaryVerified). */}
              {!PLATFORM_SETTINGS.payments.bankBeneficiaryVerified ? (
                <p className="mt-1.5 text-xs font-medium text-text-quaternary">
                  {t('console.tenantDetail.pay.bank.unverified')}
                </p>
              ) : (
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs font-medium">
                <dt className="text-text-quaternary">
                  {t('console.tenantDetail.pay.bank.accountName')}
                </dt>
                <dd className="text-text-secondary">{bank.accountName}</dd>
                <dt className="text-text-quaternary">{t('console.tenantDetail.pay.bank.bank')}</dt>
                <dd className="text-text-secondary">{bank.bank}</dd>
                <dt className="text-text-quaternary">{t('console.tenantDetail.pay.bank.iban')}</dt>
                <dd dir="ltr" className="text-start text-text-secondary">
                  {bank.iban}
                </dd>
                <dt className="text-text-quaternary">
                  {t('console.tenantDetail.pay.bank.reference')}
                </dt>
                <dd dir="ltr" className="text-start text-text-secondary">
                  {bank.referenceFormat.replace(
                    '{invoice}',
                    (openInvoice ?? invoices[0])?.number ?? '…',
                  )}
                </dd>
              </dl>
              )}
            </div>
          ) : null}
        </Card>

        {/* 7 — activity */}
        <Card title={t('console.tenantDetail.activity.title')}>
          {events.length === 0 ? (
            <p className="py-4 text-sm font-medium text-text-tertiary">
              {t('console.tenantDetail.activity.empty')}
            </p>
          ) : (
            <ol>
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-col gap-1 border-b border-border-subtle py-3 last:border-b-0"
                >
                  <span className="text-sm font-medium leading-[1.4] text-text-primary">
                    {withRial(
                      t(
                        `console.subscriptions.event.${event.actionKey}`,
                        eventValues(event, t, day),
                      ),
                    )}
                  </span>
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('console.tenantDetail.activity.by', {
                      by: event.by,
                      when: moment(event.at),
                    })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  )
}

/** The line that says what happens next for this period, in the state's own tone. */
function PeriodStatus({
  subscription,
  openDue,
  day,
}: {
  subscription: Subscription
  openDue?: Date
  day: (date: Date) => string
}) {
  const { t } = useTranslation()
  switch (subscription.state) {
    case 'trial': {
      const ends = subscription.trialEndsAt ?? subscription.periodEnd
      const left = Math.max(daysUntil(ends), 0)
      return (
        <Line
          label={t('console.tenantDetail.period.trialEnds', { date: day(ends) })}
          value={t('console.tenantDetail.period.daysLeft', { count: left })}
          tone={left <= 3 ? 'watch' : undefined}
        />
      )
    }
    case 'grace': {
      const until = suspendsOn(subscription)
      return (
        <p className="border-b border-border-subtle py-2.5 text-sm font-semibold text-danger-700">
          {t('console.tenantDetail.period.grace', {
            day: graceDay(subscription),
            total: PLATFORM_SETTINGS.lifecycle.graceDays,
            date: until ? day(until) : '',
          })}
        </p>
      )
    }
    case 'awaitingPayment': {
      const due = openDue ?? subscription.periodStart
      const overdue = Math.max(-daysUntil(due), 0)
      return (
        <p
          className={`border-b border-border-subtle py-2.5 text-sm font-semibold ${overdue > 0 ? 'text-pending-700' : 'text-text-primary'}`}
        >
          {overdue > 0
            ? t('console.tenantDetail.period.overdueBy', { date: day(due), count: overdue })
            : t('console.tenantDetail.period.dueOn', { date: day(due) })}
        </p>
      )
    }
    case 'suspended':
      return (
        <p className="border-b border-border-subtle py-2.5 text-sm font-semibold text-danger-700">
          {t('console.tenantDetail.period.suspendedSince', {
            date: day(subscription.stateSince ?? subscription.periodStart),
          })}
        </p>
      )
    case 'cancelled':
      return (
        <p className="border-b border-border-subtle py-2.5 text-sm font-medium text-text-tertiary">
          {t('console.tenantDetail.period.cancelledOn', {
            date: day(subscription.stateSince ?? subscription.periodStart),
            until: day(subscription.periodEnd),
          })}
        </p>
      )
    default:
      return (
        <p className="border-b border-border-subtle py-2.5 text-sm font-semibold text-text-primary">
          {t('console.tenantDetail.period.renewsOn', { date: day(subscription.periodEnd) })}
        </p>
      )
  }
}

/**
 * An event's raw values, made readable: timestamps as days, methods and channels and plans through
 * their labels, amounts to three decimals. The keys are the store's — see `console.subscriptions.event`.
 */
function eventValues(
  event: SubscriptionEvent,
  t: (key: string) => string,
  day: (date: Date) => string,
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, raw] of Object.entries(event.values ?? {})) {
    if ((key === 'until' || key === 'at' || key === 'expires') && typeof raw === 'number')
      out[key] = day(new Date(raw))
    else if (key === 'method') out[key] = t(`console.subscriptions.method.${raw}`)
    else if (key === 'via') out[key] = t(`console.subscriptions.channel.${raw}`)
    else if (key === 'plan') out[key] = t(planLabelKey(raw as Subscription['plan']))
    else if (key === 'term') out[key] = t(`console.subscriptions.term.${raw}`).toLowerCase()
    else if (key === 'amount' && typeof raw === 'number') out[key] = omr(raw)
    else if (key === 'documents' && typeof raw === 'number') out[key] = count(raw)
    else out[key] = raw
  }
  return out
}
