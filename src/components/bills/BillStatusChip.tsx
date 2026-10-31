import { useTranslation } from 'react-i18next'
import { statusLabelKey, type BillListItem, type BillStatusChip as Chip } from '../../lib/billList'
import { CREDIT_STATUS_CHIP, type CreditChipTone } from '../../lib/supplierNoteList'

type Style = { bg: string; fg: string; dot: string }

const STATUS_STYLES: Record<Exclude<Chip, 'creditNote'>, Style> = {
  newNotReviewed: { bg: 'bg-primary-50', fg: 'text-primary-900', dot: 'bg-primary-900' },
  mismatch: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  awaitingApproval: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  draft: { bg: 'bg-[#e3e4ea]', fg: 'text-[#474a5e]', dot: 'bg-[#474a5e]' },
  onHold: { bg: 'bg-danger-100', fg: 'text-[#7a1009]', dot: 'bg-[#7a1009]' },
  approved: { bg: 'bg-success-100', fg: 'text-success-700', dot: 'bg-success-700' },
  rejected: { bg: 'bg-danger-100', fg: 'text-[#7a1009]', dot: 'bg-[#7a1009]' },
  inPaymentRun: { bg: 'bg-primary-50', fg: 'text-primary-900', dot: 'bg-primary-900' },
  paid: { bg: 'bg-success-100', fg: 'text-success-700', dot: 'bg-success-700' },
  settledByCredit: { bg: 'bg-success-100', fg: 'text-success-700', dot: 'bg-success-700' },
  partPaid: { bg: 'bg-success-100', fg: 'text-success-700', dot: 'bg-success-700' },
  refusedClosed: { bg: 'bg-danger-100', fg: 'text-[#7a1009]', dot: 'bg-[#7a1009]' },
  // A held copy wears the hold's own tone, decided or not: both are held, neither is payable.
  suspectedDuplicate: { bg: 'bg-danger-100', fg: 'text-[#7a1009]', dot: 'bg-[#7a1009]' },
  confirmedDuplicate: { bg: 'bg-danger-100', fg: 'text-[#7a1009]', dot: 'bg-[#7a1009]' },
}

/** A credit note's chip, in the Credit notes list's tones so the two lists look alike. */
const CREDIT_STYLES: Record<CreditChipTone, Style> = {
  usable: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  waiting: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  done: { bg: 'bg-success-100', fg: 'text-[#3d5648]', dot: 'bg-[#3d5648]' },
  refunded: { bg: 'bg-primary-50', fg: 'text-primary-800', dot: 'bg-primary-800' },
}

/** The workflow state pill, shared by the Bills list and a bill's own page so they never disagree. */
export function BillStatusChip({ item, className = '' }: { item: Pick<BillListItem, 'status' | 'statusValues' | 'credit'>; className?: string }) {
  const { t } = useTranslation()
  // A credit note from a server that does not say where its credit stands shows no chip.
  if (item.status === 'creditNote' && !item.credit) return null
  const style =
    item.status === 'creditNote' && item.credit
      ? CREDIT_STYLES[CREDIT_STATUS_CHIP[item.credit]]
      : STATUS_STYLES[item.status as Exclude<Chip, 'creditNote'>]
  return (
    <span
      className={['inline-flex items-center gap-2 rounded-sm px-3 py-1 text-sm font-semibold leading-[1.2]', style.bg, style.fg, className].join(' ')}
    >
      <span className={['size-1.5 rounded-full', style.dot].join(' ')} />
      {t(statusLabelKey(item), item.statusValues)}
    </span>
  )
}
