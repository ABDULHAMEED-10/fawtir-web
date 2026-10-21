import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api'
import { describeApiFailure } from './apiFailure'
import { formatDate } from './format'

/**
 * Our own sentence for each refusal switching a person or a branch off or back on can meet
 * (Business Rules US-1, US-2, US-3, BR-2, BR-4, OW-1), by the problem `type` slug. The server's
 * English `detail` never reaches the screen. Null for anything else, so a screen falls back to
 * `describeApiFailure`.
 */
const KEYS: Record<string, string> = {
  'head-branch-always-on': 'removal.refusal.headBranch',
  'last-administrator': 'removal.refusal.lastAdministrator',
  'owner-protected': 'removal.refusal.ownerProtected',
  'own-account-refused': 'removal.refusal.ownAccount',
  'extra-place-required': 'removal.refusal.noPlace',
  'plan-limit-reached': 'removal.refusal.planLimit',
  'account-already-active': 'removal.refusal.alreadyActive',
}

export function removalRefusalKey(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  return error.problemType ? (KEYS[error.problemType] ?? null) : null
}

/** A refusal in our words, else the general sentence for the failure. */
export function useRemovalFailureText(): (error: unknown) => string {
  const { t } = useTranslation()
  return (error) => {
    const refusal = removalRefusalKey(error)
    if (refusal) return t(refusal)
    const message = describeApiFailure(error)
    return t(message.key, message.values)
  }
}

/**
 * The sentence about the paid place (decided 21 Oct 2026, option (a)): it stays until the next
 * renewal with no refund, and can be given to someone else until then. Dated when the subscription
 * says when it renews.
 */
export function placeSentence(
  t: TFunction,
  key: 'removal.user' | 'removal.branch',
  kind: 'place' | 'done',
  renewsOn: string | null,
  language: string,
  name: string,
): string {
  return renewsOn
    ? t(`${key}.${kind}Dated`, { name, date: formatDate(renewsOn, language) })
    : t(`${key}.${kind}Undated`, { name })
}
