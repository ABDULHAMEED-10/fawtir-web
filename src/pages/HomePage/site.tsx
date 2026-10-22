import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '../../components/BrandLogo'
import { withRial } from '../../components/ui/Rial'
import navLogo from '../../assets/home/nav-logo.svg'
import arrowIcon from '../../assets/home/arrow.svg'
import checkIcon from '../../assets/home/check.svg'
import texture from '../../assets/home/texture.jpg'
import ctaCurve from '../../assets/home/cta-curve.svg'
import footerLogo from '../../assets/home/footer-logo.svg'
import facebookIcon from '../../assets/home/facebook.svg'
import instagramIcon from '../../assets/home/instagram.svg'
import linkedinIcon from '../../assets/home/linkedin.svg'
import xIcon from '../../assets/home/x.svg'
import pageLines from '../../assets/site/hero-lines.svg'
import plusIcon from '../../assets/site/plus.svg'
import { useSiteMail } from './siteMail'
import './HomePage.css'

/**
 * What the public site's pages share (Figma "SaaS Website", 186:12607): the nav, the buttons, the
 * section headings, the closing band and the footer, on the frames' own numbers (1920 wide,
 * Urbanist). Home, Pricing, Features and Contact Us all draw them the same way.
 */

export const INK = 'text-[#151c2d]'
export const SOFT = 'text-[#494d56]'

/** The site's pages, as the nav names and links them. */
export type SitePage = 'home' | 'pricing' | 'features' | 'contact'

/* ------------------------------------------------------------------ pieces */

export function Arrow() {
  return <img src={arrowIcon} alt="" className="landing-arrow size-4 shrink-0 -rotate-90" />
}

/** The frame's buttons: 16 px regular, 12 / 16 padding, 8 radius, with the up-right arrow. */
export function Cta({
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
    'inline-flex items-center justify-center rounded-lg px-4 py-3 text-base leading-[normal] whitespace-nowrap',
    tone === 'dark' ? 'gap-2' : 'gap-2.5',
    tone === 'dark'
      ? 'bg-[#151c2d] text-white'
      : tone === 'brand'
        ? 'bg-[#2c4eb7] text-white'
        : `bg-[#f3f3f3] ${INK}`,
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

/**
 * A 62 px section heading: an upright first line and a light italic second line, as the frames
 * set every one of them.
 */
export function Heading({
  lead,
  em,
  className = '',
  as: Tag = 'h2',
}: {
  lead: string
  em: string
  className?: string
  as?: 'h1' | 'h2'
}) {
  return (
    <Tag className={`landing-title landing-cap font-semibold leading-[normal] ${className}`}>
      <span className="block">{lead}</span>
      <span className={`landing-em block font-light italic lowercase ${SOFT}`}>{em}</span>
    </Tag>
  )
}

/** A frame "BG" layer: the texture at a tenth, flipped, fading to white at both ends. */
export function Texture({ opacity = 0.1, flip }: { opacity?: number; flip: 'y' | 'rotate' }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
      style={{ opacity, transform: flip === 'y' ? 'scaleY(-1)' : 'rotate(180deg)' }}
    >
      <img src={texture} alt="" className="size-full object-cover" />
      <div className="landing-texture-fade absolute inset-0" />
    </div>
  )
}

/** The frames' "three washes": 1520, 1620 and 1720 wide, stacked 28 and 52 px apart. */
export function Washes() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full">
      <div className="absolute inset-x-[100px] top-0 h-full rounded-lg bg-gradient-to-b from-[#eaf0ff] to-white/0 max-md:inset-x-6" />
      <div className="absolute inset-x-[50px] top-[28px] h-[calc(100%-28px)] rounded-lg bg-gradient-to-b from-[#eaf0ff] to-white/0 max-md:inset-x-3" />
      <div className="absolute inset-x-0 top-[80px] h-[calc(100%-80px)] rounded-lg bg-gradient-to-b from-[#f4f6fb] to-white/0" />
    </div>
  )
}

