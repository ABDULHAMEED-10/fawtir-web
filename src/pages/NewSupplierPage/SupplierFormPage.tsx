import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { paymentMethodOptions, paymentTermOptions, taxCategoryOptions, useReferenceData } from '../../lib/reference/referenceData'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
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
  confirmSupplierBankDetails,
  createSupplier,
  loadSupplier,
  newSupplierKey,
  supplierPath,
  switchSupplier,
  updateSupplier,
  type SupplierDetailDto,
  type SupplierTypeDto,
} from '../../api/expenditure/suppliers'
import { describeApiFailure } from '../../lib/apiFailure'
import { can, useSession } from '../../lib/session/session'
import {
  blankSupplierForm,
  fromSupplierDetail,
  placeSupplierErrors,
  supplierProblems,
  toSupplierRequest,
  type AddressField,
  type AddressValues,
  type LoadedBank,
  type PlacedError,
  type SupplierField,
  type SupplierFormValues,
} from '../../lib/supplierForm'
import businessIcon from '../../assets/create-invoice/business.svg'
import governmentIcon from '../../assets/customers/type-government.svg'
import tickCircle from '../../assets/customers/tick-circle.svg'
import saveIcon from '../../assets/customers/save.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import checkIcon from '../../assets/bill-detail/tick.svg'
import menuOffIcon from '../../assets/suppliers/menu-off.svg'

const TYPE_CARDS: {
  id: SupplierTypeDto
  icon: string
  key: 'business' | 'government'
}[] = [
  { id: 'BUSINESS', icon: businessIcon, key: 'business' },
  { id: 'GOVERNMENT', icon: governmentIcon, key: 'government' },
]

const COUNTRIES = ['OM', 'AE', 'SA', 'QA', 'KW', 'BH']
const CURRENCIES = ['OMR', 'USD', 'EUR', 'AED', 'SAR']
const CHANNELS = ['PEPPOL', 'EMAIL_PDF', 'PAPER', 'MANUAL'] as const

/** The inputs in the order they appear, so the first refused one takes the focus. */
const ORDER: SupplierField[] = [
  'type',
  'legalName',
  'commercialRegistrationNumber',
  'supplierCategory',
  'vatNumber',
  'peppolId',
  'contactPerson',
  'roleTitle',
  'emails',
  'telephone',
  'mobilePhone',
  'defaultCurrency',
  'defaultTaxCategory',
  'paymentTerms',
  'defaultPaymentMethod',
  'iban',
  'bic',
  'earlyPaymentDiscountPercent',
  'earlyPaymentDiscountDays',
  'billing.cityName',
  'pickup.cityName',
  'notes',
]

const inputId = (field: SupplierField) => `supplier-${field.replace('.', '-')}`

type FormNotice = { key: string; values?: Record<string, string> } | { body: string }

/** `/suppliers/new`. */
export function NewSupplierForm() {
  return (
    <AppShell>
      <SupplierFormPage supplierId={null} />
    </AppShell>
  )
}

/** `/suppliers/:slug/edit`; the list links by id. */
export function EditSupplierForm() {
  const { slug = '' } = useParams()
  // One shell for loading and the form alike: remounting it drops the session it provides, and for
  // that moment every action reads as allowed.
  return (
    <AppShell>
      <SupplierFormPage key={slug} supplierId={slug} />
    </AppShell>
  )
}

