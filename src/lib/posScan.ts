import { productListPath, searchProducts, type ProductDto } from '../api/catalog/products'
import type { PosItem } from './posShelf'

/**
 * Barcode scanning at the till (Abdul, 30 Oct 2026): a USB scanner types the code and ends it with
 * Enter, like a very fast keyboard.
 *
 * - A code is matched on the shelf first: a product's own barcode, or one of its sizes' (backend
 *   V509, the variants the list already carries with `include=variants`).
 * - Not on the shelf (a branch with more than the 200 items the shelf reads), it is looked up on
 *   the server: `GET /v1/products?branchId=&barcode=` matches a product's or a size's barcode and
 *   names the size in `matchedVariantId`. An older server without the lookup answers an empty page,
 *   an error or a product whose barcode is not the one asked: each reads as "not found". Offline,
 *   the shelf alone answers.
 * - A size's own barcode adds that size directly, without the chooser.
 */

/** What a scan found: the item, and the size when the code is a size's own barcode. */
export type ScanHit = { item: PosItem; variantId: string | null }

/** A size that can be sold now: on sale, of an item the branch sells. */
function sizeWithBarcode(product: ProductDto, code: string) {
  return Array.isArray(product.variants)
    ? (product.variants.find((variant) => variant.barcode === code && variant.onSale) ?? null)
    : null
}

/** The scanned code on the shelf: the product's own barcode first, then a size's. */
export function findOnShelf(items: PosItem[], raw: string): ScanHit | null {
  const code = raw.trim()
  if (!code) return null
  const product = items.find((item) => item.available && item.barcode === code)
  if (product) return { item: product, variantId: null }
  for (const item of items) {
    if (!item.available) continue
    const size = sizeWithBarcode(item.product, code)
    if (size) return { item, variantId: size.id }
  }
  return null
}

/** How many rows the lookup asks for: a barcode names one item, a few rows leave room to check. */
const LOOKUP_SIZE = 5

/**
 * The server's answer for a code not on the shelf, or null when nothing matches, the server has no
 * lookup, or it cannot be reached. Only what the branch sells now is asked (no
 * `includeUnavailable`), with its sizes, add-ons and stock as the shelf reads them.
 */
export async function lookupBarcode(
  branchId: string,
  raw: string,
): Promise<{ product: ProductDto; variantId: string | null } | null> {
  const code = raw.trim()
  if (!code) return null
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  let rows: ProductDto[]
  try {
    const page = await searchProducts(
      productListPath({
        branchId,
        barcode: code,
        size: LOOKUP_SIZE,
        include: ['variants', 'addOns', 'stock'],
      }),
    )
    rows = page.items
  } catch {
    // 404 or 400 from a server without the lookup, a refusal, or offline: not found.
    return null
  }
  for (const product of rows) {
    if (product.active === false || product.availableHere === false) continue
    const named = product.matchedVariantId
      ? (product.variants ?? []).find((variant) => variant.id === product.matchedVariantId)
      : null
    if (named && named.onSale) return { product, variantId: named.id }
    if (product.barcode === code) return { product, variantId: null }
    // A server that names no size (older, or without include) but sends the sizes.
    const size = sizeWithBarcode(product, code)
    if (size) return { product, variantId: size.id }
  }
  return null
}

/* ------------------------------------------------------------ scanner bursts */

/** How a scanner is told from a person typing. Both can be tuned per till. */
export type ScanCaptureOptions = {
  /** Shortest code taken as a scan; shorter bursts are left alone. Default 4. */
  minLength?: number
  /** Longest pause between two keys of one scan, in ms. A person types slower. Default 50. */
  maxGapMs?: number
}

export const SCAN_DEFAULTS: Required<ScanCaptureOptions> = { minLength: 4, maxGapMs: 50 }

/**
 * Where a person is typing: a text field, a text area, a list box or anything editable. A scan is
 * never taken from these (the quantity, the search box, the buyer form keep their keys); the
 * till's own scan box handles its Enter itself and is skipped too.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    const kind = (target.type || 'text').toLowerCase()
    return ![
      'button',
      'checkbox',
      'radio',
      'submit',
      'reset',
      'range',
      'color',
      'file',
      'image',
    ].includes(kind)
  }
  return target.getAttribute('role') === 'textbox' || target.getAttribute('role') === 'combobox'
}

/**
 * Tells scanner bursts from typing: printable keys arriving faster than `maxGapMs` apart and ended
 * by Enter, at least `minLength` long. `key` answers true when it took the Enter of a scan, so
 * the caller stops it (a focused button would otherwise be pressed by it).
 */
export class ScanBurst {
  private buffer = ''
  private last = -Infinity
  private readonly minLength: number
  private readonly maxGapMs: number

  constructor(options: ScanCaptureOptions = {}) {
    this.minLength = options.minLength ?? SCAN_DEFAULTS.minLength
    this.maxGapMs = options.maxGapMs ?? SCAN_DEFAULTS.maxGapMs
  }

  /** One key at `now` ms. Returns the scanned code when this Enter ends a scan, else null. */
  key(key: string, now: number): string | null {
    const gap = now - this.last
    this.last = now
    if (key === 'Enter') {
      const code = gap <= this.maxGapMs && this.buffer.length >= this.minLength ? this.buffer : null
      this.buffer = ''
      return code
    }
    if (key.length !== 1) {
      // Shift and the like arrive inside a scan of capitals; anything else ends it.
      if (key !== 'Shift') this.buffer = ''
      return null
    }
    this.buffer = gap <= this.maxGapMs ? this.buffer + key : key
    return null
  }

  reset() {
    this.buffer = ''
    this.last = -Infinity
  }
}

/**
 * Listens on the whole page for scanner bursts while the till is open, wherever the cursor is,
 * except in a field a person types in. Returns the function that stops listening.
 */
export function captureScans(
  onScan: (code: string) => void,
  options: ScanCaptureOptions = {},
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const burst = new ScanBurst(options)
  const listener = (event: Event) => {
    const keyEvent = event as KeyboardEvent
    if (keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey || keyEvent.isComposing) {
      burst.reset()
      return
    }
    if (isTypingTarget(keyEvent.target)) {
      burst.reset()
      return
    }
    const code = burst.key(keyEvent.key, keyEvent.timeStamp || performance.now())
    if (code) {
      keyEvent.preventDefault()
      keyEvent.stopPropagation()
      onScan(code)
    }
  }
  // Capture phase: seen before a focused button or a dialog acts on the Enter.
  target.addEventListener('keydown', listener, true)
  return () => target.removeEventListener('keydown', listener, true)
}
