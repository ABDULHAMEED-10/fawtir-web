/**
 * Password strength scoring, 0–4.
 *
 * Kept out of the component file so `PasswordStrength.tsx` exports only a component and
 * React fast refresh keeps working.
 */
export function getPasswordStrength(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 6) score += 1
  if (password.length >= 10) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1
  return Math.min(score, 4)
}
