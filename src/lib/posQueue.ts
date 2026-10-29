import { useEffect, useSyncExternalStore } from 'react'
import { ApiError, NetworkError } from '../api'
import {
  createPosSale,
  type PosSaleDto,
  type PosSaleRequest,
  type PosTillDto,
} from '../api/pos/pos'
import {
  dropSlipPhotos,
  holdSlipPhotos,
  retrySlipPhotos,
  sendSlipPhotos,
  type SlipPhoto,
} from './posSlipOutbox'
import { forgetBuyer, openBuyer, sealBuyer } from './posVault'

/**
 * The till keeps selling when the connection drops (guide section 9, "Offline"). A sale that
 * cannot reach the server is numbered by the till itself, from its own series (`series.INVOICE`
 * on `GET /v1/pos/tills/{id}`), and kept on this device. Queued sales are sent oldest number
 * first, each with the key it was made with, so a sale is filed exactly once
 * (`queuedOffline: true`, the printed `invoiceNumber`). While any sale waits, a new one joins the
 * queue too: an online sale would take the next number and leave a gap behind the queued ones.
 *
 * TODO(backend): a sale made offline prints its number but not its QR; the QR's signed payload
 * is made by the server once the sale is sent (INCOME.md row P.28).
 *
 * A full invoice names its buyer, and their civil ID or passport number is personal data: the
 * queue entry never holds it where the device can seal it (`posVault`), and it is removed the
 * moment the sale is filed or finally refused. A slip photo taken offline waits with the sale
 * and is attached once it is filed (`posSlipOutbox`).
 */

export type QueuedSale = {
  key: string
  tillId: string
  number: string
  body: PosSaleRequest
  /** The refusal that stopped the queue, worded on the till; null while it is only waiting. */
  refusal: string | null
  /** The buyer was taken out of `body` and sealed on the device, to be put back as it is sent. */
  sealed?: boolean
  /** Refused for good: not sent again, and nothing personal is kept for it. */
  final?: boolean
}

const QUEUE_KEY = 'fawtir.pos.queue'
const nextKey = (tillId: string) => `fawtir.pos.next.${tillId}`

function read<T>(key: string, fallback: T): T {
  try {
    const text = window.localStorage.getItem(key)
    return text ? (JSON.parse(text) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A till without storage still sells online; the queue lives in memory for this tab.
  }
}

let queue: QueuedSale[] = typeof window === 'undefined' ? [] : read<QueuedSale[]>(QUEUE_KEY, [])
const listeners = new Set<() => void>()

function save(next: QueuedSale[]) {
  queue = next
  write(QUEUE_KEY, next)
  listeners.forEach((listener) => listener())
}

/** The number's running part: `NZW-T01-INV-2026-000123` is 123. */
export function numberValue(invoiceNumber: string): number | null {
  const match = /-(\d+)$/.exec(invoiceNumber)
  return match ? Number(match[1]) : null
}

/** `<series>-<year>-<value, six digits>`, as the server numbers the till's sales. */
export function formatTillNumber(series: string, year: number, value: number): string {
  return `${series}-${year}-${String(value).padStart(6, '0')}`
}

/** The next number this till will print offline: the server's, or further on if it sold since. */
export function nextTillNumber(till: PosTillDto): string | null {
  const series = till.series?.INVOICE
  if (!series) return null
  const local = read<number>(nextKey(till.id), 0)
  const queued = queue
    .filter((entry) => entry.tillId === till.id)
    .map((entry) => (numberValue(entry.number) ?? 0) + 1)
  const value = Math.max(series.nextValue, local, ...queued)
  return formatTillNumber(series.series, series.year, value)
}

/** After a sale is numbered, offline numbering continues from the one after it. */
export function noteNumberUsed(tillId: string, invoiceNumber: string) {
  const value = numberValue(invoiceNumber)
  if (value == null) return
  if (value + 1 > read<number>(nextKey(tillId), 0)) write(nextKey(tillId), value + 1)
}

export function queuedFor(tillId: string): QueuedSale[] {
  return queue
    .filter((entry) => entry.tillId === tillId)
    .sort((a, b) => (numberValue(a.number) ?? 0) - (numberValue(b.number) ?? 0))
}

export type SubmitResult = { sale: PosSaleDto } | { queued: QueuedSale }

/**
 * A refusal that the same sale sent again cannot get past. Sign-in, permission (which an
 * administrator may give back), a lapse and a server fault are tried again.
 */
export function isFinalRefusal(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 403, 408, 425, 429].includes(error.status)
  )
}

