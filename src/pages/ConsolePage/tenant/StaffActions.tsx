import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input, Modal, Select } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { CONSOLE_CARD, ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CANCELLATION_TEXT_MAX,
  confirmFawtirCancellation,
  describeStaffActionFailure,
  plansAbove,
  proposeFawtirCancellation,
  upgradeCompanyPlan,
  withdrawFawtirCancellation,
  type FawtirCancellationCategory,
  type FawtirCancellationDto,
} from '../../../lib/console/companySubscription'
import { PLANS_PATH, type CatalogueAdminPlan } from '../../../lib/console/planCatalogue'
import { formatDate, formatInstant } from '../../../lib/format'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { OperatorReasonDialog } from '../operators/OperatorReasonDialog'
import { Field } from '../subscriptions/modalFields'

const K = 'console.companySubscription.'

/** Upgrade at no charge: a published plan above the current one and a required reason (PC-5). */
export function UpgradeDialog({
  tenantId,
  currentPlan,
  onDone,
  onClose,
}: {
  tenantId: string
  currentPlan: string
  onDone: () => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<CatalogueAdminPlan[]>(PLANS_PATH)
  const [planCode, setPlanCode] = useState('')
  const [planError, setPlanError] = useState<string | undefined>()
  const arabic = i18n.language.startsWith('ar')

  if (read.status !== 'ready') {
    return (
      <Modal open onClose={onClose} title={t(`${K}upgrade.title`)}>
        {read.status === 'loading' ? (
          <ConsoleNotice busy body={t(`${K}upgrade.loadingPlans`)} />
        ) : (
          <ConsoleReadFailure error={read.error} retry={retry} />
        )}
      </Modal>
    )
  }
  const choices = plansAbove(read.data, currentPlan)
  return (
    <OperatorReasonDialog<unknown>
      formId="company-plan-upgrade"
      title={t(`${K}upgrade.title`)}
      body={t(`${K}upgrade.body`)}
      blockedNote={choices.length === 0 ? t(`${K}upgrade.none`) : undefined}
      fields={
        choices.length === 0 ? null : (
          <Field name="planCode" label={t(`${K}upgrade.plan`)} error={planError}>
            <Select
              value={planCode}
              ariaLabel={t(`${K}upgrade.plan`)}
              placeholder={t(`${K}upgrade.planRequired`)}
              ariaInvalid={Boolean(planError)}
              onChange={(value) => {
                setPlanCode(value)
                setPlanError(undefined)
              }}
              options={choices.map((plan) => ({
                value: plan.code,
                label: arabic && plan.nameAr ? plan.nameAr : plan.nameEn,
              }))}
            />
          </Field>
        )
      }
      validate={() => {
        if (planCode) return undefined
        setPlanError(t(`${K}upgrade.planRequired`))
        return 'planCode'
      }}
      confirmLabel={t(`${K}upgrade.confirm`)}
      confirmingLabel={t(`${K}sending`)}
      send={(reason) => upgradeCompanyPlan(tenantId, planCode, reason)}
      describeFailure={describeStaffActionFailure}
      onDone={onDone}
      onClose={onClose}
    />
  )
}

/** Propose cancelling at once: grounds, the message to the customer, the typed company code, and the internal reason. */
export function ProposeCancellationDialog({
  tenantId,
  tenantCode,
  restrictionsEnforced,
  onDone,
  onClose,
}: {
  tenantId: string
  tenantCode: string
  restrictionsEnforced: boolean
  onDone: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<FawtirCancellationCategory>('ABUSE')
  const [message, setMessage] = useState('')
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<{ message?: string; code?: string }>({})
  return (
    <OperatorReasonDialog<FawtirCancellationDto>
      formId="company-fawtir-cancellation"
      title={t(`${K}cancel.title`)}
      body={[t(`${K}cancel.body`), restrictionsEnforced ? null : t(`${K}cancel.restrictionsOff`)]
        .filter(Boolean)
        .join(' ')}
      fields={
        <>
          <Field name="category" label={t(`${K}cancel.category`)}>
            <Select
              value={category}
              ariaLabel={t(`${K}cancel.category`)}
              onChange={(value) => setCategory(value as FawtirCancellationCategory)}
              options={(['ABUSE', 'FRAUD'] as const).map((value) => ({
                value,
                label: t(`${K}cancel.categories.${value}`),
              }))}
            />
          </Field>
          <Input
            bordered
            name="customerMessage"
            label={t(`${K}cancel.message`)}
            requiredMark
            autoComplete="off"
            maxLength={CANCELLATION_TEXT_MAX}
            hint={t(`${K}cancel.messageHint`, { max: CANCELLATION_TEXT_MAX })}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value)
              setErrors((current) => ({ ...current, message: undefined }))
            }}
            error={errors.message}
          />
          <Input
            bordered
            name="confirmTenantCode"
            label={t(`${K}cancel.code`, { code: tenantCode })}
            requiredMark
            autoComplete="off"
            dir="ltr"
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              setErrors((current) => ({ ...current, code: undefined }))
            }}
            error={errors.code}
          />
        </>
      }
      validate={() => {
        if (!message.trim()) {
          setErrors({ message: t(`${K}cancel.messageRequired`) })
          return 'customerMessage'
        }
        if (code.trim().toUpperCase() !== tenantCode.trim().toUpperCase()) {
          setErrors({ code: t(`${K}cancel.codeMismatch`) })
          return 'confirmTenantCode'
        }
        return undefined
      }}
      confirmLabel={t(`${K}cancel.confirm`)}
      confirmingLabel={t(`${K}sending`)}
      send={(reason) =>
        proposeFawtirCancellation(tenantId, category, reason, message.trim(), code.trim())
      }
      describeFailure={describeStaffActionFailure}
      onDone={onDone}
      onClose={onClose}
    />
  )
}

