import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Audience } from '../HomePage/Audience'
import { Counter, Steps } from '../HomePage/HomePage'
import { QrSection } from '../HomePage/QrSection'
import tillShot from '../../assets/site/feature-till.webp'
import invoiceShot from '../../assets/site/feature-invoice.webp'
import proofShot from '../../assets/site/feature-proof.webp'
import stockShot from '../../assets/site/feature-stock.webp'
import findShot from '../../assets/site/feature-find.webp'
import numbersShot from '../../assets/site/feature-numbers.webp'
import wave1 from '../../assets/site/wave-1.svg'
import wave2 from '../../assets/site/wave-2.svg'
import wave3 from '../../assets/site/wave-3.svg'
import wifiOffIcon from '../../assets/site/icon-wifi-off.svg'
import globeIcon from '../../assets/site/icon-globe.svg'
import phoneIcon from '../../assets/site/icon-phone.svg'
import branchIcon from '../../assets/site/icon-branch.svg'
import patternIcon from '../../assets/site/icon-pattern.svg'
import signatureIcon from '../../assets/site/icon-signature.svg'
import photoIcon from '../../assets/site/icon-photo.svg'
import exportIcon from '../../assets/site/icon-export.svg'
import '../HomePage/HomePage.css'
import {
  CheckList,
  ClosingBand,
  Footer,
  Heading,
  INK,
  PageHero,
  SOFT,
  Texture,
  Washes,
  useSiteMeta,
} from '../HomePage/site'

/**
 * The public features page (Figma "Features", 191:12630): a tab bar that jumps to six rows, the
 * rows alternating open (copy first, a wave behind) and boxed (mockup first, in a bordered panel),
 * then the small parts. The mockups are the frame's own renders; the words are code.
 */

type RowKey = 'till' | 'invoicing' | 'filing' | 'stock' | 'transactions' | 'dashboard'
const ROWS: { key: RowKey; shot: string; wave?: string }[] = [
  { key: 'till', shot: tillShot, wave: wave1 },
  { key: 'invoicing', shot: invoiceShot },
  { key: 'filing', shot: proofShot, wave: wave2 },
  { key: 'stock', shot: stockShot },
  { key: 'transactions', shot: findShot, wave: wave3 },
  { key: 'dashboard', shot: numbersShot },
]
/**
 * Module tabs (owner, 4 Nov 2026): the rows grouped by the part of Fawtir they belong to, one
 * group shown at a time. The till's steps and phones (moved from the home page) and stock sit
 * under Point of sale; the QR section joins the Tax Authority tab.
 */
type ModuleKey = 'pos' | 'invoicing' | 'tax' | 'reports'
const MODULES: { key: ModuleKey; rows: RowKey[] }[] = [
  { key: 'pos', rows: ['till', 'stock'] },
  { key: 'invoicing', rows: ['invoicing', 'transactions'] },
  { key: 'tax', rows: ['filing'] },
  { key: 'reports', rows: ['dashboard'] },
]
/** The module a link lands on: its own key, or the key of a row inside it (old links). */
function moduleFromHash(hash: string): ModuleKey {
  const id = hash.replace('#', '')
  const found = MODULES.find((m) => m.key === id || (m.rows as string[]).includes(id))
  return found ? found.key : 'pos'
}

const ITEMS = ['a', 'b', 'c', 'd', 'e']

export function FeaturesPage() {
  const { t } = useTranslation()
  useSiteMeta('landing.meta.features.title', 'landing.meta.features.description')
  return (
    <div className={`landing min-h-screen overflow-x-clip bg-white ${INK}`}>
      <PageHero
        active="features"
        lead={t('site.features.hero.lead')}
        word={t('site.features.hero.word')}
        tail={t('site.features.hero.tail')}
        body={t('site.features.hero.body')}
      />
      <main>
        <ModuleTabs />
        <Audience photo="office" till="clothes" />
        <Parts />
      </main>
      <ClosingBand />
      <Footer />
    </div>
  )
}

/* -------------------------------------------------------------------- tabs */

