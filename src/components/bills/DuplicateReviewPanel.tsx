import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { PossibleDuplicateDto } from '../../api/expenditure/billIntake'
import {
  MAX_OVERRIDE_REASON,
  overrideOf,
  reviewMode,
  type DuplicateOverride,
  type DuplicateReview,
} from '../../lib/billDuplicateOverride'
import warnIcon from '../../assets/bills/match-warn.svg'

/**
 * The possible-duplicate warning every bill and note intake shows. With one bill on file it is the
 * warning those screens always drew, element for element; with more, each is listed in the same
 * sentence and a reason is asked for, because the server records it with the list (owner, 2026-10-31).
 * Each screen keeps its own sentence and button styles, so the single case does not change.
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
  const mode = reviewMode(review)

  const different = () => {
    const override = overrideOf(review)
    if ('problem' in override) onChange({ ...review, problem: override.problem })
    else onDifferent(override)
  }

  if (mode === 'single') {
    const bill = review.seen[0]
    return (
      <section role="alert" className="rounded-md border border-[#d8c9a8] bg-[#faf5ea] p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <img src={warnIcon} alt="" className="size-5" />
          {t('billIntake.duplicate.title')}
        </h2>
        <p className="mt-2 text-sm font-medium leading-[1.5] text-text-secondary">
          {sentence(bill)}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to={`/expenditure/bills/${bill.billId}`} className={linkClassName}>
            {t('billIntake.duplicate.open')}
          </Link>
          <button type="button" disabled={busy} onClick={different} className={buttonClassName}>
            {t('billIntake.duplicate.different')}
          </button>
        </div>
      </section>
    )
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
        {t('billIntake.duplicate.titleMany', { count: review.seen.length })}
      </h2>
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
      {mode === 'many' ? (
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">
            {t('billIntake.duplicate.reasonLabel')}
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
      {mode === 'many' ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={different} className={buttonClassName}>
            {t('billIntake.duplicate.differentAll')}
          </button>
        </div>
      ) : null}
    </section>
  )
}
