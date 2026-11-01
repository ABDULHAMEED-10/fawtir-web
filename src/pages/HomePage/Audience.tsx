import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import checkIcon from '../../assets/home/check.svg'
import logoFawtara from '../../assets/home/logo-fawtara.png'
import logoPeppol from '../../assets/home/logo-peppol.png'
import { BrandLogo } from '../../components/BrandLogo'
import whoPos from '../../assets/home/who-pos.webp'
import whoPosAr from '../../assets/home/who-pos-ar.webp'
import { SitePhoto } from './photos'
import { Heading, SOFT, Texture } from './site'

/**
 * "Who Fawtir is for" (owner, 1 Nov 2026): the four kinds of business the product serves, each with
 * what it does for them. No Figma frame; drawn in the site's own pieces (Heading, the feature cards'
 * border, texture and type). The SME and sole-trader cards carry their photos (./photos), the till
 * card the live app against the mock API, and the ERP card draws its flow in code so it stays sharp
 * and true to the product.
 */

type Audience = 'sme' | 'pos' | 'erp' | 'solo'

const POINTS = ['p1', 'p2', 'p3'] as const

function Points({ base }: { base: string }) {
  const { t } = useTranslation()
  return (
    <ul className="mt-6 flex flex-col gap-3">
      {POINTS.map((id) => (
        <li key={id} className={`flex items-start gap-3 text-base leading-6 ${SOFT}`}>
          <img src={checkIcon} alt="" className="mt-[3px] size-[18px] shrink-0" />
          {t(`${base}.${id}`)}
        </li>
      ))}
    </ul>
  )
}

function CardCopy({ id }: { id: Audience }) {
  const { t } = useTranslation()
  const base = `landing.audience.${id}`
  return (
    <div className="relative px-10 pt-10 max-md:px-6 max-md:pt-6">
      <p className="inline-flex rounded-full bg-[#eef2ff] px-3 py-1 text-sm font-medium leading-5 text-[#2c4eb7]">
        {t(`${base}.tag`)}
      </p>
      <h3 className="mt-5 text-[30px] font-semibold leading-[1.2] max-md:text-[24px]">
        {t(`${base}.title`)}
      </h3>
      <p className={`mt-4 max-w-[560px] text-lg leading-7 ${SOFT}`}>{t(`${base}.body`)}</p>
      <Points base={base} />
    </div>
  )
}

/** A screenshot from the app, framed like the hero's and faded into the card at the bottom. */
function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative mt-10 h-[300px] ps-10 max-md:h-[220px] max-md:ps-6">
      <div className="h-full overflow-hidden rounded-ss-lg border-s-[8px] border-t-[8px] border-[rgba(44,78,183,0.1)]">
        <img src={src} alt={alt} loading="lazy" className="w-[960px] max-w-none max-md:w-[640px]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-white/0 to-white"
      />
    </div>
  )
}

function Node({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-center rounded-lg px-4 py-3 text-center text-base font-semibold leading-5',
        strong
          ? 'bg-[#2c4eb7] text-white shadow-[0_8px_24px_rgba(44,78,183,0.25)]'
          : 'border border-[#d6dcf0] bg-white text-[#151c2d]',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

/** A partner's own logo on a white tile, with its name under it in words. */
function LogoNode({
  src,
  alt,
  label,
  logoClass,
}: {
  src: string
  alt: string
  label: string
  logoClass: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-[#d6dcf0] bg-white px-4 py-3">
      <img src={src} alt={alt} className={`${logoClass} w-auto object-contain`} loading="lazy" />
      <span className={`text-xs font-medium leading-4 ${SOFT}`}>{label}</span>
    </div>
  )
}

function Flow() {
  return (
    <span
      aria-hidden="true"
      className="text-xl leading-none text-[#9aa6cf] max-sm:rotate-90 rtl:-scale-x-100 rtl:max-sm:rotate-90"
    >
      →
    </span>
  )
}

/** Your ERP, then Fawtir checking the invoice, then the network and the Tax Authority. */
function ErpFlow() {
  const { t } = useTranslation()
  const base = 'landing.audience.erp.flow'
  return (
    <figure className="relative mt-10 px-10 pb-10 max-md:px-6 max-md:pb-6">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[#eaedf8] bg-[#f7f9ff] p-6 max-sm:flex-col">
        <Node>{t(`${base}.erp`)}</Node>
        <Flow />
        <div className="flex flex-col items-center gap-2">
          <Node strong>
            <BrandLogo tone="onDark" size="sm" to="" />
          </Node>
          <span className={`text-xs font-medium leading-4 ${SOFT}`}>{t(`${base}.checked`)}</span>
        </div>
        <Flow />
        <div className="flex flex-col gap-2">
          <LogoNode
            src={logoPeppol}
            alt={t(`${base}.peppolAlt`)}
            label={t(`${base}.peppol`)}
            logoClass="h-7"
          />
          <LogoNode
            src={logoFawtara}
            alt={t(`${base}.fawtaraAlt`)}
            label={t(`${base}.ota`)}
            logoClass="h-12"
          />
        </div>
      </div>
      <figcaption className="sr-only">{t(`${base}.caption`)}</figcaption>
    </figure>
  )
}

function Card({ id }: { id: Audience }) {
  const { t, i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  return (
    <article
      id={`for-${id}`}
      className="relative flex flex-col overflow-hidden rounded-lg border border-[#eaedf8] bg-white"
    >
      <Texture flip="rotate" />
      <CardCopy id={id} />
      <div className="mt-auto">
        {id === 'sme' || id === 'solo' ? (
          <div className="mt-10 px-10 pb-10 max-md:px-6 max-md:pb-6">
            <SitePhoto id={id} imgClassName="aspect-[16/9] object-[50%_25%]" />
          </div>
        ) : null}
        {id === 'pos' ? (
          <Shot src={ar ? whoPosAr : whoPos} alt={t('landing.audience.pos.alt')} />
        ) : null}
        {id === 'erp' ? <ErpFlow /> : null}
      </div>
    </article>
  )
}

export function Audience() {
  const { t } = useTranslation()
  return (
    <section
      id="who-its-for"
      aria-labelledby="who-its-for-title"
      className="mx-auto mt-[160px] flex w-full max-w-[1520px] flex-col items-center gap-[60px] px-4 max-md:mt-20 md:px-8 min-[1600px]:px-0"
    >
      <div
        id="who-its-for-title"
        className="flex w-full max-w-[760px] flex-col items-center gap-6 text-center"
      >
        <Heading lead={t('landing.audience.titleLead')} em={t('landing.audience.titleEm')} />
        <p className="text-xl leading-8">{t('landing.audience.sub')}</p>
      </div>
      <div className="grid w-full gap-6 lg:grid-cols-2">
        <Card id="sme" />
        <Card id="pos" />
        <Card id="erp" />
        <Card id="solo" />
      </div>
    </section>
  )
}
