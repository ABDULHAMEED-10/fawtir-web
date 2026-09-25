import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { DebitCheck } from '../../lib/supplierDebitNotes'
import { withRial } from '../ui'
import okIcon from '../../assets/supplier-debit-notes/check-ok.svg'
import warnIcon from '../../assets/supplier-debit-notes/check-warn.svg'

/**
 * "Does this look right" (Figma 163:20010 and 163:20528).
 *
 * The automatic read of an incoming charge against what we already hold. It appears on both the
 * upload and the detail screen unchanged, which is why it lives here rather than in either page.
 */

/**
 * Turns the document references inside a check's sentence into links.
 *
 * The sentences are translated as whole sentences, so the references are found by name rather
 * than split into separate keys: a translator moving "GCL-2301" within the sentence keeps the
 * link working, and one that drops it simply loses the link rather than breaking the text.
 */
function withRefs(text: string, refs: DebitCheck['refs']) {
  if (!refs?.length) return withRial(text)

  const pattern = new RegExp(`(${refs.map((ref) => ref.token).join('|')})`, 'g')
  return text.split(pattern).map((part, index) => {
    const ref = refs.find((candidate) => candidate.token === part)
    return ref ? (
      <Link key={`${part}-${index}`} to={ref.to} className="text-primary-700 hover:underline">
        {part}
      </Link>
    ) : (
      <Fragment key={`t-${index}`}>{withRial(part)}</Fragment>
    )
  })
}

export function DebitChecks({
  checks,
  fineLabel,
  checkLabel,
  summaryTitle,
  summaryBody,
}: {
  checks: DebitCheck[]
  fineLabel: string
  checkLabel: string
  /** The bold lead of the closing banner, e.g. "Two reasons to push back." */
  summaryTitle: string
  summaryBody: string
}) {
  const { t } = useTranslation()
  const worries = checks.some((check) => check.verdict === 'check')

  return (
    <>
      <ul className="mt-3 flex flex-col">
        {checks.map((check, index) => {
          const fine = check.verdict === 'fine'
          return (
            <li
              key={check.id}
              className={[
                'flex items-start gap-3 py-3.5',
                index < checks.length - 1 ? 'border-b border-surface-background' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                  fine ? 'bg-success-100' : 'bg-pending-100',
                ].join(' ')}
              >
                <img src={fine ? okIcon : warnIcon} alt="" className="size-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                  {t(check.titleKey, check.values)}
                </p>
                <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                  {withRefs(t(check.detailKey, check.values), check.refs)}
                </p>
              </div>
              <span
                className={[
                  'shrink-0 text-[11px] font-semibold uppercase tracking-[0.6px]',
                  fine ? 'text-text-quaternary' : 'text-pending-500',
                ].join(' ')}
              >
                {fine ? fineLabel : checkLabel}
              </span>
            </li>
          )
        })}
      </ul>

      <p
        className={[
          'mt-3 flex items-start gap-2 rounded-sm p-3.5 text-xs font-medium leading-[1.5]',
          worries ? 'bg-pending-100 text-pending-500' : 'bg-success-100 text-success-700',
        ].join(' ')}
      >
        <img src={worries ? warnIcon : okIcon} alt="" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <span
            className={['font-semibold', worries ? 'text-pending-700' : 'text-success-700'].join(
              ' ',
            )}
          >
            {summaryTitle}
          </span>{' '}
          {withRial(summaryBody)}
        </span>
      </p>
    </>
  )
}