/** A list of short lines, each behind the frames' green tick. */
export function CheckList({
  items,
  className = '',
  tone = 'ink',
}: {
  items: string[]
  className?: string
  tone?: 'ink' | 'soft'
}) {
  return (
    <ul className={`flex flex-col gap-3 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3.5">
          <img src={checkIcon} alt="" className="mt-px size-[18px] shrink-0" />
          <span
            className={`landing-cap text-base leading-[normal] ${tone === 'soft' ? SOFT : INK}`}
          >
            {withRial(item)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------- nav */

/** The Fawtir mark as the nav draws it: the frame's logo in English, the Arabic logo in Arabic. */
function NavLogo({ arabic }: { arabic: boolean }) {
  return arabic ? (
    <BrandLogo size="sm" to="/" />
  ) : (
    <Link to="/" className="flex items-end" aria-label="Fawtir">
      <img src={navLogo} alt="" className="me-[-9.263px] h-[35px] w-[33.556px]" />
      <span className="text-[17.683px] font-semibold leading-[normal] tracking-[0.3537px] text-[#0f2a6b]">
        AWTIR
      </span>
    </Link>
  )
}

export function Nav({ active }: { active: SitePage }) {
  const { t, i18n } = useTranslation()
  const mail = useSiteMail()
  const arabic = i18n.language.startsWith('ar')
  const [menuOpen, setMenuOpen] = useState(false)
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
  const links: { page: SitePage; to: string; key: string }[] = [
    { page: 'home', to: '/', key: 'home' },
    { page: 'pricing', to: '/pricing', key: 'pricing' },
    { page: 'features', to: '/features', key: 'features' },
  ]

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuOpen])

  return (
    <>
      <nav
        aria-label={t('landing.nav.label')}
        className="flex items-center justify-center gap-6 max-lg:hidden"
      >
        <div className="landing-shadow flex items-center gap-[140px] rounded-lg border border-[#e8e8ea] bg-white px-6 py-3 max-xl:gap-12">
          <NavLogo arabic={arabic} />
          <div className={`flex items-center gap-8 text-base leading-[normal] ${INK}`}>
            {links.map((link) =>
              link.page === active ? (
                <Link
                  key={link.page}
                  to={link.to}
                  aria-current="page"
                  className="font-semibold text-[#2c4eb7]"
                >
                  {t(`landing.nav.${link.key}`)}
                </Link>
              ) : (
                <Link key={link.page} to={link.to}>
                  {t(`landing.nav.${link.key}`)}
                </Link>
              ),
            )}
            <a href={mail.partners}>{t('landing.nav.partners')}</a>
          </div>
        </div>
        <div className="landing-shadow flex h-[59px] items-center gap-2 rounded-lg border border-[#e8e8ea] bg-white px-2 py-4">
          {/* Not in the frame: existing customers sign in from here, as a quiet link beside the buttons. */}
          <Link
            to="/login"
            className={`inline-flex items-center rounded-lg px-4 py-3 text-base leading-[normal] whitespace-nowrap hover:bg-[#f3f3f3] ${INK}`}
          >
            {t('landing.nav.logIn')}
          </Link>
          <Cta to="/signup" tone="light" arrow={false}>
            {t('landing.nav.signUp')}
          </Cta>
          <Cta to="/contact" tone="brand">
            {t('landing.nav.contact')}
          </Cta>
        </div>
      </nav>

      {/*
        Not in the frame, which is desktop only: on a phone the links fold into a menu, and the bar
        stays at the top while the page scrolls so Contact Us is always one tap away.
      */}
      <div aria-hidden="true" className="h-[59px] w-full lg:hidden" />
      {/* Drawn on the body: the hero's layers would otherwise paint later sections over it. */}
      {createPortal(
        <nav
          aria-label={t('landing.nav.mobileLabel')}
          className="fixed inset-x-0 top-0 z-40 bg-white/80 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 backdrop-blur-sm lg:hidden"
        >
          <div className="landing-shadow flex items-center justify-between gap-2 rounded-lg border border-[#e8e8ea] bg-white px-3 py-2">
            <NavLogo arabic={arabic} />
            <div className="flex items-center gap-2">
              <Cta to="/contact" tone="brand" className="max-sm:px-3">
                {t('landing.nav.contact')}
              </Cta>
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-controls="site-menu"
                aria-label={t(menuOpen ? 'landing.nav.closeMenu' : 'landing.nav.menu')}
                onClick={() => setMenuOpen((open) => !open)}
                className={`flex size-[43px] items-center justify-center rounded-lg bg-[#f3f3f3] ${INK}`}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  {menuOpen ? (
                    <path
                      d="m5 5 10 10M15 5 5 15"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  ) : (
                    <path
                      d="M3 5.5h14M3 10h14M3 14.5h14"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>
          {menuOpen ? (
            <div
              id="site-menu"
              className="landing-shadow mt-2 flex flex-col rounded-lg border border-[#e8e8ea] bg-white p-2"
            >
              {links.map((link) => (
                <Link
                  key={link.page}
                  to={link.to}
                  aria-current={link.page === active ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-lg px-3 py-3 text-base leading-[normal] ${
                    link.page === active ? 'bg-[#f4f6fb] font-semibold text-[#2c4eb7]' : INK
                  }`}
                >
                  {t(`landing.nav.${link.key}`)}
                </Link>
              ))}
              <a
                href={mail.partners}
                className={`rounded-lg px-3 py-3 text-base leading-[normal] ${INK}`}
              >
                {t('landing.nav.partners')}
              </a>
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className={`rounded-lg px-3 py-3 text-base leading-[normal] ${INK}`}
              >
                {t('landing.nav.logIn')}
              </Link>
              <div className="mt-2 flex items-center gap-2 border-t border-[#e8e8ea] pt-3">
                <Cta to="/signup" tone="light" arrow={false} className="flex-1">
                  {t('landing.nav.signUp')}
                </Cta>
                <button
                  type="button"
                  onClick={() => {
                    switchLanguage()
                    setMenuOpen(false)
                  }}
                  lang={arabic ? 'en' : 'ar'}
                  className={`rounded-lg border border-[#e8e8ea] bg-white px-4 py-3 text-base leading-[normal] ${INK}`}
                >
                  {arabic ? 'English' : 'العربية'}
                </button>
              </div>
            </div>
          ) : null}
        </nav>,
        document.body,
      )}

      {/* Not in the frame: the page must also read in Arabic, so the switch sits beside the nav. */}
      <button
        type="button"
        onClick={switchLanguage}
        lang={arabic ? 'en' : 'ar'}
        className={`fixed bottom-4 end-4 z-30 rounded-lg border border-[#e8e8ea] bg-white px-3 py-2 text-sm landing-shadow max-lg:hidden ${INK}`}
      >
        {arabic ? 'English' : 'العربية'}
      </button>
    </>
  )
}

/* -------------------------------------------------------------- page hero */

/**
 * The inner pages' 540 px header: the texture turned over, the column lines, the nav, and a 62 px
 * title with one word raised on a white chip, then a line of copy.
 */
export function PageHero({
  active,
  lead,
  word,
  tail,
  body,
}: {
  active: SitePage
  lead: string
  word: string
  tail?: string
  body: ReactNode
}) {
  return (
    <header id="top" className="relative isolate min-h-[540px] pb-16">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-[540px] overflow-hidden">
        <div className="absolute inset-0 rotate-180 opacity-20">
          <img src={texture} alt="" className="size-full object-cover" />
          <div className="landing-texture-fade absolute inset-0" />
        </div>
        <img src={pageLines} alt="" className="absolute inset-0 size-full" />
      </div>
      <div className="mx-auto flex w-full max-w-[1220px] flex-col items-center gap-[112px] px-4 pt-[25px] max-md:gap-16 xl:px-0">
        <Nav active={active} />
        <div className="flex w-full max-w-[1100px] flex-col items-center gap-6 text-center">
          <h1 className="landing-title landing-cap flex w-full flex-col items-center gap-2.5 font-semibold leading-[normal]">
            <span className="flex flex-wrap items-center justify-center gap-4 max-md:gap-2">
              <span>{lead}</span>
              <span className="landing-shadow-brand landing-pill rounded-lg bg-white p-4 font-light italic lowercase text-[#737781] max-md:p-2">
                {word}
              </span>
            </span>
            {tail ? <span>{tail}</span> : null}
          </h1>
          <p className="landing-cap w-full text-base leading-6">{body}</p>
        </div>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------- faq */

/** "Questions & answers": the frame draws each question closed, with a plus that opens it. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="relative mx-auto mt-[200px] w-full max-w-[1720px] px-4 max-md:mt-20 md:px-8 min-[1800px]:px-0">
      <div className="relative overflow-hidden rounded-lg border-x border-t border-[#eaedf8] px-4 pb-[140px] pt-[200px] max-md:pb-20 max-md:pt-20">
        <Texture flip="y" />
        <h2 className="landing-title landing-cap relative text-center font-semibold leading-[normal]">
          {t('site.faq.lead')}{' '}
          <span className={`landing-em font-light italic lowercase ${SOFT}`}>
            {t('site.faq.em')}
          </span>
        </h2>
        <ul className="relative mx-auto mt-[100px] flex w-full max-w-[1180px] flex-col gap-4 max-md:mt-12">
          {items.map((item, index) => {
            const expanded = open === index
            return (
              <li key={item.q} className="rounded-lg bg-[rgba(21,28,45,0.04)]">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : index)}
                  className={`flex min-h-[45px] w-full items-center justify-between gap-4 px-6 py-3 text-start text-base font-medium leading-[normal] ${INK}`}
                >
                  <span>{item.q}</span>
                  <img
                    src={plusIcon}
                    alt=""
                    className={`size-6 shrink-0 transition-transform ${expanded ? 'rotate-45' : ''}`}
                  />
                </button>
                {expanded ? (
                  <p className={`px-6 pb-4 text-base leading-6 ${SOFT}`}>{item.a}</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ closing band */

export function ClosingBand() {
  const { t } = useTranslation()
  const mail = useSiteMail()
  return (
    <section className="relative mt-[200px] min-h-[277px] overflow-hidden pt-[26px] max-md:mt-20">
      <img
        src={ctaCurve}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute start-1/2 top-0 h-[277px] w-[1940px] max-w-none -translate-x-1/2 -scale-y-100 rotate-180 rtl:translate-x-1/2"
      />
      <div className="relative mx-auto flex w-full max-w-[1720px] items-center justify-between gap-8 px-4 max-lg:flex-col max-lg:items-start md:px-8 min-[1800px]:px-0">
        <h2 className="landing-cap font-semibold leading-[1.3]">
          <span className="landing-band-title block">{t('landing.band.title')}</span>
          <span className={`landing-band-em landing-em block font-light italic lowercase ${SOFT}`}>
            {t('landing.band.em')}
          </span>
        </h2>
        <div className="flex shrink-0 items-center gap-4">
          <Cta to="/signup" tone="brand">
            {t('landing.band.start')}
          </Cta>
          <Cta href={mail.demo} arrow={false}>
            {t('landing.band.demo')}
          </Cta>
        </div>
      </div>
    </section>
  )
}
/* ----------------------------------------------------------------- footer */

export function Footer() {
  const { t } = useTranslation()
  const mail = useSiteMail()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const year = new Date().getFullYear()
  // TODO(backend): SITE.md 1.2. No newsletter list exists; the form opens a prepared email to support meanwhile.
  const subscribe = (event: React.FormEvent) => {
    event.preventDefault()
    window.location.href = mail.newsletter(`${name}\n${email}`)
  }
  const links: { key: string; to?: string; href?: string }[] = [
    { key: 'pricing', to: '/pricing' },
    { key: 'features', to: '/features' },
    { key: 'partners', href: mail.partners },
    // TODO(backend): SITE.md 1.4. The privacy policy and terms have no pages yet.
    { key: 'privacy' },
    { key: 'terms' },
  ]
  // An icon links only to a page the company contact setting names (CS-1); the rest stay drawn.
  const socials: { icon: string; label: string; href: string | null }[] = [
    { icon: facebookIcon, label: 'Facebook', href: null },
    { icon: instagramIcon, label: 'Instagram', href: mail.contact.instagramUrl },
    { icon: linkedinIcon, label: 'LinkedIn', href: mail.contact.linkedinUrl },
    { icon: xIcon, label: 'X', href: null },
  ]

  return (
    <footer className="relative mt-[200px] overflow-hidden rounded-t-lg bg-[#fafafa] max-md:mt-20">
      {/* The wordmark is Latin, so the footer keeps its left-to-right layout in Arabic too. */}
      <div className="relative mx-auto w-full max-w-[1920px] rtl:[direction:ltr] xl:h-[min(925px,48.18vw)]">
        <img
          src={footerLogo}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[min(60px,3.125vw)] left-[min(117px,6.094vw)] h-auto w-[min(1720px,89.583vw)] max-w-none max-xl:bottom-[60px] max-xl:left-6 max-xl:w-[855px] max-md:w-[342px]"
        />
        <div className="relative ml-auto flex w-[min(950px,49.48vw)] flex-col gap-[min(100px,5.2vw)] pt-[min(100px,5.2vw)] rtl:[direction:rtl] max-xl:w-full max-xl:gap-16 max-xl:px-8 max-xl:pb-[460px] max-xl:pt-16 max-md:gap-12 max-md:px-4 max-md:pb-[250px] max-md:pt-12 xl:mr-[min(83px,4.323vw)]">
          <form
            onSubmit={subscribe}
            className="flex items-center gap-[min(60px,3.125vw)] max-lg:flex-col max-lg:items-stretch max-lg:gap-6"
          >
            <div className="flex shrink-0 flex-col gap-2 text-base leading-[normal]">
              <p className="font-semibold uppercase">{t('landing.footer.newsletter')}</p>
              <p className={`landing-cap ${SOFT}`}>{t('landing.footer.note')}</p>
            </div>
            <div className="flex min-w-0 flex-1 items-end gap-4 max-sm:flex-col max-sm:items-stretch">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('landing.footer.name')}
                aria-label={t('landing.footer.name')}
                autoComplete="name"
                className="landing-cap min-w-0 flex-1 border-b border-[#e8e8ea] bg-transparent pb-4 text-base leading-[normal] outline-none placeholder:text-[#8a8e96]"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('landing.footer.email')}
                aria-label={t('landing.footer.email')}
                autoComplete="email"
                className="landing-cap min-w-0 flex-1 border-b border-[#e8e8ea] bg-transparent pb-4 text-base leading-[normal] outline-none placeholder:text-[#8a8e96]"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2.5 rounded-lg bg-[#151c2d] px-4 py-3 text-base leading-[normal] text-white"
              >
                {t('landing.footer.signUp')}
                <Arrow />
              </button>
            </div>
          </form>

          <ul className="flex flex-wrap items-start justify-between gap-6 text-base font-semibold uppercase leading-[normal]">
            {links.map((link) => (
              <li key={link.key}>
                {link.to ? (
                  <Link to={link.to}>{t(`landing.footer.links.${link.key}`)}</Link>
                ) : link.href ? (
                  <a href={link.href}>{t(`landing.footer.links.${link.key}`)}</a>
                ) : (
                  <span>{t(`landing.footer.links.${link.key}`)}</span>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-4 border-t border-[#e8e8ea] pt-[30px] max-sm:flex-col max-sm:items-start">
            <div className="flex gap-2">
              {socials.map((social) =>
                social.href ? (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="flex size-10 items-center justify-center rounded-lg bg-[#f3f4f5]"
                  >
                    <img src={social.icon} alt="" className="size-5" />
                  </a>
                ) : (
                  // TODO(backend): SITE.md 1.5. Facebook and X have no setting yet; drawn, not linked.
                  <span
                    key={social.label}
                    role="img"
                    aria-label={social.label}
                    className="flex size-10 items-center justify-center rounded-lg bg-[#f3f4f5]"
                  >
                    <img src={social.icon} alt="" className="size-5" />
                  </span>
                ),
              )}
            </div>
            <p className={`landing-cap text-base leading-[normal] ${SOFT}`}>
              {t('landing.footer.rights', { year })}
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
