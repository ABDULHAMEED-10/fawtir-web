import { useTranslation } from 'react-i18next'
import { Rial } from '../../components/ui'
import type { ProductHistoryChange } from '../../api/catalog/insights'
import { historyValue } from '../../lib/catalogInsights'
import { useHistoryWords } from './itemHistoryWords'

/**
 * One value of a change, as the API gave it: only put in three-decimal money, a percent or the
 * house's words for a code. No sentence is made up around it.
 */
export function HistoryValueText({ field, raw }: { field: string; raw: string }) {
  const { t } = useTranslation()
  const value = historyValue(field, raw)
  if (value.kind === 'money') {
    return (
      <span className="tabular-nums" dir="ltr">
        <Rial /> {value.value}
      </span>
    )
  }
  if (value.kind === 'percent') return <span className="tabular-nums">{value.value}%</span>
  if (value.kind === 'key') return <>{t(value.key, { defaultValue: value.fallback })}</>
  return <bdi>{value.value}</bdi>
}

const CHIP = {
  was: 'bg-danger-100 text-danger-700',
  now: 'bg-success-100 text-[#3d5648]',
  plain: 'bg-surface-background text-text-tertiary',
}

/**
 * A change as chips: the field (and its branch), the old value in red and the new one in green.
 * A value that was empty on one side shows only the other.
 */
export function ChangeChips({
  change,
  created,
}: {
  change: ProductHistoryChange
  created?: boolean
}) {
  const { field } = useHistoryWords()
  const chip = (tone: keyof typeof CHIP, raw: string) => (
    <span
      className={[
        'inline-flex min-h-9 max-w-full items-center break-all rounded-[3px] px-3 py-1 text-sm font-medium',
        CHIP[tone],
      ].join(' ')}
    >
      <HistoryValueText field={change.field} raw={raw} />
    </span>
  )
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-text-tertiary">
        {field(change)}
        {change.branchName ? (
          <>
            {' · '}
            <bdi>{change.branchName}</bdi>
          </>
        ) : null}
      </span>
      {change.from !== null ? chip(created ? 'plain' : 'was', change.from) : null}
      {change.from !== null && change.to !== null ? (
        <span className="text-text-quaternary rtl:rotate-180">›</span>
      ) : null}
      {change.to !== null ? chip(created ? 'plain' : 'now', change.to) : null}
    </span>
  )
}
