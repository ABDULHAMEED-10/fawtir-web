import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { BackButton, OmAmount, PricingCard, SegmentedControl } from '../../components/ui'
import { ChevronDownIcon } from '../../components/ui/icons'
import { COMPLIANCE_FEATURES, FEATURE_LIST, type Feature } from '../../lib/plans'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import {
  PAYMENT_ROUTE,
  PLAN_PRICE_CHANGED,
  REVIEW_ROUTE,
  planIdFor,
  recordPlan,
} from '../../lib/identity/onboarding'
import { readSignupPlans, type SignupCataloguePlan } from '../../lib/identity/signupPlans'
import { onboardingStateFrom, planDisplayName, type OnboardingState } from '../../lib/onboarding'
import type { PlanId } from '../../lib/pricing'
import { PlanComparison, PlanFaq } from './PlanComparison'
import {
  annualSavingNote,
  launchCopy,
  perMonthBaisa,
  planDescription,
  planName,
  shortRial,
  trialNote,
  usePlanCatalogue,
} from './catalogueView'
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

/** Enterprise is Business Plus with limits agreed on a call, so it has no figure to print. */
const ENTERPRISE_FEATURE_LINES = 3
/** As many lines as the launch cards carry, for a plan published since with no copy of its own. */
const DERIVED_FEATURE_LINES = 5

const COMPARE_ID = 'compare'

const count = (value: number) => value.toLocaleString('en-US')

/**
 * The card lines of a plan the app has no copy for: what it switches on beyond compliance, which
 * every plan carries and the subtitle under the comparison already says.
 */
const derivedFeatureKeys = (plan: SignupCataloguePlan): Feature[] =>
  FEATURE_LIST.filter(
    (feature) =>
      !COMPLIANCE_FEATURES.includes(feature) &&
      plan.features.some((entry) => entry.key === feature && entry.enabled),
  ).slice(0, DERIVED_FEATURE_LINES)

