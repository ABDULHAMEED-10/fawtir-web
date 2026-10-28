import { useCallback, useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { sharedRequest } from '../../api'
import {
  baisaOf,
  type CatalogueReader,
  type SignupCataloguePlan,
} from '../../lib/identity/signupPlans'
import type { AnyPlanId } from '../../lib/plans'
import { formatBaisa, type BillingCycle } from '../../lib/pricing'

export type CatalogueRead =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; plans: SignupCataloguePlan[] }

/**
 * The published catalogue for a screen. A failed read stays failed until the reader retries: an
 * integrated screen never falls back to the launch figures in `lib/plans.ts` (MOCK_DATA_POLICY
 * §1), because a price shown here is the price the registrant is choosing.
 */
export function usePlanCatalogue(key: string, reader: CatalogueReader) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{ attempt: number; read: CatalogueRead } | null>(null)

  useEffect(() => {
    let active = true
    // Joined, not aborted: StrictMode runs the effect twice and an aborted read was still sent.
    sharedRequest(`${key}#${attempt}`, () => reader()).then(
      (plans) => {
        if (active) setSettled({ attempt, read: { status: 'ready', plans } })
      },
      () => {
        if (active) setSettled({ attempt, read: { status: 'failed' } })
      },
    )
    return () => {
      active = false
    }
  }, [key, reader, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const read: CatalogueRead =
    settled && settled.attempt === attempt ? settled.read : { status: 'loading' }
  return { read, reload }
}

const arabic = (language: string) => language.startsWith('ar')

/** The plan's name in the reader's language; a plan published without an Arabic name keeps its English one. */
export const planName = (plan: SignupCataloguePlan, language: string) =>
  (arabic(language) ? plan.nameAr : null) || plan.nameEn

/** The published description in the reader's language, or `null` when none was published. */
export const planDescription = (plan: SignupCataloguePlan, language: string) =>
  (arabic(language) ? plan.descriptionAr : plan.descriptionEn) || null

/** The launch plans the app already has card copy for (`plans.<key>.*`, `plan.audience.*`). */
const LAUNCH_COPY: Record<string, { key: string; audience: AnyPlanId; lines: number }> = {
  STARTER: { key: 'starter', audience: 'starter', lines: 6 },
  BUSINESS: { key: 'premium', audience: 'business', lines: 5 },
  BUSINESS_PLUS: { key: 'businessPlus', audience: 'businessPlus', lines: 5 },
}
export const launchCopy = (code: string) => (Object.hasOwn(LAUNCH_COPY, code) ? LAUNCH_COPY[code] : undefined)

/** The card line, by number, that names the ERP add-on on a launch plan that sells it (ER-1). */
const ADDON_LINE: Record<string, number> = { BUSINESS_PLUS: 5 }

/**
 * A launch plan's card lines in words, or `null` for a plan the app has no card copy for. The ERP
 * add-on line follows the catalogue's `erpAddon` (ER-1, PL-7): with the published monthly price
 * when the plan sells it now, and left out when `erpAddon` is null or absent, so a card never
 * claims an add-on that cannot be bought or prices it with a figure the console did not set.
 */
export function launchFeatures(plan: SignupCataloguePlan, t: TFunction): string[] | null {
  const copy = launchCopy(plan.code)
  if (!copy) return null
  const addonLine = Object.hasOwn(ADDON_LINE, plan.code) ? ADDON_LINE[plan.code] : undefined
  const addonBaisa = baisaOf(plan.erpAddon?.monthlyPrice)
  return Array.from({ length: copy.lines }, (_, i) => i + 1).flatMap((line) => {
    if (line !== addonLine) return [t(`plans.${copy.key}.features.f${line}`)]
    return addonBaisa === null
      ? []
      : [t(`plans.${copy.key}.features.f${line}`, { price: fullRial(addonBaisa) })]
  })
}

/**
 * The price of one full period of the chosen cycle, in baisa: the month, or the published year.
 * Owner, 9 Oct 2026: an annual plan shows what the year actually costs, not a monthly equivalent.
 */
export function periodPriceBaisa(plan: SignupCataloguePlan, billing: BillingCycle): number | null {
  return baisaOf(billing === 'monthly' ? plan.monthlyPrice : plan.annualPrice)
}

/** A rial figure to three places with thousands separators, as the site and the tables print it. */
export function fullRial(baisa: number | null): string {
  if (baisa === null) return '—'
  const [whole, fraction] = formatBaisa(baisa).split('.')
  return `${Number(whole).toLocaleString('en-US')}.${fraction}`
}

/**
 * A server amount (a three-decimal OMR string) printed as {@link fullRial} prints it, so sign-up
 * shows `1,500.000` wherever the plans page does. Anything that is not such a figure is shown as
 * sent, never guessed at.
 */
export function fullRialOf(amount: string): string {
  const baisa = baisaOf(amount)
  return baisa === null ? amount : fullRial(baisa)
}

export type TrialSummary =
  { kind: 'uniform'; days: number; documents: number | null } | { kind: 'none' } | { kind: 'mixed' }

/** One trial line serves the page only when every plan carries the same trial. */
export function trialSummary(plans: readonly SignupCataloguePlan[]): TrialSummary {
  const trials = plans.map((plan) => `${plan.trialDays ?? ''}/${plan.trialDocuments ?? ''}`)
  if (plans.length === 0 || plans.every((plan) => plan.trialDays === null)) return { kind: 'none' }
  if (new Set(trials).size > 1) return { kind: 'mixed' }
  const [first] = plans
  return { kind: 'uniform', days: first.trialDays as number, documents: first.trialDocuments }
}

/**
 * The trial sentence under the cards, or `null` when no plan carries a trial: the page then makes
 * no trial promise at all, since the first bill of such a plan goes out on approval.
 */
export function trialNote(
  t: TFunction,
  plans: readonly SignupCataloguePlan[],
  language: string,
): string | null {
  const trial = trialSummary(plans)
  if (trial.kind === 'none') return null
  if (trial.kind === 'uniform') {
    return trial.documents === null
      ? t('plans.trialNoteDays', { count: trial.days })
      : t('plans.trialNote', { count: trial.days, documents: trial.documents })
  }
  const each = plans
    .filter((plan) => plan.trialDays !== null)
    .map((plan) =>
      t('plans.trialNotePlan', { plan: planName(plan, language), count: plan.trialDays }),
    )
  return t('plans.trialNoteMixed', { plans: each.join(t('plans.listSeparator')) })
}

/**
 * How many months the annual cycle gives free, for the switch's note: the same figure for every
 * plan, or the largest when they differ ("up to"). `null` when no plan gives any.
 */
export function freeMonthsSummary(
  plans: readonly SignupCataloguePlan[],
): { count: number; upTo: boolean } | null {
  const months = plans.map((plan) => plan.annualFreeMonths)
  const most = Math.max(0, ...months)
  if (most === 0) return null
  return { count: most, upTo: months.some((count) => count !== most) }
}

/** The note beside the billing switch, or `null` when annual billing saves nothing. */
export function annualSavingNote(t: TFunction, plans: readonly SignupCataloguePlan[]) {
  const months = freeMonthsSummary(plans)
  if (!months) return null
  return t(months.upTo ? 'plans.saveAnnualUpTo' : 'plans.saveAnnualMonths', {
    count: months.count,
  })
}
