import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Button, Input, Modal } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import type { CompanyDetail } from '../../../lib/console/companyVerification'
import {
  currentSubmissionPath,
  describeParticipantFailure,
  isReviewable,
  reasonCodeError,
  verifyParticipant,
  type PidSubmission,
} from '../../../lib/console/pidSubmission'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { ReviewCard, ReviewLine } from './ReviewCard'

/** Oman's Peppol scheme: a company is addressed as `0248:` followed by its VAT number. */
const OMAN_SCHEME = '0248'

/** The ID the company would carry by default: the scheme and the VAT number, upper-cased. Shown
 * before any real submission exists, as a preview of what the tenant is expected to file. */
export function proposedParticipantId(taxNumber: string | null): string {
  const vat = taxNumber?.trim().toUpperCase()
  return vat ? `${OMAN_SCHEME}:${vat}` : ''
}

type Dialog = 'approve' | 'reject' | null

/**
 * The company's Peppol Participant ID, reviewed on the same screen as the company itself.
 *
 * A company cannot issue until its Participant ID is verified (`SELLER_PARTICIPANT_NOT_VERIFIED`),
 * and that review is separate from the company verification beside it. The backend takes no
 * reviewer-typed override — `POST .../data-submissions/{id}/verify` carries only the decision and
 * a reason code, never a scheme or value — so this card decides the tenant's own candidate as
 * filed, the same way `DecisionPanel` decides the company's own submitted profile.
 */
export function ParticipantPanel({
  company,
  operatorId,
}: {
  company: CompanyDetail
  /** The signed-in operator, from the entitlements; compared with the submitter for four-eyes. */
  operatorId: string | null
}) {
  const { t } = useTranslation()
  const { read, retry } = useConsoleRead<PidSubmission | null>(currentSubmissionPath(company.tenantId))

  if (read.status === 'loading') {
    return (
      <ReviewCard title={t('console.verification.participant.title')}>
        <ConsoleNotice busy body={t('console.verification.detail.loading')} />
      </ReviewCard>
    )
  }
  if (read.status === 'failed') {
    return (
      <ReviewCard title={t('console.verification.participant.title')}>
        <ConsoleReadFailure error={read.error} retry={retry} />
      </ReviewCard>
    )
  }
  return (
    <ParticipantCard
      company={company}
      submission={read.data}
      operatorId={operatorId}
      onDecided={retry}
    />
  )
}

