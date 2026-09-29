import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RialMark } from '../../components/ui/Rial'
import { CATALOGUE, TRIAL, annualMonthly, type CataloguePlan } from '../../lib/plans'
import { COLUMNS, GROUPS, type Cell } from '../PlansPage/PlanComparison'
import checkIcon from '../../assets/home/check.svg'
import crossIcon from '../../assets/site/cross-red.svg'
import '../HomePage/HomePage.css'
import {
  CheckList,
  ClosingBand,
  Cta,
  Faq,
  Footer,
  Heading,
  INK,
  PageHero,
  SOFT,
  Texture,
  Washes,
} from '../HomePage/site'
import { useFaqItems } from './faq'

/**
 * The public pricing page (Figma "Pricing", 191:13484): a billing switch, the plan cards, what
 * counts as a document, the full comparison and the questions, drawn on the frame's own numbers.
 *
 * Every price, limit and feature comes from the app's plan catalogue (`lib/plans.ts`), the same
 * one the sign-up plans screen reads, and the comparison lists the same rows as that screen's
 * table. The frame drew three plans with its own figures; the catalogue has four, so Enterprise
 * takes a fourth card and the frame's figures are not used (owner, 29 Sep 2026).
 *
 * TODO(backend): SITE.md 2.1. Read the published catalogue once it is served publicly.
 */

/** The sign-up screen's own key for each plan's card copy (`plans.<key>.*`). */
const CARD_KEY = { starter: 'starter', business: 'premium', businessPlus: 'businessPlus' } as const
/** How many of each card's feature lines the sign-up screen shows; the same here. */
const FEATURE_LINES = { starter: 6, premium: 5, businessPlus: 5, enterprise: 3 } as const
/** The plan the sign-up screen marks as the popular one, drawn as the frame's filled card. */
const FEATURED = 'business'

const money = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const count = (value: number) => value.toLocaleString('en-US')

