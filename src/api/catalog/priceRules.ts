import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { withQuery } from '../query'

/**
 * Price rules (`PriceRuleController`, catalogue package 10, backend PRs #795, #796, #799, #800).
 * A rule says when an item costs less than its catalogue price: by quantity (VOLUME), at certain
 * times (TIME, Asia/Muscat) or for particular customers (CUSTOMER). The unit price on a line never
 * changes: a rule's saving is the line's ordinary discount, naming the rule in `priceRuleIds`.
 *
 * Reading (the list, one rule, the reports) needs `product.read`; create, edit, switch and archive
 * need `product.manage` and are refused while the subscription is read-only (ST-2, action
 * `CHANGE_PRICE_RULES`). The till's cache and the composer's suggestion need `pos.sell` or
 * `invoice.draft`. Amounts are OMR at three decimals.
 */
export const PRICE_RULES_PATH = '/v1/price-rules'
export const PRICE_RULES_ACTIVE_PATH = `${PRICE_RULES_PATH}/active`
export const PRICE_RULES_EVALUATE_PATH = `${PRICE_RULES_PATH}/evaluate`
export const PRICE_RULES_REPORT_PATH = `${PRICE_RULES_PATH}/report`
export const PRICE_RULES_REPORT_CSV_PATH = `${PRICE_RULES_PATH}/report.csv`

export const PRICE_RULES_READ = 'product.read'
export const PRICE_RULES_MANAGE = 'product.manage'

export type PriceRuleKind = 'VOLUME' | 'TIME' | 'CUSTOMER'
export type PriceRuleTargetType = 'ALL' | 'GROUP' | 'KIND' | 'PRODUCT' | 'VARIANT'
export type PriceRuleCountedAs = 'ACROSS_TARGETS' | 'PER_ITEM'

export type PriceRuleTarget = {
  type: PriceRuleTargetType
  id?: string | null
  /** On the answer: the product of a PRODUCT or VARIANT target. */
  productId?: string | null
}

export type PriceRuleTier = {
  fromQty: number
  toQty: number | null
  priceEach: number | null
  percentOff: number | null
}

/** `days` 0 = Sunday ... 6 = Saturday; `from` is included, `to` is not; "HH:mm". */
export type PriceRuleWindow = { days: number[]; from: string; to: string }

export type PriceRuleCustomers = { customerIds: string[]; tags: string[] }

/** Exactly one of the two. */
export type PriceRuleOffer = { percentOff: number | null; priceEach: number | null }

/** `PriceRuleRequest`: create and edit. A field another kind uses is refused 400. */
export type PriceRuleRequest = {
  name: string
  kind: PriceRuleKind
  validFrom?: string | null
  validTo?: string | null
  priority?: number
  targets: PriceRuleTarget[]
  countedAs?: PriceRuleCountedAs
  countPer?: 'INVOICE'
  tiers?: PriceRuleTier[]
  extrasOnly?: boolean
  windows?: PriceRuleWindow[]
  customers?: PriceRuleCustomers
  offer?: PriceRuleOffer
  branchIds?: string[]
  atTheTill?: boolean
  showOnInvoice?: boolean
  /** Only `false` in the first version (422 PRICE_RULE_STACKING_NOT_AVAILABLE otherwise). */
  stacks: false
  acknowledgeBelowCost?: boolean
}

/** An item the rule sells below its weighted average cost, once, at the branch it loses most. */
export type PriceRuleBelowCostItem = {
  productId: string
  variantId: string | null
  branchId: string
  averageCost: number
  price: number
  lossEach: number
  /** VOLUME: the tiers below cost, by their first quantity; empty for an offer. */
  fromQtys: number[]
}

