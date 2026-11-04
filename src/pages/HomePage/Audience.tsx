import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import checkIcon from '../../assets/home/check.svg'
import logoFawtara from '../../assets/home/logo-fawtara.png'
import logoPeppol from '../../assets/home/logo-peppol.png'
import logoMarkLight from '../../assets/brand/logo-mark-light.svg'
import whoInvoicing from '../../assets/home/who-invoicing.webp'
import whoInvoicingAr from '../../assets/home/who-invoicing-ar.webp'
import whoPos from '../../assets/home/who-pos.webp'
import whoPosAr from '../../assets/home/who-pos-ar.webp'
import whoPosClothes from '../../assets/home/who-pos-clothes.webp'
import whoPosClothesAr from '../../assets/home/who-pos-clothes-ar.webp'
import ownerPos from '../../assets/home/owner-pos.webp'
import ownerPosAr from '../../assets/home/owner-pos-ar.webp'
import photoSmeOffice from '../../assets/home/photo-sme-office.webp'
import photoSmeOfficeAr from '../../assets/home/photo-sme-office-ar.webp'
import { withRial } from '../../components/ui/Rial'
import { Heading, SOFT, Texture } from './site'

/**
 * "Who Fawtir is for" (owner, 1 Nov 2026): the four kinds of business the product serves, each with
 * what it does for them. No Figma frame; drawn in the site's own pieces (Heading, the feature cards'
 * border, texture and type). The two screenshots are the live app against the mock API, cropped to
 * the work area; the ERP card draws its flow in code so it stays sharp and true to the product.
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

/**
 * A sole trader's invoice as it reads once sent: drawn in code, labelled as an example, so it shows
 * the outcome without inventing a screen the app does not have.
 */
function InvoicePreview() {
  const { t } = useTranslation()
  const base = 'landing.audience.solo.preview'
  return (
    <figure className="relative mt-10 px-10 pb-10 max-md:px-6 max-md:pb-6">
      <div className="rounded-lg border border-[#eaedf8] bg-[#f7f9ff] p-6">
        <div className="mx-auto max-w-[360px] rounded-lg border border-[#e3e8f6] bg-white p-5 shadow-[0_12px_32px_rgba(21,28,45,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#737781]">
                {t(`${base}.kind`)}
              </p>
              <p dir="ltr" className="mt-1 text-sm font-semibold text-[#151c2d] rtl:text-end">
                INV-2026-0012
              </p>
            </div>
            <span className="rounded-full bg-[#e8f6ee] px-2.5 py-1 text-xs font-medium text-[#1f7a4c]">
              {t(`${base}.status`)}
            </span>
          </div>
          <div className="mt-5 flex items-end justify-between gap-3 border-t border-[#eef1f8] pt-4">
            <div>
              <p className="text-xs text-[#737781]">{t(`${base}.to`)}</p>
              <p className="text-sm font-medium text-[#151c2d]">{t(`${base}.customer`)}</p>
            </div>
            <p dir="ltr" className="text-xl font-semibold text-[#151c2d]">
              {withRial('OMR 105.000')}
            </p>
          </div>
        </div>
      </div>
    </figure>
  )
}

