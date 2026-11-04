import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErpFlow } from '../HomePage/Audience'
import { FeatureIcon } from './FeatureIcon'
import { Steps } from '../HomePage/HomePage'
import { QrSection } from '../HomePage/QrSection'
import tillShot from '../../assets/site/feature-till.webp'
import invoiceShot from '../../assets/site/feature-invoice.webp'
import stockShot from '../../assets/site/feature-stock.webp'
import findShot from '../../assets/site/feature-find.webp'
import numbersShot from '../../assets/site/feature-numbers.webp'
import billsShot from '../../assets/site/feature-bills.webp'
import billsShotAr from '../../assets/site/feature-bills-ar.webp'
import paymentsShot from '../../assets/site/feature-payments.webp'
import paymentsShotAr from '../../assets/site/feature-payments-ar.webp'
import tddShot from '../../assets/site/feature-tdd.webp'
import tddShotAr from '../../assets/site/feature-tdd-ar.webp'
import customersShot from '../../assets/site/feature-customers.webp'
import customersShotAr from '../../assets/site/feature-customers-ar.webp'
import periodicShot from '../../assets/site/feature-periodic.webp'
import periodicShotAr from '../../assets/site/feature-periodic-ar.webp'
import recurringShot from '../../assets/site/feature-recurring.webp'
import recurringShotAr from '../../assets/site/feature-recurring-ar.webp'
import supplierNotesShot from '../../assets/site/feature-supplier-notes.webp'
import supplierNotesShotAr from '../../assets/site/feature-supplier-notes-ar.webp'
import archiveShot from '../../assets/site/feature-archive.webp'
import archiveShotAr from '../../assets/site/feature-archive-ar.webp'
import vatShot from '../../assets/site/feature-vat.webp'
import vatShotAr from '../../assets/site/feature-vat-ar.webp'
import cashShot from '../../assets/site/feature-cash.webp'
import cashShotAr from '../../assets/site/feature-cash-ar.webp'
import branchesShot from '../../assets/site/feature-branches.webp'
import branchesShotAr from '../../assets/site/feature-branches-ar.webp'
import wave1 from '../../assets/site/wave-1.svg'
import wave2 from '../../assets/site/wave-2.svg'
import wave3 from '../../assets/site/wave-3.svg'
import '../HomePage/HomePage.css'
import {
  CheckList,
  ClosingBand,
  Footer,
  INK,
  PageHero,
  SOFT,
  Texture,
  useSiteMeta,
} from '../HomePage/site'

/**
 * The public features page (Figma "Features", 191:12630), reorganised by module (owner, 4 Nov 2026):
 * six tabs, one shown at a time. Each opens with its main screens as large rows (every tab, not
 * only the till: owner, 4 Nov 2026) (copy beside a
 * framed screenshot, alternating open and boxed as in the frame), then a grid of the module's
 * smaller features. Only features the app has today are listed.
 */

type RowKey =
  | 'till'
  | 'stock'
  | 'invoicing'
  | 'transactions'
  | 'customers'
  | 'periodic'
  | 'bills'
  | 'payments'
  | 'recurring'
  | 'supplierNotes'
  | 'tdd'
  | 'archive'
  | 'dashboard'
  | 'vatReport'
  | 'cashFlow'
  | 'erp'
  | 'branches'
