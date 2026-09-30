import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox, DateField, Modal, OmAmount, type SelectOption } from '../../components/ui'
import { LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import {
  loadReminderPreview,
  reminderPreviewPath,
  sendReminderNow,
  type ReminderPreviewDto,
} from '../../api/invoices/reminders'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import {
  REMINDER_REFUSALS,
  VERDICT_NOTE,
  addDays,
  canSendByHand,
  normaliseOffsets,
  rungNote,
  rungToday,
  stepOf,
  type QueueEntry,
  type ReminderTone,
} from '../../lib/paymentReminders'
import pauseWhiteIcon from '../../assets/reminders/pause-white.svg'
import sendWhiteIcon from '../../assets/reminders/send-white.svg'
import editOneIcon from '../../assets/reminders/edit-one.svg'
import editTemplateIcon from '../../assets/reminders/edit-template.svg'
import noteTextIcon from '../../assets/periodic/invoice-tile.svg'

/**
 * The three dialogs of the reminders design: Send a reminder (159:17635), Pause reminders
 * (159:17558) and the template editor (159:17724). Send is wired to the API's preview and send;
 * the other two draw what the design draws and say plainly that the backend has nothing behind
 * them yet (TODO(backend): per-invoice pause with a resume date and a reason; editable messages).
 */

export const TONE_CHIP: Record<ReminderTone, string> = {
  polite: 'bg-success-100 text-success-700',
  direct: 'bg-neutral-25 text-neutral-700',
  firm: 'bg-danger-100 text-danger-700',
}

const muscatToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

const SECONDARY =
  'inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-6 text-base font-medium text-[#3a3a3a] transition-colors hover:bg-primary-25 disabled:opacity-50'
const PRIMARY =
  'inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-6 text-base font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50'

export function ToneChip({ tone }: { tone: ReminderTone }) {
  const { t } = useTranslation()
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-[3px] text-xs font-semibold',
        TONE_CHIP[tone],
      ].join(' ')}
    >
      {t(`reminders.tones.${tone}`)}
    </span>
  )
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-quaternary">
        {label}
        {hint ? (
          <span className="text-xs font-medium normal-case tracking-normal text-text-tertiary">
            {hint}
          </span>
        ) : null}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