/** The ERP step's mark: a stack of records, drawn so it needs no product's logo. */
function ErpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-7 text-[#2c4eb7]">
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.75" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.5 5.5v6.5c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75V5.5M4.5 12v6.5c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75V12"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

/** The guide between two steps: a short line under the icon column, ending in a chevron. */
function Link() {
  return (
    <div aria-hidden="true" className="flex h-8 w-14 flex-col items-center">
      <span className="w-0.5 flex-1 rounded-full bg-gradient-to-b from-[#c9d3f3] to-[#2c4eb7]" />
      <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 text-[#2c4eb7]">
        <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    </div>
  )
}

/** One step: a fixed tile for its mark, then what happens there. */
function Step({
  tile,
  title,
  body,
  strong = false,
  children,
}: {
  tile: ReactNode
  title: string
  body: string
  strong?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className={[
          'flex size-14 shrink-0 items-center justify-center rounded-xl',
          strong
            ? 'bg-[#2c4eb7] shadow-[0_10px_24px_rgba(44,78,183,0.3)]'
            : 'border border-[#d6dcf0] bg-white shadow-[0_4px_12px_rgba(21,28,45,0.05)]',
        ].join(' ')}
      >
        {tile}
      </div>
      <div className="min-w-0 pt-1">
        <p className="text-base font-semibold leading-6 text-[#151c2d]">{title}</p>
        <p className={`text-sm leading-5 ${SOFT}`}>{body}</p>
        {children}
      </div>
    </div>
  )
}

/** Where the invoice ends up: the partner's own logo in a fixed box, then its name and role. */
function Destination({
  src,
  alt,
  logoClass,
  title,
  body,
}: {
  src: string
  alt: string
  logoClass: string
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-[#d6dcf0] bg-white px-4 py-5 text-center shadow-[0_4px_12px_rgba(21,28,45,0.05)]">
      <div className="flex h-14 w-full items-center justify-center">
        <img src={src} alt={alt} className={`${logoClass} w-auto object-contain`} loading="lazy" />
      </div>
      <p className="mt-3 text-sm font-semibold leading-5 text-[#151c2d]">{title}</p>
      <p className={`text-xs leading-4 ${SOFT}`}>{body}</p>
    </div>
  )
}

/**
 * Your ERP, then Fawtir mapping and checking each invoice, then its two destinations: the buyer
 * over Peppol and the Tax Authority's Fawtara (owner, 1 Nov 2026: real logos, a flow that reads as
 * a product diagram rather than three boxes). One column at every width, so it never crowds.
 */
export function ErpFlow() {
  const { t } = useTranslation()
  const base = 'landing.audience.erp.flow'
  const chips = ['mapped', 'checked', 'tracked'] as const
  return (
    <figure className="relative mt-10 px-10 pb-10 max-md:px-6 max-md:pb-6">
      <div className="rounded-xl border border-[#e3e8f6] bg-gradient-to-b from-[#f7f9ff] to-white p-6 max-md:p-4">
        <Step tile={<ErpIcon />} title={t(`${base}.erp`)} body={t(`${base}.erpSub`)} />
        <Link />
        <Step
          strong
          tile={<img src={logoMarkLight} alt="" className="h-7 w-auto" />}
          title={t(`${base}.fawtir`)}
          body={t(`${base}.fawtirSub`)}
        >
          <ul className="mt-3 flex flex-wrap gap-2">
            {chips.map((id) => (
              <li
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#eef2ff] px-2.5 py-1 text-xs font-medium leading-4 text-[#2c4eb7]"
              >
                <img src={checkIcon} alt="" className="size-3.5" />
                {t(`${base}.chips.${id}`)}
              </li>
            ))}
          </ul>
        </Step>
        <Link />
        <div className="grid gap-3 sm:grid-cols-2">
          <Destination
            src={logoPeppol}
            alt={t(`${base}.peppolAlt`)}
            logoClass="h-8"
            title={t(`${base}.peppol`)}
            body={t(`${base}.peppolSub`)}
          />
          <Destination
            src={logoFawtara}
            alt={t(`${base}.fawtaraAlt`)}
            logoClass="h-14"
            title={t(`${base}.ota`)}
            body={t(`${base}.otaSub`)}
          />
        </div>
      </div>
      <figcaption className="sr-only">{t(`${base}.caption`)}</figcaption>
    </figure>
  )
}

/** The till card's screenshot, a different trade on each page: Omani food at home, clothes on Features. */
const TILLS = {
  food: { en: whoPos, ar: whoPosAr },
  clothes: { en: whoPosClothes, ar: whoPosClothesAr },
} as const

function Card({ id, till }: { id: Audience; till: keyof typeof TILLS }) {
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
        {id === 'sme' ? (
          <Shot src={ar ? whoInvoicingAr : whoInvoicing} alt={t('landing.audience.sme.alt')} />
        ) : null}
        {id === 'pos' ? (
          <Shot src={ar ? TILLS[till].ar : TILLS[till].en} alt={t('landing.audience.pos.alt')} />
        ) : null}
        {id === 'erp' ? <ErpFlow /> : null}
        {id === 'solo' ? <InvoicePreview /> : null}
      </div>
    </article>
  )
}

/**
 * One photo of Omani people above the cards (owner, 1 Nov 2026), a different one on each page that
 * shows the section: the cafe owner at his till on the home page, the small trading office on the
 * Features page. The people and places are AI-generated, so no photo is captioned as a customer;
 * every screen in them carries the app's real screen from the mock API, in the page's language.
 */
const AUDIENCE_PHOTOS = {
  shop: {
    en: ownerPos,
    ar: ownerPosAr,
    alt: 'landing.audience.photoAlt',
    focus: 'object-[50%_40%]',
  },
  office: {
    en: photoSmeOffice,
    ar: photoSmeOfficeAr,
    alt: 'landing.audience.photos.sme',
    focus: 'object-[50%_8%]',
  },
} as const

function AudiencePhoto({ photo }: { photo: keyof typeof AUDIENCE_PHOTOS }) {
  const { t, i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  const shot = AUDIENCE_PHOTOS[photo]
  return (
    <div className="w-full overflow-hidden rounded-lg border-[8px] border-[rgba(44,78,183,0.1)]">
      <img
        src={ar ? shot.ar : shot.en}
        alt={t(shot.alt)}
        width={3072}
        height={2048}
        loading="lazy"
        className={`aspect-[16/9] w-full object-cover max-md:aspect-[4/3] ${shot.focus}`}
      />
    </div>
  )
}

export function Audience({
  photo = 'shop',
  till = 'food',
}: {
  photo?: keyof typeof AUDIENCE_PHOTOS
  till?: keyof typeof TILLS
}) {
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
      <div className="flex w-full flex-col gap-6">
        <AudiencePhoto photo={photo} />
        <div className="grid w-full gap-6 lg:grid-cols-2">
          <Card id="sme" till={till} />
          <Card id="pos" till={till} />
          <Card id="erp" till={till} />
          <Card id="solo" till={till} />
        </div>
      </div>
    </section>
  )
}
