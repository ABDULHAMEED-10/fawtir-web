import { useEffect, useRef, useState } from 'react'
import {
  BILLING_CYCLE,
  planCodeFor,
  readSignupStatus,
  type SignupStatusPlan,
} from '../lib/identity/onboarding'
import { readOnboardingSession } from '../lib/identity/onboardingSession'
import type { BillingCycle, PlanId } from '../lib/pricing'

export type PlanTermsRead =
  | { status: 'loading' }
  /** `terms: null`: the server gave no figures for this choice (an older server, or none saved). */
  | { status: 'ready'; terms: SignupStatusPlan | null }

const describes = (
  terms: SignupStatusPlan | null | undefined,
  plan: PlanId,
  billing: BillingCycle,
) =>
  Boolean(terms) &&
  terms?.planCode === planCodeFor(plan) &&
  terms?.billingCycle === BILLING_CYCLE[billing]

/**
 * What the saved plan costs, as `/signup/status` computed it (catalogue contract §10, §14), read
 * from the server on every visit. Figures carried in the tab's history are never trusted: after
 * browser Back the local run re-chose the same plan and cycle at a newer price version, and the
 * carried figures for the older version were shown as the bill. Figures for another plan or cycle
 * are never shown against this one; the amounts then read as unavailable.
 */
export function useSignupPlanTerms(plan: PlanId, billing: BillingCycle): PlanTermsRead {
  const [read, setRead] = useState<PlanTermsRead>({ status: 'loading' })
  // StrictMode replays effects in development; the ref keeps that to one status request per choice.
  const requested = useRef<string | null>(null)

  useEffect(() => {
    const choice = `${plan}:${billing}`
    if (requested.current === choice) return
    requested.current = choice
    const token = readOnboardingSession()?.onboardingToken
    if (!token) {
      setRead({ status: 'ready', terms: null })
      return
    }
    setRead({ status: 'loading' })
    readSignupStatus(token).then(
      (status) => {
        const terms = status?.plan
        setRead({ status: 'ready', terms: terms && describes(terms, plan, billing) ? terms : null })
      },
      // The save itself reports an ended session; here the amounts are simply not known.
      () => setRead({ status: 'ready', terms: null }),
    )
  }, [plan, billing])

  return read
}

/** The three figures a bill needs, when the server sent all three. */
export function billAmounts(terms: SignupStatusPlan | null) {
  if (!terms?.amountExclVat || !terms.vatAmount || !terms.amountInclVat) return null
  return { exclVat: terms.amountExclVat, vat: terms.vatAmount, inclVat: terms.amountInclVat }
}

/**
 * The VAT rate as a percentage for a label. The backend sends a fraction (`"0.05"`); a value
 * above 1 is taken as already a percentage. `null` when it cannot be read.
 */
export function vatPercent(rate: string | null | undefined): string | null {
  const value = Number(rate)
  if (rate == null || rate === '' || !Number.isFinite(value) || value < 0) return null
  const percent = value <= 1 ? value * 100 : value
  return String(Math.round(percent * 100) / 100)
}
