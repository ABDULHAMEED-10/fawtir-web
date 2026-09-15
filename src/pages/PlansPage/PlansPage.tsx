import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BackButton, OmAmount, PricingCard, SegmentedControl } from '../../components/ui'
import { CATALOGUE, TRIAL, annualMonthly, type CataloguePlan } from '../../lib/plans'
import type { PlanId } from '../../lib/pricing'
import patternLeft from '../../assets/plans/pattern-left.png'
import patternRight from '../../assets/plans/pattern-right.png'
import checkIcon from '../../assets/plans/check.svg'
import checkWhiteIcon from '../../assets/plans/check-white.svg'
import checkFooterIcon from '../../assets/plans/check-footer.svg'
import invoiceIcon from '../../assets/plans/invoice.svg'
import invoiceWhiteIcon from '../../assets/plans/invoice-white.svg'
import usersIcon from '../../assets/plans/users.svg'
import usersWhiteIcon from '../../assets/plans/users-white.svg'
import unlimitedIcon from '../../assets/plans/unlimited.svg'

type BillingCycle = 'monthly' | 'annual'

/**
 * The sign-up flow's four plans, drawn from the launch catalogue (`Fawtir_Pricing_Model` §2, §6):
 * Starter, Business, Business Plus and Enterprise. The design drew three; the pricing doc has
 * four, so Business Plus takes the same card. `premium` is the flow's own id for Business.
 */
const CARDS: { id: PlanId; plan?: CataloguePlan; key: string; features: number; dark?: boolean }[] =
  [
    { id: 'starter', plan: CATALOGUE[0], key: 'starter', features: 5 },
    { id: 'premium', plan: CATALOGUE[1], key: 'premium', features: 6, dark: true },
    { id: 'businessPlus', plan: CATALOGUE[2], key: 'businessPlus', features: 5 },
    { id: 'enterprise', key: 'enterprise', features: 5 },
  ]

const count = (value: number) => value.toLocaleString('en-US')

export function PlansPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [billing, setBilling] = useState<BillingCycle>('monthly')

  const billingNote = billing === 'monthly' ? t('plans.billedMonthly') : t('plans.billedAnnually')

  const selectPlan = (plan: PlanId) => {
    navigate('/payment', {
      state: {
        ...(location.state as object),
        plan,
        billing,
      },
    })
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
          <h1 className="pt-2.5 text-center text-[32px] font-semibold leading-[1.2] text-text-primary lg:whitespace-nowrap">
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
            {CARDS.map(({ id, plan, key, features, dark = false }) => {
              const check = dark ? checkWhiteIcon : checkIcon
              const iconSize = dark ? 'size-[18px]' : 'size-4'
              return (
                <PricingCard
                  key={id}
                  variant={dark ? 'dark' : 'light'}
                  badge={dark ? t('plans.mostPopular') : undefined}
                  name={t(`plans.${key}.name`)}
                  description={t(`plans.${key}.description`)}
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
                      value: plan ? count(plan.documents) : t('plans.unlimited'),
                      label: plan ? t('plans.invoicesPerMonth') : t('plans.invoices'),
                      icon: (
                        <img
                          src={plan ? (dark ? invoiceWhiteIcon : invoiceIcon) : unlimitedIcon}
                          alt=""
                          className={iconSize}
                        />
                      ),
                    },
                    {
                      value: plan ? count(plan.people) : t('plans.unlimited'),
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
                  onCta={() => selectPlan(id)}
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

          <p className="mt-5 max-w-[640px] text-center text-[13px] font-medium leading-[1.6] text-text-quaternary">
            {t('plans.trialNote', { days: TRIAL.days, documents: TRIAL.documents })}{' '}
            {t('plans.payNote')}
          </p>
        </div>
      </div>
    </div>
  )
}
