import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input, Modal, Switch } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import type { CatalogueAdminPlan } from '../../../lib/console/planCatalogue'
import {
  RECEIVED_COUNTING_REASON_MAX,
  describeCountingFailure,
  isCountingConflict,
  planCountingPath,
  savePlanCounting,
  type PlanCounting,
  type PlanCountingChange,
} from '../../../lib/console/receivedCounting'
import { formatInstant } from '../../../lib/format'
import { forgetEntitlements, peekEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { displayPlanName } from './planName'

const K = 'console.plans.counting.'
const FORM_ID = 'plan-counting'

/**
 * Whether received supplier documents use this plan's allowance, with every change made to it.
 * Its own versioned record beside the plan (not a plan field), so it has its own save, reason
 * and `If-Match`, and is shown in a dialog of its own, like the plan's history.
 */
export function PlanCountingPanel({
  plan,
  canManage,
  onClose,
}: {
  plan: CatalogueAdminPlan
  canManage: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<PlanCounting>(planCountingPath(plan.code))
  const [saved, setSaved] = useState<PlanCounting | null>(null)
  const [notice, setNotice] = useState<FormMessage | null>(null)
  const name = displayPlanName(plan, i18n.language)

  let body: ReactNode
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t(`${K}loading`)} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else {
    const counting = saved ?? read.data
    body = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <ConsoleStatusPill
            tone={counting.countsReceived ? 'success' : 'neutral'}
            label={t(counting.countsReceived ? `${K}on` : `${K}off`)}
          />
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {t(counting.countsReceived ? `${K}onBody` : `${K}offBody`)}
          </p>
        </div>
        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">{t(`${K}applies`)}</p>
        {notice ? (
          <p role="status" className="text-sm font-medium text-text-secondary">
            {t(notice.key, notice.values)}
          </p>
        ) : null}
        {canManage ? (
          <CountingForm
            // A new version read starts a fresh form, so nothing typed against the old one lingers.
            key={counting.version}
            plan={plan}
            counting={counting}
            onSaved={(answer) => {
              setSaved(answer)
              setNotice({ key: `${K}saved` })
            }}
            onConflict={() => {
              setSaved(null)
              setNotice({ key: `${K}refusal.conflict` })
              retry()
            }}
          />
        ) : null}
        <History history={counting.history} />
      </div>
    )
  }

  return (
    <Modal
      open
      width={680}
      onClose={onClose}
      title={t(`${K}title`, { name })}
      subtitle={t(`${K}subtitle`)}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <ConsoleButton type="button" size="md" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </ConsoleButton>
          {canManage && read.status === 'ready' ? (
            <ConsoleButton type="submit" form={FORM_ID} size="md">
              {t(`${K}save`)}
            </ConsoleButton>
          ) : null}
        </div>
      }
    >
      {body}
    </Modal>
  )
}

function CountingForm({
  plan,
  counting,
  onSaved,
  onConflict,
}: {
  plan: CatalogueAdminPlan
  counting: PlanCounting
  onSaved: (answer: PlanCounting) => void
  onConflict: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [on, setOn] = useState(counting.countsReceived)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [sending, setSending] = useState(false)
  // One confirmation, one request: a double click must not publish two versions.
  const inFlight = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    setFormError(null)
    if (on === counting.countsReceived) {
      setFormError({ key: `${K}unchanged` })
      return
    }
    if (!reason.trim()) {
      setReasonError(`${K}reasonRequired`)
      event.currentTarget.querySelector<HTMLInputElement>('input[name="reason"]')?.focus()
      return
    }
    inFlight.current = true
    setSending(true)
    try {
      onSaved(await savePlanCounting(plan.code, counting.version, on, reason.trim()))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      if (isCountingConflict(error)) {
        onConflict()
        return
      }
      setFormError(describeCountingFailure(error))
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  const label = t(`${K}switch`)
  return (
    <form
      id={FORM_ID}
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4 border-t border-border-subtle pt-5"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-text-tertiary">{label}</span>
        <Switch
          checked={on}
          onChange={(checked) => {
            setOn(checked)
            setFormError(null)
          }}
          label={label}
          disabled={sending}
        />
      </div>
      <Input
        bordered
        name="reason"
        label={t(`${K}reason`)}
        requiredMark
        autoComplete="off"
        maxLength={RECEIVED_COUNTING_REASON_MAX}
        value={reason}
        disabled={sending}
        onChange={(event) => {
          setReason(event.target.value)
          setReasonError(undefined)
          setFormError(null)
        }}
        hint={t(`${K}reasonHint`)}
        error={reasonError ? t(reasonError) : undefined}
      />
      {formError ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {t(formError.key, formError.values)}
        </p>
      ) : null}
    </form>
  )
}

/** Newest first, whatever order arrives: who switched it, when and why. */
function History({ history }: { history: PlanCountingChange[] }) {
  const { t, i18n } = useTranslation()
  const me = peekEntitlements()?.userId ?? null
  const changes = [...history].sort((a, b) => b.version - a.version)
  return (
    <section className="flex flex-col gap-3" aria-labelledby="plan-counting-history">
      <p
        id="plan-counting-history"
        className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary"
      >
        {t(`${K}history`)}
      </p>
      {changes.length === 0 ? (
        <p className="text-sm font-medium text-text-tertiary">{t(`${K}noHistory`)}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {changes.map((change) => (
            <li key={change.id} className="rounded-sm border border-border-subtle p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-text-primary">
                  {t(change.countsReceived ? `${K}switchedOn` : `${K}switchedOff`)}
                </p>
                <p className="text-xs font-medium text-text-quaternary">
                  {formatInstant(change.createdAt, i18n.language)}
                </p>
              </div>
              <p className="mt-2 text-sm font-medium text-text-secondary">
                {t('console.plans.history.reason')}: {change.reason}
              </p>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('console.plans.history.by')}{' '}
                {change.createdBy === me ? (
                  t('console.plans.history.you')
                ) : (
                  // Only the operator's id is recorded; it is shown as recorded.
                  <bdi dir="ltr" className="font-mono text-[11px]">
                    {change.createdBy}
                  </bdi>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