/** The buyer taken out of the entry, sealed on the device when it can be. */
async function sealed(entry: QueuedSale): Promise<QueuedSale> {
  const consumer = entry.body.customer.consumer
  if (!consumer || !(await sealBuyer(entry.key, consumer))) return entry
  const customer = { ...entry.body.customer }
  delete customer.consumer
  return { ...entry, body: { ...entry.body, customer }, sealed: true }
}

/** The body as it is sent: the sealed buyer put back, held only for the request. */
async function bodyToSend(entry: QueuedSale): Promise<PosSaleRequest> {
  if (!entry.sealed) return entry.body
  const consumer = await openBuyer(entry.key)
  return consumer ? { ...entry.body, customer: { ...entry.body.customer, consumer } } : entry.body
}

/** Nothing personal is left of a sale the server has, or will never take. */
async function forget(entry: QueuedSale) {
  await forgetBuyer(entry.key)
}

/**
 * Sends one sale, or numbers it and keeps it when the till is offline (or already has a queue).
 * A refusal (`ApiError`) is not queued: it is the cashier's to put right, so it is thrown.
 * `photos` are bank slips scanned while offline: kept with the sale, attached once it is filed.
 */
export async function submitSale(
  till: PosTillDto,
  body: PosSaleRequest,
  key: string,
  photos: SlipPhoto[] = [],
): Promise<SubmitResult> {
  const enqueue = async (): Promise<SubmitResult> => {
    const number = nextTillNumber(till)
    if (!number) throw new NetworkError('offline')
    // Taken now, before the awaits below: a second sale must not print the same number.
    noteNumberUsed(till.id, number)
    const entry = await sealed({
      key,
      tillId: till.id,
      number,
      body: { ...body, queuedOffline: true, invoiceNumber: number },
      refusal: null,
    })
    save([...queue, entry])
    return { queued: entry }
  }
  await holdSlipPhotos(key, till.id, photos)
  if (queuedFor(till.id).length > 0) {
    const result = await enqueue()
    void flushQueue(till.id)
    return result
  }
  try {
    const sale = await createPosSale(body, key)
    noteNumberUsed(till.id, sale.invoiceNumber)
    void sendSlipPhotos(key, sale.saleId, till.id)
    return { sale }
  } catch (error) {
    if (error instanceof NetworkError) return enqueue()
    void dropSlipPhotos(key)
    throw error
  }
}

let flushing = false

/** Sends the till's queued sales oldest number first; stops at the first that does not go. */
export async function flushQueue(tillId: string): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    for (const entry of queuedFor(tillId)) {
      if (entry.final) return
      try {
        const sale = await createPosSale(await bodyToSend(entry), entry.key)
        save(queue.filter((other) => other.key !== entry.key))
        await forget(entry)
        void sendSlipPhotos(entry.key, sale.saleId, tillId)
      } catch (error) {
        if (error instanceof ApiError) {
          const final = isFinalRefusal(error)
          if (final) {
            await forget(entry)
            await dropSlipPhotos(entry.key)
          }
          save(
            queue.map((other) => {
              if (other.key !== entry.key) return other
              const refused = {
                ...other,
                refusal: error.code ?? `HTTP_${error.status}`,
                ...(final ? { final: true } : {}),
              }
              if (final && refused.body.customer.consumer) {
                const customer = { ...refused.body.customer }
                delete customer.consumer
                refused.body = { ...refused.body, customer }
              }
              return refused
            }),
          )
        }
        return
      }
    }
  } finally {
    flushing = false
    void retrySlipPhotos(tillId)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The till's waiting sales, sent again whenever the browser comes back online. */
export function usePosQueue(tillId: string | null): QueuedSale[] {
  const all = useSyncExternalStore(subscribe, () => queue)
  useEffect(() => {
    if (!tillId) return
    void flushQueue(tillId)
    const again = () => void flushQueue(tillId)
    window.addEventListener('online', again)
    const timer = window.setInterval(again, 60_000)
    return () => {
      window.removeEventListener('online', again)
      window.clearInterval(timer)
    }
  }, [tillId])
  return tillId ? all.filter((entry) => entry.tillId === tillId) : []
}

/** For tests. */
export function resetPosQueue() {
  flushing = false
  save([])
}
