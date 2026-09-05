/**
 * Catalog › Price rules (Figma 135:50361) and a new one (135:51027).
 *
 * A rule says when something should cost less than its normal price. Whether a rule is running
 * *now* is a question about the clock, not a stored flag, so it is answered from the schedule.
 */

import { omr } from './catalog'

/** The clock the "running right now" card reads. Thursday morning, as the design draws it. */
export const NOW = { hour: 9, minute: 14, weekday: 4 }

export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export type Break = {
  from: number
  to: number | null
  price: number
  labelKey?: string
  label?: string
}

export type Rule = {
  id: string
  name: string
  scopeKey: string
  scopeValues?: Record<string, string | number>
  family: 'volume' | 'time' | 'customer'
  on: boolean
  /** Volume rules drop the price as the quantity climbs. */
  breaks?: Break[]
  /** Time rules run inside a window on chosen days. */
  window?: { fromHour: number; toHour: number; days: number[] }
  whoKey: string
  whoValues?: Record<string, string | number>
  used: number
  givenAway: number
  broughtIn: number
  extraKey?: string
  extraValues?: Record<string, string | number>
  since?: string
  offNoteKey?: string
  offNoteValues?: Record<string, string | number>
  /** A rule set up as a bundle shows on the till as one button. */
  asBundle?: boolean
}

export const RULES: Rule[] = [
  {
    id: 'wholesale-beans',
    name: 'Wholesale beans',
    scopeKey: 'priceRules.scope.everythingIn',
    scopeValues: { group: 'Green beans', note: '1 kg bags only' },
    family: 'volume',
    on: true,
    breaks: [
      { from: 1, to: 4, price: 9.5, label: '1 – 4 bags' },
      { from: 5, to: 9, price: 8.7, label: '5 – 9' },
      { from: 10, to: 24, price: 8.0, label: '10 – 24' },
      { from: 25, to: null, price: 7.2, label: '25 or more' },
    ],
    whoKey: 'priceRules.who.anyoneBuyingThatMany',
    used: 88,
    givenAway: 612.4,
    broughtIn: 4_118,
    extraKey: 'priceRules.averageOrder',
    extraValues: { value: '14 bags' },
  },
  {
    id: 'roast-a-batch',
    name: 'Roast a batch, then another',
    scopeKey: 'priceRules.scope.perInvoice',
    scopeValues: { group: 'Roasting services' },
    family: 'volume',
    on: true,
    breaks: [
      { from: 1, to: 1, price: 4.2, labelKey: 'priceRules.firstBatch' },
      { from: 2, to: 5, price: 3.5, label: '2 – 5' },
      { from: 6, to: null, price: 3.0, label: '6 or more' },
    ],
    whoKey: 'priceRules.who.cheaperAppliesToExtras',
    used: 147,
    givenAway: 398.2,
    broughtIn: 1_864.5,
    extraKey: 'priceRules.averageBooking',
    extraValues: { value: '4.1 batches' },
  },
  {
    id: 'afternoon-lull',
    name: 'Afternoon lull',
    scopeKey: 'priceRules.scope.allBrewedWeekdays',
    family: 'time',
    on: true,
    window: { fromHour: 14, toHour: 17, days: [0, 1, 2, 3, 4] },
    whoKey: 'priceRules.who.twentyOffBrewed',
    used: 1_104,
    givenAway: 274.1,
    broughtIn: 683.4,
    extraKey: 'priceRules.afternoonSalesUp',
    extraValues: { percent: 61 },
    since: '4 Feb',
  },
  {
    id: 'morning-deal',
    name: 'Morning deal',
    scopeKey: 'priceRules.scope.flatWhiteOrCappuccino',
    family: 'time',
    on: true,
    asBundle: true,
    window: { fromHour: 6, toHour: 10, days: [0, 1, 2, 3, 4, 5, 6] },
    whoKey: 'priceRules.who.thePairFor',
    whoValues: { price: '2.300', instead: '2.700' },
    used: 68,
    givenAway: 27.2,
    broughtIn: 274.3,
    extraKey: 'priceRules.pastriesSoldWithIt',
    extraValues: { count: 68, total: 214 },
    since: '4 Feb',
  },
  {
    id: 'hotel-accounts',
    name: 'Hotel accounts',
    scopeKey: 'priceRules.scope.twelveOffEverything',
    scopeValues: { customers: 4 },
    family: 'customer',
    on: false,
    whoKey: 'priceRules.who.namedCustomers',
    whoValues: { count: 4 },
    used: 5,
    givenAway: 0,
    broughtIn: 0,
    offNoteKey: 'priceRules.switchedOffNote',
    offNoteValues: { open: 2, total: 4 },
    since: '1 Jul',
  },
]

export const RULE_FAMILIES = [
  { id: 'volume', titleKey: 'priceRules.family.volume' },
  { id: 'time', titleKey: 'priceRules.family.time' },
  { id: 'customer', titleKey: 'priceRules.family.customer' },
]

/**
 * Whether the rule would apply to a sale made this minute.
 *
 * A rule with no schedule always would, which is why the card at the top counts more rules than
 * the badge lights up.
 */
export function isRunningNow(rule: Rule) {
  if (!rule.on) return false
  if (!rule.window) return true
  return isInWindowNow(rule)
}

/** Whether a rule's own time window is open right now — what the badge announces. */
export function isInWindowNow(rule: Rule) {
  if (!rule.on || !rule.window) return false
  const { fromHour, toHour, days } = rule.window
  return days.includes(NOW.weekday) && NOW.hour >= fromHour && NOW.hour < toHour
}

