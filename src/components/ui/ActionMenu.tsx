import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import menuIcon from '../../assets/invoices/menu.svg'

export type ActionMenuItem = {
  id: string
  labelKey: string
  /** Imported SVG exported from the Figma Actions frame. */
  icon: string
  /**
   * A second line under the label, saying what the item does.
   *
   * The supplier row menu (Figma 117:35273) explains every action; the compact row menus
   * elsewhere have labels only, so this widens the item rather than replacing it.
   */
  descriptionKey?: string
  /** Values interpolated into the label and description. */
  values?: Record<string, string | number>
  /** Renders in danger red and is separated by a divider, as in Figma. */
  danger?: boolean
  /** Starts a new titled group above this item. */
  sectionKey?: string
  /**
   * A muted value pinned to the far edge — a count, a prefix, a consequence.
   *
   * The Settings row menus (Figma 135:42802, 135:42866) answer "how many?" on the item itself
   * rather than making the reader open the screen to find out.
   */
  hintKey?: string
  hint?: string
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
  /** Widens the panel for items that carry a description. */
  wide?: boolean
  /** `md` is the 272px Settings panel; `wide` stays the 296px described-item panel. */
  size?: 'sm' | 'md'
  /**
   * Renders the panel into `document.body` at fixed coordinates, flipping above the trigger when
   * there is no room below. For rows of a short table: `RowsView` scrolls horizontally, and that
   * container clips an absolutely positioned panel, so the last row's menu was cut off. Opt-in,
   * because every other menu sits in a table long enough not to need it.
   */
  floating?: boolean
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
  wide = false,
  size = 'sm',
  floating = false,
}: ActionMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)
  const menuId = useId()

  useLayoutEffect(() => {
    if (!open || !floating) return
    const position = () => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) return
      const rect = trigger.getBoundingClientRect()
      const gap = 4
      // `end` is the right edge in a left-to-right page and the left edge in Arabic.
      const toRight = !alignStart !== (getComputedStyle(trigger).direction === 'rtl')
      const left = toRight ? rect.right - panel.offsetWidth : rect.left
      const below = window.innerHeight - rect.bottom - gap
      const flip = below < panel.offsetHeight && rect.top - gap > below
      setPlace({
        top: flip ? Math.max(gap, rect.top - gap - panel.offsetHeight) : rect.bottom + gap,
        left: Math.min(Math.max(gap, left), window.innerWidth - panel.offsetWidth - gap),
      })
    }
    position()
    // `true` catches scrolls inside any ancestor — the table itself scrolls sideways.
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [open, floating, alignStart])

  // A panel in the body is no longer next to its trigger in the tab order, so focus is taken to
  // it on opening, and handed back to the trigger when it closes from the keyboard.
  useEffect(() => {
    if (!open || !floating) return
    // A frame later: until it has been placed the panel is hidden, and a hidden element takes no focus.
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open, floating])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      if (floating) triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, floating])

  // Tabbing out of a floating panel returns to the trigger, whose own Tab then moves on as it
  // would have: the panel is at the end of the body, not after the trigger.
  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!floating || event.key !== 'Tab') return
    setOpen(false)
    triggerRef.current?.focus()
  }

  const itemClass = (danger?: boolean) =>
    [
      'flex w-full rounded-sm px-2 text-start font-medium transition-colors',
      wide ? 'items-start gap-2.5 py-2' : 'items-center gap-2 py-1.5 text-sm leading-[1.2]',
      danger ? 'text-danger-700 hover:bg-danger-100' : 'text-text-secondary hover:bg-primary-25',
    ].join(' ')

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
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
        <FloatingOr floating={floating}>
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            onKeyDown={onPanelKeyDown}
            style={
              floating
                ? { position: 'fixed', top: place?.top ?? -9999, left: place?.left ?? -9999, visibility: place ? 'visible' : 'hidden' }
                : undefined
            }
            className={[
              'rounded-sm bg-surface-card p-2 shadow-elevated',
              floating ? 'z-[60]' : ['absolute z-30 mt-1', alignStart ? 'start-0' : 'end-0'].join(' '),
              wide ? 'w-[296px]' : size === 'md' ? 'w-[272px]' : 'w-[172px]',
            ].join(' ')}
          >
            {items.map((item, index) => {
              const content = (
                <>
                  <img
                    src={item.icon}
                    alt=""
                    className={wide ? 'mt-0.5 size-[18px] shrink-0' : 'size-[18px] shrink-0'}
                  />
                  {item.descriptionKey ? (
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-[1.3]">
                        {t(item.labelKey, item.values)}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium leading-[1.4] text-text-quaternary">
                        {t(item.descriptionKey, item.values)}
                      </span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 text-start">{t(item.labelKey, item.values)}</span>
                  )}
                  {item.hint || item.hintKey ? (
                    <span className="shrink-0 text-xs font-medium text-text-quaternary">
                      {item.hint ?? t(item.hintKey as string, item.values)}
                    </span>
                  ) : null}
                </>
              )

              return (
                <div key={item.id} role="none">
                  {item.sectionKey ? (
                    <>
                      {index > 0 ? <div className="my-2 h-px bg-[#e3e4ea]" role="none" /> : null}
                      <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
                        {t(item.sectionKey)}
                      </p>
                    </>
                  ) : null}
                  {item.danger && !item.sectionKey ? (
                    <div className="my-2 h-px bg-[#e3e4ea]" role="none" />
                  ) : null}
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
        </FloatingOr>
      ) : null}
    </div>
  )
}

/** The panel where it is drawn, or — for a floating menu — in the body, out of every clipping ancestor. */
function FloatingOr({ floating, children }: { floating: boolean; children: ReactNode }) {
  return floating ? createPortal(children, document.body) : <>{children}</>
}
