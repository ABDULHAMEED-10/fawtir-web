import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { formatInstant } from '../../../lib/format'

/** A deadline in a queue row, with "Overdue" once it has passed; the plan sets none for some steps. */
export function Due({ dueAt, overdue }: { dueAt: string | null; overdue: boolean }) {
  const { t, i18n } = useTranslation()
  if (!dueAt)
    return <span className="text-text-tertiary">{t('console.disconnections.noDeadline')}</span>
  return (
    <span className="flex flex-wrap items-center gap-2 text-text-secondary">
      {formatInstant(dueAt, i18n.language)}
      {overdue ? (
        <ConsoleStatusPill tone="danger" label={t('console.disconnections.overdue')} />
      ) : null}
    </span>
  )
}

/** One labelled fact of a request; an empty one reads "Not yet". */
export function Fact({
  label,
  value,
  note,
}: {
  label: string
  value: ReactNode | null
  note?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-[0.6px] text-text-muted">{label}</dt>
      <dd className="break-words text-sm font-semibold text-text-primary">
        {value ?? (
          <span className="font-medium text-text-tertiary">
            {t('console.disconnections.notYet')}
          </span>
        )}
      </dd>
      {note ? <dd className="text-xs font-medium text-text-tertiary">{note}</dd> : null}
    </div>
  )
}

/**
 * Who recorded a step: the actor type, and the staff member's name when the server kept it
 * (Business Rules OP-3: who did it, when and why). Older steps carry no name.
 */
export function stepActor(
  t: (key: string, options?: Record<string, unknown>) => string,
  step: { actorType: 'CUSTOMER' | 'OPERATOR' | 'SYSTEM'; actorName?: string | null },
): string {
  const type = t(`console.disconnections.actor.${step.actorType}`)
  return step.actorName ? `${type} · ${step.actorName}` : type
}

/** On an SMP step support recorded instead of the console's call: what kind, and how they knew. */
export function SmpRecordLine({
  step,
}: {
  step: { smpChannel?: string | null; smpRecordKind?: string | null }
}) {
  const { t } = useTranslation()
  if (!step.smpChannel || !step.smpRecordKind) return null
  return (
    <span className="text-xs text-text-secondary">
      {t(`console.smpCall.history.${step.smpRecordKind}`, {
        channel: t(`console.smpCall.record.channelOption.${step.smpChannel}`),
      })}
    </span>
  )
}