export const RUNNING = RULES.filter((rule) => rule.on)
export const SWITCHED_OFF_RULES = RULES.filter((rule) => !rule.on)
export const RUNNING_NOW = RULES.filter(isRunningNow)

/**
 * What the four cards say.
 *
 * The design's "given away" card printed 1,284.700, which is the first three rules; the Morning
 * deal's own card says 27.200 as well, so the total is summed here rather than transcribed.
 */
export const RULES_SUMMARY = () => ({
  count: RULES.length,
  running: RUNNING.length,
  off: SWITCHED_OFF_RULES.length,
  givenAway: Math.round(RULES.reduce((total, rule) => total + rule.givenAway, 0) * 1000) / 1000,
  broughtIn: Math.round(RULES.reduce((total, rule) => total + rule.broughtIn, 0) * 1000) / 1000,
  used: RULES.reduce((total, rule) => total + rule.used, 0),
  runningNow: RUNNING_NOW.length,
})

/** Share of everything sold that went through a rule. */
export const SHARE_OF_SALES = 3.6

/** What each break saves against the first one, as the bar and the percentage show. */
export function breakSaving(breaks: Break[], index: number) {
  const top = breaks[0].price
  const price = breaks[index].price
  if (index === 0) return { percent: 0, share: 1 }
  return {
    percent: Math.round(((price - top) / top) * 100),
    share: price / top,
  }
}

export const RULE_MENU_STATS = (rule: Rule) => ({ used: rule.used })

/* ----------------------------------------------------------------- a new rule */

export const RULE_KINDS = [
  { id: 'volume', titleKey: 'newRule.kind.volume', noteKey: 'newRule.kind.volumeNote' },
  { id: 'time', titleKey: 'newRule.kind.time', noteKey: 'newRule.kind.timeNote' },
  { id: 'customer', titleKey: 'newRule.kind.customer', noteKey: 'newRule.kind.customerNote' },
  { id: 'buyOneGet', titleKey: 'newRule.kind.buyOneGet', noteKey: 'newRule.kind.buyOneGetNote' },
]

export const COUNTED_OPTIONS = [
  { id: 'acrossEverything', labelKey: 'newRule.count.acrossEverything' },
  { id: 'perItem', labelKey: 'newRule.count.perItem' },
]

export const PER_OPTIONS = [
  { id: 'oneInvoice', labelKey: 'newRule.perOption.oneInvoice' },
  { id: 'oneMonth', labelKey: 'newRule.perOption.oneMonth' },
  { id: 'oneYear', labelKey: 'newRule.perOption.oneYear' },
]

/** What the worked example is built from — filters, which the business buys at a known cost. */
export const NEW_RULE = {
  name: 'Wholesale filters',
  appliesTo: [
    {
      id: 'paper-filters-100',
      labelKey: 'newRule.oneItem',
      name: 'Paper filters pack of 100',
      items: 1,
    },
    { id: 'bags', labelKey: 'newRule.nItems', name: 'Packaging › Bags', items: 6 },
  ],
  counted: 'acrossEverything',
  per: 'oneInvoice',
  starts: '1 August 2026',
  ends: '',
  /** What a pack costs to buy, so a break below it can be called out as losing money. */
  cost: 1.33,
  normalPrice: 1.85,
  breaks: [
    { from: 1, to: 9, price: 1.85 },
    { from: 10, to: 29, price: 1.65 },
    { from: 30, to: 59, price: 1.45 },
    { from: 60, to: null, price: 1.2 },
  ] as Break[],
  extrasOnly: false,
  stacks: false,
  showOnInvoice: true,
  atTheTill: false,
  tryQuantity: 34,
}

export const VAT_RATE = 0.05

/** What one break keeps per unit, and whether it is below cost. */
export function keepOn(price: number, cost: number) {
  const keep = Math.round((price - cost) * 1000) / 1000
  return {
    keep,
    marginPercent: price > 0 ? Math.round(((price - cost) / price) * 100) : 0,
    losing: keep < 0,
  }
}

export const itemsCovered = (appliesTo: { items: number }[]) =>
  appliesTo.reduce((total, entry) => total + entry.items, 0)

/** Which break a quantity falls into. */
export function breakFor(breaks: Break[], quantity: number) {
  return [...breaks].reverse().find((entry) => quantity >= entry.from) ?? breaks[0]
}

/** The worked example on the right, from the quantity typed into it. */
export function tryItOut(quantity: number, breaks: Break[], normalPrice: number) {
  const chosen = breakFor(breaks, quantity)
  const normally = Math.round(quantity * normalPrice * 1000) / 1000
  const withRule = Math.round(quantity * chosen.price * 1000) / 1000
  const save = Math.round((normally - withRule) * 1000) / 1000
  const vat = Math.round(withRule * VAT_RATE * 1000) / 1000
  return {
    chosen,
    normally,
    withRule,
    save,
    savePercent: normally > 0 ? Math.round((save / normally) * 100) : 0,
    vat,
    pay: Math.round((withRule + vat) * 1000) / 1000,
  }
}

/** Rules that already cover any of the same items. */
export const CLASHES = [
  { id: 'wholesale-beans', name: 'Wholesale beans', overlapKey: 'newRule.noOverlap' },
  { id: 'afternoon-lull', name: 'Afternoon lull', overlapKey: 'newRule.noOverlap' },
  {
    id: 'hotel-accounts',
    name: 'Hotel accounts',
    overlapKey: 'newRule.coversNOfYours',
    overlapValues: { count: 2 },
    warn: true,
  },
]

export { omr }
