import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Button, Modal } from '../../../components/ui'
import { formatMoment, localeFor } from '../../../lib/console/format'
import {
  PID_POLICY_TYPE,
  policyFailure,
  transitionVersion,
  type BlockerVersionView,
  type PolicyFailure,
  type PolicyTransition,
} from '../../../lib/console/validationPolicies'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { ReviewLine } from '../verification/ReviewCard'
import { PolicyFailureNotice } from './PolicyFailureNotice'
import { PolicyStatusPill } from './PolicyStatusPill'

/**
 * Confirms one step of a policy version's lifecycle before it is sent.
 *
 * There is no reason field: each step is recorded with a fixed machine code, so the only thing the
 * operator adds is their own identity, which is what the separation of duties is counted on. The
 * dialog therefore says exactly that, and what the step changes, before anything is written.
 */
export function PolicyTransitionDialog({
  version,
  transition,
  onClose,
  onDone,
  onMoved,
}: {
  /** The version as the server last returned it; its lock version is what the request quotes. */
  version: BlockerVersionView
  transition: PolicyTransition
  onClose: () => void
  onDone: (updated: BlockerVersionView) => void
  /** The version changed under the reader, or is gone: the screen must be read again. */
  onMoved: (failure: PolicyFailure) => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<PolicyFailure | null>(null)
  // One confirmation, one request: a second activation or approval is at best refused and at
  // worst recorded against a version the first one already moved.
  const inFlight = useRef(false)

  const key = (suffix: string) => `console.policies.confirm.${transition}.${suffix}`
  const number = new Intl.NumberFormat(localeFor(i18n.language)).format(version.versionNumber)

  const confirm = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setSending(true)
    setFailure(null)
    try {
      onDone(await transitionVersion(transition, version.type, version))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      const refusal = policyFailure(error)
      // Never sent again from here: a moved version is handed back to the page, which reloads it
      // and leaves the next decision to the operator.
      if (refusal.reload) onMoved(refusal)
      else setFailure(refusal)
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
      title={t(key('title'))}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button type="button" size="md" variant="secondary" disabled={sending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" size="md" disabled={sending} onClick={() => void confirm()}>
            {sending ? t(key('sending')) : t(key('confirm'))}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <ReviewLine
            label={t('console.policies.confirm.policy')}
            value={t(`console.policies.type.${version.type}`)}
          />
          <ReviewLine label={t('console.policies.confirm.version')} value={number} />
          <ReviewLine
            label={t('console.policies.confirm.status')}
            value={<PolicyStatusPill status={version.status} />}
          />
          {transition === 'activate' ? (
            <ReviewLine
              label={t('console.policies.detail.field.effectiveFrom')}
              value={
                version.effectiveFrom
                  ? formatMoment(version.effectiveFrom, i18n.language)
                  : t('console.policies.none')
              }
            />
          ) : null}
        </div>
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">{t(key('records'))}</p>
        {transition === 'activate' ? (
          <>
            <p className="text-sm font-semibold leading-[1.6] text-text-secondary">
              {t('console.policies.confirm.activate.replaces')}
            </p>
            {/* Static on purpose: whether the date is still ahead is the server's judgement, so
                the browser's clock does not choose the wording. */}
            <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('console.policies.confirm.activate.scheduled')}
            </p>
            {version.type === PID_POLICY_TYPE ? (
              <p role="note" className="text-sm font-semibold leading-[1.6] text-pending-700">
                {t('console.policies.confirm.activate.pidImpact')}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {t(key('consequence'))}
          </p>
        )}
        {failure ? <PolicyFailureNotice failure={failure} /> : null}
      </div>
    </Modal>
  )
}
