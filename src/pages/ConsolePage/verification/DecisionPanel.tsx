import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { FileDropzone, Input, Modal, Select } from '../../../components/ui'
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_BYTES,
  REJECTION_REASONS,
  attestCompany,
  attestationReferenceError,
  describeDecisionFailure,
  rejectCompany,
  uploadEvidence,
  type CompanyDetail,
  type EvidenceUpload,
  type RejectionClassification,
  type RejectionReason,
  type VerificationStatus,
} from '../../../lib/console/companyVerification'
import { localeFor } from '../../../lib/console/format'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import uploadIcon from '../../../assets/create-invoice/upload.svg'
import { ReviewCard, ReviewLine } from './ReviewCard'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'

type Dialog = 'verify' | 'reject' | null

type DecisionPanelProps = {
  company: CompanyDetail
  /** The signed-in operator, from the entitlements; compared with the submitter for four-eyes. */
  operatorId: string | null
  /** The status of the payment sent with the application; absent while unknown or when none was sent. */
  paymentStatus?: string | null
  /**
   * Called once a decision is recorded, or when the reviewer asks to reload a moved case. `final`
   * is true when the decision was a FINAL rejection, which closes the application.
   */
  onDecided: (outcome: VerificationStatus | null, final?: boolean) => void
  /**
   * The application was sent back and its correction is overdue (D11): the only decision left is
   * to close it with a final rejection, so the panel offers that alone.
   */
  closeOverdue?: boolean
}

/**
 * The reviewer's decision on a submitted registration: file the evidence, then verify or reject.
 *
 * Every decision goes through a confirming dialog first — both are irreversible from here and one
 * of them lets a company start invoicing. The backend is the judge of everything that matters
 * (the revision the decision quotes, the evidence digest, the four-eyes rule); what this panel
 * checks locally only saves a request that would certainly be refused.
 */
