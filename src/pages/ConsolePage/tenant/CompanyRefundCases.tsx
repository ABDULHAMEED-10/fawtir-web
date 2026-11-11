import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { selectAllOnFocus } from '../../../components/invoice/numericInput'
import { DateField, Input, Modal, OmAmount, Select, withRial } from '../../../components/ui'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { CONSOLE_CARD, ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { containsCardNumber } from '../../../lib/cardNumbers'
import { describePayLinkFailure } from '../../../lib/console/payLinks'
import {
  REFUND_METHODS,
  REFUND_REASONS,
  adjustRefundAmount,
  companyRefundCasesPath,
  declinableHere,
  declineRefund,
  recordRefund,
  refundableHere,
  settlesHere,
  waivableHere,
  waiveRefund,
  type CompanyRefundCasesDto,
  type RefundCaseDto,
  type RefundMethod,
} from '../../../lib/console/refundCases'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { formatDate, formatInstantDay } from '../../../lib/format'
import { muscatToday } from '../../../lib/invoiceIssue'
import { OperatorReasonDialog } from '../operators/OperatorReasonDialog'
import { Field } from '../subscriptions/modalFields'

const K = 'console.refundCases.'
const AMOUNT = /^\d{1,9}(\.\d{1,3})?$/

const known = (value: string, set: readonly string[]) => (set.includes(value) ? value : 'OTHER')

export type RefundDialog = {
  kind: 'amount' | 'refund' | 'decline' | 'waive'
  refund: RefundCaseDto
}

/**
 * The company's refund cases, under its bills (backend V412, V423). Every open case can be marked
 * refunded: a Finance case (RF-2) at the amount received, a console case (CA-1, LV-6, RF-1: a company
 * that left Fawtir, or a customer's cancellation of a yearly subscription) after the super admin may
 * change its suggested amount. Only a yearly subscription's remaining months may instead be closed
 * without a refund; every other case is always refunded, unless the customer gave it up in writing (V427).
 * Draws nothing while the company has no case, or on a server that does not list them.
 */
export function CompanyRefundCases({
  tenantId,
  canManage,
  onMessage,
}: {
  tenantId: string
  canManage: boolean
  onMessage: (message: string) => void
}) {
  const { t } = useTranslation()
  const { read, retry } = useConsoleRead<CompanyRefundCasesDto>(companyRefundCasesPath(tenantId))
  const [dialog, setDialog] = useState<RefundDialog | null>(null)
  if (read.status !== 'ready') return null
  const cases = read.data.refundCases ?? []
  if (cases.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold text-text-primary">{t(`${K}title`)}</h3>
      <ul className="flex flex-col gap-3">
        {cases.map((entry) => (
          <RefundCaseItem key={entry.id} entry={entry} canManage={canManage} onAction={setDialog} />
        ))}
      </ul>
      <RefundCaseDialogs
        tenantId={tenantId}
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSettled={(message) => {
          setDialog(null)
          onMessage(message)
          retry()
        }}
        onRefused={retry}
      />
    </div>
  )
}

/** One case: what it is, its amount and state, how it was settled, and the acts still open on it. */
export function RefundCaseItem({
  entry,
  canManage,
  onAction,
  heading,
}: {
  entry: RefundCaseDto
  canManage: boolean
  onAction: (dialog: RefundDialog) => void
  /** Above the reason, such as the company on the cross-company queue. */
  heading?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  // openedAt and refundedAt are instants, shown as the day in Muscat; approvedOn and refundedOn are days.
  const instantDay = (iso: string | null | undefined) =>
    iso ? formatInstantDay(iso, i18n.language) : null
  const day = (date: string | null | undefined) => (date ? formatDate(date, i18n.language) : null)
  const reason = known(entry.reason, REFUND_REASONS)
  const refunded = entry.status === 'REFUNDED'
  const withdrawn = entry.status === 'WITHDRAWN'
  const declined = entry.status === 'DECLINED'
  const waived = entry.status === 'WAIVED'
  // A console case still waiting for the super admin reads as under review, as the customer sees it.
  const statusKey = refunded
    ? 'REFUNDED'
    : withdrawn
      ? 'WITHDRAWN'
      : declined
        ? 'DECLINED'
        : waived
          ? 'WAIVED'
          : settlesHere(entry)
            ? 'UNDER_REVIEW'
            : 'OPEN'
  const method = entry.refundMethod ? known(entry.refundMethod, REFUND_METHODS) : null
  return (
    <li className={`${CONSOLE_CARD} flex flex-col gap-3 p-5`}>
      {/* The company (on the cross-company queue) and the amount lead; the reason and its state
          under them; the facts next; the acts in a row of their own at the foot. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          {heading}
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-secondary">
            {t(`${K}reason.${reason}`)}
            <ConsoleStatusPill
              tone={refunded ? 'success' : withdrawn || declined || waived ? 'neutral' : 'pending'}
              label={t(`${K}status.${statusKey}`)}
            />
          </span>
        </div>
        <OmAmount amount={entry.amount} amountClassName="text-lg font-semibold tabular-nums" />
      </div>
      <span className="text-xs font-medium text-text-tertiary">
        {withRial(
          [
            t(`${K}opened`, { date: instantDay(entry.openedAt) }),
            entry.suggestedAmount != null && entry.monthsRefunded != null
              ? t(`${K}suggested`, {
                  amount: `OMR ${entry.suggestedAmount}`,
                  count: entry.monthsRefunded,
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
        )}
      </span>
      {entry.amountReason ? (
        <span className="text-xs font-medium text-text-tertiary">
          {t(`${K}changedBecause`, { reason: entry.amountReason })}
        </span>
      ) : null}
      {refunded && method ? (
        <span className="text-xs font-medium text-text-tertiary">
          {[
            entry.approvedOn ? t(`${K}approvedOn`, { date: day(entry.approvedOn) }) : null,
            t(`${K}refundedVia`, {
              method: t(`${K}method.${method}`),
              date: entry.refundedOn ? day(entry.refundedOn) : instantDay(entry.refundedAt),
            }),
            entry.refundReference ? (
              <bdi key="ref" dir="ltr">
                {entry.refundReference}
              </bdi>
            ) : null,
          ]
            .filter(Boolean)
            .map((part, index) => (
              <span key={index}>
                {index > 0 ? ' · ' : null}
                {part}
              </span>
            ))}
        </span>
      ) : null}
      {declined && entry.declineReason ? (
        <span className="text-xs font-medium text-text-tertiary">
          {t(`${K}declinedBecause`, { reason: entry.declineReason })}
        </span>
      ) : null}
      {waived && entry.waiveEvidence ? (
        <span className="text-xs font-medium text-text-tertiary">
          {t(`${K}waivedBecause`, { evidence: entry.waiveEvidence })}
          {entry.waiveReference ? (
            <>
              {' · '}
              <bdi dir="ltr">{entry.waiveReference}</bdi>
            </>
          ) : null}
        </span>
      ) : null}
      {canManage && refundableHere(entry) ? (
        <div className="mt-1 flex flex-wrap justify-end gap-2.5 border-t border-border-subtle pt-3">
          <ConsoleButton
            variant="smallPrimary"
            onClick={() => onAction({ kind: 'refund', refund: entry })}
          >
            {t(`${K}refund.open`)}
          </ConsoleButton>
          {settlesHere(entry) ? (
            <ConsoleButton
              variant="small"
              onClick={() => onAction({ kind: 'amount', refund: entry })}
            >
              {t(`${K}amount.open`)}
            </ConsoleButton>
          ) : null}
          {declinableHere(entry) ? (
            <ConsoleButton
              variant="small"
              onClick={() => onAction({ kind: 'decline', refund: entry })}
            >
              {t(`${K}decline.open`)}
            </ConsoleButton>
          ) : null}
          {waivableHere(entry) ? (
            <ConsoleButton
              variant="small"
              onClick={() => onAction({ kind: 'waive', refund: entry })}
            >
              {t(`${K}waive.open`)}
            </ConsoleButton>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/** The dialog an act opened, if any. `onRefused`: a refusal may mean another operator acted first. */
export function RefundCaseDialogs({
  tenantId,
  dialog,
  onClose,
  onSettled,
  onRefused,
}: {
  tenantId: string
  dialog: RefundDialog | null
  onClose: () => void
  onSettled: (message: string) => void
  onRefused: () => void
}) {
  const { t } = useTranslation()
  if (!dialog) return null
  if (dialog.kind === 'amount') {
    return (
      <AdjustAmountDialog
        tenantId={tenantId}
        refund={dialog.refund}
        onClose={onClose}
        onDone={(changed) => onSettled(t(`${K}amount.done`, { amount: `OMR ${changed.amount}` }))}
      />
    )
  }
  if (dialog.kind === 'decline') {
    return (
      <OperatorReasonDialog<RefundCaseDto>
        formId="refund-case-decline"
        title={t(`${K}decline.title`)}
        body={t(
          dialog.refund.reason === 'LEFT_FAWTIR_ANNUAL'
            ? `${K}decline.bodyLeft`
            : `${K}decline.body`,
        )}
        confirmLabel={t(`${K}decline.confirm`)}
        confirmingLabel={t(`${K}sending`)}
        send={(reason) => declineRefund(tenantId, dialog.refund.id, reason)}
        describeFailure={describePayLinkFailure}
        onDone={() => onSettled(t(`${K}decline.done`))}
        onClose={onClose}
      />
    )
  }
  if (dialog.kind === 'waive') {
    return (
      <WaiveRefundDialog
        tenantId={tenantId}
        refund={dialog.refund}
        onClose={() => {
          onClose()
          onRefused()
        }}
        onDone={() => onSettled(t(`${K}waive.done`))}
      />
    )
  }
  return (
    <RecordRefundDialog
      tenantId={tenantId}
      refund={dialog.refund}
      onClose={() => {
        onClose()
        onRefused()
      }}
      onDone={(done) =>
        onSettled(
          t(`${K}refund.done`, {
            amount: `OMR ${done.amount}`,
            method: t(`${K}method.${known(done.refundMethod ?? '', REFUND_METHODS)}`),
          }),
        )
      }
    />
  )
}

/** The amount with the reason the backend records in the audit log. */
function AdjustAmountDialog({
  tenantId,
  refund,
  onClose,
  onDone,
}: {
  tenantId: string
  refund: RefundCaseDto
  onClose: () => void
  onDone: (changed: RefundCaseDto) => void
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(refund.amount)
  const [amountError, setAmountError] = useState<string | undefined>()
  return (
    <OperatorReasonDialog<RefundCaseDto>
      formId="refund-case-amount"
      title={t(`${K}amount.title`)}
      body={t(`${K}amount.body`)}
      fields={
        <Input
          bordered
          name="amount"
          label={t(`${K}amount.label`)}
          requiredMark
          inputMode="decimal"
          autoComplete="off"
          onFocus={selectAllOnFocus}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value)
            setAmountError(undefined)
          }}
          error={amountError}
        />
      }
      validate={() => {
        const value = amount.trim()
        if (AMOUNT.test(value) && Number(value) > 0) return undefined
        setAmountError(t(`${K}amount.invalid`))
        return 'amount'
      }}
      confirmLabel={t(`${K}amount.confirm`)}
      confirmingLabel={t(`${K}sending`)}
      send={(reason) => adjustRefundAmount(tenantId, refund.id, Number(amount.trim()), reason)}
      describeFailure={describePayLinkFailure}
      onDone={onDone}
      onClose={onClose}
    />
  )
}

/** How the money went back, its reference and the day; one request per confirmation. */
function RecordRefundDialog({
  tenantId,
  refund,
  onClose,
  onDone,
}: {
  tenantId: string
  refund: RefundCaseDto
  onClose: () => void
  onDone: (done: RefundCaseDto) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [method, setMethod] = useState<RefundMethod | ''>('')
  const [reference, setReference] = useState('')
  const today = muscatToday()
  const [refundedOn, setRefundedOn] = useState(today)
  const [methodError, setMethodError] = useState<string | undefined>()
  const [dayError, setDayError] = useState<string | undefined>()
  const [referenceError, setReferenceError] = useState<string | undefined>()
  const opened = muscatToday(new Date(refund.openedAt))
  // Recording a console case approves it today: the money goes out today or later, never before (V427).
  // A Finance case was paid outside Fawtir: some day from when it opened up to today.
  const approving = settlesHere(refund)
  const earliest = approving ? today : opened
  const [failure, setFailure] = useState<FormMessage | null>(null)
  const [sending, setSending] = useState(false)
  const inFlight = useRef(false)
  const send = async () => {
    if (inFlight.current) return
    const dayWrong = !refundedOn || refundedOn < earliest || (!approving && refundedOn > today)
    if (dayWrong)
      setDayError(t(approving ? `${K}refund.onInvalidApproved` : `${K}refund.onInvalid`))
    if (!method) setMethodError(t('validation.required'))
    // SEC 86912a7fa refuses this with a codeless 400 validation error, which can only read as a
    // general failure; caught here, the field can say what is wrong. Card refunds only, as on the
    // server: a transfer reference can pass Luhn by chance.
    const referenceHoldsCard = method === 'CARD' && containsCardNumber(reference)
    if (referenceHoldsCard) setReferenceError(t(`${K}refund.referenceCardNumber`))
    if (!method || dayWrong || referenceHoldsCard) return
    inFlight.current = true
    setSending(true)
    setFailure(null)
    try {
      onDone(await recordRefund(tenantId, refund.id, method, reference.trim() || null, refundedOn))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      setFailure(describePayLinkFailure(error))
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!sending) onClose()
      }}
      title={t(`${K}refund.title`)}
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
            {sending ? t(`${K}sending`) : t(`${K}refund.confirm`)}
          </ConsoleButton>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(settlesHere(refund) ? `${K}refund.body` : `${K}refund.bodyFinance`)}
        </p>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-text-tertiary">{t(`${K}refund.amount`)}</span>
          <OmAmount amount={refund.amount} amountClassName="text-sm font-semibold" />
        </div>
        <Field name="method" label={t(`${K}refund.method`)} required error={methodError}>
          <Select
            value={method}
            ariaLabel={t(`${K}refund.method`)}
            placeholder={t(`${K}refund.methodPlaceholder`)}
            onChange={(value) => {
              setMethod(value as RefundMethod)
              setMethodError(undefined)
            }}
            options={REFUND_METHODS.map((value) => ({ value, label: t(`${K}method.${value}`) }))}
          />
        </Field>
        <Field name="refundedOn" label={t(`${K}refund.on`)} required error={dayError}>
          <DateField
            value={refundedOn}
            onChange={(value) => {
              setRefundedOn(value)
              setDayError(undefined)
            }}
            min={earliest}
            max={approving ? undefined : today}
            ariaLabel={t(`${K}refund.on`)}
          />
        </Field>
        <Input
          bordered
          name="reference"
          label={t(`${K}refund.reference`)}
          autoComplete="off"
          maxLength={200}
          value={reference}
          onChange={(event) => {
            setReference(event.target.value)
            setReferenceError(undefined)
          }}
          hint={t(`${K}refund.referenceHint`)}
          error={referenceError}
        />
        {failure ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(failure.key, failure.values)}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

/**
 * The customer gave up a refund that is always paid back (V427): their written words and where that
 * writing is kept, both required; one request per confirmation.
 */
function WaiveRefundDialog({
  tenantId,
  refund,
  onClose,
  onDone,
}: {
  tenantId: string
  refund: RefundCaseDto
  onClose: () => void
  onDone: (done: RefundCaseDto) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [evidence, setEvidence] = useState('')
  const [reference, setReference] = useState('')
  const [evidenceError, setEvidenceError] = useState<string | undefined>()
  const [referenceError, setReferenceError] = useState<string | undefined>()
  const [failure, setFailure] = useState<FormMessage | null>(null)
  const [sending, setSending] = useState(false)
  const inFlight = useRef(false)
  const send = async () => {
    if (inFlight.current) return
    const noEvidence = !evidence.trim()
    const noReference = !reference.trim()
    if (noEvidence) setEvidenceError(t('validation.required'))
    if (noReference) setReferenceError(t('validation.required'))
    if (noEvidence || noReference) return
    inFlight.current = true
    setSending(true)
    setFailure(null)
    try {
      onDone(await waiveRefund(tenantId, refund.id, evidence.trim(), reference.trim()))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      setFailure(describePayLinkFailure(error))
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!sending) onClose()
      }}
      title={t(`${K}waive.title`)}
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
            {sending ? t(`${K}sending`) : t(`${K}waive.confirm`)}
          </ConsoleButton>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(`${K}waive.body`)}
        </p>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-text-tertiary">{t(`${K}refund.amount`)}</span>
          <OmAmount amount={refund.amount} amountClassName="text-sm font-semibold" />
        </div>
        <Input
          bordered
          name="evidence"
          label={t(`${K}waive.evidence`)}
          requiredMark
          autoComplete="off"
          maxLength={1000}
          value={evidence}
          onChange={(event) => {
            setEvidence(event.target.value)
            setEvidenceError(undefined)
          }}
          hint={t(`${K}waive.evidenceHint`)}
          error={evidenceError}
        />
        <Input
          bordered
          name="waiveReference"
          label={t(`${K}waive.reference`)}
          requiredMark
          autoComplete="off"
          maxLength={200}
          value={reference}
          onChange={(event) => {
            setReference(event.target.value)
            setReferenceError(undefined)
          }}
          hint={t(`${K}waive.referenceHint`)}
          error={referenceError}
        />
        {failure ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(failure.key, failure.values)}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
