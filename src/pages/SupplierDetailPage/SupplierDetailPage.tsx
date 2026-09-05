import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  DETAIL_TABS,
  EARLY_SETTLEMENT_SAVING,
  SUPPLIER_DETAIL,
  type DetailTabId,
} from '../../lib/supplierDetail'
import { formatOmr } from '../../lib/suppliers'
import { AddToPaymentRunModal } from './AddToPaymentRunModal'
import { SwitchSupplierOffModal } from './SwitchSupplierOffModal'
import chevronIcon from '../../assets/invoices/chevron.svg'
import editIcon from '../../assets/actions/edit.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import peppolIcon from '../../assets/suppliers/chip-peppol.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import cardIcon from '../../assets/suppliers/kpi-owe.svg'
import matchIcon from '../../assets/suppliers/menu-order.svg'
import selfBillIcon from '../../assets/suppliers/menu-attach.svg'
import paperIcon from '../../assets/bill-capture/file.svg'
import shieldIcon from '../../assets/bill-detail/compliance.svg'
import infoIcon from '../../assets/bill-capture/info.svg'

const BAND_TONE: Record<string, string> = {
  notDueYet: 'bg-[#4c6c5a]',
  dueWithin7: 'bg-[#6d5a39]',
  alreadyLate: 'bg-warning-700',
  onHold: 'bg-border-default',
}

const PAPER_ICON: Record<string, string> = {
  current: paperIcon,
  onFile: shieldIcon,
  superseded: paperIcon,
}

