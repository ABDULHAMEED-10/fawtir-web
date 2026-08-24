import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch } from '../ui'
import { TODAY, type DocFile } from '../../lib/documents'
import closeIcon from '../../assets/add-customer/close.svg'
import shareIcon from '../../assets/bills/upload.svg'
import copyIcon from '../../assets/invoice-details/copy.svg'
import calendarIcon from '../../assets/expenditure-reminders/calendar.svg'
import verifiedIcon from '../../assets/documents/verified.svg'

/**
 * "Share {id} outside Fawtir" (Figma 102:14170).
 *
 * A record can leave Fawtir only as a link that expires, carries a password and records every
 * view — an audit trail is the whole point of the archive, and a plain attachment would break
 * it. The password toggle is deliberately locked on: these are tax documents.
 */

type Duration = 'day' | 'week' | 'month' | 'custom'

const DURATIONS: { id: Duration; labelKey: string; days: number }[] = [
  { id: 'day', labelKey: 'documents.share.durations.day', days: 1 },
  { id: 'week', labelKey: 'documents.share.durations.week', days: 7 },
  { id: 'month', labelKey: 'documents.share.durations.month', days: 30 },
  { id: 'custom', labelKey: 'documents.share.durations.custom', days: 0 },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The expiry the footer prints, counted from {@link TODAY}. */
function expiryFrom(anchor: string, days: number) {
  const [day, month, year] = anchor.split(' ')
  const date = new Date(Number(year), MONTHS.indexOf(month), Number(day) + days)
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex items-center justify-between gap-3 rounded-sm bg-white p-3.5">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase leading-[1.4] tracking-[0.7px] text-text-quaternary">
          {label}
        </p>
        <p className="mt-1 break-all font-mono text-sm font-semibold text-text-primary">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(value).catch(() => {})
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        }}
        className="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
      >
        <img src={copied ? verifiedIcon : copyIcon} alt="" className="size-4" />
        {t(copied ? 'documents.share.copied' : 'documents.share.copy')}
      </button>
    </div>
  )
}