/** `PriceRuleResponse`: every route's answer. */
export type PriceRuleDto = {
  id: string
  name: string
  kind: PriceRuleKind
  /** "Applies today": false while paused (`pausedUntil` set), true again from that day. */
  enabled: boolean
  archived: boolean
  archivedAt: string | null
  validFrom: string
  validTo: string | null
  priority: number
  targets: PriceRuleTarget[]
  countedAs: PriceRuleCountedAs | null
  countPer: 'INVOICE'
  tiers: PriceRuleTier[]
  extrasOnly: boolean
  windows: PriceRuleWindow[]
  customers: PriceRuleCustomers | null
  offer: PriceRuleOffer | null
  branchIds: string[]
  atTheTill: boolean
  showOnInvoice: boolean
  stacks: boolean
  version: number
  createdAt: string
  updatedAt: string
  runningNow: boolean
  /** Distinct invoices in the period (list and one rule only; null on the write routes). */
  used: number | null
  givenAway: number | null
  broughtIn: number | null
  pausedUntil: string | null
  belowCostAcknowledged: { by: string; at: string } | null
  /** Write routes only: the items sold below cost, empty when none. Null on the reads. */
  belowCost: PriceRuleBelowCostItem[] | null
}

export type PriceRuleListDto = { items: PriceRuleDto[]; from: string; to: string }

export type PriceRuleListQuery = {
  kind?: PriceRuleKind | null
  enabled?: boolean | null
  branchId?: string | null
  includeArchived?: boolean
  from?: string | null
  to?: string | null
}

export function priceRuleListPath(query: PriceRuleListQuery = {}): string {
  return withQuery(PRICE_RULES_PATH, {
    kind: query.kind,
    enabled: query.enabled,
    branchId: query.branchId,
    includeArchived: query.includeArchived ? true : undefined,
    from: query.from,
    to: query.to,
  })
}

export function loadPriceRules(path: string): Promise<PriceRuleListDto> {
  return apiRequest<PriceRuleListDto>(path)
}

export function priceRulePath(
  ruleId: string,
  query: { branchId?: string | null; from?: string | null; to?: string | null } = {},
): string {
  return withQuery(`${PRICE_RULES_PATH}/${encodeURIComponent(ruleId)}`, query)
}

export function loadPriceRule(path: string): Promise<PriceRuleDto> {
  return apiRequest<PriceRuleDto>(path)
}

