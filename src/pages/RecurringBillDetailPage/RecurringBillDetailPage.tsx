import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Rial, withRial } from '../../components/ui'
import { RECURRING_DETAIL } from '../../lib/recurringBills'
import calSmallIcon from '../../assets/recurring/cal-small.svg'
import calAlertIcon from '../../assets/recurring/cal-alert.svg'
import actCalIcon from '../../assets/recurring/act-cal.svg'
import mailWhiteIcon from '../../assets/recurring/mail-white.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import matchOkIcon from '../../assets/bills/match-ok.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import peppolIcon from '../../assets/invoice-details/peppol-badge.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const BAR_TONE = {
  paid: 'bg-primary-150',
  recent: 'bg-primary-700',
  expected: 'border border-dashed border-[#d8c9a8] bg-[#faf5ea]',
} as const

const CHIP_TONE = {
  ok: 'bg-success-100 text-[#3d5648]',
  warn: 'bg-pending-100 text-pending-700',
  muted: 'bg-surface-background text-text-tertiary',
} as const

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Rows({ items }: { items: [string, string, string?][] }) {
  return (
    <dl className="flex flex-col gap-3">
      {items.map(([label, value, tone]) => (
        <div key={label} className="flex items-center justify-between gap-3">
          <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
          <dd className={['text-sm font-semibold', tone || 'text-text-primary'].join(' ')}>
            {withRial(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function RecurringBillDetailPage() {
  const { t } = useTranslation()
  const bill = RECURRING_DETAIL
  const [watching, setWatching] = useState(true)
  const [received, setReceived] = useState(false)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/expenditure/recurring-bills"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
            >
              {t('recurringBills.title')}
            </Link>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            <span className="text-2xl font-medium leading-[1.2] text-text-primary">
              {bill.title}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {bill.title}
            </h1>
            {received ? (
              <span className="inline-flex h-[31px] items-center gap-2 rounded-full bg-success-100 px-3 text-sm font-semibold text-[#3d5648]">
                <span className="size-1.5 rounded-full bg-[#3d5648]" />
                {t('recurringBills.detail.receivedChip')}
              </span>
            ) : (
              <span className="inline-flex h-[31px] items-center gap-2 rounded-full bg-pending-100 px-3 text-sm font-semibold text-pending-700">
                <span className="size-1.5 rounded-full bg-pending-700" />
                {t('recurringBills.detail.lateChip')}
              </span>
            )}
            <span className="inline-flex h-[31px] items-center gap-1.5 rounded-full bg-surface-background px-3 text-xs font-semibold uppercase tracking-[0.5px] text-text-tertiary">
              <img src={calSmallIcon} alt="" className="size-4" />
              {t(bill.cadenceChipKey)}
            </span>

            <div className="ms-auto flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setWatching((value) => !value)}
                className="inline-flex h-[46px] items-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
              >
                {watching
                  ? t('recurringBills.detail.pauseWatching')
                  : t('recurringBills.detail.resumeWatching')}
              </button>
              <button
                type="button"
                className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                <img src={mailWhiteIcon} alt="" className="size-[17px]" />
                {t('recurringBills.actions.chase')}
              </button>
            </div>
          </div>

          <p className="flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
            <span className="font-medium text-text-quaternary">
              {t('recurringBills.detail.from')}
            </span>
            <span className="font-semibold text-text-primary">{bill.supplier}</span>
            <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            <span className="font-medium text-text-quaternary">
              {t('recurringBills.detail.usually')}
            </span>
            <span className="font-semibold text-text-primary">
              <Rial /> {bill.usual}
            </span>
            <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            <span className="font-medium text-text-quaternary">
              {t('recurringBills.detail.watchedSince', { since: bill.watchedSince })}
            </span>
          </p>
        </div>

        {/* Late banner */}
        {received ? null : (
          <div className="flex flex-wrap items-center gap-4 rounded-sm border border-[#e7e0cd] bg-[#faf5ea] p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
              <img src={calAlertIcon} alt="" className="size-5" />
            </span>
            <div className="min-w-[260px] flex-1">
              <p className="text-base font-semibold leading-[1.2] text-[#6d5a39]">
                {t(bill.alert.titleKey)}
              </p>
              <p className="mt-1 text-sm font-medium leading-[1.4] text-[#887147]">
                {t(bill.alert.bodyKey)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setReceived(true)}
                className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('recurringBills.detail.markReceived')}
              </button>
              <button
                type="button"
                className="inline-flex h-[42px] items-center rounded-sm bg-pending-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-[#5b4a2f]"
              >
                {t('recurringBills.actions.chase')}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* Chart */}
            <Card
              title={t('recurringBills.detail.whatItsCost')}
              action={
                <button
                  type="button"
                  className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                >
                  {t('recurringBills.detail.export')}
                </button>
              }
            >
              <p className="-mt-3 mb-4 text-sm font-medium text-text-quaternary">
                {t('recurringBills.detail.last12')}
              </p>

              <div className="flex h-[170px] items-end gap-2">
                {bill.chart.bars.map((bar) => (
                  <div key={bar.month} className="flex h-full flex-1 flex-col items-center gap-2">
                    {/* A percentage height needs a parent with a resolved one, which this
                        flex-1 box supplies; without it every bar collapses to nothing. */}
                    <span className="flex w-full flex-1 items-end">
                      <span
                        style={{ height: `${bar.height * 100}%` }}
                        className={['w-full rounded-sm', BAR_TONE[bar.tone]].join(' ')}
                      />
                    </span>
                    <span className="text-xs font-medium leading-[1.2] text-text-quaternary">
                      {bar.month}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-background pt-4">
                <div className="flex flex-wrap items-center gap-4">
                  {(['paid', 'recent', 'expected'] as const).map((tone) => (
                    <span
                      key={tone}
                      className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary"
                    >
                      <span className={['size-3 rounded-[2px]', BAR_TONE[tone]].join(' ')} />
                      {t(`recurringBills.detail.legend.${tone}`)}
                    </span>
                  ))}
                </div>
                <span className="text-xs font-medium text-text-tertiary">
                  {withRial(t(bill.chart.noteKey))}
                </span>
              </div>
            </Card>

            {/* Month by month */}
            <Card
              title={t('recurringBills.detail.everyMonth')}
              action={
                <button
                  type="button"
                  className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                >
                  {t('recurringBills.detail.seeAll', { count: bill.monthsTotal })}
                </button>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-start">
                  <thead>
                    <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.8px] text-text-quaternary">
                      {['month', 'bill', 'arrived', 'amount', 'paid'].map((key, index) => (
                        <th
                          key={key}
                          className={[
                            'py-2 font-semibold',
                            index === 3 ? 'text-end' : 'text-start',
                            index === 4 ? 'ps-4' : '',
                          ].join(' ')}
                        >
                          {t(`recurringBills.detail.col.${key}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bill.months.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-surface-background last:border-b-0"
                      >
                        <td className="py-3.5">
                          <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                            {row.month}
                          </p>
                          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                            {row.expected}
                          </p>
                        </td>
                        <td className="py-3.5">
                          {row.bill ? (
                            <Link
                              to={`/expenditure/bills/${row.bill}`}
                              className="text-sm font-semibold text-primary-700 hover:underline"
                            >
                              {row.bill}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-text-quaternary">
                              {t('recurringBills.detail.nothingYet')}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5">
                          <span
                            className={[
                              'inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-medium leading-[1.3]',
                              CHIP_TONE[row.arrivedTone],
                            ].join(' ')}
                          >
                            {t(row.arrivedKey)}
                          </span>
                        </td>
                        <td className="py-3.5 text-end">
                          <p className="text-sm font-semibold text-text-primary">
                            <span className="me-1">
                              <Rial />
                            </span>
                            {row.amount}
                          </p>
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {t(row.amountNoteKey)}
                          </p>
                        </td>
                        <td className="py-3.5 ps-4">
                          <span
                            className={[
                              'inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-medium leading-[1.3]',
                              CHIP_TONE[row.paidTone],
                            ].join(' ')}
                          >
                            {t(row.paidKey)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Activity */}
            <Card title={t('recurringBills.detail.activityTitle')}>
              <ol className="flex flex-col">
                {bill.activity.map((event, index) => (
                  <li key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={[
                          'flex size-7 shrink-0 items-center justify-center rounded-full',
                          event.tone === 'current' ? 'bg-primary-50' : 'bg-success-100',
                        ].join(' ')}
                      >
                        <img
                          src={event.tone === 'current' ? actCalIcon : matchOkIcon}
                          alt=""
                          className="size-3.5"
                        />
                      </span>
                      {index < bill.activity.length - 1 ? (
                        <span className="w-px flex-1 bg-border-subtle" />
                      ) : null}
                    </div>
                    <div className="pb-5">
                      <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                        {t(event.titleKey)}
                      </p>
                      <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {t(event.detailKey)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          {/* Right */}
          <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
            <Card title={t('recurringBills.detail.whatExpects')}>
              <Rows
                items={[
                  [t('recurringBills.detail.howOften'), t(bill.expects.howOften)],
                  [t('recurringBills.form.arrivesAround'), t(bill.expects.arrivesAround)],
                  [t('recurringBills.detail.paymentDue'), t(bill.expects.paymentDue)],
                  [t('recurringBills.form.usualAmount'), `OMR ${bill.expects.usualAmount}`],
                  [t('recurringBills.detail.flagIfOutside'), bill.expects.flagOutside],
                ]}
              />
              <p className="mt-4 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.4] text-text-tertiary">
                <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                {t(bill.expects.noteKey)}
              </p>
            </Card>

            <Card title={t('recurringBills.detail.whenItTells')}>
              <Rows
                items={[
                  [t('recurringBills.detail.ifNothingArrives'), t(bill.tellsYou.ifNothing)],
                  [t('recurringBills.detail.ifAmountOff'), t(bill.tellsYou.ifAmountOff)],
                  [
                    t('recurringBills.detail.approveAutomatically'),
                    t(bill.tellsYou.approveAutomatically),
                  ],
                  [t('recurringBills.form.whoGetsTold'), bill.tellsYou.whoGetsTold],
                ]}
              />
            </Card>

            <Card title={t('recurringBills.detail.trackRecord')}>
              <Rows
                items={[
                  [t('recurringBills.detail.billsMatched'), bill.trackRecord.matched],
                  [t('recurringBills.detail.arrivedOnTime'), bill.trackRecord.onTime],
                  [t('recurringBills.detail.everChanged'), t(bill.trackRecord.everChanged)],
                  [t('recurringBills.detail.paidThisYear'), `OMR ${bill.trackRecord.paidThisYear}`],
                  [t('recurringBills.detail.costPerYear'), `OMR ${bill.trackRecord.costPerYear}`],
                ]}
              />
            </Card>

            <Card title={t('recurringBills.detail.supplier')}>
              <Rows
                items={[
                  [t('billDetail.supplier.name'), bill.supplierCard.name],
                  [t('billDetail.supplier.vat'), bill.supplierCard.vat],
                  [t('recurringBills.detail.sendsBillsBy'), t(bill.supplierCard.sendsBy)],
                  [t('recurringBills.detail.contact'), bill.supplierCard.contact],
                ]}
              />
              <p className="mt-4 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.4] text-text-tertiary">
                <img src={peppolIcon} alt="" className="mt-px size-4 shrink-0" />
                {t(bill.supplierCard.noteKey)}
              </p>
            </Card>

            {/* The one thing the watch guarantees, restated where the eye lands last. */}
            <p className="flex items-start gap-2 px-1 text-xs font-medium leading-[1.4] text-text-quaternary">
              <img src={tickIcon} alt="" className="mt-px size-4 shrink-0" />
              {t('recurringBills.detail.footerNote')}
            </p>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
