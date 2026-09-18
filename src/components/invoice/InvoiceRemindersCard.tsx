import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks'
import {
  invoiceRemindersPath,
  loadInvoiceReminders,
  loadReminderPreview,
  reminderPreviewPath,
  sendReminderNow,
  type ReminderLogDto,
  type ReminderPreviewDto,
} from '../../api/invoices/reminders'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { OUTCOME_TONE, REMINDER_REFUSALS, VERDICT_NOTE, canSendByHand, outcomeNote, rungNote, rungToday } from '../../lib/paymentReminders'
import { ApiError } from '../../api'

const TONE: Record<'ok' | 'warn' | 'muted', string> = {
  ok: 'text-text-secondary',
  warn: 'text-warning-700',
  muted: 'text-text-quaternary',
}

/**
 * Payment reminders for one invoice (I-14).
 *
 * Preview is the only forward-looking answer the API has, and only for today — so the card shows
 * what **would** go out now, including the real subject and body rather than a template nobody can
 * edit, and the history of the rungs already spent.
 *
 * A rung is spent once for ever: a failed send still consumes it and there is no retry, so sending
 * by hand is offered plainly and its refusals are named rather than swallowed.
 */
const muscatToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

export function InvoiceRemindersCard({ invoiceId, dueDate }: { invoiceId: string; dueDate: string | null }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canSend = can(session, 'invoice.payment.manage')

  // Preview at today's distance from the due date rather than bare. Bare, the server answers with
  // no rung and no message on every day but a rung day — so the message a reminder would carry
  // would be unreadable for almost every invoice, which is the one thing this card is for.
  const rung = rungToday(muscatToday(), dueDate)
  const previewPath = reminderPreviewPath(invoiceId, rung)
  const preview = useApiRead<ReminderPreviewDto>(previewPath, () => loadReminderPreview(previewPath))
  const historyPath = invoiceRemindersPath(invoiceId)
  const history = useApiRead<ReminderLogDto[]>(historyPath, () => loadInvoiceReminders(historyPath))

  const [showMessage, setShowMessage] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const shown = preview.read.status === 'ready' ? preview.read.data : null
  const rows = history.read.status === 'ready' ? history.read.data : []

  const send = async () => {
    setSending(true)
    setNotice(null)
    try {
      const sent = await sendReminderNow(invoiceId, shown?.rung ?? rung)
      preview.retry()
      history.retry()
      setNotice(t('paymentReminders.invoice.sent', { recipient: sent.recipient ?? '' }))
    } catch (error) {
      // The four reminder refusals each mean something specific — a spent rung, a deployment with
      // no mail sender — and the generic 409/503 wording would lose all of it.
      const code = error instanceof ApiError ? error.code : null
      if (code && REMINDER_REFUSALS[code]) {
        setNotice(t(REMINDER_REFUSALS[code]))
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setNotice(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
      }
      // A refusal can mean the rung is now spent, so what the page shows is re-read either way.
      preview.retry()
      history.retry()
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="rounded-sm bg-surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-primary">{t('paymentReminders.invoice.title')}</h2>
        {canSend && shown && canSendByHand(shown.verdict) ? (
          <button
            type="button"
            disabled={sending}
            onClick={() => void send()}
            className="inline-flex items-center gap-2 text-base font-semibold text-primary-800 hover:text-primary-700 disabled:opacity-50"
          >
            {t(sending ? 'paymentReminders.invoice.sending' : 'paymentReminders.invoice.sendNow')}
          </button>
        ) : null}
      </div>

      {notice ? <p className="mt-2 text-sm font-medium text-text-secondary">{notice}</p> : null}

      {shown ? (
        <>
          <p className="mt-2 text-sm font-medium text-text-tertiary">
            {t(VERDICT_NOTE[shown.verdict])}
            {canSendByHand(shown.verdict) && shown.verdict !== 'SEND' ? ` ${t('paymentReminders.invoice.stillSendable')}` : ''}
          </p>
          {shown.rung !== null ? (
            <p className="mt-1 text-sm font-medium text-text-quaternary">
              {t('paymentReminders.invoice.rung', { rung: t(rungNote(shown.rung).key, rungNote(shown.rung).values) })}
              {shown.recipient ? ` · ${shown.recipient}` : ''}
            </p>
          ) : null}

          {shown.subject ? (
            <>
              <button
                type="button"
                onClick={() => setShowMessage(!showMessage)}
                className="mt-3 text-sm font-semibold text-primary-700 hover:underline"
              >
                {t(showMessage ? 'paymentReminders.invoice.hideMessage' : 'paymentReminders.invoice.showMessage')}
              </button>
              {showMessage ? (
                <div className="mt-2 rounded-sm border border-border-subtle p-3">
                  <p className="text-sm font-semibold text-text-primary">{shown.subject}</p>
                  {/* The body is plain text with blank-line paragraphs, and is shown as it will be
                      sent: this is the message itself, not a template anyone can edit. */}
                  <p className="mt-2 whitespace-pre-line text-sm font-medium text-text-tertiary">{shown.body}</p>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-text-secondary">{t('paymentReminders.invoice.historyTitle')}</h3>
        {rows.length === 0 ? (
          <p className="mt-1 text-sm font-medium text-text-quaternary">{t('paymentReminders.invoice.noHistory')}</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {rows.map((row) => {
              const note = outcomeNote(row)
              const rung = rungNote(row.daysFromDue)
              return (
                <li key={`${row.invoiceId}-${row.daysFromDue}`} className="flex flex-wrap items-center gap-2 border-b border-surface-background py-2 last:border-0">
                  <span className="text-sm font-medium text-text-secondary">{formatDate(row.firedOn, language)}</span>
                  <span className="text-sm font-medium text-text-quaternary">{t(rung.key, rung.values)}</span>
                  <span className={['ms-auto text-sm font-medium', TONE[OUTCOME_TONE[row.outcome]]].join(' ')}>{t(note.key, note.values)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
