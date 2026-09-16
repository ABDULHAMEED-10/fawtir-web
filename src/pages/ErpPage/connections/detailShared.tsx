import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Input, Modal } from '../../../components/ui'
import { ConfirmModal, DANGER_TEXT_BUTTON, SECONDARY_BUTTON } from '../overview/idiom'
import { connectorStore, type Connection } from '../../../lib/erpConnector'
import { shortDate } from '../../../lib/settings'
import infoIcon from '../../../assets/settings/info.svg'
import tickIcon from '../../../assets/settings/check-green.svg'
import crossIcon from '../../../assets/settings/cross-danger.svg'

/**
 * What the four detail tabs (Overview · Mapping · Write-back · Settings) share: the tone strip a
 * result or a warning is told in, the clock formats, and the two dialogs that Overview and
 * Settings both open — pause with a reason, and delete.
 */

export type StripTone = 'danger' | 'pending' | 'success' | 'neutral'

const STRIP_TONE: Record<StripTone, string> = {
  danger: 'border-danger-100 bg-danger-100/60 text-danger-700',
  pending: 'border-pending-200 bg-pending-100/60 text-text-secondary',
  success: 'border-success-100 bg-success-100 text-[#3d5648]',
  neutral: 'border-surface-background bg-surface-background/60 text-text-secondary',
}
const STRIP_ICON: Record<StripTone, string> = {
  danger: crossIcon,
  pending: infoIcon,
  success: tickIcon,
  neutral: infoIcon,
}

/** A one-line message in a tinted band — a refusal, a warning, a success. */
export function Strip({
  tone,
  children,
  action,
}: {
  tone: StripTone
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={[
        'flex flex-wrap items-center gap-3 rounded-md border px-4 py-3',
        STRIP_TONE[tone],
      ].join(' ')}
    >
      <img src={STRIP_ICON[tone]} alt="" aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-medium leading-[1.5]">{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ clock */

/** "14:00" — Latin digits in both languages, as the app keeps everywhere. */
export const timeOf = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date)

/** "26 Sep 2026 · 14:00" */
export const dateTime = (date: Date) => `${shortDate(date)} · ${timeOf(date)}`

/** "1,000" — thousands separated, Latin digits. */
export const thousands = (n: number) => n.toLocaleString('en-US')

/* ---------------------------------------------------------------- dialogs */

/** Pause asks why, optionally; the reason is written into the audit line. */
export function PauseModal({
  open,
  connection,
  onClose,
}: {
  open: boolean
  connection: Connection
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const confirm = () => {
    connectorStore.pause(connection.id, reason.trim() || undefined)
    setReason('')
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('erp.connector.overview.pause.title')}
      subtitle={t('erp.connector.overview.pause.subtitle')}
      width={480}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button type="button" size="md" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" size="md" onClick={confirm}>
            {t('erp.connector.overview.pause.confirm')}
          </Button>
        </div>
      }
    >
      <Input
        bordered
        label={t('erp.connector.overview.pause.reason')}
        placeholder={t('erp.connector.overview.pause.reasonPlaceholder')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        hint={t('erp.connector.overview.pause.reasonHint')}
      />
    </Modal>
  )
}

/** Pause or Resume, whichever the state calls for, in the secondary shape. */
export function PauseResumeButton({
  connection,
  className = SECONDARY_BUTTON,
}: {
  connection: Connection
  className?: string
}) {
  const { t } = useTranslation()
  const [pausing, setPausing] = useState(false)
  if (connection.state === 'DISCONNECTED') return null
  if (connection.state === 'PAUSED')
    return (
      <button
        type="button"
        onClick={() => connectorStore.resume(connection.id)}
        className={className}
      >
        {t('erp.connector.overview.actions.resume')}
      </button>
    )
  return (
    <>
      <button type="button" onClick={() => setPausing(true)} className={className}>
        {t('erp.connector.overview.actions.pause')}
      </button>
      <PauseModal open={pausing} connection={connection} onClose={() => setPausing(false)} />
    </>
  )
}

/** Delete: the credentials are destroyed at once; runs and records stay for the audit. */
export function DeleteConnectionButton({ connection }: { connection: Connection }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={connection.state === 'DISCONNECTED'}
        className={`${DANGER_TEXT_BUTTON} disabled:cursor-not-allowed disabled:text-text-quaternary`}
      >
        {t('erp.connector.overview.danger.delete')}
      </button>
      <ConfirmModal
        open={open}
        danger
        title={t('erp.connector.overview.danger.confirmTitle', { label: connection.label })}
        body={t('erp.connector.overview.danger.confirmBody')}
        confirmLabel={t('erp.connector.overview.danger.confirm')}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          connectorStore.remove(connection.id)
          setOpen(false)
          navigate('/settings/erp/connections')
        }}
      />
    </>
  )
}

/** The bottom of Overview and Settings: what cannot be undone. */
export function DangerZone({
  connection,
  children,
}: {
  connection: Connection
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="rounded-md border border-danger-100 bg-surface-card p-5">
      <h3 className="text-base font-semibold leading-[1.2] text-danger-700">
        {t('erp.connector.overview.danger.title')}
      </h3>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium leading-[1.5] text-text-tertiary">
          {t('erp.connector.overview.danger.body')}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-4">
          {children}
          <DeleteConnectionButton connection={connection} />
        </div>
      </div>
    </section>
  )
}
