import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BackButton, OmAmount, PricingCard, SegmentedControl } from '../../components/ui'
import { PLAN, TRIAL, annualMonthly } from '../../lib/plans'
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

export function PlansPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [billing, setBilling] = useState<BillingCycle>('monthly')

  const starterPrice = billing === 'monthly' ? PLAN.starter.monthly : annualMonthly(PLAN.starter)
  const premiumPrice = billing === 'monthly' ? PLAN.business.monthly : annualMonthly(PLAN.business)
  const billingNote = billing === 'monthly' ? t('plans.billedMonthly') : t('plans.billedAnnually')

  const selectPlan = (plan: 'starter' | 'premium' | 'enterprise') => {
    navigate('/payment', {
      state: {
        ...(location.state as object),
        plan,
        billing,
      },
    })
  }

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

          <div className="mt-[51px] flex w-full flex-col items-center justify-center gap-8 lg:flex-row lg:items-end lg:gap-[34px]">
            <PricingCard
              name={t('plans.starter.name')}
              description={t('plans.starter.description')}
              priceLabel={
                <p className="flex items-baseline gap-1 font-semibold text-text-primary">
                  <OmAmount
                    size="sm"
                    amount={starterPrice}
                    amountClassName="text-[40px] leading-[1.2]"
                  />
                  <span className="text-base text-neutral-300">/month</span>
                </p>
              }
              billingNote={billingNote}
              checkIcon={checkIcon}
              stats={[
                {
                  value: count(PLAN.starter.documents),
                  label: t('plans.invoicesPerMonth'),
                  icon: <img src={invoiceIcon} alt="" className="size-4" />,
                },
                {
                  value: count(PLAN.starter.people),
                  label: t('plans.usersIncluded'),
                  icon: <img src={usersIcon} alt="" className="size-4" />,
                },
              ]}
              features={[
                t('plans.starter.features.f1'),
                t('plans.starter.features.f2'),
                t('plans.starter.features.f3'),
                t('plans.starter.features.f4'),
              ]}
              ctaLabel={t('plans.getStarted')}
              onCta={() => selectPlan('starter')}
            />

            <PricingCard
              variant="dark"
              badge={t('plans.mostPopular')}
              name={t('plans.premium.name')}
              description={t('plans.premium.description')}
              priceLabel={
                <p className="flex items-baseline gap-1 font-semibold text-white">
                  <OmAmount
                    size="sm"
                    onDark
                    amount={premiumPrice}
                    amountClassName="text-[40px] leading-[1.2] text-white"
                  />
                  <span className="text-base text-primary-25">/month</span>
                </p>
              }
              billingNote={billingNote}
              checkIcon={checkWhiteIcon}
              stats={[
                {
                  value: count(PLAN.business.documents),
                  label: t('plans.invoicesPerMonth'),
                  icon: <img src={invoiceWhiteIcon} alt="" className="size-[18px]" />,
                },
                {
                  value: count(PLAN.business.people),
                  label: t('plans.usersIncluded'),
                  icon: <img src={usersWhiteIcon} alt="" className="size-[18px]" />,
                },
              ]}
              features={[
                t('plans.premium.features.f1'),
                t('plans.premium.features.f2'),
                t('plans.premium.features.f3'),
                t('plans.premium.features.f4'),
                t('plans.premium.features.f5'),
                t('plans.premium.features.f6'),
              ]}
              ctaLabel={t('plans.getStarted')}
              onCta={() => selectPlan('premium')}
            />

            <PricingCard
              name={t('plans.enterprise.name')}
              description={t('plans.enterprise.description')}
              priceLabel={
                <p className="text-2xl font-semibold leading-[1.2] text-text-primary">
                  {t('plans.enterprise.price')}
                </p>
              }
              billingNote={t('plans.enterprise.billingNote')}
              checkIcon={checkIcon}
              stats={[
                {
                  value: t('plans.unlimited'),
                  label: t('plans.invoices'),
                  icon: <img src={unlimitedIcon} alt="" className="size-4" />,
                },
                {
                  value: t('plans.unlimited'),
                  label: t('plans.users'),
                  icon: <img src={usersIcon} alt="" className="size-4" />,
                },
              ]}
              features={[
                t('plans.enterprise.features.f1'),
                t('plans.enterprise.features.f2'),
                t('plans.enterprise.features.f3'),
                t('plans.enterprise.features.f4'),
                t('plans.enterprise.features.f5'),
              ]}
              ctaLabel={t('plans.talkToTeam')}
              onCta={() => selectPlan('enterprise')}
            />
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

const count = (value: number) => value.toLocaleString('en-US')
