import { useState, type ReactNode } from 'react'
import { setSaleLines, useOpenSale } from '../../lib/posSale'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { PosSalePanel } from './PosSalePanel'
import { COMPANIES, COMPANY_IS, WALK_IN_IS, type Company } from '../../lib/posPayment'
import { ArrowForwardIcon, CheckIcon, SearchIcon } from './posIcons'

/** What the document turns into once a company is named. */
function ChangeColumn({
  kicker,
  title,
  points,
  highlighted,
}: {
  kicker: string
  title: string
  points: string[]
  highlighted?: boolean
}) {
  return (
    <div
      className={[
        'flex min-w-0 flex-1 flex-col gap-3 rounded-md border p-5',
        highlighted
          ? 'border-primary-700 bg-primary-25'
          : 'border-border-subtle bg-surface-tab-bar',
      ].join(' ')}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
        {kicker}
      </p>
      <p
        className={[
          'text-lg font-medium leading-[1.2]',
          highlighted ? 'text-primary-800' : 'text-text-primary',
        ].join(' ')}
      >
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {points.map((point) => (
          <li
            key={point}
            className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary"
          >
            <span className={highlighted ? 'text-primary-700' : 'text-text-quaternary'}>✓</span>
            {point}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PosCompanyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // The open sale is shared with the payment and receipt screens (src/lib/posSale.ts).
  const { lines } = useOpenSale()
  const setLines = setSaleLines
  const [vat, setVat] = useState(COMPANIES[0].vat)
  const [chosen, setChosen] = useState<Company | null>(COMPANIES[0])

  const found = COMPANIES.find((company) => company.vat === vat.trim().toUpperCase()) ?? null

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <Link
          to="/pos"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
        >
          ‹ {t('pos.backToSale')}
        </Link>

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-[320px] flex-1 flex-col gap-4">
            <section className="rounded-md bg-surface-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
                <div>
                  <h1 className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('pos.company.whose')}
                  </h1>
                  <p className="mt-1 text-xs font-medium text-text-quaternary">
                    {t('pos.company.vatIsAll')}
                  </p>
                </div>
                <button type="button" className="text-sm font-semibold text-primary-700">
                  {t('pos.company.byHand')}
                </button>
              </div>

              <div className="px-6 py-4">
                <label className="block text-xs font-semibold text-text-tertiary" htmlFor="vat">
                  {t('pos.company.vatNumber')}
                </label>
                <div className="mt-2 flex h-[54px] items-center gap-3 rounded-sm border-2 border-primary-700 bg-primary-25 px-4">
                  <SearchIcon className="size-5 shrink-0 text-primary-700" />
                  <input
                    id="vat"
                    value={vat}
                    onChange={(event) => {
                      setVat(event.target.value)
                      setChosen(null)
                    }}
                    dir="ltr"
                    className="h-full w-full min-w-0 border-0 bg-transparent text-base font-medium text-text-primary outline-none rtl:text-end"
                  />
                  {found ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-success-700">
                      <CheckIcon className="size-3.5" />
                      {t('pos.company.found')}
                    </span>
                  ) : null}
                </div>

                {found ? (
                  <div className="mt-4 flex items-start gap-3 rounded-md border border-border-subtle bg-success-100 p-4 sm:gap-4 sm:p-5">
                    {/* A white square with a green check, as the frame draws the match. */}
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white text-success-700 shadow-sm">
                      <CheckIcon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1 basis-[200px]">
                          <p className="text-base font-medium leading-[1.2] text-text-primary">
                            {found.name}
                          </p>
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {found.address} · {t(found.sinceKey, found.sinceValues)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setVat('')
                            setChosen(null)
                          }}
                          className="inline-flex h-10 shrink-0 items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary"
                        >
                          {t('pos.company.notThem')}
                        </button>
                      </div>
                      {/* One row on a wide screen; wraps only where it must (phones). */}
                      <div className="mt-3 flex flex-wrap gap-1.5 sm:flex-nowrap">
                        <Tag
                          label={
                            <>
                              <CheckIcon className="size-3 shrink-0" />
                              {t('pos.company.onPeppol')}
                            </>
                          }
                        />
                        <Tag label={found.peppol} mono />
                        <Tag label={t(found.termsKey)} />
                        <Tag label={t(found.accountKey, found.accountValues)} />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-6 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.company.servedRecently')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.company.noTyping')}
                </p>
              </div>
              <div className="grid gap-3 px-6 py-4 sm:grid-cols-3">
                {COMPANIES.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => {
                      setVat(company.vat)
                      setChosen(company)
                    }}
                    className="flex min-w-0 items-center gap-3 rounded-md border border-border-subtle bg-white px-4 py-3 text-start transition-colors hover:border-primary-300 hover:bg-primary-25"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-25 text-xs font-semibold text-primary-700">
                      {company.initials}
                    </span>
                    <span className="min-w-0">
                      <span
                        title={company.name}
                        className="block truncate text-sm font-medium text-text-primary"
                      >
                        {company.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-medium text-text-quaternary">
                        {t(company.seenKey)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-6 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.company.whatChanges')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.company.sameItems')}
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-4 px-6 py-5 sm:flex-row">
                <ChangeColumn
                  kicker={t('pos.company.wasGoingToBe')}
                  title={t('pos.company.tillReceipt')}
                  points={WALK_IN_IS.map((id) => t(`pos.company.walkIn.${id}`))}
                />
                <span className="flex shrink-0 items-center justify-center text-text-quaternary max-sm:hidden">
                  <ArrowForwardIcon />
                </span>
                <ChangeColumn
                  kicker={t('pos.company.willNowBe')}
                  title={t('pos.company.fullInvoice')}
                  points={COMPANY_IS.map((id) =>
                    t(`pos.company.company.${id}`, { name: (chosen ?? found)?.name ?? '' }),
                  )}
                  highlighted
                />
              </div>
            </section>
          </div>

          <PosSalePanel
            lines={lines}
            onLines={setLines}
            onTakePayment={() => navigate('/pos/payment')}
            company={found ?? chosen ?? undefined}
          />
        </div>
      </div>
    </AppShell>
  )
}

function Tag({ label, mono }: { label: ReactNode; mono?: boolean }) {
  return (
    <span
      dir={mono ? 'ltr' : undefined}
      className={[
        'inline-flex h-[26px] min-w-0 items-center gap-1 whitespace-nowrap rounded-sm bg-white px-2 text-xs font-medium text-text-tertiary',
        mono ? 'shrink-0 font-mono' : '',
      ].join(' ')}
    >
      <span className="inline-flex min-w-0 items-center gap-1 truncate">{label}</span>
    </span>
  )
}
