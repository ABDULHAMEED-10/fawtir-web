import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/ui/Modal'
import { formatOmr } from '../../lib/suppliers'
import { SUPPLIER_DETAIL } from '../../lib/supplierDetail'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'

/**
 * "Pay this supplier" (Figma 117:35445).
 *
 * Every figure in the summary is added up from whatever is ticked, so unticking a bill moves the
 * discount, the credit and the transfer total together — which is the whole point of the screen.
 */

type PayableBill = {
  id: string
  metaKey: string
  metaValues?: Record<string, string>
  /** Highlighted when the bill is already sitting in a draft run. */
  inRun?: boolean
  amount: number
  /** An early-settlement discount still available on this bill. */
  discountRate?: number
  discountNoteKey: string
  /** Bills nobody has approved yet cannot be paid. */
  blocked?: boolean
}

const BILLS: PayableBill[] = [
  {
    id: 'MR-INV-8844',
    metaKey: 'supplierPay.bill.approvedNotInRun',
    amount: 1884.225,
    discountRate: 0.02,
    discountNoteKey: 'supplierPay.bill.twoPercentBy6',
  },
  {
    id: 'MR-INV-8821',
    metaKey: 'supplierPay.bill.inDraftRun',
    metaValues: { run: 'PR-0014', due: '28 Aug' },
    inRun: true,
    amount: 2354.31,
    discountRate: 0.02,
    discountNoteKey: 'supplierPay.bill.twoPercentBy5',
  },
  {
    id: 'MR-INV-8790',
    metaKey: 'supplierPay.bill.inDraftRun',
    metaValues: { run: 'PR-0014', due: '2 Aug' },
    inRun: true,
    amount: 404.79,
    discountNoteKey: 'supplierPay.bill.windowPassed',
  },
  {
    id: 'MR-INV-8801',
    metaKey: 'supplierPay.bill.waitingApproval',
    metaValues: { who: 'Hafidh' },
    amount: 612.4,
    discountNoteKey: 'supplierPay.bill.chaseApproval',
    blocked: true,
  },
]

const CREDIT = { id: 'MR-CN-0118', amount: 242.5 }

const round3 = (value: number) => Math.round(value * 1000) / 1000

