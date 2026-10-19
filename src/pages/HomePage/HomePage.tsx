import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import checkIcon from '../../assets/home/check.svg'
import texture from '../../assets/home/texture.jpg'
import heroLines from '../../assets/home/hero-lines.svg'
import heroDashboard from '../../assets/home/hero-dashboard.webp'
import owner1 from '../../assets/home/owner-1.webp'
import owner2 from '../../assets/home/owner-2.webp'
import overviewCurve from '../../assets/home/overview-curve.svg'
import overviewPhone from '../../assets/home/overview-phone.webp'
import mockTill from '../../assets/home/mock-till.webp'
import mockInvoices from '../../assets/home/mock-invoices.webp'
import mockFiling from '../../assets/home/mock-filing.webp'
import mockStock from '../../assets/home/mock-stock.webp'
import mockDashboard from '../../assets/home/mock-dashboard.webp'
import stepsLaptop from '../../assets/home/steps-laptop.jpg'
import posCurve from '../../assets/home/pos-curve.svg'
import posCatalog from '../../assets/home/pos-catalog.webp'
import posPaid from '../../assets/home/pos-paid.webp'
import showcaseDashboard from '../../assets/home/showcase-dashboard.webp'
import './HomePage.css'
import { ClosingBand, Cta, Footer, Heading, INK, Nav, SOFT, Texture } from './site'
import { useSiteMail } from './siteMail'

/**
 * The public landing page (Figma "Website", 186:12615), laid out on the frame's own numbers:
 * 1920 wide, sections at 1220 / 1520 / 1720, 200 between sections, Urbanist throughout. Narrower
 * screens keep the same order and let the rows stack. The product mockups are the frame's own
 * renders; the words and layout are code. No motion for now (owner, 27 Sep 2026).
 */
