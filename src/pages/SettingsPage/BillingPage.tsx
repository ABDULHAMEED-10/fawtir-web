import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { ActionMenu, Rial, RialText, Select, withRial } from '../../components/ui'
import { longDate, COMPANY } from '../../lib/settings'
import {
  nextBill,
  linkArrivesOn,
  HOW_YOU_PAY,
  PAST_BILLS,
  CURRENT_PLAN,
  EXTRA_BRANCHES,
  formatOmr,
  OVERAGE_ON,
  type TenantPaymentMethod,
} from '../../lib/settingsBilling'
import { PLAN, SUBSCRIPTION_VAT } from '../../lib/plans'
import { MEMBERS, SEATS } from '../../lib/settingsPeople'
import downloadIcon from '../../assets/settings/download-ink.svg'
import copyIcon from '../../assets/settings/copy.svg'
import fileIcon from '../../assets/settings/menu-invoice.svg'
import viewIcon from '../../assets/settings/menu-list.svg'
import mailIcon from '../../assets/settings/menu-mail.svg'
import cardIcon from '../../assets/payment/card.svg'
import bankIcon from '../../assets/payment/bank.svg'

const METHODS: TenantPaymentMethod[] = ['cardLink', 'bankTransfer', 'cash', 'cheque']

/**
 * Settings › Bills and payment (Figma 135:40971, redrawn 15 Sep 2026 for how Fawtir is actually
 * paid).
 *
 * The design kept a card on file. Fawtir never holds one: a card payment opens Paymob's own
 * checkout from a link sent a week before the bill falls due, and bank transfer and cash are
 * always open — someone at Fawtir confirms those and activates the period. So the card panel is
 * gone and "How you pay" stands where it was.
 *
 * The next bill is assembled from the plan and the account rather than stated, so the "if you
 * add the sixth person" figure and the plan screen's pressure are the same arithmetic.
 */
