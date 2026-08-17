/**
 * Invoice arithmetic — the preview side of `FAWTIR-INV-TD-001` §5–§8.
 *
 * The server owns the authoritative totals (`INV-FR-091`); this exists so the composer can show
 * a live figure while typing. It therefore has to agree with the backend to the last digit, so
 * it follows the same rules rather than approximating them:
 *
 *   · `BigInt` fixed point, never JS floats — `INV-FR-173` forbids binary floating point on any
 *     monetary path, and 0.1 + 0.2 is exactly the class of error it is guarding against.
 *   · Calculate at scale 10, project at the currency's minor units — `INV-FR-195`, `INV-FR-204`.
 *   · HALF_UP at every scale boundary — `INV-FR-199`.
 *   · Deterministic residual reconciliation, re-run at every scale — `INV-FR-197`, `INV-FR-198`.
 *   · VAT computed per (category, rate) on the aggregated base, then lines reconciled to it —
 *     `INV-FR-178`. Summing independently rounded line VAT gives a different, wrong figure.
 */

export const CALC_SCALE = 10
/** Working scale for allocations, so a genuine fractional part survives to order residuals by. */
const HI_SCALE = 20

const F = 10n ** BigInt(CALC_SCALE)
const HI = 10n ** BigInt(HI_SCALE)
const HI_STEP = HI / F

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT'

export type LineInput = {
  id: string
  /** 1-based, and the tie-break when two residual candidates are equal. */
  lineNumber: number
  quantity: string
  unitPrice: string
  vatRate: string
  discountType: DiscountType
  discountValue: string
}

export type LineAmounts = {
  id: string
  gross: bigint
  lineDiscount: bigint
  afterLineDiscount: bigint
  headerDiscount: bigint
  taxable: bigint
  vat: bigint
  net: bigint
}

export type InvoiceAmounts = {
  lines: LineAmounts[]
  subtotal: bigint
  itemDiscount: bigint
  headerDiscount: bigint
  totalDiscount: bigint
  taxable: bigint
  vat: bigint
  total: bigint
}

/* ------------------------------------------------------------------ parsing */

/** "1.800" → scale-10 BigInt. Anything unparseable reads as zero, as a draft may be mid-typing. */
export function parseAmount(raw: string): bigint {
  const text = (raw ?? '').trim().replace(/,/g, '')
  if (!/^-?\d*\.?\d*$/.test(text) || text === '' || text === '.' || text === '-') return 0n
  const negative = text.startsWith('-')
  const [whole = '0', frac = ''] = text.replace('-', '').split('.')
  const padded = (frac + '0'.repeat(CALC_SCALE)).slice(0, CALC_SCALE)
  const value = BigInt(whole || '0') * F + BigInt(padded || '0')
  return negative ? -value : value
}

/** Scale-10 BigInt → a display string at `scale` decimals, with thousands separators. */
export function formatAmount(value: bigint, scale = 3): string {
  return formatAtScale(rescale(value, scale), scale)
}