function ModuleTabs() {
  const { t } = useTranslation()
  const [active, setActive] = useState<ModuleKey>(() =>
    typeof window === 'undefined' ? 'pos' : moduleFromHash(window.location.hash),
  )
  const choose = (key: ModuleKey) => {
    setActive(key)
    window.history.replaceState(null, '', `#${key}`)
  }
  const row = (key: RowKey) => {
    const found = ROWS.find((r) => r.key === key)!
    return found.wave ? <OpenRow key={key} row={found} /> : <BoxedRow key={key} row={found} />
  }
  return (
    <>
      <nav
        aria-label={t('site.features.tabs.label')}
        className="mx-auto w-full max-w-[1520px] px-4 md:px-8 min-[1600px]:px-0"
      >
        <div role="tablist" className="flex overflow-x-auto rounded-lg bg-[#fafafa]">
          {MODULES.map((m) => {
            const on = m.key === active
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                id={`tab-${m.key}`}
                aria-selected={on}
                aria-controls={`panel-${m.key}`}
                onClick={() => choose(m.key)}
                className={`flex h-12 min-w-fit flex-1 items-center justify-center whitespace-nowrap border-b-[2.5px] px-4 text-base leading-[normal] ${
                  on ? 'border-[#2c4eb7] font-semibold text-[#2c4eb7]' : `border-transparent ${INK}`
                }`}
              >
                {t(`site.features.modules.${m.key}`)}
              </button>
            )
          })}
        </div>
      </nav>
      {/* Every panel stays in the page for search engines; only the chosen one shows. */}
      {MODULES.map((m) => (
        <div
          key={m.key}
          id={`panel-${m.key}`}
          role="tabpanel"
          aria-labelledby={`tab-${m.key}`}
          hidden={m.key !== active}
          className="mt-[100px] max-md:mt-12"
        >
          <div className="flex flex-col gap-[200px] max-md:gap-24">
            {m.key === 'pos' ? (
              <>
                {row('till')}
                <div className="-mt-[200px] max-md:-mt-24">
                  <Steps />
                  <Counter />
                </div>
                {row('stock')}
              </>
            ) : (
              m.rows.map(row)
            )}
            {m.key === 'tax' ? (
              <div className="-mt-[200px] max-md:-mt-24">
                <QrSection />
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </>
  )
}

/* -------------------------------------------------------------------- rows */

function RowCopy({ rowKey }: { rowKey: RowKey }) {
  const { t } = useTranslation()
  const base = `site.features.${rowKey}`
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <h2 className="landing-cap text-[clamp(1.75rem,1.1rem+1.9vw,2.625rem)] font-medium leading-[normal]">
        {t(`${base}.lead`)}{' '}
        <span className={`landing-em font-light italic ${SOFT}`}>{t(`${base}.em`)}</span>
      </h2>
      <p className={`landing-cap text-lg leading-[normal] ${SOFT}`}>{t(`${base}.body`)}</p>
      <CheckList tone="soft" items={ITEMS.map((item) => t(`${base}.items.${item}`))} />
    </div>
  )
}

function Shot({ row }: { row: (typeof ROWS)[number] }) {
  const { t } = useTranslation()
  return (
    <img
      src={row.shot}
      alt={t(`site.features.${row.key}.alt`)}
      loading="lazy"
      className="landing-sheet relative block h-auto w-full max-w-[660px] shrink-0 rounded-lg bg-white lg:w-[min(660px,40%)]"
    />
  )
}

/** Copy on the start side, the mockup on the end side, a wave drawn across behind them. */
function OpenRow({ row }: { row: (typeof ROWS)[number] }) {
  return (
    <section id={row.key} className="relative isolate scroll-mt-8">
      <img
        src={row.wave}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute start-0 top-1/2 -z-10 h-[349px] w-full -translate-y-1/3 max-md:hidden rtl:-scale-x-100"
      />
      <div className="mx-auto flex w-full max-w-[1520px] items-center justify-between gap-[100px] px-4 max-xl:gap-12 max-lg:flex-col max-lg:items-stretch md:px-8 min-[1600px]:px-0">
        <div className="flex max-w-[760px] flex-1">
          <RowCopy rowKey={row.key} />
        </div>
        <Shot row={row} />
      </div>
    </section>
  )
}

/** The mockup on the start side inside a bordered, textured 1720 panel; copy on the end side. */
function BoxedRow({ row }: { row: (typeof ROWS)[number] }) {
  return (
    <section
      id={row.key}
      className="mx-auto w-full max-w-[1720px] scroll-mt-8 px-4 md:px-8 min-[1800px]:px-0"
    >
      <div className="relative overflow-hidden rounded-lg border-x border-t border-[#eaedf8] px-[100px] py-[100px] max-xl:px-10 max-md:px-4 max-md:py-12">
        <Texture flip="y" />
        <div className="relative mx-auto flex max-w-[1520px] items-center justify-between gap-[100px] max-xl:gap-12 max-lg:flex-col-reverse max-lg:items-stretch">
          <Shot row={row} />
          <div className="flex max-w-[760px] flex-1">
            <RowCopy rowKey={row.key} />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- parts */

const PARTS: { key: string; icon: string }[] = [
  { key: 'offline', icon: wifiOffIcon },
  { key: 'languages', icon: globeIcon },
  { key: 'phone', icon: phoneIcon },
  { key: 'branches', icon: branchIcon },
  { key: 'patterns', icon: patternIcon },
  { key: 'signatures', icon: signatureIcon },
  { key: 'bills', icon: photoIcon },
  { key: 'leave', icon: exportIcon },
]

function Parts() {
  const { t } = useTranslation()
  return (
    <section className="relative isolate mx-auto mt-[200px] w-full max-w-[1720px] px-4 pb-[100px] pt-[140px] max-md:mt-24 max-md:pt-16 md:px-8 min-[1800px]:px-0">
      <Washes />
      <div className="mx-auto flex max-w-[1424px] flex-col items-center gap-[60px] max-md:gap-10">
        <Heading
          lead={t('site.features.parts.lead')}
          em={t('site.features.parts.em')}
          className="text-center"
        />
        <ul className="grid w-full grid-cols-4 gap-[18px] max-lg:grid-cols-2 max-sm:grid-cols-1">
          {PARTS.map((part) => (
            <li key={part.key} className="flex flex-col gap-4 rounded-lg bg-white px-6 py-8">
              <span className="flex size-10 items-center justify-center rounded-lg bg-[#f4f6fb]">
                <img src={part.icon} alt="" className="size-[22px]" />
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="landing-cap text-base font-semibold leading-[normal]">
                  {t(`site.features.parts.${part.key}.title`)}
                </h3>
                <p className="text-sm leading-5 text-[#737781]">
                  {t(`site.features.parts.${part.key}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
