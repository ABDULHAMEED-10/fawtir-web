import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '../../components/BrandLogo'
import { prefersReducedMotion, trackPointer, useReveal, useScrollProgress } from './motion'
import arrowIcon from '../../assets/home/arrow.svg'
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
import ctaCurve from '../../assets/home/cta-curve.svg'
import footerLogo from '../../assets/home/footer-logo.svg'
import facebookIcon from '../../assets/home/facebook.svg'
import instagramIcon from '../../assets/home/instagram.svg'
import linkedinIcon from '../../assets/home/linkedin.svg'
import xIcon from '../../assets/home/x.svg'
import './HomePage.css'

/**
 * The public landing page (Figma "Website", 186:12615): nav, hero, overview, what the till does,
 * the four steps, the counter, the dashboard showcase, the closing band and the footer.
 *
 * Built at the frame's 1920 px width and narrowed for smaller screens. The product mockups are the
 * frame's own renders; the words, layout and motion are code. Every animation settles at its
 * resting state under `prefers-reduced-motion`.
 */
const DEMO_MAILTO = 'mailto:support@fawtir.om?subject=Fawtir%20demo%20request'
// TODO(backend): no partner programme page exists yet; the link asks by email meanwhile.
const PARTNERS_MAILTO = 'mailto:support@fawtir.om?subject=Fawtir%20partners'

export function HomePage() {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)

  return (
    <div ref={root} className="landing min-h-screen overflow-x-clip bg-white text-[#151c2d]">
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

/* ------------------------------------------------------------------ pieces */

/** A heading whose first part is set upright and whose last part is light italic, as drawn. */
function Title({
  lead,
  em,
  tail,
  className = '',
  emClassName = 'text-[#494d56]',
  breakBefore = true,
}: {
  lead: string
  em: string
  tail?: string
  className?: string
  emClassName?: string
  breakBefore?: boolean
}) {
  return (
    <h2 className={`landing-title font-semibold leading-[1.15] ${className}`}>
      <span>{lead}</span>
      {breakBefore ? <br /> : ' '}
      <span className={`landing-em font-light italic lowercase ${emClassName}`}>{em}</span>
      {tail ? <span>{tail}</span> : null}
    </h2>
  )
}

function Arrow() {
  return <img src={arrowIcon} alt="" className="landing-arrow size-4 -rotate-90" />
}

/** The frame's button, dark or brand blue, with the arrow that slips out on hover. */
function Cta({
  children,
  to,
  href,
  tone = 'dark',
  arrow = true,
  className = '',
}: {
  children: ReactNode
  to?: string
  href?: string
  tone?: 'dark' | 'brand' | 'light'
  arrow?: boolean
  className?: string
}) {
  const classes = [
    'landing-cta inline-flex items-center justify-center gap-2.5 rounded-lg px-4 py-3 text-base whitespace-nowrap',
    tone === 'dark'
      ? 'bg-[#151c2d] text-white'
      : tone === 'brand'
        ? 'bg-[#2c4eb7] text-white'
        : 'bg-[#f3f3f3] text-[#151c2d]',
    className,
  ].join(' ')
  const body = (
    <>
      <span>{children}</span>
      {arrow ? <Arrow /> : null}
    </>
  )
  return to ? (
    <Link to={to} className={classes}>
      {body}
    </Link>
  ) : (
    <a href={href} className={classes}>
      {body}
    </a>
  )
}

/** A soft texture panel, flipped and faded exactly as the frame's "BG" layers are. */
function Texture({ opacity, flip = 'y' }: { opacity: number; flip?: 'y' | 'rotate' }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
      style={{ transform: flip === 'y' ? 'scaleY(-1)' : 'rotate(180deg)' }}
    >
      <img src={texture} alt="" className="size-full object-cover" style={{ opacity }} />
      <div className="landing-texture-fade absolute inset-0" style={{ opacity }} />
    </div>
  )
}

/* -------------------------------------------------------------------- nav */

