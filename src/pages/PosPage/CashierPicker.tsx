import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from '../../components/ui'
import { CASHIERS, type CashierId } from '../../lib/pos'
import chevron from '../../assets/dashboard/chevron.svg'

/**
 * Who is on the till (Figma 143:18015 — the picker beside the tabs).
 *
 * The app's own popover rather than a native `<select>`: a browser select paints the operating
 * system's list, which on a till screen looks like somebody else's software in the middle of ours.
 */
export function CashierPicker({
  value,
  onChange,
}: {
  value: CashierId
  onChange: (id: CashierId) => void
}) {
  const { t } = useTranslation()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const current = CASHIERS.find((cashier) => cashier.id === value) ?? CASHIERS[0]

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('pos.whoIsOnTill')}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-sm border border-border-subtle bg-surface-card ps-2 pe-3 transition-colors hover:border-primary-300"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-800">
          {current.initials}
        </span>
        <span className="text-sm font-semibold text-text-primary">{current.name}</span>
        <img
          src={chevron}
          alt=""
          className={['size-4 opacity-60 transition-transform', open ? '-rotate-90' : 'rotate-90'].join(' ')}
        />
      </button>

      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={200}>
        <ul role="listbox" className="py-1">
          {CASHIERS.map((cashier) => {
            const chosen = cashier.id === value
            return (
              <li key={cashier.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  onClick={() => {
                    onChange(cashier.id)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-primary-25"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-800">
                    {cashier.initials}
                  </span>
                  <span
                    className={[
                      'min-w-0 flex-1 truncate text-sm',
                      chosen ? 'font-semibold text-primary-800' : 'font-medium text-text-secondary',
                    ].join(' ')}
                  >
                    {cashier.name}
                  </span>
                  {chosen ? <span className="shrink-0 text-primary-700">✓</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </Popover>
    </>
  )
}