export function PricingPage() {
  const { t } = useTranslation()
  const [yearly, setYearly] = useState(false)
  return (
    <div className={`landing min-h-screen overflow-x-clip bg-white ${INK}`}>
      <PageHero
        active="pricing"
        lead={t('site.pricing.hero.lead')}
        word={t('site.pricing.hero.word')}
        tail={t('site.pricing.hero.tail')}
        body={
          <>
            {t('site.pricing.hero.body1')}
            <br className="max-md:hidden" /> {t('site.pricing.hero.body2')}
          </>
        }
      />
      <main>
        <Plans yearly={yearly} setYearly={setYearly} />
        <Counts />
        <Compare yearly={yearly} />
        <Faq items={useFaqItems()} />
      </main>
      <ClosingBand />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------ plans */

function Plans({ yearly, setYearly }: { yearly: boolean; setYearly: (on: boolean) => void }) {
  const { t } = useTranslation()
  const option = (on: boolean) =>
    on ? 'border-[#151c2d] bg-[#151c2d] text-white' : `border-[#e8e8ea] bg-white ${INK}`

  return (
    <section className="mx-auto w-full max-w-[1720px] px-4 md:px-8 min-[1800px]:px-0">
      <div
        role="radiogroup"
        aria-label={t('site.pricing.billing.label')}
        className="flex items-center justify-center gap-2"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!yearly}
          onClick={() => setYearly(false)}
          className={`rounded-lg border px-4 py-3 text-base leading-[normal] ${option(!yearly)}`}
        >
          {t('site.pricing.billing.monthly')}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={yearly}
          onClick={() => setYearly(true)}
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-base leading-[normal] ${option(yearly)}`}
        >
          {t('site.pricing.billing.yearly')}
          <span className="rounded bg-[rgba(31,193,107,0.1)] px-1.5 py-0.5 text-xs font-semibold uppercase text-[#16884b]">
            {t('site.pricing.billing.free')}
          </span>
        </button>
      </div>

      <div className="mx-auto mt-8 grid max-w-[560px] grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-2 2xl:grid-cols-4">
        {CATALOGUE.map((plan) => (
          <PlanCard key={plan.id} plan={plan} yearly={yearly} />
        ))}
        <PlanCard yearly={yearly} />
      </div>
      <p className={`mx-auto mt-6 max-w-[860px] text-center text-base leading-6 ${SOFT}`}>
        {t('plans.trialNote', { days: TRIAL.days, documents: TRIAL.documents })}
      </p>
    </section>
  )
}

/** One plan from the catalogue, or Enterprise when no plan is given. */
function PlanCard({ plan, yearly }: { plan?: CataloguePlan; yearly: boolean }) {
  const { t } = useTranslation()
  const featured = plan?.id === FEATURED
  const key = plan ? CARD_KEY[plan.id] : 'enterprise'
  const soft = featured ? 'text-white/80' : SOFT

  const limits = plan
    ? [
        t('site.pricing.limits.documents', { documents: count(plan.documents) }),
        t('site.pricing.limits.people', { count: plan.people }),
        plan.branches
          ? t('site.pricing.limits.branches', { count: plan.branches })
          : t('plans.unlimited'),
      ]
    : [t('plans.enterprise.features.f2')]
  const features = Array.from(
    { length: FEATURE_LINES[key] },
    (_, i) => `plans.${key}.features.f${i + 1}`,
  )
    // Enterprise's second line is its limits, already listed first.
    .filter((line) => line !== 'plans.enterprise.features.f2')
    .map((line) => t(line))

  // The note carries a price per document; the rial sign goes in where the figure is.
  const [before, after] = t('site.pricing.each', { amount: '\u0000' }).split('\u0000')
  const each = plan ? (yearly ? annualMonthly(plan) : plan.monthly) / plan.documents : 0

  return (
    <article
      className={`relative flex flex-col gap-10 rounded-lg border border-[#e8e8ea] bg-white p-8 max-md:p-5 ${
        featured ? 'landing-shadow-brand' : ''
      }`}
    >
      {featured ? <Texture flip="y" /> : null}
      <div
        className={`relative flex flex-col gap-4 rounded-lg p-6 ${
          featured ? 'bg-[#2c4eb7] text-white' : 'bg-[#fafafa]'
        }`}
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-[clamp(1.75rem,1.3rem+1.2vw,2.625rem)] font-medium leading-[normal]">
            {plan ? t(plan.labelKey) : t('plan.planName.enterprise')}
          </h2>
          <p className={`text-lg leading-[normal] ${soft}`}>
            {t(`plan.audience.${plan?.id ?? 'enterprise'}`)}
          </p>
        </div>
        {plan ? (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="flex items-baseline gap-2 text-[clamp(2rem,1.5rem+1.4vw,2.625rem)] font-semibold leading-none tabular-nums">
              <RialMark className="w-8 self-center" />
              {money(yearly ? annualMonthly(plan) : plan.monthly)}
            </span>
            <span className={`text-xl leading-[normal] ${soft}`}>{t('site.pricing.perMonth')}</span>
          </p>
        ) : (
          <p className="text-[clamp(2rem,1.5rem+1.4vw,2.625rem)] font-semibold leading-none">
            {t('plans.enterprise.price')}
          </p>
        )}
        <p
          className={`flex flex-wrap items-center gap-x-1 text-lg leading-[normal] ${
            featured ? 'text-white' : 'text-[#2c4eb7]'
          }`}
        >
          {plan ? (
            <>
              {before.trimEnd()}
              <span className="inline-flex items-center gap-1 tabular-nums">
                <RialMark className="w-3.5" />
                {money(each)}
              </span>
              {after.trimStart()}
            </>
          ) : (
            t('plans.enterprise.billingNote')
          )}
        </p>
        {plan && yearly ? (
          <p className={`text-sm leading-[normal] ${soft}`}>{t('site.pricing.yearlyNote')}</p>
        ) : null}
      </div>

      <div className="relative flex flex-1 flex-col gap-5">
        <p className="text-xl font-semibold uppercase leading-[normal]">
          {t('site.pricing.whatYouGet')}
        </p>
        <CheckList items={[...limits, ...features]} />
      </div>

      <Cta
        to={plan ? '/signup' : '/contact'}
        tone={featured ? 'brand' : 'light'}
        arrow={false}
        className={`relative w-full !py-5 text-xl font-semibold ${
          featured ? '' : 'border border-[#e8e8ea] !bg-white'
        }`}
      >
        {plan ? t('plans.getStarted') : t('plans.talkToTeam')}
      </Cta>
    </article>
  )
}

/* ------------------------------------------------------------------ counts */

function Counts() {
  const { t } = useTranslation()
  const one = ['a', 'b', 'c', 'd', 'e']
  const nothing = ['a', 'b', 'c', 'd', 'e', 'f']
  return (
    <section className="relative isolate mx-auto mt-[200px] w-full max-w-[1720px] px-4 pb-[100px] pt-[140px] max-md:mt-24 max-md:pt-16 md:px-8 min-[1800px]:px-0">
      <Washes />
      <div className="mx-auto flex max-w-[1424px] flex-col items-center gap-[60px] max-md:gap-10">
        <div className="flex flex-col items-center gap-6 text-center">
          <Heading lead={t('site.pricing.counts.lead')} em={t('site.pricing.counts.em')} />
          <p className={`landing-cap text-xl leading-[normal] ${INK}`}>
            {t('site.pricing.counts.body1')}
            <br className="max-md:hidden" /> {t('site.pricing.counts.body2')}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-8 max-lg:grid-cols-1">
          <CountCard
            title={t('site.pricing.counts.usesOne')}
            icon={checkIcon}
            tile="bg-[rgba(31,193,107,0.1)]"
            items={one.map((key) => t(`site.pricing.counts.one.${key}`))}
          />
          <CountCard
            title={t('site.pricing.counts.usesNothing')}
            icon={crossIcon}
            tile="bg-[rgba(251,55,72,0.1)]"
            items={nothing.map((key) => t(`site.pricing.counts.nothing.${key}`))}
          />
        </div>
      </div>
    </section>
  )
}

function CountCard({
  title,
  icon,
  tile,
  items,
}: {
  title: string
  icon: string
  tile: string
  items: string[]
}) {
  return (
    <div className="flex flex-col gap-8 rounded-lg bg-white p-12 max-md:p-6">
      <h3 className="flex items-center gap-4 text-[clamp(1.5rem,1.2rem+0.9vw,2rem)] font-medium leading-[normal]">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tile}`}>
          <img src={icon} alt="" className="size-[18px]" />
        </span>
        {title}
      </h3>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3.5">
            <img src={icon} alt="" className="mt-px size-[18px] shrink-0" />
            <span className={`landing-cap text-base leading-[normal] ${INK}`}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ----------------------------------------------------------------- compare */

/** The sign-up screen's comparison rows, drawn in the frame's table style. */
function Compare({ yearly }: { yearly: boolean }) {
  const { t } = useTranslation()
  const cell = (value: Cell) => {
    switch (value.kind) {
      case 'check':
        return <img src={checkIcon} alt={t('plans.compare.included')} className="mx-auto size-4" />
      case 'dash':
        return (
          <span
            role="img"
            aria-label={t('plans.compare.notIncluded')}
            className="mx-auto block h-0.5 w-2.5 rounded-full bg-[#c4c6cb]"
          />
        )
      case 'money':
        return (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <RialMark className="w-2.5" />
            {money(value.amount)}
          </span>
        )
      case 'text':
        return t(value.key, value.params)
    }
  }
  return (
    <section className="mx-auto mt-[200px] w-full max-w-[1212px] px-4 max-md:mt-24">
      <h2 className="landing-title landing-cap text-center font-semibold leading-[normal]">
        {t('site.pricing.compare.lead')}{' '}
        <span className={`landing-em font-light italic lowercase ${SOFT}`}>
          {t('site.pricing.compare.em')}
        </span>
      </h2>
      <p className={`mx-auto mt-6 max-w-[860px] text-center text-base leading-6 ${SOFT}`}>
        {t('plans.compare.subtitle')}
      </p>
      <div className="mt-[60px] overflow-x-auto rounded-lg border border-[#e8e8ea] max-md:mt-10">
        <table className="w-full min-w-[720px] border-collapse text-[14.5px] leading-[normal]">
          <thead>
            <tr className="bg-[#fafafa]">
              <th scope="col" className="w-[34%] px-4 py-4 text-start align-bottom">
                <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#737781]">
                  {t('plans.compare.columnFeature')}
                </span>
              </th>
              {COLUMNS.map((plan) => (
                <th
                  key={plan?.id ?? 'enterprise'}
                  scope="col"
                  className={`px-4 py-4 text-center align-bottom ${
                    plan?.id === FEATURED ? 'bg-[#eaedf8]' : ''
                  }`}
                >
                  <span className="block text-[15px] font-semibold">
                    {t(plan ? plan.labelKey : 'plan.planName.enterprise')}
                  </span>
                  <span
                    className={`mt-1 inline-flex items-center gap-1 text-[12.5px] font-normal tabular-nums ${
                      plan?.id === FEATURED ? 'text-[#2c4eb7]' : 'text-[#737781]'
                    }`}
                  >
                    {plan ? (
                      <>
                        <RialMark className="w-2.5" />
                        {money(yearly ? annualMonthly(plan) : plan.monthly)}
                        <span>{t('plans.perMonth')}</span>
                      </>
                    ) : (
                      t('plans.enterprise.price')
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => (
              <Fragment key={group.key}>
                <tr className="bg-[#fafafa]">
                  <th
                    scope="colgroup"
                    colSpan={COLUMNS.length + 1}
                    className="px-4 py-2.5 text-start text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#737781]"
                  >
                    {t(group.labelKey)}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.key} className="border-t border-[#f0f0f2]">
                    <th scope="row" className={`px-4 py-3.5 text-start font-medium ${SOFT}`}>
                      {t(row.labelKey)}
                    </th>
                    {COLUMNS.map((plan) => (
                      <td
                        key={plan?.id ?? 'enterprise'}
                        className={`px-4 py-3.5 text-center font-semibold tabular-nums ${
                          plan?.id === FEATURED ? 'bg-[#fafafa]' : ''
                        }`}
                      >
                        {cell(row.cell(plan))}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
