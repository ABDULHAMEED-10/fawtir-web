import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PAUSE_REASONS,
  PAUSE_SCOPES,
  PAUSE_TARGET,
  SEND_MESSAGE_OPTIONS,
  SEND_TARGET,
  TEMPLATE_DRAFT,
  type ReminderStepId,
  TONE_CHIP,
  TONE_LABEL_KEY as TONE_LABEL,
} from '../../lib/reminders'
import { withRial } from '../ui'
import closeIcon from '../../assets/reminders/close.svg'
import pauseWhiteIcon from '../../assets/reminders/pause-white.svg'
import sendWhiteIcon from '../../assets/reminders/send-white.svg'
import editOneIcon from '../../assets/reminders/edit-one.svg'
import editTemplateIcon from '../../assets/reminders/edit-template.svg'
import calendarIcon from '../../assets/create-invoice/calendar.svg'
import noteTextIcon from '../../assets/trade-create/note-text.svg'
import omrIcon from '../../assets/order-forms-v2/omr.svg'

function Modal({
  open,
  onClose,
  label,
  width,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  label: string
  width: string
  children: ReactNode
  footer: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div
        className={[
          'flex max-h-full w-full flex-col overflow-hidden rounded-md bg-white',
          width,
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#f3f3f3] bg-[#fafafa] px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  )
}

function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string
  subtitle?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-medium leading-[1.2] text-[#151c2d]">{title}</h2>
        {subtitle ? (
          <p className="mt-1.5 text-sm font-medium leading-[1.3] text-[#5b606c]">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('linkModal.close')}
        className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-black/[0.04]"
      >
        <img src={closeIcon} alt="" className="size-5" />
      </button>
    </div>
  )
}

/** The invoice this action applies to, shown as a grey strip under the modal title. */
function TargetStrip({
  invoice,
  metaKey,
  amount,
  amountNoteKey,
}: {
  invoice: string
  metaKey: string
  amount: string
  amountNoteKey?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#e8e8ea] bg-[#fafafa] p-3">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
          <img src={noteTextIcon} alt="" className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
            {invoice}
          </span>
          <span className="mt-1 block text-xs font-medium leading-[1.2] text-[#5b606c]">
            {t(metaKey)}
          </span>
        </span>
      </span>
      <span className="text-end">
        <span className="inline-flex items-center gap-1">
          <img src={omrIcon} alt="" className="h-auto w-5 shrink-0" />
          <span className="text-lg font-semibold leading-[1.2] text-[#2c3342]">{amount}</span>
        </span>
        {amountNoteKey ? (
          <span className="mt-0.5 block text-xs font-medium text-[#737781]">
            {t(amountNoteKey)}
          </span>
        ) : null}
      </span>
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#737781]">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------- pause reminders */

export function PauseRemindersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [scope, setScope] = useState('invoice')
  const [reason, setReason] = useState('promised')
  const [resume, setResume] = useState<'in7' | 'onDate'>('onDate')

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={t('reminders.pause.title')}
      width="max-w-[626px]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[46px] items-center rounded-sm border border-[#e8e8ea] bg-white px-6 text-base font-medium text-[#3a3a3a]"
          >
            {t('linkModal.cancel')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-6 text-base font-semibold text-white"
          >
            <img src={pauseWhiteIcon} alt="" className="size-5" />
            {t('reminders.pause.confirm', { date: '15 Aug' })}
          </button>
        </>
      }
    >
      <ModalHeader
        title={t('reminders.pause.title')}
        subtitle={t('reminders.pause.subtitle')}
        onClose={onClose}
      />
      <TargetStrip
        invoice={PAUSE_TARGET.invoice}
        metaKey={PAUSE_TARGET.metaKey}
        amount={PAUSE_TARGET.amount}
      />

      <FieldGroup label={t('reminders.pause.whatToPause')}>
        <div className="flex flex-col gap-3">
          {PAUSE_SCOPES.map((option) => {
            const active = option.id === scope
            return (
              <label
                key={option.id}
                className={[
                  'flex cursor-pointer items-start gap-3 rounded-sm border p-3',
                  active ? 'border-[#2c4eb7] bg-[#f4f6fb]/60' : 'border-[#e8e8ea]',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => setScope(option.id)}
                  aria-label={t(option.titleKey)}
                  className="mt-0.5 size-5 shrink-0 rounded-[4px] accent-[#2c4eb7]"
                />
                <span className="min-w-0">
                  <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
                    {t(option.titleKey)}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-[1.2] text-[#5b606c]">
                    {t(option.noteKey)}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </FieldGroup>

      <div className="mt-5">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-[#737781]">
          {t('reminders.pause.why')}
          <span className="text-xs font-medium normal-case tracking-normal text-[#5b606c]">
            {t('reminders.pause.whyHint')}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PAUSE_REASONS.map((option) => {
            const active = option.id === reason
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setReason(option.id)}
                aria-pressed={active}
                className={[
                  'inline-flex h-[38px] items-center rounded-full px-4 text-sm font-medium leading-[1.2]',
                  active
                    ? 'bg-[#2c4eb7] text-white'
                    : 'border border-[#d0d2d5] bg-white text-[#2c3342]',
                ].join(' ')}
              >
                {t(option.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      <FieldGroup label={t('reminders.pause.resume')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['in7', 'onDate'] as const).map((option) => {
            const active = option === resume
            return (
              <button
                key={option}
                type="button"
                onClick={() => setResume(option)}
                aria-pressed={active}
                className={[
                  'inline-flex h-[50px] items-center justify-center rounded-sm border text-base font-medium',
                  active
                    ? 'border-[#2c4eb7] bg-[#f4f6fb]/60 text-[#2c4eb7]'
                    : 'border-[#e8e8ea] bg-white text-[#2c3342]',
                ].join(' ')}
              >
                {t(option === 'in7' ? 'reminders.pause.in7Days' : 'reminders.pause.onADate')}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex h-[50px] items-center justify-between gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
          <span className="text-sm font-medium text-text-secondary">{PAUSE_TARGET.resumeDate}</span>
          <img src={calendarIcon} alt="" className="size-6" />
        </div>
      </FieldGroup>

      <FieldGroup label={t('reminders.pause.note')}>
        <div className="min-h-[96px] rounded-sm border border-primary-300 bg-surface-tab-bar p-3 text-sm font-medium leading-[1.5] text-text-secondary">
          {PAUSE_TARGET.note}
        </div>
      </FieldGroup>
    </Modal>
  )
}

/* --------------------------------------------------------- send reminder */

export function SendReminderModal({
  open,
  onClose,
  onEditTemplate,
}: {
  open: boolean
  onClose: () => void
  onEditTemplate: () => void
}) {
  const { t } = useTranslation()
  const [message, setMessage] = useState<ReminderStepId>('friendly')
  const doc = SEND_TARGET

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={t('reminders.send.title')}
      width="max-w-[685px]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[46px] items-center rounded-sm border border-[#e8e8ea] bg-white px-6 text-base font-medium text-[#3a3a3a]"
          >
            {t('linkModal.cancel')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-6 text-base font-semibold text-white"
          >
            <img src={sendWhiteIcon} alt="" className="size-5" />
            {t('reminders.send.sendNow')}
          </button>
        </>
      }
    >
      <ModalHeader
        title={t('reminders.send.title')}
        subtitle={t('reminders.send.subtitle')}
        onClose={onClose}
      />
      <TargetStrip
        invoice={doc.invoice}
        metaKey={doc.metaKey}
        amount={doc.amount}
        amountNoteKey={doc.outstandingKey}
      />

      <FieldGroup label={t('reminders.send.whichMessage')}>
        <div className="grid gap-3 sm:grid-cols-3">
          {SEND_MESSAGE_OPTIONS.map((option) => {
            const active = option.id === message
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setMessage(option.id)}
                aria-pressed={active}
                className={[
                  'flex flex-col gap-2 rounded-sm border p-4 text-start',
                  active ? 'border-[#2c4eb7] bg-[#f4f6fb]/60' : 'border-[#e8e8ea] bg-white',
                ].join(' ')}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-medium leading-[1.2] text-[#151c2d]">
                    {t(option.titleKey)}
                  </span>
                  <span
                    className={[
                      'inline-flex items-center rounded-full px-2.5 py-[3px] text-xs font-semibold',
                      TONE_CHIP[option.tone],
                    ].join(' ')}
                  >
                    {t(TONE_LABEL[option.tone])}
                  </span>
                </span>
                <span className="text-sm font-medium leading-[1.2] text-[#5b606c]">
                  {t(option.hintKey)}
                </span>
              </button>
            )
          })}
        </div>
      </FieldGroup>

      <div className="mt-5">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[#737781]">
          {t('reminders.send.to')}
          <span className="text-xs font-medium normal-case tracking-normal text-[#5b606c]">
            {t('reminders.send.toHint')}
          </span>
        </p>
        <div className="mt-2 flex h-[50px] items-center rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary">
          {doc.to}
        </div>
      </div>

      <FieldGroup label={t('reminders.send.subject')}>
        <div className="flex h-[50px] items-center rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary">
          {doc.subject}
        </div>
      </FieldGroup>

      <FieldGroup label={t('reminders.send.preview.label')}>
        <div className="overflow-hidden rounded-sm border border-[#e8e8ea]">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[#e8e8ea] bg-[#fafafa] px-4 py-2.5 text-xs font-medium text-[#5b606c]">
            <span>{t('reminders.send.preview.from')}</span>
            <span className="font-semibold text-[#2c3342]">{doc.from}</span>
            <span>· {t('reminders.send.preview.repliesTo')}</span>
            <span className="font-semibold text-[#2c3342]">{doc.replyTo}</span>
          </div>
          <div className="p-4 text-sm leading-[1.6] text-[#2c3342]">
            <p>
              {t('reminders.send.preview.dear')}{' '}
              <span className="rounded bg-[#eaedf8] px-1 font-semibold text-[#2c4eb7]">
                {doc.contactFirstName}
              </span>
              ,
            </p>
            <p className="mt-3">
              {t('reminders.send.preview.body1')}{' '}
              <span className="rounded bg-[#eaedf8] px-1 font-semibold text-[#2c4eb7]">
                {doc.rows[0].value}
              </span>{' '}
              {t('reminders.send.preview.body2')}
            </p>
            <dl className="mt-4 flex flex-col">
              {doc.rows.map((row) => (
                <div
                  key={row.labelKey}
                  className="flex items-center justify-between gap-3 border-b border-[#f3f3f3] py-2.5 last:border-b-0"
                >
                  <dt className="text-sm text-[#5b606c]">{t(row.labelKey)}</dt>
                  <dd className="text-sm font-semibold text-[#2c3342]">{withRial(row.value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4">{t('reminders.send.preview.body3')}</p>
            <span className="mt-4 inline-flex h-10 items-center rounded-sm bg-[#2c4eb7] px-4 text-sm font-semibold text-white">
              {t('reminders.send.preview.cta')}
            </span>
            <p className="mt-4">
              {t('reminders.send.preview.signOff')}
              <br />
              Hafidh Saif
              <br />
              Al Bahja Coffee
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#e8e8ea] bg-[#fafafa] px-4 py-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e8ea] bg-white px-2.5 py-1 text-xs font-medium text-[#2c3342]">
              {doc.attachment}
            </span>
            <span className="text-xs font-medium text-[#737781]">
              {t('reminders.send.preview.attached')}
            </span>
          </div>
        </div>
      </FieldGroup>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#444957]"
        >
          <img src={editOneIcon} alt="" className="size-5" />
          {t('reminders.send.editJustThisOne')}
        </button>
        <button
          type="button"
          onClick={onEditTemplate}
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#444957]"
        >
          <img src={editTemplateIcon} alt="" className="size-5" />
          {t('reminders.send.editTemplate')}
        </button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------ template editor */

export function TemplateEditorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const doc = TEMPLATE_DRAFT

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={t(doc.titleKey)}
      width="max-w-[657px]"
      footer={
        <>
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-[#e8e8ea] bg-white px-6 text-base font-medium text-[#3a3a3a]"
          >
            {t('reminders.template.sendTest')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[46px] items-center rounded-sm bg-[#2c4eb7] px-6 text-base font-semibold text-white"
          >
            {t('reminders.template.save')}
          </button>
        </>
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-[62px] shrink-0 flex-col items-center justify-center rounded-sm border border-[#e8e8ea]">
            <span className="text-xl font-semibold leading-[1.2] text-[#2c3342]">{doc.days}</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.04em] text-[#5b606c]">
              {t('reminders.daysLate')}
            </span>
          </span>
          <div className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-medium leading-[1.2] text-[#151c2d]">
                {t(doc.titleKey)}
              </span>
              <span
                className={[
                  'inline-flex items-center rounded-full px-2.5 py-[3px] text-xs font-semibold',
                  TONE_CHIP[doc.tone],
                ].join(' ')}
              >
                {t(TONE_LABEL[doc.tone])}
              </span>
            </span>
            <p className="mt-1.5 text-sm font-medium leading-[1.3] text-[#5b606c]">
              {t(doc.descriptionKey)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('linkModal.close')}
          className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-black/[0.04]"
        >
          <img src={closeIcon} alt="" className="size-5" />
        </button>
      </div>

      <div className="mt-5 h-px w-full bg-border-subtle" />

      {/* Editor on the left, live preview of the same template on the right. */}
      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_226px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#737781]">
            {t('reminders.template.subjectLine')}
          </p>
          <div className="mt-2 flex h-[50px] items-center rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary">
            {doc.subject}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.06em] text-[#737781]">
            {t('reminders.template.message')}
          </p>
          <div className="mt-2 whitespace-pre-line rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm leading-[1.6] text-text-secondary">
            {doc.body}
          </div>
        </div>

        <div className="overflow-hidden rounded-sm border border-[#e8e8ea] bg-[#fafafa]">
          <p className="border-b border-[#e8e8ea] px-3 py-2.5 text-base font-medium text-[#151c2d]">
            {t('reminders.template.livePreview')}
          </p>
          <div className="bg-white p-3 text-[9px] leading-[1.5] text-[#2c3342]">
            <p className="text-[8px] text-[#737781]">
              {t('reminders.send.preview.from')} {SEND_TARGET.from} to
              <br />
              {SEND_TARGET.to}
            </p>
            <p className="mt-1.5 text-[8px]">
              {t('reminders.template.invoiceWord')}{' '}
              <span className="rounded bg-[#eaedf8] px-0.5 font-semibold text-[#2c4eb7]">
                INV-2038
              </span>{' '}
              — just a reminder
            </p>
            <p className="mt-2">
              {t('reminders.send.preview.dear')}{' '}
              <span className="rounded bg-[#eaedf8] px-0.5 font-semibold text-[#2c4eb7]">
                Khalid
              </span>
              ,
            </p>
            <p className="mt-1.5">
              {t('reminders.send.preview.body1')}{' '}
              <span className="rounded bg-[#eaedf8] px-0.5 font-semibold text-[#2c4eb7]">
                INV-2038
              </span>{' '}
              {t('reminders.send.preview.body2')}
            </p>
            <dl className="mt-2 flex flex-col">
              {SEND_TARGET.rows.map((row) => (
                <div
                  key={row.labelKey}
                  className="flex items-center justify-between gap-2 border-b border-[#f3f3f3] py-1 last:border-b-0"
                >
                  <dt className="text-[#5b606c]">{t(row.labelKey)}</dt>
                  <dd className="font-semibold">{withRial(row.value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2">{t('reminders.send.preview.body3')}</p>
            <span className="mt-2 inline-flex items-center rounded-sm bg-[#2c4eb7] px-2 py-1 text-[9px] font-semibold text-white">
              {t('reminders.send.preview.cta')}
            </span>
            <p className="mt-2">{t('reminders.send.preview.signOff')}</p>
            <p className="mt-0.5">
              <span className="rounded bg-[#eaedf8] px-0.5 font-semibold text-[#2c4eb7]">
                Hafidh Saif
              </span>
            </p>
            <p className="mt-0.5">
              <span className="rounded bg-[#eaedf8] px-0.5 font-semibold text-[#2c4eb7]">
                Al Bahja Coffee
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 border-t border-[#e8e8ea] px-3 py-2 text-[8px] text-[#737781]">
            <span className="text-[#2c3342]">{SEND_TARGET.attachment}</span>
            <span>{t('reminders.template.attached')}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