export function AddToPaymentRunModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const payable = BILLS.filter((bill) => !bill.blocked)
  const [selected, setSelected] = useState<string[]>(payable.map((bill) => bill.id))
  const [run, setRun] = useState<'existing' | 'own'>('existing')
  const [useCredit, setUseCredit] = useState(true)

  const totals = useMemo(() => {
    const chosen = BILLS.filter((bill) => selected.includes(bill.id))
    const gross = round3(chosen.reduce((sum, bill) => sum + bill.amount, 0))
    const discount = round3(
      chosen.reduce((sum, bill) => sum + bill.amount * (bill.discountRate ?? 0), 0),
    )
    const credit = useCredit ? CREDIT.amount : 0
    return { count: chosen.length, gross, discount, credit, net: round3(gross - discount - credit) }
  }, [selected, useCredit])

  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('supplierPay.title', { name: SUPPLIER_DETAIL.name })}
      width={680}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary">
            <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
            <span className="font-semibold text-text-primary tabular-nums">
              {formatOmr(totals.net)}
            </span>
            {t('supplierPay.footerNote', { date: SUPPLIER_DETAIL.paymentRunDate })}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierPay.cancel')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={totals.count === 0}
              className="inline-flex h-[42px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
            >
              <img src={tickIcon} alt="" className="size-4" />
              {run === 'existing'
                ? t('supplierPay.addToRun', { run: SUPPLIER_DETAIL.paymentRun })
                : t('supplierPay.startTheRun')}
            </button>
          </div>
        </div>
      }
    >
      {/* Which bills */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
          {t('supplierPay.whichBills')}
        </p>
        <button
          type="button"
          onClick={() => setSelected(payable.map((bill) => bill.id))}
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          {t('supplierPay.selectAll')}
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-2.5">
        {BILLS.map((bill) => {
          const checked = selected.includes(bill.id)
          return (
            <li key={bill.id}>
              <button
                type="button"
                disabled={bill.blocked}
                onClick={() => toggle(bill.id)}
                aria-pressed={checked}
                className={[
                  'flex w-full items-center gap-3 rounded-sm border p-4 text-start transition-colors',
                  bill.blocked
                    ? 'cursor-not-allowed border-border-subtle bg-surface-background/60'
                    : checked
                      ? 'border-primary-700 bg-primary-25'
                      : 'border-border-subtle bg-white hover:border-primary-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex size-5 shrink-0 items-center justify-center rounded-[4px] border',
                    bill.blocked
                      ? 'border-border-default bg-surface-background text-text-quaternary'
                      : checked
                        ? 'border-primary-700 bg-primary-700'
                        : 'border-border-default bg-white',
                  ].join(' ')}
                >
                  {bill.blocked ? (
                    <span className="text-xs font-semibold">×</span>
                  ) : checked ? (
                    <img src={tickIcon} alt="" className="size-3" />
                  ) : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={[
                      'block text-sm font-semibold leading-[1.3]',
                      bill.blocked ? 'text-text-quaternary' : 'text-text-primary',
                    ].join(' ')}
                  >
                    {bill.id}
                  </span>
                  <span
                    className={[
                      'mt-1 block text-xs font-medium leading-[1.4]',
                      bill.blocked
                        ? 'text-pending-500'
                        : bill.inRun
                          ? 'text-primary-700'
                          : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {t(bill.metaKey, bill.metaValues)}
                  </span>
                </span>

                <span className="shrink-0 text-end">
                  <span
                    className={[
                      'flex items-center justify-end gap-1 text-sm font-semibold tabular-nums',
                      bill.blocked ? 'text-text-quaternary' : 'text-text-primary',
                    ].join(' ')}
                  >
                    <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                    {formatOmr(bill.amount)}
                  </span>
                  <span className="mt-1 block whitespace-nowrap text-xs font-medium text-text-quaternary">
                    {t(bill.discountNoteKey)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Which run */}
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {t('supplierPay.whichRun')}
      </p>
      <div className="mt-3 flex flex-col gap-2.5" role="radiogroup">
        {[
          {
            id: 'existing' as const,
            title: t('supplierPay.addToDraft', { run: SUPPLIER_DETAIL.paymentRun }),
            note: t('supplierPay.addToDraftNote', {
              bills: 7,
              suppliers: 4,
              amount: formatOmr(6091.68),
              date: '3 August',
            }),
          },
          {
            id: 'own' as const,
            title: t('supplierPay.startOwn'),
            note: t('supplierPay.startOwnNote', { name: 'Muscat Roastery' }),
          },
        ].map((option) => {
          const active = run === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setRun(option.id)}
              className={[
                'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors',
                active
                  ? 'border-primary-700 bg-primary-25'
                  : 'border-border-subtle bg-white hover:border-primary-300',
              ].join(' ')}
            >
              <span
                className={[
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                  active ? 'border-primary-700' : 'border-border-default',
                ].join(' ')}
              >
                {active ? <span className="size-2.5 rounded-full bg-primary-700" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-[1.3] text-text-primary">
                  {option.title}
                </span>
                <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-quaternary">
                  {option.note}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Credit */}
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {t('supplierPay.creditTheyOwe')}
      </p>
      <div className="mt-3 flex items-center gap-4 rounded-sm bg-success-100 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-[1.3] text-[#2f4438]">
            {t('supplierPay.takeCreditOff', { id: CREDIT.id })}
          </p>
          <p className="mt-1 text-xs font-medium leading-[1.5] text-[#4f6857]">
            {t('supplierPay.takeCreditOffNote')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={useCredit}
          aria-label={t('supplierPay.takeCreditOff', { id: CREDIT.id })}
          onClick={() => setUseCredit((value) => !value)}
          className={[
            'relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors',
            useCredit ? 'bg-[#4c6c5a]' : 'bg-border-default',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-[3px] size-5 rounded-full bg-white transition-all',
              useCredit ? 'start-[23px]' : 'start-[3px]',
            ].join(' ')}
          />
        </button>
      </div>

      {/* Summary */}
      <dl className="mt-5 rounded-sm border border-border-subtle p-4">
        <SummaryRow
          label={t('supplierPay.nBills', { count: totals.count })}
          value={formatOmr(totals.gross)}
        />
        <SummaryRow
          label={t('supplierPay.earlyDiscount')}
          value={formatOmr(totals.discount)}
          negative
        />
        {useCredit ? (
          <SummaryRow
            label={t('supplierPay.creditNote', { id: CREDIT.id })}
            value={formatOmr(totals.credit)}
            negative
          />
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-4 border-t border-border-subtle pt-3.5">
          <dt className="text-base font-semibold text-text-primary">
            {t('supplierPay.oneTransfer', { bank: SUPPLIER_DETAIL.paying.bank })}
          </dt>
          <dd className="flex items-center gap-1.5 text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
            <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
            {formatOmr(totals.net)}
          </dd>
        </div>
      </dl>
    </Modal>
  )
}

function SummaryRow({
  label,
  value,
  negative,
}: {
  label: string
  value: string
  negative?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
        {negative ? '−' : null}
        <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
        {value}
      </dd>
    </div>
  )
}
