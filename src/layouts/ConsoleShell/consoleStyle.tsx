import { isValidElement, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { CONSOLE_TONE_TEXT, CONSOLE_TONE_TINT, type ConsoleTone } from './consoleTones'

/**
 * The console's drawing vocabulary, named once from the "Super Admin -> Operations" and
 * "Super Admin -> Tenants" frames (Figma 154:111761, 154:112167): page header, buttons, cards,
 * KPI tiles, tabs and tables. Every console screen draws from these so sibling screens match.
 * Styling only: nothing here reads or sends data.
 */

/* -------------------------------------------------------------------- page */

/** The column every console screen sits in: 20 px between header, KPI row and card rows. */
export const CONSOLE_PAGE = 'mx-auto flex w-full max-w-[1144px] flex-col gap-5 pb-10'
export const CONSOLE_H1 =
  'break-words text-[27px] font-semibold leading-[1.2] tracking-[-0.49px] text-text-primary'
export const CONSOLE_SUBTITLE = 'mt-2 text-sm font-medium leading-[1.4] text-text-placeholder'
/** A screen inside Settings: its title and subtitle as the tenant Settings screens draw them. */
export const CONSOLE_SECTION_H2 = 'break-words text-2xl font-medium leading-[1.2] text-text-primary'
/** One part of a Settings screen that holds several (Fawtir company details). */
export const CONSOLE_SUBSECTION_H3 = 'break-words text-lg font-semibold leading-[1.3] text-text-primary'
export const CONSOLE_SECTION_SUBTITLE = 'mt-1 max-w-[720px] text-sm font-medium leading-[1.4] text-[#8f8f8f]'
/** Two or more cards side by side or stacked: 20 px between columns. */
export const CONSOLE_ROW = 'flex flex-wrap items-start gap-5'

/**
 * The title block every console screen opens with, under its breadcrumbs: a 27 px title, the
 * subtitle 8 px under it, and the actions on the right.
 */
export function ConsolePageHeader({
  title,
  subtitle,
  actions,
  aside,
  lead,
  below,
  titleClassName = '',
  subtitleClassName = '',
  actionsClassName = '',
  level = 'page',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Pills drawn beside the title. */
  aside?: ReactNode
  /** An avatar before the title block. */
  lead?: ReactNode
  /** Anything under the subtitle (a pill row, a code). */
  below?: ReactNode
  titleClassName?: string
  subtitleClassName?: string
  actionsClassName?: string
  /**
   * `section`: a screen inside Settings, under the frame's "Settings" title — an h2 at the tenant
   * Settings screens' size (`SettingsHeader`) rather than the page's own 27 px title.
   */
  level?: 'page' | 'section' | 'subsection'
}) {
  const heading =
    level === 'subsection' ? (
      <h3 className={[CONSOLE_SUBSECTION_H3, titleClassName].join(' ')}>{title}</h3>
    ) : level === 'section' ? (
      <h2 className={[CONSOLE_SECTION_H2, titleClassName].join(' ')}>{title}</h2>
    ) : (
      <h1 className={[CONSOLE_H1, titleClassName].join(' ')}>{title}</h1>
    )
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        {lead}
        <div className="min-w-0">
          {aside ? (
            <div className="flex flex-wrap items-center gap-2.5">
              {heading}
              {aside}
            </div>
          ) : (
            heading
          )}
          {subtitle ? (
            <p
              className={[
                level === 'page' ? CONSOLE_SUBTITLE : CONSOLE_SECTION_SUBTITLE,
                subtitleClassName,
              ].join(' ')}
            >
              {subtitle}
            </p>
          ) : null}
          {below}
        </div>
      </div>
      {actions ? (
        <div
          className={[
            'flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink',
            actionsClassName,
          ].join(' ')}
        >
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------- buttons */

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm text-center transition-colors disabled:cursor-not-allowed'

/** Primary: 42 px, primary-700, 14.5 px semibold white. */
export const CONSOLE_PRIMARY = `${BUTTON_BASE} min-h-[42px] bg-primary-700 px-5 text-[14.5px] font-semibold text-white hover:bg-primary-800 disabled:bg-primary-200`
/** Secondary: white with the default border, 14.5 px medium. */
export const CONSOLE_SECONDARY = `${BUTTON_BASE} min-h-[42px] border border-border-default bg-white px-5 text-[14.5px] font-medium text-[#494d56] hover:bg-primary-25 disabled:opacity-50`
/** A secondary action that removes or refuses something. */
export const CONSOLE_DANGER = `${BUTTON_BASE} min-h-[42px] border border-border-default bg-white px-5 text-[14.5px] font-medium text-danger-700 hover:bg-danger-100 disabled:opacity-50`
/** Small: 34 px, 13 px medium, for row and card actions. */
export const CONSOLE_SMALL = `${BUTTON_BASE} min-h-[34px] border border-border-default bg-white px-3 text-[13px] font-medium text-text-muted hover:bg-primary-25 hover:text-text-secondary disabled:opacity-50`
/** A small action that moves the work on (Approve, Open). */
export const CONSOLE_SMALL_PRIMARY = `${BUTTON_BASE} min-h-[34px] bg-primary-700 px-3 text-[13px] font-semibold text-white hover:bg-primary-800 disabled:bg-primary-200`
/** A small action that removes or refuses something. */
export const CONSOLE_SMALL_DANGER = `${BUTTON_BASE} min-h-[34px] border border-border-default bg-white px-3 text-[13px] font-medium text-danger-700 hover:bg-danger-100 disabled:opacity-50`
/** Text link: 13 px semibold primary-700. */
export const CONSOLE_LINK =
  'text-[13px] font-semibold text-primary-700 transition-colors hover:text-primary-800 disabled:cursor-not-allowed disabled:text-text-quaternary'

const BUTTON_VARIANT = {
  primary: CONSOLE_PRIMARY,
  secondary: CONSOLE_SECONDARY,
  danger: CONSOLE_DANGER,
  small: CONSOLE_SMALL,
  smallPrimary: CONSOLE_SMALL_PRIMARY,
  ghost: `${BUTTON_BASE} min-h-[42px] px-3 text-[14.5px] font-semibold text-primary-700 hover:bg-primary-25`,
} as const

/** A console button. Same props as the shared `Button`; `size` is accepted and ignored. */
export function ConsoleButton({
  variant = 'primary',
  // Accepted so the shared Button's props carry over; every console button has one height.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size: _size,
  fullWidth = false,
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANT
  size?: 'md' | 'lg'
  fullWidth?: boolean
  children: ReactNode
}) {
  return (
    <button
      type={type}
      className={[
        BUTTON_VARIANT[variant],
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-brand',
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------- cards */

/** White, radius 4, no shadow. */
export const CONSOLE_CARD = 'rounded-sm bg-surface-card'
export const CONSOLE_CARD_HEAD =
  'flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4'
export const CONSOLE_CARD_TITLE = 'text-base font-semibold leading-[1.2] text-text-primary'
export const CONSOLE_CARD_NOTE = 'mt-1 text-[12.5px] font-medium leading-[1.4] text-text-muted'
/** The footer note strip: the story under a card, its key phrase in semibold. */
export const CONSOLE_CARD_FOOT =
  'border-t border-border-subtle bg-surface-tab-bar px-5 py-3.5 text-[12.5px] font-medium leading-[1.6] text-text-tertiary'

/** A card's header strip: title, optional note under it, optional action on the right. */
export function ConsoleCardHead({
  title,
  note,
  action,
}: {
  title: ReactNode
  note?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={CONSOLE_CARD_HEAD}>
      <div className="min-w-0">
        <h2 className={CONSOLE_CARD_TITLE}>{title}</h2>
        {note ? <p className={CONSOLE_CARD_NOTE}>{note}</p> : null}
      </div>
      {action}
    </div>
  )
}

/* -------------------------------------------------------------------- KPIs */

/** The icon tile follows the icon's own colour, so a green tick sits on green. */
function tintOf(icon: ReactNode): ConsoleTone | undefined {
  if (!isValidElement<{ className?: string }>(icon)) return undefined
  const cls = icon.props.className ?? ''
  if (cls.includes('text-success')) return 'good'
  if (cls.includes('text-pending')) return 'watch'
  if (cls.includes('text-danger')) return 'bad'
  if (cls.includes('text-primary')) return 'info'
  return undefined
}

/**
 * A KPI tile: a 30 px icon tile on its tone's tint, the label, the figure in its tone, and a
 * note 9 px under it.
 */
export function ConsoleKpi({
  icon,
  title,
  value,
  suffix,
  note,
  tone = 'calm',
  tint,
}: {
  icon: ReactNode
  title: string
  value: ReactNode
  suffix?: string
  note: ReactNode
  tone?: ConsoleTone
  /** The icon tile's tint when it should differ from the figure's tone. */
  tint?: ConsoleTone
}) {
  return (
    <article className="flex min-w-[240px] flex-1 flex-col rounded-sm bg-surface-card p-5">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex size-[30px] shrink-0 items-center justify-center rounded-sm ${CONSOLE_TONE_TINT[tint ?? tintOf(icon) ?? tone]}`}
        >
          {icon}
        </span>
        <h3 className="text-[13.5px] font-semibold leading-[1.2] text-text-secondary">{title}</h3>
      </div>
      <p
        className={`mt-3.5 text-[27px] font-semibold leading-[1.2] tracking-[-0.54px] ${CONSOLE_TONE_TEXT[tone]}`}
      >
        {value}
        {suffix ? (
          <span className="ms-1.5 text-sm font-medium tracking-normal text-text-muted">
            {suffix}
          </span>
        ) : null}
      </p>
      <p className="mt-[9px] text-xs font-medium leading-[1.4] text-text-muted">{note}</p>
    </article>
  )
}

/* -------------------------------------------------------------------- tabs */

export const CONSOLE_TAB_BAR = 'flex flex-wrap gap-x-6 border-b border-border-subtle px-5'


export const CONSOLE_TAB_LINE = 'absolute inset-x-0 -bottom-px h-0.5 bg-primary-700'
export const CONSOLE_TAB_COUNT =
  'inline-flex h-[18px] items-center rounded-full bg-primary-25 px-1.5 text-xs font-semibold'

/* ------------------------------------------------------------------ tables */

/**
 * A console table: runs to the card's edges, header and cells 20 px in at either end, rows
 * 14 px tall-padded on a hairline. Set on the `<table>`; it overrides the cell padding the
 * markup carries, so every console table reads the same.
 */
export const CONSOLE_TABLE =
  'w-full border-collapse text-start [&_tbody>tr]:border-border-subtle [&_td]:py-3.5 [&_td:first-child]:ps-5 [&_td:last-child]:pe-5 [&_th:first-child]:ps-5 [&_th:last-child]:pe-5'
/** The dark header row: 10.5 px bold white uppercase. */
export const CONSOLE_THEAD =
  'bg-text-primary text-[10.5px] font-bold uppercase leading-[1.5] tracking-[0.63px] text-white [&>th]:py-[11px] [&>th]:font-bold'
/** Phone card views keep 20 px from the card edge. */
export const CONSOLE_ROWS = 'max-md:px-5 max-md:[&.rows-cards]:pb-5'
/**
 * A card body that holds either a table or a notice: a table runs to the edges, anything else
 * keeps the card's 20 px.
 */
export const CONSOLE_TABLE_BODY = 'p-5 has-[table]:p-0 max-md:has-[table]:pt-4'
