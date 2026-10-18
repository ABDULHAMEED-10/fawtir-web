import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input, Modal } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import type { CompanyDetail } from '../../../lib/console/companyVerification'
import {
  currentSubmissionPath,
  JUSTIFICATION_MAX_LENGTH,
  describeParticipantFailure,
  isPolicyNotActive,
  isReviewable,
  justificationError,
  reasonCodeError,
  verifyParticipant,
  type ParticipantDecision,
  type PidSubmission,
} from '../../../lib/console/pidSubmission'
import { EVIDENCE_REFERENCE_MAX_LENGTH, evidenceReferenceError } from '../../../lib/console/evidenceReference'
import { formatInstant } from '../../../lib/format'
import { problemReference } from '../../../lib/console/problemReference'
import {
  PID_POLICY_TYPE,
  currentPolicyPath,
  policyRoute,
  type BlockerVersionView,
} from '../../../lib/console/validationPolicies'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { ProblemReference } from '../policies/PolicyFailureNotice'
import { ReviewCard, ReviewLine } from './ReviewCard'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'

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
 * reviewer-typed override — `POST .../data-submissions/{id}/verify` carries the decision, a reason
 * code and, for an approval, the reviewer's evidence and justification, never a scheme or value —
 * so this card decides the tenant's own candidate as filed, the same way `DecisionPanel` decides
 * the company's own submitted profile.
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
      // The backend answers "no submission yet" with an empty 200, not a JSON null, which the
      // client reads as undefined. A company onboarded from Console > Tenants never files one, and
      // the card's `!== null` guards would dereference it and blank the whole review page.
      submission={read.data ?? null}
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
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const none = t('console.verification.detail.none')
  const proposed = proposedParticipantId(company.taxNumber)
  const groupVat = company.taxNumber?.trim().toUpperCase().startsWith('OM12') ?? false

  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)
  const [evidence, setEvidence] = useState('')
  const [evidenceTouched, setEvidenceTouched] = useState(false)
  const [justification, setJustification] = useState('')
  const [justificationTouched, setJustificationTouched] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [decisionError, setDecisionError] = useState<FormMessage | null>(null)
  const [decisionReference, setDecisionReference] = useState<string | null>(null)
  const inFlight = useRef(false)

  const candidate = submission ? `${submission.candidatePidScheme}:${submission.candidatePidValue}` : none
  const verified = submission?.verifiedPidScheme
    ? `${submission.verifiedPidScheme}:${submission.verifiedPidValue}`
    : null
  // `status` describes the row; whether the company's verification counts under the policy in force
  // is the server's `verificationStanding`, so a VERIFIED row verified under an older policy version
  // is qualified rather than shown as plainly verified. Absent standing leaves the card as it was.
  const standing = submission?.verificationStanding ?? null
  const qualified =
    standing !== null &&
    (standing.state === 'REVERIFICATION_REQUIRED' || standing.state === 'NO_POLICY_IN_FORCE')
  // The row shown can be VERIFIED while the state is REJECTED: a rejected re-verification leaves the
  // earlier VERIFIED row as the current one. Its status line must still say it no longer counts, so
  // the label follows `currentPolicySatisfied`, not the state alone.
  const verifiedLabel =
    standing !== null && submission?.status === 'VERIFIED' && !standing.currentPolicySatisfied
      ? standing.policyInForce === null
        ? 'NO_POLICY_IN_FORCE'
        : 'REVERIFICATION_REQUIRED'
      : null
  const recorded = standing !== null && standing.state !== 'VERIFIED' ? standing.verification : null
  const standingNote =
    standing === null
      ? null
      : qualified
        ? `console.verification.participant.standingNote.${standing.state}`
        : recorded !== null && standing.state === 'AWAITING_REVIEW'
          ? 'console.verification.participant.standingNote.reverificationOpen'
          : recorded !== null && standing.state === 'REJECTED'
            ? 'console.verification.participant.standingNote.rejectedWithPrevious'
            : null
  const policyVersion = (number: number | null | undefined) =>
    number === null || number === undefined
      ? none
      : t('console.verification.participant.policyVersion', { number })
  const reviewable = submission !== null && isReviewable(submission.status)
  const ownSubmission =
    submission !== null &&
    operatorId !== null &&
    (submission.createdBy === operatorId || submission.submittedBy === operatorId)
  const decidable = reviewable && !ownSubmission

  // An approval is checked against the taxpayer Participant ID validation policy in force, and is
  // refused when there is none. Asked only when a decision would be offered, so a card with
  // nothing to decide costs no request. Only a `404` (nothing in force) withholds Approve: a
  // reviewer who may not read policies (`403`), or a read that failed, proves nothing about the
  // policy, so the button stays and the backend decides.
  const policy = useConsoleRead<BlockerVersionView>(
    decidable ? currentPolicyPath(PID_POLICY_TYPE) : null,
  )
  const policyPending = decidable && policy.read.status === 'loading'
  const policyMissing =
    policy.read.status === 'failed' &&
    policy.read.error instanceof ApiError &&
    policy.read.error.status === 404

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
    setDecisionReference(null)
    setReason('')
    setReasonTouched(false)
    // Emptied on every open, never prefilled: whatever an approval cites has to be what this
    // reviewer typed for this candidate, not something left over from an earlier dialog.
    setEvidence('')
    setEvidenceTouched(false)
    setJustification('')
    setJustificationTouched(false)
    setDialog(next)
  }

  const decide = async () => {
    if (inFlight.current || submission === null) return
    const approving = dialog === 'approve'
    const blocked =
      reasonCodeError(reason) !== null ||
      (approving && (evidenceReferenceError(evidence) !== null || justificationError(justification) !== null))
    if (blocked) {
      setReasonTouched(true)
      setEvidenceTouched(true)
      setJustificationTouched(true)
      return
    }
    const reasonCode = reason.trim().toUpperCase()
    const decision: ParticipantDecision = approving
      ? {
          approved: true,
          expectedOptimisticLockVersion: submission.optimisticLockVersion,
          reasonCode,
          evidenceReference: evidence,
          justification,
        }
      : { approved: false, expectedOptimisticLockVersion: submission.optimisticLockVersion, reasonCode }
    inFlight.current = true
    setDeciding(true)
    setDecisionError(null)
    setDecisionReference(null)
    try {
      await verifyParticipant(company.tenantId, submission.id, decision)
      setDialog(null)
      onDecided()
    } catch (error) {
      if (!leaveIfSignedOut(error)) {
        setDecisionError(describeParticipantFailure(error))
        setDecisionReference(problemReference(error))
        // The policy went out of force after this card read it: read it again, so the card behind
        // the dialog stops offering an approval that cannot succeed.
        if (isPolicyNotActive(error)) policy.retry()
      }
    } finally {
      inFlight.current = false
      setDeciding(false)
    }
  }

  const conflict = decisionError?.key === 'console.verification.participant.conflict'
  const policyRefused = decisionError?.key === 'console.verification.participant.policyNotActive'
  const policyLink = (
    <Link
      to={policyRoute(PID_POLICY_TYPE)}
      className="text-sm font-semibold text-primary-800 underline-offset-2 hover:underline"
    >
      {t('console.verification.participant.viewPolicy')}
    </Link>
  )
  const reasonProblem = reasonCodeError(reason)
  const evidenceProblem = evidenceReferenceError(evidence)
  const justificationProblem = justificationError(justification)

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
            ? verifiedLabel !== null
              ? t(`console.verification.participant.standing.${verifiedLabel}`)
              : t(`console.verification.participant.submissionStatus.${submission.status}`)
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
      {recorded !== null && standing !== null ? (
        <>
          {recorded.submissionId !== submission?.id ? (
            <ReviewLine
              label={t('console.verification.participant.previousId')}
              value={
                <span dir="ltr" className="font-mono">
                  {`${recorded.participantScheme}:${recorded.participantValue}`}
                </span>
              }
            />
          ) : null}
          <ReviewLine
            label={t('console.verification.participant.verifiedUnder')}
            value={policyVersion(recorded.policyVersionNumber)}
          />
          <ReviewLine
            label={t('console.verification.participant.verifiedAt')}
            value={formatInstant(recorded.verifiedAt, i18n.language)}
          />
          <ReviewLine
            label={t('console.verification.participant.policyInForce')}
            value={
              standing.policyInForce
                ? policyVersion(standing.policyInForce.versionNumber)
                : t('console.verification.participant.noPolicyInForce')
            }
          />
        </>
      ) : null}

      {groupVat ? (
        <p role="note" className="mt-3 text-sm font-medium leading-[1.6] text-warning-700">
          {t('console.verification.participant.groupVat')}
        </p>
      ) : null}

      {standingNote ? (
        <p
          role="note"
          className={[
            'mt-3 text-sm font-medium leading-[1.6]',
            qualified ? 'text-pending-700' : 'text-text-tertiary',
          ].join(' ')}
        >
          {t(standingNote)}
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
          {policyMissing ? (
            <div role="note" className="flex flex-col items-start gap-1.5 pb-1">
              <p className="text-sm font-medium leading-[1.6] text-pending-700">
                {t('console.verification.participant.policyNotActive')}
              </p>
              {policyLink}
            </div>
          ) : policyPending ? null : (
            <ConsoleButton type="button" size="md" fullWidth onClick={() => openDialog('approve')}>
              {t('console.verification.participant.approve')}
            </ConsoleButton>
          )}
          <ConsoleButton
            type="button"
            size="md"
            variant="secondary"
            fullWidth
            onClick={() => openDialog('reject')}
          >
            {t('console.verification.participant.reject')}
          </ConsoleButton>
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
              <ConsoleButton type="button" size="md" variant="secondary" onClick={onDecided}>
                {t('console.verification.decision.reload')}
              </ConsoleButton>
            ) : (
              <ConsoleButton
                type="button"
                size="md"
                variant="secondary"
                disabled={deciding}
                onClick={() => setDialog(null)}
              >
                {t('common.cancel')}
              </ConsoleButton>
            )}
            <ConsoleButton
              type="button"
              size="md"
              disabled={deciding || conflict || policyRefused}
              onClick={() => void decide()}
            >
              {dialog === 'approve'
                ? deciding
                  ? t('console.verification.participant.approving')
                  : t('console.verification.participant.approveConfirm')
                : deciding
                  ? t('console.verification.participant.rejecting')
                  : t('console.verification.participant.rejectConfirm')}
            </ConsoleButton>
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
          {dialog === 'approve' ? (
            <>
              <Input
                bordered
                requiredMark
                name="participantEvidenceReference"
                dir="ltr"
                label={t('console.verification.participant.evidenceLabel')}
                hint={t('console.verification.participant.evidenceHint')}
                value={evidence}
                maxLength={EVIDENCE_REFERENCE_MAX_LENGTH}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setEvidence(event.target.value)}
                onBlur={() => setEvidenceTouched(true)}
                error={
                  evidenceTouched && evidenceProblem
                    ? t(`console.verification.participant.evidenceError.${evidenceProblem}`)
                    : undefined
                }
              />
              <Input
                bordered
                requiredMark
                name="participantJustification"
                label={t('console.verification.participant.justificationLabel')}
                hint={t('console.verification.participant.justificationHint')}
                value={justification}
                maxLength={JUSTIFICATION_MAX_LENGTH}
                autoComplete="off"
                onChange={(event) => setJustification(event.target.value)}
                onBlur={() => setJustificationTouched(true)}
                error={
                  justificationTouched && justificationProblem
                    ? t(`console.verification.participant.justificationError.${justificationProblem}`)
                    : undefined
                }
              />
            </>
          ) : null}
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {dialog === 'approve'
              ? t('console.verification.participant.approveBody')
              : t('console.verification.participant.rejectBody')}
          </p>
          {decisionError ? (
            <div role="alert" className="flex flex-col items-start gap-1.5">
              <p className="text-sm font-medium text-danger-700">
                {t(decisionError.key, decisionError.values)}
              </p>
              {policyRefused ? policyLink : null}
              <ProblemReference id={decisionReference} />
            </div>
          ) : null}
        </div>
      </Modal>
    </ReviewCard>
  )
}
