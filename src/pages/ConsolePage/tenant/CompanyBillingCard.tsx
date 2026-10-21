import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Modal, OmAmount, withRial } from '../../../components/ui'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import {
  ConsoleStatusPill,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { CONSOLE_CARD, ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  BILLING_MANAGE,
  BILLING_READ,
  companySubscriptionPath,
  type PlatformSubscriptionDto,
} from '../../../lib/console/companySubscription'
import {
  PAY_LINK_CLOSE_REASONS,
  PAY_LINK_SETTINGS_PATH,
  companyBillsPath,
  describePayLinkFailure,
  isOpenBill,
  payLinksPath,
  raiseBill,
  revokePayLink,
  type CompanyBillsDto,
  type PayLinkDto,
  type PayLinkSettingsDto,
  type StartBillingDto,
  type SubscriptionBillDto,
} from '../../../lib/console/payLinks'
import type { TenantOverview } from '../../../lib/console/tenantOverview'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { formatDate, formatInstant } from '../../../lib/format'
import { hasPermission } from '../../../lib/identity/entitlements'
import { OperatorReasonDialog } from '../operators/OperatorReasonDialog'
import { CompanyRefundCases } from './CompanyRefundCases'
import { PayLinkModal } from './PayLinkModal'
import { StartBillingDialog } from './StartBillingDialog'

const K = 'console.payLinks.'

const BILL_TONE: Record<string, ConsolePillTone> = {
  OPEN: 'pending',
  PENDING_VERIFICATION: 'info',
  PAID: 'success',
  VOID: 'neutral',
}

const LINK_TONE: Record<string, ConsolePillTone> = {
  ACTIVE: 'success',
  USED: 'info',
  EXPIRED: 'neutral',
  REVOKED: 'danger',
  SUPERSEDED: 'neutral',
}

const known = (value: string, set: Record<string, unknown>) => (value in set ? value : 'OTHER')

/**
 * A real company's bills and payment links on the console's tenant page (P2-8 §3.12):
 *
 * - "Start billing" for a verified company with no lifecycle (Fawtir created it, or it is on
 *   Enterprise terms). The server refuses any other company with its own reason, worded here.
 * - The company's bills, newest first; "Raise bill" when nothing is open.
 * - For an open bill, "Send payment link", and its links with their status, opens and expiry;
 *   an active link can be revoked with a reason.
 *
 * Every action is hidden without `platform.billing.manage`; the card is hidden without
 * `platform.billing.read`.
 *
 * Gated on what the server reports, not only on permissions: the card is drawn only once
 * `GET /platform/billing/pay-link-settings` answers (a server without N8 answers 404, and the card
 * then stays away, so the tenant page is as it was). Every payment-link part (the title's "payment
 * links", sending a link, the link lists) needs `enabled` (`FAWTIR_BILLING_PAY_LINKS_ENABLED`) to be
 * true as well; a missing field reads as off. Start billing and the bills have no switch of their own.
 */
export function CompanyBillingCard({
  overview,
  onStarted,
}: {
  overview: TenantOverview
  /** The subscription changed: the cards that read it reload. */
  onStarted: () => void
}) {
  const { entitlements } = useEntitlements()
  const may = (permission: string) =>
    entitlements !== null && hasPermission(entitlements, permission)
  if (!may(BILLING_READ)) return null
  return <ServerGate overview={overview} canManage={may(BILLING_MANAGE)} onStarted={onStarted} />
}

/** Nothing at all, not even a loader, until the server says it has payment links. */
function ServerGate({
  overview,
  canManage,
  onStarted,
}: {
  overview: TenantOverview
  canManage: boolean
  onStarted: () => void
}) {
  const { read } = useConsoleRead<PayLinkSettingsDto>(PAY_LINK_SETTINGS_PATH)
  if (read.status !== 'ready') return null
  return (
    <BillingCard
      overview={overview}
      canManage={canManage}
      payLinks={read.data}
      onStarted={onStarted}
    />
  )
}

type Dialog =
  | { kind: 'start' }
  | { kind: 'raise' }
  | { kind: 'send'; billId?: string }
  | { kind: 'revoke'; link: PayLinkDto; billId: string }

function BillingCard({
  overview,
  canManage,
  payLinks,
  onStarted,
}: {
  overview: TenantOverview
  canManage: boolean
  payLinks: PayLinkSettingsDto
  onStarted: () => void
}) {
  const { t, i18n } = useTranslation()
  const tenantId = overview.identity.tenantId
  const subscription = useConsoleRead<PlatformSubscriptionDto>(companySubscriptionPath(tenantId))
  const bills = useConsoleRead<CompanyBillsDto>(companyBillsPath(tenantId))
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // Bumped after a link changes, so the open list reads it again.
  const [linksRead, setLinksRead] = useState(0)
  // Payment links are staff-only and switched at the server: anything but `true` is off.
  const linksOn = payLinks.enabled === true
  const title = t(linksOn ? `${K}title` : `${K}titleBills`)

  if (subscription.read.status === 'loading' || bills.read.status === 'loading') {
    return (
      <Card title={title}>
        <ConsoleNotice busy body={t(`${K}loading`)} />
      </Card>
    )
  }
  if (bills.read.status === 'failed') {
    return (
      <Card title={title}>
        <ConsoleReadFailure error={bills.read.error} retry={bills.retry} />
      </Card>
    )
  }
  const tracked =
    subscription.read.status === 'ready' ? subscription.read.data.status.tracked : true
  const items = bills.read.data.items.map((entry) => entry.bill)
  const open = items.filter(isOpenBill)
  const live = items.some(
    (entry) => entry.status === 'OPEN' || entry.status === 'PENDING_VERIFICATION',
  )
  const verified = overview.verification.status === 'VERIFIED'
  const day = (iso: string | null) => (iso ? formatDate(iso, i18n.language) : null)

  const close = () => setDialog(null)
  const finish = (message: string) => {
    setDone(message)
    setDialog(null)
  }

  return (
    <Card title={title}>
      {done ? (
        <p
          role="status"
          className="rounded-sm bg-success-100 px-4 py-3 text-sm font-medium leading-[1.6] text-success-700"
        >
          {withRial(done)}
        </p>
      ) : null}

      {!tracked ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-[1.6] text-text-secondary">
            {t(verified ? `${K}notBilled` : `${K}notBilledUnverified`)}
          </p>
          {canManage && verified ? (
            <div>
              <ConsoleButton onClick={() => setDialog({ kind: 'start' })}>
                {t(`${K}start.open`)}
              </ConsoleButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        tracked ? (
          <p className="text-sm leading-[1.6] text-text-secondary">{t(`${K}noBills`)}</p>
        ) : null
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((entry) => (
            <BillRow
              key={entry.id}
              bill={entry}
              canManage={canManage}
              linksOn={linksOn}
              linksRead={linksRead}
              onSend={() => setDialog({ kind: 'send', billId: entry.id })}
              onRevoke={(link) => setDialog({ kind: 'revoke', link, billId: entry.id })}
              day={day}
            />
          ))}
        </ul>
      )}

      {canManage && tracked && !live ? (
        <div>
          <ConsoleButton variant="secondary" onClick={() => setDialog({ kind: 'raise' })}>
            {t(`${K}raise.open`)}
          </ConsoleButton>
        </div>
      ) : null}

      <CompanyRefundCases tenantId={tenantId} canManage={canManage} onMessage={setDone} />

      {dialog?.kind === 'start' ? (
        <StartBillingDialog
          tenantId={tenantId}
          tenantCode={overview.identity.tenantCode}
          onClose={close}
          onDone={(answer: StartBillingDto) => {
            finish(
              t(`${K}start.done`, {
                number: answer.bill.number,
                total: `OMR ${answer.bill.total}`,
                date: day(answer.bill.dueOn) ?? '',
              }),
            )
            bills.retry()
            subscription.retry()
            onStarted()
          }}
        />
      ) : null}

      {dialog?.kind === 'raise' ? (
        <RaiseBillDialog
          tenantId={tenantId}
          onClose={close}
          onDone={(raised) => {
            finish(t(`${K}raise.done`, { number: raised.number, total: `OMR ${raised.total}` }))
            bills.retry()
          }}
        />
      ) : null}

      {dialog?.kind === 'send' ? (
        <PayLinkModal
          tenantName={overview.identity.tenantName}
          bills={open}
          billId={dialog.billId}
          contact={{
            name: overview.company.contactPersonName,
            email: overview.company.contactEmail,
            phone: overview.company.contactPhone,
          }}
          validityDays={payLinks.validityDays}
          quickLink={payLinks.paymobQuickLink === true}
          onClose={close}
          onDone={(created) => {
            const channel = created.link.channel
            finish(
              t(
                channel === 'EMAIL' && created.emailSent === false
                  ? `${K}send.emailNotSent`
                  : `${K}send.finished.${channel}`,
              ),
            )
            setLinksRead((n) => n + 1)
          }}
        />
      ) : null}

      {dialog?.kind === 'revoke' ? (
        <OperatorReasonDialog<PayLinkDto>
          formId="pay-link-revoke"
          title={t(`${K}revoke.title`)}
          body={t(`${K}revoke.body`, { hint: dialog.link.tokenHint })}
          confirmLabel={t(`${K}revoke.confirm`)}
          confirmingLabel={t(`${K}sending`)}
          send={(reason) => revokePayLink(dialog.link, reason)}
          describeFailure={describePayLinkFailure}
          onDone={() => {
            finish(t(`${K}revoke.done`, { hint: dialog.link.tokenHint }))
            setLinksRead((n) => n + 1)
          }}
          onClose={() => {
            close()
            // A refused revoke may mean the link changed meanwhile: read it again either way.
            setLinksRead((n) => n + 1)
          }}
        />
      ) : null}
    </Card>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby="company-billing"
      className="flex flex-col gap-4 rounded-sm bg-surface-card p-5"
    >
      <h2 id="company-billing" className="text-[17px] font-semibold text-text-primary">
        {title}
      </h2>
      {children}
    </section>
  )
}

function BillRow({
  bill,
  canManage,
  linksOn,
  linksRead,
  onSend,
  onRevoke,
  day,
}: {
  bill: SubscriptionBillDto
  canManage: boolean
  /** Payment links are switched on at the server. */
  linksOn: boolean
  linksRead: number
  onSend: () => void
  onRevoke: (link: PayLinkDto) => void
  day: (iso: string | null) => string | null
}) {
  const { t } = useTranslation()
  const [showLinks, setShowLinks] = useState(false)
  const status = known(bill.status, BILL_TONE)
  return (
    <li className={`${CONSOLE_CARD} flex flex-col gap-2 border border-border-subtle p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
          {t(`${K}bill.number`, { number: bill.number })}
          <ConsoleStatusPill
            tone={BILL_TONE[status] ?? 'neutral'}
            label={t(`${K}bill.status.${status}`)}
          />
        </span>
        <OmAmount amount={bill.total} amountClassName="text-sm font-semibold" />
      </div>
      <span className="text-xs font-medium text-text-tertiary">
        {[
          bill.planName,
          bill.periodStartsOn && bill.periodEndsOn
            ? t(`${K}bill.period`, { from: day(bill.periodStartsOn), to: day(bill.periodEndsOn) })
            : null,
          bill.dueOn ? t(`${K}bill.due`, { date: day(bill.dueOn) }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {linksOn ? (
        <div className="flex flex-wrap gap-2.5">
          {canManage && bill.status === 'OPEN' ? (
            <ConsoleButton variant="smallPrimary" onClick={onSend}>
              {t(`${K}send.open`)}
            </ConsoleButton>
          ) : null}
          <ConsoleButton
            variant="small"
            aria-expanded={showLinks}
            onClick={() => setShowLinks((v) => !v)}
          >
            {showLinks ? t(`${K}links.hide`) : t(`${K}links.show`)}
          </ConsoleButton>
        </div>
      ) : null}
      {linksOn && showLinks ? (
        // Remounted after a link changes, so the list is read again.
        <PayLinkList key={linksRead} billId={bill.id} canManage={canManage} onRevoke={onRevoke} />
      ) : null}
    </li>
  )
}

function PayLinkList({
  billId,
  canManage,
  onRevoke,
}: {
  billId: string
  canManage: boolean
  onRevoke: (link: PayLinkDto) => void
}) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<PayLinkDto[]>(payLinksPath(billId))
  if (read.status === 'loading') return <ConsoleNotice busy body={t(`${K}links.loading`)} />
  if (read.status === 'failed') return <ConsoleReadFailure error={read.error} retry={retry} />
  if (read.data.length === 0) {
    return <p className="text-sm leading-[1.6] text-text-secondary">{t(`${K}links.empty`)}</p>
  }
  const when = (iso: string) => formatInstant(iso, i18n.language)
  return (
    <ul className="flex flex-col gap-2">
      {read.data.map((link) => {
        const status = known(link.status, LINK_TONE)
        const channel =
          link.channel === 'EMAIL' || link.channel === 'WHATSAPP' || link.channel === 'COPIED'
            ? link.channel
            : 'OTHER'
        return (
          <li
            key={link.id}
            className="flex flex-col gap-1 rounded-sm bg-surface-background px-4 py-3"
          >
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
              <ConsoleStatusPill
                tone={LINK_TONE[status] ?? 'neutral'}
                label={t(`${K}links.status.${status}`)}
              />
              {t(`${K}links.channel.${channel}`)}
              <bdi dir="ltr" className="font-mono text-xs font-medium text-text-tertiary">
                …{link.tokenHint}
              </bdi>
            </span>
            <span className="text-xs font-medium text-text-tertiary">
              {[
                link.recipient ? (
                  <bdi key="r" dir="ltr">
                    {link.recipient}
                  </bdi>
                ) : null,
                t(`${K}links.madeAt`, { when: when(link.createdAt) }),
                link.channel === 'EMAIL'
                  ? link.sentAt
                    ? t(`${K}links.sent`, { when: when(link.sentAt) })
                    : t(`${K}links.notSent`)
                  : null,
              ]
                .filter(Boolean)
                .map((part, index) => (
                  <span key={index}>
                    {index > 0 ? ' · ' : null}
                    {part}
                  </span>
                ))}
            </span>
            <span className="text-xs font-medium text-text-quaternary">
              {[
                t(`${K}links.expires`, { when: when(link.expiresAt) }),
                link.firstOpenedAt
                  ? t(`${K}links.firstOpened`, { when: when(link.firstOpenedAt) })
                  : t(`${K}links.neverOpened`),
                t(`${K}links.opens`, { count: link.openCount }),
              ].join(' · ')}
            </span>
            {link.closeReason ? (
              <span className="text-xs font-medium text-text-tertiary">
                {(PAY_LINK_CLOSE_REASONS as readonly string[]).includes(link.closeReason)
                  ? t(`${K}links.closeReason.${link.closeReason}`)
                  : // An operator's own revocation reason, in their words.
                    t(`${K}links.revokedBecause`, { reason: link.closeReason })}
              </span>
            ) : null}
            {canManage && link.status === 'ACTIVE' ? (
              <div>
                <ConsoleButton variant="small" onClick={() => onRevoke(link)}>
                  {t(`${K}revoke.open`)}
                </ConsoleButton>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** Raises the company's next bill (`POST /platform/companies/{id}/bills`); one request per click. */
function RaiseBillDialog({
  tenantId,
  onClose,
  onDone,
}: {
  tenantId: string
  onClose: () => void
  onDone: (bill: SubscriptionBillDto) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<FormMessage | null>(null)
  const send = async () => {
    if (sending) return
    setSending(true)
    setFailure(null)
    try {
      onDone(await raiseBill(tenantId))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      setFailure(describePayLinkFailure(error))
    } finally {
      setSending(false)
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!sending) onClose()
      }}
      title={t(`${K}raise.title`)}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <ConsoleButton
            type="button"
            size="md"
            variant="secondary"
            disabled={sending}
            onClick={onClose}
          >
            {t('common.cancel')}
          </ConsoleButton>
          <ConsoleButton type="button" size="md" disabled={sending} onClick={() => void send()}>
            {sending ? t(`${K}sending`) : t(`${K}raise.confirm`)}
          </ConsoleButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(`${K}raise.body`)}
        </p>
        {failure ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(failure.key, failure.values)}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
