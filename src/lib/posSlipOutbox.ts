import { ApiError } from '../api'
import { attachPosSlip, readPosSlip, uploadPosSlip, type PosSlipFields } from '../api/pos/pos'
import { slipReading } from './posSlip'
import { posVault } from './posVault'

/**
 * Scan slip on a till that is offline (Abdul, 27 Oct 2026): the shrunk photo is kept with the
 * sale and uploaded once the sale is filed, `POST /v1/pos/slips` then
 * `PUT /v1/pos/sales/{saleId}/payments/{position}/slip`. It is read then, never at the counter,
 * and only what was read with confidence goes with it; the fields the sale carries stand
 * otherwise. The photo is removed from the device once attached, or once the server says it can
 * never be (a refusal other than sign-in, a lapse or a server fault).
 */

/** The upload's own limit: a larger file would be refused, so it is not kept. */
export const MAX_SLIP_BYTES = 10 * 1024 * 1024
/** All the photos one device keeps waiting, at most. */
export const MAX_HELD_BYTES = 50 * 1024 * 1024

/** A photo taken offline, for the payment it proves (`position`, 1, 2 ... as sent). */
export type SlipPhoto = { position: number; blob: Blob; name: string }

type Held = SlipPhoto & { saleKey: string; tillId: string; fileId: string | null }

/** Sales filed whose photos still wait: no personal data, so localStorage. */
type Due = { saleKey: string; saleId: string; tillId: string }

const DUE_KEY = 'fawtir.pos.slipsDue'
const idOf = (saleKey: string, position: number) => `${saleKey}#${position}`

function readDue(): Due[] {
  try {
    return JSON.parse(window.localStorage.getItem(DUE_KEY) ?? '[]') as Due[]
  } catch {
    return []
  }
}

function writeDue(due: Due[]) {
  try {
    if (due.length) window.localStorage.setItem(DUE_KEY, JSON.stringify(due))
    else window.localStorage.removeItem(DUE_KEY)
  } catch {
    // Held for this tab only.
  }
}

async function heldFor(saleKey: string): Promise<Held[]> {
  const store = await posVault()
  const ids = (await store.ids('slips')).filter((id) => id.startsWith(`${saleKey}#`))
  const held = await Promise.all(ids.map((id) => store.get<Held>('slips', id)))
  return held.filter((entry): entry is Held => !!entry).sort((a, b) => a.position - b.position)
}

/** Keeps the sale's photos until it is filed; a photo over the limits is not kept. */
export async function holdSlipPhotos(
  saleKey: string,
  tillId: string,
  photos: SlipPhoto[],
): Promise<void> {
  if (!photos.length) return
  try {
    const store = await posVault()
    let total = 0
    for (const id of await store.ids('slips')) {
      total += (await store.get<Held>('slips', id))?.blob.size ?? 0
    }
    for (const photo of photos) {
      if (photo.blob.size > MAX_SLIP_BYTES || total + photo.blob.size > MAX_HELD_BYTES) continue
      total += photo.blob.size
      const held: Held = { ...photo, saleKey, tillId, fileId: null }
      await store.put('slips', idOf(saleKey, photo.position), held)
    }
  } catch {
    // Storage full or refused: the sale goes without its photo, as a sale without a slip does.
  }
}

/** A sale that will never be filed: its photos go too. */
export async function dropSlipPhotos(saleKey: string): Promise<void> {
  try {
    const store = await posVault()
    for (const held of await heldFor(saleKey)) {
      await store.delete('slips', idOf(saleKey, held.position))
    }
  } catch {
    // Nothing kept.
  }
  writeDue(readDue().filter((due) => due.saleKey !== saleKey))
}

/** Sign-in, permission, a lapse or a server fault may pass; anything else will not. */
function isFinal(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.status === 403) return error.problemType === 'plan-feature-not-included'
  return error.status >= 400 && error.status < 500 && ![401, 408, 425, 429].includes(error.status)
}

function confidentFields(reading: ReturnType<typeof slipReading>): PosSlipFields | null {
  if (reading.unread) return null
  const fields: PosSlipFields = {}
  for (const [name, value] of Object.entries(reading.fields) as [keyof PosSlipFields, never][]) {
    if (!reading.unsure.includes(name)) fields[name] = value
  }
  return Object.keys(fields).length ? fields : null
}

const sending = new Set<string>()

async function attachAll({ saleKey, saleId, tillId }: Due): Promise<void> {
  if (sending.has(saleKey)) return
  sending.add(saleKey)
  try {
    const store = await posVault()
    for (const held of await heldFor(saleKey)) {
      const id = idOf(saleKey, held.position)
      try {
        let fileId = held.fileId
        if (!fileId) {
          fileId = (await uploadPosSlip(tillId, held.blob, held.name)).fileId
          // Uploaded once: a retry attaches the same file rather than storing another.
          await store.put('slips', id, { ...held, fileId } satisfies Held)
        }
        let slipFields: PosSlipFields | null = null
        try {
          slipFields = confidentFields(slipReading(await readPosSlip(fileId)))
        } catch {
          // Reading is a help: the photo is attached whether or not it was read.
        }
        try {
          await attachPosSlip(saleId, held.position, { slipFileId: fileId, slipFields })
        } catch (error) {
          // Attached before (a retry after a lost answer): done.
          if (!(error instanceof ApiError && error.code === 'POS_SLIP_ALREADY_ATTACHED'))
            throw error
        }
        await store.delete('slips', id)
      } catch (error) {
        if (!isFinal(error)) return
        await store.delete('slips', id)
      }
    }
    writeDue(readDue().filter((due) => due.saleKey !== saleKey))
  } catch {
    // Kept; tried again with the queue.
  } finally {
    sending.delete(saleKey)
  }
}

/** The sale is filed: its photos are uploaded and attached now, and later if that fails. */
export async function sendSlipPhotos(saleKey: string, saleId: string, tillId: string) {
  if (!(await heldFor(saleKey).catch(() => [])).length) return
  const due = readDue().filter((entry) => entry.saleKey !== saleKey)
  writeDue([...due, { saleKey, saleId, tillId }])
  await attachAll({ saleKey, saleId, tillId })
}

/** Every filed sale whose photos still wait, as the queue is sent again. */
export async function retrySlipPhotos(tillId: string): Promise<void> {
  for (const due of readDue().filter((entry) => entry.tillId === tillId)) await attachAll(due)
}

/** For tests. */
export async function heldSlipPhotos(saleKey: string): Promise<Held[]> {
  return heldFor(saleKey)
}
