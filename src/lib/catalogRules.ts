/**
 * Catalog › Price rules (Figma 135:50361) and a new one (135:51027), wired to `/v1/price-rules`
 * (`src/api/catalog/priceRules.ts`, backend PRs #795, #796, #799, #800).
 *
 * A rule says when something should cost less than its catalogue price. Whether it is running
 * *now* is the server's `runningNow` (worked out from the schedule in Asia/Muscat), never a
 * stored flag or a clock drawn on the screen.
 */

import { ApiError } from '../api'
import type {
  PriceRuleCountedAs,
  PriceRuleDto,
  PriceRuleKind,
  PriceRuleRequest,
  PriceRuleTarget,
  PriceRuleTargetType,
  PriceRuleTier,
} from '../api/catalog/priceRules'
import { omr } from './catalog'

export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** The three kinds the list groups rules under, in the API's order (kind, then name). */
export const RULE_FAMILIES: { id: PriceRuleKind; titleKey: string }[] = [
  { id: 'VOLUME', titleKey: 'priceRules.family.volume' },
  { id: 'TIME', titleKey: 'priceRules.family.time' },
  { id: 'CUSTOMER', titleKey: 'priceRules.family.customer' },
]

/**
 * The new rule screen's kinds. "Buy one, get something" stays drawn as Coming later and cannot be
 * picked (Abdul, 28 Oct 2026). TODO(backend): kind BUY_ONE_GET is refused 422
 * PRICE_RULE_KIND_NOT_AVAILABLE in the first version (INCOME.md row P.32).
 */
export const RULE_KINDS: {
  id: PriceRuleKind | 'BUY_ONE_GET'
  titleKey: string
  noteKey: string
  comingLater?: boolean
}[] = [
  { id: 'VOLUME', titleKey: 'newRule.kind.volume', noteKey: 'newRule.kind.volumeNote' },
  { id: 'TIME', titleKey: 'newRule.kind.time', noteKey: 'newRule.kind.timeNote' },
  { id: 'CUSTOMER', titleKey: 'newRule.kind.customer', noteKey: 'newRule.kind.customerNote' },
  {
    id: 'BUY_ONE_GET',
    titleKey: 'newRule.kind.buyOneGet',
    noteKey: 'newRule.kind.buyOneGetNote',
    comingLater: true,
  },
]

export const COUNTED_OPTIONS: { id: PriceRuleCountedAs; labelKey: string }[] = [
  { id: 'ACROSS_TARGETS', labelKey: 'newRule.count.acrossEverything' },
  { id: 'PER_ITEM', labelKey: 'newRule.count.perItem' },
]

/**
 * What the quantity is counted over. Per one month and per one year stay drawn as Coming later
 * (Abdul, 28 Oct 2026). TODO(backend): MONTH and YEAR are refused 422
 * PRICE_RULE_COUNT_PER_NOT_AVAILABLE (INCOME.md row P.33).
 */
export const PER_OPTIONS: { id: string; labelKey: string; comingLater?: boolean }[] = [
  { id: 'INVOICE', labelKey: 'newRule.perOption.oneInvoice' },
  { id: 'MONTH', labelKey: 'newRule.perOption.oneMonth', comingLater: true },
  { id: 'YEAR', labelKey: 'newRule.perOption.oneYear', comingLater: true },
]

export const VAT_RATE = 0.05

/* ------------------------------------------------------------------ the form */

export type TargetChoice = {
  type: PriceRuleTargetType
  id: string | null
  /** The product of a VARIANT target, which the server also sends back. */
  productId?: string | null
  /** What the chip says; filled from the catalogue as it loads. */
  label: string
}

export type TierForm = {
  from: number
  to: number | null
  mode: 'price' | 'percent'
  /** As typed: OMR at three decimals, or a percentage. */
  value: string
}

export type WindowForm = { days: number[]; from: string; to: string }

export type RuleForm = {
  kind: PriceRuleKind
  name: string
  targets: TargetChoice[]
  countedAs: PriceRuleCountedAs
  tiers: TierForm[]
  extrasOnly: boolean
  windows: WindowForm[]
  customers: { id: string; label: string }[]
  tags: string[]
  offerMode: 'percent' | 'price'
  offerValue: string
  validFrom: string
  validTo: string
  priority: string
  branchIds: string[]
  atTheTill: boolean
  showOnInvoice: boolean
}

