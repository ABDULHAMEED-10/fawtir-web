import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '../../../components/ui'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleSettingsFrame } from '../../../layouts/ConsoleShell/ConsoleSettingsFrame'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead, type ConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { CONSOLE_PAGE, ConsolePageHeader } from '../../../layouts/ConsoleShell/consoleStyle'
import { forgetCompanyContact } from '../../../lib/companyContact'
import {
  COMPANY_CONTACT_HISTORY_PATH,
  COMPANY_CONTACT_MANAGE_PERMISSION,
  COMPANY_CONTACT_MAX,
  COMPANY_CONTACT_PATH,
  COMPANY_CONTACT_READ_PERMISSION,
  contactAuthor,
  contactRefusalKey,
  isContactConflict,
  isContactEmail,
  isContactPhone,
  isHttpsUrl,
  saveCompanyContact,
  type CompanyContactDto,
  type CompanyContactRequest,
} from '../../../lib/console/companyContact'
import { formatInstant } from '../../../lib/format'
import { hasPermission, peekEntitlements } from '../../../lib/identity/entitlements'
import { FieldGrid, SectionFooter, SettingsSectionCard } from '../settings/shared'
import { SettingsHistory } from './SettingsHistory'

const K = 'console.companyContact.'

type Field = keyof CompanyContactRequest
type Form = Record<Field, string>
type Errors = Partial<Record<Field, string>>

const OPTIONAL: readonly Field[] = [
  'websiteUrl',
  'addressEn',
  'addressAr',
  'linkedinUrl',
  'instagramUrl',
]
const URLS: readonly Field[] = ['websiteUrl', 'linkedinUrl', 'instagramUrl']

/**
 * Fawtir's own contact details (CS-1, decision D1): what the app, Fawtir's mails and the public
 * site show when they tell someone how to reach Fawtir. A versioned record like the seller: a save
 * sends `If-Match` with the version read and a reason, and publishes the next version; the
 * earlier ones stay listed below. The server adds MFA, no impersonation and the production
 * PLATFORM realm. Read with the billing read permission; an operator without the manage one sees
 * it read-only.
 */
export function ConsoleCompanyContactPage() {
  return (
    <ConsoleShell requires={COMPANY_CONTACT_READ_PERMISSION}>
      <CompanyContact />
    </ConsoleShell>
  )
}

/**
 * The screen's body. `embedded`: one section of Console › Settings › Fawtir company details,
 * under that page's frame, so it draws no frame or page column of its own.
 */
