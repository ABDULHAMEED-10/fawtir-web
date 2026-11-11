import { useEffect, useSyncExternalStore } from 'react'
import { ApiError } from '../api'
import {
  loadActivePriceRules,
  type ActivePriceRulesDto,
  type PriceRuleDto,
} from '../api/catalog/priceRules'
import { onPosSaleFiled, type PosSaleDto } from '../api/pos/pos'
import { evaluateRules, type RuleLine } from './priceRuleEvaluator'
import { invoiceLinesFor, toBaisa, type SaleLine, type SalePriceRule } from './pos'
import { setSaleLines, useOpenSale } from './posSale'
import type { DiscountType } from './invoiceMath'

/**
 * Price rules at the till (price rules API note, section 3; backend PR #796).
 *
 * The till keeps the branch's live rules (`GET /v1/price-rules/active?branchId=`) on the device,
 * refreshed whenever their `version` (the ETag) moves, and works each line's rule out itself, so
 * the saving shows as the item goes on and the till keeps selling offline. Only rules marked
 * `atTheTill` count; a customer rule only once a customer is chosen, never for a walk-in.
 *
 * The sale names the rule on each line it caught (`lineRefs[].priceRuleIds`) with the rule's
 * saving as the line's discount. The server works it out again at `soldAt`; online, a difference
 * is refused `POS_PRICE_RULE_MISMATCH` with its own figure, which the till adopts
 * ({@link adoptRuleMismatch}). A queued sale's difference is accepted with the warning
 * `POS_PRICE_RULE_STALE_ACCEPTED`, which the till shows once the queue has sent it.
 */

const CACHE_PREFIX = 'fawtir.pos.priceRules.'
/** How often the till asks whether the rules changed. */
export const RULES_REFRESH_MS = 60_000

type Cache = Record<string, ActivePriceRulesDto>

function readStored(branchId: string): ActivePriceRulesDto | null {
  try {
    const text = window.localStorage.getItem(CACHE_PREFIX + branchId)
    return text ? (JSON.parse(text) as ActivePriceRulesDto) : null
  } catch {
    return null
  }
}

function writeStored(value: ActivePriceRulesDto) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + value.branchId, JSON.stringify(value))
  } catch {
    // A till without storage still prices online; the rules live for this tab.
  }
}

let cache: Cache = {}
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The branch's rules as last read (from the device while offline); empty until then. */
export function cachedRules(branchId: string | null): PriceRuleDto[] {
  if (!branchId) return []
  const held = cache[branchId] ?? (typeof window === 'undefined' ? null : readStored(branchId))
  if (held && !cache[branchId]) cache = { ...cache, [branchId]: held }
  return held?.items ?? []
}

/**
 * Reads the branch's live rules and keeps them when their version moved. A failure (offline, a
 * branch the user does not work in) keeps what the till already has.
 */
export async function refreshActiveRules(branchId: string): Promise<void> {
  try {
    const fresh = await loadActivePriceRules(branchId)
    if (cache[branchId]?.version === fresh.version) return
    cache = { ...cache, [branchId]: fresh }
    writeStored(fresh)
    notify()
  } catch {
    // Kept as it was: the server checks every sale again.
  }
}

/** For tests. */
export function resetPriceRuleCache() {
  cache = {}
  staleNotices = []
  notify()
}

/* --------------------------------------------------------- the sale's lines */

/**
 * A bundle whose parts differ in VAT files its parts: no rule prices them, and they count toward
 * no tier (`SaleLine.bundleParts`, set by the till's bundle split).
 */
const isSplitBundle = (line: SaleLine) =>
  Boolean((line as SaleLine & { bundleParts?: unknown[] | null }).bundleParts?.length)

/**
 * Each item line with the rule the till's rules give it now, or none. Add-on lines are left out
 * (no rule prices them and they never count toward a tier). A rule the server set after a
 * refusal is kept while the line and the customer are as they were.
 */
export function applyTillRules(
  lines: SaleLine[],
  rules: PriceRuleDto[],
  sale: { branchId: string | null; customerId: string | null; at?: Date },
): SaleLine[] {
  const ruleLines: RuleLine[] = lines.map((line) => ({
    ref: line.id,
    productId: line.productId,
    variantId: line.variant?.id ?? null,
    kindId: line.kindId ?? null,
    groupId: line.groupId ?? null,
    role: isSplitBundle(line) ? 'BUNDLE_PART' : line.bundle ? 'BUNDLE' : 'ITEM',
    quantity: line.qty,
    unitPrice: line.price,
    priceChangedByHand: false,
    productDefault:
      Number(line.discountValue) > 0
        ? { type: line.discountType, value: Number(line.discountValue) }
        : null,
  }))
  const outcomes = evaluateRules(
    {
      branchId: sale.branchId,
      channel: 'TILL',
      at: sale.at ?? new Date(),
      // TODO(backend): /active does not carry the customer's tags, so a rule naming a tag is
      // matched by the server alone (and adopted on its refusal); INCOME.md row P.35.
      buyer: sale.customerId ? { customerId: sale.customerId, tags: [] } : null,
      lines: ruleLines,
    },
    rules.filter((rule) => rule.atTheTill),
  )
  return lines.map((line, index) => {
    const held = adopted.get(line.id)
    if (held && held.qty === line.qty && held.customerId === sale.customerId) {
      return sameRule(line.priceRule, held.rule) ? line : { ...line, priceRule: held.rule }
    }
    if (held) adopted.delete(line.id)
    const outcome = outcomes[index]
    const next: SalePriceRule | null =
      outcome.source === 'RULE' && outcome.ruleId && outcome.discount
        ? {
            id: outcome.ruleId,
            name: outcome.ruleName ?? '',
            discountType: outcome.discount.type,
            discountValue: String(outcome.discount.value),
            saving: outcome.saving,
          }
        : null
    return sameRule(line.priceRule ?? null, next) ? line : { ...line, priceRule: next }
  })
}

