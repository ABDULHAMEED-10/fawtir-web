import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Select, SelectionCard, withRial } from '../../../components/ui'
import {
  invoicesOf,
  linksOf,
  planLabelKey,
  subscriptionOf,
  subscriptionsStore,
  tenantIdentity,
  whatsappUrl,
  type LinkChannel,
  type PaymentLink,
  type SubscriptionInvoice,
} from '../../../lib/consoleSubscriptions'
import { PLATFORM_SETTINGS } from '../../../lib/platformSettings'
import { omr } from '../../../lib/superAdmin'
import {
  Field,
  ModalFooter,
  dayLabel,
  focusFirstInvalidField,
  useInvoiceOptions,
  type ActionModalProps,
  type Errors,
} from './modalFields'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'

const FORM_ID = 'send-link'
const CHANNELS: LinkChannel[] = ['whatsapp', 'email', 'copied']

type FieldName = 'invoice' | 'channel'

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.2c-.4.3-.8 0-.8-.5V6.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8 9h8M8 12.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="m4.5 7 7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <path
        d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Sends a Thawani checkout link for an unpaid invoice. The backend creates the session; here the
 * operator picks the channel — a `wa.me` chat with the message filled in, an email draft, or the
 * bare link to paste anywhere — and the console keeps the link with its status and expiry.
 * Resending expires the earlier link for the same invoice (the store does that).
 */
