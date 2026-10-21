import { useTranslation } from 'react-i18next'
import { ApiError } from '../api'
import { describeApiFailure } from './apiFailure'

/**
 * Our own sentence for each refusal switching a person or a branch off or back on can meet
 * (Business Rules US-1, US-2, US-3, BR-2, BR-4, OW-1), by the problem `type` slug. The server's
 * English `detail` never reaches the screen. Null for anything else, so a screen falls back to
 * `describeApiFailure`.
 */
const KEYS: Record<string, string> = {
  'scheduled-removal-not-open': 'removal.refusal.notOpen',
  'scheduled-removal-state-conflict': 'removal.refusal.stateConflict',
  'head-branch-always-on': 'removal.refusal.headBranch',
  'last-administrator': 'removal.refusal.lastAdministrator',
  'owner-protected': 'removal.refusal.ownerProtected',
  'own-account-refused': 'removal.refusal.ownAccount',
  'extra-place-required': 'removal.refusal.noPlace',
  'plan-limit-reached': 'removal.refusal.planLimit',
  'subscription-change-blocked-by-payment': 'removal.refusal.paymentBeingChecked',
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