type Row = { key: RowKey; shot?: string; shotAr?: string; wave?: string }
const ROWS: Row[] = [
  { key: 'till', shot: tillShot, wave: wave1 },
  { key: 'stock', shot: stockShot },
  { key: 'invoicing', shot: invoiceShot },
  { key: 'transactions', shot: findShot, wave: wave3 },
  { key: 'customers', shot: customersShot, shotAr: customersShotAr },
  { key: 'periodic', shot: periodicShot, shotAr: periodicShotAr, wave: wave1 },
  { key: 'bills', shot: billsShot, shotAr: billsShotAr, wave: wave2 },
  { key: 'payments', shot: paymentsShot, shotAr: paymentsShotAr },
  { key: 'recurring', shot: recurringShot, shotAr: recurringShotAr, wave: wave3 },
  { key: 'supplierNotes', shot: supplierNotesShot, shotAr: supplierNotesShotAr },
  { key: 'tdd', shot: tddShot, shotAr: tddShotAr, wave: wave1 },
  { key: 'archive', shot: archiveShot, shotAr: archiveShotAr },
  { key: 'dashboard', shot: numbersShot },
  { key: 'vatReport', shot: vatShot, shotAr: vatShotAr, wave: wave2 },
  { key: 'cashFlow', shot: cashShot, shotAr: cashShotAr },
  { key: 'erp', wave: wave3 },
  { key: 'branches', shot: branchesShot, shotAr: branchesShotAr },
]

type ModuleKey = 'pos' | 'invoicing' | 'expenses' | 'tax' | 'reports' | 'company'
type Tile = [key: string, icon: string]
const MODULES: { key: ModuleKey; rows: RowKey[]; tiles: Tile[] }[] = [
  {
    key: 'pos',
    rows: ['till', 'stock'],
    tiles: [
      ['barcode', 'barcode'],
      ['sizes', 'layers'],
      ['split', 'split'],
      ['held', 'pause'],
      ['refunds', 'undo'],
      ['company', 'building'],
      ['offline', 'wifiOff'],
      ['close', 'cash'],
      ['cashier', 'user'],
      ['discount', 'percent'],
      ['receipt', 'receipt'],
      ['tills', 'store'],
    ],
  },
  {
    key: 'invoicing',
    rows: ['invoicing', 'transactions', 'customers', 'periodic'],
    tiles: [
      ['notes', 'file'],
      ['reminders', 'bell'],
      ['bulk', 'upload'],
      ['approval', 'approve'],
      ['replies', 'send'],
      ['payments', 'card'],
    ],
  },
  {
    key: 'expenses',
    rows: ['bills', 'payments', 'recurring', 'supplierNotes'],
    tiles: [
      ['selfbilling', 'pen'],
      ['reminders', 'bell'],
      ['approvals', 'approve'],
      ['waiting', 'inbox'],
      ['suppliers', 'users'],
      ['vat', 'percent'],
    ],
  },
  {
    key: 'tax',
    rows: ['tdd', 'archive'],
    tiles: [
      ['pintom', 'shield'],
      ['calllog', 'list'],
      ['report', 'chart'],
      ['b2c', 'clock'],
      ['proof', 'stamp'],
      ['resend', 'send'],
      ['peppol', 'globe'],
    ],
  },
  {
    key: 'reports',
    rows: ['dashboard', 'vatReport', 'cashFlow'],
    tiles: [
      ['income', 'trend'],
      ['expenses', 'chart'],
      ['compliance', 'shield'],
      ['lists', 'list'],
      ['pdf', 'download'],
      ['compare', 'pie'],
    ],
  },
  {
    key: 'company',
    rows: ['erp', 'branches'],
    tiles: [
      ['roles', 'key'],
      ['approvals', 'approve'],
      ['team', 'users'],
      ['log', 'log'],
      ['languages', 'globe'],
      ['mobile', 'phone'],
      ['export', 'download'],
    ],
  },
]
/** The module a link lands on: its own key, or the key of a row inside it (old links). */
function moduleFromHash(hash: string): ModuleKey {
  const id = hash.replace('#', '')
  const old: Record<string, ModuleKey> = { filing: 'tax', qr: 'tax' }
  const found = MODULES.find((m) => m.key === id || (m.rows as string[]).includes(id))
  return found ? found.key : (old[id] ?? 'pos')
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
  const navRef = useRef<HTMLElement>(null)
  // The bar sticks to the top; it slides away while scrolling down and returns on the way up
  // (owner, 4 Nov 2026), so it never covers the content being read.
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const nav = navRef.current
      const pinned = nav ? nav.getBoundingClientRect().top <= 80 : false
      if (Math.abs(y - last) < 6) return
      setHidden(pinned && y > last)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const choose = (key: ModuleKey) => {
    setActive(key)
    window.history.replaceState(null, '', `#${key}`)
    // Far down a long module, start the new one from its top, under the bar.
    const panels = document.getElementById('feature-panels')
    if (panels && panels.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: window.scrollY + panels.getBoundingClientRect().top - 140 })
    }
  }
  const row = (key: RowKey) => {
    const found = ROWS.find((r) => r.key === key)!
    return found.wave ? <OpenRow key={key} row={found} /> : <BoxedRow key={key} row={found} />
  }
  return (
    <>
      <nav
        ref={navRef}
        aria-label={t('site.features.tabs.label')}
        className={`sticky top-0 z-30 mx-auto w-full max-w-[1520px] px-4 pt-3 transition-transform duration-300 max-lg:top-[68px] md:px-8 min-[1600px]:px-0 ${
          hidden ? '-translate-y-[calc(100%+80px)]' : 'translate-y-0'
        }`}
      >
        <div
          role="tablist"
          className="flex overflow-x-auto rounded-lg bg-[#fafafa] shadow-[0_4px_16px_rgba(21,28,45,0.06)]"
        >
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
      <div id="feature-panels">
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
              <Tiles module={m.key} tiles={m.tiles} />
            </div>
          </div>
        ))}
      </div>
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