export function DecisionPanel({
  company,
  operatorId,
  paymentStatus,
  onDecided,
  closeOverdue = false,
}: DecisionPanelProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [evidence, setEvidence] = useState<EvidenceUpload | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<FormMessage | null>(null)
  const [reference, setReference] = useState('')
  const [referenceTouched, setReferenceTouched] = useState(false)
  const referenceHintId = useId()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState<RejectionReason | ''>('')
  const [reasonTouched, setReasonTouched] = useState(false)
  // CORRECTABLE unless the reviewer says otherwise: a final refusal closes the application and
  // opens a refund for confirmed money, so it is never the default (owner, 12 Oct 2026).
  const [classification, setClassification] = useState<RejectionClassification>(
    closeOverdue ? 'FINAL' : 'CORRECTABLE',
  )
  const [finalReason, setFinalReason] = useState('')
  const [deciding, setDeciding] = useState(false)
  const [decisionError, setDecisionError] = useState<FormMessage | null>(null)
  // One request per action: a double drop, a double click on a dialog's button, or an upload
  // racing a decision would each be another write the backend has to refuse or, worse, accept.
  const inFlight = useRef(false)
  // A payment sent with the application that Finance has not confirmed yet: the verify dialog says
  // the paid subscription waits for it.
  const paymentUnconfirmed =
    typeof paymentStatus === 'string' && paymentStatus !== 'FUNDS_VERIFIED' && paymentStatus !== 'CONFIRMED'

  // Four-eyes, as `CompanyVerificationService.requireIndependentReviewer` enforces it. Checked
  // here only so the reviewer is told instead of being offered buttons that must fail.
  if (operatorId !== null && company.submittedBy === operatorId) {
    return (
      <ReviewCard title={t('console.verification.decision.title')}>
        <p className="py-2.5 text-sm font-medium leading-[1.6] text-text-tertiary">
          {t('console.verification.decision.ownSubmission')}
        </p>
      </ReviewCard>
    )
  }

  const referenceProblem = attestationReferenceError(reference)
  // Evidence is bound to the revision it was filed against; once the profile moves on, the
  // backend no longer accepts it, so neither does the button.
  const evidenceStale = evidence !== null && evidence.profileRevision !== company.expectedRevision
  const canVerify = evidence !== null && !evidenceStale && referenceProblem === null && !uploading

  const leaveIfSignedOut = (error: unknown): boolean => {
    if (error instanceof ApiError && error.status === 401) {
      forgetEntitlements()
      navigate(LOGIN_ROUTE, { replace: true })
      return true
    }
    return false
  }

  const upload = async (file: File) => {
    if (inFlight.current) return
    inFlight.current = true
    setUploading(true)
    setUploadError(null)
    try {
      setEvidence(await uploadEvidence(company.tenantId, file))
    } catch (error) {
      if (!leaveIfSignedOut(error)) setUploadError(describeDecisionFailure(error))
    } finally {
      inFlight.current = false
      setUploading(false)
    }
  }

  const decide = async () => {
    if (inFlight.current) return
    if (dialog === 'reject' && (reason === '' || (classification === 'FINAL' && !finalReason.trim()))) {
      setReasonTouched(true)
      return
    }
    inFlight.current = true
    setDeciding(true)
    setDecisionError(null)
    try {
      const result =
        dialog === 'verify' && evidence
          ? await attestCompany(company.tenantId, {
              expectedRevision: company.expectedRevision,
              attestationReference: reference,
              evidence,
            })
          : await rejectCompany(company.tenantId, {
              expectedRevision: company.expectedRevision,
              reason: reason as RejectionReason,
              classification,
              finalReason: classification === 'FINAL' ? finalReason.trim() : null,
            })
      setDialog(null)
      onDecided(result.verificationStatus, dialog === 'reject' && classification === 'FINAL')
    } catch (error) {
      if (!leaveIfSignedOut(error)) setDecisionError(describeDecisionFailure(error))
    } finally {
      inFlight.current = false
      setDeciding(false)
    }
  }

  const openDialog = (next: Exclude<Dialog, null>) => {
    setDecisionError(null)
    setReasonTouched(false)
    setClassification(closeOverdue ? 'FINAL' : 'CORRECTABLE')
    setFinalReason('')
    setDialog(next)
  }

  const conflict = decisionError?.key === 'console.verification.decision.conflict'
  const referenceShowsError = Boolean(referenceTouched && referenceProblem)
  const size = evidence
    ? new Intl.NumberFormat(localeFor(i18n.language), {
        style: 'unit',
        unit: 'kilobyte',
        maximumFractionDigits: 0,
      }).format(Math.max(1, Math.round(evidence.sizeBytes / 1024)))
    : ''

  return (
    <ReviewCard title={t('console.verification.decision.title')}>
      {closeOverdue ? (
        <>
          <p className="pb-3 text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('console.verification.correctionOverdue.closeIntro')}{' '}
            {t('console.verification.correctionOverdue.refund')}
          </p>
          <ConsoleButton
            type="button"
            size="md"
            variant="secondary"
            fullWidth
            onClick={() => openDialog('reject')}
          >
            {t('console.verification.correctionOverdue.close')}
          </ConsoleButton>
        </>
      ) : (
        <>
          <p className="pb-3 text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('console.verification.decision.intro')}
          </p>

          <FileDropzone
            accept={EVIDENCE_ACCEPT}
            maxBytes={EVIDENCE_MAX_BYTES}
            onFiles={(files) => void upload(files[0])}
            onReject={(problem) =>
              setUploadError({
                key:
                  problem === 'size'
                    ? 'console.verification.decision.tooLargeLocal'
                    : 'console.verification.decision.wrongType',
              })
            }
          >
            {({ dragging }) => (
              <span
                aria-busy={uploading || undefined}
                className={[
                  'flex min-h-[129px] flex-col items-center justify-center gap-2 rounded-sm border border-dashed px-4 py-6 text-center transition-colors',
                  dragging ? 'border-primary-700 bg-primary-25' : 'border-primary-300 bg-surface-tab-bar',
                ].join(' ')}
              >
                <img src={uploadIcon} alt="" className="size-6" />
                <span className="text-sm font-semibold text-text-secondary">
                  {uploading
                    ? t('console.verification.decision.uploading')
                    : evidence
                      ? t('console.verification.decision.replace')
                      : t('console.verification.decision.upload')}
                </span>
                <span className="text-sm font-medium text-text-quaternary">
                  {t('console.verification.decision.uploadHint')}
                </span>
              </span>
            )}
          </FileDropzone>

          {uploadError ? (
            <p role="alert" className="mt-2 text-sm font-medium text-danger-700">
              {t(uploadError.key, uploadError.values)}
            </p>
          ) : null}

          {evidence ? (
            <div className="mt-2">
              <ReviewLine
                label={t('console.verification.decision.evidenceFile')}
                value={evidence.filename ?? t('console.verification.detail.none')}
              />
              <ReviewLine label={t('console.verification.decision.evidenceSize')} value={size} />
            </div>
          ) : null}
          {evidenceStale ? (
            <p role="alert" className="mt-2 text-sm font-medium text-danger-700">
              {t('console.verification.decision.staleEvidence')}
            </p>
          ) : null}

          <div className="mt-4">
            <Input
              bordered
              requiredMark
              name="attestationReference"
              label={t('console.verification.decision.reference')}
              // The field's own hint prints at 10 px; this one is drawn below at the 12 px helper size
              // and stays tied to the field for screen readers. An error replaces it, as before.
              aria-describedby={referenceShowsError ? undefined : referenceHintId}
              value={reference}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setReference(event.target.value)}
              onBlur={() => setReferenceTouched(true)}
              error={
                referenceTouched && referenceProblem
                  ? t(
                      referenceProblem === 'required'
                        ? 'console.verification.decision.referenceRequired'
                        : 'console.verification.decision.referenceInvalid',
                    )
                  : undefined
              }
            />
            {referenceShowsError ? null : (
              <p
                id={referenceHintId}
                className="mt-1.5 text-xs font-medium leading-[1.4] text-text-tertiary"
              >
                {t('console.verification.decision.referenceHint')}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            <ConsoleButton type="button" size="md" fullWidth disabled={!canVerify} onClick={() => openDialog('verify')}>
              {t('console.verification.decision.verify')}
            </ConsoleButton>
            <ConsoleButton
              type="button"
              size="md"
              variant="secondary"
              fullWidth
              disabled={uploading}
              onClick={() => openDialog('reject')}
            >
              {t('console.verification.decision.reject')}
            </ConsoleButton>
          </div>
        </>
      )}

      <Modal
        open={dialog !== null}
        onClose={() => {
          if (!deciding) setDialog(null)
        }}
        title={
          dialog === 'verify'
            ? t('console.verification.decision.verifyTitle', { name: company.tenantName })
            : t('console.verification.decision.rejectTitle')
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            {conflict ? (
              <ConsoleButton type="button" size="md" variant="secondary" onClick={() => onDecided(null)}>
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
            <ConsoleButton type="button" size="md" disabled={deciding || conflict} onClick={() => void decide()}>
              {dialog === 'verify'
                ? deciding
                  ? t('console.verification.decision.verifying')
                  : t('console.verification.decision.verifyConfirm')
                : deciding
                  ? t('console.verification.decision.rejecting')
                  : t('console.verification.decision.rejectConfirm')}
            </ConsoleButton>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {dialog === 'verify' && evidence ? (
            <div>
              <ReviewLine
                label={t('console.verification.decision.evidenceFile')}
                value={evidence.filename ?? t('console.verification.detail.none')}
              />
              <ReviewLine label={t('console.verification.decision.reference')} value={reference.trim()} />
            </div>
          ) : null}
          {dialog === 'reject' ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">
                {t('console.verification.decision.reason')}
              </span>
              <Select
                value={reason}
                ariaLabel={t('console.verification.decision.reason')}
                placeholder={t('console.verification.decision.reasonPlaceholder')}
                onChange={(value) => {
                  setReason(value as RejectionReason)
                  setReasonTouched(false)
                }}
                options={REJECTION_REASONS.map((code) => ({
                  value: code,
                  label: t(`console.verification.detail.reason.${code}`),
                }))}
              />
              {reasonTouched && reason === '' ? (
                <p role="alert" className="text-sm font-medium text-danger-700">
                  {t('console.verification.decision.reasonRequired')}
                </p>
              ) : null}
              {closeOverdue ? null : (
                <fieldset className="mt-2 flex flex-col gap-2">
                  <legend className="text-sm font-medium text-text-secondary">
                    {t('console.verification.decision.classification')}
                  </legend>
                  {(['CORRECTABLE', 'FINAL'] as const).map((option) => (
                    <label key={option} className="flex items-start gap-2 text-sm text-text-secondary">
                      <input
                        type="radio"
                        name="rejection-classification"
                        value={option}
                        checked={classification === option}
                        onChange={() => setClassification(option)}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-semibold text-text-primary">
                          {t(`console.verification.decision.classificationOption.${option}.title`)}
                        </span>
                        <span className="block text-xs font-medium text-text-tertiary">
                          {t(`console.verification.decision.classificationOption.${option}.body`)}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {classification === 'FINAL' ? (
                <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
                  {t('console.verification.decision.finalReason')}
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={finalReason}
                    onChange={(event) => setFinalReason(event.target.value)}
                    className="rounded-sm border border-border-subtle bg-white px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
              {reasonTouched && classification === 'FINAL' && !finalReason.trim() ? (
                <p role="alert" className="text-sm font-medium text-danger-700">
                  {t('console.verification.decision.finalReasonRequired')}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {dialog === 'verify'
              ? t('console.verification.decision.verifyBody')
              : classification === 'FINAL'
                ? t('console.verification.decision.rejectBodyFinal')
                : t('console.verification.decision.rejectBody')}
          </p>
          {dialog === 'verify' && paymentUnconfirmed ? (
            <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('console.verification.decision.paymentNotConfirmed')}
            </p>
          ) : null}
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
