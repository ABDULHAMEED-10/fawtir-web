import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import {
  CheckboxRow,
  FieldGrid,
  PhoneField,
  SectionCard,
  SelectField,
  TextAreaField,
  TextField,
  Toggle,
  ToggleInline,
  ToggleRow,
} from '../../components/form'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import {
  CUSTOMERS_PATH,
  createCustomer,
  loadCustomerRecord,
  newCustomerKey,
  updateCustomer,
  type CustomerRecordDto,
  type CustomerSendingMethod,
  type CustomerTypeDto,
} from '../../api/customers/customers'
import { PAYMENT_METHOD_OPTIONS, PAYMENT_TERMS_OPTIONS, TAX_CATEGORY_OPTIONS } from '../../lib/catalogues'
import { describeApiFailure } from '../../lib/apiFailure'
import { can, useSession } from '../../lib/session/session'
import type { AddressField, AddressValues } from '../../lib/supplierForm'
import {
  blankCustomerForm,
  customerProblems,
  fromCustomerRecord,
  placeCustomerErrors,
  toCustomerRequest,
  withType,
  type CustomerField,
  type CustomerFormValues,
  type PlacedCustomerError,
} from '../../lib/customerForm'
import businessIcon from '../../assets/create-invoice/business.svg'
import consumerIcon from '../../assets/customers/type-consumer.svg'
import governmentIcon from '../../assets/customers/type-government.svg'
import tickCircle from '../../assets/customers/tick-circle.svg'
import saveIcon from '../../assets/customers/save.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const TYPE_CARDS: { id: CustomerTypeDto; icon: string; key: 'business' | 'consumer' | 'government' }[] = [
  { id: 'BUSINESS', icon: businessIcon, key: 'business' },
  { id: 'CONSUMER', icon: consumerIcon, key: 'consumer' },
  { id: 'GOVERNMENT', icon: governmentIcon, key: 'government' },
]

const COUNTRIES = ['OM', 'AE', 'SA', 'QA', 'KW', 'BH']
const CURRENCIES = ['OMR', 'USD', 'EUR', 'AED', 'SAR']

/** The inputs in the order they appear, so the first refused one takes the focus. */
const ORDER: CustomerField[] = [
  'firstName',
  'lastName',
  'legalName',
  'vatNumber',
  'defaultBuyerReference',
  'peppolId',
  'contactPerson',
  'roleTitle',
  'emails',
  'telephone',
  'mobilePhone',
  'sendingMethod',
  'defaultCurrency',
  'invoice.cityName',
  'delivery.cityName',
  'note',
]

const inputId = (field: CustomerField) => `customer-${field.replace('.', '-')}`

type FormNotice = { key: string; values?: Record<string, string> } | { body: string }

/** `/customers/new`. */
export function NewCustomerForm() {
  return (
    <AppShell>
      <CustomerFormPage customerId={null} />
    </AppShell>
  )
}

/** `/customers/:id/edit`. One shell for loading and the form, so the session it provides holds. */
export function EditCustomerForm() {
  const { id = '' } = useParams()
  return (
    <AppShell>
      <CustomerFormPage key={id} customerId={id} />
    </AppShell>
  )
}

