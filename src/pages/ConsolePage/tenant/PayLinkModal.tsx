import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input, Modal, Select, SelectionCard, withRial } from '../../../components/ui'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { formatDate } from '../../../lib/format'
import {
  createPayLink,
  describePayLinkFailure,
  whatsappChatUrl,
  type CreatedPayLinkDto,
  type PayLinkChannel,
  type PayLinkLanguage,
  type SubscriptionBillDto,
} from '../../../lib/console/payLinks'
import { ChatIcon, LinkIcon, MailIcon } from '../subscriptions/SendLinkModal'
import {
  Field,
  ModalFooter,
  focusFirstInvalidField,
  type Errors,
} from '../subscriptions/modalFields'

const K = 'console.payLinks.send.'
const FORM_ID = 'pay-link-send'
const CHANNELS: PayLinkChannel[] = ['EMAIL', 'WHATSAPP', 'COPIED']
const ICON: Record<PayLinkChannel, ReactNode> = {
  EMAIL: <MailIcon />,
  WHATSAPP: <ChatIcon />,
  COPIED: <LinkIcon />,
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldName = 'bill' | 'payerName' | 'payerEmail' | 'payerPhone'

export type PayLinkContact = { name: string | null; email: string | null; phone: string | null }

/**
 * The Send payment link modal on the real API (P2-8 §3.12), in the look of the sample-data
 * `SendLinkModal` it replaces for real companies: the open bill, the channel (Fawtir emails it, a
 * WhatsApp chat the operator opens, or the link to copy), the language, and the payer's details,
 * prefilled from the company contact.
 *
 * The server builds the link and the message. The address is in that one answer only: the modal
 * shows it with Copy and Open WhatsApp, says it will not be shown again, and keeps it nowhere else.
 * One Idempotency-Key per form as filled in, so a retried click returns the same link.
 */
export function PayLinkModal({
  tenantName,
  bills,
  billId,
  contact,
  validityDays,
  onClose,
  onDone,
}: {
  tenantName: string
  /** The company's OPEN bills. */
  bills: SubscriptionBillDto[]
  billId?: string
  contact: PayLinkContact
  /** From the billing settings; null when the read is not available. */
  validityDays: number | null
  onClose: () => void
  onDone: (created: CreatedPayLinkDto, billId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [bill, setBill] = useState(billId ?? bills[0]?.id ?? '')
  const [channel, setChannel] = useState<PayLinkChannel>('EMAIL')
  const [language, setLanguage] = useState<PayLinkLanguage>(
    i18n.language.startsWith('ar') ? 'ar' : 'en',
  )
  const [payerName, setPayerName] = useState(contact.name ?? '')
  const [payerEmail, setPayerEmail] = useState(contact.email ?? '')
  const [payerPhone, setPayerPhone] = useState(contact.phone ?? '')
  const [errors, setErrors] = useState<Errors<FieldName>>({})
  const [failure, setFailure] = useState<FormMessage | null>(null)
  const [sending, setSending] = useState(false)
  const [created, setCreated] = useState<CreatedPayLinkDto | null>(null)
  const [copied, setCopied] = useState(false)
  const key = useRef<string | null>(null)

  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      // A different request is a different link: the next click gets a new key.
      key.current = null
      setFailure(null)
      setErrors({})
      set(value)
    }

  const chosen = bills.find((entry) => entry.id === bill)
  const day = (iso: string) => formatDate(iso, i18n.language)

  const copy = async (text: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      /* the browser refused the clipboard; the address is on screen to select by hand */
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending) return
    const next: Errors<FieldName> = {}
    if (!chosen) next.bill = t('validation.required')
    if (channel === 'EMAIL' && !EMAIL.test(payerEmail.trim())) {
      next.payerEmail = payerEmail.trim() ? t(`${K}emailInvalid`) : t('validation.required')
    } else if (payerEmail.trim() && !EMAIL.test(payerEmail.trim())) {
      next.payerEmail = t(`${K}emailInvalid`)
    }
    if (channel === 'WHATSAPP' && payerPhone.replace(/\D/g, '').length < 8) {
      next.payerPhone = payerPhone.trim() ? t(`${K}phoneInvalid`) : t('validation.required')
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || !chosen) {
      focusFirstInvalidField(
        event.currentTarget,
        ['bill', 'payerName', 'payerEmail', 'payerPhone'],
        next,
      )
      return
    }
    key.current ??= crypto.randomUUID()
    setSending(true)
    setFailure(null)
    try {
      const answer = await createPayLink(
        chosen.id,
        {
          channel,
          language,
          ...(payerName.trim() ? { payerName: payerName.trim() } : {}),
          ...(payerEmail.trim() ? { payerEmail: payerEmail.trim() } : {}),
          ...(payerPhone.trim() ? { payerPhone: payerPhone.trim() } : {}),
        },
        key.current,
      )
      setCreated(answer)
      if (answer.payLinkUrl && channel === 'COPIED')
        void copy(answer.shareText ?? answer.payLinkUrl)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      setFailure(describePayLinkFailure(error))
    } finally {
      setSending(false)
    }
  }

  const finish = () => {
    if (created && chosen) onDone(created, chosen.id)
    else onClose()
  }

  return (
    <Modal
      open
      width={640}
      onClose={() => {
        if (!sending) finish()
      }}
      title={t(`${K}title`)}
      subtitle={t(`${K}subtitle`, { tenant: tenantName })}
      footer={
        created ? (
          <div className="flex flex-wrap justify-end gap-2.5">
            <ConsoleButton type="button" size="md" onClick={finish}>
              {t(`${K}done`)}
            </ConsoleButton>
          </div>
        ) : (
          <ModalFooter
            formId={FORM_ID}
            onCancel={onClose}
            submitLabel={sending ? t(`${K}sending`) : t(`${K}submit.${channel}`)}
            disabled={bills.length === 0 || sending}
          />
        )
      }
    >
      {created ? (
        <Created created={created} phone={payerPhone} copied={copied} onCopy={copy} day={day} />
      ) : (
        <form
          id={FORM_ID}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-5"
        >
          {bills.length === 0 ? (
            <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium leading-[1.5] text-text-tertiary">
              {t(`${K}noOpenBill`)}
            </p>
          ) : null}

          <Field name="bill" label={t(`${K}bill`)} required error={errors.bill}>
            <Select
              value={bill}
              onChange={change(setBill)}
              options={bills.map((entry) => ({
                value: entry.id,
                label: t(`${K}billOption`, { number: entry.number }),
                hint: entry.dueOn ? t(`${K}billHint`, { date: day(entry.dueOn) }) : undefined,
              }))}
              disabled={bills.length === 0}
              ariaLabel={t(`${K}bill`)}
            />
          </Field>

          <Field name="channel" label={t(`${K}channel`)}>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {CHANNELS.map((id) => (
                <SelectionCard
                  key={id}
                  title={t(`${K}channels.${id}.title`)}
                  description={t(`${K}channels.${id}.description`)}
                  icon={ICON[id]}
                  selected={channel === id}
                  onSelect={() => change(setChannel)(id)}
                />
              ))}
            </div>
          </Field>

          <Field name="language" label={t(`${K}language`)}>
            <Select
              value={language}
              onChange={(value) => change(setLanguage)(value as PayLinkLanguage)}
              options={[
                { value: 'en', label: t(`${K}languages.en`) },
                { value: 'ar', label: t(`${K}languages.ar`) },
              ]}
              ariaLabel={t(`${K}language`)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Input
              bordered
              name="payerName"
              label={t(`${K}payerName`)}
              autoComplete="off"
              maxLength={100}
              value={payerName}
              onChange={(event) => change(setPayerName)(event.target.value)}
              error={errors.payerName}
            />
            <Input
              bordered
              name="payerEmail"
              type="email"
              dir="ltr"
              label={t(`${K}payerEmail`)}
              requiredMark={channel === 'EMAIL'}
              autoComplete="off"
              maxLength={255}
              value={payerEmail}
              onChange={(event) => change(setPayerEmail)(event.target.value)}
              error={errors.payerEmail}
            />
            <Input
              bordered
              name="payerPhone"
              type="tel"
              dir="ltr"
              label={t(`${K}payerPhone`)}
              requiredMark={channel === 'WHATSAPP'}
              autoComplete="off"
              maxLength={20}
              value={payerPhone}
              onChange={(event) => change(setPayerPhone)(event.target.value)}
              error={errors.payerPhone}
            />
          </div>
          <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
            {t(`${K}payerNote`)}
          </p>

          <p className="text-xs font-medium text-text-quaternary">
            {validityDays === null
              ? t(`${K}validityUnknown`)
              : t(`${K}validity`, { count: validityDays })}
          </p>

          {failure ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {t(failure.key, failure.values)}
            </p>
          ) : null}
        </form>
      )}
    </Modal>
  )
}

function Created({
  created,
  phone,
  copied,
  onCopy,
  day,
}: {
  created: CreatedPayLinkDto
  phone: string
  copied: boolean
  onCopy: (text: string) => Promise<void>
  day: (iso: string) => string
}) {
  const { t } = useTranslation()
  if (!created.payLinkUrl) {
    // A replay of the same request: the address was shown once, and the server keeps no copy.
    return (
      <p className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700">
        {t(`${K}shownOnce`)}
      </p>
    )
  }
  const url = created.payLinkUrl
  const message = created.shareText ?? url
  const { link } = created
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-sm bg-success-100 px-4 py-3">
        <p className="text-sm font-semibold text-success-700">{t(`${K}created.${link.channel}`)}</p>
        <p className="mt-1 text-xs font-medium leading-[1.5] text-success-700">
          {t(`${K}createdBody`, {
            date: day(link.expiresAt.slice(0, 10)),
            hint: link.tokenHint,
          })}
        </p>
      </div>
      {created.emailSent === false ? (
        // The link is made and still active; only the email did not go.
        <p className="rounded-sm bg-pending-100 px-4 py-3 text-xs font-semibold leading-[1.5] text-pending-700">
          {t(`${K}emailNotSent`)}
        </p>
      ) : null}
      <p className="rounded-sm bg-pending-100 px-4 py-3 text-xs font-semibold leading-[1.5] text-pending-700">
        {t(`${K}onlyOnce`)}
      </p>
      <div className="flex items-center gap-3 rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-3 max-md:flex-wrap">
        <span
          dir="ltr"
          className="min-w-0 flex-1 truncate text-sm font-medium text-text-secondary max-md:basis-full"
        >
          {url}
        </span>
        <ConsoleButton
          type="button"
          size="md"
          variant="secondary"
          onClick={() => void onCopy(message)}
        >
          {copied ? t(`${K}copiedNow`) : t(`${K}copy`)}
        </ConsoleButton>
        {link.channel === 'WHATSAPP' ? (
          <ConsoleButton
            type="button"
            size="md"
            onClick={() =>
              window.open(whatsappChatUrl(phone, message), '_blank', 'noopener,noreferrer')
            }
          >
            {t(`${K}openWhatsapp`)}
          </ConsoleButton>
        ) : null}
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{t(`${K}message`)}</p>
        <p
          dir="auto"
          className="mt-1 whitespace-pre-wrap break-words rounded-sm bg-surface-background px-4 py-3 text-sm font-medium leading-[1.6] text-text-tertiary"
        >
          {withRial(message)}
        </p>
      </div>
    </div>
  )
}
