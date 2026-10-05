/**
 * An ISO-8601 duration as the server stores a collection cadence (`PT5M`, `PT1H`, `P1D`), split
 * into the units a sentence names. The server keeps the code; people read "every 5 minutes".
 */
export type CadenceUnit = 'days' | 'hours' | 'minutes' | 'seconds'
export type CadencePart = { unit: CadenceUnit; count: number }

const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/

/** The non-zero parts, largest first; null for anything that is not a plain day-to-second duration. */
export function cadenceParts(iso: string): CadencePart[] | null {
  const match = ISO_DURATION.exec(iso.trim().toUpperCase())
  if (!match || iso.trim().toUpperCase() === 'P' || /T$/i.test(iso.trim())) return null
  const units: CadenceUnit[] = ['days', 'hours', 'minutes', 'seconds']
  const parts = units
    .map((unit, index) => ({ unit, count: Number(match[index + 1] ?? 0) }))
    .filter((part) => part.count > 0)
  return parts.length > 0 ? parts : null
}
