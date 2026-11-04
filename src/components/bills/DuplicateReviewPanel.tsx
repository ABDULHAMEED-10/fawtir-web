import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { PossibleDuplicateDto } from '../../api/expenditure/billIntake'
import {
  MAX_OVERRIDE_REASON,
  mayDeclareDifferent,
  overrideOf,
  reviewMode,
  type DuplicateOverride,
  type DuplicateReview,
} from '../../lib/billDuplicateOverride'
import { useSession } from '../../lib/session/session'
import warnIcon from '../../assets/bills/match-warn.svg'

/**
 * The possible-duplicate warning every bill and note intake shows. Each screen keeps its own
 * sentence and button styles.
 *
 * A reason is asked for one bill as for many (owner approval, batch 43 round 18, "Frontend
 * Option 1"): the reasonless single field is no longer sent. Only an invoice approver is offered
 * "It's a different bill"; anyone else sees it disabled with why, and can submit the same listing
 * for review: the server records it held for an approver when the bill on file is the same
 * supplier's copy, and refuses it by name (`BILL_INTAKE_OVERRIDE_APPROVER_REQUIRED`) otherwise.
 */
export function DuplicateReviewPanel({
  review,
  onChange,
  onDifferent,
  busy,
  sentence,
  linkClassName,
  buttonClassName,
}: {
  review: DuplicateReview
  onChange: (review: DuplicateReview) => void
  onDifferent: (override: DuplicateOverride) => void
  busy: boolean
  sentence: (bill: PossibleDuplicateDto) => ReactNode
  linkClassName: string
  buttonClassName: string
}) {
  const { t } = useTranslation()
  const approver = mayDeclareDifferent(useSession())
  const mode = reviewMode(review)
  const single = mode === 'single'
  const decidable = single || mode === 'many'

  const different = () => {
    const override = overrideOf(review)
    if ('problem' in override) onChange({ ...review, problem: override.problem })
    else onDifferent(override)
  }

  // Not stored on the review: they hold for as long as the review does, whatever is typed.
  const standing =
    mode === 'unsupported'
      ? 'billIntake.duplicate.cannotOverrideMany'
      : mode === 'tooMany'
        ? 'billIntake.duplicate.tooMany'
        : review.problem

  return (
    <section role="alert" className="rounded-md border border-[#d8c9a8] bg-[#faf5ea] p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
        <img src={warnIcon} alt="" className="size-5" />
        {single
          ? t('billIntake.duplicate.title')
          : t('billIntake.duplicate.titleMany', { count: review.seen.length })}
      </h2>
      {single ? (
        <>
          <p className="mt-2 text-sm font-medium leading-[1.5] text-text-secondary">
            {sentence(review.seen[0])}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to={`/expenditure/bills/${review.seen[0].billId}`} className={linkClassName}>
              {t('billIntake.duplicate.open')}
            </Link>
          </div>
        </>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {review.seen.map((bill) => (
            <li key={bill.billId} className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium leading-[1.5] text-text-secondary">
                {sentence(bill)}
              </p>
              <Link to={`/expenditure/bills/${bill.billId}`} className={linkClassName}>
                {t('billIntake.duplicate.open')}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {decidable ? (
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">
            {t(single ? 'billIntake.duplicate.reasonLabelSingle' : 'billIntake.duplicate.reasonLabel')}
          </span>
          <textarea
            value={review.reason}
            onChange={(event) => onChange({ ...review, reason: event.target.value, problem: null })}
            maxLength={MAX_OVERRIDE_REASON}
            rows={3}
            aria-invalid={review.problem !== null}
            className="mt-1.5 w-full rounded-sm border border-border-subtle p-3 text-sm text-text-primary outline-none focus:border-primary-500"
          />
        </label>
      ) : null}
      {standing ? (
        <p className="mt-2 text-sm font-medium text-warning-700">{t(standing)}</p>
      ) : null}
      {decidable ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !approver}
            onClick={different}
            aria-describedby={approver ? undefined : 'duplicate-approver-only'}
            className={buttonClassName}
          >
            {t(single ? 'billIntake.duplicate.different' : 'billIntake.duplicate.differentAll')}
          </button>
          {approver ? null : (
            <button type="button" disabled={busy} onClick={different} className={buttonClassName}>
              {t('billIntake.duplicate.submitForReview')}
            </button>
          )}
        </div>
      ) : null}
      {decidable && !approver ? (
        <p id="duplicate-approver-only" className="mt-2 text-sm font-medium text-text-secondary">
          {t('billIntake.duplicate.approverOnly')}
        </p>
      ) : null}
    </section>
  )
}
