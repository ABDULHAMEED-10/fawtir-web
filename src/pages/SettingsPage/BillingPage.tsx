import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { ActionMenu } from '../../components/ui'
import { longDate, COMPANY } from '../../lib/settings'
import {
  nextBill,
  CARDS,
  PAST_BILLS,
  CURRENT_PLAN,
  formatOmr,
  OVERAGE_ON,
} from '../../lib/settingsBilling'
import { MEMBERS, SEATS } from '../../lib/settingsPeople'
import downloadIcon from '../../assets/settings/download-ink.svg'
import cardIcon from '../../assets/settings/tile-bills.svg'
import plusIcon from '../../assets/settings/plus-brand.svg'
import fileIcon from '../../assets/settings/menu-invoice.svg'
import viewIcon from '../../assets/settings/menu-list.svg'
import mailIcon from '../../assets/settings/menu-mail.svg'

/**
 * Settings › Bills and payment (Figma 135:40971).
 *
 * The next bill is assembled from the plan and the account rather than stated, so the "if you
 * add the sixth person" figure and the plan screen's pressure are the same arithmetic.
 */
export function BillingPage() {
  const { t } = useTranslation()
  const bill = nextBill()
  const [cards, setCards] = useState(CARDS)
  const extraPeople = Math.max(0, MEMBERS.length - SEATS.included)

  const makeDefault = (id: string) =>
    setCards((current) => current.map((card) => ({ ...card, default: card.id === id })))

  const primary = cards.find((card) => card.default) ?? cards[0]
  const others = cards.filter((card) => card.id !== primary.id)

  return (
    <SettingsShell group="billing">
      <SettingsHeader
        title={t('bills.title')}
        subtitle={t('bills.subtitle')}
        actions={
          <>
            <Link
              to="/settings/plan"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('bills.planAndUsage')}
            </Link>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={downloadIcon} alt="" className="size-[18px]" />
              {t('bills.downloadAll')}
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* Next bill */}
        <section className="min-w-0 flex-1 overflow-hidden rounded-md bg-surface-card">
          <div className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-primary-700">
                  {t('bills.yourNextBill')}
                </p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-lg font-medium text-text-quaternary">OMR</span>
                  <span className="text-[38px] font-semibold leading-[1.1] text-text-primary tabular-nums">
                    {formatOmr(bill.total)}
                  </span>
                </p>
              </div>
              <div className="text-end">
                <p className="text-lg font-medium text-text-primary">{longDate(bill.dueOn)}</p>
                <p className="mt-1 text-sm font-medium text-text-quaternary">
                  {t('bills.inDays', { count: bill.inDays })}
                </p>
              </div>
            </div>

            <p className="mt-3 max-w-[620px] text-sm font-medium leading-[1.6] text-text-tertiary">
              <Trans
                i18nKey={extraPeople === 0 ? 'bills.nothingExtra' : 'bills.extraThisMonth'}
                values={{
                  day: longDate(bill.dueOn),
                  amount: formatOmr(bill.withOneMore),
                  count: extraPeople,
                  each: formatOmr(SEATS.extraMonthly),
                }}
                components={{ b: <b className="font-semibold text-text-primary" /> }}
              />
            </p>
          </div>

          <dl className="border-t border-surface-background">
            <BillLine
              label={t('bills.line.plan', { plan: t(`plan.planName.${CURRENT_PLAN.id}`) })}
              note={t('bills.line.planNote', {
                invoices: CURRENT_PLAN.invoices,
                people: CURRENT_PLAN.people,
                branches: CURRENT_PLAN.branches ?? '∞',
              })}
              amount={formatOmr(bill.plan)}
            />
            <BillLine
              label={t('bills.line.extraPeople')}
              note={
                extraPeople === 0
                  ? t('bills.line.extraPeopleNone')
                  : t('bills.line.extraPeopleSome', { count: extraPeople })
              }
              amount={formatOmr(bill.people)}
            />
            <BillLine
              label={t('bills.line.overage')}
              note={OVERAGE_ON ? t('bills.line.overageOn') : t('bills.line.overageOff')}
              amount={formatOmr(bill.overage)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-background/60 px-5 py-4">
              <dt className="text-base font-semibold text-text-primary">
                {t('bills.chargedOn', { date: longDate(bill.dueOn) })}
              </dt>
              <dd className="flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-text-quaternary">OMR</span>
                <span className="text-xl font-semibold text-text-primary tabular-nums">
                  {formatOmr(bill.total)}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Card */}
        <aside className="flex w-full flex-col gap-4 xl:w-[360px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <div className="rounded-md bg-primary-700 p-4 text-white">
              <p className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <img src={cardIcon} alt="" className="size-5 brightness-0 invert" />
                  <span className="text-sm font-semibold uppercase tracking-[0.5px]">
                    {primary.brand}
                  </span>
                </span>
                <span className="inline-flex h-[20px] items-center rounded-[3px] bg-white/20 px-1.5 text-[9px] font-semibold uppercase tracking-[0.4px]">
                  {t('bills.default')}
                </span>
              </p>
              <p dir="ltr" className="mt-5 text-left font-mono text-lg tracking-[0.2em]">
                ···· ···· ···· {primary.last4}
              </p>
              <p className="mt-4 flex items-end justify-between gap-3">
                <span>
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.5px] text-white/60">
                    {t('bills.cardholder')}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold">{primary.holder}</span>
                </span>
                <span className="text-end">
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.5px] text-white/60">
                    {t('bills.expires')}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold tabular-nums">
                    {primary.expires}
                  </span>
                </span>
              </p>
            </div>

            <ul className="mt-4 flex flex-col">
              {others.map((card) => (
                <li
                  key={card.id}
                  className="flex items-center gap-3 border-b border-surface-background py-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-background">
                    <img src={cardIcon} alt="" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">
                      {t('bills.backupCard', { last4: card.last4 })}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                      {card.noteKey ? t(card.noteKey) : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => makeDefault(card.id)}
                    className="shrink-0 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                  >
                    {t('bills.makeDefault')}
                  </button>
                </li>
              ))}

              <li className="flex items-center gap-3 border-b border-surface-background py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-background">
                  <img src={plusIcon} alt="" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t('bills.addAnotherCard')}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                    {t('bills.addAnotherCardNote')}
                  </span>
                </span>
              </li>

              <li className="flex items-center gap-3 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-background">
                  <img src={fileIcon} alt="" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t('bills.billingDetails')}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                    {COMPANY.legalName} · VAT {COMPANY.vatNumber}
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                >
                  {t('bills.change')}
                </button>
              </li>
            </ul>
          </section>
        </aside>
      </div>

      {/* Past bills */}
      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
            {t('bills.pastBills')}
          </h3>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary">
              {new Date().getFullYear()}
            </span>
            <button
              type="button"
              className="inline-flex h-[38px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={downloadIcon} alt="" className="size-4" />
              {t('bills.downloadTheYear')}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-y border-surface-background text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                <th className="h-[40px] px-5 text-start font-semibold">
                  {t('bills.col.reference')}
                </th>
                <th className="h-[40px] px-4 text-start font-semibold">{t('bills.col.covered')}</th>
                <th className="h-[40px] px-4 text-end font-semibold">{t('bills.col.amount')}</th>
                <th className="h-[40px] px-4 text-start font-semibold">{t('bills.col.status')}</th>
                <th className="h-[40px] px-4" />
              </tr>
            </thead>
            <tbody>
              {PAST_BILLS.map((row) => (
                <tr
                  key={row.reference}
                  className={[
                    'border-b border-surface-background last:border-0',
                    row.status === 'paidLate' ? 'border-s-4 border-s-danger-700 bg-[#fdf4f2]' : '',
                  ].join(' ')}
                >
                  <td className="px-5 py-4 align-top">
                    <p className="font-mono text-sm font-semibold text-primary-700">
                      {row.reference}
                    </p>
                    <p className="mt-1 text-xs font-medium text-text-quaternary">{row.issued}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="text-sm font-medium text-text-primary">{t(row.monthKey)}</p>
                    <p className="mt-1 text-xs font-medium text-text-quaternary">
                      {t(row.coveredKey, row.coveredValues)}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top text-end">
                    <p className="flex items-baseline justify-end gap-1">
                      <span className="text-[10px] font-medium text-text-quaternary">OMR</span>
                      <span className="text-sm font-semibold text-text-primary tabular-nums">
                        {formatOmr(row.amount)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs font-medium text-text-quaternary">Visa {row.card}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span
                      className={[
                        'inline-flex h-[24px] items-center gap-1.5 rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
                        row.status === 'paid'
                          ? 'bg-success-100 text-[#3d5648]'
                          : 'bg-pending-100 text-pending-700',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'size-1.5 rounded-full',
                          row.status === 'paid' ? 'bg-[#4c6c5a]' : 'bg-pending-500',
                        ].join(' ')}
                      />
                      {row.status === 'paid' ? t('bills.paid') : t('bills.paidLate')}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        aria-label={t('bills.downloadBill')}
                        className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
                      >
                        <img src={downloadIcon} alt="" className="size-4" />
                      </button>
                      <ActionMenu
                        label={t('bills.menu.view')}
                        items={[
                          { id: 'view', labelKey: 'bills.menu.view', icon: viewIcon },
                          { id: 'download', labelKey: 'bills.menu.download', icon: downloadIcon },
                          { id: 'receipt', labelKey: 'bills.menu.receipt', icon: mailIcon },
                        ]}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </SettingsShell>
  )
}

function BillLine({ label, note, amount }: { label: string; note: string; amount: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-background px-5 py-4">
      <div>
        <dt className="text-sm font-semibold text-text-primary">{label}</dt>
        <dd className="mt-1 text-xs font-medium text-text-quaternary">{note}</dd>
      </div>
      <dd className="shrink-0 text-sm font-semibold text-text-primary tabular-nums">{amount}</dd>
    </div>
  )
}
