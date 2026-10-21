import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  createCustomer,
  newCustomerKey,
  type CustomerRecordDto,
} from '../../api/customers/customers'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  blankCustomerForm,
  customerProblems,
  placeCustomerErrors,
  toCustomerRequest,
  type CustomerField,
  type CustomerFormValues,
  type PlacedCustomerError,
} from '../../lib/customerForm'
import { emailList } from '../../lib/supplierForm'
import { Select } from '../ui'
import closeIcon from '../../assets/add-customer/close.svg'
import tickIcon from '../../assets/add-customer/tick.svg'
import companyIcon from '../../assets/add-customer/company.svg'
import privateIcon from '../../assets/add-customer/private.svg'
import arrowIcon from '../../assets/add-customer/arrow.svg'
import omanFlag from '../../assets/add-customer/oman-flag.svg'

export type CustomerProfileKind = 'company' | 'private'

type AddCustomerModalProps = {
  open: boolean
  /** The kind the invoice is being written for: a business invoice adds a company. */
  kind?: CustomerProfileKind
  onClose: () => void
  /** The customer the API created, ready to put on the invoice. */
  onCreated: (customer: CustomerRecordDto) => void
}

const COUNTRIES = ['OM', 'AE', 'SA', 'QA', 'KW', 'BH']

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <p className="mb-1 inline-flex items-center gap-0.5 text-sm font-medium text-text-primary">
      {label}
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
    </p>
  )
}

function TextField({
  label,
  required,
  placeholder,
  value,
  onChange,
  error,
  maxLength,
}: {
  label: string
  required?: boolean
  placeholder?: string
  value: string
  onChange: (value: string) => void
  /** Already-translated message. */
  error?: string
  maxLength?: number
}) {
  const id = useId()
  return (
    <div className="flex w-full flex-col">
      <label htmlFor={id}>
        <FieldLabel label={label} required={required} />
      </label>
      <div
        className={[
          'flex h-[50px] w-full items-center justify-between rounded-sm border bg-surface-tab-bar px-4',
          error ? 'border-border-danger' : 'border-primary-300',
        ].join(' ')}
      >
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** The app's listbox in the modal's field shell; a native select cannot take the frame's look. */
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex w-full flex-col">
      <FieldLabel label={label} />
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} highlighted />
    </div>
  )
}

function PhoneField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const id = useId()
  return (
    <div className="flex w-full flex-col">
      <label htmlFor={id}>
        <FieldLabel label={label} />
      </label>
      <div
        className={[
          'flex h-[50px] w-full items-center gap-2 rounded-sm border bg-surface-tab-bar px-4',
          error ? 'border-border-danger' : 'border-[#e3e4ea]',
        ].join(' ')}
      >
        <img src={omanFlag} alt="" className="size-5 shrink-0" />
        <span className="shrink-0 text-sm font-medium tracking-[0.14px] text-text-secondary">
          +968
        </span>
        <input
          id={id}
          type="tel"
          placeholder="9XXX XXXX"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function SectionHeader({
  step,
  title,
  collapsible,
  collapsed,
  onToggle,
}: {
  step: number
  title: string
  collapsible?: boolean
  collapsed?: boolean
  onToggle?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold text-primary-800">
          {step}
        </span>
        <h3 className="text-xl font-medium text-text-secondary">{title}</h3>
      </div>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary-800"
        >
          <span className="inline-block h-px w-3 bg-primary-800" />
          {collapsed ? t('addCustomer.expand') : t('addCustomer.collapse')}
        </button>
      ) : null}
    </div>
  )
}

/** The director's two names on the design become the record's single contact person. */
type QuickValues = CustomerFormValues & { contactFirst: string; contactLast: string }

function blankQuick(kind: CustomerProfileKind): QuickValues {
  return {
    ...blankCustomerForm(kind === 'company' ? 'BUSINESS' : 'CONSUMER'),
    contactFirst: '',
    contactLast: '',
  }
}

/**
 * Add a customer without leaving the invoice (decision of 2026-09-16, I-02). The same rules and the
 * same request as the full form, on the fields this modal draws. A company registered on Peppol is
 * reached at its VAT number under Oman's 0248 scheme; the invoice goes out over Peppol when it is,
 * as an e-mailed PDF when there is an address to send it to, and as a QR receipt otherwise.
 */
