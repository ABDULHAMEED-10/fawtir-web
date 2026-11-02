/**
 * The signed envelope as a reviewer sees it. The server shows the payload whole unless it held a
 * card number (C3); the buyer's identifier and contact are personal data the decision on who made
 * the sale does not turn on, so the screen keeps their last four characters only. The server's
 * `payloadSha256` still covers the whole payload.
 */
const MASKED = new Set(['identifierValue', 'contact'])

function mask(text: string): string {
  return text.length <= 4 ? '••••' : `••••${text.slice(-4)}`
}

export function maskedPayload(value: unknown, key: string | null = null): unknown {
  if (typeof value === 'string') return key !== null && MASKED.has(key) ? mask(value) : value
  if (Array.isArray(value)) return value.map((item) => maskedPayload(item, null))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([name, member]) => [
        name,
        maskedPayload(member, name),
      ]),
    )
  }
  return value
}