/**
 * The open proposal or the cancellation in force, with who did what. The proposer sees "waiting
 * for a second operator" and Withdraw; another operator with the permission sees Confirm too.
 */
export function FawtirCancellationBlock({
  tenantId,
  cancellation,
  me,
  canManage,
  onChanged,
}: {
  tenantId: string
  cancellation: FawtirCancellationDto
  me: string | null
  canManage: boolean
  onChanged: () => void
}) {
  const { t, i18n } = useTranslation()
  const [dialog, setDialog] = useState<'confirm' | 'withdraw' | null>(null)
  const who = (name: string | null) => name ?? t(`${K}cancel.someone`)
  const day = (iso: string) => formatDate(iso, i18n.language)
  const proposed = cancellation.status === 'PROPOSED'
  const mine = me !== null && me === cancellation.proposedBy
  const close = (changed: boolean) => {
    setDialog(null)
    if (changed) onChanged()
  }

  return (
    <div
      className={`${CONSOLE_CARD} flex flex-col gap-2 border p-4 ${
        proposed ? 'border-pending-700' : 'border-danger-700'
      }`}
    >
      <span className="text-sm font-semibold text-text-primary">
        {t(proposed ? `${K}cancel.proposedTitle` : `${K}cancel.cancelledTitle`)}
        {' · '}
        {t(`${K}cancel.categories.${cancellation.category}`)}
      </span>
      <span className="text-xs font-medium text-text-tertiary">
        {proposed
          ? t(`${K}cancel.proposedBy`, {
              name: who(cancellation.proposedByName),
              date: formatInstant(cancellation.proposedAt, i18n.language),
            })
          : t(`${K}cancel.confirmedBy`, {
              date: cancellation.effectiveOn ? day(cancellation.effectiveOn) : '',
              proposer: who(cancellation.proposedByName),
              confirmer: who(cancellation.confirmedByName),
            })}
      </span>
      <span className="text-sm leading-[1.6] text-text-secondary">
        {t(`${K}cancel.internal`)}: {cancellation.internalReason}
      </span>
      <span className="text-sm leading-[1.6] text-text-secondary">
        {t(`${K}cancel.message`)}: {cancellation.customerMessage}
      </span>
      {!proposed && cancellation.outcome.voidedBills.length > 0 ? (
        <span className="text-xs font-medium text-text-tertiary">
          {t(`${K}cancel.voided`)}{' '}
          <bdi dir="ltr">{cancellation.outcome.voidedBills.join(', ')}</bdi>
        </span>
      ) : null}
      {!proposed && cancellation.outcome.refundCases.length > 0 ? (
        <span className="text-xs font-medium text-text-tertiary">
          {t(`${K}cancel.refunds`, { count: cancellation.outcome.refundCases.length })}
        </span>
      ) : null}
      {proposed && mine ? (
        <span className="text-xs font-semibold text-pending-700">{t(`${K}cancel.waiting`)}</span>
      ) : null}
      {proposed && canManage ? (
        <div className="flex flex-wrap gap-2.5">
          {mine ? null : (
            <ConsoleButton variant="danger" onClick={() => setDialog('confirm')}>
              {t(`${K}cancel.confirmOpen`)}
            </ConsoleButton>
          )}
          <ConsoleButton variant="secondary" onClick={() => setDialog('withdraw')}>
            {t(`${K}cancel.withdrawOpen`)}
          </ConsoleButton>
        </div>
      ) : null}

      {dialog === 'confirm' ? (
        <ConfirmCancellationDialog
          tenantId={tenantId}
          cancellation={cancellation}
          onClose={close}
        />
      ) : null}
      {dialog === 'withdraw' ? (
        <OperatorReasonDialog<FawtirCancellationDto>
          formId="company-fawtir-cancellation-withdraw"
          title={t(`${K}cancel.withdrawTitle`)}
          body={t(`${K}cancel.withdrawBody`)}
          confirmLabel={t(`${K}cancel.withdrawConfirm`)}
          confirmingLabel={t(`${K}sending`)}
          send={(reason) => withdrawFawtirCancellation(tenantId, cancellation.id, reason)}
          describeFailure={describeStaffActionFailure}
          onDone={() => close(true)}
          onClose={() => close(false)}
        />
      ) : null}
    </div>
  )
}

