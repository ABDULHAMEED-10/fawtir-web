import { useTranslation } from 'react-i18next'
import { statusLabelKey, type BillListItem, type BillStatusChip as Chip } from '../../lib/billList'

const STATUS_STYLES: Record<Chip, { bg: string; fg: string; dot: string }> = {
  newNotReviewed: { bg: 'bg-primary-50', fg: 'text-primary-900', dot: 'bg-primary-900' },
  mismatch: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  awaitingApproval: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  draft: { bg: 'bg-[#e3e4ea]', fg: 'text-[#474a5e]', dot: 'bg-[#474a5e]' },
  onHold: { bg: 'bg-danger-100', fg: 'text-[#7a1009]', dot: 'bg-[#7a1009]' },
  approved: { bg: 'bg-success-100', fg: 'text-success-700', dot: 'bg-success-700' },
  rejected: { bg: 'bg-danger-100', fg: 'text-[#7a1009]', dot: 'bg-[#7a1009]' },
  inPaymentRun: { bg: 'bg-primary-50', fg: 'text-primary-900', dot: 'bg-primary-900' },
  paid: { bg: 'bg-success-100', fg: 'text-success-700', dot: 'bg-success-700' },
}

/** The workflow state pill, shared by the Bills list and a bill's own page so they never disagree. */
export function BillStatusChip({ item, className = '' }: { item: Pick<BillListItem, 'status' | 'statusValues'>; className?: string }) {
  const { t } = useTranslation()
  const style = STATUS_STYLES[item.status]
  return (
    <span
      className={['inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold leading-[1.2]', style.bg, style.fg, className].join(' ')}
    >
      <span className={['size-1.5 rounded-full', style.dot].join(' ')} />
      {t(statusLabelKey(item as BillListItem), item.statusValues)}
    </span>
  )
}
