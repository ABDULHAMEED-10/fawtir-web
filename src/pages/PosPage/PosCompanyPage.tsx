import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { PosSalePanel } from './PosSalePanel'
import { OPEN_SALE, type SaleLine } from '../../lib/pos'
import { COMPANIES, COMPANY_IS, WALK_IN_IS, type Company } from '../../lib/posPayment'
import searchIcon from '../../assets/dashboard/search.svg'

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
        'flex min-w-[240px] flex-1 flex-col gap-3 rounded-md border p-5',
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
  const [lines, setLines] = useState<SaleLine[]>(OPEN_SALE)
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
                <div className="mt-2 flex h-[54px] items-center gap-3 rounded-sm border-2 border-primary-700 bg-surface-card px-4">
                  <img src={searchIcon} alt="" className="size-5 shrink-0" />
                  <input
                    id="vat"
                    value={vat}
                    onChange={(event) => {
                      setVat(event.target.value)
                      setChosen(null)
                    }}
                    className="h-full w-full border-0 bg-transparent text-base font-medium text-text-primary outline-none"
                  />
                  {found ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-success-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-success-700">
                      ✓ {t('pos.company.found')}
                    </span>
                  ) : null}
                </div>

                {found ? (
                  <div className="mt-4 flex flex-wrap items-start gap-3 rounded-md bg-success-100 p-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-700 text-sm text-white">
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium leading-[1.2] text-text-primary">
                        {found.name}
                      </p>
                      <p className="mt-1 text-xs font-medium text-text-quaternary">
                        {found.address} · {t(found.sinceKey, found.sinceValues)}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Tag label={`✓ ${t('pos.company.onPeppol')}`} />
                        <Tag label={found.peppol} mono />
                        <Tag label={t(found.termsKey)} />
                        <Tag label={t(found.accountKey, found.accountValues)} />
                      </div>
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
              <div className="flex flex-wrap gap-3 px-6 py-4">
                {COMPANIES.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => {
                      setVat(company.vat)
                      setChosen(company)
                    }}
                    className="flex min-w-[200px] flex-1 items-center gap-3 rounded-md border border-border-subtle bg-white px-4 py-3 text-start transition-colors hover:border-primary-300 hover:bg-primary-25"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background text-xs font-semibold text-text-tertiary">
                      {company.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text-primary">
                        {company.name}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
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
              <div className="flex flex-wrap items-stretch gap-4 px-6 py-5">
                <ChangeColumn
                  kicker={t('pos.company.wasGoingToBe')}
                  title={t('pos.company.tillReceipt')}
                  points={WALK_IN_IS.map((id) => t(`pos.company.walkIn.${id}`))}
                />
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

function Tag({ label, mono }: { label: string; mono?: boolean }) {
  return (
    <span
      className={[
        'inline-flex h-[26px] items-center rounded-sm border border-border-subtle bg-white px-2.5 text-xs font-medium text-text-tertiary',
        mono ? 'font-mono' : '',
      ].join(' ')}
    >
      {label}
    </span>
  )
}