function SupplierFormPage({ supplierId }: { supplierId: string | null }) {
  const { t } = useTranslation()
  const reference = useReferenceData()
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const canManage = can(session, 'supplier.manage')

  const loaded = useApiRead<SupplierDetailDto>(supplierId ? supplierPath(supplierId) : null, () => loadSupplier(supplierId!))
  const [record, setRecord] = useState<SupplierDetailDto | null>(null)
  const [values, setValues] = useState<SupplierFormValues>(blankSupplierForm)
  const [bank, setBank] = useState<LoadedBank>(null)
  const [advanced, setAdvanced] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<SupplierField, PlacedError>>>({})
  const arrived = (location.state as { saved?: string } | null)?.saved
  const [notice, setNotice] = useState<FormNotice | null>(arrived ? { key: 'supplierForm.done.created', values: { name: arrived } } : null)
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(newSupplierKey)

  // Said once: a reload of the edit page is not another save.
  useEffect(() => {
    if (arrived) navigate(location.pathname, { replace: true, state: null })
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadedRecord = loaded.read.status === 'ready' ? loaded.read.data : null
  useEffect(() => {
    if (!loadedRecord) return
    const next = fromSupplierDetail(loadedRecord)
    setRecord(loadedRecord)
    setValues(next.values)
    setBank(next.bank)
    setAdvanced(Boolean(next.values.commercialRegistrationNumber || next.values.supplierCategory))
  }, [loadedRecord])

  const editing = supplierId !== null
  if (editing && loaded.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {loaded.read.status === 'loading' ? <LoadingNotice /> : <ApiReadFailure error={loaded.read.error} retry={loaded.retry} />}
      </div>
    )
  }
  if (editing && !record) return null

  const change = <F extends keyof SupplierFormValues>(field: F, value: SupplierFormValues[F]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field as SupplierField] ? { ...current, [field]: undefined } : current))
  }
  const changeAddress = (which: 'billing' | 'pickup', field: AddressField, value: string) => {
    setValues((current) => ({
      ...current,
      [which]: { ...current[which], [field]: value },
    }))
    const path = `${which}.${field}` as SupplierField
    setErrors((current) => (current[path] ? { ...current, [path]: undefined } : current))
  }
  const errorText = (field: SupplierField) => {
    const placed = errors[field]
    if (!placed) return undefined
    return 'key' in placed ? t(placed.key) : placed.text
  }

  const focusFirst = (found: Partial<Record<SupplierField, unknown>>) => {
    const first = ORDER.find((field) => found[field])
    if (first) document.getElementById(inputId(first))?.focus()
  }

  const save = async (addAnother: boolean) => {
    const problems = supplierProblems(values, bank)
    const placed = Object.fromEntries(Object.entries(problems).map(([field, key]) => [field, { key }])) as Partial<
      Record<SupplierField, PlacedError>
    >
    setErrors(placed)
    setNotice(null)
    setConflict(false)
    if (Object.keys(placed).length > 0) {
      setNotice({ key: 'supplierForm.fixFirst' })
      focusFirst(placed)
      return
    }
    setBusy(true)
    try {
      if (editing && record) {
        const saved = await updateSupplier(record.profile.id, toSupplierRequest(values, bank, record.profile.version))
        const next = fromSupplierDetail(saved)
        setRecord(saved)
        setValues(next.values)
        setBank(next.bank)
        setNotice({ key: 'supplierForm.done.saved' })
      } else {
        const saved = await createSupplier(key, toSupplierRequest(values, null))
        setKey(newSupplierKey())
        if (addAnother) {
          setValues(blankSupplierForm())
          setNotice({
            key: 'supplierForm.done.created',
            values: { name: saved.profile.displayName },
          })
          window.scrollTo({ top: 0 })
        } else {
          navigate(`/suppliers/${saved.profile.id}/edit`, {
            state: { saved: saved.profile.displayName },
          })
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const { fields, other } = placeSupplierErrors(error.fieldErrors)
        setErrors(fields)
        setNotice(other.length > 0 ? { body: [t('supplierForm.serverRefused'), ...other].join(' ') } : { key: 'supplierForm.fixFirst' })
        focusFirst(fields)
      } else if (error instanceof ApiError && error.status === 409) {
        // A duplicate VAT number or Peppol ID and a stale edit share one generic 409. A new supplier
        // cannot be stale, so there it is the duplicate; on an edit it may be either.
        setConflict(editing)
        setNotice({
          key: editing ? 'supplierForm.conflictEdit' : 'supplierForm.duplicate',
        })
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setNotice({
          body: message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void save(false)
  }

  const confirmBank = async () => {
    if (!record) return
    setBusy(true)
    setNotice(null)
    try {
      const saved = await confirmSupplierBankDetails(record.profile.id)
      setRecord(saved)
      setNotice({ key: 'supplierForm.done.bankConfirmed' })
    } catch (error) {
      const message = describeApiFailure(error)
      setNotice({ body: t(message.key, message.values) })
    } finally {
      setBusy(false)
    }
  }

  const switchTo = async (to: 'off' | 'on') => {
    if (!record) return
    setBusy(true)
    setNotice(null)
    try {
      await switchSupplier(record.profile.id, to)
      loaded.retry()
      setNotice({
        key: to === 'off' ? 'supplierForm.done.switchedOff' : 'supplierForm.done.switchedOn',
      })
    } catch (error) {
      const message = describeApiFailure(error)
      setNotice({ body: t(message.key, message.values) })
    } finally {
      setBusy(false)
    }
  }

  const name = record?.profile.displayName ?? ''
  const health = new Set(record?.profile.health ?? [])
  const bankUnconfirmed = health.has('BANK_CHANGED_UNCONFIRMED')
  const switchedOff = record?.profile.status === 'SWITCHED_OFF'
  const saveLabel = busy ? t('supplierForm.saving') : editing ? t('supplierEdit.save') : t('newSupplier.save')

  const collapsed = (open: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} className="text-sm font-semibold text-primary-800 hover:underline">
      {open ? t('newSupplier.collapse') : t('newSupplier.expand')}
    </button>
  )

  return (
    <form onSubmit={submit} noValidate className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/suppliers" className="text-base font-medium text-text-quaternary hover:text-primary-700">
              {t('suppliersPage.title')}
            </Link>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-4 rtl:rotate-180" />
            <span className="text-base font-semibold text-text-primary">{editing ? t('supplierEdit.edit') : t('newSupplier.title')}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-4">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {editing ? t('supplierEdit.title', { name }) : t('newSupplier.title')}
            </h1>
            <ToggleInline label={t('newSupplier.advancedFields')} checked={advanced} onChange={setAdvanced} />
          </div>
          {editing ? (
            <p className="mt-1 max-w-[780px] text-sm font-medium leading-[1.4] text-text-quaternary">{t('supplierEdit.subtitle')}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {editing && canManage && record ? (
            <ActionMenu
              wide
              variant="bordered"
              alignStart
              label={t('suppliersPage.rowActions')}
              items={[
                switchedOff
                  ? {
                      id: 'switchOn',
                      labelKey: 'suppliersPage.menu.switchOn',
                      descriptionKey: 'suppliersPage.menu.switchOnNote',
                      icon: menuOffIcon,
                      onSelect: () => void switchTo('on'),
                    }
                  : {
                      id: 'switchOff',
                      labelKey: 'suppliersPage.menu.switchOff',
                      descriptionKey: 'suppliersPage.menu.switchOffNoteSearchable',
                      icon: menuOffIcon,
                      danger: true,
                      onSelect: () => void switchTo('off'),
                    },
              ]}
            />
          ) : null}
          <Link
            to="/suppliers"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('supplierEdit.cancel')}
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

      {!canManage ? <Notice body={t('supplierForm.readOnly')} /> : null}
      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key, notice.values) : notice.body}
          action={
            conflict
              ? { label: t('supplierForm.reload'), onClick: () => navigate(0) }
              : { label: t('common.close'), onClick: () => setNotice(null) }
          }
        />
      ) : null}
      {switchedOff ? <Notice body={t('supplierForm.switchedOff')} /> : null}

      {editing && record ? (
        <section className="rounded-md bg-surface-card p-5">
          <h2 className="text-base font-semibold leading-[1.2] text-text-primary">{t('supplierEdit.isComplete')}</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            <CheckItem done={!health.has('NO_VAT_NUMBER')} label={t('supplierEdit.complete.vat')} />
            <CheckItem done={record.profile.participantId !== null} label={t('supplierEdit.complete.peppol')} />
            <CheckItem done={!health.has('NO_BANK_DETAILS')} label={t('supplierEdit.complete.iban')} />
            <CheckItem done={record.profile.paymentTerms !== null} label={t('supplierEdit.complete.terms')} />
          </ul>
          {bankUnconfirmed ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-brand-subtle bg-primary-25 p-4">
              <p className="text-sm font-medium leading-[1.5] text-text-secondary">{t('supplierForm.bankUnconfirmed')}</p>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => void confirmBank()}
                  disabled={busy}
                  className="inline-flex h-10 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
                >
                  {t('supplierForm.confirmBank')}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <SectionCard step={1} title={t('newSupplier.sections.supplierType')}>
        <div className="grid gap-4 md:grid-cols-3">
          {TYPE_CARDS.map((card) => {
            const active = card.id === values.type
            return (
              <button
                key={card.id}
                type="button"
                // The type is fixed once the record exists (the server refuses a change).
                disabled={editing && !active}
                onClick={() => change('type', card.id)}
                aria-pressed={active}
                className={[
                  'flex h-[65px] items-center gap-2 rounded-sm px-4 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active ? 'border-2 border-primary-500 bg-primary-50' : 'border border-border-default hover:border-primary-300',
                ].join(' ')}
              >
                <img src={card.icon} alt="" className={['size-6 shrink-0', active ? '' : 'opacity-70'].join(' ')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium leading-[1.2] text-text-primary">
                    {t(`newSupplier.types.${card.key}.title`)}
                  </span>
                  <span className="block text-xs font-medium leading-[1.2] text-text-tertiary">
                    {t(`newSupplier.types.${card.key}.subtitle`)}
                  </span>
                </span>
                {active ? <img src={tickCircle} alt="" className="size-[18px] shrink-0" /> : null}
              </button>
            )
          })}
        </div>
      </SectionCard>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SectionCard step={2} title={t('newSupplier.sections.details')}>
            <div className="flex flex-col gap-5">
              <TextField
                id={inputId('legalName')}
                name="legalName"
                label={values.type === 'GOVERNMENT' ? t('newSupplier.details.entityName') : t('newSupplier.details.legalName')}
                placeholder={
                  values.type === 'GOVERNMENT'
                    ? t('newSupplier.details.entityNamePlaceholder')
                    : t('newSupplier.details.legalNamePlaceholder')
                }
                required
                maxLength={200}
                value={values.legalName}
                onChange={(next) => change('legalName', next)}
                error={errorText('legalName')}
              />

              {advanced ? (
                <FieldGrid>
                  <TextField
                    id={inputId('commercialRegistrationNumber')}
                    name="commercialRegistrationNumber"
                    label={t('newSupplier.details.commercialRegistration')}
                    placeholder={t('newSupplier.details.crPlaceholder')}
                    maxLength={30}
                    value={values.commercialRegistrationNumber}
                    onChange={(next) => change('commercialRegistrationNumber', next)}
                    error={errorText('commercialRegistrationNumber')}
                  />
                  <TextField
                    id={inputId('supplierCategory')}
                    name="supplierCategory"
                    label={t('supplierForm.category')}
                    placeholder={t('supplierForm.categoryPlaceholder')}
                    maxLength={60}
                    value={values.supplierCategory}
                    onChange={(next) => change('supplierCategory', next)}
                    error={errorText('supplierCategory')}
                  />
                </FieldGrid>
              ) : null}

              <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
                <TextField
                  id={inputId('vatNumber')}
                  name="vatNumber"
                  label={t('newSupplier.details.vatNumber')}
                  placeholder="OM1100000000"
                  hint={values.registeredForVat ? t('newSupplier.details.vatHint') : t('supplierForm.notVatRegistered')}
                  required={values.registeredForVat}
                  maxLength={64}
                  value={values.registeredForVat ? values.vatNumber : ''}
                  onChange={(next) => change('vatNumber', next.toUpperCase())}
                  error={errorText('vatNumber')}
                />
                <CheckboxRow
                  id="supplier-registered-vat"
                  name="registeredForVat"
                  label={t('newSupplier.details.registeredForVat')}
                  checked={values.registeredForVat}
                  onChange={(next) => change('registeredForVat', next)}
                />
              </div>

              <div className="flex flex-col gap-4 rounded-sm border border-border-brand-subtle bg-primary-25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-base font-medium leading-[1.2] text-text-primary">{t('newSupplier.details.peppolSection')}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium leading-[1.2] text-text-primary">
                      {t('newSupplier.details.registeredOnPeppol')}
                    </span>
                    <Toggle
                      checked={values.registeredOnPeppol}
                      onChange={(next) => change('registeredOnPeppol', next)}
                      label={t('newSupplier.details.registeredOnPeppol')}
                      name="registeredOnPeppol"
                    />
                  </div>
                </div>
                {values.registeredOnPeppol ? (
                  <TextField
                    id={inputId('peppolId')}
                    name="peppolId"
                    label={t('newSupplier.details.peppolId')}
                    placeholder="0248:OM1100000000"
                    hint={t('newSupplier.details.peppolIdHint')}
                    required
                    value={values.peppolId}
                    onChange={(next) => change('peppolId', next)}
                    error={errorText('peppolId')}
                  />
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard step={4} title={t('newSupplier.sections.payment')}>
            <div className="flex flex-col gap-5">
              <FieldGrid>
                <SelectField
                  id={inputId('defaultCurrency')}
                  name="defaultCurrency"
                  label={t('newSupplier.payment.currency')}
                  options={CURRENCIES.map((code) => ({
                    value: code,
                    label: code,
                  }))}
                  value={values.defaultCurrency}
                  onChange={(next) => change('defaultCurrency', next)}
                  error={errorText('defaultCurrency')}
                />
                <SelectField
                  id={inputId('defaultTaxCategory')}
                  name="defaultTaxCategory"
                  label={t('newSupplier.payment.taxCategory')}
                  options={withBlank(taxCategoryOptions(reference, t), values.defaultTaxCategory, t('supplierForm.notSet'))}
                  value={values.defaultTaxCategory}
                  onChange={(next) => change('defaultTaxCategory', next)}
                  error={errorText('defaultTaxCategory')}
                />
                <SelectField
                  id={inputId('paymentTerms')}
                  name="paymentTerms"
                  label={t('newSupplier.payment.paymentTerms')}
                  options={withBlank(paymentTermOptions(reference, t), values.paymentTerms, t('supplierForm.notSet'))}
                  value={values.paymentTerms}
                  onChange={(next) => change('paymentTerms', next)}
                  error={errorText('paymentTerms')}
                />
                <SelectField
                  id={inputId('defaultPaymentMethod')}
                  name="defaultPaymentMethod"
                  label={t('newSupplier.payment.paymentMethod')}
                  options={withBlank(
                    paymentMethodOptions(reference, t).map((option) => ({
                      ...option,
                      label: t(`invoiceDetails.pay.means.${option.value}`),
                    })),
                    values.defaultPaymentMethod,
                    t('supplierForm.notSet'),
                  )}
                  value={values.defaultPaymentMethod}
                  onChange={(next) => change('defaultPaymentMethod', next)}
                  error={errorText('defaultPaymentMethod')}
                />
              </FieldGrid>

              {/* Bank details are not "advanced" here — we pay the supplier from them. */}
              <FieldGrid>
                <TextField
                  id={inputId('iban')}
                  name="iban"
                  label={t('newSupplier.payment.iban')}
                  placeholder="OM00 0000 0000 0000"
                  value={values.iban}
                  onChange={(next) => change('iban', next.toUpperCase())}
                  error={errorText('iban')}
                  hint={editing && bank ? t('supplierForm.ibanChangeHint') : undefined}
                />
                <TextField
                  id={inputId('bic')}
                  name="bic"
                  label={t('newSupplier.payment.bic')}
                  placeholder="BIC"
                  maxLength={11}
                  value={values.bic}
                  onChange={(next) => change('bic', next.toUpperCase())}
                  error={errorText('bic')}
                />
              </FieldGrid>

              <FieldGrid>
                <TextField
                  id={inputId('earlyPaymentDiscountPercent')}
                  name="earlyPaymentDiscountPercent"
                  label={t('supplierForm.earlyPercent')}
                  placeholder="2"
                  inputMode="decimal"
                  value={values.earlyPaymentDiscountPercent}
                  onChange={(next) => change('earlyPaymentDiscountPercent', next)}
                  error={errorText('earlyPaymentDiscountPercent')}
                />
                <TextField
                  id={inputId('earlyPaymentDiscountDays')}
                  name="earlyPaymentDiscountDays"
                  label={t('supplierForm.earlyDays')}
                  placeholder="10"
                  inputMode="numeric"
                  value={values.earlyPaymentDiscountDays}
                  onChange={(next) => change('earlyPaymentDiscountDays', next)}
                  error={errorText('earlyPaymentDiscountDays')}
                />
              </FieldGrid>
            </div>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard step={3} title={t('newSupplier.sections.contact')}>
            <div className="flex flex-col gap-5">
              <FieldGrid>
                <TextField
                  id={inputId('contactPerson')}
                  name="contactPerson"
                  label={t('newSupplier.contact.person')}
                  placeholder={t('newSupplier.contact.personPlaceholder')}
                  required
                  maxLength={200}
                  value={values.contactPerson}
                  onChange={(next) => change('contactPerson', next)}
                  error={errorText('contactPerson')}
                />
                <TextField
                  id={inputId('roleTitle')}
                  name="roleTitle"
                  label={t('newSupplier.contact.role')}
                  placeholder={t('newSupplier.contact.rolePlaceholder')}
                  maxLength={100}
                  value={values.roleTitle}
                  onChange={(next) => change('roleTitle', next)}
                  error={errorText('roleTitle')}
                />
              </FieldGrid>

              <TextAreaField
                id={inputId('emails')}
                name="emails"
                label={t('newSupplier.contact.email')}
                placeholder="name@supplier.om"
                value={values.emails}
                onChange={(next) => change('emails', next)}
                error={errorText('emails')}
              />

              <FieldGrid>
                <PhoneField
                  id={inputId('telephone')}
                  name="telephone"
                  label={t('newSupplier.contact.telephone')}
                  value={values.telephone}
                  onChange={(next) => change('telephone', next)}
                  error={errorText('telephone')}
                />
                <PhoneField
                  id={inputId('mobilePhone')}
                  name="mobilePhone"
                  label={t('newSupplier.contact.mobile')}
                  value={values.mobilePhone}
                  onChange={(next) => change('mobilePhone', next)}
                  error={errorText('mobilePhone')}
                />
              </FieldGrid>

              <SelectField
                id="supplier-preferredLanguage"
                name="preferredLanguage"
                label={t('newSupplier.contact.preferredLanguage')}
                options={[
                  { value: '', label: t('supplierForm.notSet') },
                  { value: 'ar', label: t('supplierForm.language.ar') },
                  { value: 'en', label: t('supplierForm.language.en') },
                ]}
                value={values.preferredLanguage}
                onChange={(next) => change('preferredLanguage', next as SupplierFormValues['preferredLanguage'])}
              />
            </div>
          </SectionCard>

          <SectionCard step={5} title={t('newSupplier.sections.receiving')}>
            <div className="flex flex-col gap-5">
              <SelectField
                id="supplier-receivingChannel"
                name="receivingChannel"
                label={t('newSupplier.receiving.method')}
                options={CHANNELS.map((channel) => ({
                  value: channel,
                  label: t(`supplierForm.channel.${channel}`),
                }))}
                value={values.receivingChannel}
                onChange={(next) => change('receivingChannel', next as SupplierFormValues['receivingChannel'])}
              />
              {record?.profile.selfBillingAgreement ? (
                <div className="flex items-start gap-2.5 rounded-sm bg-surface-tab-bar p-3">
                  <img src={checkIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                  <p className="text-sm font-medium leading-[1.4] text-text-secondary">{t('supplierForm.selfBillingActive')}</p>
                </div>
              ) : null}
              <ToggleRow
                label={t('newSupplier.receiving.approvalRequired')}
                hint={t('newSupplier.receiving.approvalRequiredHint')}
                checked={values.requiresApprovalBeforePayment}
                onChange={(next) => change('requiresApprovalBeforePayment', next)}
                name="requiresApprovalBeforePayment"
              />
            </div>
          </SectionCard>
        </div>
      </div>

      <AddressesSection
        values={values}
        onAddress={changeAddress}
        onSame={(next) => change('sameAsBilling', next)}
        errorText={errorText}
        collapsed={collapsed}
      />

      <NotesSection value={values.notes} onChange={(next) => change('notes', next)} error={errorText('notes')} collapsed={collapsed} />

      {canManage ? (
        <div className="flex flex-wrap items-center justify-end gap-3 pb-2">
          <Link
            to="/suppliers"
            className="inline-flex h-[54px] items-center rounded-sm border border-border-subtle px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-card"
          >
            {t('newSupplier.cancel')}
          </Link>
          {!editing ? (
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={busy}
              className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-neutral-25 disabled:opacity-60"
            >
              <img src={saveIcon} alt="" className="size-6 shrink-0" />
              {t('newSupplier.saveAndAddAnother')}
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

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {done ? (
        <img src={checkIcon} alt="" className="mt-0.5 size-4 shrink-0" />
      ) : (
        <span className="mt-0.5 size-4 shrink-0 rounded-full border border-border-default" />
      )}
      <span className={['text-sm font-medium leading-[1.4]', done ? 'text-text-secondary' : 'text-text-quaternary'].join(' ')}>
        {label}
      </span>
    </li>
  )
}

function AddressesSection({
  values,
  onAddress,
  onSame,
  errorText,
  collapsed,
}: {
  values: SupplierFormValues
  onAddress: (which: 'billing' | 'pickup', field: AddressField, value: string) => void
  onSame: (next: boolean) => void
  errorText: (field: SupplierField) => string | undefined
  collapsed: (open: boolean, toggle: () => void) => React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  return (
    <SectionCard step={6} title={t('newSupplier.sections.addresses')} action={collapsed(open, () => setOpen((v) => !v))}>
      {open ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <p className="text-xs font-semibold uppercase leading-[1.2] tracking-wide text-text-quaternary">
              {t('newSupplier.address.billing')}
            </p>
            <AddressBlock which="billing" address={values.billing} onChange={onAddress} errorText={errorText} />
          </div>
          <div className="flex flex-col gap-5">
            <p className="text-xs font-semibold uppercase leading-[1.2] tracking-wide text-text-quaternary">
              {t('newSupplier.address.pickup')}
            </p>
            <ToggleRow
              label={t('newSupplier.address.sameAsBilling')}
              hint={t('newSupplier.address.sameAsBillingHint')}
              checked={values.sameAsBilling}
              onChange={onSame}
              name="sameAsBilling"
            />
            {values.sameAsBilling ? null : (
              <AddressBlock which="pickup" address={values.pickup} onChange={onAddress} errorText={errorText} />
            )}
          </div>
        </div>
      ) : null}
    </SectionCard>
  )
}

function AddressBlock({
  which,
  address,
  onChange,
  errorText,
}: {
  which: 'billing' | 'pickup'
  address: AddressValues
  onChange: (which: 'billing' | 'pickup', field: AddressField, value: string) => void
  errorText: (field: SupplierField) => string | undefined
}) {
  const { t } = useTranslation()
  const field = (name: AddressField) => ({
    id: inputId(`${which}.${name}` as SupplierField),
    name: `${which}.${name}`,
    value: address[name],
    onChange: (next: string) => onChange(which, name, next),
    error: errorText(`${which}.${name}` as SupplierField),
  })
  return (
    <div className="flex flex-col gap-5">
      <TextField
        {...field('attention')}
        label={t('newSupplier.address.attn')}
        placeholder={t('newSupplier.address.attnPlaceholder')}
        maxLength={200}
      />
      <SelectField
        {...field('countryCode')}
        label={t('newSupplier.address.country')}
        options={[
          ...(address.countryCode && !COUNTRIES.includes(address.countryCode)
            ? [{ value: address.countryCode, label: address.countryCode }]
            : []),
          ...COUNTRIES.map((code) => ({
            value: code,
            label: t(`supplierForm.country.${code}`),
          })),
        ]}
      />
      <TextField
        {...field('cityName')}
        label={t('newSupplier.address.city')}
        placeholder={t('newSupplier.address.cityPlaceholder')}
        maxLength={150}
      />
      <TextField
        {...field('streetName')}
        label={t('newSupplier.address.street')}
        placeholder={t('newSupplier.address.streetPlaceholder')}
        maxLength={150}
      />
      {which === 'billing' ? (
        <>
          <TextField
            {...field('poBox')}
            label={t('newSupplier.address.poBox')}
            placeholder={t('newSupplier.address.poBoxPlaceholder')}
            maxLength={30}
          />
          <TextField
            {...field('postalCode')}
            label={t('newSupplier.address.postalCode')}
            placeholder={t('newSupplier.address.postalCodePlaceholder')}
            maxLength={20}
          />
        </>
      ) : null}
    </div>
  )
}

function NotesSection({
  value,
  onChange,
  error,
  collapsed,
}: {
  value: string
  onChange: (next: string) => void
  error: string | undefined
  collapsed: (open: boolean, toggle: () => void) => React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  return (
    <SectionCard step={7} title={t('newSupplier.sections.notes')} action={collapsed(open, () => setOpen((v) => !v))}>
      {open ? (
        <TextAreaField
          id={inputId('notes')}
          name="notes"
          label={t('newSupplier.notes.label')}
          placeholder={t('newSupplier.notes.placeholder')}
          minHeightClass="min-h-[71px]"
          maxLength={4000}
          value={value}
          onChange={onChange}
          error={error}
        />
      ) : null}
    </SectionCard>
  )
}
