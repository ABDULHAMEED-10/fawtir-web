import { useTranslation } from 'react-i18next'
import type { FormMessage } from '../../../lib/identity/errors'

/**
 * The id support needs to find a refused request. Left to right in either language: it is an
 * opaque token, and mirrored punctuation would make it unquotable.
 */
export function ProblemReference({ id }: { id: string | null }) {
  const { t } = useTranslation()
  if (!id) return null
  return (
    <p className="mt-1 text-xs font-medium text-text-quaternary">
      {t('console.policies.reference')}{' '}
      <span dir="ltr" className="font-mono [overflow-wrap:anywhere]">
        {id}
      </span>
    </p>
  )
}

/** A refusal as the reader sees it: the localized meaning, and the reference to quote. */
export function PolicyFailureNotice({
  failure,
  card = false,
}: {
  failure: { message: FormMessage; reference: string | null }
  /** Drawn as its own card on the page, rather than as a line inside a dialog or a form. */
  card?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div role="alert" className={card ? 'rounded-md bg-surface-card p-5' : ''}>
      <p className="text-sm font-medium leading-[1.6] text-danger-700">
        {t(failure.message.key, failure.message.values)}
      </p>
      <ProblemReference id={failure.reference} />
    </div>
  )
}