export function SupplierDetailPage() {
  const { t } = useTranslation()
  const supplier = SUPPLIER_DETAIL
  const [tab, setTab] = useState<DetailTabId>('overview')
  const [runOpen, setRunOpen] = useState(false)
  const [offOpen, setOffOpen] = useState(false)

  /** The bar across the top is the bands at their real proportions. */
  const bands = supplier.bands.filter((band) => band.total > 0)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Breadcrumb + actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/suppliers"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
            >
              {t('suppliersPage.title')}
            </Link>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            <h1 className="text-2xl font-medium leading-[1.2] text-text-primary">
              {supplier.name}
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
            <Link
              to={`/suppliers/${supplier.slug}/edit`}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={editIcon} alt="" className="size-5" />
              {t('supplierDetail.editSupplier')}
            </Link>
            <Link
              to={`/suppliers/${supplier.slug}/purchase-order`}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierDetail.newPurchaseOrder')}
            </Link>
            <Link
              to={`/suppliers/${supplier.slug}/record-bill`}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
              {t('supplierDetail.recordBill')}
            </Link>
          </div>
        </div>

        {/* Identity */}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-card p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-lg font-semibold text-primary-800">
              {supplier.initials}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-2xl font-medium leading-[1.2] text-text-primary">
                  {supplier.name}
                </h2>
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
                  <img src={peppolIcon} alt="" className="size-3" />
                  {t('supplierDetail.billsYouOverPeppol')}
                </span>
                <span className="inline-flex h-[26px] items-center rounded-full bg-primary-50 px-2.5 text-xs font-medium text-primary-800">
                  {t(supplier.category)}
                </span>
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
                  <img src={tickIcon} alt="" className="size-3" />
                  {t('supplierDetail.recordComplete')}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
                {t('supplierDetail.identity', {
                  legal: supplier.tradingName,
                  vat: supplier.vat,
                  terms: t('supplierDetail.net30WithEarly'),
                  since: supplier.sinceShort,
                })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <Link
              to={`/suppliers/${supplier.slug}/statement`}
              className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierDetail.statement')}
            </Link>
            <button
              type="button"
              onClick={() => setRunOpen(true)}
              className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierDetail.payThem')}
            </button>
          </div>
        </section>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle">
          {DETAIL_TABS.map((entry) => {
            const isActive = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={[
                  'inline-flex h-[46px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary-700 text-primary-700'
                    : 'border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
                {'count' in entry ? (
                  <span className="rounded-sm bg-surface-background px-1.5 py-0.5 text-[11px] font-semibold text-text-quaternary">
                    {entry.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {tab !== 'overview' ? (
          <section className="rounded-md bg-surface-card p-16 text-center text-sm font-medium text-text-quaternary">
            {t('supplierDetail.comingSoon')}
          </section>
        ) : (
          <div className="flex flex-col gap-4 xl:flex-row">
            {/* Main column */}
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {/* What you owe */}
              <section className="rounded-md bg-surface-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                    {t('supplierDetail.whatYouOwe')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setRunOpen(true)}
                    className="inline-flex h-[38px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    {t('supplierDetail.addToPaymentRun')}
                  </button>
                </div>

                <div className="mt-4 flex h-2 overflow-hidden rounded-full">
                  {bands.map((band) => (
                    <span
                      key={band.id}
                      className={BAND_TONE[band.id]}
                      style={{ width: `${(band.total / supplier.owed) * 100}%` }}
                    />
                  ))}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {supplier.bands.map((band) => (
                    <div key={band.id} className="border-s-2 border-surface-background ps-3">
                      <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
                        {t(`supplierDetail.bands.${band.id}`)}
                      </p>
                      {band.total > 0 ? (
                        <p className="mt-1.5 flex items-center gap-1 text-xl font-semibold leading-[1.2] text-text-primary tabular-nums">
                          <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                          {formatOmr(band.total)}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xl font-semibold leading-[1.2] text-text-quaternary">
                          —
                        </p>
                      )}
                      <p className="mt-1.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                        {t(`supplierDetail.bandNote.${band.id}`, {
                          count: band.bills.length,
                          date: band.bills[0]?.due.replace(' 2026', '') ?? '',
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Open bills */}
              <section className="rounded-md bg-surface-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                    {t('supplierDetail.openBills')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setTab('bills')}
                    className="text-sm font-semibold text-primary-700 hover:underline"
                  >
                    {t('supplierDetail.seeAll', { count: supplier.counts.bills })}
                  </button>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[620px] border-collapse">
                    <thead>
                      <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                        {(['bill', 'due', 'whereItIs', 'amount'] as const).map((key, index) => (
                          <th
                            key={key}
                            className={[
                              'pb-2.5 font-semibold',
                              index === 3 ? 'text-end' : 'text-start',
                            ].join(' ')}
                          >
                            {t(`supplierDetail.col.${key}`)}
                          </th>
                        ))}
                        <th className="pb-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {supplier.bills.map((bill) => (
                        <tr
                          key={bill.id}
                          className="border-b border-surface-background last:border-0"
                        >
                          <td className="py-4 pe-4 align-top">
                            <Link
                              to={`/expenditure/bills/${bill.id}`}
                              className="text-sm font-semibold text-primary-700 hover:underline"
                            >
                              {bill.id}
                            </Link>
                            <p className="mt-1 text-xs font-medium text-text-quaternary">
                              {t('supplierDetail.arrivedOn', {
                                date: bill.arrived,
                                po: bill.poRef,
                              })}
                            </p>
                          </td>
                          <td className="py-4 pe-4 align-top">
                            <p className="text-sm font-medium text-text-secondary">{bill.due}</p>
                            <p
                              className={[
                                'mt-1 text-xs font-medium',
                                bill.dueInDays >= 0 && bill.dueInDays <= 7
                                  ? 'text-warning-700'
                                  : 'text-text-quaternary',
                              ].join(' ')}
                            >
                              {bill.state === 'paid'
                                ? t('supplierDetail.paidOn', { date: '16 Jul' })
                                : t('supplierDetail.dueIn', { count: bill.dueInDays })}
                            </p>
                          </td>
                          <td className="py-4 pe-4 align-top">
                            <span
                              className={[
                                'inline-flex h-[24px] items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
                                bill.state === 'paid'
                                  ? 'bg-success-100 text-[#3d5648]'
                                  : 'bg-primary-50 text-primary-800',
                              ].join(' ')}
                            >
                              <span
                                className={[
                                  'size-1.5 rounded-full',
                                  bill.state === 'paid' ? 'bg-[#3d5648]' : 'bg-primary-700',
                                ].join(' ')}
                              />
                              {bill.state === 'paid'
                                ? t('supplierDetail.paid')
                                : t('supplierDetail.inRun', { run: supplier.paymentRun })}
                            </span>
                            <p className="mt-1.5 max-w-[180px] text-xs font-medium leading-[1.4] text-text-quaternary">
                              {t(bill.whereNoteKey, {
                                date: supplier.paymentRunDate,
                                id: 'MR-CN-0118',
                              })}
                            </p>
                          </td>
                          <td className="py-4 pe-4 align-top text-end">
                            <p className="flex items-center justify-end gap-1 text-sm font-semibold text-text-primary tabular-nums">
                              <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                              {formatOmr(bill.amount)}
                            </p>
                            {bill.discountRate ? (
                              <p className="mt-1 whitespace-nowrap text-xs font-medium text-[#3d5648]">
                                {t('supplierDetail.discountSaves', {
                                  rate: bill.discountRate * 100,
                                  amount: formatOmr(EARLY_SETTLEMENT_SAVING),
                                })}
                              </p>
                            ) : null}
                            {bill.creditUnused ? (
                              <p className="mt-1 flex items-center justify-end gap-1 whitespace-nowrap text-xs font-medium text-text-quaternary">
                                <img src={omrRowIcon} alt="" className="h-auto w-3 shrink-0" />
                                {t('supplierDetail.creditUnused', {
                                  amount: formatOmr(bill.creditUnused),
                                })}
                              </p>
                            ) : null}
                          </td>
                          <td className="py-4 align-top text-end">
                            <button
                              type="button"
                              onClick={() => setRunOpen(true)}
                              className="inline-flex h-[34px] items-center whitespace-nowrap rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                            >
                              {t(bill.actionKey)}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* What you buy */}
              <section className="rounded-md bg-surface-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                      {t('supplierDetail.whatYouBuy')}
                    </h3>
                    <span className="text-xs font-medium text-text-quaternary">
                      {t('supplierDetail.lastTwelveMonths')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary-700 hover:underline"
                  >
                    {t('supplierDetail.fullBreakdown')}
                  </button>
                </div>

                <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  {supplier.purchases.map((line) => (
                    <div key={line.id}>
                      <p className="text-sm font-medium leading-[1.3] text-text-secondary">
                        {t(line.nameKey)}
                      </p>
                      <p className="mt-1 flex items-baseline gap-2">
                        <span className="flex items-center gap-1 text-lg font-semibold leading-[1.2] text-text-primary tabular-nums">
                          <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                          {formatOmr(line.amount)}
                        </span>
                        <span className="text-xs font-medium text-text-quaternary">
                          · {line.qty}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-5 flex items-start gap-2 rounded-sm bg-surface-background p-3.5 text-xs font-medium leading-[1.5] text-text-tertiary">
                  <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                  {t('supplierDetail.priceNote', { from: '7.100', to: '7.400' })}
                </p>
              </section>

              {/* Papers */}
              <section className="rounded-md bg-surface-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                    {t('supplierDetail.papersOnFile')}
                  </h3>
                  <button
                    type="button"
                    className="inline-flex h-[38px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    {t('supplierDetail.attachDocument')}
                  </button>
                </div>

                <ul className="mt-2 flex flex-col">
                  {supplier.papers.map((paper, index) => (
                    <li
                      key={paper.id}
                      className={[
                        'flex items-center gap-3 py-3.5',
                        index < supplier.papers.length - 1
                          ? 'border-b border-surface-background'
                          : '',
                        paper.status === 'superseded' ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'flex size-9 shrink-0 items-center justify-center rounded-sm',
                          paper.status === 'onFile' ? 'bg-success-100' : 'bg-primary-50',
                        ].join(' ')}
                      >
                        <img src={PAPER_ICON[paper.status]} alt="" className="size-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                          {t(paper.titleKey)}
                        </p>
                        <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                          {t(paper.metaKey)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                        {t(`supplierDetail.status.${paper.status}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* Side column */}
            <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
              <section className="rounded-md bg-surface-background p-5">
                <p className="flex items-center gap-2 text-sm font-medium text-text-tertiary">
                  <img src={cardIcon} alt="" className="size-[18px]" />
                  {t('supplierDetail.youOweThem')}
                </p>
                <p className="mt-2.5 flex items-center gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                  <img src={omrRowIcon} alt="" className="h-auto w-[22px] shrink-0" />
                  {formatOmr(supplier.owed)}
                </p>
                <p className="mt-2.5 text-sm font-medium leading-[1.5] text-text-tertiary">
                  {t('supplierDetail.oweExplain', {
                    run: supplier.paymentRun,
                    date: supplier.paymentRunDate,
                  })}
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRunOpen(true)}
                    className="inline-flex h-[40px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                  >
                    {t('supplierDetail.openTheRunAction')}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-[40px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                  >
                    {t('supplierDetail.paySeparately')}
                  </button>
                </div>
              </section>

              <SideCard title={t('supplierDetail.payingThem')}>
                <DetailRow label={t('supplierDetail.terms')} value={t(supplier.paying.terms)} />
                <DetailRow
                  label={t('supplierDetail.earlySettlement')}
                  value={t(supplier.paying.earlySettlement)}
                />
                <DetailRow label={t('supplierDetail.bank')} value={supplier.paying.bank} />
                <DetailRow label={t('supplierDetail.iban')} value={supplier.paying.iban} />
                <DetailRow label={t('supplierDetail.bic')} value={supplier.paying.bic} />
                <DetailRow
                  label={t('supplierDetail.detailsLastChanged')}
                  value={supplier.paying.changedOn}
                  last
                />
              </SideCard>

              <SideCard title={t('supplierDetail.howTheyBillYou')}>
                <BillingRow
                  icon={peppolIcon}
                  title={t('supplierDetail.overPeppol')}
                  note={supplier.billing.peppolId}
                  value={t('supplierDetail.always')}
                />
                <BillingRow
                  icon={matchIcon}
                  title={t('supplierDetail.matchedToOrders')}
                  note={t('supplierDetail.matchedNote')}
                  value={t('supplierDetail.matchedOf', {
                    matched: supplier.billing.matched,
                    total: supplier.billing.matchedOf,
                  })}
                />
                <BillingRow
                  icon={selfBillIcon}
                  title={t('supplierDetail.selfBilling')}
                  note={t('supplierDetail.selfBillingNote')}
                  value={t('supplierDetail.off')}
                  last
                />
              </SideCard>

              <SideCard title={t('supplierDetail.whoToSpeakTo')}>
                {supplier.contacts.map((contact, index) => (
                  <div
                    key={contact.id}
                    className={[
                      'flex items-center gap-3 py-3',
                      index < supplier.contacts.length - 1
                        ? 'border-b border-surface-background'
                        : '',
                    ].join(' ')}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">
                      {contact.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                        {contact.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-medium text-text-quaternary">
                        {contact.detail}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-sm bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-800">
                      {t(contact.tagKey)}
                    </span>
                  </div>
                ))}
              </SideCard>

              <SideCard title={t('supplierDetail.record')}>
                <DetailRow label={t('supplierDetail.legalName')} value={supplier.legalName} />
                <DetailRow label={t('supplierDetail.vatNumber')} value={supplier.vat} />
                <DetailRow label={t('supplierDetail.crNumber')} value={supplier.crNumber} />
                <DetailRow label={t('supplierDetail.address')} value={supplier.address} />
                <DetailRow label={t('supplierDetail.supplierSince')} value={supplier.since} />
                <DetailRow label={t('supplierDetail.addedBy')} value={supplier.addedBy} last />
                <button
                  type="button"
                  onClick={() => setOffOpen(true)}
                  className="mt-4 inline-flex h-[42px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:border-warning-700 hover:text-warning-700"
                >
                  {t('supplierDetail.switchOff')}
                </button>
              </SideCard>
            </aside>
          </div>
        )}
      </div>

      <AddToPaymentRunModal open={runOpen} onClose={() => setRunOpen(false)} />
      <SwitchSupplierOffModal open={offOpen} onClose={() => setOffOpen(false)} />
    </AppShell>
  )
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <h3 className="text-base font-semibold leading-[1.2] text-text-primary">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  )
}

function BillingRow({
  icon,
  title,
  note,
  value,
  last,
}: {
  icon: string
  title: string
  note?: string
  value: string
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-start gap-3 py-3',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-50">
        <img src={icon} alt="" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{title}</p>
        {note ? (
          <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-xs font-medium text-text-tertiary">{value}</span>
    </div>
  )
}
