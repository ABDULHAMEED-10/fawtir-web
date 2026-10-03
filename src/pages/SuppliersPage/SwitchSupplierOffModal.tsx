import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Modal, OmAmount } from '../../components/ui'
import { formatAmount } from '../../lib/format'
import warnIcon from '../../assets/bills/match-warn.svg'
import stopIcon from '../../assets/suppliers/consequence-stop.svg'
import keepIcon from '../../assets/suppliers/consequence-keep.svg'

/**
 * "Switch off {supplier}" (Figma 163:29066), opened from the row menu and the edit page's menu.
 *
 * Switching off is reversible and keeps the archive, so the dialog spends its space on the two
 * things that stop and the two that carry on, and on the loose ends worth tying off first. The
 * loose ends the frame lists (a draft payment run, an unused credit note) are not on the list row;
 * what is there, the open bills and what they come to, is drawn in their place.
 *
 * The reason and the note are asked as the frame asks them and go with the call
 * (`switchOffRequest` in `lib/supplierList`): `POST /suppliers/{id}/switch-off` keeps them with the record.
 */

export type SwitchOffTarget = {
  id: string
  name: string
  openBills: number
  owed: number
  currency: string
}

/** What switching off does: two things stop, two things carry on. */
const CONSEQUENCES = [
  { id: 'pickers', kind: 'stops' as const },
  { id: 'peppolHeld', kind: 'stops' as const },
  { id: 'searchable', kind: 'keeps' as const },
  { id: 'recordOpen', kind: 'keeps' as const },
]

export const SWITCH_OFF_REASONS = [
  'stoppedTrading',
  'closedDown',
  'duplicate',
  'movedSupplier',
  'somethingElse',
] as const

export type SwitchOffReason = (typeof SWITCH_OFF_REASONS)[number]

export function SwitchSupplierOffModal({
  target,
  busy,
  onClose,
  onConfirm,
}: {
  target: SwitchOffTarget | null
  busy: boolean
  onClose: () => void
  onConfirm: (target: SwitchOffTarget, reason: SwitchOffReason, note: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [reason, setReason] = useState<SwitchOffReason>('stoppedTrading')
  const [note, setNote] = useState('')

  if (!target) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={t('supplierOff.title', { name: target.name })}
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
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierOff.cancel')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onConfirm(target, reason, note)}
              className="inline-flex h-[46px] items-center rounded-sm bg-pending-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-pending-700 disabled:opacity-60"
            >
              {busy ? t('common.saving') : t('supplierOff.confirm')}
            </button>
          </div>
        </div>
      }
    >
      {target.openBills > 0 ? (
        <section className="rounded-sm border border-pending-200 bg-pending-100 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-pending-700">
            <img src={warnIcon} alt="" className="size-4" />
            {t('supplierOff.stillOpen', { count: target.openBills })}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-pending-200 pt-3">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-text-tertiary">
              {t('supplierOff.openBills', { count: target.openBills })}
              <OmAmount
                size="xs"
                amount={formatAmount(target.owed, target.currency, i18n.language)}
                amountClassName="text-sm font-semibold text-text-primary tabular-nums"
              />
            </p>
            {/* TODO(backend): the draft payment run and unused credit notes the frame lists here. */}
            <Link
              to={`/suppliers/${target.id}`}
              className="inline-flex h-[36px] shrink-0 items-center rounded-sm bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
            >
              {t('supplierOff.openRecord')}
            </Link>
          </div>
        </section>
      ) : null}

      <p
        className={[
          'text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary',
          target.openBills > 0 ? 'mt-5' : '',
        ].join(' ')}
      >
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
                {t(`supplierOff.consequence.${entry.id}`)}
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                {t(`supplierOff.consequence.${entry.id}Note`)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-sm font-medium text-text-secondary">{t('supplierOff.whyLabel')}</p>
      <div className="mt-2.5 flex flex-wrap gap-2.5">
        {SWITCH_OFF_REASONS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={reason === id}
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
        maxLength={500}
        placeholder={t('supplierOff.notePlaceholder')}
        aria-label={t('supplierOff.notePlaceholder')}
        className="mt-3 h-[50px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-700"
      />
    </Modal>
  )
}