/** Format a value that is *already* an integer at `scale` — used for projected line figures. */
export function formatAtScale(projected: bigint, scale = 3): string {
  const unit = 10n ** BigInt(scale)
  const negative = projected < 0n
  const abs = negative ? -projected : projected
  const whole = abs / unit
  const frac = (abs % unit).toString().padStart(scale, '0')
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${scale > 0 ? `.${frac}` : ''}`
}

/* ---------------------------------------------------------------- primitives */

/** HALF_UP division, sign-correct — the mode approved as `INV-PD-003a`. */
function divHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n
  const negative = numerator < 0n !== denominator < 0n
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const q = n / d
  const rounded = (n % d) * 2n >= d ? q + 1n : q
  return negative ? -rounded : rounded
}

/** Scale-10 × scale-10 → scale-10. */
function mul(a: bigint, b: bigint): bigint {
  return divHalfUp(a * b, F)
}

/** Scale-10 value → the same value rounded to `scale` decimals, still expressed at scale 10. */
function rescale(value: bigint, scale: number): bigint {
  const step = 10n ** BigInt(CALC_SCALE - scale)
  return divHalfUp(value, step)
}

/**
 * `FAWTIR-INV-TD-001` §7.2 — distribute the rounding residual deterministically.
 *
 * `raw` carries extra precision so each entry has a real fractional part; `exactTotal` is the
 * figure the rounded parts must sum to. Units go to the largest fractional remainder first
 * (smallest first when clawing back), tie-broken by line order, cycling if the residual exceeds
 * the line count. A residual is never dropped and never lands on an ineligible line.
 */
function reconcile(
  raw: { value: bigint; lineNumber: number; eligible: boolean }[],
  exactTotal: bigint,
  step: bigint,
): bigint[] {
  const rounded = raw.map((r) => divHalfUp(r.value, step))
  const sum = rounded.reduce((acc, v) => acc + v, 0n)
  const units = exactTotal - sum
  if (units === 0n) return rounded

  const candidates = raw
    .map((r, index) => ({
      index,
      frac: r.value % step,
      lineNumber: r.lineNumber,
      eligible: r.eligible,
    }))
    .filter((c) => c.eligible)
  if (candidates.length === 0) return rounded

  const descending = units > 0n
  candidates.sort((a, b) => {
    if (a.frac !== b.frac) return descending ? (b.frac > a.frac ? 1 : -1) : a.frac > b.frac ? 1 : -1
    return a.lineNumber - b.lineNumber
  })

  const direction = descending ? 1n : -1n
  let steps = units < 0n ? -units : units
  let cursor = 0
  while (steps > 0n) {
    rounded[candidates[cursor % candidates.length].index] += direction
    cursor += 1
    steps -= 1n
  }
  return rounded
}

/* ---------------------------------------------------------------- the engine */

export function calculateInvoice(
  lines: LineInput[],
  headerDiscountType: DiscountType,
  headerDiscountValue: string,
): InvoiceAmounts {
  const parsed = lines.map((line) => {
    const quantity = parseAmount(line.quantity)
    const unitPrice = parseAmount(line.unitPrice)
    const gross = mul(quantity, unitPrice)
    const discountInput = parseAmount(line.discountValue)
    // §5.2 step 2 — percentage resolves against the line's own gross, fixed is taken as given.
    const lineDiscount =
      line.discountType === 'PERCENTAGE'
        ? divHalfUp(gross * discountInput, 100n * F)
        : discountInput
    const capped = lineDiscount > gross ? gross : lineDiscount < 0n ? 0n : lineDiscount
    return {
      id: line.id,
      lineNumber: line.lineNumber,
      rate: parseAmount(line.vatRate),
      gross,
      lineDiscount: capped,
      afterLineDiscount: gross - capped,
    }
  })

  const totalAfterLineDiscount = parsed.reduce((acc, l) => acc + l.afterLineDiscount, 0n)
  const headerInput = parseAmount(headerDiscountValue)

  // §5.2 step 5 — the fixed case is ONE division (total × base ÷ totalBase). Computing a weight
  // first and multiplying second rounds twice and yields a different number (`INV-FR-188`).
  let exactHeaderTotal: bigint
  let rawAllocation: bigint[]
  if (headerDiscountType === 'PERCENTAGE') {
    rawAllocation = parsed.map((l) =>
      divHalfUp(l.afterLineDiscount * headerInput * HI_STEP, 100n * F),
    )
    exactHeaderTotal = parsed.reduce(
      (acc, l) => acc + divHalfUp(l.afterLineDiscount * headerInput, 100n * F),
      0n,
    )
  } else {
    const requested = headerInput < 0n ? 0n : headerInput
    exactHeaderTotal = requested > totalAfterLineDiscount ? totalAfterLineDiscount : requested
    rawAllocation =
      totalAfterLineDiscount === 0n
        ? parsed.map(() => 0n)
        : parsed.map((l) =>
            divHalfUp(exactHeaderTotal * l.afterLineDiscount * HI_STEP, totalAfterLineDiscount),
          )
  }

  const allocated = reconcile(
    rawAllocation.map((value, i) => ({
      value,
      lineNumber: parsed[i].lineNumber,
      // §7.2 — a line with nothing to discount must never receive a residual unit.
      eligible: parsed[i].afterLineDiscount > 0n,
    })),
    exactHeaderTotal,
    HI_STEP,
  )

  const taxable = parsed.map((l, i) => l.afterLineDiscount - allocated[i])

  // §5.2 steps 8–9 — VAT is a category figure; lines are reconciled to it, never summed into it.
  const groups = new Map<string, number[]>()
  parsed.forEach((l, i) => {
    const key = l.rate.toString()
    const bucket = groups.get(key)
    if (bucket) bucket.push(i)
    else groups.set(key, [i])
  })

  const lineVat = new Array<bigint>(parsed.length).fill(0n)
  let vatTotal = 0n
  for (const [key, indexes] of groups) {
    const rate = BigInt(key)
    const categoryTaxable = indexes.reduce((acc, i) => acc + taxable[i], 0n)
    const categoryVat = divHalfUp(categoryTaxable * rate, 100n * F)
    const rawVat = indexes.map((i) => divHalfUp(taxable[i] * rate * HI_STEP, 100n * F))
    const reconciled = reconcile(
      rawVat.map((value, position) => ({
        value,
        lineNumber: parsed[indexes[position]].lineNumber,
        eligible: taxable[indexes[position]] > 0n,
      })),
      categoryVat,
      HI_STEP,
    )
    indexes.forEach((i, position) => {
      lineVat[i] = reconciled[position]
    })
    vatTotal += categoryVat
  }

  const amounts: LineAmounts[] = parsed.map((l, i) => ({
    id: l.id,
    gross: l.gross,
    lineDiscount: l.lineDiscount,
    afterLineDiscount: l.afterLineDiscount,
    headerDiscount: allocated[i],
    taxable: taxable[i],
    vat: lineVat[i],
    net: taxable[i] + lineVat[i],
  }))

  const subtotal = parsed.reduce((acc, l) => acc + l.gross, 0n)
  const itemDiscount = parsed.reduce((acc, l) => acc + l.lineDiscount, 0n)
  const taxableTotal = taxable.reduce((acc, v) => acc + v, 0n)

  return {
    lines: amounts,
    subtotal,
    itemDiscount,
    headerDiscount: exactHeaderTotal,
    totalDiscount: itemDiscount + exactHeaderTotal,
    taxable: taxableTotal,
    vat: vatTotal,
    total: taxableTotal + vatTotal,
  }
}

/* ------------------------------------------------------------- projection */

export type ProjectedLine = {
  id: string
  lineDiscount: bigint
  afterLineDiscount: bigint
  headerDiscount: bigint
  taxable: bigint
  vat: bigint
  net: bigint
}

export type ProjectedAmounts = {
  scale: number
  lines: ProjectedLine[]
  subtotal: bigint
  itemDiscount: bigint
  headerDiscount: bigint
  taxable: bigint
  vat: bigint
  total: bigint
}

/**
 * `FAWTIR-INV-TD-001` §7.3 / `INV-FR-198` — reconciling once at scale 10 does **not** make the
 * 3-decimal projection add up. Three equal lines reconcile exactly at scale 10 and are off by
 * 0.001 at scale 3. Every line series is therefore re-reconciled against its projected document
 * total, so what the user reads down a column always sums to the total beside it.
 */
export function projectInvoice(amounts: InvoiceAmounts, scale = 3): ProjectedAmounts {
  const step = 10n ** BigInt(CALC_SCALE - scale)

  const subtotal = rescale(amounts.subtotal, scale)
  const itemDiscount = rescale(amounts.itemDiscount, scale)
  const headerDiscount = rescale(amounts.headerDiscount, scale)
  const taxable = rescale(amounts.taxable, scale)
  const vat = rescale(amounts.vat, scale)
  // Keep the headline invariant true at the projected scale rather than rounding it separately.
  const total = subtotal - itemDiscount - headerDiscount + vat

  const series = (pick: (line: LineAmounts) => bigint, target: bigint) =>
    reconcile(
      amounts.lines.map((line, index) => ({
        value: pick(line),
        lineNumber: index + 1,
        eligible: pick(line) !== 0n,
      })),
      target,
      step,
    )

  const lineDiscounts = series((l) => l.lineDiscount, itemDiscount)
  const headerShares = series((l) => l.headerDiscount, headerDiscount)
  const taxables = series((l) => l.taxable, taxable)
  const vats = series((l) => l.vat, vat)

  return {
    scale,
    subtotal,
    itemDiscount,
    headerDiscount,
    taxable,
    vat,
    total,
    lines: amounts.lines.map((line, i) => ({
      id: line.id,
      lineDiscount: lineDiscounts[i],
      afterLineDiscount: rescale(line.afterLineDiscount, scale),
      headerDiscount: headerShares[i],
      taxable: taxables[i],
      vat: vats[i],
      net: taxables[i] + vats[i],
    })),
  }
}

/**
 * Strip VAT out of an inclusive price — `INV-FR-167`, at `CALCULATION_SCALE`.
 *
 * `1.800 / 1.05` repeats, so this is one HALF_UP division at scale 10 and never a round trip:
 * the derived exclusive price will not re-multiply to the typed inclusive one in general, which
 * is why the composer shows exclusive figures as projections rather than echoing input back.
 */
export function toExclusivePrice(inclusive: string, ratePercent: string): string {
  const price = parseAmount(inclusive)
  const rate = parseAmount(ratePercent)
  const hundred = parseAmount('100')
  if (price === 0n || rate === 0n) return inclusive
  return formatAmount(divHalfUp(price * hundred, hundred + rate), CALC_SCALE)
}
