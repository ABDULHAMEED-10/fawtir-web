import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { BackButton, OmAmount, PricingCard, SegmentedControl } from '../../components/ui'
import { ChevronDownIcon } from '../../components/ui/icons'
import {
  CATALOGUE,
  TRIAL,
  annualMonthly,
  type AnyPlanId,
  type CataloguePlan,
} from '../../lib/plans'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import { PAYMENT_ROUTE, REVIEW_ROUTE, recordPlan } from '../../lib/identity/onboarding'
import { onboardingStateFrom, type OnboardingState } from '../../lib/onboarding'
import type { PlanId } from '../../lib/pricing'
import { PlanComparison, PlanFaq } from './PlanComparison'
import patternLeft from '../../assets/plans/pattern-left.png'
import patternRight from '../../assets/plans/pattern-right.png'
import checkIcon from '../../assets/plans/check.svg'
import checkWhiteIcon from '../../assets/plans/check-white.svg'
import checkFooterIcon from '../../assets/plans/check-footer.svg'
import invoiceIcon from '../../assets/plans/invoice.svg'
import invoiceWhiteIcon from '../../assets/plans/invoice-white.svg'
import usersIcon from '../../assets/plans/users.svg'
import usersWhiteIcon from '../../assets/plans/users-white.svg'

type BillingCycle = 'monthly' | 'annual'

/**
 * The sign-up flow's four plans, drawn from the launch catalogue (`Fawtir_Pricing_Model` §2, §6
 * and the plan ruling of 20 Sep 2026): Starter, Business, Business Plus and Enterprise. The
 * design drew three; the pricing doc has four, so Business Plus takes the same card. `premium` is
 * the flow's own id for Business; `audience` is the catalogue's id, which names who the plan is
 * for. Enterprise is Business Plus with limits agreed on a call, so it has no figure to print.
 */
const CARDS: {
  id: PlanId
  plan?: CataloguePlan
  key: string
  audience: AnyPlanId
  features: number
  dark?: boolean
}[] = [
  { id: 'starter', plan: CATALOGUE[0], key: 'starter', audience: 'starter', features: 6 },
  {
    id: 'premium',
    plan: CATALOGUE[1],
    key: 'premium',
    audience: 'business',
    features: 5,
    dark: true,
  },
  {
    id: 'businessPlus',
    plan: CATALOGUE[2],
    key: 'businessPlus',
    audience: 'businessPlus',
    features: 5,
  },
  { id: 'enterprise', key: 'enterprise', audience: 'enterprise', features: 3 },
]

const COMPARE_ID = 'compare'

const count = (value: number) => value.toLocaleString('en-US')

/**
 * Step six of sign-up, after the address and before "How you'll pay" (owner decision,
 * 8 Oct 2026). Prices, limits, the trial and which plans are offered are the super admin's
 * (`/v1/platform/plans`). The choice is saved on the draft (row 1.2). TODO(backend):
 * ONBOARDING.md row 1.1 — the cards keep the launch catalogue although `readSignupPlans` can read
 * the published one, because the two price lists disagree (35/80/150 here, 19/49/89 in the
 * backend seed) and the owner has not said which is right.
 */
export function PlansPage() {
  const location = useLocation()
  return (
    <OnboardingGate ready={Boolean(onboardingStateFrom(location.state).address)}>
      <PlansContent />
    </OnboardingGate>
  )
}