export function CompanyContact({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  // 204 (before the backend's migration has seeded version 1) parses as no body.
  const { read, retry } = useConsoleRead<CompanyContactDto | undefined>(COMPANY_CONTACT_PATH)
  const history = useConsoleRead<CompanyContactDto[]>(COMPANY_CONTACT_HISTORY_PATH)
  // Kept here, outside the form, so the conflict message survives the reload that remounts it.
  const [failure, setFailure] = useState<string | null>(null)
  const entitlements = peekEntitlements()
  const canManage = entitlements
    ? hasPermission(entitlements, COMPANY_CONTACT_MANAGE_PERMISSION)
    : false

  const reload = () => {
    retry()
    history.retry()
  }

  let body: ReactNode
  if (read.status === 'loading') body = <ConsoleNotice busy body={t(`${K}loading`)} />
  else if (read.status === 'failed') body = <ConsoleReadFailure error={read.error} retry={retry} />
  else {
    body = (
      <ContactForm
        key={read.data?.version ?? 0}
        contact={read.data ?? null}
        canManage={canManage}
        onSaved={() => {
          setFailure(null)
          // The app's own copy of the details reads the new version next time it is used.
          forgetCompanyContact()
          reload()
        }}
        onRefused={(error) => {
          setFailure(t(contactRefusalKey(error)))
          if (isContactConflict(error)) reload()
        }}
      />
    )
  }

  return (
    <div className={embedded ? 'flex flex-col gap-5' : CONSOLE_PAGE}>
      {embedded ? null : <ConsoleSettingsFrame tab="company" />}
      <ConsolePageHeader level={embedded ? 'subsection' : 'section'} title={t(`${K}title`)} subtitle={t(`${K}subtitle`)} />
      {failure ? (
        <p
          role="alert"
          className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {failure}
        </p>
      ) : null}
      {body}
      <History read={history.read} />
    </div>
  )
}

function toForm(contact: CompanyContactDto | null): Form {
  return {
    supportEmail: contact?.supportEmail ?? '',
    supportPhone: contact?.supportPhone ?? '',
    websiteUrl: contact?.websiteUrl ?? '',
    addressEn: contact?.addressEn ?? '',
    addressAr: contact?.addressAr ?? '',
    linkedinUrl: contact?.linkedinUrl ?? '',
    instagramUrl: contact?.instagramUrl ?? '',
    reason: '',
  }
}

function ContactForm({
  contact,
  canManage,
  onSaved,
  onRefused,
}: {
  contact: CompanyContactDto | null
  canManage: boolean
  onSaved: () => void
  onRefused: (error: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  const stored = toForm(contact)
  const [form, setForm] = useState<Form>(stored)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const errors = attempted ? validate(form) : {}
  const dirty = JSON.stringify({ ...form, reason: '' }) !== JSON.stringify(stored)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (Object.keys(validate(form)).length > 0) {
      setAttempted(true)
      return
    }
    const value = (field: Field) => form[field].trim()
    // An emptied optional field is sent as null, which the server reads as "not shown".
    const optional = (field: Field) => value(field) || null
    const request: CompanyContactRequest = {
      supportEmail: value('supportEmail'),
      supportPhone: value('supportPhone').replace(/\s+/g, ' '),
      websiteUrl: optional('websiteUrl'),
      addressEn: optional('addressEn'),
      addressAr: optional('addressAr'),
      linkedinUrl: optional('linkedinUrl'),
      instagramUrl: optional('instagramUrl'),
      reason: value('reason'),
    }
    setBusy(true)
    try {
      await saveCompanyContact(contact?.version ?? 0, request)
      onSaved()
    } catch (error) {
      onRefused(error)
    } finally {
      setBusy(false)
    }
  }

  const field = (name: Field, options: { ltr?: boolean; rtl?: boolean; hint?: string } = {}) => {
    const key = errors[name]
    return (
      <Input
        bordered
        name={name}
        label={t(`${K}${name}`)}
        hint={options.hint ?? (OPTIONAL.includes(name) ? t(`${K}optional`) : undefined)}
        autoComplete="off"
        spellCheck={false}
        type={name === 'supportEmail' ? 'email' : name === 'supportPhone' ? 'tel' : 'text'}
        dir={options.ltr ? 'ltr' : options.rtl ? 'rtl' : undefined}
        maxLength={COMPANY_CONTACT_MAX[name]}
        value={form[name]}
        onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
        error={key ? t(key) : undefined}
      />
    )
  }

  return (
    <SettingsSectionCard
      title={t(`${K}card`)}
      note={!canManage ? t(`${K}readOnly`) : contact ? t(`${K}cardNote`) : t(`${K}none`)}
      onSubmit={submit}
      footer={
        canManage ? (
          <SectionFooter
            dirty={dirty && !busy}
            isDefault
            savedBy={
              contact
                ? t('console.billingSettings.lastChange', {
                    reason: contact.reason,
                    when: formatInstant(contact.createdAt, i18n.language),
                  })
                : undefined
            }
            onReset={() => {}}
          />
        ) : null
      }
    >
      <fieldset disabled={!canManage || busy} className="min-w-0">
        <FieldGrid>
          {field('supportEmail', { ltr: true })}
          {field('supportPhone', { ltr: true, hint: t(`${K}supportPhoneHint`) })}
          {field('websiteUrl', { ltr: true, hint: t(`${K}urlHint`) })}
          {field('addressEn')}
          {field('addressAr', { rtl: true })}
          {field('linkedinUrl', { ltr: true, hint: t(`${K}urlHint`) })}
          {field('instagramUrl', { ltr: true, hint: t(`${K}urlHint`) })}
        </FieldGrid>
        {canManage ? <FieldGrid>{field('reason')}</FieldGrid> : null}
      </fieldset>
    </SettingsSectionCard>
  )
}

/** Error keys by field, the database's own checks, so the server's 400 is the exception. */
function validate(form: Form): Errors {
  const errors: Errors = {}
  const value = (field: Field) => form[field].trim()
  for (const required of ['supportEmail', 'supportPhone', 'reason'] as const) {
    if (!value(required)) errors[required] = 'console.settings.error.required'
  }
  if (value('supportEmail') && !isContactEmail(value('supportEmail')))
    errors.supportEmail = `${K}error.email`
  if (value('supportPhone') && !isContactPhone(value('supportPhone').replace(/\s+/g, ' ')))
    errors.supportPhone = `${K}error.phone`
  for (const url of URLS) {
    if (value(url) && !isHttpsUrl(value(url))) errors[url] = `${K}error.url`
  }
  return errors
}

/** Newest first, as the server sends it. The first is the version in force, shown above. */
function History({ read }: { read: ConsoleRead<CompanyContactDto[]> }) {
  const { t } = useTranslation()
  if (read.status === 'loading') return null
  if (read.status === 'failed') {
    return <p className="text-xs font-medium text-text-tertiary">{t(`${K}historyFailed`)}</p>
  }
  return (
    <SettingsHistory
      id="company-contact-history"
      title={t(`${K}history`)}
      entries={read.data.slice(1).map((entry) => ({
        id: entry.id ?? String(entry.version),
        title: [
          t(`${K}version`, { version: entry.version }),
          entry.supportEmail,
          entry.supportPhone,
        ].join(' · '),
        reason: entry.reason,
        createdBy: contactAuthor(entry),
        createdAt: entry.createdAt,
      }))}
    />
  )
}
