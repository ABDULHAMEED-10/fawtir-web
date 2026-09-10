import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotes, type NoteScope } from '../../lib/notifications'
import { NotificationsPanel } from './NotificationsPanel'
import bellIcon from '../../assets/dashboard/bell.svg'

/**
 * The bell, and what it is counting (Figma 144:33521 for the panel it opens).
 *
 * The badge counts unread only, so it goes down as they are read rather than standing at a
 * number nobody can move. It reads the same store as the panel, and that store outlives page
 * changes, so marking everything read stays marked when you go somewhere else.
 */
export function NotificationsBell({ scope = 'tenant' }: { scope?: NoteScope }) {
  const { t } = useTranslation()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const { unread } = useNotes(scope)

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unread ? t('shell.notice.ariaWith', { count: unread }) : t('dashboard.notifications')
        }
        className="relative inline-flex size-12 items-center justify-center rounded-full border border-border-subtle bg-surface-card transition-colors hover:bg-primary-25 max-md:size-10"
      >
        <img src={bellIcon} alt="" className="size-6" />
        {unread > 0 ? (
          <span className="absolute end-1 top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary-700 text-[10px] font-semibold text-white max-md:end-0 max-md:top-0">
            {unread}
          </span>
        ) : null}
      </button>

      <NotificationsPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchor}
        scope={scope}
      />
    </>
  )
}
