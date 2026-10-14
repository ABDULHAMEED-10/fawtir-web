import { baisaOf, type SignupCataloguePlan } from '../../lib/identity/signupPlans'
import { FEATURES, FEATURE_GROUPS, type Feature } from '../../lib/plans'
import { DEFAULT_SETTINGS, PLATFORM_SETTINGS } from '../../lib/platformSettings'
import { launchCopy, trialSummary } from './catalogueView'

/*
 * The full comparison behind the cards: the limits, then every feature the published catalogue
 * lists, grouped the way the console's plan editor groups them, so a buyer who wants the detail
 * can read it without leaving sign-up. A `null` column is Enterprise: Business Plus with limits
 * agreed on a call, so its feature cells match Business Plus and its limit cells say so.
 */

export type Cell =
  | { kind: 'check' }
  | { kind: 'dash' }
  | { kind: 'text'; key: string; params?: Record<string, unknown> }
  /** Baisa; `null` for an amount the server sent in a shape that cannot be read. */
  | { kind: 'money'; baisa: number | null }

export type Column = SignupCataloguePlan | null
export type Row = { key: string; labelKey: string; cell: (plan: Column) => Cell }
export type Group = { key: string; labelKey: string; rows: Row[] }

const count = (value: number) => value.toLocaleString('en-US')
const check: Cell = { kind: 'check' }
const dash: Cell = { kind: 'dash' }
const text = (key: string, params?: Record<string, unknown>): Cell => ({
  kind: 'text',
  key,
  params,
})
/** A cell from the table's own vocabulary (`plans.compare.value.*`). */
const value = (key: string, params?: Record<string, unknown>) =>
  text(`plans.compare.value.${key}`, params)
/** An optional price: `null` means the plan does not offer it (V176 null meanings). */
const price = (amount: string | null) =>
  amount === null ? value('notOffered') : { kind: 'money' as const, baisa: baisaOf(amount) }
const flag = (on: boolean): Cell => (on ? check : dash)
/** Enterprise negotiates every figure. */
const negotiated = value('negotiated')
const agreed = value('agreed')

const limitRow = (key: string, cell: Row['cell']): Row => ({
  key,
  labelKey: `plans.compare.row.${key}`,
  cell,
})

/** The limits first: how much of everything a plan allows, and what more costs. */
const LIMIT_GROUPS: Group[] = [
  {
    key: 'documents',
    labelKey: 'plans.compare.group.documents',
    rows: [
      limitRow('documents', (p) =>
        p ? value('count', { count: count(p.invoicesPerMonth) }) : agreed,
      ),
      limitRow('overage', (p) => (p ? price(p.overagePricePerInvoice) : negotiated)),
    ],
  },
  {
    key: 'people',
    labelKey: 'plans.compare.group.people',
    rows: [
      limitRow('people', (p) => (p ? value('count', { count: count(p.peopleIncluded) }) : agreed)),
      limitRow('extraPerson', (p) => (p ? price(p.extraPersonPrice) : negotiated)),
      limitRow('branches', (p) =>
        p
          ? p.branchesIncluded === null
            ? value('unlimited')
            : value('count', { count: count(p.branchesIncluded) })
          : agreed,
      ),
      limitRow('extraBranch', (p) => (p ? price(p.extraBranchPrice) : negotiated)),
      limitRow('accountants', () => value('free')),
    ],
  },
]

const enabled = (plan: SignupCataloguePlan, feature: string) =>
  plan.features.some((entry) => entry.key === feature && entry.enabled)

/**
 * The extraction add-on is a console setting per launch plan, not a catalogue feature; a plan the
 * setting does not name is shown as not offering it rather than guessed.
 */
function extraction(plan: Column): Cell {
  const availability = PLATFORM_SETTINGS.addons.erpExtraction.availability
  const id = plan ? launchCopy(plan.code)?.audience : 'enterprise'
  return text(`plan.extraction.${id ? availability[id] : 'notOffered'}`)
}