function CustomerFormPage({ customerId }: { customerId: string | null }) {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const canManage = can(session, 'customer.manage')

  const loaded = useApiRead<CustomerRecordDto>(customerId ? `${CUSTOMERS_PATH}/${customerId}` : null, () => loadCustomerRecord(customerId!))
  const [record, setRecord] = useState<CustomerRecordDto | null>(null)
  const [values, setValues] = useState<CustomerFormValues>(() => blankCustomerForm())
  const [advanced, setAdvanced] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<CustomerField, PlacedCustomerError>>>({})
  const arrived = (location.state as { saved?: string } | null)?.saved
  const [notice, setNotice] = useState<FormNotice | null>(arrived ? { key: 'customerForm.done.created', values: { name: arrived } } : null)
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(newCustomerKey)

  useEffect(() => {
    if (arrived) navigate(location.pathname, { replace: true, state: null })
    // Only on arrival: a reload is not another save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadedRecord = loaded.read.status === 'ready' ? loaded.read.data : null
  useEffect(() => {
    if (!loadedRecord) return
    const next = fromCustomerRecord(loadedRecord)
    setRecord(loadedRecord)
    setValues(next)
    setAdvanced(Boolean(next.defaultPurchaseOrderNumber || next.defaultContractTenderReference || next.entityMinistryCode))
  }, [loadedRecord])

  const editing = customerId !== null
  if (editing && loaded.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {loaded.read.status === 'loading' ? <LoadingNotice /> : <ApiReadFailure error={loaded.read.error} retry={loaded.retry} />}
      </div>
    )
  }
  if (editing && !record) return null

  const consumer = values.type === 'CONSUMER'
  const government = values.type === 'GOVERNMENT'

  const change = <F extends keyof CustomerFormValues>(field: F, value: CustomerFormValues[F]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field as CustomerField] ? { ...current, [field]: undefined } : current))
  }
  const changeAddress = (which: 'invoice' | 'delivery', field: AddressField, value: string) => {
    setValues((current) => ({ ...current, [which]: { ...current[which], [field]: value } }))
    const path = `${which}.${field}` as CustomerField
    setErrors((current) => (current[path] ? { ...current, [path]: undefined } : current))
  }
  const errorText = (field: CustomerField) => {
    const placed = errors[field]
    if (!placed) return undefined
    return 'key' in placed ? t(placed.key) : placed.text
  }
  const focusFirst = (found: Partial<Record<CustomerField, unknown>>) => {
    const first = ORDER.find((field) => found[field])
    if (first) document.getElementById(inputId(first))?.focus()
  }

  const save = async (addAnother: boolean) => {
    const problems = customerProblems(values)
    const placed = Object.fromEntries(Object.entries(problems).map(([field, messageKey]) => [field, { key: messageKey }])) as Partial<
      Record<CustomerField, PlacedCustomerError>
    >
    setErrors(placed)
    setNotice(null)
    setConflict(false)
    if (Object.keys(placed).length > 0) {
      setNotice({ key: 'customerForm.fixFirst' })
      focusFirst(placed)
      return
    }
    setBusy(true)
    try {
      if (editing && record) {
        const saved = await updateCustomer(record.id, { ...toCustomerRequest(values), expectedVersion: record.version })
        setRecord(saved)
        setValues(fromCustomerRecord(saved))
        setNotice({ key: 'customerForm.done.saved' })
      } else {
        const saved = await createCustomer(key, toCustomerRequest(values))
        setKey(newCustomerKey())
        if (addAnother) {
          setValues(blankCustomerForm(values.type))
          setNotice({ key: 'customerForm.done.created', values: { name: saved.displayName } })
          window.scrollTo({ top: 0 })
        } else {
          navigate(`/customers/${saved.id}/edit`, { state: { saved: saved.displayName } })
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const { fields, other } = placeCustomerErrors(error.fieldErrors)
        setErrors(fields)
        setNotice(other.length > 0 ? { body: [t('customerForm.serverRefused'), ...other].join(' ') } : { key: 'customerForm.fixFirst' })
        focusFirst(fields)
      } else if (error instanceof ApiError && error.status === 409) {
        // A duplicate VAT number or Peppol ID and a stale edit share one generic 409; a new customer
        // cannot be stale, so there it is the duplicate.
        setConflict(editing)
        setNotice({ key: editing ? 'customerForm.conflictEdit' : 'customerForm.duplicate' })
      } else if (error instanceof ApiError && error.status === 400 && error.problemType === 'validation-failed') {
        setNotice({ key: 'customerForm.serverRefused' })
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setNotice({ body: message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body })
      }
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void save(false)
  }

  const name = record?.displayName ?? ''
  const saveLabel = busy ? t('supplierForm.saving') : editing ? t('supplierEdit.save') : t('newCustomer.save')
  const sendingOptions: { value: CustomerSendingMethod; label: string }[] = consumer
    ? [
        { value: 'QR_RECEIPT', label: t('newCustomer.sending.qrReceipt') },
        { value: 'EMAIL_PDF', label: t('newCustomer.sending.emailPdf') },
      ]
    : [
        { value: 'PEPPOL', label: t('newCustomer.sending.peppol') },
        { value: 'EMAIL_PDF', label: t('newCustomer.sending.emailPdf') },
        { value: 'QR_RECEIPT', label: t('newCustomer.sending.qrReceipt') },
      ]

  const collapsed = (open: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} className="text-sm font-semibold text-primary-800 hover:underline">
      {open ? t('newCustomer.collapse') : t('newCustomer.expand')}
    </button>
  )

  return (
    <form onSubmit={submit} noValidate className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Link to="/customers" className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary">
            {t('customersPage.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-6 opacity-70 rtl:rotate-180" />
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {editing ? t('customerForm.editTitle', { name }) : t('newCustomer.title')}
          </h1>
          <ToggleInline label={t('newCustomer.advancedFields')} checked={advanced} onChange={setAdvanced} />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/customers"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('newCustomer.cancel')}
          </Link>
          {canManage ? (
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              <img src={saveIcon} alt="" className="size-6 shrink-0 brightness-0 invert" />
              {saveLabel}
            </button>
          ) : null}
        </div>
      </div>

      {!canManage ? <Notice body={t('customerForm.readOnly')} /> : null}
      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key, notice.values) : notice.body}
          action={conflict ? { label: t('supplierForm.reload'), onClick: () => navigate(0) } : { label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      {record && record.invoiceEligible === false ? <Notice body={t('customerForm.notEligible')} /> : null}

      <SectionCard step={1} title={t('newCustomer.sections.customerType')}>
        <div className="grid gap-4 md:grid-cols-3">
          {TYPE_CARDS.map((card) => {
            const active = card.id === values.type
            return (
              <button
                key={card.id}
                type="button"
                // A customer's type is fixed once the record exists; the server refuses a change.
                disabled={editing && !active}
                onClick={() => setValues((current) => withType(current, card.id))}
                aria-pressed={active}
                className={[
                  'flex h-[65px] items-center gap-2 rounded-sm px-4 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active ? 'border-2 border-primary-500 bg-primary-50' : 'border border-border-default hover:border-primary-300',
                ].join(' ')}
              >
                <img src={card.icon} alt="" className={['size-6 shrink-0', active ? '' : 'opacity-70'].join(' ')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium leading-[1.2] text-text-primary">{t(`newCustomer.types.${card.key}.title`)}</span>
                  <span className="block text-xs font-medium leading-[1.2] text-text-tertiary">{t(`newCustomer.types.${card.key}.subtitle`)}</span>
                </span>
                {active ? <img src={tickCircle} alt="" className="size-[18px] shrink-0" /> : null}
              </button>
            )
          })}
        </div>
      </SectionCard>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SectionCard step={2} title={t('newCustomer.sections.details')}>
            <div className="flex flex-col gap-5">
              {consumer ? (
                <FieldGrid>
                  <TextField
                    id={inputId('firstName')}
                    name="firstName"
                    label={t('newCustomer.details.firstName')}
                    placeholder={t('newCustomer.details.firstNamePlaceholder')}
                    required
                    maxLength={100}
                    value={values.firstName}
                    onChange={(next) => change('firstName', next)}
                    error={errorText('firstName')}
                  />
                  <TextField
                    id={inputId('lastName')}
                    name="lastName"
                    label={t('newCustomer.details.lastName')}
                    placeholder={t('newCustomer.details.lastNamePlaceholder')}
                    required
                    maxLength={100}
                    value={values.lastName}
                    onChange={(next) => change('lastName', next)}
                    error={errorText('lastName')}
                  />
                </FieldGrid>
              ) : (
                <>
                  <TextField
                    id={inputId('legalName')}
                    name="legalName"
                    label={government ? t('newCustomer.details.entityName') : t('newCustomer.details.legalName')}
                    placeholder={government ? t('newCustomer.details.entityNamePlaceholder') : t('newCustomer.details.legalNamePlaceholder')}
                    required
                    maxLength={200}
                    value={values.legalName}
                    onChange={(next) => change('legalName', next)}
                    error={errorText('legalName')}
                  />
                  <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
                    <TextField
                      id={inputId('vatNumber')}
                      name="vatNumber"
                      label={t('newCustomer.details.vatNumber')}
                      placeholder="OM1100000000"
                      hint={values.registeredForVat ? undefined : t('supplierForm.notVatRegistered')}
                      required={values.registeredForVat}
                      maxLength={64}
                      value={values.registeredForVat ? values.vatNumber : ''}
                      onChange={(next) => change('vatNumber', next.toUpperCase())}
                      error={errorText('vatNumber')}
                    />
                    <CheckboxRow
                      id="customer-registered-vat"
                      name="registeredForVat"
                      label={t('newCustomer.details.registeredForVat')}
                      checked={values.registeredForVat}
                      onChange={(next) => change('registeredForVat', next)}
                    />
                  </div>
                </>
              )}

              {government ? (
                <FieldGrid>
                  <TextField
                    id={inputId('defaultBuyerReference')}
                    name="defaultBuyerReference"
                    label={t('newCustomer.government.buyerReference')}
                    placeholder={t('newCustomer.government.buyerReferencePlaceholder')}
                    hint={t('newCustomer.government.buyerReferenceHint')}
                    required
                    maxLength={200}
                    value={values.defaultBuyerReference}
                    onChange={(next) => change('defaultBuyerReference', next)}
                    error={errorText('defaultBuyerReference')}
                  />
                  {advanced ? (
                    <TextField
                      id={inputId('entityMinistryCode')}
                      name="entityMinistryCode"
                      label={t('newCustomer.government.entityCode')}
                      placeholder={t('newCustomer.government.entityCodePlaceholder')}
                      maxLength={50}
                      value={values.entityMinistryCode}
                      onChange={(next) => change('entityMinistryCode', next)}
                      error={errorText('entityMinistryCode')}
                    />
                  ) : null}
                  {advanced ? (
                    <TextField
                      id={inputId('defaultPurchaseOrderNumber')}
                      name="defaultPurchaseOrderNumber"
                      label={t('newCustomer.government.purchaseOrder')}
                      placeholder={t('newCustomer.government.purchaseOrderPlaceholder')}
                      maxLength={200}
                      value={values.defaultPurchaseOrderNumber}
                      onChange={(next) => change('defaultPurchaseOrderNumber', next)}
                    />
                  ) : null}
                  {advanced ? (
                    <TextField
                      id={inputId('defaultContractTenderReference')}
                      name="defaultContractTenderReference"
                      label={t('newCustomer.government.contractReference')}
                      placeholder={t('newCustomer.government.contractReferencePlaceholder')}
                      maxLength={200}
                      value={values.defaultContractTenderReference}
                      onChange={(next) => change('defaultContractTenderReference', next)}
                    />
                  ) : null}
                </FieldGrid>
              ) : null}

              {!consumer ? (
                <div className="flex flex-col gap-4 rounded-sm border border-border-brand-subtle bg-primary-25 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-base font-medium leading-[1.2] text-text-primary">{t('newCustomer.details.peppolSection')}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium leading-[1.2] text-text-primary">{t('newCustomer.details.registeredOnPeppol')}</span>
                      <Toggle
                        checked={values.registeredOnPeppol}
                        onChange={(next) => change('registeredOnPeppol', next)}
                        label={t('newCustomer.details.registeredOnPeppol')}
                        name="registeredOnPeppol"
                      />
                    </div>
                  </div>
                  {values.registeredOnPeppol ? (
                    <TextField
                      id={inputId('peppolId')}
                      name="peppolId"
                      label={t('newCustomer.details.peppolId')}
                      placeholder="0248:OM1100000000"
                      required
                      value={values.peppolId}
                      onChange={(next) => change('peppolId', next)}
                      error={errorText('peppolId')}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard step={4} title={t('newCustomer.sections.billing')}>
            <FieldGrid>
              <SelectField
                id={inputId('defaultCurrency')}
                name="defaultCurrency"
                label={t('newCustomer.billing.currency')}
                options={CURRENCIES.map((code) => ({ value: code, label: code }))}
                value={values.defaultCurrency}
                onChange={(next) => change('defaultCurrency', next)}
                error={errorText('defaultCurrency')}
              />
              <SelectField
                id={inputId('defaultTaxCategory')}
                name="defaultTaxCategory"
                label={t('newCustomer.billing.taxCategory')}
                options={withBlank(TAX_CATEGORY_OPTIONS, values.defaultTaxCategory, t('supplierForm.notSet'))}
                value={values.defaultTaxCategory}
                onChange={(next) => change('defaultTaxCategory', next)}
                error={errorText('defaultTaxCategory')}
              />
              <SelectField
                id={inputId('paymentTerms')}
                name="paymentTerms"
                label={t('newCustomer.billing.paymentTerms')}
                options={withBlank(PAYMENT_TERMS_OPTIONS, values.paymentTerms, t('supplierForm.notSet'))}
                value={values.paymentTerms}
                onChange={(next) => change('paymentTerms', next)}
                error={errorText('paymentTerms')}
              />
              <SelectField
                id={inputId('defaultPaymentMethod')}
                name="defaultPaymentMethod"
                label={t('newCustomer.billing.paymentMethod')}
                options={withBlank(
                  PAYMENT_METHOD_OPTIONS.map((option) => ({ ...option, label: t(`invoiceDetails.pay.means.${option.value}`) })),
                  values.defaultPaymentMethod,
                  t('supplierForm.notSet'),
                )}
                value={values.defaultPaymentMethod}
                onChange={(next) => change('defaultPaymentMethod', next)}
                error={errorText('defaultPaymentMethod')}
              />
            </FieldGrid>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard step={3} title={t('newCustomer.sections.contact')}>
            <div className="flex flex-col gap-5">
              {!consumer ? (
                <FieldGrid>
                  <TextField
                    id={inputId('contactPerson')}
                    name="contactPerson"
                    label={t('newCustomer.contact.person')}
                    placeholder={t('newCustomer.contact.personPlaceholder')}
                    required
                    maxLength={200}
                    value={values.contactPerson}
                    onChange={(next) => change('contactPerson', next)}
                    error={errorText('contactPerson')}
                  />
                  <TextField
                    id={inputId('roleTitle')}
                    name="roleTitle"
                    label={t('newCustomer.contact.role')}
                    placeholder={t('newCustomer.contact.rolePlaceholder')}
                    maxLength={100}
                    value={values.roleTitle}
                    onChange={(next) => change('roleTitle', next)}
                    error={errorText('roleTitle')}
                  />
                </FieldGrid>
              ) : null}
              <TextAreaField
                id={inputId('emails')}
                name="emails"
                label={t('newCustomer.contact.email')}
                placeholder="name@company.om"
                value={values.emails}
                onChange={(next) => change('emails', next)}
                error={errorText('emails')}
              />
              <FieldGrid>
                <PhoneField
                  id={inputId('telephone')}
                  name="telephone"
                  label={t('newCustomer.contact.telephone')}
                  value={values.telephone}
                  onChange={(next) => change('telephone', next)}
                  error={errorText('telephone')}
                />
                <PhoneField
                  id={inputId('mobilePhone')}
                  name="mobilePhone"
                  label={t('newCustomer.contact.mobile')}
                  value={values.mobilePhone}
                  onChange={(next) => change('mobilePhone', next)}
                  error={errorText('mobilePhone')}
                />
              </FieldGrid>
              <SelectField
                id="customer-preferredLanguage"
                name="preferredLanguage"
                label={t('newCustomer.contact.preferredLanguage')}
                options={[
                  { value: '', label: t('supplierForm.notSet') },
                  { value: 'ar', label: t('supplierForm.language.ar') },
                  { value: 'en', label: t('supplierForm.language.en') },
                ]}
                value={values.preferredLanguage}
                onChange={(next) => change('preferredLanguage', next as CustomerFormValues['preferredLanguage'])}
              />
            </div>
          </SectionCard>

          <SectionCard step={5} title={t('newCustomer.sections.sending')}>
            <div className="flex flex-col gap-5">
              <SelectField
                id={inputId('sendingMethod')}
                name="sendingMethod"
                label={t('newCustomer.sending.method')}
                options={sendingOptions}
                value={values.sendingMethod}
                onChange={(next) => change('sendingMethod', next as CustomerSendingMethod)}
                error={errorText('sendingMethod')}
              />
              <ToggleRow
                label={t('newCustomer.sending.alsoEmailPdf')}
                hint={t('newCustomer.sending.alsoEmailPdfHint')}
                checked={values.emailPdfCopy}
                onChange={(next) => change('emailPdfCopy', next)}
                name="emailPdfCopy"
              />
              <ToggleRow
                label={t('newCustomer.sending.autoReminders')}
                hint={t('newCustomer.sending.autoRemindersHint')}
                checked={values.automaticPaymentReminders}
                onChange={(next) => change('automaticPaymentReminders', next)}
                name="automaticPaymentReminders"
              />
            </div>
          </SectionCard>
        </div>
      </div>

      <Collapsible step={6} title={t('newCustomer.sections.addresses')} collapsed={collapsed}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <p className="text-xs font-semibold uppercase leading-[1.2] tracking-wide text-text-quaternary">{t('newCustomer.address.invoicing')}</p>
            <AddressBlock which="invoice" address={values.invoice} onChange={changeAddress} errorText={errorText} />
          </div>
          <div className="flex flex-col gap-5">
            <p className="text-xs font-semibold uppercase leading-[1.2] tracking-wide text-text-quaternary">{t('newCustomer.address.delivery')}</p>
            <ToggleRow
              label={t('newCustomer.address.sameAsInvoicing')}
              hint={t('newCustomer.address.sameAsInvoicingHint')}
              checked={values.sameAsInvoicing}
              onChange={(next) => change('sameAsInvoicing', next)}
              name="sameAsInvoicing"
            />
            {values.sameAsInvoicing ? null : <AddressBlock which="delivery" address={values.delivery} onChange={changeAddress} errorText={errorText} />}
          </div>
        </div>
      </Collapsible>

      <Collapsible step={7} title={t('newCustomer.sections.notes')} collapsed={collapsed}>
        <TextAreaField
          id={inputId('note')}
          name="note"
          label={t('newCustomer.notes.label')}
          placeholder={t('customerForm.notePlaceholder')}
          minHeightClass="min-h-[71px]"
          maxLength={2000}
          value={values.note}
          onChange={(next) => change('note', next)}
          error={errorText('note')}
        />
      </Collapsible>

      {canManage ? (
        <div className="flex flex-wrap items-center justify-end gap-3 pb-2">
          <Link
            to="/customers"
            className="inline-flex h-[54px] items-center rounded-sm border border-border-subtle px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-card"
          >
            {t('newCustomer.cancel')}
          </Link>
          {!editing ? (
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={busy}
              className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-neutral-25 disabled:opacity-60"
            >
              <img src={saveIcon} alt="" className="size-6 shrink-0" />
              {t('newCustomer.saveAndAddAnother')}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-[54px] min-w-[255px] items-center justify-center rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
          >
            {saveLabel}
          </button>
        </div>
      ) : null}
    </form>
  )
}

/** A stored code this build's list does not have is still shown, not silently replaced. */
function withBlank(options: { value: string; label: string }[], current: string, blank: string) {
  const known = options.some((option) => option.value === current)
  return [
    { value: '', label: blank },
    ...(current && !known ? [{ value: current, label: current }] : []),
    ...options.map((option) => ({ value: option.value, label: option.label })),
  ]
}

function Collapsible({
  step,
  title,
  collapsed,
  children,
}: {
  step: number
  title: string
  collapsed: (open: boolean, toggle: () => void) => ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <SectionCard step={step} title={title} action={collapsed(open, () => setOpen((v) => !v))}>
      {open ? children : null}
    </SectionCard>
  )
}

function AddressBlock({
  which,
  address,
  onChange,
  errorText,
}: {
  which: 'invoice' | 'delivery'
  address: AddressValues
  onChange: (which: 'invoice' | 'delivery', field: AddressField, value: string) => void
  errorText: (field: CustomerField) => string | undefined
}) {
  const { t } = useTranslation()
  const field = (name: AddressField) => ({
    id: inputId(`${which}.${name}` as CustomerField),
    name: `${which}.${name}`,
    value: address[name],
    onChange: (next: string) => onChange(which, name, next),
    error: errorText(`${which}.${name}` as CustomerField),
  })
  return (
    <div className="flex flex-col gap-5">
      <TextField {...field('attention')} label={t('newCustomer.address.attn')} placeholder={t('newCustomer.address.attnPlaceholder')} maxLength={200} />
      <SelectField
        {...field('countryCode')}
        label={t('newCustomer.address.country')}
        options={[
          ...(address.countryCode && !COUNTRIES.includes(address.countryCode) ? [{ value: address.countryCode, label: address.countryCode }] : []),
          ...COUNTRIES.map((code) => ({ value: code, label: t(`supplierForm.country.${code}`) })),
        ]}
      />
      <TextField {...field('cityName')} label={t('newCustomer.address.city')} placeholder={t('newCustomer.address.cityPlaceholder')} maxLength={150} />
      <TextField {...field('streetName')} label={t('newCustomer.address.street')} placeholder={t('newCustomer.address.streetPlaceholder')} maxLength={150} />
      {which === 'invoice' ? (
        <>
          <TextField {...field('poBox')} label={t('newCustomer.address.poBox')} placeholder={t('newCustomer.address.poBoxPlaceholder')} maxLength={30} />
          <TextField
            {...field('postalCode')}
            label={t('newCustomer.address.postalCode')}
            placeholder={t('newCustomer.address.postalCodePlaceholder')}
            maxLength={20}
          />
        </>
      ) : null}
    </div>
  )
}
