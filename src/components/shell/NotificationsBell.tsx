import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Popover } from '../ui'
import { NOTICES, unreadCount, type Notice } from '../../lib/shell'
import bellIcon from '../../assets/dashboard/bell.svg'

const TONE = {
  attention: 'bg-danger-100 text-danger-700',
  info: 'bg-primary-50 text-primary-800',
  good: 'bg-success-100 text-success-700',
} as const

/**
 * The bell, and what it is counting.
 *
 * The badge shows unread only, so it goes down as they are read rather than standing at a number
 * nobody can move. Opening a notice marks it read and takes you to the thing it is about.
 */
export function NotificationsBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [notices, setNotices] = useState<Notice[]>(NOTICES)

  const unread = unreadCount(notices)

  const openNotice = (notice: Notice) => {
    setNotices((current) =>
      current.map((entry) => (entry.id === notice.id ? { ...entry, read: true } : entry)),
    )
    setOpen(false)
    navigate(notice.to)
  }

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

      <Popover
        open={open}
        anchorRef={anchor}
        onClose={() => setOpen(false)}
        width={380}
        align="end"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <p className="text-sm font-semibold text-text-primary">{t('shell.notice.title')}</p>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => setNotices((current) => current.map((n) => ({ ...n, read: true })))}
              className="text-xs font-semibold text-primary-700 hover:text-primary-800"
            >
              {t('shell.notice.markAllRead')}
            </button>
          ) : null}
        </div>

        <ul className="max-h-[400px] overflow-y-auto">
          {notices.map((notice) => (
            <li key={notice.id} className="border-b border-border-subtle last:border-b-0">
              <button
                type="button"
                onClick={() => openNotice(notice)}
                className={[
                  'flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-primary-25',
                  notice.read ? '' : 'bg-primary-25/60',
                ].join(' ')}
              >
                <span
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs ${TONE[notice.tone]}`}
                >
                  {notice.tone === 'good' ? '✓' : notice.tone === 'info' ? 'i' : '!'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t(notice.titleKey, notice.titleValues)}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t(notice.bodyKey, notice.bodyValues)}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-text-placeholder">
                    {t(notice.whenKey, notice.whenValues)}
                  </span>
                </span>
                {!notice.read ? (
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-primary-700" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/compliance/activity')
            }}
            className="text-sm font-semibold text-primary-700 hover:text-primary-800"
          >
            {t('shell.notice.seeAll')}
          </button>
        </div>
      </Popover>
    </>
  )
}
