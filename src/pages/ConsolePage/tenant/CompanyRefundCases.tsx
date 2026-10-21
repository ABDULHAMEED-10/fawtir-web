import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { selectAllOnFocus } from '../../../components/invoice/numericInput'
import { Input, Modal, OmAmount, Select, withRial } from '../../../components/ui'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { CONSOLE_CARD, ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { describePayLinkFailure } from '../../../lib/console/payLinks'
import {
  REFUND_METHODS,
  REFUND_REASONS,
  adjustRefundAmount,
  companyRefundCasesPath,
  declinableHere,
  declineRefund,
  recordRefund,
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
import { formatInstantDay } from '../../../lib/format'
import { OperatorReasonDialog } from '../operators/OperatorReasonDialog'
import { Field } from '../subscriptions/modalFields'

const K = 'console.refundCases.'
const AMOUNT = /^\d{1,9}(\.\d{1,3})?$/

const known = (value: string, set: readonly string[]) => (set.includes(value) ? value : 'OTHER')

type Dialog = {
  kind: 'amount' | 'refund' | 'decline' | 'waive'
  refund: RefundCaseDto
}

/**
 * The company's refund cases, under its bills (backend V412). Read-only except the ones the Business
 * Rules leave to the super admin (CA-1, LV-6, RF-1): a company that left Fawtir (yearly, or monthly with
 * a period paid ahead) and a customer's cancellation of a yearly subscription. For those: the suggested
 * amount, a change to it with a reason, and how the money went back. Only a yearly subscription's remaining
 * months may be closed without a refund; a monthly period paid ahead is always refunded, unless the
 * customer gave it up in writing (V427). Draws nothing while the company has no case, or on a server that
 * does not list them.
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
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<CompanyRefundCasesDto>(companyRefundCasesPath(tenantId))
  const [dialog, setDialog] = useState<Dialog | null>(null)
  if (read.status !== 'ready') return null
  const cases = read.data.refundCases ?? []
  if (cases.length === 0) return null
  // openedAt and refundedAt are instants: shown as the day in Muscat, never as a raw timestamp.
  const day = (iso: string | null | undefined) =>
    iso ? formatInstantDay(iso, i18n.language) : null
  const finish = (message: string) => {
    setDialog(null)
    onMessage(message)
    retry()
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold text-text-primary">{t(`${K}title`)}</h3>
      <ul className="flex flex-col gap-3">
        {cases.map((entry) => {
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
            <li
              key={entry.id}
              className={`${CONSOLE_CARD} flex flex-col gap-2 border border-border-subtle p-4`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                  {t(`${K}reason.${reason}`)}
                  <ConsoleStatusPill
                    tone={
                      refunded ? 'success' : withdrawn || declined || waived ? 'neutral' : 'pending'
                    }
                    label={t(`${K}status.${statusKey}`)}
                  />
                </span>
                <OmAmount amount={entry.amount} amountClassName="text-sm font-semibold" />
              </div>
              <span className="text-xs font-medium text-text-tertiary">
                {withRial(
                  [
                    t(`${K}opened`, { date: day(entry.openedAt) }),
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
                    t(`${K}refundedVia`, {
                      method: t(`${K}method.${method}`),
                      date: day(entry.refundedAt),
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
              {canManage && settlesHere(entry) ? (
                <div className="flex flex-wrap gap-2.5">
                  <ConsoleButton
                    variant="smallPrimary"
                    onClick={() => setDialog({ kind: 'refund', refund: entry })}
                  >
                    {t(`${K}refund.open`)}
                  </ConsoleButton>
                  <ConsoleButton
                    variant="small"
                    onClick={() => setDialog({ kind: 'amount', refund: entry })}
                  >
                    {t(`${K}amount.open`)}
                  </ConsoleButton>
                  {declinableHere(entry) ? (
                    <ConsoleButton
                      variant="small"
                      onClick={() => setDialog({ kind: 'decline', refund: entry })}
                    >
                      {t(`${K}decline.open`)}
                    </ConsoleButton>
                  ) : null}
                  {waivableHere(entry) ? (
                    <ConsoleButton
                      variant="small"
                      onClick={() => setDialog({ kind: 'waive', refund: entry })}
                    >
                      {t(`${K}waive.open`)}
                    </ConsoleButton>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {dialog?.kind === 'amount' ? (
        <AdjustAmountDialog
          tenantId={tenantId}
          refund={dialog.refund}
          onClose={() => setDialog(null)}
          onDone={(changed) => finish(t(`${K}amount.done`, { amount: `OMR ${changed.amount}` }))}
        />
      ) : null}
      {dialog?.kind === 'decline' ? (
        <OperatorReasonDialog<RefundCaseDto>
          formId="refund-case-decline"
          title={t(`${K}decline.title`)}
          body={t(`${K}decline.body`)}
          confirmLabel={t(`${K}decline.confirm`)}
          confirmingLabel={t(`${K}sending`)}
          send={(reason) => declineRefund(tenantId, dialog.refund.id, reason)}
          describeFailure={describePayLinkFailure}
          onDone={() => finish(t(`${K}decline.done`))}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'waive' ? (
        <WaiveRefundDialog
          tenantId={tenantId}
          refund={dialog.refund}
          onClose={() => {
            setDialog(null)
            retry()
          }}
          onDone={() => finish(t(`${K}waive.done`))}
        />
      ) : null}
      {dialog?.kind === 'refund' ? (
        <RecordRefundDialog
          tenantId={tenantId}
          refund={dialog.refund}
          onClose={() => {
            setDialog(null)
            // A refused change may mean another operator settled it meanwhile: read it again.
            retry()
          }}
          onDone={(done) =>
            finish(
              t(`${K}refund.done`, {
                amount: `OMR ${done.amount}`,
                method: t(`${K}method.${known(done.refundMethod ?? '', REFUND_METHODS)}`),
              }),
            )
          }
        />
      ) : null}
    </div>
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

/** How the money went back, and its reference; one request per confirmation. */
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
  const [methodError, setMethodError] = useState<string | undefined>()
  const [failure, setFailure] = useState<FormMessage | null>(null)
  const [sending, setSending] = useState(false)
  const inFlight = useRef(false)
  const send = async () => {
    if (inFlight.current) return
    if (!method) {
      setMethodError(t('validation.required'))
      return
    }
    inFlight.current = true
    setSending(true)
    setFailure(null)
    try {
      onDone(await recordRefund(tenantId, refund.id, method, reference.trim() || null))
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
          {t(`${K}refund.body`)}
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
            options={REFUND_METHODS.map((value) => ({
              value,
              label: t(`${K}method.${value}`),
            }))}
          />
        </Field>
        <Input
          bordered
          name="reference"
          label={t(`${K}refund.reference`)}
          autoComplete="off"
          maxLength={200}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          hint={t(`${K}refund.referenceHint`)}
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
