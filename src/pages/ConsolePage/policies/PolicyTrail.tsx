import { useTranslation } from 'react-i18next'
import { formatMoment } from '../../../lib/console/format'
import {
  policyTrail,
  shortActorId,
  type Actor,
  type BlockerVersionView,
} from '../../../lib/console/validationPolicies'

/**
 * Who took each step of a version, and when.
 *
 * This is the record the separation of duties is read from, so it shows every step taken so far.
 * It is display only: who may take the next step comes from the server's `allowedActions`, never
 * from comparing these names.
 */
export function PolicyTrail({
  version,
  currentUserId,
}: {
  version: BlockerVersionView
  /** The signed-in operator, to mark their own steps. */
  currentUserId: string | null
}) {
  const { t, i18n } = useTranslation()

  const person = (actor: Actor | null) => {
    if (actor === null) return t('console.policies.none')
    return (
      <>
        {actor.displayName ?? (
          // A name the server could not resolve is not replaced with a guess; a few characters of
          // the id are enough to tell two unnamed operators apart.
          <>
            {t('console.policies.actor.unnamed')}{' '}
            <span dir="ltr" className="font-mono">
              {shortActorId(actor.id)}
            </span>
          </>
        )}
        {currentUserId !== null && actor.id === currentUserId
          ? ` ${t('console.policies.actor.you')}`
          : ''}
      </>
    )
  }

  return (
    <ol>
      {policyTrail(version).map((entry) => (
        <li key={entry.step} className="border-b border-border-subtle py-2.5 last:border-b-0">
          <p className="text-sm font-semibold text-text-primary">
            {t(`console.policies.trail.${entry.step}`)}
          </p>
          <p className="mt-1 break-words text-xs font-medium text-text-quaternary">
            {/* Isolated from each other: a Latin name beside an Arabic date otherwise trades
                places with the date's own digits. */}
            <bdi>{person(entry.actor)}</bdi> · <bdi>{formatMoment(entry.at, i18n.language)}</bdi>
          </p>
        </li>
      ))}
    </ol>
  )
}
