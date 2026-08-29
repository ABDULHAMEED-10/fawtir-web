import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/ui/Modal'
import { formatOmr } from '../../lib/suppliers'
import { SUPPLIER_DETAIL } from '../../lib/supplierDetail'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import stopIcon from '../../assets/suppliers/consequence-stop.svg'
import keepIcon from '../../assets/suppliers/consequence-keep.svg'

/**
 * "Switch off this supplier" (Figma 117:35355).
 *
 * Switching off is reversible and keeps the archive, so the dialog spends its space on the two
 * things that are genuinely lost and the two that are not — and on the loose ends that should
 * be tied off first.
 */

/** What switching off does: two things stop, two things carry on. */
const CONSEQUENCES = [
  { id: 'pickers', kind: 'stops' as const },
  { id: 'peppolHeld', kind: 'stops' as const },
  { id: 'searchable', kind: 'keeps' as const },
  { id: 'recordOpen', kind: 'keeps' as const },
]

const REASONS = ['stoppedTrading', 'closedDown', 'duplicate', 'movedSupplier', 'somethingElse']

const CREDIT = { id: 'MR-CN-0118', amount: 242.5 }

export function SwitchSupplierOffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState('')

  /** The loose ends: bills sitting in a run, and credit that has not been used. */
  const openIssues = 2

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('supplierOff.title', { name: SUPPLIER_DETAIL.name })}
      width={580}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-text-tertiary">
            <span className="font-semibold text-text-primary">{t('supplierOff.reversible')}</span>{' '}
            {t('supplierOff.reversibleNote')}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierOff.cancel')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[42px] items-center rounded-sm bg-pending-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-pending-700"
            >
              {t('supplierOff.confirm')}
            </button>
          </div>
        </div>
      }
    >
      {/* Loose ends */}
      <section className="rounded-sm border border-pending-200 bg-pending-100 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-pending-700">
          <img src={warnIcon} alt="" className="size-4" />
          {t('supplierOff.stillOpen', { count: openIssues })}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-pending-200 pt-3">
          <p className="text-sm font-medium text-text-tertiary">
            {t('supplierOff.bothInRun')}{' '}
            <span className="font-semibold text-text-primary">{SUPPLIER_DETAIL.paymentRun}</span>
          </p>
          <button
            type="button"
            className="inline-flex h-[36px] shrink-0 items-center rounded-sm bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
          >
            {t('supplierOff.openTheRun')}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-pending-200 pt-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary">
            {t('supplierOff.unusedCredit')}{' '}
            <span className="font-semibold text-text-primary">{CREDIT.id}</span> ·
            <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
            <span className="font-semibold text-text-primary tabular-nums">
              {formatOmr(CREDIT.amount)}
            </span>
          </p>
          <button
            type="button"
            className="inline-flex h-[36px] shrink-0 items-center rounded-sm bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
          >
            {t('supplierOff.useTheCredit')}
          </button>
        </div>
      </section>

      {/* What it does */}
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {t('supplierOff.whatItDoes')}
      </p>
      <ul className="mt-2 flex flex-col">
        {CONSEQUENCES.map((entry, index) => (
          <li
            key={entry.id}
            className={[
              'flex items-start gap-3 py-3.5',
              index < CONSEQUENCES.length - 1 ? 'border-b border-surface-background' : '',
            ].join(' ')}
          >
            <span
              className={[
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                entry.kind === 'stops' ? 'bg-warning-100' : 'bg-success-100',
              ].join(' ')}
            >
              <img src={entry.kind === 'stops' ? stopIcon : keepIcon} alt="" className="size-3" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                {t(`supplierOff.consequence.${entry.id}`, {
                  count: SUPPLIER_DETAIL.counts.bills,
                })}
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                {t(`supplierOff.consequence.${entry.id}Note`)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* Reason */}
      <p className="mt-5 text-sm font-medium text-text-secondary">{t('supplierOff.whyLabel')}</p>
      <div className="mt-2.5 flex flex-wrap gap-2.5">
        {REASONS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setReason(id)}
            className={[
              'inline-flex h-[40px] items-center rounded-sm border px-3.5 text-sm font-medium transition-colors',
              reason === id
                ? 'border-primary-700 bg-primary-25 text-primary-700'
                : 'border-border-subtle bg-white text-text-secondary hover:border-primary-300',
            ].join(' ')}
          >
            {t(`supplierOff.reason.${id}`)}
          </button>
        ))}
      </div>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t('supplierOff.notePlaceholder')}
        aria-label={t('supplierOff.notePlaceholder')}
        className="mt-3 h-[50px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary"
      />
    </Modal>
  )
}
