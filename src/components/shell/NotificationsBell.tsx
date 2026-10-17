import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { notesStore, useNotes, type NoteScope } from '../../lib/notifications'
import { can, useSession } from '../../lib/session/session'
import { subscriptionNoticesStore } from '../../lib/subscriptionNotices'
import { quotaNoticeStore } from '../../lib/quotaNotice'
import { NotificationsPanel } from './NotificationsPanel'
import bellIcon from '../../assets/dashboard/bell.svg'

/**
 * The bell, and what it is counting (Figma 144:33521 for the panel it opens).
 *
 * The badge counts unread only, so it goes down as they are read rather than standing at a
 * number nobody can move. It reads the same store as the panel, and that store outlives page
 * changes, so marking everything read stays marked when you go somewhere else.
 *
 * What it counts is the signed-in reader's own bill reminders (`GET /bill-reminders/inbox`), which
 * need `invoice.read`. Without a session, without that permission, or in the console, there is no
 * inbox to read: nothing is asked and the bell is quiet. The count is asked for when a page mounts
 * the bell; the lines are read when the panel is opened.
 *
 * It also counts the reader's trial-ending and grace reminders
 * (`GET /settings/subscription/notices`), which need `tenant.plan.read` and are asked for the same
 * way. A server without that route shows the bill reminders alone.
 *
 * With the same permission it shows the allowance warning at 80%, 90% and 100% (AL-8), from the
 * server's `allowance.warningPercent` on `GET /settings/plan` (`lib/quotaNotice.ts`).
 */
export function NotificationsBell({ scope = 'tenant' }: { scope?: NoteScope }) {
  const { t } = useTranslation()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const { unread } = useNotes(scope)
  const session = useSession()
  // Undefined while nobody is known to be signed in yet (the shell is still asking, on every
  // page): the store is left as it is, so the count does not blink out between pages.
  const owner =
    session === null
      ? undefined
      : scope === 'tenant' && can(session, 'invoice.read')
        ? `${session.tenantId}:${session.userId}`
        : null

  const planOwner =
    session === null
      ? undefined
      : scope === 'tenant' && can(session, 'tenant.plan.read')
        ? `${session.tenantId}:${session.userId}`
        : null

  useEffect(() => {
    if (owner !== undefined) notesStore.watch(owner)
  }, [owner])
  useEffect(() => {
    if (planOwner !== undefined) {
      subscriptionNoticesStore.watch(planOwner)
      quotaNoticeStore.watch(planOwner)
    }
  }, [planOwner])
  useEffect(() => {
    if (open) notesStore.refresh()
  }, [open])

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
            {/* The dot holds one figure. The spoken label and the panel give the count in full. */}
            {unread > 9 ? '9+' : unread}
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