export function AddCustomerModal({
  open,
  kind: initialKind = 'company',
  onClose,
  onCreated,
}: AddCustomerModalProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<CustomerProfileKind>(initialKind)
  const [values, setValues] = useState<QuickValues>(() => blankQuick(initialKind))
  const [addressOpen, setAddressOpen] = useState(true)
  const [notesOpen, setNotesOpen] = useState(true)
  const [errors, setErrors] = useState<Partial<Record<CustomerField, PlacedCustomerError>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(newCustomerKey)
  const inFlight = useRef(false)

  useEffect(() => {
    if (!open) return
    setKind(initialKind)
    setValues(blankQuick(initialKind))
    setErrors({})
    setFailure(null)
    setKey(newCustomerKey())
  }, [open, initialKind])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const company = kind === 'company'
  const set = <F extends keyof QuickValues>(field: F, value: QuickValues[F]) => {
    setValues((current) => ({ ...current, [field]: value }))
    const path: CustomerField | undefined =
      field === 'contactFirst' || field === 'contactLast'
        ? 'contactPerson'
        : (field as CustomerField)
    setErrors((current) => (path && current[path] ? { ...current, [path]: undefined } : current))
  }
  const setAddress = (
    field: 'attention' | 'countryCode' | 'cityName' | 'streetName' | 'poBox',
    value: string,
  ) => {
    setValues((current) => ({ ...current, invoice: { ...current.invoice, [field]: value } }))
  }
  const setKept = (field: 'buildingNumber' | 'additionalStreetName', value: string) => {
    setValues((current) => ({
      ...current,
      invoice: {
        ...current.invoice,
        kept: { ...current.invoice.kept, [field]: value.trim() === '' ? null : value },
      },
    }))
  }
  const errorText = (field: CustomerField) => {
    const placed = errors[field]
    if (!placed) return undefined
    return 'key' in placed ? t(placed.key) : placed.text
  }

  const switchKind = (next: CustomerProfileKind) => {
    if (next === kind) return
    setKind(next)
    setValues((current) => ({
      ...blankQuick(next),
      emails: current.emails,
      telephone: current.telephone,
      mobilePhone: current.mobilePhone,
      preferredLanguage: current.preferredLanguage,
      invoice: current.invoice,
      note: current.note,
    }))
    setErrors({})
  }

  /** What the modal's fields mean as a customer record. */
  const asForm = (): CustomerFormValues => {
    const vat = values.vatNumber.trim().toUpperCase()
    const onPeppol = company && values.registeredOnPeppol
    const hasEmail = emailList(values.emails).length > 0
    return {
      ...values,
      contactPerson: company
        ? `${values.contactFirst.trim()} ${values.contactLast.trim()}`.trim()
        : '',
      registeredForVat: company,
      vatNumber: company ? vat : '',
      registeredOnPeppol: onPeppol,
      peppolId: onPeppol && vat ? `0248:${vat}` : '',
      sendingMethod: onPeppol ? 'PEPPOL' : hasEmail ? 'EMAIL_PDF' : 'QR_RECEIPT',
    }
  }

  const handleSave = async () => {
    if (inFlight.current) return
    const form = asForm()
    const problems = customerProblems(form)
    // The Peppol ID is derived from the VAT number here, so its refusal belongs to that field.
    if (problems.peppolId && !problems.vatNumber) problems.vatNumber = problems.peppolId
    delete problems.peppolId
    const placed = Object.fromEntries(
      Object.entries(problems).map(([field, messageKey]) => [field, { key: messageKey }]),
    )
    setErrors(placed)
    setFailure(null)
    if (Object.keys(placed).length > 0) return
    inFlight.current = true
    setBusy(true)
    try {
      const created = await createCustomer(key, toCustomerRequest(form))
      onCreated(created)
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const { fields, other } = placeCustomerErrors(error.fieldErrors)
        if (fields.peppolId && !fields.vatNumber) fields.vatNumber = fields.peppolId
        setErrors(fields)
        if (other.length > 0) setFailure([t('customerForm.serverRefused'), ...other].join(' '))
      } else if (error instanceof ApiError && error.status === 409) {
        setFailure(t('customerForm.duplicate'))
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setFailure(
          message.reference
            ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
            : body,
        )
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const languageOptions = [
    { value: '', label: t('supplierForm.notSet') },
    { value: 'ar', label: t('supplierForm.language.ar') },
    { value: 'en', label: t('supplierForm.language.en') },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-customer-title"
      onClick={onClose}
    >
      <div
        className="my-4 flex w-full max-w-[720px] flex-col overflow-hidden rounded-sm bg-white shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[min(85dvh,900px)] flex-col overflow-y-auto p-6">
          <div className="mb-4 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 id="add-customer-title" className="text-2xl font-medium text-text-primary">
                {t('addCustomer.title')}
              </h2>
              <p className="mt-0.5 text-sm font-medium text-text-quaternary">
                {t('addCustomer.subtitle')}
              </p>
            </div>
            <button
              type="button"
              aria-label={t('addCustomer.close')}
              onClick={onClose}
              className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full bg-text-primary/[0.04]"
            >
              <img src={closeIcon} alt="" className="size-5" />
            </button>
          </div>

          {failure ? (
            <p
              role="alert"
              className="mb-4 rounded-sm border border-border-danger bg-white p-3 text-sm font-medium text-text-danger"
            >
              {failure}
            </p>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                {
                  id: 'company' as const,
                  icon: companyIcon,
                  titleKey: 'addCustomer.kinds.company',
                  subKey: 'addCustomer.kinds.companySub',
                },
                {
                  id: 'private' as const,
                  icon: privateIcon,
                  titleKey: 'addCustomer.kinds.private',
                  subKey: 'addCustomer.kinds.privateSub',
                },
              ] as const
            ).map((option) => {
              const active = kind === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => switchKind(option.id)}
                  className={[
                    'flex h-[65px] items-center justify-between rounded-sm p-4 text-start',
                    active
                      ? 'border-2 border-primary-500 bg-primary-50'
                      : 'border border-border-default bg-white',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2">
                    <img src={option.icon} alt="" className="size-6 shrink-0" />
                    <span>
                      <span className="block text-base font-medium tracking-[0.16px] text-text-primary">
                        {t(option.titleKey)}
                      </span>
                      <span className="block text-xs font-medium tracking-[0.12px] text-text-tertiary">
                        {t(option.subKey)}
                      </span>
                    </span>
                  </span>
                  {active ? <img src={tickIcon} alt="" className="size-[18px] shrink-0" /> : null}
                </button>
              )
            })}
          </div>

          <div className="mb-4 flex flex-col gap-3">
            <SectionHeader
              step={1}
              title={
                company
                  ? t('addCustomer.sections.companyDetails')
                  : t('addCustomer.sections.personalDetails')
              }
            />
            <div className="h-px w-full bg-border-subtle" />
            {company ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* TODO(go-live): show `OM` as a fixed prefix and take only the 10 digits (owner,
                      21 Oct 2026). Held back for now: Peppol testing uses receivers outside the
                      Omani VAT scheme (9922:OPTBCNTRLP1007), so the VAT is still free text. */}
                  <TextField
                    label={t('addCustomer.fields.vat')}
                    required
                    placeholder="OM1100000000"
                    maxLength={64}
                    value={values.vatNumber}
                    onChange={(next) => set('vatNumber', next.toUpperCase())}
                    error={errorText('vatNumber')}
                  />
                  <TextField
                    label={t('addCustomer.fields.corporateName')}
                    required
                    maxLength={200}
                    value={values.legalName}
                    onChange={(next) => set('legalName', next)}
                    error={errorText('legalName')}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label={t('addCustomer.fields.directorFirst')}
                    required
                    maxLength={100}
                    value={values.contactFirst}
                    onChange={(next) => set('contactFirst', next)}
                    error={errorText('contactPerson')}
                  />
                  <TextField
                    label={t('addCustomer.fields.lastNameManager')}
                    maxLength={99}
                    value={values.contactLast}
                    onChange={(next) => set('contactLast', next)}
                  />
                </div>
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={t('addCustomer.fields.firstName')}
                  required
                  maxLength={100}
                  value={values.firstName}
                  onChange={(next) => set('firstName', next)}
                  error={errorText('firstName')}
                />
                <TextField
                  label={t('addCustomer.fields.lastName')}
                  required
                  maxLength={100}
                  value={values.lastName}
                  onChange={(next) => set('lastName', next)}
                  error={errorText('lastName')}
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t('addCustomer.fields.email')}
                placeholder="name@company.om"
                value={values.emails}
                onChange={(next) => set('emails', next)}
                error={errorText('emails')}
              />
              <SelectField
                label={t('addCustomer.fields.language')}
                value={values.preferredLanguage}
                onChange={(next) =>
                  set('preferredLanguage', next as QuickValues['preferredLanguage'])
                }
                options={languageOptions}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PhoneField
                label={t('addCustomer.fields.telephone')}
                value={values.telephone}
                onChange={(next) => set('telephone', next)}
                error={errorText('telephone')}
              />
              <PhoneField
                label={t('addCustomer.fields.mobile')}
                value={values.mobilePhone}
                onChange={(next) => set('mobilePhone', next)}
                error={errorText('mobilePhone')}
              />
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3">
            <SectionHeader
              step={2}
              title={t('addCustomer.sections.address')}
              collapsible
              collapsed={!addressOpen}
              onToggle={() => setAddressOpen((v) => !v)}
            />
            <div className="h-px w-full bg-border-subtle" />
            {addressOpen ? (
              <Grouped>
                <TextField
                  label={t('addCustomer.fields.attn')}
                  maxLength={200}
                  value={values.invoice.attention}
                  onChange={(next) => setAddress('attention', next)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label={t('addCustomer.fields.country')}
                    value={values.invoice.countryCode}
                    onChange={(next) => setAddress('countryCode', next)}
                    options={COUNTRIES.map((code) => ({
                      value: code,
                      label: t(`supplierForm.country.${code}`),
                    }))}
                  />
                  <TextField
                    label={t('addCustomer.fields.city')}
                    maxLength={150}
                    value={values.invoice.cityName}
                    onChange={(next) => setAddress('cityName', next)}
                    error={errorText('invoice.cityName')}
                  />
                </div>
                {/* Zone, street and building, as the frame draws them. The zone has no member of its own on
                    the address, so it rides in the additional street line (UBL's district slot). */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField
                    label={t('addCustomer.fields.zone')}
                    maxLength={100}
                    value={values.invoice.kept.additionalStreetName ?? ''}
                    onChange={(next) => setKept('additionalStreetName', next)}
                  />
                  <TextField
                    label={t('addCustomer.fields.street')}
                    maxLength={150}
                    value={values.invoice.streetName}
                    onChange={(next) => setAddress('streetName', next)}
                    error={errorText('invoice.streetName')}
                  />
                  <TextField
                    label={t('addCustomer.fields.building')}
                    maxLength={50}
                    value={values.invoice.kept.buildingNumber ?? ''}
                    onChange={(next) => setKept('buildingNumber', next)}
                  />
                </div>
                <TextField
                  label={t('addCustomer.fields.poBox')}
                  maxLength={30}
                  value={values.invoice.poBox}
                  onChange={(next) => setAddress('poBox', next)}
                />
              </Grouped>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader
              step={3}
              title={t('addCustomer.sections.notes')}
              collapsible
              collapsed={!notesOpen}
              onToggle={() => setNotesOpen((v) => !v)}
            />
            <div className="h-px w-full bg-border-subtle" />
            {notesOpen ? (
              <div>
                <FieldLabel label={t('addCustomer.fields.note')} />
                <textarea
                  rows={3}
                  maxLength={2000}
                  aria-label={t('addCustomer.fields.note')}
                  placeholder={t('customerForm.notePlaceholder')}
                  value={values.note}
                  onChange={(event) => set('note', event.target.value)}
                  className="w-full resize-none rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-black/10 bg-surface-tab-bar px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[54px] w-[92px] items-center justify-center rounded-sm border border-border-subtle bg-white text-base font-semibold text-text-secondary transition-colors hover:bg-white"
          >
            {t('addCustomer.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="inline-flex h-[54px] min-w-[255px] items-center justify-center gap-1.5 rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
          >
            {busy ? t('supplierForm.saving') : t('addCustomer.save')}
            <img src={arrowIcon} alt="" className="size-[18px] rtl:-scale-x-100" />
          </button>
        </div>
      </div>
    </div>
  )
}

function Grouped({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>
}