function Shot({ row }: { row: Row }) {
  const { t, i18n } = useTranslation()
  if (row.key === 'erp') {
    return (
      <div className="relative w-full max-w-[660px] shrink-0 lg:w-[min(660px,40%)] [&>figure]:m-0 [&>figure]:p-0">
        <ErpFlow />
      </div>
    )
  }
  const ar = i18n.language.startsWith('ar')
  return (
    <img
      src={ar && row.shotAr ? row.shotAr : row.shot}
      alt={t(`site.features.${row.key}.alt`)}
      loading="lazy"
      className="landing-sheet relative block h-auto w-full max-w-[660px] shrink-0 rounded-lg bg-white lg:w-[min(660px,40%)]"
    />
  )
}

/** Copy on the start side, the mockup on the end side, a wave drawn across behind them. */
function OpenRow({ row }: { row: Row }) {
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
function BoxedRow({ row }: { row: Row }) {
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

/* ------------------------------------------------------------------- tiles */

/** The module's smaller features, in the style of the frame's "parts" grid. */
function Tiles({ module, tiles }: { module: ModuleKey; tiles: Tile[] }) {
  const { t } = useTranslation()
  const base = `site.features.tiles.${module}`
  return (
    <section className="mx-auto w-full max-w-[1520px] px-4 md:px-8 min-[1600px]:px-0">
      <div className="rounded-lg bg-[#f7f9ff] px-10 py-12 max-md:px-4 max-md:py-8">
        <h2 className="landing-cap mb-8 text-[28px] font-semibold leading-[normal] max-md:text-[22px]">
          {t('site.features.moreTitle', { module: t(`site.features.modules.${module}`) })}
        </h2>
        <ul
          className={`grid w-full gap-[18px] max-lg:grid-cols-2 max-sm:grid-cols-1 ${
            tiles.length % 3 === 0 && tiles.length % 4 !== 0 ? 'grid-cols-3' : 'grid-cols-4'
          }`}
        >
          {tiles.map(([key, icon]) => (
            <li key={key} className="flex flex-col gap-4 rounded-lg bg-white px-6 py-8">
              <span className="flex size-10 items-center justify-center rounded-lg bg-[#f4f6fb]">
                <FeatureIcon name={icon} />
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="landing-cap text-base font-semibold leading-[normal]">
                  {t(`${base}.${key}.title`)}
                </h3>
                <p className="text-sm leading-5 text-[#737781]">{t(`${base}.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
