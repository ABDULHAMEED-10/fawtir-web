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
  correctionOverdueSince,
  historyPath,
  isCompanyId,
  isCorrectionOverdue,
  isSubmitted,
  queueReturnOf,
  signupPaymentPath,
  type CompanyDetail,
  type HistoryEntry,
  type SignupPaymentReview,
  type VerificationStatus,
} from '../../lib/console/companyVerification'
import { countryName, localeFor } from '../../lib/console/format'
import { formatDate, formatInstant, formatInstantDay } from '../../lib/format'
import { peekEntitlements } from '../../lib/identity/entitlements'
import { DecisionPanel } from './verification/DecisionPanel'
import { ParticipantPanel } from './verification/ParticipantPanel'
import { SignupPaymentPanel } from './verification/SignupPaymentPanel'
import { ReviewCard, ReviewLine } from './verification/ReviewCard'
import { VerificationStatusPill } from './verification/VerificationStatusPill'
import { CONSOLE_H1, CONSOLE_PAGE } from '../../layouts/ConsoleShell/consoleStyle'

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
  // The payment sent with the application, once the company is known to have submitted one.
  const submittedCompany =
    valid && detail.read.status === 'ready' && isSubmitted(detail.read.data) ? companyId : null
  const payment = useConsoleRead<SignupPaymentReview>(
    submittedCompany ? signupPaymentPath(submittedCompany) : null,
  )
  const backTo = `${VERIFICATION_ROUTE}${queueReturnOf(location.state)}`
  const [decided, setDecided] = useState<VerificationStatus | null>(null)
  const [decidedFinal, setDecidedFinal] = useState(false)

  // After a decision, or a reload the reviewer asked for, the company is read again rather than
  // patched locally: the decision moved the status, the tenant and the history together, and only
  // the backend's own answer shows all three consistently.
  const refresh = (outcome: VerificationStatus | null, final = false) => {
    setDecided(outcome)
    setDecidedFinal(final)
    detail.retry()
    history.retry()
    payment.retry()
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
        payment={payment.read}
        retryPayment={payment.retry}
        decided={decided}
        decidedFinal={decidedFinal}
        onDecided={refresh}
      />
    )
  }

  return (
    <div className={CONSOLE_PAGE}>
      {/* A long company name ends in an ellipsis instead of pushing the trail onto three lines. */}
      <div className="min-w-0 [&_nav>span:last-child]:min-w-0 [&_nav>span:last-child]:max-w-full [&_nav>span:last-child>span]:min-w-0 [&_nav>span:last-child>span]:truncate">
        <ConsoleBreadcrumbs
          items={[
            { labelKey: 'console.nav.verification', to: backTo },
            ...(detail.read.status === 'ready' ? [{ label: detail.read.data.tenantName }] : []),
          ]}
        />
      </div>
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
  payment,
  retryPayment,
  decided,
  decidedFinal,
  onDecided,
}: {
  company: CompanyDetail
  history: ConsoleRead<HistoryEntry[]>
  retryHistory: () => void
  payment: ConsoleRead<SignupPaymentReview>
  retryPayment: () => void
  /** The decision just taken on this screen, to confirm it. */
  decided: VerificationStatus | null
  /** Whether that decision was a FINAL rejection, which closed the application. */
  decidedFinal: boolean
  onDecided: (outcome: VerificationStatus | null, final?: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const none = t('console.verification.detail.none')
  const yesNo = (value: boolean) => t(value ? 'common.yes' : 'common.no')
  const moment = (iso: string | null) => (iso ? formatInstant(iso, language) : none)
  const submitted = isSubmitted(company)
  const heldPayment = payment.status === 'ready' ? payment.data : null
  const overdue = submitted && isCorrectionOverdue(company)

  return (
    <>
      <div>
        <h1 className={`${CONSOLE_H1} max-md:text-2xl`}>
          {company.tenantName}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <VerificationStatusPill
            status={company.verificationStatus}
            submitted={submitted}
            size="header"
          />
          <bdi dir="ltr" className="min-w-0 text-sm font-medium text-text-quaternary [overflow-wrap:anywhere]">
            {company.tenantCode}
          </bdi>
        </div>
      </div>

      {submitted ? null : (
        <p className="rounded-sm bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary">
          {t('console.verification.detail.notSubmitted')}
        </p>
      )}

      {overdue && company.correctableUntil ? (
        <p className="rounded-sm bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary">
          {t('console.verification.correctionOverdue.since', {
            date: formatDate(correctionOverdueSince(company.correctableUntil), language),
          })}
        </p>
      ) : null}

      {decided === 'VERIFIED' || decided === 'REJECTED' ? (
        <p
          role="status"
          className="rounded-sm bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary"
        >
          {t(
            decided === 'VERIFIED'
              ? 'console.verification.decision.verified'
              : decidedFinal
                ? 'console.verification.decision.rejectedFinal'
                : 'console.verification.decision.rejected',
          )}
          {decided === 'REJECTED' && decidedFinal && heldPayment?.refundCase ? (
            <> {t('console.verification.decision.refundOpened')}</>
          ) : null}
        </p>
      ) : null}

      {/*
        History sits under Account on a wide screen, so the left column does not end in a tall
        empty band beside the decision cards. Below xl the two columns dissolve into one list and
        History goes back to the end, after the decision.
      */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4 max-xl:contents">
          <ReviewCard title={t('console.verification.detail.section.company')}>
            <ReviewLine
              label={t('console.verification.detail.field.legalName')}
              value={company.legalName ?? none}
            />
            <ReviewLine
              label={t('console.verification.detail.field.code')}
              value={<bdi dir="ltr">{company.tenantCode}</bdi>}
            />
            <ReviewLine
              label={t('console.verification.detail.field.taxNumber')}
              value={<bdi dir="ltr">{company.taxNumber ?? none}</bdi>}
            />
            <ReviewLine
              label={t('console.verification.detail.field.crNumber')}
              value={<bdi dir="ltr">{company.commercialRegistrationNumber ?? none}</bdi>}
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
              value={<bdi dir="ltr">{company.timezone ?? none}</bdi>}
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
              value={formatInstantDay(company.createdAt, language)}
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

          <div className="max-xl:order-last">
            <ReviewCard title={t('console.verification.detail.section.history')}>
              <History read={history} retry={retryHistory} />
            </ReviewCard>
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 xl:w-[380px] xl:shrink-0 max-xl:contents">
          {submitted && company.verificationStatus === 'PENDING_VERIFICATION' ? (
            <DecisionPanel
              // Remounted per revision, so evidence filed against an older profile never carries over.
              key={`${company.tenantId}:${company.expectedRevision}`}
              company={company}
              operatorId={peekEntitlements()?.userId ?? null}
              paymentStatus={heldPayment?.payment?.status ?? null}
              onDecided={onDecided}
            />
          ) : null}
          {overdue ? (
            <DecisionPanel
              key={`${company.tenantId}:${company.expectedRevision}:overdue`}
              company={company}
              operatorId={peekEntitlements()?.userId ?? null}
              paymentStatus={heldPayment?.payment?.status ?? null}
              onDecided={onDecided}
              closeOverdue
            />
          ) : null}
          {submitted ? <SignupPaymentPanel read={payment} retry={retryPayment} /> : null}
          {submitted ? (
            <ParticipantPanel company={company} operatorId={peekEntitlements()?.userId ?? null} />
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
              value={<bdi dir="ltr">{company.attestationReference ?? none}</bdi>}
            />
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
            {formatInstant(entry.occurredAt, i18n.language)} ·{' '}
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