function sameRule(a: SalePriceRule | null | undefined, b: SalePriceRule | null | undefined) {
  if (!a || !b) return !a && !b
  return (
    a.id === b.id &&
    a.discountType === b.discountType &&
    a.discountValue === b.discountValue &&
    a.saving === b.saving
  )
}

/** Lines the server priced itself after a refusal: kept while the quantity and buyer hold. */
const adopted = new Map<
  string,
  { qty: number; customerId: string | null; rule: SalePriceRule | null }
>()

/**
 * `422 POS_PRICE_RULE_MISMATCH {line, expectedDiscount {type, value, amount} | null, ruleIds}`:
 * the sale's lines with the server's figure on the line it named, or null for any other error.
 * `line` is the invoice line number, so an item with priced add-ons is found through the lines
 * the sale files.
 */
export function adoptRuleMismatch(
  lines: SaleLine[],
  error: unknown,
  sale: { branchId: string | null; customerId: string | null },
): SaleLine[] | null {
  if (!(error instanceof ApiError) || error.code !== 'POS_PRICE_RULE_MISMATCH') return null
  const lineNumber = Number(error.problem.line)
  const filed = invoiceLinesFor(lines)[lineNumber - 1]
  // A part of a split bundle is priced by the bundle: not a line a rule can be adopted on.
  if (!filed || filed.ref.role !== 'ITEM' || filed.bundleId) return null
  const expected = error.problem.expectedDiscount as
    { type?: string; value?: number | string; amount?: number | string } | null | undefined
  const ruleIds = Array.isArray(error.problem.ruleIds) ? (error.problem.ruleIds as string[]) : []
  const ruleId = ruleIds[0] ?? null
  const rule: SalePriceRule | null =
    ruleId && expected && expected.type
      ? {
          id: ruleId,
          name:
            cachedRules(sale.branchId).find((entry) => entry.id === ruleId)?.name ??
            lines.find((line) => line.priceRule?.id === ruleId)?.priceRule?.name ??
            '',
          discountType: expected.type as DiscountType,
          discountValue: String(Number(expected.value ?? 0)),
          saving: toBaisa(Number(expected.amount ?? 0)),
        }
      : null
  return lines.map((line) => {
    if (line.id !== filed.saleLineId) return line
    adopted.set(line.id, { qty: line.qty, customerId: sale.customerId, rule })
    return { ...line, priceRule: rule }
  })
}

/**
 * Keeps the open sale priced by the branch's rules: reads them on arrival, every minute and when
 * the connection comes back, and works the lines out again when they, the customer, the rules or
 * the minute change (a time rule opens and closes on the clock).
 */
export function useTillPriceRules(branchId: string | null, customerId: string | null) {
  const rules = useSyncExternalStore(subscribe, () => (branchId ? cache[branchId] : undefined))
  const { lines } = useOpenSale()

  useEffect(() => {
    if (!branchId) return
    cachedRules(branchId)
    void refreshActiveRules(branchId)
    const again = () => void refreshActiveRules(branchId)
    window.addEventListener('online', again)
    const timer = window.setInterval(again, RULES_REFRESH_MS)
    return () => {
      window.removeEventListener('online', again)
      window.clearInterval(timer)
    }
  }, [branchId])

  useEffect(() => {
    const price = () => {
      // Rules never read for this branch are unknown, not none: the lines stay as they are.
      cachedRules(branchId)
      if (!branchId || !cache[branchId]) return
      setSaleLines((current) => {
        const next = applyTillRules(current, cachedRules(branchId), { branchId, customerId })
        return next.every((line, index) => line === current[index]) ? current : next
      })
    }
    price()
    const timer = window.setInterval(price, 30_000)
    return () => window.clearInterval(timer)
  }, [branchId, customerId, rules, lines])
}

/* ------------------------------------------ queued sales the rules disagreed with */

export const STALE_RULE_WARNING = 'POS_PRICE_RULE_STALE_ACCEPTED'

export type StaleRuleNotice = { saleId: string; invoiceNumber: string; lines: number[] }

let staleNotices: StaleRuleNotice[] = []

/** A queued sale, once sent, that kept the discount it was printed with. */
export function noteStaleRuleWarnings(sale: PosSaleDto) {
  const lines = sale.warnings
    .filter((warning) => warning.code === STALE_RULE_WARNING)
    .map((warning) => warning.line ?? 0)
  if (lines.length === 0 || staleNotices.some((notice) => notice.saleId === sale.saleId)) return
  staleNotices = [
    ...staleNotices,
    { saleId: sale.saleId, invoiceNumber: sale.invoiceNumber, lines },
  ]
  notify()
}

export function dismissStaleRuleNotice(saleId: string) {
  staleNotices = staleNotices.filter((notice) => notice.saleId !== saleId)
  notify()
}

export function useStaleRuleNotices(): StaleRuleNotice[] {
  return useSyncExternalStore(subscribe, () => staleNotices)
}

onPosSaleFiled((sale, body) => {
  if (body.queuedOffline) noteStaleRuleWarnings(sale)
})
