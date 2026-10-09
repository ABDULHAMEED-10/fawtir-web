import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RialMark } from '../../components/ui/Rial'
import { readPublicPlans, type SignupCataloguePlan } from '../../lib/identity/signupPlans'
import { COMPLIANCE_FEATURES, FEATURE_LIST } from '../../lib/plans'
import { comparisonColumns, comparisonGroups, type Cell } from '../PlansPage/comparison'
import {
  freeMonthsSummary,
  fullRial,
  launchCopy,
  perMonthBaisa,
  periodPriceBaisa,
  planDescription,
  planName,
  trialNote,
  usePlanCatalogue,
  type CatalogueRead,
} from '../PlansPage/catalogueView'
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
 * Every price, limit and feature comes from the published catalogue (`GET /v1/public/plans`,
 * SITE.md row 2.1), the same one the sign-up plans screen reads, and the comparison lists the
 * same rows as that screen's table. The frame drew three plans with its own figures; Enterprise
 * takes a card of its own and the frame's figures are not used (owner, 29 Sep 2026).
 */

/** Enterprise's card lines (`plans.enterprise.features.*`), as the sign-up screen shows them. */
const ENTERPRISE_LINES = 3
const DERIVED_FEATURE_LINES = 5

const count = (value: number) => value.toLocaleString('en-US')

export function PricingPage() {
  const { t } = useTranslation()
  const [yearly, setYearly] = useState(false)
  const { read, reload } = usePlanCatalogue('public-plans', readPublicPlans)
  const plans = read.status === 'ready' ? read.plans : null
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
        <Plans yearly={yearly} setYearly={setYearly} read={read} reload={reload} />
        <Counts />
        {plans && plans.length > 0 ? <Compare yearly={yearly} plans={plans} /> : null}
        <Faq items={useFaqItems(plans)} />
      </main>
      <ClosingBand />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------ plans */

function Plans({
  yearly,
  setYearly,
  read,
  reload,
}: {
  yearly: boolean
  setYearly: (on: boolean) => void
  read: CatalogueRead
  reload: () => void
}) {
  const { t, i18n } = useTranslation()
  const plans = read.status === 'ready' ? read.plans : null
  const months = plans ? freeMonthsSummary(plans) : null
  const trial = plans ? trialNote(t, plans, i18n.language) : null
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
          {months ? (
            <span className="rounded bg-[rgba(31,193,107,0.1)] px-1.5 py-0.5 text-xs font-semibold uppercase text-[#16884b]">
              {t(
                months.upTo ? 'site.pricing.billing.freeUpTo' : 'site.pricing.billing.freeMonths',
                {
                  count: months.count,
                },
              )}
            </span>
          ) : null}
        </button>
      </div>

      {read.status === 'loading' ? (
        <p role="status" className={`mx-auto mt-8 text-center text-base leading-6 ${SOFT}`}>
          {t('plans.loading')}
        </p>
      ) : read.status === 'failed' ? (
        <div role="alert" className="mx-auto mt-8 flex flex-col items-center gap-3 text-center">
          <p className={`text-base leading-6 ${SOFT}`}>{t('plans.unavailable')}</p>
          <button
            type="button"
            onClick={reload}
            className={`rounded-lg border px-4 py-3 text-base leading-[normal] ${option(false)}`}
          >
            {t('plans.retry')}
          </button>
        </div>
      ) : (
        <>
          {read.plans.length === 0 ? (
            <p role="status" className={`mx-auto mt-8 text-center text-base leading-6 ${SOFT}`}>
              {t('plans.empty')}
            </p>
          ) : null}
          <div className="mx-auto mt-8 grid max-w-[560px] grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-2 2xl:grid-cols-4">
            {read.plans.map((plan) => (
              <PlanCard key={plan.code} plan={plan} yearly={yearly} />
            ))}
            <PlanCard yearly={yearly} />
          </div>
        </>
      )}
      {trial ? (
        <p className={`mx-auto mt-6 max-w-[860px] text-center text-base leading-6 ${SOFT}`}>
          {trial}
        </p>
      ) : null}
    </section>
  )
}

/** The card lines of a plan the app has no copy for: what it adds beyond compliance. */
const derivedLines = (plan: SignupCataloguePlan) =>
  FEATURE_LIST.filter(
    (feature) =>
      !COMPLIANCE_FEATURES.includes(feature) &&
      plan.features.some((entry) => entry.key === feature && entry.enabled),
  )
    .slice(0, DERIVED_FEATURE_LINES)
    .map((feature) => `plan.featureName.${feature}`)

