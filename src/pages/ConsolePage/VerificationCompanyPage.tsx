import { useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead, type ConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import {
  REVIEW_PERMISSION,
  VERIFICATION_ROUTE,
  companyPath,
  historyPath,
  isCompanyId,
  isSubmitted,
  queueReturnOf,
  type CompanyDetail,
  type HistoryEntry,
  type VerificationStatus,
} from '../../lib/console/companyVerification'
import { countryName, formatDay, formatMoment, localeFor } from '../../lib/console/format'
import { peekEntitlements } from '../../lib/identity/entitlements'
import { DecisionPanel } from './verification/DecisionPanel'
import { ReviewCard, ReviewLine } from './verification/ReviewCard'
import { VerificationStatusPill } from './verification/VerificationStatusPill'

/**
 * One registration as a reviewer reads it: the company as submitted, where verification stands,
 * the account behind it, the recorded history, and — while it waits for review — the decision.
 * Composed of the cards and label/value lines the Operations screen already draws.
 */
export function VerificationCompanyPage() {
  return (
    <ConsoleShell requires={REVIEW_PERMISSION}>
      <CompanyReview />
    </ConsoleShell>
  )
}

function CompanyReview() {
  const { t } = useTranslation()
  const { companyId } = useParams()
  const location = useLocation()
  const valid = isCompanyId(companyId)
  // Both reads start in the same commit, so they travel in parallel; neither needs the other.
  const detail = useConsoleRead<CompanyDetail>(valid ? companyPath(companyId) : null)
  const history = useConsoleRead<HistoryEntry[]>(valid ? historyPath(companyId) : null)
  const backTo = `${VERIFICATION_ROUTE}${queueReturnOf(location.state)}`
  const [decided, setDecided] = useState<VerificationStatus | null>(null)

  // After a decision, or a reload the reviewer asked for, the company is read again rather than
  // patched locally: the decision moved the status, the tenant and the history together, and only
  // the backend's own answer shows all three consistently.
  const refresh = (outcome: VerificationStatus | null) => {
    setDecided(outcome)
    detail.retry()
    history.retry()
  }

  let body: ReactNode
  if (!valid || isNotFound(detail.read)) {
    body = <ConsoleNotice body={t('console.verification.detail.notFound')} />
  } else if (detail.read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.verification.detail.loading')} />
  } else if (detail.read.status === 'failed') {
    body = <ConsoleReadFailure error={detail.read.error} retry={detail.retry} />
  } else {
    body = (
      <CompanyView
        company={detail.read.data}
        history={history.read}
        retryHistory={history.retry}
        decided={decided}
        onDecided={refresh}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <ConsoleBreadcrumbs
        items={[
          { labelKey: 'console.nav.verification', to: backTo },
          ...(detail.read.status === 'ready' ? [{ label: detail.read.data.tenantName }] : []),
        ]}
      />
      {body}
    </div>
  )
}

function isNotFound(read: ConsoleRead<unknown>): boolean {
  return read.status === 'failed' && read.error instanceof ApiError && read.error.status === 404
}

function CompanyView({
  company,
  history,
  retryHistory,
  decided,
  onDecided,
}: {
  company: CompanyDetail
  history: ConsoleRead<HistoryEntry[]>
  retryHistory: () => void
  /** The decision just taken on this screen, to confirm it. */
  decided: VerificationStatus | null
  onDecided: (outcome: VerificationStatus | null) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const none = t('console.verification.detail.none')
  const yesNo = (value: boolean) => t(value ? 'common.yes' : 'common.no')
  const moment = (iso: string | null) => (iso ? formatMoment(iso, language) : none)
  const submitted = isSubmitted(company)

  return (
    <>
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {company.tenantName}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <VerificationStatusPill status={company.verificationStatus} submitted={submitted} />
          <span className="text-sm font-medium text-text-quaternary">{company.tenantCode}</span>
        </div>
      </div>

      {submitted ? null : (
        <p className="rounded-md bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary">
          {t('console.verification.detail.notSubmitted')}
        </p>
      )}

      {decided === 'VERIFIED' || decided === 'REJECTED' ? (
        <p
          role="status"
          className="rounded-md bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary"
        >
          {t(
            decided === 'VERIFIED'
              ? 'console.verification.decision.verified'
              : 'console.verification.decision.rejected',
          )}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <ReviewCard title={t('console.verification.detail.section.company')}>
            <ReviewLine
              label={t('console.verification.detail.field.legalName')}
              value={company.legalName ?? none}
            />
            <ReviewLine
              label={t('console.verification.detail.field.code')}
              value={company.tenantCode}
            />
            <ReviewLine
              label={t('console.verification.detail.field.taxNumber')}
              value={company.taxNumber ?? none}
            />
            <ReviewLine
              label={t('console.verification.detail.field.crNumber')}
              value={company.commercialRegistrationNumber ?? none}
            />
            <ReviewLine
              label={t('console.verification.detail.field.country')}
              value={company.country ? countryName(company.country, language) : none}
            />
            <ReviewLine
              label={t('console.verification.detail.field.address')}
              value={company.registeredAddress ?? none}
            />
            <ReviewLine
              label={t('console.verification.detail.field.timezone')}
              value={company.timezone ?? none}
            />
          </ReviewCard>

          <ReviewCard title={t('console.verification.detail.section.account')}>
            <ReviewLine
              label={t('console.verification.detail.field.tenantStatus')}
              value={
                company.tenantStatus
                  ? t(`console.verification.detail.tenantStatus.${company.tenantStatus}`)
                  : none
              }
            />
            <ReviewLine
              label={t('console.verification.detail.field.identityStatus')}
              value={
                company.identityStatus
                  ? t(`console.verification.detail.identityStatus.${company.identityStatus}`)
                  : none
              }
            />
            <ReviewLine
              label={t('console.verification.detail.field.registered')}
              value={formatDay(company.createdAt, language)}
            />
            {company.signupAdministrator ? (
              <>
                <ReviewLine
                  label={t('console.verification.detail.field.signIn')}
                  value={yesNo(company.signupAdministrator.signInEnabled)}
                />
                <ReviewLine
                  label={t('console.verification.detail.field.emailVerified')}
                  value={yesNo(company.signupAdministrator.emailVerified)}
                />
              </>
            ) : (
              <p className="py-2.5 text-sm font-medium text-text-tertiary">
                {t('console.verification.detail.noRegistrant')}
              </p>
            )}
          </ReviewCard>
        </div>

        <div className="flex w-full flex-col gap-4 xl:w-[380px] xl:shrink-0">
          {submitted && company.verificationStatus === 'PENDING_VERIFICATION' ? (
            <DecisionPanel
              // Remounted per revision, so evidence filed against an older profile never carries over.
              key={`${company.tenantId}:${company.expectedRevision}`}
              company={company}
              operatorId={peekEntitlements()?.userId ?? null}
              onDecided={onDecided}
            />
          ) : null}
          <ReviewCard title={t('console.verification.detail.section.verification')}>
            <ReviewLine
              label={t('console.verification.detail.field.status')}
              value={
                <VerificationStatusPill status={company.verificationStatus} submitted={submitted} />
              }
            />
            <ReviewLine
              label={t('console.verification.detail.field.method')}
              value={
                company.verificationMethod
                  ? t(`console.verification.detail.method.${company.verificationMethod}`)
                  : none
              }
            />
            {company.rejectionReason ? (
              <ReviewLine
                label={t('console.verification.detail.field.rejectionReason')}
                value={t(`console.verification.detail.reason.${company.rejectionReason}`)}
              />
            ) : null}
            <ReviewLine
              label={t('console.verification.detail.field.submitted')}
              value={moment(company.submittedAt)}
            />
            <ReviewLine
              label={t('console.verification.detail.field.decided')}
              value={moment(company.decidedAt)}
            />
            <ReviewLine
              label={t('console.verification.detail.field.revision')}
              value={new Intl.NumberFormat(localeFor(language)).format(company.profileRevision)}
            />
            <ReviewLine
              label={t('console.verification.detail.field.evidence')}
              value={yesNo(company.evidenceRecorded)}
            />
            <ReviewLine
              label={t('console.verification.detail.field.attestation')}
              value={company.attestationReference ?? none}
            />
          </ReviewCard>

          <ReviewCard title={t('console.verification.detail.section.history')}>
            <History read={history} retry={retryHistory} />
          </ReviewCard>
        </div>
      </div>
    </>
  )
}

function History({ read, retry }: { read: ConsoleRead<HistoryEntry[]>; retry: () => void }) {
  const { t, i18n } = useTranslation()
  if (read.status === 'loading') {
    return <ConsoleNotice busy body={t('console.verification.detail.loading')} />
  }
  if (read.status === 'failed') return <ConsoleReadFailure error={read.error} retry={retry} />
  if (read.data.length === 0) {
    return (
      <p className="py-2.5 text-sm font-medium text-text-tertiary">
        {t('console.verification.detail.historyEmpty')}
      </p>
    )
  }
  const number = new Intl.NumberFormat(localeFor(i18n.language))
  return (
    <ol>
      {read.data.map((entry, index) => (
        <li
          key={`${entry.occurredAt}-${entry.event}-${index}`}
          className="border-b border-border-subtle py-2.5 last:border-b-0"
        >
          <p className="text-sm font-semibold text-text-primary">
            {t(`console.verification.detail.event.${entry.event}`)}
          </p>
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            {formatMoment(entry.occurredAt, i18n.language)} ·{' '}
            {t('console.verification.detail.revision', {
              revision: number.format(entry.profileRevision),
            })}
          </p>
          {entry.rejectionReason ? (
            <p className="mt-1 text-xs font-medium text-danger-700">
              {t(`console.verification.detail.reason.${entry.rejectionReason}`)}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