function Nav() {
  const { t, i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  const switchLanguage = () => {
    const next = arabic ? 'en' : 'ar'
    void i18n.changeLanguage(next)
    try {
      localStorage.setItem('language', next)
    } catch {
      /* storage may be blocked; the switch still applies to this visit */
    }
    document.documentElement.lang = next
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr'
  }

  return (
    <nav
      className="landing-nav relative z-20 mx-auto flex w-full max-w-[1220px] items-center justify-center gap-6 max-lg:justify-between max-md:gap-2"
      aria-label={t('landing.nav.label')}
    >
      <div className="landing-shadow flex items-center gap-[140px] rounded-lg border border-[#e8e8ea] bg-white px-6 py-3 max-xl:gap-16 max-lg:gap-8 max-md:px-3">
        <BrandLogo size="sm" to="/" />
        <div className="flex items-center gap-8 text-base max-lg:gap-5 max-md:hidden">
          <a href="#top" className="font-semibold text-[#2c4eb7]">
            {t('landing.nav.home')}
          </a>
          <Link to="/plans" className="landing-link">
            {t('landing.nav.pricing')}
          </Link>
          <a href="#features" className="landing-link">
            {t('landing.nav.features')}
          </a>
          <a href={PARTNERS_MAILTO} className="landing-link">
            {t('landing.nav.partners')}
          </a>
        </div>
      </div>
      <div className="landing-shadow flex h-[59px] items-center gap-2 rounded-lg border border-[#e8e8ea] bg-white px-2 py-4">
        <button
          type="button"
          onClick={switchLanguage}
          className="landing-link rounded-lg px-3 py-3 text-base"
          lang={arabic ? 'en' : 'ar'}
        >
          {arabic ? 'English' : 'العربية'}
        </button>
        <Cta to="/signup" tone="light" arrow={false} className="max-sm:hidden">
          {t('landing.nav.signUp')}
        </Cta>
        <Cta href={DEMO_MAILTO} tone="brand" className="max-sm:px-3">
          {t('landing.nav.contact')}
        </Cta>
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------- hero */

function Words({ text, start = 0 }: { text: string; start?: number }) {
  return (
    <>
      {text.split(' ').map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="landing-word"
          style={{ '--i': start + index } as React.CSSProperties}
        >
          {word}
          {' '}
        </span>
      ))}
    </>
  )
}

function Hero() {
  const { t } = useTranslation()
  const stage = useScrollProgress<HTMLDivElement>()
  const lead = t('landing.hero.lead')
  const leadWords = lead.split(' ').length

  return (
    <header id="top" className="relative isolate overflow-hidden pt-[25px]">
      <div aria-hidden="true" className="landing-hero-bg absolute inset-x-0 top-0 -z-10 h-[1200px]">
        <img src={texture} alt="" className="size-full rotate-180 object-cover opacity-20" />
        <div className="landing-texture-fade absolute inset-0" />
        <div className="landing-orb landing-orb--a" />
        <div className="landing-orb landing-orb--b" />
        <img src={heroLines} alt="" className="landing-lines absolute inset-0 size-full" />
      </div>

      <div className="px-4 md:px-8">
        <Nav />
      </div>

      <div className="mx-auto mt-[100px] flex w-full max-w-[754px] flex-col items-center gap-6 px-4 text-center max-md:mt-16">
        <h1 className="landing-hero-title font-semibold leading-[1.2] text-[#151c2d]">
          <span className="landing-cap">
            <Words text={lead} />
          </span>
          <span className="mt-2.5 flex flex-wrap items-center justify-center gap-4 max-md:gap-2">
            <span
              className="landing-pill landing-shadow-brand rounded-lg bg-white p-4 font-light italic lowercase text-[#737781] max-md:p-2"
              style={{ '--i': leadWords } as React.CSSProperties}
            >
              {t('landing.hero.word')}
            </span>
            <span className="landing-cap">
              <Words text={t('landing.hero.tail')} start={leadWords + 1} />
            </span>
          </span>
        </h1>
        <p
          className="landing-fade landing-cap max-w-[640px] text-base leading-6"
          style={{ '--d': '700ms' } as React.CSSProperties}
        >
          {t('landing.hero.body')}
        </p>
        <div className="landing-fade" style={{ '--d': '850ms' } as React.CSSProperties}>
          <Cta href={DEMO_MAILTO}>{t('landing.cta.demo')}</Cta>
        </div>
      </div>

      <div
        ref={stage}
        className="landing-hero-stage relative mx-auto mt-[100px] w-full max-w-[1220px] px-4 max-md:mt-14"
      >
        <div className="landing-hero-frame landing-rise relative mx-[10px] mt-[9px] overflow-hidden rounded-lg border-[10px] border-[rgba(44,78,183,0.1)] max-md:mx-0 max-md:border-[5px]">
          <img
            src={heroDashboard}
            alt={t('landing.hero.dashboardAlt')}
            className="aspect-[1200/750] w-full object-cover object-top"
          />
        </div>
        <div
          aria-hidden="true"
          className="landing-hero-fade pointer-events-none absolute inset-0 rounded-lg"
        />
      </div>
    </header>
  )
}

/* --------------------------------------------------------------- overview */

function Overview() {
  const { t } = useTranslation()
  const words = useScrollProgress<HTMLDivElement>()
  const phone = useScrollProgress<HTMLDivElement>()
  const segments: { text: string; muted: boolean }[] = [
    { text: t('landing.overview.s1'), muted: false },
    { text: t('landing.overview.s2'), muted: true },
    { text: t('landing.overview.s3'), muted: false },
    { text: t('landing.overview.s4'), muted: true },
  ]
  const all = segments.flatMap((segment) =>
    segment.text
      .split(' ')
      .filter(Boolean)
      .map((word) => ({ word, muted: segment.muted })),
  )
  const closing = t('landing.overview.closing').split(' ')
  const total = all.length + closing.length

  return (
    <section className="relative mx-auto mt-[120px] w-full max-w-[1720px] px-4 md:px-8 max-md:mt-10">
      <div
        aria-hidden="true"
        className="absolute inset-x-[100px] top-0 h-full rounded-lg bg-gradient-to-b from-[#eaf0ff] to-transparent max-md:inset-x-2"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-[50px] top-10 h-full rounded-lg bg-gradient-to-b from-[#eaf0ff] to-transparent max-md:inset-x-1"
      />
      <div className="relative overflow-hidden rounded-lg pb-0 pt-20 max-md:pt-12" data-reveal>
        <img
          src={overviewCurve}
          alt=""
          aria-hidden="true"
          className="landing-draw pointer-events-none absolute inset-0 size-full"
        />
        <div className="relative px-20 max-xl:px-10 max-md:px-5">
          <div className="flex items-start justify-between gap-6" data-reveal>
            <Title
              lead={t('landing.overview.titleLead')}
              em={t('landing.overview.titleEm')}
              className="landing-cap landing-up text-[62px]"
            />
            <p className="landing-up landing-cap mt-6 shrink-0 text-2xl font-medium max-md:hidden">
              {t('landing.overview.tag')}
            </p>
          </div>
          <p className="landing-up landing-cap mt-3 text-xl" data-reveal>
            {t('landing.overview.sub')}
          </p>

          <div className="mt-[100px] flex gap-10 max-lg:flex-col max-md:mt-12 lg:justify-between">
            <div className="landing-up flex w-[192px] shrink-0 flex-col gap-4" data-reveal>
              <div className="flex">
                <img
                  src={owner1}
                  alt=""
                  className="landing-avatar size-[100px] rounded-full border-2 border-white"
                />
                <img
                  src={owner2}
                  alt=""
                  className="landing-avatar landing-avatar--2 -ms-2 size-[100px] rounded-full border-2 border-white"
                />
              </div>
              <p className="landing-cap text-2xl font-semibold">{t('landing.overview.owners')}</p>
            </div>

            <div className="flex max-w-[935px] flex-col gap-10">
              <div
                ref={words}
                className="landing-cap text-[30px] font-medium leading-[1.4] max-md:text-[22px]"
              >
                <p>
                  {all.map(({ word, muted }, index) => (
                    <span
                      key={index}
                      className={`landing-scrub ${muted ? 'text-[#737781]' : ''}`}
                      style={{ '--t': (index / total).toFixed(3) } as React.CSSProperties}
                    >
                      {word}{' '}
                    </span>
                  ))}
                </p>
                <p className="mt-10">
                  {closing.map((word, index) => (
                    <span
                      key={index}
                      className="landing-scrub"
                      style={
                        { '--t': ((all.length + index) / total).toFixed(3) } as React.CSSProperties
                      }
                    >
                      {word}{' '}
                    </span>
                  ))}
                </p>
              </div>
              <div className="landing-up" data-reveal>
                <Cta href={DEMO_MAILTO}>{t('landing.cta.demo')}</Cta>
              </div>
            </div>
          </div>

          <div
            ref={phone}
            className="landing-phone relative mx-auto mt-10 h-[600px] w-[442px] overflow-hidden max-sm:h-[480px] max-sm:w-[330px]"
          >
            <img
              src={overviewPhone}
              alt={t('landing.overview.phoneAlt')}
              className="absolute start-1/2 top-[-3.72%] h-[107.45%] w-[295.93%] max-w-none -translate-x-1/2 object-cover rtl:translate-x-1/2"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-transparent from-50% to-white to-[65%]"
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
  mockClass: string
  wide?: boolean
}

const FEATURES_TOP: Feature[] = [
  {
    key: 'till',
    mock: mockTill,
    mockClass: 'w-[412px] start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
  },
  {
    key: 'invoicing',
    mock: mockInvoices,
    mockClass: 'w-[874px] start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
    wide: true,
  },
]
const FEATURES_BOTTOM: Feature[] = [
  {
    key: 'filing',
    mock: mockFiling,
    mockClass: 'w-[412px] start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
  },
  {
    key: 'stock',
    mock: mockStock,
    mockClass: 'w-[412px] start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
  },
  { key: 'dashboard', mock: mockDashboard, mockClass: 'w-[451px] start-[50px]' },
]

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const { t } = useTranslation()
  const base = `landing.features.${feature.key}`
  return (
    <article
      onPointerMove={trackPointer}
      className={`landing-card landing-up relative h-[485px] overflow-hidden rounded-lg border border-[#eaedf8] bg-white ${
        feature.wide ? 'w-full lg:w-auto lg:flex-1' : 'w-full lg:w-[490px] lg:shrink-0'
      } ${feature.key === 'filing' || feature.key === 'stock' || feature.key === 'dashboard' ? 'lg:flex-1 lg:w-auto' : ''}`}
      style={{ '--d': `${index * 110}ms` } as React.CSSProperties}
      data-reveal
    >
      <Texture opacity={0.1} flip="rotate" />
      <div aria-hidden="true" className="landing-spot pointer-events-none absolute inset-0" />
      <div className="relative px-[39px] pt-[39px] max-md:px-6 max-md:pt-6">
        <h3 className="landing-cap text-[32px] font-semibold leading-tight max-md:text-[26px]">
          {t(`${base}.lead`)}
          <span className="landing-em font-light italic text-[#494d56]">{t(`${base}.em`)}</span>
          {feature.key === 'stock' ? t(`${base}.tail`) : null}
        </h3>
        <p className="landing-cap mt-4 max-w-[925px] text-lg leading-7">{t(`${base}.body`)}</p>
      </div>
      <img
        src={feature.mock}
        alt={t(`${base}.alt`)}
        className={`landing-mock absolute bottom-0 max-w-none ${feature.mockClass}`}
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
      className="relative mx-auto mt-[200px] w-full max-w-[1920px] max-md:mt-24"
    >
      <div
        className="mx-auto flex max-w-[684px] flex-col items-center gap-6 px-4 text-center"
        data-reveal
      >
        <Title
          lead={t('landing.features.titleLead')}
          em={t('landing.features.titleEm')}
          className="landing-cap landing-up text-[62px]"
        />
        <p
          className="landing-cap landing-up text-xl"
          style={{ '--d': '120ms' } as React.CSSProperties}
        >
          {t('landing.features.sub')}
        </p>
      </div>
      <div className="mt-[60px] flex flex-col gap-6 px-[200px] max-2xl:px-16 max-lg:px-6 max-md:px-4">
        <div className="flex gap-6 max-lg:flex-col">
          {FEATURES_TOP.map((feature, index) => (
            <FeatureCard key={feature.key} feature={feature} index={index} />
          ))}
        </div>
        <div className="flex gap-6 max-lg:flex-col">
          {FEATURES_BOTTOM.map((feature, index) => (
            <FeatureCard key={feature.key} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ steps */

const STEPS = ['sale', 'invoice', 'cleared', 'serve'] as const
const STEP_MS = 5200
/** Each step frames the same photo differently, so the picture moves with the story. */
const STEP_VIEW = ['50% 30%', '20% 60%', '80% 40%', '50% 70%']

function Steps() {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const section = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = section.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.35,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Moves on by itself only while the panel is on screen and nobody is pointing at it.
  const running = visible && !paused && !prefersReducedMotion()
  useEffect(() => {
    if (!running) return
    const id = window.setTimeout(
      () => setActive((current) => (current + 1) % STEPS.length),
      STEP_MS,
    )
    return () => window.clearTimeout(id)
  }, [running, active])

  const step = STEPS[active]
  return (
    <section
      ref={section}
      className="relative mx-auto mt-[200px] w-full max-w-[1520px] px-4 max-md:mt-24"
    >
      <div
        className="mx-auto flex max-w-[684px] flex-col items-center gap-6 text-center"
        data-reveal
      >
        <Title
          lead={t('landing.steps.titleLead')}
          em={t('landing.steps.titleEm')}
          className="landing-cap landing-up text-[62px]"
        />
        <p
          className="landing-cap landing-up text-xl"
          style={{ '--d': '120ms' } as React.CSSProperties}
        >
          {t('landing.steps.sub')}
        </p>
      </div>

      <div
        role="tablist"
        aria-label={t('landing.steps.label')}
        className="landing-up mt-[60px] flex flex-wrap justify-center gap-4 max-md:gap-2"
        data-reveal
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
              'landing-tab h-[45px] w-[100px] rounded-lg border text-base font-medium transition-colors duration-300',
              index === active
                ? 'border-[#151c2d] bg-[#151c2d] text-white'
                : 'border-[#d0d2d5] bg-white text-[#151c2d] hover:border-[#151c2d]',
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
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        className="landing-up relative mt-[60px] h-[620px] overflow-hidden rounded-lg border border-[#eaedf8] bg-white max-lg:h-auto"
        data-reveal
      >
        <Texture opacity={0.1} />
        <div className="absolute inset-x-0 top-0 h-2 bg-[#eaedf8]/60" aria-hidden="true">
          <div
            key={`${active}-${running}`}
            className={`h-full rounded-se-lg bg-[#c0cae9] ${running ? 'landing-progress' : ''}`}
            style={
              { '--ms': `${STEP_MS}ms`, width: running ? undefined : '38%' } as React.CSSProperties
            }
          />
        </div>

        <div className="relative flex h-full items-center max-lg:flex-col max-lg:items-stretch">
          <div
            key={step}
            className="landing-step-copy relative z-10 flex w-[42%] flex-col items-start ps-[60px] max-lg:w-full max-lg:px-6 max-lg:pt-12"
          >
            <h3 className="landing-cap text-[32px] font-semibold">
              {t(`landing.steps.${step}.lead`)}
              <span className="landing-em font-light italic text-[#494d56]">
                {t(`landing.steps.${step}.em`)}
              </span>
            </h3>
            <p className="landing-cap mt-4 text-lg leading-7">{t(`landing.steps.${step}.body`)}</p>
            <div className="mt-8">
              <Cta href={DEMO_MAILTO} tone="brand">
                {t('landing.cta.demo')}
              </Cta>
            </div>
          </div>

          <div className="absolute end-[13px] top-[calc(50%+59.66px)] h-[500px] w-[786px] -translate-y-1/2 overflow-hidden rounded-ss-lg border-[13px] border-[rgba(44,78,183,0.1)] max-lg:static max-lg:mt-10 max-lg:h-[320px] max-lg:w-auto max-lg:translate-y-0 max-lg:rounded-none max-lg:border-x-0 max-lg:border-b-0">
            <img
              src={stepsLaptop}
              alt={t('landing.steps.photoAlt')}
              className="landing-step-photo size-full object-cover"
              style={{ objectPosition: STEP_VIEW[active] }}
              loading="lazy"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-[#2c4eb7] mix-blend-hue" />
          </div>
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
    <section
      className="relative mx-auto mt-[200px] w-full max-w-[1920px] overflow-hidden pb-10 max-md:mt-24"
      data-reveal
    >
      <img
        src={posCurve}
        alt=""
        aria-hidden="true"
        className="landing-draw pointer-events-none absolute start-1/2 top-[500px] h-[320px] w-[1930px] max-w-none -translate-x-1/2 rtl:translate-x-1/2 max-lg:top-[640px]"
      />
      <div className="relative mx-auto flex max-w-[1520px] flex-col items-center gap-[100px] px-4 max-md:gap-12">
        <div className="flex flex-col items-center gap-6 text-center" data-reveal>
          <Title
            lead={t('landing.counter.titleLead')}
            em={t('landing.counter.titleEm')}
            className="landing-cap landing-up text-[62px]"
          />
          <p
            className="landing-cap landing-up max-w-[560px] text-xl"
            style={{ '--d': '120ms' } as React.CSSProperties}
          >
            {t('landing.counter.sub')}
          </p>
        </div>

        <div className="flex w-full items-center justify-between gap-10 max-lg:flex-col">
          <div className="flex items-start gap-8" data-reveal>
            <img
              src={posCatalog}
              alt={t('landing.counter.catalogAlt')}
              className="landing-up landing-float landing-device h-[600px] w-[288px] rounded-[7.385px] max-sm:h-[520px] max-sm:w-[250px]"
              loading="lazy"
            />
            <img
              src={posPaid}
              alt={t('landing.counter.paidAlt')}
              className="landing-up landing-float landing-float--late landing-device h-[600px] w-[288px] rounded-[7.385px] max-sm:hidden"
              style={{ '--d': '160ms' } as React.CSSProperties}
              loading="lazy"
            />
          </div>

          <div className="flex w-[760px] max-w-full flex-col justify-center gap-10" data-reveal>
            <div className="landing-up flex flex-col gap-4">
              <h3 className="landing-cap text-[32px] font-semibold leading-tight">
                {t('landing.counter.headLead')}
                <span className="landing-em font-light italic">{t('landing.counter.headEm')}</span>
              </h3>
              <p className="landing-cap text-base text-[#494d56]">{t('landing.counter.body')}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {items.map((id, index) => (
                <li
                  key={id}
                  className="landing-tick landing-cap flex items-center gap-3.5 text-sm text-[#494d56]"
                  style={{ '--d': `${300 + index * 140}ms` } as React.CSSProperties}
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
  const stage = useScrollProgress<HTMLDivElement>()
  return (
    <section className="relative mx-auto mt-[200px] w-full max-w-[1720px] px-4 md:px-8 max-md:mt-24">
      <div
        ref={stage}
        className="landing-showcase relative h-[1401px] overflow-hidden rounded-lg border-x border-t border-[#eaedf8] max-lg:h-auto max-lg:pb-16"
      >
        <Texture opacity={0.1} />
        <div
          className="relative mx-auto flex max-w-[684px] flex-col items-center gap-6 px-4 pt-[200px] text-center max-md:pt-16"
          data-reveal
        >
          <Title
            lead={t('landing.showcase.titleLead')}
            em={t('landing.showcase.titleEm')}
            className="landing-cap landing-up text-[62px]"
          />
          <p
            className="landing-cap landing-up text-xl"
            style={{ '--d': '120ms' } as React.CSSProperties}
          >
            {t('landing.showcase.sub')}
          </p>
          <div className="landing-up" style={{ '--d': '220ms' } as React.CSSProperties}>
            <Cta to="/dashboard" tone="brand">
              {t('landing.showcase.cta')}
            </Cta>
          </div>
        </div>

        <div className="relative mx-auto mt-[160px] w-full max-w-[1220px] max-lg:mt-16 max-lg:px-4">
          <div
            aria-hidden="true"
            className="landing-sheet landing-sheet--back absolute inset-x-[50px] -top-[52px] h-[628px] rounded-lg bg-white/50 backdrop-blur-[16px] max-lg:hidden"
          />
          <div
            aria-hidden="true"
            className="landing-sheet landing-sheet--mid absolute inset-x-[50px] -top-[30px] h-[577px] rounded-lg bg-white/60 backdrop-blur-[16px] max-lg:hidden"
          />
          <div className="landing-sheet landing-sheet--front relative mx-auto w-full max-w-[1200px] overflow-hidden rounded-lg border-8 border-[#f4f7ff]">
            <img
              src={showcaseDashboard}
              alt={t('landing.showcase.dashboardAlt')}
              className="aspect-[1200/750] w-full object-cover object-top"
              loading="lazy"
            />
          </div>
          <div
            aria-hidden="true"
            className="landing-hero-fade pointer-events-none absolute inset-0 rounded-lg"
          />
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ closing band */

function ClosingBand() {
  const { t } = useTranslation()
  return (
    <section
      className="relative mt-[200px] min-h-[277px] overflow-hidden py-[26px] max-md:mt-20"
      data-reveal
    >
      <img
        src={ctaCurve}
        alt=""
        aria-hidden="true"
        className="landing-draw landing-draw--rev pointer-events-none absolute start-1/2 top-0 h-[277px] w-[1940px] max-w-none -translate-x-1/2 -scale-y-100 rotate-180 rtl:translate-x-1/2"
      />
      <div
        className="relative mx-auto flex w-full max-w-[1720px] items-center justify-between gap-8 px-4 md:px-8 max-lg:flex-col max-lg:items-start"
        data-reveal
      >
        <h2 className="landing-up landing-cap font-semibold leading-[1.3]">
          <span className="landing-band-title block">{t('landing.band.title')}</span>
          <span className="landing-band-em landing-em block font-light italic lowercase text-[#494d56]">
            {t('landing.band.em')}
          </span>
        </h2>
        <div
          className="landing-up flex shrink-0 items-center gap-4"
          style={{ '--d': '140ms' } as React.CSSProperties}
        >
          <Cta to="/signup" tone="brand">
            {t('landing.band.start')}
          </Cta>
          <Cta href={DEMO_MAILTO} arrow={false}>
            {t('landing.band.demo')}
          </Cta>
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- footer */

function Footer() {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const year = new Date().getFullYear()
  // TODO(backend): no newsletter list exists; the form opens a prepared email to support meanwhile.
  const subscribe = (event: React.FormEvent) => {
    event.preventDefault()
    const body = encodeURIComponent(`${name}\n${email}`)
    window.location.href = `mailto:support@fawtir.om?subject=Fawtir%20newsletter&body=${body}`
  }
  const links: { key: string; to?: string; href?: string }[] = [
    { key: 'pricing', to: '/plans' },
    { key: 'features', href: '#features' },
    { key: 'partners', href: PARTNERS_MAILTO },
    // TODO(backend): the privacy policy and terms have no pages yet.
    { key: 'privacy' },
    { key: 'terms' },
  ]
  const socials = [
    { icon: facebookIcon, label: 'Facebook' },
    { icon: instagramIcon, label: 'Instagram' },
    { icon: linkedinIcon, label: 'LinkedIn' },
    { icon: xIcon, label: 'X' },
  ]

  return (
    <footer
      className="relative mt-[200px] overflow-hidden rounded-t-lg bg-[#fafafa] max-md:mt-20"
      data-reveal
    >
      <div className="relative mx-auto grid w-full max-w-[1920px] grid-cols-1 lg:grid-cols-[1fr_950px] lg:gap-10 lg:pe-[83px] rtl:[direction:ltr]">
        <img
          src={footerLogo}
          alt=""
          aria-hidden="true"
          className="landing-footer-logo pointer-events-none absolute bottom-[60px] start-[117px] h-[765px] w-[1720px] max-w-none max-xl:start-6 max-xl:h-[380px] max-xl:w-[855px] max-md:start-6 max-md:h-[152px] max-md:w-[342px]"
        />
        <div aria-hidden="true" className="max-lg:hidden" />
        <div
          className="relative flex flex-col gap-[100px] px-4 pb-[400px] pt-[100px] rtl:[direction:rtl] max-xl:pb-[440px] max-md:gap-12 max-md:pb-[250px] max-md:pt-12 md:px-8 lg:px-0"
          data-reveal
        >
          <form
            onSubmit={subscribe}
            className="landing-up flex items-center gap-[60px] max-lg:flex-col max-lg:items-stretch max-lg:gap-6"
          >
            <div className="flex shrink-0 flex-col gap-2 text-base">
              <p className="font-semibold uppercase">{t('landing.footer.newsletter')}</p>
              <p className="landing-cap text-[#494d56]">{t('landing.footer.note')}</p>
            </div>
            <div className="flex flex-1 items-end gap-4 max-sm:flex-col max-sm:items-stretch">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('landing.footer.name')}
                aria-label={t('landing.footer.name')}
                autoComplete="name"
                className="landing-input min-w-0 flex-1 border-b border-[#e8e8ea] bg-transparent pb-4 text-base outline-none placeholder:text-[#8a8e96]"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('landing.footer.email')}
                aria-label={t('landing.footer.email')}
                autoComplete="email"
                className="landing-input min-w-0 flex-1 border-b border-[#e8e8ea] bg-transparent pb-4 text-base outline-none placeholder:text-[#8a8e96]"
              />
              <button
                type="submit"
                className="landing-cta inline-flex items-center justify-center gap-2.5 rounded-lg bg-[#151c2d] px-4 py-3 text-base text-white"
              >
                {t('landing.footer.signUp')}
                <Arrow />
              </button>
            </div>
          </form>

          <ul
            className="landing-up flex flex-wrap items-start justify-between gap-6 text-base font-semibold uppercase"
            style={{ '--d': '100ms' } as React.CSSProperties}
          >
            {links.map((link) => (
              <li key={link.key}>
                {link.to ? (
                  <Link to={link.to} className="landing-link">
                    {t(`landing.footer.links.${link.key}`)}
                  </Link>
                ) : link.href ? (
                  <a href={link.href} className="landing-link">
                    {t(`landing.footer.links.${link.key}`)}
                  </a>
                ) : (
                  <span>{t(`landing.footer.links.${link.key}`)}</span>
                )}
              </li>
            ))}
          </ul>

          <div
            className="landing-up flex items-center justify-between gap-4 border-t border-[#e8e8ea] pt-[30px] max-sm:flex-col max-sm:items-start"
            style={{ '--d': '180ms' } as React.CSSProperties}
          >
            <div className="flex gap-2">
              {socials.map((social) => (
                // TODO(backend): Fawtir's social accounts are not decided yet; the icons are drawn, not linked.
                <span
                  key={social.label}
                  role="img"
                  aria-label={social.label}
                  className="landing-social flex size-10 items-center justify-center rounded-lg bg-[#f3f4f5]"
                >
                  <img src={social.icon} alt="" className="size-5" />
                </span>
              ))}
            </div>
            <p className="landing-cap text-base text-[#494d56]">
              {t('landing.footer.rights', { year })}
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