/** The invoice this action applies to, as the design's grey strip under the title. */
function TargetStrip({ entry, amountNote }: { entry: QueueEntry; amountNote?: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const invoice = entry.invoice
  const meta = [
    invoice.dueDate
      ? t('reminders.queue.dueOn', { date: formatDate(invoice.dueDate, language) })
      : null,
    invoice.daysOverdue ? t('reminders.queue.overdueDays', { count: invoice.daysOverdue }) : null,
    entry.spent.length === 0
      ? t('reminders.send.noReminderYet')
      : t('reminders.send.lastReminder', { date: formatDate(entry.spent[0].firedOn, language) }),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-subtle bg-surface-tab-bar p-3">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
          <img src={noteTextIcon} alt="" className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-medium leading-[1.2] text-text-primary">
            {invoice.invoiceNumber ?? invoice.id} · {invoice.customerName ?? ''}
          </span>
          <span className="mt-1 block text-xs font-medium leading-[1.2] text-text-tertiary">
            {meta}
          </span>
        </span>
      </span>
      {invoice.outstanding !== null ? (
        <span className="text-end">
          <OmAmount
            size="sm"
            amount={formatAmount(invoice.outstanding, invoice.currency, language)}
            amountClassName="text-lg font-semibold leading-[1.2] text-text-secondary tabular-nums"
          />
          {amountNote ? (
            <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
              {amountNote}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------- send a reminder */

export function SendReminderModal({
  entry,
  entries,
  offsets,
  canSend,
  onClose,
  onSent,
}: {
  /** The invoice to chase, or null to pick one first (the header's "Send a reminder"). */
  entry: QueueEntry | null
  entries: QueueEntry[]
  offsets: number[]
  canSend: boolean
  onClose: () => void
  onSent: (recipient: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [chosenId, setChosenId] = useState(entry?.invoice.id ?? '')
  const chosen = entry ?? entries.find((candidate) => candidate.invoice.id === chosenId) ?? null
  const ladder = normaliseOffsets(offsets)
  const today = muscatToday()
  // Today's distance from the due date, as the invoice page uses. Not the queue's next rung: that
  // can be a later one, and the server writes the message from the rung it is given, so sending it
  // early would tell the customer the wrong number of days and spend that rung before its day.
  const fallback = chosen ? rungToday(today, chosen.invoice.dueDate) : null
  const [picked, setPicked] = useState<number | null>(null)
  const rung = picked ?? fallback ?? ladder[0] ?? null
  const previewPath = chosen ? reminderPreviewPath(chosen.invoice.id, rung) : null
  const preview = useApiRead<ReminderPreviewDto>(previewPath, () =>
    loadReminderPreview(previewPath ?? ''),
  )
  const shown = preview.read.status === 'ready' ? preview.read.data : null
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const send = async () => {
    if (!chosen) return
    setSending(true)
    setNotice(null)
    try {
      const sent = await sendReminderNow(chosen.invoice.id, rung)
      onSent(sent.recipient)
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null
      if (code && REMINDER_REFUSALS[code]) setNotice(t(REMINDER_REFUSALS[code]))
      else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setNotice(
          message.reference
            ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
            : body,
        )
      }
      preview.retry()
    } finally {
      setSending(false)
    }
  }

  const invoiceOptions: SelectOption[] = entries.map((candidate) => ({
    value: candidate.invoice.id,
    label: `${candidate.invoice.invoiceNumber ?? candidate.invoice.id} · ${candidate.invoice.customerName ?? ''}`,
    hint:
      candidate.invoice.outstanding !== null
        ? formatAmount(candidate.invoice.outstanding, candidate.invoice.currency, language)
        : undefined,
  }))
  const sendable = Boolean(chosen && canSend && shown && canSendByHand(shown.verdict))

  return (
    <Modal
      open
      onClose={onClose}
      title={t('reminders.send.title')}
      subtitle={t('reminders.send.subtitle')}
      width={685}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onClose} className={SECONDARY}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!sendable || sending}
            onClick={() => void send()}
            className={PRIMARY}
          >
            <img src={sendWhiteIcon} alt="" className="size-5" />
            {t(sending ? 'paymentReminders.invoice.sending' : 'reminders.send.sendNow')}
          </button>
        </div>
      }
    >
      {entry ? null : (
        <Group label={t('reminders.send.whichInvoice')}>
          <Combobox
            options={invoiceOptions}
            value={chosenId}
            onChange={(value) => {
              setChosenId(value)
              setPicked(null)
            }}
            ariaLabel={t('reminders.send.whichInvoice')}
            placeholder={t('reminders.send.chooseInvoice')}
            searchPlaceholder={t('reminders.queue.searchPlaceholder')}
            emptyText={t('reminders.send.noUnpaid')}
          />
        </Group>
      )}

      {chosen ? (
        <>
          <TargetStrip entry={chosen} amountNote={t('reminders.send.outstanding')} />

          <Group label={t('reminders.send.whichMessage')}>
            <div className="grid gap-3 sm:grid-cols-3">
              {ladder.map((offset) => {
                const step = stepOf(ladder, offset)
                const note = rungNote(offset)
                const active = offset === rung
                return (
                  <button
                    key={offset}
                    type="button"
                    onClick={() => setPicked(offset)}
                    aria-pressed={active}
                    className={[
                      'flex flex-col gap-2 rounded-sm border p-4 text-start',
                      active
                        ? 'border-primary-700 bg-primary-25/60'
                        : 'border-border-subtle bg-white',
                    ].join(' ')}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-medium leading-[1.2] text-text-primary">
                        {t(step.nameKey)}
                      </span>
                      <ToneChip tone={step.tone} />
                    </span>
                    <span className="text-sm font-medium leading-[1.2] text-text-tertiary">
                      {t(note.key, note.values)}
                    </span>
                  </button>
                )
              })}
              {ladder.length === 0 ? (
                <p className="text-sm font-medium text-text-quaternary sm:col-span-3">
                  {t('paymentReminders.settings.noRungs')}
                </p>
              ) : null}
            </div>
          </Group>

          {notice ? (
            <p role="alert" className="mt-4 text-sm font-medium text-warning-700">
              {notice}
            </p>
          ) : null}
          {shown && shown.verdict !== 'SEND' ? (
            <p className="mt-4 text-sm font-medium text-text-tertiary">
              {t(VERDICT_NOTE[shown.verdict])}
              {canSendByHand(shown.verdict)
                ? ` ${t('paymentReminders.invoice.stillSendable')}`
                : ''}
            </p>
          ) : null}

          <Group label={t('reminders.send.to')} hint={t('reminders.send.toHint')}>
            <div className="flex h-[50px] items-center rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary">
              {shown?.recipient ?? chosen.email ?? t('paymentReminders.verdict.noRecipient')}
            </div>
          </Group>

          <Group label={t('reminders.send.subject')}>
            <div className="flex h-[50px] items-center rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary">
              {shown?.subject ?? (preview.read.status === 'loading' ? '…' : '—')}
            </div>
          </Group>

          <Group label={t('reminders.send.preview.label')}>
            <div className="overflow-hidden rounded-sm border border-border-subtle">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle bg-surface-tab-bar px-4 py-2.5 text-xs font-medium text-text-tertiary">
                <span>{t('reminders.send.preview.to')}</span>
                <span className="font-semibold text-text-secondary">
                  {shown?.recipient ?? chosen.email ?? '—'}
                </span>
                {shown?.language ? (
                  <span>· {t('reminders.send.language', { language: shown.language })}</span>
                ) : null}
              </div>
              {preview.read.status === 'loading' ? <LoadingNotice /> : null}
              {/* The real message the server would send, not a template: plain text with blank-line paragraphs. */}
              <p className="whitespace-pre-line p-4 text-sm leading-[1.6] text-text-secondary">
                {shown?.body ??
                  (preview.read.status === 'failed' ? t('reminders.send.noPreview') : '')}
              </p>
            </div>
          </Group>

          {/* TODO(backend): the message is fixed in the server; neither button can act yet. */}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled
              title={t('reminders.send.editNotYet')}
              className="inline-flex h-10 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary disabled:opacity-50"
            >
              <img src={editOneIcon} alt="" className="size-5" />
              {t('reminders.send.editJustThisOne')}
            </button>
            <button
              type="button"
              disabled
              title={t('reminders.send.editNotYet')}
              className="inline-flex h-10 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary disabled:opacity-50"
            >
              <img src={editTemplateIcon} alt="" className="size-5" />
              {t('reminders.send.editTemplate')}
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  )
}

/* ------------------------------------------------------------- pause reminders */

const PAUSE_REASONS = ['promised', 'dispute', 'correction', 'relationship', 'other'] as const

export function PauseRemindersModal({
  entry,
  onClose,
  onConfirm,
}: {
  entry: QueueEntry
  onClose: () => void
  /** TODO(backend): there is no per-invoice pause; the caller says so. */
  onConfirm: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const today = muscatToday()
  const [scope, setScope] = useState<'invoice' | 'customer'>('invoice')
  const [reason, setReason] = useState<(typeof PAUSE_REASONS)[number]>('promised')
  const [resume, setResume] = useState<'in7' | 'onDate'>('in7')
  const [date, setDate] = useState(addDays(today, 7))
  const [note, setNote] = useState('')
  const until = resume === 'in7' ? addDays(today, 7) : date
  const customer = entry.invoice.customerName ?? ''

  return (
    <Modal
      open
      onClose={onClose}
      title={t('reminders.pause.title')}
      subtitle={t('reminders.pause.subtitle')}
      width={626}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onClose} className={SECONDARY}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={onConfirm} className={PRIMARY}>
            <img src={pauseWhiteIcon} alt="" className="size-5" />
            {t('reminders.pause.confirm', {
              date: formatDate(until, language).replace(/\s\d{4}$/, ''),
            })}
          </button>
        </div>
      }
    >
      <TargetStrip entry={entry} />

      <Group label={t('reminders.pause.whatToPause')}>
        <div className="flex flex-col gap-3">
          {(['invoice', 'customer'] as const).map((option) => {
            const active = option === scope
            return (
              <label
                key={option}
                className={[
                  'flex cursor-pointer items-start gap-3 rounded-sm border p-3',
                  active ? 'border-primary-700 bg-primary-25/60' : 'border-border-subtle',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => setScope(option)}
                  className="mt-0.5 size-5 shrink-0 rounded-[4px] accent-primary-700"
                />
                <span className="min-w-0">
                  <span className="block text-base font-medium leading-[1.2] text-text-primary">
                    {t(
                      option === 'invoice'
                        ? 'reminders.pause.scopeInvoice'
                        : 'reminders.pause.scopeCustomer',
                    )}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-[1.2] text-text-tertiary">
                    {t(
                      option === 'invoice'
                        ? 'reminders.pause.scopeInvoiceNoteFor'
                        : 'reminders.pause.scopeCustomerNoteFor',
                      { customer },
                    )}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </Group>

      <Group label={t('reminders.pause.why')} hint={t('reminders.pause.whyHint')}>
        <div className="flex flex-wrap gap-2">
          {PAUSE_REASONS.map((option) => {
            const active = option === reason
            return (
              <button
                key={option}
                type="button"
                onClick={() => setReason(option)}
                aria-pressed={active}
                className={[
                  'inline-flex h-[38px] items-center rounded-full px-4 text-sm font-medium leading-[1.2]',
                  active
                    ? 'bg-primary-700 text-white'
                    : 'border border-border-default bg-white text-text-secondary',
                ].join(' ')}
              >
                {t(`reminders.pause.reasons.${option}`)}
              </button>
            )
          })}
        </div>
      </Group>

      <Group label={t('reminders.pause.resume')}>
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
                    ? 'border-primary-700 bg-primary-25/60 text-primary-700'
                    : 'border-border-subtle bg-white text-text-secondary',
                ].join(' ')}
              >
                {t(option === 'in7' ? 'reminders.pause.in7Days' : 'reminders.pause.onADate')}
              </button>
            )
          })}
        </div>
        {resume === 'onDate' ? (
          <div className="mt-3">
            <DateField
              value={date}
              min={today}
              ariaLabel={t('reminders.pause.onADate')}
              onChange={setDate}
            />
          </div>
        ) : null}
      </Group>

      <Group label={t('reminders.pause.note')}>
        <textarea
          value={note}
          rows={3}
          aria-label={t('reminders.pause.note')}
          placeholder={t('reminders.pause.notePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
          className="min-h-[96px] w-full resize-y rounded-sm border border-primary-300 bg-surface-tab-bar p-3 text-sm font-medium leading-[1.5] text-text-secondary outline-none placeholder:text-text-placeholder"
        />
      </Group>
    </Modal>
  )
}

/* ------------------------------------------------------------- template editor */

export function TemplateEditorModal({
  offsets,
  offset,
  onClose,
}: {
  offsets: number[]
  offset: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const step = stepOf(offsets, offset)
  const note = rungNote(offset)

  return (
    <Modal
      open
      onClose={onClose}
      title={t(step.nameKey)}
      width={657}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled
            title={t('reminders.template.fixed')}
            className={SECONDARY}
          >
            {t('reminders.template.sendTest')}
          </button>
          <button type="button" disabled title={t('reminders.template.fixed')} className={PRIMARY}>
            {t('reminders.template.save')}
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <span className="flex size-[62px] shrink-0 flex-col items-center justify-center rounded-sm border border-border-subtle">
          <span className="text-xl font-semibold leading-[1.2] text-text-secondary">
            {offset > 0 ? `+${offset}` : String(offset)}
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            {t(offset < 0 ? 'reminders.daysEarly' : 'reminders.daysLate')}
          </span>
        </span>
        <div className="min-w-0">
          <ToneChip tone={step.tone} />
          <p className="mt-1.5 text-sm font-medium leading-[1.3] text-text-tertiary">
            {t('reminders.template.description', {
              step: t(step.nameKey),
              when: t(note.key, note.values),
            })}
          </p>
        </div>
      </div>

      <div className="mt-5 h-px w-full bg-border-subtle" />

      {/* TODO(backend): the subject and body are fixed in the server; nothing here can be saved. */}
      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_226px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-quaternary">
            {t('reminders.template.subjectLine')}
          </p>
          <div className="mt-2 flex h-[50px] items-center rounded-sm border border-border-subtle bg-surface-tab-bar px-4 text-sm font-medium text-text-quaternary">
            {t('reminders.template.fixedShort')}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.06em] text-text-quaternary">
            {t('reminders.template.message')}
          </p>
          <div className="mt-2 min-h-[160px] rounded-sm border border-border-subtle bg-surface-tab-bar p-4 text-sm leading-[1.6] text-text-quaternary">
            {t('reminders.template.fixed')}
          </div>
        </div>
        <div className="overflow-hidden rounded-sm border border-border-subtle bg-surface-tab-bar">
          <p className="border-b border-border-subtle px-3 py-2.5 text-base font-medium text-text-primary">
            {t('reminders.template.livePreview')}
          </p>
          <p className="p-3 text-xs font-medium leading-[1.5] text-text-tertiary">
            {t('reminders.template.previewFromInvoice')}
          </p>
        </div>
      </div>
    </Modal>
  )
}
