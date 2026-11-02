/**
 * The signed envelope as a reviewer sees it. From fix/b39-off cf49f0447 the server itself sends the
 * buyer's identifier and contact as `[masked]` (C3); an earlier build sent them whole. The screen
 * keeps the last four characters of a value that still arrives whole, and shows the server's
 * marker as it is, so the two never compound into a half-masked marker.
 */
const MASKED = new Set(['identifierValue', 'contact'])
const SERVER_MASK = '[masked]'

function mask(text: string): string {
  if (text === SERVER_MASK) return text
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
