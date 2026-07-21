import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BackButton, PricingCard, SegmentedControl } from '../../components/ui'
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

  const starterPrice = billing === 'monthly' ? 12 : 10
  const premiumPrice = billing === 'monthly' ? 35 : 29
  const billingNote =
    billing === 'monthly' ? t('plans.billedMonthly') : t('plans.billedAnnually')

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
                <p className="font-semibold text-text-primary">
                  <span className="text-base">OMR </span>
                  <span className="text-[40px] leading-[1.2]">{starterPrice}</span>
                  <span className="text-base text-neutral-300">/month</span>
                </p>
              }
              billingNote={billingNote}
              checkIcon={checkIcon}
              stats={[
                {
                  value: '100',
                  label: t('plans.invoicesPerMonth'),
                  icon: <img src={invoiceIcon} alt="" className="size-4" />,
                },
                {
                  value: '2',
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
                <p className="font-semibold text-white">
                  <span className="text-base">OMR </span>
                  <span className="text-[40px] leading-[1.2]">{premiumPrice}</span>
                  <span className="text-base text-primary-25">/month</span>
                </p>
              }
              billingNote={billingNote}
              checkIcon={checkWhiteIcon}
              stats={[
                {
                  value: '1,000',
                  label: t('plans.invoicesPerMonth'),
                  icon: <img src={invoiceWhiteIcon} alt="" className="size-[18px]" />,
                },
                {
                  value: '10',
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
        </div>
      </div>
    </div>
  )
}