/** One plan from the catalogue, or Enterprise when no plan is given. */
function PlanCard({ plan, yearly }: { plan?: SignupCataloguePlan; yearly: boolean }) {
  const { t, i18n } = useTranslation()
  const featured = Boolean(plan?.recommended)
  const copy = plan ? launchCopy(plan.code) : undefined
  const soft = featured ? 'text-white/80' : SOFT
  const periodPrice = plan ? periodPriceBaisa(plan, yearly ? 'annual' : 'monthly') : null

  const limits = plan
    ? [
        t('site.pricing.limits.documents', { documents: count(plan.invoicesPerMonth) }),
        t('site.pricing.limits.people', { count: plan.peopleIncluded }),
        plan.branchesIncluded === null
          ? t('plan.feature.unlimitedBranches')
          : t('site.pricing.limits.branches', { count: plan.branchesIncluded }),
      ]
    : [t('plans.enterprise.features.f2')]
  const lines = !plan
    ? Array.from({ length: ENTERPRISE_LINES }, (_, i) => `plans.enterprise.features.f${i + 1}`)
    : copy
      ? Array.from({ length: copy.lines }, (_, i) => `plans.${copy.key}.features.f${i + 1}`)
      : derivedLines(plan)
  const features = lines
    // Enterprise's second line is its limits, already listed first.
    .filter((line) => line !== 'plans.enterprise.features.f2')
    .map((line) => t(line))

  // The note carries a price per document; the rial sign goes in where the figure is.
  const [before, after] = t('site.pricing.each', { amount: '\u0000' }).split('\u0000')
  // Display only, to the baisa: what one document of the allowance works out at.
  const monthly = plan ? perMonthBaisa(plan, yearly ? 'annual' : 'monthly') : null
  const each = plan && monthly !== null ? Math.round(monthly / plan.invoicesPerMonth) : null

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
            {plan ? planName(plan, i18n.language) : t('plan.planName.enterprise')}
          </h2>
          <p className={`text-lg leading-[normal] ${soft}`}>
            {plan
              ? (planDescription(plan, i18n.language) ??
                (copy ? t(`plan.audience.${copy.audience}`) : ''))
              : t('plan.audience.enterprise')}
          </p>
        </div>
        {plan ? (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="flex items-baseline gap-2 text-[clamp(2rem,1.5rem+1.4vw,2.625rem)] font-semibold leading-none tabular-nums">
              <RialMark className="w-8 self-center" />
              {fullRial(periodPrice)}
            </span>
            <span className={`text-xl leading-[normal] ${soft}`}>{t(yearly ? 'site.pricing.perYear' : 'site.pricing.perMonth')}</span>
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
                {fullRial(each)}
              </span>
              {after.trimStart()}
            </>
          ) : (
            t('plans.enterprise.billingNote')
          )}
        </p>
        {plan && yearly ? (
          <p className={`text-sm leading-[normal] ${soft}`}>
            {plan.annualFreeMonths > 0
              ? t('site.pricing.yearlyNoteMonths', { count: plan.annualFreeMonths })
              : t('site.pricing.yearlyNoteNoSaving')}
          </p>
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
function Compare({ yearly, plans }: { yearly: boolean; plans: readonly SignupCataloguePlan[] }) {
  const { t, i18n } = useTranslation()
  const columns = comparisonColumns(plans)
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
            {fullRial(value.baisa)}
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
              {columns.map((plan) => (
                <th
                  key={plan?.code ?? 'enterprise'}
                  scope="col"
                  className={`px-4 py-4 text-center align-bottom ${
                    plan?.recommended ? 'bg-[#eaedf8]' : ''
                  }`}
                >
                  <span className="block text-[15px] font-semibold">
                    {plan ? planName(plan, i18n.language) : t('plan.planName.enterprise')}
                  </span>
                  <span
                    className={`mt-1 inline-flex items-center gap-1 text-[12.5px] font-normal tabular-nums ${
                      plan?.recommended ? 'text-[#2c4eb7]' : 'text-[#737781]'
                    }`}
                  >
                    {plan ? (
                      <>
                        <RialMark className="w-2.5" />
                        {fullRial(periodPriceBaisa(plan, yearly ? 'annual' : 'monthly'))}
                        <span>{t(yearly ? 'plans.perYear' : 'plans.perMonth')}</span>
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
            {comparisonGroups(plans).map((group) => (
              <Fragment key={group.key}>
                <tr className="bg-[#fafafa]">
                  <th
                    scope="colgroup"
                    colSpan={columns.length + 1}
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
                    {columns.map((plan) => (
                      <td
                        key={plan?.code ?? 'enterprise'}
                        className={`px-4 py-3.5 text-center font-semibold tabular-nums ${
                          plan?.recommended ? 'bg-[#fafafa]' : ''
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
