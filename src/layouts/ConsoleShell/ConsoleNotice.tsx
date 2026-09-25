import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import { commonFailureMessage } from '../../lib/identity/errors'

type NoticeAction = { label: string } & (
  { onClick: () => void; to?: never } | { to: string; onClick?: never }
)

type ConsoleNoticeProps = {
  /** Already translated. Omitted for a plain message such as a loading line. */
  badge?: string
  body: string
  /** A retry or a way out. */
  action?: NoticeAction
  /** Shows the app's spinner and announces the body politely instead of as an alert. */
  busy?: boolean
}

/** The primary button the "not built yet" page uses for its way back. */
const ACTION_CLASS =
  'mt-1 inline-flex h-11 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800'

/**
 * A console screen's state when it has nothing to list: checking access, no access, a failed
 * request. The same card and pill the "not built yet" page draws, so every console state reads as
 * part of the same product; a failure is an alert, progress a polite status.
 */
export function ConsoleNotice({ badge, body, action, busy = false }: ConsoleNoticeProps) {
  // A wait is centred in the space the content will take, so the page does not jump when it
  // arrives; a failure keeps the card's reading position at the start, where the text begins.
  return (
    <section
      role={busy ? 'status' : 'alert'}
      className={
        busy
          ? 'flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-md bg-surface-card p-8 text-center'
          : 'flex flex-col items-start gap-3 rounded-md bg-surface-card p-8'
      }
    >
      {busy ? (
        <span aria-hidden="true" className="relative flex size-12 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-[3px] border-primary-50" />
          <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-primary-700" />
        </span>
      ) : null}
      {badge ? (
        <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-primary-50 px-2.5 text-xs font-semibold uppercase tracking-[0.04em] text-primary-800">
          {badge}
        </span>
      ) : null}
      <p
        className={[
          'max-w-[560px] text-sm font-medium leading-[1.6]',
          busy ? 'text-text-quaternary' : 'text-text-tertiary',
        ].join(' ')}
      >
        {body}
      </p>
      {action?.to ? (
        <Link to={action.to} className={ACTION_CLASS}>
          {action.label}
        </Link>
      ) : action ? (
        <button type="button" onClick={action.onClick} className={ACTION_CLASS}>
          {action.label}
        </button>
      ) : null}
    </section>
  )
}

/**
 * A console read that failed. A `403` is the backend refusing this operator, so it reads as "no
 * access" — never as an empty list, which would claim there is nothing there. Anything else can be
 * retried. (A `401` never gets here: `useConsoleRead` sends the reader to sign in.)
 */
export function ConsoleReadFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useTranslation()
  if (error instanceof ApiError && error.status === 403) {
    return (
      <ConsoleNotice
        badge={t('console.access.noAccess')}
        body={t('console.access.missingPermission')}
      />
    )
  }
  const message = commonFailureMessage(error)
  return (
    <ConsoleNotice
      body={t(message.key, message.values)}
      action={{ label: t('console.access.retry'), onClick: retry }}
    />
  )
}