export function SendLinkModal({ tenantId, ledger, invoiceId, onClose, onDone }: ActionModalProps) {
  const { t, i18n } = useTranslation()
  const tenant = tenantIdentity(tenantId)
  const subscription = subscriptionOf(ledger, tenantId)
  const open = invoicesOf(ledger, tenantId).filter(
    (invoice) => invoice.status === 'unpaid' || invoice.status === 'overdue',
  )
  const initialInvoice = open.find((invoice) => invoice.id === invoiceId) ?? open[0]
  const [invoice, setInvoice] = useState(initialInvoice?.id ?? '')
  const [channel, setChannel] = useState<LinkChannel>('whatsapp')
  const [errors, setErrors] = useState<Errors<FieldName>>({})
  const [sent, setSent] = useState<PaymentLink | null>(null)
  const [copied, setCopied] = useState(false)

  const chosen = open.find((entry) => entry.id === invoice)
  const invoiceOptions = useInvoiceOptions(open)
  const days = PLATFORM_SETTINGS.payments.linkExpiryDays
  const language = i18n.language.startsWith('ar') ? 'ar' : 'en'

  /** The customer's message, in their language, with the link — or a stand-in before it exists. */
  const messageFor = (target: SubscriptionInvoice, url: string) => {
    const plan = subscription ? t(planLabelKey(subscription.plan)) : ''
    return PLATFORM_SETTINGS.payments.whatsappTemplate[language]
      .replace('{{contact}}', tenant.contact.name)
      .replace('{{plan}}', plan)
      .replace(
        '{{period}}',
        `${dayLabel(target.periodStart, i18n.language)} – ${dayLabel(target.periodEnd, i18n.language)}`,
      )
      // The letters stay in the text that leaves Fawtir (WhatsApp, email have no rial sign);
      // the preview on screen draws the sign through withRial.
      .replace('{{amount}}', `OMR ${omr(target.total)}`)
      .replace('{{link}}', url)
      .replace('{{days}}', String(days))
  }

  const previousUrl = linksOf(ledger, tenantId).find((link) => link.invoiceId === invoice)?.url
  const preview = chosen
    ? messageFor(
        chosen,
        sent?.url ?? previousUrl ?? `[${t('console.subscriptionActions.sendLink.previewLink')}]`,
      )
    : ''

  const copy = async (text: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      /* the browser refused the clipboard; the URL is on screen to select by hand */
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<FieldName> = {}
    if (!chosen) next.invoice = t('validation.required')
    setErrors(next)
    if (!chosen) {
      focusFirstInvalidField(event.currentTarget, ['invoice', 'channel'], next)
      return
    }
    const link = subscriptionsStore.sendLink({ tenantId, invoiceId: chosen.id, via: channel })
    const message = messageFor(chosen, link.url)
    if (channel === 'whatsapp') {
      window.open(whatsappUrl(tenant.contact.phone, message), '_blank', 'noopener')
    } else if (channel === 'email') {
      const subject = t('console.subscriptionActions.sendLink.emailSubject', {
        plan: subscription ? t(planLabelKey(subscription.plan)) : '',
      })
      window.location.href = `mailto:${tenant.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    } else {
      void copy(link.url)
    }
    setSent(link)
  }

  const finish = () => {
    if (sent) {
      onDone(
        t('console.tenantDetail.done.linkSent', {
          channel: t(`console.subscriptions.channel.${sent.sentVia}`),
          contact: tenant.contact.name,
        }),
      )
    } else onClose()
  }

  const channelCard = (id: LinkChannel, icon: React.ReactNode, description: string) => (
    <SelectionCard
      key={id}
      title={t(`console.subscriptionActions.sendLink.${id}.title`)}
      description={description}
      icon={icon}
      selected={channel === id}
      onSelect={() => setChannel(id)}
    />
  )

  return (
    <Modal
      open
      width={640}
      onClose={finish}
      title={t('console.subscriptionActions.sendLink.title')}
      subtitle={t('console.subscriptionActions.sendLink.subtitle', { tenant: tenant.name })}
      footer={
        sent ? (
          <div className="flex flex-wrap justify-end gap-2.5">
            <ConsoleButton type="button" size="md" onClick={finish}>
              {t('console.subscriptionActions.sendLink.done')}
            </ConsoleButton>
          </div>
        ) : (
          <ModalFooter
            formId={FORM_ID}
            onCancel={onClose}
            submitLabel={t(`console.subscriptionActions.sendLink.submit.${channel}`)}
            disabled={open.length === 0}
          />
        )
      }
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-sm bg-success-100 px-4 py-3">
            <p className="text-sm font-semibold text-success-700">
              {t('console.subscriptionActions.sendLink.sentTitle')}
            </p>
            <p className="mt-1 text-xs font-medium leading-[1.5] text-success-700">
              {t('console.subscriptionActions.sendLink.sentBody', {
                date: dayLabel(sent.expiresAt, i18n.language),
              })}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-3 max-md:flex-wrap">
            <span
              dir="ltr"
              className="min-w-0 flex-1 truncate text-sm font-medium text-text-secondary max-md:basis-full"
            >
              {sent.url}
            </span>
            <ConsoleButton type="button" size="md" variant="secondary" onClick={() => void copy(sent.url)}>
              {copied
                ? t('console.subscriptionActions.sendLink.copiedNow')
                : t('console.subscriptionActions.sendLink.copy')}
            </ConsoleButton>
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t('console.subscriptionActions.sendLink.preview')}
            </p>
            <p
              dir="auto"
              className="mt-1 whitespace-pre-wrap rounded-sm bg-surface-background px-4 py-3 text-sm font-medium leading-[1.6] text-text-tertiary"
            >
              {withRial(preview)}
            </p>
          </div>
        </div>
      ) : (
        <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
          {open.length === 0 ? (
            <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium leading-[1.5] text-text-tertiary">
              {t('console.subscriptionActions.common.noOpenInvoice')}
            </p>
          ) : null}

          <Field
            name="invoice"
            label={t('console.subscriptionActions.common.invoice')}
            required
            error={errors.invoice}
          >
            <Select
              value={invoice}
              onChange={(value) => {
                setInvoice(value)
                setErrors({})
              }}
              options={invoiceOptions}
              disabled={open.length === 0}
              ariaLabel={t('console.subscriptionActions.common.invoice')}
            />
          </Field>

          <Field name="channel" label={t('console.subscriptionActions.sendLink.channel')}>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {CHANNELS.map((id) =>
                channelCard(
                  id,
                  id === 'whatsapp' ? <ChatIcon /> : id === 'email' ? <MailIcon /> : <LinkIcon />,
                  t(`console.subscriptionActions.sendLink.${id}.description`, {
                    phone: tenant.contact.phone,
                    email: tenant.contact.email,
                  }),
                ),
              )}
            </div>
          </Field>

          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-text-primary">
                {t('console.subscriptionActions.sendLink.preview')}
              </p>
              <p className="text-xs font-medium text-text-quaternary">
                {t('console.subscriptionActions.sendLink.validDays', { count: days })}
              </p>
            </div>
            <p
              dir="auto"
              className="mt-1 whitespace-pre-wrap rounded-sm bg-surface-background px-4 py-3 text-sm font-medium leading-[1.6] text-text-tertiary"
            >
              {withRial(preview)}
            </p>
          </div>
        </form>
      )}
    </Modal>
  )
}