/**
 * Step six of sign-up, after the address and before "How you'll pay" (owner decision,
 * 8 Oct 2026). The cards are the published catalogue (`GET /v1/auth/signup/plans`, catalogue
 * contract §13): names, prices, limits, trial and the recommended plan are the super admin's.
 * The choice is saved on the draft with the price version the card showed (row 1.2).
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
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = onboardingStateFrom(location.state)
  const [billing, setBilling] = useState<BillingCycle>(state.billing ?? 'monthly')
  // `/plans#compare` opens the table straight away — a link a sales chat or an email can carry.
  const [compare, setCompare] = useState(() => location.hash === '#compare')
  const { read, reload } = usePlanCatalogue('signup-plans', readSignupPlans)
  const plans = read.status === 'ready' ? read.plans : null

  // Opens in place under the button; no scrolling, so the cards stay where the reader left them.
  const toggleCompare = () => setCompare((open) => !open)

  const billingNote = billing === 'monthly' ? t('plans.billedMonthly') : t('plans.billedAnnually')

  const { save, submitting, formError } = useOnboardingStep()

  const selectPlan = async (plan: PlanId, offer?: SignupCataloguePlan) => {
    if (submitting) return
    const result = await save((token, signal) =>
      recordPlan(token, plan, billing, signal, offer?.priceVersionId),
    )
    if (!result.saved) {
      // The price changed while the page was open: show the new one before anything is chosen.
      if (result.conflict === PLAN_PRICE_CHANGED) reload()
      return
    }
    // Amounts and names of an earlier choice must not be shown against this one.
    const { planTerms: _terms, planNames: _names, ...kept } = state
    void _terms
    void _names
    // Enterprise is agreed on a call: no trial and no payment step, straight to review. The
    // server clears a saved payment preference on the same choice (contract §1).
    if (plan === 'enterprise') {
      const { paymentMethod: _method, linkVia: _via, addon: _addon, ...rest } = kept
      void _method
      void _via
      void _addon
      const next: OnboardingState = { ...rest, plan, billing }
      navigate(REVIEW_ROUTE, { state: next })
      return
    }
    const next: OnboardingState = {
      ...kept,
      plan,
      billing,
      ...(offer ? { planNames: { en: offer.nameEn, ar: offer.nameAr } } : {}),
    }
    navigate(PAYMENT_ROUTE, { state: next })
  }

  const price = (plan: SignupCataloguePlan, dark: boolean): ReactNode => (
    <p
      className={[
        'flex items-baseline gap-1 font-semibold',
        dark ? 'text-white' : 'text-text-primary',
      ].join(' ')}
    >
      <OmAmount
        size="sm"
        onDark={dark}
        amount={shortRial(perMonthBaisa(plan, billing))}
        amountClassName={['text-[40px] leading-[1.2]', dark ? 'text-white' : ''].join(' ')}
      />
      <span className={['text-base', dark ? 'text-primary-25' : 'text-neutral-300'].join(' ')}>
        {t('plans.perMonth')}
      </span>
    </p>
  )

  const card = (plan: SignupCataloguePlan) => {
    const dark = plan.recommended
    const check = dark ? checkWhiteIcon : checkIcon
    const iconSize = dark ? 'size-[18px]' : 'size-4'
    const copy = launchCopy(plan.code)
    const features = copy
      ? Array.from({ length: copy.lines }, (_, i) => t(`plans.${copy.key}.features.f${i + 1}`))
      : derivedFeatureKeys(plan).map((feature) => t(`plan.featureName.${feature}`))
    return (
      <PricingCard
        key={plan.code}
        variant={dark ? 'dark' : 'light'}
        badge={plan.recommended ? t('plans.mostPopular') : undefined}
        name={planName(plan, i18n.language)}
        description={
          planDescription(plan, i18n.language) ?? (copy ? t(`plan.audience.${copy.audience}`) : '')
        }
        priceLabel={price(plan, dark)}
        billingNote={billingNote}
        checkIcon={check}
        stats={[
          {
            value: count(plan.invoicesPerMonth),
            label: t('plans.invoicesPerMonth'),
            icon: <img src={dark ? invoiceWhiteIcon : invoiceIcon} alt="" className={iconSize} />,
          },
          {
            value: count(plan.peopleIncluded),
            label: t('plans.usersIncluded'),
            icon: <img src={dark ? usersWhiteIcon : usersIcon} alt="" className={iconSize} />,
          },
        ]}
        features={features}
        ctaLabel={t('plans.getStarted')}
        onCta={() => void selectPlan(planIdFor(plan.code), plan)}
      />
    )
  }

  const enterpriseCard = (
    <PricingCard
      key="enterprise"
      variant="light"
      name={t('plans.enterprise.name')}
      description={t('plan.audience.enterprise')}
      priceLabel={
        <p className="text-2xl font-semibold leading-[1.2] text-text-primary">
          {t('plans.enterprise.price')}
        </p>
      }
      billingNote={t('plans.enterprise.billingNote')}
      checkIcon={checkIcon}
      stats={[
        {
          value: t('plans.enterprise.limits'),
          label: t('plans.invoices'),
          icon: <img src={invoiceIcon} alt="" className="size-4" />,
        },
        {
          value: t('plans.enterprise.limits'),
          label: t('plans.users'),
          icon: <img src={usersIcon} alt="" className="size-4" />,
        },
      ]}
      features={Array.from({ length: ENTERPRISE_FEATURE_LINES }, (_, i) =>
        t(`plans.enterprise.features.f${i + 1}`),
      )}
      ctaLabel={t('plans.talkToTeam')}
      onCta={() => void selectPlan('enterprise')}
    />
  )

  // A plan restored from the draft that the catalogue no longer offers cannot be continued with:
  // its price is not published any more, so the registrant has to choose again.
  const withdrawn =
    plans && state.plan && state.plan !== 'enterprise'
      ? !plans.some((plan) => planIdFor(plan.code) === state.plan)
      : false
  const saving = plans ? annualSavingNote(t, plans) : null
  const trial = plans ? trialNote(t, plans, i18n.language) : null

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
            {saving ? (
              <p className="text-[13px] font-semibold leading-[1.2] text-primary-700">{saving}</p>
            ) : null}
          </div>

          {withdrawn && state.plan ? (
            <div className="mt-5">
              <OnboardingFormError
                error={{
                  key: 'plans.noLongerOffered',
                  values: { plan: planDisplayName(t, state, i18n.language) },
                }}
              />
            </div>
          ) : null}

          {read.status === 'loading' ? (
            <p
              role="status"
              className="mt-[51px] text-center text-sm font-medium text-text-quaternary"
            >
              {t('plans.loading')}
            </p>
          ) : read.status === 'failed' ? (
            <div role="alert" className="mt-[51px] flex flex-col items-center gap-2 text-center">
              <p className="text-sm font-medium text-text-danger">{t('plans.unavailable')}</p>
              <button
                type="button"
                onClick={reload}
                className="rounded-sm text-sm font-semibold text-primary-700 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500"
              >
                {t('plans.retry')}
              </button>
            </div>
          ) : (
            <>
              {read.plans.length === 0 ? (
                <p
                  role="status"
                  className="mt-[51px] text-center text-sm font-medium text-text-quaternary"
                >
                  {t('plans.empty')}
                </p>
              ) : null}
              {/* The cards in a row where they fit, wrapping to two rows on narrower desktops. */}
              <div className="mt-[51px] flex w-full flex-col items-center justify-center gap-8 lg:flex-row lg:flex-wrap lg:items-end lg:gap-[34px]">
                {read.plans.map(card)}
                {enterpriseCard}
              </div>
            </>
          )}

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
            {trial ? `${trial} ` : ''}
            {t('plans.payNote')}
          </p>

          {/* The detail behind the cards, opened on demand so the cards stay the page. */}
          {plans && plans.length > 0 ? (
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
          ) : null}

          <section
            id={COMPARE_ID}
            hidden={!compare || !plans || plans.length === 0}
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
            {plans ? (
              <div className="mt-6 w-full">
                <PlanComparison billing={billing} plans={plans} />
              </div>
            ) : null}
            <div className="mt-12 flex w-full justify-center">
              <PlanFaq plans={plans} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