export function blankRuleForm(today: string): RuleForm {
  return {
    kind: 'VOLUME',
    name: '',
    targets: [],
    countedAs: 'ACROSS_TARGETS',
    tiers: [
      { from: 1, to: 9, mode: 'percent', value: '0' },
      { from: 10, to: null, mode: 'percent', value: '10' },
    ],
    extrasOnly: false,
    windows: [{ days: [0, 1, 2, 3, 4], from: '14:00', to: '17:00' }],
    customers: [],
    tags: [],
    offerMode: 'percent',
    offerValue: '10',
    validFrom: today,
    validTo: '',
    priority: '100',
    branchIds: [],
    // The API defaults to the till too; the person picks (API note, section 6).
    atTheTill: true,
    showOnInvoice: true,
  }
}

const decimal = (value: number | null | undefined, places: number) =>
  value === null || value === undefined ? '' : String(Number(value.toFixed(places)))

export function formFromRule(rule: PriceRuleDto, today: string): RuleForm {
  const blank = blankRuleForm(today)
  const offer = rule.offer
  return {
    ...blank,
    kind: rule.kind,
    name: rule.name,
    targets: rule.targets.map((target) => ({
      type: target.type,
      id: target.id ?? null,
      productId: target.productId ?? null,
      label: '',
    })),
    countedAs: rule.countedAs ?? 'ACROSS_TARGETS',
    tiers: rule.tiers.length
      ? rule.tiers.map((tier) => ({
          from: tier.fromQty,
          to: tier.toQty,
          mode: tier.priceEach !== null && tier.priceEach !== undefined ? 'price' : 'percent',
          value:
            tier.priceEach !== null && tier.priceEach !== undefined
              ? tier.priceEach.toFixed(3)
              : decimal(tier.percentOff, 2),
        }))
      : blank.tiers,
    extrasOnly: rule.extrasOnly,
    windows: rule.windows.length ? rule.windows.map((w) => ({ ...w })) : blank.windows,
    customers: (rule.customers?.customerIds ?? []).map((id) => ({ id, label: '' })),
    tags: rule.customers?.tags ?? [],
    offerMode: offer?.priceEach !== null && offer?.priceEach !== undefined ? 'price' : 'percent',
    offerValue:
      offer?.priceEach !== null && offer?.priceEach !== undefined
        ? offer.priceEach.toFixed(3)
        : offer
          ? decimal(offer.percentOff, 2)
          : blank.offerValue,
    validFrom: rule.validFrom,
    validTo: rule.validTo ?? '',
    priority: String(rule.priority),
    branchIds: rule.branchIds,
    atTheTill: rule.atTheTill,
    showOnInvoice: rule.showOnInvoice,
  }
}

const amount = (text: string) => {
  const value = Number(text.replace(/,/g, ''))
  return Number.isFinite(value) ? value : 0
}

function tierRequest(tier: TierForm): PriceRuleTier {
  return {
    fromQty: tier.from,
    toQty: tier.to,
    priceEach: tier.mode === 'price' ? Math.round(amount(tier.value) * 1000) / 1000 : null,
    percentOff: tier.mode === 'percent' ? amount(tier.value) : null,
  }
}

/**
 * The body of a create or an edit. Only the kind's own fields are sent (another kind's are
 * refused 400 `PRICE_RULE_INVALID`); stacking is always `false` (Coming later, row P.34).
 */
export function ruleRequest(form: RuleForm, acknowledgeBelowCost = false): PriceRuleRequest {
  const targets: PriceRuleTarget[] = form.targets.map((target) =>
    target.type === 'ALL' ? { type: 'ALL' } : { type: target.type, id: target.id },
  )
  const offer =
    form.offerMode === 'price'
      ? { percentOff: null, priceEach: Math.round(amount(form.offerValue) * 1000) / 1000 }
      : { percentOff: amount(form.offerValue), priceEach: null }
  return {
    name: form.name.trim(),
    kind: form.kind,
    validFrom: form.validFrom || null,
    validTo: form.validTo || null,
    priority: Math.round(amount(form.priority || '100')),
    targets,
    ...(form.kind === 'VOLUME'
      ? {
          countedAs: form.countedAs,
          countPer: 'INVOICE' as const,
          tiers: form.tiers.map(tierRequest),
          extrasOnly: form.extrasOnly,
        }
      : form.kind === 'TIME'
        ? {
            windows: form.windows.map((w) => ({
              days: [...w.days].sort(),
              from: w.from,
              to: w.to,
            })),
            offer,
          }
        : { customers: { customerIds: form.customers.map((c) => c.id), tags: form.tags }, offer }),
    branchIds: form.branchIds,
    atTheTill: form.atTheTill,
    showOnInvoice: form.showOnInvoice,
    stacks: false,
    ...(acknowledgeBelowCost ? { acknowledgeBelowCost: true } : {}),
  }
}

