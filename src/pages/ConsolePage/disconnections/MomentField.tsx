import { useTranslation } from 'react-i18next'
import { DateField } from '../../../components/ui'
import { isClockTime, muscatToday } from '../../../lib/console/fawtirDisconnections'

/**
 * A day and an Oman clock time, for when something happened on the Fawtara Portal or the SMP, or
 * when the customer asked. Never later than today; the server refuses a moment in the future.
 * `future` lifts that for a date chosen ahead (a reconnection's effective date, manual 3.7), and
 * `noteKey` then names the hint to show instead.
 */
export function MomentField({
  id,
  label,
  day,
  time,
  onDay,
  onTime,
  disabled,
  future,
  noteKey,
}: {
  id: string
  label: string
  day: string
  time: string
  onDay: (value: string) => void
  onTime: (value: string) => void
  disabled?: boolean
  future?: boolean
  noteKey?: string
}) {
  const { t } = useTranslation()
  const timeWrong = time.trim() !== '' && !isClockTime(time.trim())
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-text-secondary">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField
          value={day}
          onChange={onDay}
          max={future ? undefined : muscatToday()}
          ariaLabel={t('console.disconnections.moment.day', { label })}
          disabled={disabled}
        />
        <input
          id={id}
          dir="ltr"
          inputMode="numeric"
          placeholder="14:30"
          aria-label={t('console.disconnections.moment.time', { label })}
          aria-invalid={timeWrong || undefined}
          className="h-[50px] rounded-sm border border-border-default bg-white px-4 text-sm"
          value={time}
          disabled={disabled}
          onChange={(event) => onTime(event.target.value)}
        />
      </div>
      <span className={`text-xs ${timeWrong ? 'text-danger-700' : 'text-text-tertiary'}`}>
        {t(
          timeWrong
            ? 'console.disconnections.moment.timeWrong'
            : (noteKey ?? 'console.disconnections.moment.note'),
        )}
      </span>
    </fieldset>
  )
}