export function ShareDocumentModal({
  open,
  onClose,
  recordId,
  files,
  /** Seeds the link, so the same document always shares under the same address. */
  uuid,
}: {
  open: boolean
  onClose: () => void
  recordId: string
  files: DocFile[]
  uuid: string
}) {
  const { t } = useTranslation()

  /** Everything but the machine-to-machine replies starts ticked, as in the design. */
  const [picked, setPicked] = useState<string[]>(
    files.filter((file) => file.icon !== 'qr' && file.icon !== 'mls').map((file) => file.id),
  )

  /** The PDF first: it is the one a person actually reads. */
  const ordered = useMemo(
    () => [...files].sort((a, b) => Number(b.icon === 'pdf') - Number(a.icon === 'pdf')),
    [files],
  )
  const [email, setEmail] = useState('salim@alharthy-audit.com')
  const [duration, setDuration] = useState<Duration>('week')
  const [customDate, setCustomDate] = useState('')
  const [download, setDownload] = useState(true)
  const [onePerson, setOnePerson] = useState(false)

  const link = `fawtir.om/s/${uuid.replace(/-/g, '')}`
  /** Derived from the record so the same document always shows the same password here. */
  const password = useMemo(() => {
    const clean = uuid.replace(/[^a-z0-9]/gi, '').toUpperCase()
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}`
  }, [uuid])

  if (!open) return null

  const days = DURATIONS.find((entry) => entry.id === duration)?.days ?? 7
  const expires =
    duration === 'custom' && customDate
      ? customDate
      : expiryFrom(TODAY, duration === 'custom' ? 7 : days)

  const toggleFile = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )

  const ready = picked.length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('documents.share.title', { id: recordId })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[643px] flex-col overflow-hidden rounded-md bg-white shadow-card">
        <header className="flex items-center justify-between gap-4 border-b border-border-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary-50">
              <img src={shareIcon} alt="" className="size-5" />
            </span>
            <h2 className="text-xl font-semibold leading-[1.2] text-text-primary">
              {t('documents.share.title', { id: recordId })}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('documents.share.close')}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm hover:bg-surface-background"
          >
            <img src={closeIcon} alt="" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-text-quaternary">
              {t('documents.share.whichFiles')}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {ordered.map((file) => {
                const on = picked.includes(file.id)
                return (
                  <button
                    key={file.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleFile(file.id)}
                    className={[
                      'inline-flex h-[46px] items-center gap-2.5 rounded-sm border px-3.5 text-sm font-medium transition-colors',
                      on
                        ? 'border-primary-700 bg-white text-primary-700'
                        : 'border-border-subtle bg-white text-text-tertiary hover:border-primary-300',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border',
                        on ? 'border-primary-700 bg-primary-700' : 'border-border-default bg-white',
                      ].join(' ')}
                    >
                      {on ? (
                        <img src={verifiedIcon} alt="" className="size-3 brightness-0 invert" />
                      ) : null}
                    </span>
                    {file.name}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="mt-5">
            <h3 className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-text-quaternary">
              {t('documents.share.whoFor')}
            </h3>
            <label className="mt-3 block">
              <span className="text-sm font-medium leading-[1.2] text-text-primary">
                {t('documents.share.email')}
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('documents.share.emailPlaceholder')}
                className="mt-1.5 h-[52px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-base font-medium text-text-secondary outline-none focus:border-primary-700"
              />
            </label>
          </section>

          <section className="mt-5">
            <h3 className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-text-quaternary">
              {t('documents.share.howLong')}
            </h3>
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
                      'inline-flex h-[52px] items-center justify-center gap-2 rounded-sm border text-sm font-medium transition-colors',
                      on
                        ? 'border-primary-700 bg-primary-25 text-primary-700'
                        : 'border-border-subtle bg-white text-text-tertiary hover:border-primary-300',
                    ].join(' ')}
                  >
                    {entry.id === 'custom' ? (
                      <img src={calendarIcon} alt="" className="size-[18px]" />
                    ) : null}
                    {t(entry.labelKey)}
                  </button>
                )
              })}
            </div>
            {duration === 'custom' ? (
              <label className="mt-2.5 block">
                <span className="text-sm font-medium text-text-tertiary">
                  {t('documents.share.customDate')}
                </span>
                <input
                  type="date"
                  value={customDate}
                  onChange={(event) => setCustomDate(event.target.value)}
                  className="mt-1.5 h-[46px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none"
                />
              </label>
            ) : null}
          </section>

          <section className="mt-5">
            <h3 className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-text-quaternary">
              {t('documents.share.protection')}
            </h3>
            <div className="mt-1 flex flex-col">
              {[
                {
                  id: 'password',
                  title: t('documents.share.password'),
                  note: t('documents.share.passwordNote'),
                  checked: true,
                  onChange: () => {},
                  /* Tax documents always leave with a password, so this cannot be turned off. */
                  locked: true,
                },
                {
                  id: 'download',
                  title: t('documents.share.download'),
                  note: t('documents.share.downloadNote'),
                  checked: download,
                  onChange: setDownload,
                },
                {
                  id: 'onePerson',
                  title: t('documents.share.onePerson'),
                  note: t('documents.share.onePersonNote'),
                  checked: onePerson,
                  onChange: setOnePerson,
                },
              ].map((row, index) => (
                <div
                  key={row.id}
                  className={[
                    'flex items-center justify-between gap-4 py-4',
                    index < 2 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-[1.2] text-text-primary">
                      {row.title}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-[1.3] text-text-quaternary">
                      {row.note}
                    </p>
                  </div>
                  {row.locked ? (
                    <span
                      role="switch"
                      aria-checked="true"
                      aria-disabled="true"
                      aria-label={row.title}
                      className="relative h-[23px] w-[42px] shrink-0 rounded-full bg-[#4c6c5a]"
                    >
                      <span className="absolute top-[2.5px] start-[21px] size-[18px] rounded-full bg-white" />
                    </span>
                  ) : (
                    <Switch checked={row.checked} onChange={row.onChange} label={row.title} />
                  )}
                </div>
              ))}
            </div>
          </section>

          {ready ? (
            <section className="mt-4 rounded-sm border border-[#cfe0d5] bg-[#eef5f0] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-[#3d5648]">
                <img src={verifiedIcon} alt="" className="size-3.5" />
                {t('documents.share.ready')}
              </p>
              <div className="mt-3 flex flex-col gap-2.5">
                <CopyRow label={t('documents.share.theLink')} value={link} />
                <CopyRow label={t('documents.share.thePassword')} value={password} />
              </div>
            </section>
          ) : (
            <p className="mt-4 rounded-sm bg-pending-100 p-3.5 text-sm font-medium text-pending-500">
              {t('documents.share.nothingPicked')}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-tab-bar px-6 py-4">
          <p className="text-sm font-medium text-text-tertiary">
            {t('documents.share.footer', { count: picked.length, date: expires })}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('documents.share.cancel')}
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                navigator.clipboard?.writeText(link).catch(() => {})
                onClose()
              }}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
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