/** Each tier starts where the last ended, the first at 1, and only the last is open-ended. */
export function tiersInOrder(tiers: TierForm[]): boolean {
  return (
    tiers.length > 0 &&
    tiers.every(
      (tier, index) =>
        (index === 0 ? tier.from === 1 : tier.from === (tiers[index - 1].to ?? 0) + 1) &&
        (index === tiers.length - 1
          ? tier.to === null || tier.to >= tier.from
          : tier.to !== null && tier.to >= tier.from),
    )
  )
}

/** What still stops a save, as words the check card shows. Nothing here is the server's call. */
export function formProblems(form: RuleForm): string[] {
  const problems: string[] = []
  if (!form.name.trim()) problems.push('newRule.problem.name')
  if (form.targets.length === 0) problems.push('newRule.problem.targets')
  if (form.kind === 'VOLUME' && !tiersInOrder(form.tiers)) problems.push('newRule.problem.tiers')
  if (form.kind === 'TIME' && form.windows.some((w) => w.days.length === 0))
    problems.push('newRule.problem.windows')
  if (form.kind === 'CUSTOMER' && form.customers.length === 0 && form.tags.length === 0)
    problems.push('newRule.problem.customers')
  if (form.kind !== 'VOLUME' && !(amount(form.offerValue) > 0))
    problems.push('newRule.problem.offer')
  if (form.validTo && form.validFrom && form.validTo < form.validFrom)
    problems.push('newRule.problem.dates')
  return problems
}

/* ----------------------------------------------------------- the worked example */

/** Which tier a quantity falls into. */
export function tierForQuantity(tiers: TierForm[], quantity: number): TierForm | undefined {
  return [...tiers].reverse().find((tier) => quantity >= tier.from) ?? tiers[0]
}

/** One unit's price in a tier, from the item's normal price (OMR). */
export function tierPrice(tier: TierForm, normalPrice: number): number {
  const value = amount(tier.value)
  const price = tier.mode === 'price' ? value : normalPrice * (1 - value / 100)
  return Math.round(Math.max(price, 0) * 1000) / 1000
}

/** The worked example on the right, from the quantity typed into it. */
export function tryItOut(quantity: number, tiers: TierForm[], normalPrice: number) {
  const chosen = tierForQuantity(tiers, quantity)
  const each = chosen ? tierPrice(chosen, normalPrice) : normalPrice
  const normally = Math.round(quantity * normalPrice * 1000) / 1000
  const withRule = Math.round(quantity * each * 1000) / 1000
  const save = Math.round((normally - withRule) * 1000) / 1000
  const vat = Math.round(withRule * VAT_RATE * 1000) / 1000
  return {
    each,
    normally,
    withRule,
    save,
    savePercent: normally > 0 ? Math.round((save / normally) * 100) : 0,
    vat,
    pay: Math.round((withRule + vat) * 1000) / 1000,
  }
}

/** What each tier saves against the first one, as the list's bar and percentage show. */
export function tierShare(rule: PriceRuleDto, index: number): { percent: number; share: number } {
  const tier = rule.tiers[index]
  if (tier.percentOff !== null && tier.percentOff !== undefined) {
    return { percent: -Math.round(tier.percentOff), share: 1 - tier.percentOff / 100 }
  }
  const top = rule.tiers[0].priceEach ?? tier.priceEach ?? 0
  const price = tier.priceEach ?? 0
  if (index === 0 || top <= 0) return { percent: 0, share: 1 }
  return { percent: Math.round(((price - top) / top) * 100), share: price / top }
}

/** A tier's price as the list prints it: OMR each, or a percentage off. */
export function tierText(tier: PriceRuleTier): { amount: string | null; percent: string | null } {
  if (tier.priceEach !== null && tier.priceEach !== undefined)
    return { amount: omr(tier.priceEach), percent: null }
  return { amount: null, percent: `${Number((tier.percentOff ?? 0).toFixed(2))}%` }
}

/* ------------------------------------------------------------- the rule list */

