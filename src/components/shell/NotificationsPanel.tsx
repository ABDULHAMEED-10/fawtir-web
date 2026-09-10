import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  noteValues,
  noteWhen,
  notesStore,
  useNotes,
  type Note,
  type NoteAction,
  type NoteScope,
  type NoteTone,
} from '../../lib/notifications'
import markReadIcon from '../../assets/notifications/mark-read.svg'
import settingsIcon from '../../assets/notifications/settings.svg'
import dismissIcon from '../../assets/notifications/dismiss.svg'
import certificateIcon from '../../assets/notifications/certificate.svg'
import quotaIcon from '../../assets/notifications/quota.svg'
import refusedIcon from '../../assets/notifications/refused.svg'
import stockIcon from '../../assets/notifications/stock.svg'
import acceptedIcon from '../../assets/notifications/accepted.svg'
import inviteIcon from '../../assets/notifications/invite.svg'
import deviceIcon from '../../assets/notifications/device.svg'

const ICON: Record<Note['icon'], string> = {
  certificate: certificateIcon,
  quota: quotaIcon,
  refused: refusedIcon,
  stock: stockIcon,
  accepted: acceptedIcon,
  invite: inviteIcon,
  device: deviceIcon,
}

/** The tinted tile behind each icon (Figma: Danger, Warning, Success, Neutral, Primary 100/200). */
const TILE: Record<NoteTone, string> = {
  danger: 'border-[#ead0ce] bg-danger-100',
  warning: 'border-[#e7e3da] bg-pending-100',
  success: 'border-[#dbe2de] bg-success-100',
  neutral: 'border-border-subtle bg-neutral-25',
  brand: 'border-primary-75 bg-primary-25',
}

const ACTION: Record<NoteAction['kind'], string> = {
  primary: 'border border-primary-700 bg-primary-700 text-white hover:bg-primary-800',
  secondary: 'border border-border-default bg-white text-[#494d56] hover:bg-primary-25',
  danger: 'bg-danger-100 text-danger-700 hover:brightness-95',
}

/** The inset the design gives the one icon exported as a bare group rather than a 16px frame. */
function NoteIcon({ note }: { note: Note }) {
  if (note.icon === 'invite') {
    return (
      <span className="relative block size-4 overflow-hidden">
        <span className="absolute inset-[12.5%_22.92%_12.5%_18.75%]">
          <span className="absolute inset-[-5.28%_-6.79%]">
            <img src={ICON.invite} alt="" className="block size-full max-w-none" />
          </span>
        </span>
      </span>
    )
  }
  return <img src={ICON[note.icon]} alt="" className="block size-4 max-w-none" />
}

function Row({ note, last, onGo }: { note: Note; last: boolean; onGo: (to: string) => void }) {
  const { t, i18n } = useTranslation()
  const { isRead, doneKey } = useNotes()
  const unread = !isRead(note.id)
  const done = doneKey(note.id)
  const values = noteValues(note, i18n.language)

  const run = (action: NoteAction) => {
    if (action.to) {
      notesStore.markRead(note.id)
      onGo(action.to)
    } else if (action.dismisses) {
      notesStore.dismiss(note.id)
    } else if (action.doneKey) {
      notesStore.complete(note.id, action.doneKey)
    }
  }

  return (
    <li
      onClick={() => notesStore.markRead(note.id)}
      className={[
        'relative flex items-start gap-3 px-5 py-[13px]',
        last ? '' : 'border-b border-border-subtle',
        unread ? 'bg-primary-25' : 'bg-white',
      ].join(' ')}
    >
      {unread ? (
        <span
          aria-hidden="true"
          className="absolute start-2 top-[22px] size-1.5 rounded-full bg-primary-700"
        />
      ) : null}

      <span
        className={[
          'flex size-[34px] shrink-0 items-center justify-center rounded-sm border',
          TILE[note.tone],
        ].join(' ')}
      >
        <NoteIcon note={note} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-[19.6px] text-text-primary">
          {t(note.titleKey, values)}
        </p>
        <p className="pt-[5px] text-[12.5px] font-medium leading-[19.375px] text-[#494d56]">
          <Trans
            i18nKey={note.bodyKey}
            values={values}
            components={{ b: <span className="font-semibold text-text-primary" /> }}
          />
        </p>
        <div className="flex flex-wrap items-center gap-x-[9px] gap-y-2 pt-[9px]">
          <span className="text-[11.5px] font-medium text-text-placeholder">
            {noteWhen(note.when, t, i18n.language)}
          </span>
          {done ? (
            <span className="text-xs font-semibold text-success-700">✓ {t(done)}</span>
          ) : (
            note.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  run(action)
                }}
                className={[
                  'inline-flex h-7 items-center justify-center whitespace-nowrap rounded-sm px-2.5 text-xs font-semibold transition-colors',
                  ACTION[action.kind],
                ].join(' ')}
              >
                {t(action.labelKey, values)}
              </button>
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          notesStore.dismiss(note.id)
        }}
        aria-label={t('notes.dismiss')}
        className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] transition-colors hover:bg-surface-background"
      >
        <img src={dismissIcon} alt="" className="block size-[13px] max-w-none" />
      </button>
    </li>
  )
}

