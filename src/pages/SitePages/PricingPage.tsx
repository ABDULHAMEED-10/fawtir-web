import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RialMark } from '../../components/ui/Rial'
import checkIcon from '../../assets/home/check.svg'
import crossIcon from '../../assets/site/cross-red.svg'
import '../HomePage/HomePage.css'
import {
  CheckList,
  ClosingBand,
  Cta,
  DEMO_MAILTO,
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
 * The public pricing page (Figma "Pricing", 191:13484): a billing switch, three plan cards, what
 * counts as an invoice, the full comparison and the questions, on the frame's own numbers.
 *
 * TODO(backend): SITE.md 2.1. The site's plans (Business 49, Business Plus 89, Unlimited 149 a month) are the
 * Figma's; the app's catalogue in `lib/plans.ts` still carries the older three (35 / 80 / 150). The
 * page should read the published catalogue once the two agree.
 */

type PlanKey = 'business' | 'plus' | 'unlimited'

/** Monthly prices in rials; a year is ten months ("2 months free"). */
const PLANS: { key: PlanKey; monthly: number; each?: number; to?: string; href?: string }[] = [
  { key: 'business', monthly: 49, each: 0.098, to: '/signup' },
  { key: 'plus', monthly: 89, each: 0.03, to: '/signup' },
  { key: 'unlimited', monthly: 149, href: DEMO_MAILTO },
]
const ITEMS = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

const money = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export function PricingPage() {
  const { t } = useTranslation()
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
        <Plans />
        <Counts />
        <Compare />
        <Faq items={useFaqItems()} />
      </main>
      <ClosingBand />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------ plans */

function Plans() {
  const { t } = useTranslation()
  const [yearly, setYearly] = useState(false)
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

      <div className="mt-8 grid grid-cols-3 gap-8 max-xl:grid-cols-1 max-xl:mx-auto max-xl:max-w-[560px]">
        {PLANS.map((plan) => (
          <PlanCard key={plan.key} plan={plan} yearly={yearly} />
        ))}
      </div>
    </section>
  )
}

function PlanCard({ plan, yearly }: { plan: (typeof PLANS)[number]; yearly: boolean }) {
  const { t } = useTranslation()
  const featured = plan.key === 'plus'
  const base = `site.pricing.plans.${plan.key}`
  const price = yearly ? plan.monthly * 10 : plan.monthly
  // The note carries a per-invoice price; the rial sign goes in where the figure is.
  const [before, after] = t(`${base}.note`, { amount: '\u0000' }).split('\u0000')

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
          <h2 className="text-[clamp(1.75rem,1.2rem+1.6vw,2.625rem)] font-medium leading-[normal]">
            {t(`${base}.name`)}
          </h2>
          <p
            className={`landing-cap text-lg leading-[normal] ${featured ? 'text-white/80' : SOFT}`}
          >
            {t(`${base}.tag`)}
          </p>
        </div>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="flex items-baseline gap-2 text-[clamp(2rem,1.5rem+1.4vw,2.625rem)] font-semibold leading-none tabular-nums">
            <RialMark className="w-8 self-center" />
            {money(price)}
          </span>
          <span className={`text-xl leading-[normal] ${featured ? 'text-white/80' : SOFT}`}>
            {t(yearly ? 'site.pricing.perYear' : 'site.pricing.perMonth')}
          </span>
        </p>
        <p
          className={`landing-cap flex flex-wrap items-center gap-x-1 text-lg leading-[normal] ${
            featured ? 'text-white' : 'text-[#2c4eb7]'
          }`}
        >
          {plan.each === undefined ? (
            before
          ) : (
            <>
              {before.trimEnd()}
              <span className="inline-flex items-center gap-1 tabular-nums">
                <RialMark className="w-3.5" />
                {money(plan.each)}
              </span>
              {after.trimStart()}
            </>
          )}
        </p>
        {yearly ? (
          <p className={`text-sm leading-[normal] ${featured ? 'text-white/80' : SOFT}`}>
            {t('site.pricing.yearlyNote')}
          </p>
        ) : null}
      </div>

      <div className="relative flex flex-1 flex-col gap-5">
        <p className="text-xl font-semibold uppercase leading-[normal]">
          {t('site.pricing.whatYouGet')}
        </p>
        <CheckList items={ITEMS.map((item) => t(`${base}.items.${item}`))} />
      </div>

      <Cta
        to={plan.to}
        href={plan.href}
        tone={featured ? 'brand' : 'light'}
        arrow={false}
        className={`relative w-full !py-5 text-xl font-semibold ${
          featured ? '' : 'border border-[#e8e8ea] !bg-white'
        }`}
      >
        {t(`${base}.cta`)}
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

/** A cell: included, not included, or a figure ("Unlimited", "No limit" as keys). */
type Cell = true | false | string
const COMPARE: { group: string; rows: [string, Cell, Cell, Cell][] }[] = [
  {
    group: 'selling',
    rows: [
      ['tillDevices', true, true, true],
      ['tills', '1', '4', 'unlimited'],
      ['tabs', true, true, true],
      ['offline', true, true, true],
      ['printer', true, true, true],
    ],
  },
  {
    group: 'invoicing',
    rows: [
      ['invoices', '500', '3,000', 'noLimit'],
      ['filing', true, true, true],
      ['peppol', true, true, true],
      ['quotes', true, true, true],
      ['fixes', true, true, true],
    ],
  },
  {
    group: 'buying',
    rows: [
      ['bills', true, true, true],
      ['orders', false, true, true],
      ['cover', false, true, true],
    ],
  },
  {
    group: 'people',
    rows: [
      ['people', '5', '15', 'unlimited'],
      ['branches', '1', '4', 'unlimited'],
      ['roles', true, true, true],
    ],
  },
  {
    group: 'reports',
    rows: [
      ['reports', true, true, true],
      ['ai', false, true, true],
      ['export', true, true, true],
      ['api', false, true, true],
    ],
  },
  {
    group: 'support',
    rows: [
      ['help', true, true, true],
      ['priority', false, true, true],
      ['named', false, false, true],
    ],
  },
]

function Compare() {
  const { t } = useTranslation()
  const c = 'site.pricing.compare'
  const cell = (value: Cell) => {
    if (value === true)
      return <img src={checkIcon} alt={t(`${c}.included`)} className="mx-auto size-4" />
    if (value === false)
      return (
        <span
          role="img"
          aria-label={t(`${c}.notIncluded`)}
          className="mx-auto block h-0.5 w-2.5 rounded-full bg-[#c4c6cb]"
        />
      )
    return /^[a-z]/i.test(value) ? t(`${c}.${value}`) : value
  }
  const head = 'px-4 py-4 text-center align-bottom'
  return (
    <section className="mx-auto mt-[200px] w-full max-w-[1212px] px-4 max-md:mt-24">
      <h2 className="landing-title landing-cap text-center font-semibold leading-[normal]">
        {t(`${c}.lead`)}{' '}
        <span className={`landing-em font-light italic lowercase ${SOFT}`}>{t(`${c}.em`)}</span>
      </h2>
      <div className="mt-[60px] overflow-x-auto rounded-lg border border-[#e8e8ea] max-md:mt-10">
        <table className="w-full min-w-[560px] border-collapse text-[14.5px] leading-[normal]">
          <thead>
            <tr className="bg-[#fafafa]">
              <th scope="col" className="w-[46%] px-4 py-4 text-start">
                <span className="sr-only">{t(`${c}.feature`)}</span>
              </th>
              {PLANS.map((plan) => (
                <th
                  key={plan.key}
                  scope="col"
                  className={`${head} ${plan.key === 'plus' ? 'bg-[#eaedf8]' : ''}`}
                >
                  <span className="block text-[15px] font-semibold">
                    {t(`site.pricing.plans.${plan.key}.name`)}
                  </span>
                  <span
                    className={`mt-1 inline-flex items-center gap-1 text-[12.5px] font-normal tabular-nums ${
                      plan.key === 'plus' ? 'text-[#2c4eb7]' : 'text-[#737781]'
                    }`}
                  >
                    <RialMark className="w-2.5" />
                    {money(plan.monthly)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((section) => (
              <Fragment key={section.group}>
                <tr className="bg-[#fafafa]">
                  <th
                    scope="colgroup"
                    colSpan={4}
                    className="px-4 py-2.5 text-start text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#737781]"
                  >
                    {t(`${c}.groups.${section.group}`)}
                  </th>
                </tr>
                {section.rows.map(([key, ...values]) => (
                  <tr key={key} className="border-t border-[#f0f0f2]">
                    <th scope="row" className={`px-4 py-3.5 text-start font-medium ${SOFT}`}>
                      {t(`${c}.rows.${key}`)}
                    </th>
                    {values.map((value, index) => (
                      <td
                        key={index}
                        className={`px-4 py-3.5 text-center font-semibold tabular-nums ${
                          index === 1 ? 'bg-[#fafafa]' : ''
                        }`}
                      >
                        {cell(value)}
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
