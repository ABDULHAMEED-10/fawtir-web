import { useMemo, useRef, useState } from 'react'
import { Popover } from './Popover'
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  formatDisplayDate,
  parseDateKey,
  toDateKey,
} from '../../lib/dates'
import calendarIcon from '../../assets/create-invoice/calendar.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'

/**
 * Date field with a custom calendar.
 *
 * The native picker looks different in every browser and cannot be styled, so the field opens
 * its own month grid instead. Dates are handled as local `yyyy-mm-dd` strings throughout —
 * `toISOString()` converts to UTC and silently loses a day east of Greenwich, which is exactly
 * wrong for Muscat.
 */

export function DateField({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  highlighted,
  disabled,
  placeholder,
}: {
  /** Local `yyyy-mm-dd`. */
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  min?: string
  max?: string
  highlighted?: boolean
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = parseDateKey(value)
  const [cursor, setCursor] = useState(() => selected ?? new Date())

  const grid = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const first = new Date(year, month, 1)
    const start = new Date(first)
    start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start)
      day.setDate(start.getDate() + i)
      return day
    })
  }, [cursor])

  const todayKey = toDateKey(new Date())
  const outOfRange = (key: string) => (min && key < min) || (max && key > max)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setCursor(selected ?? new Date())
          setOpen((v) => !v)
        }}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={[
          'flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-primary-300 px-4 text-start transition-colors',
          highlighted ? 'bg-primary-25' : 'bg-surface-tab-bar',
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-primary-500',
        ].join(' ')}
      >
        <span
          className={[
            'text-sm font-medium',
            value ? 'text-text-secondary' : 'text-text-placeholder',
          ].join(' ')}
        >
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <img src={calendarIcon} alt="" aria-hidden="true" className="size-6 shrink-0" />
      </button>

      <Popover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} width={300}>
        <div className="p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="flex size-8 items-center justify-center rounded-sm hover:bg-primary-25"
            >
              <img src={chevronIcon} alt="" className="size-5 rotate-180" />
            </button>
            <span className="text-sm font-semibold text-text-primary">
              {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="flex size-8 items-center justify-center rounded-sm hover:bg-primary-25"
            >
              <img src={chevronIcon} alt="" className="size-5" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {WEEKDAY_NAMES.map((day) => (
              <span
                key={day}
                className="flex h-7 items-center justify-center text-[11px] font-semibold uppercase text-text-quaternary"
              >
                {day}
              </span>
            ))}
            {grid.map((day) => {
              const key = toDateKey(day)
              const inMonth = day.getMonth() === cursor.getMonth()
              const isSelected = key === value
              const isToday = key === todayKey
              const blocked = Boolean(outOfRange(key))
              return (
                <button
                  key={key}
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    onChange(key)
                    setOpen(false)
                  }}
                  className={[
                    'flex h-8 items-center justify-center rounded-sm text-sm transition-colors',
                    isSelected
                      ? 'bg-primary-700 font-semibold text-white'
                      : inMonth
                        ? 'font-medium text-text-secondary hover:bg-primary-25'
                        : 'font-medium text-text-quaternary/60 hover:bg-primary-25',
                    blocked ? 'cursor-not-allowed opacity-30 hover:bg-transparent' : '',
                    !isSelected && isToday ? 'ring-1 ring-inset ring-primary-300' : '',
                  ].join(' ')}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
            <button
              type="button"
              onClick={() => {
                if (!outOfRange(todayKey)) {
                  onChange(todayKey)
                  setOpen(false)
                }
              }}
              className="text-sm font-semibold text-primary-800 hover:underline"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className="text-sm font-medium text-text-tertiary hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
      </Popover>
    </>
  )
}