function PlansContent() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = onboardingStateFrom(location.state)
  const [billing, setBilling] = useState<BillingCycle>(state.billing ?? 'monthly')
  // `/plans#compare` opens the table straight away — a link a sales chat or an email can carry.
  const [compare, setCompare] = useState(() => location.hash === '#compare')

  // Opens in place under the button; no scrolling, so the cards stay where the reader left them.
  const toggleCompare = () => setCompare((open) => !open)

  const billingNote = billing === 'monthly' ? t('plans.billedMonthly') : t('plans.billedAnnually')

  const { save, submitting, formError } = useOnboardingStep()

  const selectPlan = async (plan: PlanId) => {
    if (submitting) return
    const result = await save((token, signal) => recordPlan(token, plan, billing, signal))
    if (!result.saved) return
    // Enterprise is agreed on a call: no trial and no payment step, straight to review. The
    // server clears a saved payment preference on the same choice (contract §1).
    if (plan === 'enterprise') {
      const { paymentMethod: _method, linkVia: _via, addon: _addon, ...rest } = state
      void _method
      void _via
      void _addon
      const next: OnboardingState = { ...rest, plan, billing }
      navigate(REVIEW_ROUTE, { state: next })
      return
    }
    const next: OnboardingState = { ...state, plan, billing }
    navigate(PAYMENT_ROUTE, { state: next })
  }

  const price = (plan: CataloguePlan, dark: boolean): ReactNode => (
    <p
      className={[
        'flex items-baseline gap-1 font-semibold',
        dark ? 'text-white' : 'text-text-primary',
      ].join(' ')}
    >
      <OmAmount
        size="sm"
        onDark={dark}
        amount={billing === 'monthly' ? plan.monthly : annualMonthly(plan)}
        amountClassName={['text-[40px] leading-[1.2]', dark ? 'text-white' : ''].join(' ')}
      />
      <span className={['text-base', dark ? 'text-primary-25' : 'text-neutral-300'].join(' ')}>
        {t('plans.perMonth')}
      </span>
    </p>
  )

  return (
    <div className="relative min-h-dvh overflow-hidden bg-surface-background">
      <img
        src={patternLeft}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 start-0 z-0 h-[40%] w-auto max-w-[320px] opacity-50"
      />
      <img
        src={patternRight}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute end-0 top-16 z-0 h-[32%] w-auto max-w-[256px] opacity-50"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -start-[20%] z-0 h-[320px] w-[520px] rounded-full bg-primary-100/80 blur-[90px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -end-[15%] z-0 h-[280px] w-[480px] rounded-full bg-primary-100/80 blur-[90px]"
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-8 pb-10 pt-8">
        <BackButton
          to="/address-contact"
          state={location.state}
          className="absolute start-8 top-8 z-20"
        />

        <div className="flex flex-1 flex-col items-center">
          {/* On a phone the title wraps under the Back button's row, so it steps down past it. */}
          <h1 className="pt-2.5 text-center text-[32px] font-semibold leading-[1.2] text-text-primary max-md:mt-12 lg:whitespace-nowrap">
            {t('plans.title')}
          </h1>
          <p className="mt-[7px] max-w-[479px] text-center text-base font-medium leading-[1.2] text-text-quaternary">
            {t('plans.description')}
          </p>

          <div className="mt-7 flex flex-col items-center gap-1">
            <SegmentedControl
              ariaLabel={t('plans.billingLabel')}
              value={billing}
              onChange={setBilling}
              className="w-[200px] border-primary-50"
              options={[
                { value: 'monthly', label: t('plans.monthly') },
                { value: 'annual', label: t('plans.annual') },
              ]}
            />
            <p className="text-[13px] font-semibold leading-[1.2] text-primary-700">
              {t('plans.saveAnnual')}
            </p>
          </div>

          {/* Four cards in a row where they fit, wrapping to two rows on narrower desktops. */}
          <div className="mt-[51px] flex w-full flex-col items-center justify-center gap-8 lg:flex-row lg:flex-wrap lg:items-end lg:gap-[34px]">
            {CARDS.map(({ id, plan, key, audience, features, dark = false }) => {
              const check = dark ? checkWhiteIcon : checkIcon
              const iconSize = dark ? 'size-[18px]' : 'size-4'
              return (
                <PricingCard
                  key={id}
                  variant={dark ? 'dark' : 'light'}
                  badge={dark ? t('plans.mostPopular') : undefined}
                  name={t(`plans.${key}.name`)}
                  description={t(`plan.audience.${audience}`)}
                  priceLabel={
                    plan ? (
                      price(plan, dark)
                    ) : (
                      <p className="text-2xl font-semibold leading-[1.2] text-text-primary">
                        {t('plans.enterprise.price')}
                      </p>
                    )
                  }
                  billingNote={plan ? billingNote : t('plans.enterprise.billingNote')}
                  checkIcon={check}
                  stats={[
                    {
                      value: plan ? count(plan.documents) : t('plans.enterprise.limits'),
                      label: plan ? t('plans.invoicesPerMonth') : t('plans.invoices'),
                      icon: (
                        <img
                          src={dark ? invoiceWhiteIcon : invoiceIcon}
                          alt=""
                          className={iconSize}
                        />
                      ),
                    },
                    {
                      value: plan ? count(plan.people) : t('plans.enterprise.limits'),
                      label: plan ? t('plans.usersIncluded') : t('plans.users'),
                      icon: (
                        <img src={dark ? usersWhiteIcon : usersIcon} alt="" className={iconSize} />
                      ),
                    },
                  ]}
                  features={Array.from({ length: features }, (_, i) =>
                    t(`plans.${key}.features.f${i + 1}`),
                  )}
                  ctaLabel={plan ? t('plans.getStarted') : t('plans.talkToTeam')}
                  onCta={() => void selectPlan(id)}
                />
              )
            })}
          </div>

          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:gap-[34px]">
            {[t('plans.footer.f1'), t('plans.footer.f2'), t('plans.footer.f3')].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <img src={checkFooterIcon} alt="" className="size-[17px] shrink-0" />
                <span className="whitespace-nowrap text-[13px] font-medium text-text-tertiary">
                  {item}
                </span>
              </div>
            ))}
          </div>

          {formError ? (
            <div className="mt-5">
              <OnboardingFormError error={formError} />
            </div>
          ) : null}

          <p className="mt-5 max-w-[640px] text-center text-[13px] font-medium leading-[1.6] text-text-quaternary">
            {t('plans.trialNote', { days: TRIAL.days, documents: TRIAL.documents })}{' '}
            {t('plans.payNote')}
          </p>

          {/* The detail behind the cards, opened on demand so the four cards stay the page. */}
          <button
            type="button"
            aria-expanded={compare}
            aria-controls={COMPARE_ID}
            onClick={toggleCompare}
            className="mt-6 inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-primary-700 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500"
          >
            {compare ? t('plans.compare.close') : t('plans.compare.open')}
            <ChevronDownIcon
              size={16}
              className={['transition-transform', compare ? 'rotate-180' : ''].join(' ')}
            />
          </button>

          <section
            id={COMPARE_ID}
            hidden={!compare}
            aria-labelledby={`${COMPARE_ID}-title`}
            className="mt-10 flex w-full max-w-[1282px] scroll-mt-8 flex-col items-center"
          >
            <h2
              id={`${COMPARE_ID}-title`}
              className="text-center text-2xl font-semibold leading-[1.2] text-text-primary"
            >
              {t('plans.compare.title')}
            </h2>
            <p className="mt-2 max-w-[640px] text-center text-sm font-medium leading-[1.5] text-text-quaternary">
              {t('plans.compare.subtitle')}
            </p>
            <div className="mt-6 w-full">
              <PlanComparison billing={billing} />
            </div>
            <div className="mt-12 flex w-full justify-center">
              <PlanFaq />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