/** 201; a new rule is always saved off. The same key with the same rule replays the first. */
export function createPriceRule(
  idempotencyKey: string,
  body: PriceRuleRequest,
): Promise<PriceRuleDto> {
  return apiRequest<PriceRuleDto>(PRICE_RULES_PATH, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** Replaces the whole rule (the kind may change); on/off and a pause are kept. */
export function updatePriceRule(
  ruleId: string,
  expectedVersion: number,
  body: PriceRuleRequest,
): Promise<PriceRuleDto> {
  return apiRequest<PriceRuleDto>(
    withQuery(`${PRICE_RULES_PATH}/${encodeURIComponent(ruleId)}`, { expectedVersion }),
    { method: 'PUT', body },
  )
}

/**
 * On, off, or "Pause it" (`{enabled: false, pauseUntil}`, a day after today in Muscat). Going
 * live with an item below cost needs `acknowledgeBelowCost: true` (422 PRICE_RULE_BELOW_COST).
 */
export type PriceRuleSwitchRequest = {
  enabled: boolean
  pauseUntil?: string | null
  acknowledgeBelowCost?: boolean
}

export function switchPriceRule(
  ruleId: string,
  expectedVersion: number,
  body: PriceRuleSwitchRequest,
): Promise<PriceRuleDto> {
  return apiRequest<PriceRuleDto>(
    withQuery(`${PRICE_RULES_PATH}/${encodeURIComponent(ruleId)}/switch`, { expectedVersion }),
    { method: 'POST', body },
  )
}

/** Switched off and never changed again; it stays on the invoices and reports. No delete. */
export function archivePriceRule(ruleId: string, expectedVersion: number): Promise<PriceRuleDto> {
  return apiRequest<PriceRuleDto>(
    withQuery(`${PRICE_RULES_PATH}/${encodeURIComponent(ruleId)}/archive`, { expectedVersion }),
    { method: 'POST' },
  )
}

/* ------------------------------------------------------------------ reports */

export type PriceRuleReportQuery = {
  from?: string | null
  to?: string | null
  branchId?: string | null
}

export type PriceRuleReportRowDto = {
  ruleId: string
  name: string
  kind: PriceRuleKind
  enabled: boolean
  archived: boolean
  runningNow: boolean
  used: number
  givenAway: number
  broughtIn: number
}

export type PriceRuleReportDto = {
  from: string
  to: string
  branchId: string | null
  currency: 'OMR'
  rules: PriceRuleReportRowDto[]
  totals: {
    rules: number
    runningNow: number
    /** Distinct invoices using any rule. */
    used: number
    givenAway: number
    broughtIn: number
    taxableSales: number
    shareOfSalesPercent: number | null
  }
}

export function priceRuleReportPath(query: PriceRuleReportQuery = {}): string {
  return withQuery(PRICE_RULES_REPORT_PATH, { ...query })
}

export function loadPriceRuleReport(path: string): Promise<PriceRuleReportDto> {
  return apiRequest<PriceRuleReportDto>(path)
}

/** The report's rows plus a Total line (`X-Fawtir-Export-Rows`). */
export function downloadPriceRuleReport(query: PriceRuleReportQuery = {}): Promise<ApiDownload> {
  return apiDownload(withQuery(PRICE_RULES_REPORT_CSV_PATH, { ...query }))
}

export type PriceRuleLineDto = {
  invoiceId: string
  invoiceNumber: string
  invoiceType: string
  issueDate: string
  branchId: string
  branchName: string
  lineNumber: number
  description: string
  /** Negative on a credit note's line. */
  givenAway: number
  taxable: number
}

export type PriceRuleLinesDto = {
  ruleId: string
  from: string
  to: string
  currency: 'OMR'
  page: number
  size: number
  total: number
  items: PriceRuleLineDto[]
}

export function priceRuleLinesPath(
  ruleId: string,
  query: PriceRuleReportQuery & { page?: number; size?: number } = {},
): string {
  return withQuery(`${PRICE_RULES_PATH}/${encodeURIComponent(ruleId)}/lines`, { ...query })
}

export function loadPriceRuleLines(path: string): Promise<PriceRuleLinesDto> {
  return apiRequest<PriceRuleLinesDto>(path)
}

/* --------------------------------------------------- the till and the composer */

/** The branch's live rules for every channel; `version` is also the ETag. */
export type ActivePriceRulesDto = { branchId: string; version: string; items: PriceRuleDto[] }

export function loadActivePriceRules(branchId: string): Promise<ActivePriceRulesDto> {
  return apiRequest<ActivePriceRulesDto>(withQuery(PRICE_RULES_ACTIVE_PATH, { branchId }))
}

export type PriceRuleChannel = 'INVOICE' | 'TILL'

export type PriceRuleEvaluateRequest = {
  branchId: string | null
  customerId: string | null
  channel: PriceRuleChannel
  at?: string | null
  lines: {
    lineNumber: number
    productId: string | null
    variantId: string | null
    addOn: boolean
    quantity: number
    unitPrice: number
  }[]
}

export type PriceRuleSource = 'RULE' | 'PRODUCT_DEFAULT' | 'NONE'

export type PriceRuleReason =
  | 'RULE_APPLIED'
  | 'PRODUCT_DEFAULT_SAVES_MORE'
  | 'NO_RULE'
  | 'PRICE_CHANGED_BY_HAND'
  | 'BUNDLE_PART'
  | 'NOT_A_CATALOGUE_LINE'

export type PriceRuleOutcomeDto = {
  lineNumber: number
  source: PriceRuleSource
  reason: PriceRuleReason
  priceRuleIds: string[]
  ruleName: string | null
  ruleKind: PriceRuleKind | null
  showOnInvoice: boolean
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | null
  discountValue: number | null
  saving: number
}

export type PriceRuleEvaluateDto = { at: string; lines: PriceRuleOutcomeDto[] }

/** A suggestion per line; writes nothing. */
export function evaluatePriceRules(body: PriceRuleEvaluateRequest): Promise<PriceRuleEvaluateDto> {
  return apiRequest<PriceRuleEvaluateDto>(PRICE_RULES_EVALUATE_PATH, { method: 'POST', body })
}

/** A key for one create, 16 to 128 of `[A-Za-z0-9._:-]`. */
export function newPriceRuleKey(): string {
  return `price-rule-${crypto.randomUUID()}`
}