/** Rules that cover any of the same items (an ALL target covers everything). */
export function rulesThatOverlap(
  targets: { type: PriceRuleTargetType; id?: string | null }[],
  rules: PriceRuleDto[],
  exceptId: string | null,
): { rule: PriceRuleDto; shared: number }[] {
  const key = (t: { type: string; id?: string | null }) => `${t.type}:${t.id ?? ''}`
  const mine = new Set(targets.map(key))
  const allMine = targets.some((t) => t.type === 'ALL')
  return rules
    .filter((rule) => rule.id !== exceptId && !rule.archived)
    .map((rule) => {
      const allTheirs = rule.targets.some((t) => t.type === 'ALL')
      const shared =
        allMine || allTheirs
          ? Math.max(allMine ? rule.targets.length : targets.length, 1)
          : rule.targets.filter((t) => mine.has(key(t))).length
      return { rule, shared }
    })
}

/** The current hour, minute and weekday in Muscat, for the "running now" card. */
export function muscatNow(now = new Date()): { hour: number; minute: number; weekday: number } {
  const local = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  return { hour: local.getUTCHours(), minute: local.getUTCMinutes(), weekday: local.getUTCDay() }
}

/** The last 90 days in Muscat, inclusive, the period the figures default to. */
export function lastDays(days: number, today: string): { from: string; to: string } {
  const end = new Date(`${today}T00:00:00Z`)
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  return { from: start.toISOString().slice(0, 10), to: today }
}

/* ------------------------------------------------------------------ refusals */

const REFUSALS: Record<string, string> = {
  PRICE_RULE_NAME_REQUIRED: 'priceRules.refusal.nameRequired',
  PRICE_RULE_KIND_INVALID: 'priceRules.refusal.kindInvalid',
  PRICE_RULE_TARGETS_INVALID: 'priceRules.refusal.targetsInvalid',
  PRICE_RULE_TIERS_INVALID: 'priceRules.refusal.tiersInvalid',
  PRICE_RULE_WINDOWS_INVALID: 'priceRules.refusal.windowsInvalid',
  PRICE_RULE_CUSTOMERS_INVALID: 'priceRules.refusal.customersInvalid',
  PRICE_RULE_OFFER_INVALID: 'priceRules.refusal.offerInvalid',
  PRICE_RULE_DATES_INVALID: 'priceRules.refusal.datesInvalid',
  PRICE_RULE_INVALID: 'priceRules.refusal.invalid',
  PRICE_RULE_TARGET_NOT_FOUND: 'priceRules.refusal.targetNotFound',
  PRICE_RULE_CUSTOMER_NOT_FOUND: 'priceRules.refusal.customerNotFound',
  PRICE_RULE_BRANCH_NOT_FOUND: 'priceRules.refusal.branchNotFound',
  PRICE_RULE_NAME_DUPLICATE: 'priceRules.refusal.nameDuplicate',
  PRICE_RULE_ARCHIVED: 'priceRules.refusal.archived',
  PRICE_RULE_NOT_FOUND: 'priceRules.refusal.notFound',
  PRICE_RULE_VERSION_CONFLICT: 'priceRules.refusal.versionConflict',
  PRICE_RULE_KEY_REUSED: 'priceRules.refusal.keyReused',
  PRICE_RULE_PAUSE_INVALID: 'priceRules.refusal.pauseInvalid',
  PRICE_RULE_KIND_NOT_AVAILABLE: 'priceRules.refusal.comingLater',
  PRICE_RULE_COUNT_PER_NOT_AVAILABLE: 'priceRules.refusal.comingLater',
  PRICE_RULE_STACKING_NOT_AVAILABLE: 'priceRules.refusal.comingLater',
  PRICE_RULE_REPORT_PERIOD_INVALID: 'priceRules.refusal.periodInvalid',
  PRICE_RULE_REPORT_PAGE_INVALID: 'priceRules.refusal.periodInvalid',
  PRICE_RULE_NOT_APPLICABLE: 'priceRules.refusal.notApplicable',
}

/**
 * A price rule refusal in our words (never the server's `detail`), or null for the shared
 * sentence. A read-only subscription (`SUBSCRIPTION_*`, action CHANGE_PRICE_RULES) is worded by
 * `describeApiFailure` before this is asked.
 */
export function priceRuleRefusalKey(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code === null) return null
  return Object.hasOwn(REFUSALS, error.code) ? REFUSALS[error.code] : null
}

/** `422 PRICE_RULE_BELOW_COST {items}`: going live needs `acknowledgeBelowCost: true`. */
export function belowCostItems(error: unknown): PriceRuleDto['belowCost'] {
  if (!(error instanceof ApiError) || error.code !== 'PRICE_RULE_BELOW_COST') return null
  const items = error.problem.items
  return Array.isArray(items) ? (items as NonNullable<PriceRuleDto['belowCost']>) : []
}

export { omr }
