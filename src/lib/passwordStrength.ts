import { passwordCriteria } from './validation'

/**
 * Password strength scoring, 0–4: one point per password-policy criterion met, so a full
 * meter means the password passes the policy.
 *
 * Kept out of the component file so `PasswordStrength.tsx` exports only a component and
 * React fast refresh keeps working.
 */
export function getPasswordStrength(password: string): number {
  if (!password) return 0
  return Object.values(passwordCriteria(password)).filter(Boolean).length
}