/**
 * The second operator's confirmation. No reason of its own: the proposal carries it. A refusal that
 * means the proposal moved on (already decided) reloads the card when the window closes.
 */
function ConfirmCancellationDialog({
  tenantId,
  cancellation,
  onClose,
}: {
  tenantId: string
  cancellation: FawtirCancellationDto
  onClose: (changed: boolean) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<FormMessage | null>(null)
  const [stale, setStale] = useState(false)
  const inFlight = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setSending(true)
    setFailure(null)
    try {
      await confirmFawtirCancellation(tenantId, cancellation.id)
      onClose(true)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      const message = describeStaffActionFailure(error)
      if (error instanceof ApiError && error.problemType === 'fawtir-cancellation-not-open')
        setStale(true)
      setFailure(message)
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!sending) onClose(stale)
      }}
      title={t(`${K}cancel.confirmTitle`)}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <ConsoleButton
            type="button"
            variant="secondary"
            disabled={sending}
            onClick={() => onClose(stale)}
          >
            {t('common.cancel')}
          </ConsoleButton>
          <ConsoleButton
            type="submit"
            form="company-fawtir-cancellation-confirm"
            variant="danger"
            disabled={sending}
          >
            {sending ? t(`${K}sending`) : t(`${K}cancel.confirmButton`)}
          </ConsoleButton>
        </div>
      }
    >
      <form
        id="company-fawtir-cancellation-confirm"
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-4"
      >
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(`${K}cancel.confirmBody`)}
        </p>
        <p className="text-sm leading-[1.6] text-text-secondary">
          {t(`${K}cancel.message`)}: {cancellation.customerMessage}
        </p>
        {failure ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(failure.key, failure.values)}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