/**
 * The notifications panel (Figma 144:33521), dropped from the bell.
 *
 * 428px on a desk; on a phone it takes the width of the screen less a margin, and it never runs
 * taller than the space under the topbar — the list scrolls, the header and footer stay put.
 *
 * In the console (`scope="console"`) the list is empty and the shop-settings gear is left out:
 * the operator has nothing to act on here until platform alerts are designed.
 */
export function NotificationsPanel({
  open,
  onClose,
  anchorRef,
  scope = 'tenant',
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  scope?: NoteScope
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const panel = useRef<HTMLDivElement>(null)
  const notes = useNotes(scope)
  const [box, setBox] = useState({ top: 0, left: 0, width: 428, maxHeight: 600 })

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const vw = window.innerWidth
      const width = Math.min(428, vw - 16)
      const rtl = document.documentElement.dir === 'rtl'
      const wanted = rtl ? rect.left : rect.right - width
      const left = Math.min(Math.max(8, wanted), vw - width - 8)
      const top = rect.bottom + 10
      setBox({ top, left, width, maxHeight: window.innerHeight - top - 12 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, anchorRef, i18n.language])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panel.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  const shown = notes.shown
  const groups = (['today', 'earlier'] as const)
    .map((group) => ({ group, items: shown.filter((note) => note.group === group) }))
    .filter((entry) => entry.items.length > 0)
  const lastId = shown.at(-1)?.id
  const unread = notes.unread

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={t('notes.title')}
      style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-sm bg-white shadow-elevated"
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border-subtle px-5 py-4">
        <h2 className="whitespace-nowrap text-base font-semibold text-text-primary">
          {t('notes.title')}
        </h2>
        {unread > 0 ? (
          <span className="rounded-sm bg-primary-700 px-[7px] py-0.5 text-[11px] font-bold tracking-[0.33px] text-white">
            {t('notes.newCount', { count: unread })}
          </span>
        ) : null}
        <div className="flex flex-1 items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => notesStore.markAllRead()}
            disabled={unread === 0}
            aria-label={t('notes.markAllRead')}
            title={t('notes.markAllRead')}
            className="flex size-[30px] items-center justify-center rounded-[8px] transition-colors hover:bg-surface-background disabled:opacity-40"
          >
            <img src={markReadIcon} alt="" className="block size-4 max-w-none" />
          </button>
          {scope === 'tenant' ? (
            <button
              type="button"
              onClick={() => go('/settings')}
              aria-label={t('notes.settings')}
              title={t('notes.settings')}
              className="flex size-[30px] items-center justify-center rounded-[8px] transition-colors hover:bg-surface-background"
            >
              <img src={settingsIcon} alt="" className="block size-4 max-w-none" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm font-medium text-text-tertiary">
            {t('notes.allCaughtUp')}
          </p>
        ) : (
          groups.map(({ group, items }) => (
            <section key={group}>
              <p className="border-y border-border-subtle bg-surface-tab-bar px-5 py-[9px] text-[10.5px] font-bold uppercase tracking-[0.63px] text-text-placeholder">
                {t(`notes.group.${group}`)}
              </p>
              <ul>
                {items.map((note) => (
                  <Row key={note.id} note={note} last={note.id === lastId} onGo={go} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-t border-border-subtle bg-surface-tab-bar px-5 py-[11px]">
        <p className="min-w-0 flex-1 text-[12.5px] font-medium text-text-placeholder">
          {t('notes.clearedAfter30')}
        </p>
        {scope === 'tenant' ? (
          <button
            type="button"
            onClick={() => notesStore.restoreAll()}
            disabled={!notes.anyDismissed}
            className="shrink-0 whitespace-nowrap px-1.5 text-[12.5px] font-semibold text-primary-700 transition-colors hover:text-primary-800 disabled:cursor-default"
          >
            {t('notes.seeAll')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
