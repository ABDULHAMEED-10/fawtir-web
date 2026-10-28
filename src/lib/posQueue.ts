import { useEffect, useSyncExternalStore } from 'react'
import { ApiError, NetworkError } from '../api'
import {
  createPosSale,
  type PosSaleDto,
  type PosSaleRequest,
  type PosTillDto,
} from '../api/pos/pos'

/**
 * The till keeps selling when the connection drops (guide section 9, "Offline"). A sale that
 * cannot reach the server is numbered by the till itself, from its own series (`series.INVOICE`
 * on `GET /v1/pos/tills/{id}`), and kept on this device. Queued sales are sent oldest number
 * first, each with the key it was made with, so a sale is filed exactly once
 * (`queuedOffline: true`, the printed `invoiceNumber`). While any sale waits, a new one joins the
 * queue too: an online sale would take the next number and leave a gap behind the queued ones.
 *
 * TODO(backend): a sale made offline prints its number but not its QR; the QR's signed payload
 * is made by the server once the sale is sent (INCOME.md row P.28). A slip photo is not kept
 * with a queued sale: Scan slip needs the connection.
 */

export type QueuedSale = {
  key: string
  tillId: string
  number: string
  body: PosSaleRequest
  /** The refusal that stopped the queue, worded on the till; null while it is only waiting. */
  refusal: string | null
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
 * Sends one sale, or numbers it and keeps it when the till is offline (or already has a queue).
 * A refusal (`ApiError`) is not queued: it is the cashier's to put right, so it is thrown.
 */
export async function submitSale(
  till: PosTillDto,
  body: PosSaleRequest,
  key: string,
): Promise<SubmitResult> {
  const enqueue = (): SubmitResult => {
    const number = nextTillNumber(till)
    if (!number) throw new NetworkError('offline')
    const entry: QueuedSale = {
      key,
      tillId: till.id,
      number,
      body: { ...body, queuedOffline: true, invoiceNumber: number },
      refusal: null,
    }
    save([...queue, entry])
    noteNumberUsed(till.id, number)
    return { queued: entry }
  }
  if (queuedFor(till.id).length > 0) {
    const result = enqueue()
    void flushQueue(till.id)
    return result
  }
  try {
    const sale = await createPosSale(body, key)
    noteNumberUsed(till.id, sale.invoiceNumber)
    return { sale }
  } catch (error) {
    if (error instanceof NetworkError) return enqueue()
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
      try {
        await createPosSale(entry.body, entry.key)
        save(queue.filter((other) => other.key !== entry.key))
      } catch (error) {
        if (error instanceof ApiError) {
          save(
            queue.map((other) =>
              other.key === entry.key
                ? { ...other, refusal: error.code ?? `HTTP_${error.status}` }
                : other,
            ),
          )
        }
        return
      }
    }
  } finally {
    flushing = false
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
  save([])
}
