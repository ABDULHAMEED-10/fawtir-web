import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DateField, Switch } from '../../components/ui'
import { formatInstantDay } from '../../lib/format'
import type { ArtefactId } from '../../lib/documentArchive'
import closeIcon from '../../assets/add-customer/close.svg'
import shareIcon from '../../assets/bills/upload.svg'
import copyIcon from '../../assets/invoice-details/copy.svg'
import calendarIcon from '../../assets/expenditure-reminders/calendar.svg'
import verifiedIcon from '../../assets/documents/verified.svg'

type Duration = 'day' | 'week' | 'month' | 'custom'

const DURATIONS: { id: Duration; days: number }[] = [
  { id: 'day', days: 1 },
  { id: 'week', days: 7 },
  { id: 'month', days: 30 },
  { id: 'custom', days: 0 },
]

export type ShareableFile = { id: ArtefactId; label: string }

/** The files a person reads start ticked; the QR image and the network replies do not. */
const TICKED: ArtefactId[] = ['pdf', 'xml', 'tdd']

const addDays = (isoDay: string, days: number) => {
  const date = new Date(`${isoDay}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * "Share {number} outside Fawtir" (Figma 154:140908).
 *
 * A record leaves Fawtir only as a link that expires, carries a password and logs every view. The
 * password is locked on: these are tax documents.
 *
 * TODO(backend): nothing issues a share link yet (ask 3.7). The dialog is drawn in full and keeps
 * every choice, but it does not invent a link or a password: the "Ready to send" panel says the
 * link is made once sharing is switched on, and "Copy the link" waits for it.
 */
export function ShareDocumentModal({
  open,
  onClose,
  number,
  files,
  today,
}: {
  open: boolean
  onClose: () => void
  number: string
  files: ShareableFile[]
  /** `YYYY-MM-DD` in Muscat, for the expiry the footer prints. */
  today: string
}) {
  const { t, i18n } = useTranslation()
  const [picked, setPicked] = useState<ArtefactId[]>(() =>
    files.filter((file) => TICKED.includes(file.id)).map((file) => file.id),
  )
  const [email, setEmail] = useState('')
  const [duration, setDuration] = useState<Duration>('week')
  const [customDate, setCustomDate] = useState('')
  const [download, setDownload] = useState(true)
  const [onePerson, setOnePerson] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const days = DURATIONS.find((entry) => entry.id === duration)?.days ?? 7
  const expires = duration === 'custom' ? customDate || null : addDays(today, days)
  const expiresLabel = expires
    ? formatInstantDay(`${expires}T08:00:00Z`, i18n.language).replace(/\s\d{4}$/, '')
    : '--'
  const toggle = (id: ArtefactId) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  const title = t('documents.share.title', { number })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[643px] flex-col overflow-hidden rounded-md bg-white shadow-card">
        <header className="flex items-center justify-between gap-4 border-b border-border-subtle px-6 py-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-primary-50">
              <img src={shareIcon} alt="" className="size-5" />
            </span>
            <h2 className="text-xl font-medium leading-[1.2] text-text-primary">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm hover:bg-surface-background"
          >
            <img src={closeIcon} alt="" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Heading>{t('documents.share.whichFiles')}</Heading>
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((file) => {
              const on = picked.includes(file.id)
              return (
                <button
                  key={file.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(file.id)}
                  className={[
                    'inline-flex h-[34px] items-center gap-2.5 rounded-sm border px-3 text-sm font-medium transition-colors',
                    on
                      ? 'border-primary-700 bg-primary-25 text-primary-700'
                      : 'border-border-subtle bg-white text-text-tertiary hover:border-primary-300',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex size-4 shrink-0 items-center justify-center rounded-[3px] border',
                      on ? 'border-primary-700 bg-primary-700' : 'border-border-default bg-white',
                    ].join(' ')}
                  >
                    {on ? (
                      <img src={verifiedIcon} alt="" className="size-3 brightness-0 invert" />
                    ) : null}
                  </span>
                  {file.label}
                </button>
              )
            })}
          </div>

          <Heading className="mt-6">{t('documents.share.whoFor')}</Heading>
          <label className="mt-3 block">
            <span className="text-sm font-medium leading-[1.2] text-text-primary">
              {t('documents.share.email')}
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('documents.share.emailPlaceholder')}
              className="mt-2 h-[46px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-base font-medium text-text-secondary outline-none focus:border-primary-700"
            />
          </label>

          <Heading className="mt-6">{t('documents.share.howLong')}</Heading>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {DURATIONS.map((entry) => {
              const on = entry.id === duration
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDuration(entry.id)}
                  className={[
                    'inline-flex h-[42px] items-center justify-center gap-2 rounded-sm border text-sm font-medium transition-colors',
                    on
                      ? 'border-primary-700 bg-primary-25 text-primary-700'
                      : 'border-border-subtle bg-white text-text-secondary hover:border-primary-300',
                  ].join(' ')}
                >
                  {entry.id === 'custom' ? (
                    <img src={calendarIcon} alt="" className="size-4" />
                  ) : null}
                  {t(`documents.share.durations.${entry.id}`)}
                </button>
              )
            })}
          </div>
          {duration === 'custom' ? (
            <div className="mt-2.5 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-tertiary">
                {t('documents.share.customDate')}
              </span>
              <DateField
                value={customDate}
                onChange={setCustomDate}
                min={addDays(today, 1)}
                ariaLabel={t('documents.share.customDate')}
              />
            </div>
          ) : null}

          <Heading className="mt-6">{t('documents.share.protection')}</Heading>
          <div className="mt-1 flex flex-col">
            <ToggleRow
              title={t('documents.share.password')}
              note={t('documents.share.passwordNote')}
            >
              <span
                role="switch"
                aria-checked="true"
                aria-disabled="true"
                aria-label={t('documents.share.password')}
                className="relative h-[26px] w-[46px] shrink-0 rounded-full bg-[#4c6c5a]"
              >
                <span className="absolute end-[3px] top-[3px] size-5 rounded-full bg-white" />
              </span>
            </ToggleRow>
            <ToggleRow
              title={t('documents.share.download')}
              note={t('documents.share.downloadNote')}
            >
              <Switch
                checked={download}
                onChange={setDownload}
                label={t('documents.share.download')}
              />
            </ToggleRow>
            <ToggleRow
              title={t('documents.share.onePerson')}
              note={t('documents.share.onePersonNote')}
              last
            >
              <Switch
                checked={onePerson}
                onChange={setOnePerson}
                label={t('documents.share.onePerson')}
              />
            </ToggleRow>
          </div>

          {picked.length > 0 ? (
            <section className="mt-3 rounded-sm border border-[#cfe0d5] bg-[#eef5f0] p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase leading-[1.4] tracking-[0.8px] text-[#3d5648]">
                <img src={verifiedIcon} alt="" className="size-3.5" />
                {t('documents.share.ready')}
              </p>
              <div className="mt-3 flex flex-col gap-2.5 ps-0 sm:ps-9">
                <CopyRow label={t('documents.share.theLink')} />
                <CopyRow label={t('documents.share.thePassword')} />
              </div>
            </section>
          ) : (
            <p className="mt-3 rounded-sm bg-pending-100 p-3.5 text-sm font-medium text-pending-700">
              {t('documents.share.nothingPicked')}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-tab-bar px-6 py-4">
          <p className="text-sm font-medium text-text-tertiary">
            <span className="font-semibold text-text-primary">
              {t('documents.share.fileCount', { count: picked.length })}
            </span>
            {' · '}
            {t('documents.share.footer', { date: expiresLabel })}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-6 text-base font-medium text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled
              title={t('documents.share.notYet')}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-base font-medium text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <img src={copyIcon} alt="" className="size-4 brightness-0 invert" />
              {t('documents.share.copyLink')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Heading({ children, className = '' }: { children: string; className?: string }) {
  return (
    <h3
      className={[
        'text-xs font-medium uppercase leading-[1.4] tracking-[0.8px] text-text-quaternary',
        className,
      ].join(' ')}
    >
      {children}
    </h3>
  )
}

function ToggleRow({
  title,
  note,
  children,
  last = false,
}: {
  title: string
  note: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-4 py-3.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <div className="min-w-0">
        <p className="text-base font-medium leading-[1.2] text-text-primary">{title}</p>
        <p className="mt-1 text-sm font-medium leading-[1.3] text-text-quaternary">{note}</p>
      </div>
      {children}
    </div>
  )
}

/** A row of the "Ready to send" panel. The value waits for a link the server has not issued. */
function CopyRow({ label }: { label: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm bg-white p-3.5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.7px] text-text-quaternary">
          {label}
        </p>
        <p className="mt-1 text-sm font-medium text-text-quaternary">
          {t('documents.share.pending')}
        </p>
      </div>
      <button
        type="button"
        disabled
        className="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary disabled:opacity-50"
      >
        <img src={copyIcon} alt="" className="size-4" />
        {t('documents.share.copy')}
      </button>
    </div>
  )
}
