import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import menuIcon from '../../assets/invoices/menu.svg'

export type ActionMenuItem = {
  id: string
  labelKey: string
  /** Imported SVG exported from the Figma Actions frame. */
  icon: string
  /** Renders in danger red and is separated by a divider, as in Figma. */
  danger?: boolean
  to?: string
  onSelect?: () => void
}

type ActionMenuProps = {
  items: ActionMenuItem[]
  /** Accessible name for the trigger, e.g. "Row actions". */
  label: string
  /** Opens towards the start edge instead of the end edge. */
  alignStart?: boolean
  /** `row` is the 24px table trigger; `bordered` matches the 46px header buttons. */
  variant?: 'row' | 'bordered'
}

/**
 * Row overflow menu — the "Actions" popup from Figma (158px, 16px padding,
 * 38px item pitch, divider above the destructive item).
 */
export function ActionMenu({
  items,
  label,
  alignStart = false,
  variant = 'row',
}: ActionMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const itemClass = (danger?: boolean) =>
    [
      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm font-medium leading-[1.2] transition-colors',
      danger ? 'text-danger-700 hover:bg-danger-100' : 'text-text-secondary hover:bg-primary-25',
    ].join(' ')

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((v) => !v)
        }}
        className={
          variant === 'bordered'
            ? 'inline-flex size-[46px] items-center justify-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] transition-colors hover:bg-white'
            : 'inline-flex size-6 items-center justify-center rounded-sm hover:bg-neutral-25'
        }
      >
        <img src={menuIcon} alt="" className="size-6" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={[
            'absolute z-30 mt-1 w-[172px] rounded-sm bg-surface-card p-2 shadow-elevated',
            alignStart ? 'start-0' : 'end-0',
          ].join(' ')}
        >
          {items.map((item) => {
            const content = (
              <>
                <img src={item.icon} alt="" className="size-[18px] shrink-0" />
                {t(item.labelKey)}
              </>
            )

            return (
              <div key={item.id} role="none">
                {item.danger ? <div className="my-2 h-px bg-[#e3e4ea]" role="none" /> : null}
                {item.to ? (
                  <Link
                    to={item.to}
                    role="menuitem"
                    className={itemClass(item.danger)}
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpen(false)
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className={itemClass(item.danger)}
                    onClick={(event) => {
                      event.stopPropagation()
                      item.onSelect?.()
                      setOpen(false)
                    }}
                  >
                    {content}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
