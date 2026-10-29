import type { PosSlipFields, PosSlipReadingDto } from '../api/pos/pos'

/**
 * Scan slip (Abdul, 27 Oct 2026): the bank machine's slip, photographed or uploaded on a card
 * payment, kept as proof and read for its approval code, RRN, card ending, card type and amount.
 * Optional; it never blocks a sale. A photo is shrunk on the device to about 1600 px before it
 * is sent, since the server only shrinks large JPEG and PNG for reading.
 */

const LONGEST = 1600

/** Below this the cashier is asked to check the value (the API's suggestion). */
export const CONFIDENT = 0.8

export async function shrinkSlip(file: File): Promise<{ blob: Blob; name: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') {
    return { blob: file, name: file.name }
  }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, LONGEST / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.type !== 'image/webp') return { blob: file, name: file.name }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    return blob
      ? { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' }
      : { blob: file, name: file.name }
  } catch {
    return { blob: file, name: file.name }
  }
}

export type SlipReading = {
  /** True when nothing could be read (`READ_FAILED`, or `READING_UNAVAILABLE` until the key is in). */
  unread: boolean
  fields: PosSlipFields
  /** The fields read with less than {@link CONFIDENT}, for the cashier to check. */
  unsure: (keyof PosSlipFields)[]
}

export function slipReading(reading: PosSlipReadingDto): SlipReading {
  const fields: PosSlipFields = {}
  const unsure: (keyof PosSlipFields)[] = []
  const take = (name: 'authCode' | 'rrn' | 'cardLast4' | 'cardType') => {
    const field = reading[name]
    if (field?.value) {
      fields[name] = field.value
      if (field.confidence < CONFIDENT) unsure.push(name)
    }
  }
  take('authCode')
  take('rrn')
  take('cardLast4')
  take('cardType')
  if (reading.amount?.value) {
    const amount = Number(reading.amount.value)
    if (Number.isFinite(amount)) {
      fields.amount = amount
      if (reading.amount.confidence < CONFIDENT) unsure.push('amount')
    }
  }
  return { unread: reading.reason != null || Object.keys(fields).length === 0, fields, unsure }
}
