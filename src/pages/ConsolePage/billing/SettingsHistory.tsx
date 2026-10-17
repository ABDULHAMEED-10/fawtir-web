import { useTranslation } from 'react-i18next'
import { CONSOLE_CARD } from '../../../layouts/ConsoleShell/consoleStyle'
import { formatInstant } from '../../../lib/format'
import { peekEntitlements } from '../../../lib/identity/entitlements'

export type SettingsHistoryEntry = {
  id: string
  /** What the version set, already in words. */
  title: string
  reason: string
  createdBy: string | null
  createdAt: string
}

/**
 * Earlier versions of a console setting, newest first: what each set, why, when and who. The
 * seller page's history list, for any versioned setting. Only the operator's id is recorded, so
 * it is shown as recorded (or "you"), never guessed at.
 */
export function SettingsHistory({
  id,
  title,
  entries,
}: {
  id: string
  title: string
  entries: SettingsHistoryEntry[]
}) {
  const { t, i18n } = useTranslation()
  const me = peekEntitlements()?.userId ?? null
  if (entries.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-base font-semibold text-text-primary">
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li key={entry.id} className={`${CONSOLE_CARD} flex flex-col gap-1 p-4`}>
            <span className="text-sm font-semibold text-text-primary">{entry.title}</span>
            <span className="text-xs font-medium text-text-tertiary">
              {entry.reason} · {formatInstant(entry.createdAt, i18n.language)}
            </span>
            <span className="text-xs font-medium text-text-quaternary">
              {t('console.plans.history.by')}{' '}
              {entry.createdBy === null ? (
                t('console.plans.history.system')
              ) : entry.createdBy === me ? (
                t('console.plans.history.you')
              ) : (
                <bdi dir="ltr" className="font-mono text-[11px]">
                  {entry.createdBy}
                </bdi>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