export function BillingPage() {
  const { t } = useTranslation()
  const bill = nextBill()
  const extraPeople = Math.max(0, MEMBERS.length - SEATS.included)
  const [method, setMethod] = useState<TenantPaymentMethod>(HOW_YOU_PAY.method)
  /** "Pay now" asks for the link early; nothing is charged until the customer pays it. */
  const [linkRequested, setLinkRequested] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const linkOn = linkArrivesOn(bill.dueOn)
  const destination =
    HOW_YOU_PAY.channel === 'whatsapp'
      ? t('bills.pay.byWhatsApp', { phone: HOW_YOU_PAY.phone })
      : t('bills.pay.byEmail', { email: HOW_YOU_PAY.email })

  const copy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {})
    setCopied(label)
    window.setTimeout(() => setCopied(null), 1600)
  }

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
                  <span className="text-[38px] font-semibold leading-[1.1] text-text-primary">
                    <Rial />
                  </span>
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
                parent={RialText}
                values={{
                  day: longDate(bill.dueOn),
                  amount: formatOmr(bill.withOneMore),
                  count: extraPeople,
                  each: formatOmr(SEATS.extraMonthly),
                }}
                components={{ b: <b className="font-semibold text-text-primary" /> }}
              />
            </p>

            {/* How this one gets paid — the link's date, or the transfer and cash routes. */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm bg-surface-background px-4 py-3">
              <p className="text-sm font-medium leading-[1.5] text-text-secondary">
                {method === 'cardLink'
                  ? linkRequested
                    ? t('bills.pay.linkSentNow', {
                        to: destination,
                        days: HOW_YOU_PAY.linkValidDays,
                      })
                    : t('bills.pay.linkArrives', { date: longDate(linkOn), to: destination })
                  : t(`bills.pay.next.${method}`)}
              </p>
              {method === 'cardLink' && !linkRequested ? (
                <button
                  type="button"
                  onClick={() => setLinkRequested(true)}
                  className="inline-flex h-9 shrink-0 items-center rounded-sm bg-primary-700 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                >
                  {t('bills.pay.payNow')}
                </button>
              ) : null}
            </div>
          </div>

          <dl className="border-t border-surface-background">
            <BillLine
              label={t('bills.line.plan', { plan: t(`plan.planName.${CURRENT_PLAN.id}`) })}
              note={t('bills.line.planNote', {
                invoices: CURRENT_PLAN.invoices.toLocaleString('en-US'),
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
              label={t('bills.line.extraBranches')}
              note={
                EXTRA_BRANCHES === 0
                  ? t('bills.line.extraBranchesNone', { included: CURRENT_PLAN.branches ?? '∞' })
                  : t('bills.line.extraBranchesSome', {
                      count: EXTRA_BRANCHES,
                      included: CURRENT_PLAN.branches ?? '∞',
                      each: formatOmr(PLAN[CURRENT_PLAN.id].extraBranch ?? 0),
                    })
              }
              amount={formatOmr(bill.branches)}
            />
            <BillLine
              label={t('bills.line.overage')}
              note={
                OVERAGE_ON
                  ? t('bills.line.overageOn', { rate: formatOmr(CURRENT_PLAN.overage) })
                  : t('bills.line.overageOff')
              }
              amount={formatOmr(bill.overage)}
            />
            <BillLine
              label={t('bills.line.vat', { rate: SUBSCRIPTION_VAT * 100 })}
              note={t('bills.line.vatNote', { amount: formatOmr(bill.subtotal) })}
              amount={formatOmr(bill.vat)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-background/60 px-5 py-4">
              <dt className="text-base font-semibold text-text-primary">
                {t('bills.chargedOn', { date: longDate(bill.dueOn) })}
              </dt>
              <dd className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold text-text-primary">
                  <Rial />
                </span>
                <span className="text-xl font-semibold text-text-primary tabular-nums">
                  {formatOmr(bill.total)}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {/* How you pay */}
        <aside className="flex w-full flex-col gap-4 xl:w-[360px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('bills.pay.title')}
            </h3>
            <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('bills.pay.intro')}
            </p>

            <div className="mt-4">
              <Select
                value={method}
                onChange={(value) => setMethod(value as TenantPaymentMethod)}
                ariaLabel={t('bills.pay.preferred')}
                options={METHODS.map((id) => ({
                  value: id,
                  label: t(`bills.method.${id}`),
                  hint: t(`bills.methodHint.${id}`),
                }))}
              />
            </div>

            <ul className="mt-4 flex flex-col">
              <li className="flex items-start gap-3 border-b border-surface-background py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-background">
                  <img src={cardIcon} alt="" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t('bills.pay.linkTitle')}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('bills.pay.linkNote', { to: destination, days: HOW_YOU_PAY.linkValidDays })}
                  </span>
                </span>
              </li>

              <li className="flex items-start gap-3 border-b border-surface-background py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-background">
                  <img src={bankIcon} alt="" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t('bills.pay.transferTitle')}
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-[1.6] text-text-quaternary">
                    {HOW_YOU_PAY.bank.accountName} · {HOW_YOU_PAY.bank.bank}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <span dir="ltr" className="font-mono text-xs font-semibold text-text-secondary">
                      {HOW_YOU_PAY.bank.iban}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy('iban', HOW_YOU_PAY.bank.iban)}
                      aria-label={t('bills.pay.copyIban')}
                      className="inline-flex size-6 items-center justify-center rounded-sm transition-colors hover:bg-primary-25"
                    >
                      <img src={copyIcon} alt="" className="size-3.5" />
                    </button>
                    {copied === 'iban' ? (
                      <span className="text-[11px] font-semibold text-success-700">
                        {t('bills.pay.copied')}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('bills.pay.transferNote', {
                      reference: HOW_YOU_PAY.bank.referenceFormat.replace(
                        '{invoice}',
                        'FWT-2026-1013',
                      ),
                    })}
                  </span>
                </span>
              </li>

              <li className="flex items-start gap-3 border-b border-surface-background py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-background text-sm font-semibold text-text-tertiary">
                  <Rial className="h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t('bills.pay.cashTitle')}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('bills.pay.cashNote')}
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
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
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
                    <p className="whitespace-nowrap font-mono text-sm font-semibold text-primary-700">
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
                      <span className="text-sm font-semibold text-text-primary">
                        <Rial />
                      </span>
                      <span className="text-sm font-semibold text-text-primary tabular-nums">
                        {formatOmr(row.amount)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs font-medium text-text-quaternary">
                      {t(`bills.method.${row.method}`)}
                    </p>
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
                    <p className="mt-1.5 text-xs font-medium text-text-quaternary">
                      {t(`bills.confirmedBy.${row.confirmedBy}`, { date: row.paidOn })}
                    </p>
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
        <dd className="mt-1 text-xs font-medium text-text-quaternary">{withRial(note)}</dd>
      </div>
      <dd className="shrink-0 text-sm font-semibold text-text-primary tabular-nums">{amount}</dd>
    </div>
  )
}