export function HomePage() {
  return (
    <div className={`landing min-h-screen overflow-x-clip bg-white ${INK}`}>
      <Hero />
      <Overview />
      <Features />
      <Steps />
      <Counter />
      <Showcase />
      <ClosingBand />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------- hero */

function Hero() {
  const { t } = useTranslation()
  const mail = useSiteMail()
  return (
    <header id="top" className="relative isolate pb-5">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-[1200px] overflow-hidden">
        <div className="absolute inset-0 rotate-180 opacity-20">
          <img src={texture} alt="" className="size-full object-cover" />
          <div className="landing-texture-fade absolute inset-0" />
        </div>
        <img src={heroLines} alt="" className="absolute inset-0 size-full" />
      </div>

      <div className="mx-auto flex w-full max-w-[1220px] flex-col items-center gap-[100px] px-4 pt-[25px] max-md:gap-16 xl:px-0">
        <Nav active="home" />

        <div className="flex w-full max-w-[754px] flex-col items-center gap-6 text-center">
          <div className="flex w-full flex-col items-center gap-6">
            <h1 className="landing-title landing-cap flex w-full flex-col items-center gap-2.5 font-semibold leading-[normal]">
              <span>{t('landing.hero.lead')}</span>
              <span className="flex flex-wrap items-center justify-center gap-4 max-md:gap-2">
                <span className="landing-shadow-brand landing-pill rounded-lg bg-white p-4 font-light italic lowercase text-[#737781] max-md:p-2">
                  {t('landing.hero.word')}
                </span>
                <span>{t('landing.hero.tail')}</span>
              </span>
            </h1>
            <p className="landing-cap w-full text-base leading-6">
              {t('landing.hero.body1')}
              <br className="max-md:hidden" /> {t('landing.hero.body2')}
            </p>
          </div>
          <Cta href={mail.demo}>{t('landing.cta.demo')}</Cta>
        </div>

        <div className="relative w-full">
          <div className="landing-hero-frame relative mt-[-1px] box-content aspect-[1200/750] w-[calc(100%-20px)] overflow-hidden rounded-lg border-[10px] border-[rgba(44,78,183,0.1)] max-md:w-[calc(100%-10px)] max-md:border-[5px]">
            <img
              src={heroDashboard}
              alt={t('landing.hero.dashboardAlt')}
              className="size-full object-cover object-top"
            />
          </div>
          <div
            aria-hidden="true"
            className="landing-fade-bottom pointer-events-none absolute inset-x-0 top-0 aspect-[1220/780] w-full rounded-lg"
          />
        </div>
      </div>
    </header>
  )
}

/* --------------------------------------------------------------- overview */

function Overview() {
  const { t } = useTranslation()
  const mail = useSiteMail()
  return (
    <section className="relative mx-auto mt-[120px] w-full max-w-[1720px] px-4 max-md:mt-10 md:px-8 min-[1800px]:px-0">
      {/* The frame's two stacked washes and its curve panel, 40 px apart each. */}
      <div
        aria-hidden="true"
        className="absolute start-1/2 top-0 h-full w-[88.4%] -translate-x-1/2 rounded-lg bg-gradient-to-b from-[#eaf0ff] to-white/0 rtl:translate-x-1/2"
      />
      <div
        aria-hidden="true"
        className="absolute start-1/2 top-10 h-[calc(100%-40px)] w-[94.2%] -translate-x-1/2 rounded-lg bg-gradient-to-b from-[#eaf0ff] to-white/0 rtl:translate-x-1/2"
      />
      <img
        src={overviewCurve}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-20 h-[1244px] w-full max-xl:h-[calc(100%-80px)]"
      />

      <div className="relative flex min-h-[1407px] flex-col px-20 pt-40 max-xl:min-h-0 max-xl:px-8 max-xl:pt-24 max-md:px-4 max-md:pt-14">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-6">
            <Heading lead={t('landing.overview.titleLead')} em={t('landing.overview.titleEm')} />
            <p className="landing-cap shrink-0 text-2xl font-medium leading-[normal] max-md:hidden">
              {t('landing.overview.tag')}
            </p>
          </div>
          <p className="landing-cap text-xl leading-[normal]">{t('landing.overview.sub')}</p>
        </div>

        <div className="mt-[100px] flex items-start justify-between gap-10 max-lg:flex-col max-md:mt-12">
          <div className="flex w-[192px] shrink-0 flex-col gap-4">
            <div className="flex">
              <img src={owner1} alt="" className="size-[104px] -m-[2px] me-[-10px] max-w-none" />
              <img src={owner2} alt="" className="size-[104px] -m-[2px] max-w-none" />
            </div>
            <p className="landing-cap text-2xl font-semibold leading-[normal]">
              {t('landing.overview.owners')}
            </p>
          </div>
          <div className="flex w-full max-w-[935px] flex-col items-start gap-10">
            <div className="landing-cap text-[30px] font-medium leading-[normal] max-md:text-[22px]">
              <p>
                {t('landing.overview.s1')}{' '}
                <span className="text-[#737781]">{t('landing.overview.s2')}</span>{' '}
                {t('landing.overview.s3')}{' '}
                <span className="text-[#737781]">{t('landing.overview.s4')}</span>
              </p>
              <p className="mt-9">{t('landing.overview.closing')}</p>
            </div>
            <Cta href={mail.demo}>{t('landing.cta.demo')}</Cta>
          </div>
        </div>

        <div className="relative mx-auto mt-auto h-[600px] w-[442px] max-w-full overflow-hidden max-xl:mt-16 max-sm:h-[460px]">
          <div className="absolute inset-x-0 top-0 h-[913px]">
            <img
              src={overviewPhone}
              alt={t('landing.overview.phoneAlt')}
              className="absolute left-[-97.96%] top-[-3.72%] h-[107.45%] w-[295.93%] max-w-none"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-white/0 from-50% to-white to-[65%]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- features */

type Feature = {
  key: 'till' | 'invoicing' | 'filing' | 'stock' | 'dashboard'
  mock: string
  /** Where the frame puts the mockup: centred at its drawn width, or pinned from the left. */
  mockStyle: CSSProperties
  wide?: boolean
}

const centred = (width: number): CSSProperties => ({
  width,
  insetInlineStart: '50%',
  translate: '-50% 0',
})

const FEATURE_ROWS: Feature[][] = [
  [
    { key: 'till', mock: mockTill, mockStyle: centred(412) },
    { key: 'invoicing', mock: mockInvoices, mockStyle: centred(874), wide: true },
  ],
  [
    { key: 'filing', mock: mockFiling, mockStyle: centred(412) },
    { key: 'stock', mock: mockStock, mockStyle: centred(412) },
    { key: 'dashboard', mock: mockDashboard, mockStyle: { width: 451, insetInlineStart: 38.67 } },
  ],
]

function FeatureCard({ feature }: { feature: Feature }) {
  const { t } = useTranslation()
  const base = `landing.features.${feature.key}`
  return (
    <article
      className={`relative h-[484.67px] overflow-hidden rounded-lg border border-[#eaedf8] bg-white ${
        feature.wide || feature.key !== 'till'
          ? 'w-full lg:w-auto lg:flex-1'
          : 'w-full lg:basis-[490.667px] lg:shrink'
      }`}
    >
      <Texture flip="rotate" />
      <div className="relative px-[39px] pt-[39px] max-md:px-6 max-md:pt-6">
        <h3 className="landing-cap text-[32px] font-semibold leading-[normal] max-md:text-[26px]">
          {t(`${base}.lead`)}
          <span className={`landing-em font-light italic ${SOFT}`}>{t(`${base}.em`)}</span>
          {feature.key === 'stock' ? t(`${base}.tail`) : null}
        </h3>
        <p
          className={`landing-cap mt-4 text-lg leading-7 ${
            feature.wide ? 'max-w-[925px]' : 'max-w-[411px]'
          }`}
        >
          {t(`${base}.body`)}
        </p>
      </div>
      <img
        src={feature.mock}
        alt={t(`${base}.alt`)}
        className="absolute bottom-0 max-w-none rtl:!translate-x-1/2"
        style={feature.mockStyle}
        loading="lazy"
      />
    </article>
  )
}

function Features() {
  const { t } = useTranslation()
  return (
    <section
      id="features"
      className="mx-auto mt-[200px] flex w-full max-w-[1920px] flex-col items-center gap-[60px] max-md:mt-24"
    >
      <div className="flex w-full max-w-[716px] flex-col items-center gap-6 px-4 text-center">
        <Heading lead={t('landing.features.titleLead')} em={t('landing.features.titleEm')} />
        <p className="landing-cap text-xl leading-[normal]">{t('landing.features.sub')}</p>
      </div>
      <div className="flex w-full max-w-[1920px] flex-col gap-6 px-[200px] max-[1919px]:px-[max(2rem,calc((100vw-1520px)/2))] max-md:px-4">
        {FEATURE_ROWS.map((row, index) => (
          <div key={index} className="flex gap-6 max-lg:flex-col">
            {row.map((feature) => (
              <FeatureCard key={feature.key} feature={feature} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ steps */

const STEPS = ['sale', 'invoice', 'cleared', 'serve'] as const

function Steps() {
  const { t } = useTranslation()
  const mail = useSiteMail()
  const [active, setActive] = useState(0)
  const step = STEPS[active]

  return (
    <section className="mx-auto mt-[200px] flex w-full max-w-[1520px] flex-col items-center gap-[60px] px-4 max-md:mt-24 md:px-8 min-[1600px]:px-0">
      <div className="flex w-full max-w-[684px] flex-col items-center gap-6 text-center">
        <Heading lead={t('landing.steps.titleLead')} em={t('landing.steps.titleEm')} />
        <p className="landing-cap text-xl leading-[normal]">{t('landing.steps.sub')}</p>
      </div>

      <div
        role="tablist"
        aria-label={t('landing.steps.label')}
        className="flex flex-wrap justify-center gap-4"
      >
        {STEPS.map((id, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`step-tab-${id}`}
            aria-selected={index === active}
            aria-controls="step-panel"
            onClick={() => setActive(index)}
            className={[
              'h-[45px] w-[100px] rounded-lg text-base font-medium leading-[normal]',
              index === active
                ? 'bg-[#151c2d] text-white'
                : `border border-[#d0d2d5] bg-white ${INK}`,
            ].join(' ')}
          >
            {t(`landing.steps.tabs.${id}`)}
          </button>
        ))}
      </div>

      <div
        id="step-panel"
        role="tabpanel"
        aria-labelledby={`step-tab-${step}`}
        className="relative h-[620px] w-full overflow-hidden rounded-lg border border-[#eaedf8] bg-white max-lg:h-auto"
      >
        <Texture flip="y" />
        <div
          aria-hidden="true"
          className="absolute -start-px -top-[1.34px] h-2 w-[38.16%] rounded-ss-lg bg-[#c0cae9]"
        />

        <div className="relative ps-[60px] pt-[226.66px] max-lg:px-6 max-lg:pt-14">
          <h3 className="landing-cap text-[32px] font-semibold leading-[normal]">
            {t(`landing.steps.${step}.lead`)}
            <span className={`landing-em font-light italic ${SOFT}`}>
              {t(`landing.steps.${step}.em`)}
            </span>
          </h3>
          <p className="landing-cap mt-[15px] text-lg leading-7">
            {t(`landing.steps.${step}.body`)}
          </p>
          <div className="mt-[40px]">
            <Cta href={mail.demo} tone="brand">
              {t('landing.cta.demo')}
            </Cta>
          </div>
        </div>

        <div className="absolute end-0 top-[106.66px] box-content h-[500px] w-[786px] overflow-hidden rounded-ss-lg border-[13px] border-[rgba(44,78,183,0.1)] max-xl:w-[50%] max-lg:static max-lg:mt-10 max-lg:h-[300px] max-lg:w-auto max-lg:rounded-none max-lg:border-x-0 max-lg:border-b-0">
          <img
            src={stepsLaptop}
            alt={t('landing.steps.photoAlt')}
            className="absolute left-[-7.12%] top-[-3.45%] h-[118.63%] w-[113.96%] max-w-none object-cover"
            loading="lazy"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-[#2c4eb7] mix-blend-hue" />
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- counter */

function Counter() {
  const { t } = useTranslation()
  const items = ['taps', 'tabs', 'cashUp', 'offline'] as const
  return (
    <section className="relative mx-auto mt-[200px] w-full max-w-[1920px] overflow-x-clip max-md:mt-24">
      <img
        src={posCurve}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute start-1/2 top-[500px] h-[320px] w-[1930px] max-w-none -translate-x-1/2 rtl:translate-x-1/2 max-lg:top-[640px]"
      />
      <div className="relative mx-auto flex w-full max-w-[1520px] flex-col items-center gap-[100px] px-4 max-md:gap-12 md:px-8 min-[1600px]:px-0">
        <div className="flex w-full flex-col items-center gap-6 text-center">
          <Heading lead={t('landing.counter.titleLead')} em={t('landing.counter.titleEm')} />
          <p className="landing-cap text-xl leading-[normal]">
            {t('landing.counter.sub1')}
            <br className="max-md:hidden" /> {t('landing.counter.sub2')}
          </p>
        </div>

        <div className="flex w-full items-center justify-between gap-10 max-lg:flex-col">
          <div className="flex items-start gap-8">
            <img
              src={posCatalog}
              alt={t('landing.counter.catalogAlt')}
              className="landing-device h-[600px] w-[288.7px] rounded-[7.385px] max-sm:h-[520px] max-sm:w-[250px]"
              loading="lazy"
            />
            <img
              src={posPaid}
              alt={t('landing.counter.paidAlt')}
              className="landing-device h-[600px] w-[288.7px] rounded-[7.385px] max-sm:hidden"
              loading="lazy"
            />
          </div>

          <div className="flex w-full min-w-0 max-w-[760px] flex-col justify-center gap-10 lg:flex-1">
            <div className="flex flex-col gap-4">
              <h3 className="landing-cap text-[32px] font-semibold leading-[normal]">
                {t('landing.counter.headLine1')}
                <br className="max-md:hidden" /> {t('landing.counter.headLine2')}{' '}
                <span className="landing-em font-light italic">{t('landing.counter.headEm')}</span>
              </h3>
              <p className={`landing-cap text-base leading-[normal] ${SOFT}`}>
                {t('landing.counter.body1')}
                <br className="max-md:hidden" /> {t('landing.counter.body2')}
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {items.map((id) => (
                <li
                  key={id}
                  className={`landing-cap flex items-center gap-3.5 text-sm leading-[normal] ${SOFT}`}
                >
                  <img src={checkIcon} alt="" className="size-[18px]" />
                  {t(`landing.counter.items.${id}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- showcase */

function Showcase() {
  const { t } = useTranslation()
  return (
    <section className="mx-auto mt-[200px] w-full max-w-[1720px] px-4 max-md:mt-24 md:px-8 min-[1800px]:px-0">
      <div className="relative h-[1401px] overflow-hidden rounded-lg border-x border-t border-[#eaedf8] max-lg:h-auto max-lg:pb-16">
        <Texture flip="y" />
        <div className="relative mx-auto flex max-w-[716px] flex-col items-center gap-6 px-4 pt-[200px] text-center max-md:pt-16">
          <Heading lead={t('landing.showcase.titleLead')} em={t('landing.showcase.titleEm')} />
          <p className="landing-cap text-xl leading-[normal]">{t('landing.showcase.sub')}</p>
          <Cta to="/dashboard" tone="brand">
            {t('landing.showcase.cta')}
          </Cta>
        </div>

        <div className="absolute start-1/2 top-[619px] w-[1220px] -translate-x-1/2 rtl:translate-x-1/2 max-lg:relative max-lg:start-auto max-lg:top-auto max-lg:mt-14 max-lg:w-full max-lg:translate-x-0 max-lg:px-4">
          <div
            aria-hidden="true"
            className="landing-sheet absolute start-[50px] top-[-57.5px] h-[628px] w-[1120px] -rotate-4 rounded-lg bg-white/50 backdrop-blur-[16px] max-lg:hidden"
          />
          <div
            aria-hidden="true"
            className="landing-sheet absolute start-[50px] top-[-32px] h-[577px] w-[1120px] -rotate-2 rounded-lg bg-white/60 backdrop-blur-[16px] max-lg:hidden"
          />
          <div className="relative mx-auto mt-[2px] box-content aspect-[1200/750] w-[calc(100%-16px)] max-w-[1200px] overflow-hidden rounded-lg border-8 border-[#f4f7ff]">
            <img
              src={showcaseDashboard}
              alt={t('landing.showcase.dashboardAlt')}
              className="size-full object-cover object-top"
              loading="lazy"
            />
          </div>
          <div
            aria-hidden="true"
            className="landing-fade-bottom pointer-events-none absolute inset-x-0 top-px aspect-[1220/780] w-full rounded-lg"
          />
        </div>
      </div>
    </section>
  )
}
