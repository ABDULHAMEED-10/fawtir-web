import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  AGREEMENTS_PATH,
  AGREEMENT_REFERENCE_MAX,
  WITHDRAWAL_REASON_MAX,
  activateAgreement,
  loadAgreements,
  openAgreement,
  suspendAgreement,
  withdrawAgreement,
  type AgreementDto,
} from '../../api/selfBilling/agreements'
import { customerListPath, loadCustomerPage, type CustomerDto } from '../../api/customers/customers'
import type { Page } from '../../api'
import {
  AGREEMENT_TABS,
  STATUS_CHIP,
  agreementProblem,
  allowedActions,
  blockerOf,
  canIssueUnder,
  lapsed,
  matchesTab,
  rangeProblem,
  sortedForDisplay,
  waitingOn,
  type AgreementTabId,
} from '../../lib/selfBillingAgreements'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatCount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import backIcon from '../../assets/invoices/chevron.svg'

const CHIP: Record<'ok' | 'waiting' | 'stopped', string> = {
  ok: 'bg-success-100 text-success-700',
  waiting: 'bg-pending-100 text-pending-700',
  stopped: 'bg-surface-background text-text-tertiary',
}

const FIELD =
  'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Income › Self-billing › Agreements (I-12).
 *
 * The prior authorisation SRS Ch6 Scenario 7 requires before this tenant may write an invoice on a
 * seller's behalf. **The tenant is the buyer here**, so every "seller" below is the counterparty —
 * the party who would normally have invoiced us.
 *
 * **The agreement gates issuing, not drafting.** A draft against a seller with no agreement is
 * created happily and then refused at issue. This screen is the only place that authority is
 * visible, which is why it says plainly, per row, whether issuing would work and who has to act if
 * it would not.
 *
 * **Two different waits.** `PENDING_ACTIVATION` is the tenant's to clear; `UNVERIFIED` only Fawtir
 * can, because `platform.selfbilling.counterparty.verify` is platform-reserved and no tenant can
 * ever hold it (Zain, 2026-08-27: Fawtir verifies the claimed identity rather than accepting the
 * tenant's claim). Verification is therefore shown as a state, never as a button.
 *
 * **What the prototype drew and the API cannot feed** is gone rather than faked: coverage chips, an
 * agreement "kind", per-agreement document counts and values, Peppol reachability, an agreement
 * PDF, and "expiring soon" notifications. Nothing links an invoice to an agreement id, and there is
 * no `EXPIRED` status — a lapsed `effectiveTo` is derived here and labelled, since the server will
 * never say it.
 */
export function AgreementsPage() {
  return (
    <AppShell>
      <Agreements />
    </AppShell>
  )
}

function Agreements() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  // Needed to READ as well as write — the list route carries it too.
  const canManage = can(session, 'selfbilling.agreement.manage')
  const [params, setParams] = useSearchParams()

  const tab = (AGREEMENT_TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as AgreementTabId)
    : 'all'

  const read = useApiRead<AgreementDto[]>(canManage ? AGREEMENTS_PATH : null, loadAgreements)
  const agreements = read.read.status === 'ready' ? read.read.data : null

  // The agreement carries a seller id and no name, so the names are joined here. One page of
  // customers covers the realistic case; an id with no match still renders, as its id.
  const customersPath = customerListPath({ type: null, status: 'ACTIVE', search: '', page: 0, pageSize: 200 })
  const customers = useApiRead<Page<CustomerDto>>(canManage ? customersPath : null, () => loadCustomerPage(customersPath))
  const nameOf = useMemo(() => {
    const byId = new Map<string, string>()
    if (customers.read.status === 'ready') {
      for (const customer of customers.read.data.items) byId.set(customer.id, customer.displayName)
    }
    return (id: string) => byId.get(id) ?? null
  }, [customers.read])

  const today = new Date().toISOString().slice(0, 10)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [withdrawing, setWithdrawing] = useState<AgreementDto | null>(null)

  const onFailure = (error: unknown) => {
    setNotice(null)
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
  }

  const run = async (id: string, call: () => Promise<unknown>, doneKey: string) => {
    setBusy(id)
    setFailure(null)
    try {
      await call()
      setNotice(t(doneKey))
      read.retry()
    } catch (error) {
      onFailure(error)
    } finally {
      setBusy(null)
    }
  }

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-[1144px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  const rows = agreements ? sortedForDisplay(agreements).filter((row) => matchesTab(row, tab, today)) : []
  const issuable = agreements ? agreements.filter((row) => canIssueUnder(row, today)).length : 0
  const waitingOnUs = agreements ? agreements.filter((row) => waitingOn(row, today) === 'fawtir').length : 0
  const lapsedCount = agreements ? agreements.filter((row) => lapsed(row, today) && row.status !== 'WITHDRAWN').length : 0

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/income/self-billing"
              className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('agreements.breadcrumbSelfBilled')}
              <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
            </Link>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('agreements.title')}</h1>
          </div>
          <p className="mt-1 max-w-[620px] text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('agreements.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpening(true)}
          className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
        >
          {t('agreements.open')}
        </button>
      </div>

      {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}
      {failure ? (
        <Notice
          badge={t('agreements.notDone')}
          body={failure}
          action={{ label: t('common.close'), onClick: () => setFailure(null) }}
        />
      ) : null}

      {read.read.status === 'loading' ? <LoadingNotice /> : null}
      {read.read.status === 'failed' ? <ApiReadFailure error={read.read.error} retry={read.retry} /> : null}

      {agreements ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Figure
              label={t('agreements.kpi.issuable')}
              value={formatCount(issuable, language)}
              note={t('agreements.kpi.issuableNote')}
            />
            <Figure
              label={t('agreements.kpi.awaitingFawtir')}
              value={formatCount(waitingOnUs, language)}
              note={t('agreements.kpi.awaitingFawtirNote')}
            />
            <Figure
              label={t('agreements.kpi.lapsed')}
              value={formatCount(lapsedCount, language)}
              note={t('agreements.kpi.lapsedNote')}
            />
          </div>

          <section className="rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
              {AGREEMENT_TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={id === tab}
                  onClick={() =>
                    setParams(
                      (current) => {
                        const next = new URLSearchParams(current)
                        if (id === 'all') next.delete('tab')
                        else next.set('tab', id)
                        return next
                      },
                      { replace: true },
                    )
                  }
                  className={[
                    'h-[48px] px-4 text-sm font-semibold transition-colors',
                    id === tab
                      ? 'border-b-2 border-primary-700 text-primary-800'
                      : 'border-b-2 border-transparent text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(`agreements.tab.${id}`)}
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="p-10 text-center text-sm font-medium text-text-quaternary">{t('agreements.empty')}</p>
            ) : (
              <ul className="divide-y divide-surface-background">
                {rows.map((row) => {
                  const blocker = blockerOf(row, today)
                  const actions = allowedActions(row.status)
                  const working = busy === row.id
                  return (
                    <li key={row.id} className="flex flex-wrap items-start justify-between gap-4 p-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-text-primary">
                            {nameOf(row.customerId) ?? t('agreements.unknownSeller')}
                          </span>
                          <span
                            className={[
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                              CHIP[STATUS_CHIP[row.status]],
                            ].join(' ')}
                          >
                            {t(`agreements.status.${row.status}`)}
                          </span>
                          {lapsed(row, today) && row.status !== 'WITHDRAWN' ? (
                            <span className="inline-flex items-center rounded-full bg-danger-100 px-2.5 py-0.5 text-xs font-semibold text-danger-700">
                              {t('agreements.lapsed')}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1 text-sm font-medium text-text-quaternary">
                          {t('agreements.reference', { reference: row.agreementReference })} ·{' '}
                          {row.effectiveTo === null
                            ? t('agreements.fromOpenEnded', { from: formatDate(row.effectiveFrom, language) })
                            : t('agreements.fromTo', {
                                from: formatDate(row.effectiveFrom, language),
                                to: formatDate(row.effectiveTo, language),
                              })}
                        </p>

                        {/* The whole point of the row: can we issue, and if not whose move is it. */}
                        <p
                          className={[
                            'mt-2 text-sm font-medium leading-[1.5]',
                            blocker === null ? 'text-success-700' : 'text-text-secondary',
                          ].join(' ')}
                        >
                          {blocker === null
                            ? t('agreements.canIssue')
                            : t(`agreements.blocked.${blocker}`, {
                                from: formatDate(row.effectiveFrom, language),
                                to: row.effectiveTo ? formatDate(row.effectiveTo, language) : '',
                              })}
                        </p>

                        {row.verifiedParticipant ? (
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {t('agreements.verifiedAs', { participant: row.verifiedParticipant })}
                          </p>
                        ) : null}
                        {row.withdrawalReason ? (
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {t('agreements.withdrawnBecause', { reason: row.withdrawalReason })}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {actions.activate ? (
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => run(row.id, () => activateAgreement(row.id), 'agreements.done.activated')}
                            className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:text-text-tertiary"
                          >
                            {t('agreements.action.activate')}
                          </button>
                        ) : null}
                        {actions.suspend ? (
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => run(row.id, () => suspendAgreement(row.id), 'agreements.done.suspended')}
                            className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:text-text-tertiary"
                          >
                            {t('agreements.action.suspend')}
                          </button>
                        ) : null}
                        {actions.withdraw ? (
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => setWithdrawing(row)}
                            className="inline-flex h-[38px] items-center rounded-sm border border-danger-700/30 bg-white px-3 text-sm font-semibold text-danger-700 hover:bg-danger-100 disabled:text-text-tertiary"
                          >
                            {t('agreements.action.withdraw')}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <p className="text-xs font-medium leading-[1.5] text-text-quaternary">{t('agreements.footnote')}</p>
        </>
      ) : null}

      {opening ? (
        <OpenAgreementDialog
          customers={customers.read.status === 'ready' ? customers.read.data.items : []}
          onCancel={() => setOpening(false)}
          onDone={() => {
            setOpening(false)
            setNotice(t('agreements.done.opened'))
            read.retry()
          }}
          onFailure={onFailure}
        />
      ) : null}

      {withdrawing ? (
        <WithdrawDialog
          agreement={withdrawing}
          sellerName={nameOf(withdrawing.customerId)}
          onCancel={() => setWithdrawing(null)}
          onDone={() => {
            setWithdrawing(null)
            setNotice(t('agreements.done.withdrawn'))
            read.retry()
          }}
          onFailure={onFailure}
        />
      ) : null}
    </div>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-md bg-surface-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-quaternary">{label}</p>
      <p className="mt-2 text-[28px] font-medium leading-[1.2] text-text-primary">{value}</p>
      <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </div>
  )
}

/**
 * Opening one.
 *
 * The reference and the dates cannot be edited afterwards — there is no PUT or PATCH — so the
 * dialog says so before it writes rather than leaving it to be discovered.
 */
function OpenAgreementDialog({
  customers,
  onCancel,
  onDone,
  onFailure,
}: {
  customers: CustomerDto[]
  onCancel: () => void
  onDone: () => void
  onFailure: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const [customerId, setCustomerId] = useState('')
  const [reference, setReference] = useState('')
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10))
  const [to, setTo] = useState('')
  const [saving, setSaving] = useState(false)

  const referenceProblem = agreementProblem(reference)
  const datesProblem = rangeProblem(from, to)
  const ready = customerId !== '' && referenceProblem === null && datesProblem === null

  const submit = async () => {
    if (!ready) return
    setSaving(true)
    try {
      await openAgreement({
        customerId,
        agreementReference: reference.trim(),
        effectiveFrom: from,
        effectiveTo: to.trim() === '' ? null : to,
      })
      onDone()
    } catch (error) {
      onFailure(error)
      onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title={t('agreements.openDialog.title')} onCancel={onCancel}>
      <p className="text-sm font-medium leading-[1.5] text-text-quaternary">{t('agreements.openDialog.note')}</p>

      <label className="mt-4 block">
        <span className="text-xs font-semibold text-text-quaternary">{t('agreements.openDialog.seller')}</span>
        <select
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          aria-label={t('agreements.openDialog.seller')}
          className={`${FIELD} mt-1`}
        >
          <option value="">{t('agreements.openDialog.chooseSeller')}</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-quaternary">{t('agreements.openDialog.reference')}</span>
        <input
          type="text"
          maxLength={AGREEMENT_REFERENCE_MAX}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          aria-label={t('agreements.openDialog.reference')}
          className={`${FIELD} mt-1`}
        />
      </label>
      {referenceProblem && reference !== '' ? (
        <p className="mt-1 text-sm font-medium text-danger-700">{t(`agreements.problem.${referenceProblem}`)}</p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-text-quaternary">{t('agreements.openDialog.from')}</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            aria-label={t('agreements.openDialog.from')}
            className={`${FIELD} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-quaternary">{t('agreements.openDialog.to')}</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-label={t('agreements.openDialog.to')}
            className={`${FIELD} mt-1`}
          />
        </label>
      </div>
      <p className="mt-1 text-xs font-medium text-text-quaternary">{t('agreements.openDialog.openEnded')}</p>
      {datesProblem ? (
        <p className="mt-1 text-sm font-medium text-danger-700">{t(`agreements.problem.${datesProblem}`)}</p>
      ) : null}

      {/* Said before the write, because nothing afterwards can change it. */}
      <p className="mt-3 rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
        {t('agreements.openDialog.fixed')}
      </p>

      <DialogActions
        confirmLabel={saving ? t('agreements.openDialog.opening') : t('agreements.openDialog.confirm')}
        confirmDisabled={!ready || saving}
        onConfirm={submit}
        onCancel={onCancel}
      />
    </Dialog>
  )
}

/** Withdrawing is terminal, and the dialog is where that is said. */
function WithdrawDialog({
  agreement,
  sellerName,
  onCancel,
  onDone,
  onFailure,
}: {
  agreement: AgreementDto
  sellerName: string | null
  onCancel: () => void
  onDone: () => void
  onFailure: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      await withdrawAgreement(agreement.id, reason)
      onDone()
    } catch (error) {
      onFailure(error)
      onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title={t('agreements.withdrawDialog.title')} onCancel={onCancel}>
      <p className="text-sm font-medium leading-[1.5] text-text-secondary">
        {t('agreements.withdrawDialog.body', {
          seller: sellerName ?? t('agreements.unknownSeller'),
          reference: agreement.agreementReference,
        })}
      </p>
      <p className="mt-2 rounded-md bg-danger-100 p-3 text-sm font-medium text-danger-700">
        {t('agreements.withdrawDialog.terminal')}
      </p>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-quaternary">{t('agreements.withdrawDialog.reason')}</span>
        <input
          type="text"
          maxLength={WITHDRAWAL_REASON_MAX}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-label={t('agreements.withdrawDialog.reason')}
          className={`${FIELD} mt-1`}
        />
      </label>

      <DialogActions
        confirmLabel={saving ? t('agreements.withdrawDialog.withdrawing') : t('agreements.withdrawDialog.confirm')}
        confirmDisabled={saving}
        danger
        onConfirm={submit}
        onCancel={onCancel}
      />
    </Dialog>
  )
}

function Dialog({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div role="dialog" aria-label={title} className="max-h-full w-full max-w-[520px] overflow-auto rounded-md bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-medium leading-[1.2] text-text-primary">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-text-quaternary hover:text-text-secondary">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function DialogActions({
  confirmLabel,
  confirmDisabled,
  danger = false,
  onConfirm,
  onCancel,
}: {
  confirmLabel: string
  confirmDisabled: boolean
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mt-5 flex items-center justify-end gap-3">
      <button type="button" onClick={onCancel} className="text-sm font-semibold text-text-quaternary hover:text-text-secondary">
        {t('common.cancel')}
      </button>
      <button
        type="button"
        disabled={confirmDisabled}
        onClick={onConfirm}
        className={[
          'inline-flex h-[46px] items-center rounded-sm px-5 text-sm font-semibold text-white transition-colors disabled:bg-[#d0d2d5]',
          danger ? 'bg-danger-700 hover:bg-danger-800' : 'bg-primary-700 hover:bg-primary-800',
        ].join(' ')}
      >
        {confirmLabel}
      </button>
    </div>
  )
}
