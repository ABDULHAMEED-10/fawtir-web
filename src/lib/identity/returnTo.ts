/**
 * Where a sign-in goes back to when it was started from inside the app: a cashier who used Switch
 * user on the till goes back to the till (Abdul, 28 Oct 2026: "A cashier switching at the counter
 * wants to keep selling"). Carried as `?next=` on the sign-in screens, so it survives the code
 * step and a reload of the password screen.
 *
 * Only a path inside this app is taken: anything with a scheme, a host (`//evil.example`,
 * `/\evil.example`), a control character, or one of the sign-in screens themselves is ignored and
 * the usual landing applies.
 */

export const RETURN_PARAM = 'next'

export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 512) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null
  try {
    const base = 'https://fawtir.invalid'
    const url = new URL(raw, base)
    if (url.origin !== base) return null
    if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

/** The safe return path a sign-in screen was opened with, from its `location.search`. */
export function returnPathFrom(search: string): string | null {
  return safeReturnPath(new URLSearchParams(search).get(RETURN_PARAM))
}

/** `route` carrying the return path on to the next sign-in screen; unchanged without one. */
export function withReturnPath(route: string, next: string | null): string {
  const safe = safeReturnPath(next)
  return safe ? `${route}?${RETURN_PARAM}=${encodeURIComponent(safe)}` : route
}