function ParticipantCard({
  company,
  submission,
  operatorId,
  onDecided,
}: {
  company: CompanyDetail
  submission: PidSubmission | null
  operatorId: string | null
  onDecided: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const none = t('console.verification.detail.none')
  const proposed = proposedParticipantId(company.taxNumber)
  const groupVat = company.taxNumber?.trim().toUpperCase().startsWith('OM12') ?? false

  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [decisionError, setDecisionError] = useState<FormMessage | null>(null)
  const inFlight = useRef(false)

  const candidate = submission ? `${submission.candidatePidScheme}:${submission.candidatePidValue}` : none
  const verified = submission?.verifiedPidScheme
    ? `${submission.verifiedPidScheme}:${submission.verifiedPidValue}`
    : null
  const reviewable = submission !== null && isReviewable(submission.status)
  const ownSubmission =
    submission !== null &&
    operatorId !== null &&
    (submission.createdBy === operatorId || submission.submittedBy === operatorId)

  const leaveIfSignedOut = (error: unknown): boolean => {
    if (error instanceof ApiError && error.status === 401) {
      forgetEntitlements()
      navigate(LOGIN_ROUTE, { replace: true })
      return true
    }
    return false
  }

  const openDialog = (next: Exclude<Dialog, null>) => {
    setDecisionError(null)
    setReason('')
    setReasonTouched(false)
    setDialog(next)
  }

  const decide = async () => {
    if (inFlight.current || submission === null) return
    const problem = reasonCodeError(reason)
    if (problem) {
      setReasonTouched(true)
      return
    }
    inFlight.current = true
    setDeciding(true)
    setDecisionError(null)
    try {
      await verifyParticipant(company.tenantId, submission.id, {
        expectedOptimisticLockVersion: submission.optimisticLockVersion,
        approved: dialog === 'approve',
        reasonCode: reason.trim().toUpperCase(),
      })
      setDialog(null)
      onDecided()
    } catch (error) {
      if (!leaveIfSignedOut(error)) setDecisionError(describeParticipantFailure(error))
    } finally {
      inFlight.current = false
      setDeciding(false)
    }
  }

  const conflict = decisionError?.key === 'console.verification.participant.conflict'
  const reasonProblem = reasonCodeError(reason)

  return (
    <ReviewCard title={t('console.verification.participant.title')}>
      <p className="pb-3 text-sm font-medium leading-[1.6] text-text-tertiary">
        {t('console.verification.participant.intro')}
      </p>

      <ReviewLine
        label={t('console.verification.participant.proposed')}
        value={
          <span dir="ltr" className="font-mono">
            {submission ? candidate : proposed || none}
          </span>
        }
      />
      <ReviewLine
        label={t('console.verification.participant.status')}
        value={
          submission
            ? t(`console.verification.participant.submissionStatus.${submission.status}`)
            : t('console.verification.participant.notSubmitted')
        }
      />
      {verified ? (
        <ReviewLine
          label={t('console.verification.participant.verifiedId')}
          value={
            <span dir="ltr" className="font-mono">
              {verified}
            </span>
          }
        />
      ) : null}

      {groupVat ? (
        <p role="note" className="mt-3 text-sm font-medium leading-[1.6] text-warning-700">
          {t('console.verification.participant.groupVat')}
        </p>
      ) : null}

      {submission === null ? (
        <p className="mt-3 text-sm font-medium leading-[1.6] text-text-tertiary">
          {t('console.verification.participant.awaitingSubmission')}
        </p>
      ) : ownSubmission ? (
        <p className="mt-3 text-sm font-medium leading-[1.6] text-text-tertiary">
          {t('console.verification.participant.ownSubmission')}
        </p>
      ) : reviewable ? (
        <div className="mt-4 flex flex-col gap-2.5">
          <Button type="button" size="md" fullWidth onClick={() => openDialog('approve')}>
            {t('console.verification.participant.approve')}
          </Button>
          <Button
            type="button"
            size="md"
            variant="secondary"
            fullWidth
            onClick={() => openDialog('reject')}
          >
            {t('console.verification.participant.reject')}
          </Button>
        </div>
      ) : null}

      <Modal
        open={dialog !== null}
        onClose={() => {
          if (!deciding) setDialog(null)
        }}
        title={
          dialog === 'approve'
            ? t('console.verification.participant.approveTitle')
            : t('console.verification.participant.rejectTitle')
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            {conflict ? (
              <Button type="button" size="md" variant="secondary" onClick={onDecided}>
                {t('console.verification.decision.reload')}
              </Button>
            ) : (
              <Button
                type="button"
                size="md"
                variant="secondary"
                disabled={deciding}
                onClick={() => setDialog(null)}
              >
                {t('common.cancel')}
              </Button>
            )}
            <Button type="button" size="md" disabled={deciding || conflict} onClick={() => void decide()}>
              {dialog === 'approve'
                ? deciding
                  ? t('console.verification.participant.approving')
                  : t('console.verification.participant.approveConfirm')
                : deciding
                  ? t('console.verification.participant.rejecting')
                  : t('console.verification.participant.rejectConfirm')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <ReviewLine
            label={t('console.verification.participant.proposed')}
            value={
              <span dir="ltr" className="font-mono">
                {candidate}
              </span>
            }
          />
          <Input
            bordered
            requiredMark
            name="participantReasonCode"
            dir="ltr"
            label={t('console.verification.participant.reasonLabel')}
            hint={t('console.verification.participant.reasonHint')}
            value={reason}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            // Uppercased as typed rather than only at submit, so what the reviewer sees is what
            // gets validated and sent — never a silently different value than what is on screen.
            onChange={(event) => setReason(event.target.value.toUpperCase())}
            onBlur={() => setReasonTouched(true)}
            error={
              reasonTouched && reasonProblem
                ? t(
                    reasonProblem === 'required'
                      ? 'console.verification.participant.reasonRequired'
                      : 'console.verification.participant.reasonInvalid',
                  )
                : undefined
            }
          />
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {dialog === 'approve'
              ? t('console.verification.participant.approveBody')
              : t('console.verification.participant.rejectBody')}
          </p>
          {decisionError ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {t(decisionError.key, decisionError.values)}
            </p>
          ) : null}
        </div>
      </Modal>
    </ReviewCard>
  )
}