/**
 * Every feature the catalogue lists, in the editor's groups. A key the app has no label for is
 * left out (it would print as a raw key), and so is a known one no plan lists: the table shows
 * what the catalogue says, not the launch matrix.
 */
function featureGroups(plans: readonly SignupCataloguePlan[]): Group[] {
  const listed = new Set(plans.flatMap((plan) => plan.features.map((entry) => entry.key)))
  return FEATURE_GROUPS.map((group) => ({
    // Prefixed: the limits table has a "people" group too, and both render in one tbody, where the
    // shared React key made one of them be dropped or duplicated on re-render.
    key: `feature-${group.id}`,
    labelKey: `plan.featureGroup.${group.id}`,
    rows: [
      ...group.features
        .filter((feature) => listed.has(feature))
        .map((feature: Feature): Row => ({
          key: feature,
          labelKey: `plan.featureName.${feature}`,
          cell: (p) => flag(p ? enabled(p, feature) : FEATURES.enterprise[feature]),
        })),
      ...(group.id === 'integration'
        ? [
            {
              key: 'erpExtraction',
              labelKey: 'plan.extraction.name',
              cell: extraction,
            } satisfies Row,
          ]
        : []),
    ],
  })).filter((group) => group.rows.length > 0)
}

const SUPPORT_GROUP: Group = {
  key: 'support',
  labelKey: 'plans.compare.group.support',
  rows: [
    limitRow('support', (p) =>
      // Enterprise differs from Business Plus by limits alone, support included.
      p ? value(p.prioritySupport ? 'emailChat' : 'email') : value('emailChat'),
    ),
    limitRow('annual', (p) =>
      p
        ? p.annualFreeMonths > 0
          ? value('monthsFree', { count: p.annualFreeMonths })
          : dash
        : negotiated,
    ),
    limitRow('vat', () => {
      const rate = subscriptionVatPercent()
      return rate > 0 ? value('vatExcl', { rate }) : value('noVat')
    }),
  ],
}

/** Also read by the public pricing page, so both tables list the same rows. */
export const comparisonGroups = (plans: readonly SignupCataloguePlan[]): Group[] => [
  ...LIMIT_GROUPS,
  ...featureGroups(plans),
  SUPPORT_GROUP,
]

/** The catalogue's plans in its order, then Enterprise. */
export const comparisonColumns = (plans: readonly SignupCataloguePlan[]): Column[] => [
  ...plans,
  null,
]

export const FAQ_COUNT = 9

/**
 * The console's VAT rate as a percentage. The seller differs per environment (testing sells
 * without VAT), so no screen may quote a fixed 5%; at 0 the answers say no VAT is added.
 */
const subscriptionVatPercent = () => Math.round(PLATFORM_SETTINGS.billing.vatRate * 10_000) / 100

export type FaqParams = ReturnType<typeof faqParams>

/**
 * The figures the answers quote: the trial from the catalogue, the rest from the platform
 * defaults. Without a catalogue (not read yet, or unreadable) there is no trial figure to quote.
 */
export function faqParams(plans: readonly SignupCataloguePlan[] | null) {
  const { notices, lifecycle } = DEFAULT_SETTINGS
  const trial = plans ? trialSummary(plans) : null
  const uniform = trial?.kind === 'uniform' && trial.documents !== null ? trial : null
  return {
    days: uniform?.days,
    documents: uniform?.documents,
    thresholds: notices.thresholds.join(', '),
    grace: lifecycle.graceDays,
    // The grace answer counts days, and Arabic words a count by its plural form.
    count: lifecycle.graceDays,
    rate: subscriptionVatPercent(),
  }
}

/** The first answer quotes the trial, so it has a wording for plans that do not share one. */
export const faqAnswerKey = (index: number, params: FaqParams) =>
  index === 0 && params.days === undefined
    ? 'plans.faq.a1Varies'
    : index === 6 && params.rate === 0
      ? 'plans.faq.a7NoVat'
      : `plans.faq.a${index + 1}`
