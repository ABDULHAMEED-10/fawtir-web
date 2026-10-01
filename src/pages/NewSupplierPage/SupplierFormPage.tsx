import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { paymentTermOptions, useReferenceData } from '../../lib/reference/referenceData'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  OmAmount,
  SegmentedControl,
  Select,
  Switch,
  type SelectOption,
} from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import {
  FieldGrid,
  FieldLabel,
  PhoneField,
  SectionCard,
  TextField,
  ToggleRow,
} from '../../components/form'
import { selectAllOnFocus } from '../../components/invoice'
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
import {
  loadSupplierOverview,
  supplierOverviewPath,
  type SupplierOverviewDto,
} from '../../api/expenditure/supplierRecord'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstantDay } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import * as validate from '../../lib/validation'
import { candidateParticipantId } from '../../lib/peppolParticipant'
import { GOVERNORATES, GOVERNORATE_NAMES, governorateIdFor } from '../../lib/governorates'
import {
  blankSupplierForm,
  fromSupplierDetail,
  hasBankAccount,
  placeSupplierErrors,
  supplierProblems,
  toSupplierRequest,
  type AddressField,
  type LoadedBank,
  type PlacedError,
  type SupplierField,
  type SupplierFormValues,
} from '../../lib/supplierForm'
import {
  SwitchSupplierOffModal,
  type SwitchOffTarget,
} from '../SuppliersPage/SwitchSupplierOffModal'
import chevronIcon from '../../assets/invoices/chevron.svg'
import checkIcon from '../../assets/bill-detail/tick.svg'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import removeIcon from '../../assets/create-invoice/remove-x.svg'
import menuCopyIcon from '../../assets/suppliers/menu-copy.svg'
import menuOffIcon from '../../assets/suppliers/menu-off.svg'
import menuStatementIcon from '../../assets/suppliers/menu-statement.svg'

const COUNTRIES = ['OM', 'AE', 'SA', 'QA', 'KW', 'BH']
const CURRENCIES = ['OMR', 'USD', 'EUR', 'AED', 'SAR']

/** The frame's category picker. The API keeps free text, so these are the usual answers, not a rule. */
const CATEGORIES: { value: string; key: string }[] = [
  { value: 'Raw materials', key: 'rawMaterials' },
  { value: 'Packaging', key: 'packaging' },
  { value: 'Logistics', key: 'logistics' },
  { value: 'Utilities', key: 'utilities' },
  { value: 'Rent', key: 'rent' },
  { value: 'Services', key: 'services' },
  { value: 'Equipment', key: 'equipment' },
  { value: 'Other', key: 'other' },
]

/** The inputs in the order they appear, so the first refused one takes the focus. */
const ORDER: SupplierField[] = [
  'type',
  'legalName',
  'commercialRegistrationNumber',
  'vatNumber',
  'peppolId',
  'paymentTerms',
  'earlyPaymentDiscountPercent',
  'earlyPaymentDiscountDays',
  'defaultCurrency',
  'bankName',
  'bic',
  'iban',
  'contactPerson',
  'emails',
  'telephone',
  'billing.streetName',
  'billing.cityName',
  'billing.countrySubentity',
  'billing.postalCode',
  'billing.countryCode',
  'supplierCategory',
]

/**
 * The billing address's parts each have their input (the street keeps the Address line's id); the
 * country is the select in the first card, and a pickup refusal lands on the street, since the
 * form draws no pickup address.
 */
const ADDRESS_INPUTS: Record<string, string> = {
  cityName: 'supplier-billing-city',
  countrySubentity: 'supplier-billing-governorate',
  postalCode: 'supplier-billing-postalCode',
  countryCode: 'supplier-billing-country',
}
const inputId = (field: SupplierField) =>
  field.startsWith('billing.')
    ? (ADDRESS_INPUTS[field.slice('billing.'.length)] ?? 'supplier-billing-address')
    : field.startsWith('pickup.')
      ? 'supplier-billing-address'
      : `supplier-${field}`

const PEPPOL_SHAPE = /^(0248|0242):\S+$/

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

/**
 * The supplier form on the Edit frame's layout (Figma 163:26848): who they are, how their bills
 * reach you, paying them, contact and filing, with the record's side column when it exists. A new
 * supplier (`/suppliers/new`) is the same form without the side column.
 */
function SupplierFormPage({ supplierId }: { supplierId: string | null }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const reference = useReferenceData()
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const canManage = can(session, 'supplier.manage')
  const editing = supplierId !== null

  const loaded = useApiRead<SupplierDetailDto>(supplierId ? supplierPath(supplierId) : null, () =>
    loadSupplier(supplierId!),
  )
  // What changing this affects: the open bills and orders the record's overview counts.
  const overview = useApiRead<SupplierOverviewDto>(
    supplierId ? supplierOverviewPath(supplierId) : null,
    () => loadSupplierOverview(supplierId!),
  )
  const [record, setRecord] = useState<SupplierDetailDto | null>(null)
  const [values, setValues] = useState<SupplierFormValues>(blankSupplierForm)
  const [bank, setBank] = useState<LoadedBank>(null)
  // TODO(backend): the frame's trading name, "match bills to purchase orders" switch and tags have
  // no field on `SupplierRequest`; they are asked as drawn and kept on the screen.
  const [tradingName, setTradingName] = useState('')
  const [autoMatch, setAutoMatch] = useState(true)
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [errors, setErrors] = useState<Partial<Record<SupplierField, PlacedError>>>({})
  const arrived = (location.state as { saved?: string } | null)?.saved
  const [notice, setNotice] = useState<FormNotice | null>(
    arrived ? { key: 'supplierForm.done.created', values: { name: arrived } } : null,
  )
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(newSupplierKey)
  const [offTarget, setOffTarget] = useState<SwitchOffTarget | null>(null)

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
  }, [loadedRecord])

  if (editing && loaded.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {loaded.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={loaded.read.error} retry={loaded.retry} />
        )}
      </div>
    )
  }
  if (editing && !record) return null

  const change = <F extends keyof SupplierFormValues>(field: F, value: SupplierFormValues[F]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) =>
      current[field as SupplierField] ? { ...current, [field]: undefined } : current,
    )
  }
  const changeAddress = (part: AddressField, next: string) => {
    setValues((current) => {
      const billing = { ...current.billing, [part]: next }
      // A new governorate outdates the code the record had for the old one.
      if (part === 'countrySubentity' && next !== current.billing.countrySubentity)
        billing.kept = { ...billing.kept, countrySubentityCode: null }
      return { ...current, billing }
    })
    setErrors((current) => {
      const cleared = { ...current }
      for (const field of Object.keys(cleared) as SupplierField[])
        if (field === `billing.${part}` || field.startsWith('pickup.')) delete cleared[field]
      return cleared
    })
  }
  // A valid VAT number and an empty Peppol ID: the ID an Omani VAT registrant is reached at
  // (0248 and the VATIN) is filled in, and stays editable.
  const changeVatNumber = (next: string) => {
    const vatNumber = next.toUpperCase()
    const candidate = candidateParticipantId(vatNumber)
    setValues((current) => ({
      ...current,
      vatNumber,
      ...(candidate && !current.peppolId.trim() ? { peppolId: candidate } : {}),
    }))
    setErrors((current) => (current.vatNumber ? { ...current, vatNumber: undefined } : current))
  }
  const errorText = (field: SupplierField) => {
    const placed = errors[field]
    if (!placed) return undefined
    return 'key' in placed ? t(placed.key) : placed.text
  }
  // What the street's input shows: its own refusal, else a pickup one (the form draws no pickup).
  const addressError = (['billing.streetName', ...Object.keys(errors)] as SupplierField[]).find(
    (field) => (field === 'billing.streetName' || field.startsWith('pickup.')) && errors[field],
  )

  const focusFirst = (found: Partial<Record<SupplierField, unknown>>) => {
    const first =
      ORDER.find((field) => found[field]) ??
      (Object.keys(found) as SupplierField[]).find((field) => found[field])
    if (first) document.getElementById(inputId(first))?.focus()
  }

  const save = async () => {
    const problems = supplierProblems(values, bank)
    const placed = Object.fromEntries(
      Object.entries(problems).map(([field, key]) => [field, { key }]),
    ) as Partial<Record<SupplierField, PlacedError>>
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
        const saved = await updateSupplier(
          record.profile.id,
          toSupplierRequest(values, bank, record.profile.version),
        )
        const next = fromSupplierDetail(saved)
        setRecord(saved)
        setValues(next.values)
        setBank(next.bank)
        setNotice({ key: 'supplierForm.done.saved' })
      } else {
        const saved = await createSupplier(key, toSupplierRequest(values, null))
        setKey(newSupplierKey())
        navigate(`/suppliers/${saved.profile.id}/edit`, {
          state: { saved: saved.profile.displayName },
        })
      }
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const { fields, other } = placeSupplierErrors(error.fieldErrors)
        setErrors(fields)
        setNotice(
          other.length > 0
            ? { body: [t('supplierForm.serverRefused'), ...other].join(' ') }
            : { key: 'supplierForm.fixFirst' },
        )
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
          body: message.reference
            ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
            : body,
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void save()
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
      setOffTarget(null)
      loaded.retry()
      setNotice({
        key: to === 'off' ? 'supplierForm.done.switchedOff' : 'supplierForm.done.switchedOn',
      })
    } catch (error) {
      setOffTarget(null)
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
  const saveLabel = busy
    ? t('supplierForm.saving')
    : editing
      ? t('supplierEdit.save')
      : t('newSupplier.save')
  const overviewData = overview.read.status === 'ready' ? overview.read.data : null
  const openBills = overviewData
    ? ['notDue', 'dueSoon', 'late', 'onHold'].reduce(
        (sum, band) =>
          sum + overviewData.payables[band as 'notDue' | 'dueSoon' | 'late' | 'onHold'].bills,
        0,
      )
    : 0
  const currency = overviewData?.payables.currencyCode ?? values.defaultCurrency ?? 'OMR'

  const vatTyped = values.vatNumber.trim() !== ''
  const vatValid = vatTyped && !validate.vatin(values.vatNumber)
  const peppolValid = PEPPOL_SHAPE.test(values.peppolId.trim())
  const isGovernment = values.type === 'GOVERNMENT'

  const paymentTerms = withCurrent(
    paymentTermOptions(reference, t).map((option) => ({
      value: option.value,
      label: option.label,
      hint: option.hint,
    })),
    values.paymentTerms,
  )
  const currencies = CURRENCIES.map((code) => ({
    value: code,
    label: `${code} - ${t(`supplierEdit.currencyName.${code}`, { defaultValue: code })}`,
  }))
  // Oman's eleven, stored by English name (IBT-054); a stored name that is not one of them is kept.
  const governorates: SelectOption[] = [
    ...(values.billing.countrySubentity && !governorateIdFor(values.billing.countrySubentity)
      ? [{ value: values.billing.countrySubentity, label: values.billing.countrySubentity }]
      : []),
    ...GOVERNORATES.map((id) => ({ value: GOVERNORATE_NAMES[id], label: t(`governorate.${id}`) })),
  ]
  const countries = [
    ...(values.billing.countryCode && !COUNTRIES.includes(values.billing.countryCode)
      ? [{ value: values.billing.countryCode, label: values.billing.countryCode }]
      : []),
    ...COUNTRIES.map((code) => ({ value: code, label: t(`supplierForm.country.${code}`) })),
  ]
  const categories = [
    { value: '', label: t('supplierForm.notSet') },
    ...withCurrent(
      CATEGORIES.map((entry) => ({
        value: entry.value,
        label: t(`supplierEdit.categories.${entry.key}`),
      })),
      values.supplierCategory,
    ),
  ]

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/suppliers"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
            >
              {t('suppliersPage.title')}
            </Link>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            {editing && record ? (
              <>
                <Link
                  to={`/suppliers/${record.profile.id}`}
                  className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
                >
                  {name}
                </Link>
                <img
                  src={chevronIcon}
                  alt=""
                  aria-hidden="true"
                  className="size-5 rtl:rotate-180"
                />
              </>
            ) : null}
            <span className="text-2xl font-medium leading-[1.2] text-text-primary">
              {editing ? t('supplierEdit.edit') : t('newSupplier.title')}
            </span>
          </div>
          <h1 className="mt-1 text-[32px] font-medium leading-[1.2] text-text-primary">
            {editing ? t('supplierEdit.title', { name }) : t('newSupplier.title')}
          </h1>
          <p className="mt-1 max-w-[780px] text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {editing ? t('supplierEdit.subtitle') : t('newSupplier.subtitle')}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
          {editing && record ? (
            <ActionMenu
              wide
              variant="bordered"
              alignStart
              label={t('suppliersPage.rowActions')}
              items={[
                {
                  id: 'exportStatement',
                  labelKey: 'suppliersPage.menu.exportStatement',
                  descriptionKey: 'suppliersPage.menu.exportStatementNote',
                  icon: menuStatementIcon,
                  to: `/suppliers/${record.profile.id}/statement`,
                },
                ...(canManage
                  ? [
                      {
                        id: 'copyToNew',
                        labelKey: 'suppliersPage.menu.copyToNew',
                        descriptionKey: 'suppliersPage.menu.copyToNewNote',
                        icon: menuCopyIcon,
                        to: '/suppliers/new',
                      },
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
                            onSelect: () =>
                              setOffTarget({
                                id: record.profile.id,
                                name,
                                openBills,
                                owed: overviewData?.payables.total ?? 0,
                                currency,
                              }),
                          },
                    ]
                  : []),
              ]}
            />
          ) : null}
          <Link
            to={editing && record ? `/suppliers/${record.profile.id}` : '/suppliers'}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('supplierEdit.cancel')}
          </Link>
          {canManage ? (
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              <img src={tickIcon} alt="" className="size-4 shrink-0" />
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

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <SectionCard
            step={1}
            title={t('supplierEdit.whoTheyAre')}
            action={
              editing ? null : (
                <SegmentedControl
                  className="min-w-[250px]"
                  ariaLabel={t('newSupplier.sections.supplierType')}
                  value={values.type}
                  onChange={(next: SupplierTypeDto) => change('type', next)}
                  options={[
                    { value: 'BUSINESS', label: t('newSupplier.types.business.title') },
                    { value: 'GOVERNMENT', label: t('newSupplier.types.government.title') },
                  ]}
                />
              )
            }
          >
            <div className="flex flex-col gap-4">
              <TextField
                id={inputId('legalName')}
                name="legalName"
                label={
                  isGovernment ? t('newSupplier.details.entityName') : t('supplierEdit.legalName')
                }
                placeholder={
                  isGovernment
                    ? t('newSupplier.details.entityNamePlaceholder')
                    : t('newSupplier.details.legalNamePlaceholder')
                }
                required
                maxLength={200}
                value={values.legalName}
                onChange={(next) => change('legalName', next)}
                error={errorText('legalName')}
              />
              <FieldGrid>
                <TextField
                  id="supplier-tradingName"
                  name="tradingName"
                  label={t('supplierEdit.tradingName')}
                  placeholder={t('newSupplier.details.commercialNamePlaceholder')}
                  maxLength={200}
                  value={tradingName}
                  onChange={setTradingName}
                />
                <TextField
                  id={inputId('commercialRegistrationNumber')}
                  name="commercialRegistrationNumber"
                  label={t('supplierEdit.commercialRegistration')}
                  placeholder={t('newSupplier.details.crPlaceholder')}
                  maxLength={30}
                  value={values.commercialRegistrationNumber}
                  onChange={(next) => change('commercialRegistrationNumber', next)}
                  error={errorText('commercialRegistrationNumber')}
                />
              </FieldGrid>
              <FieldGrid>
                <CheckedField
                  id={inputId('vatNumber')}
                  name="vatNumber"
                  label={t('supplierEdit.vatNumber')}
                  placeholder="OM1100000000"
                  maxLength={64}
                  value={values.vatNumber}
                  onChange={changeVatNumber}
                  valid={vatValid}
                  hint={vatValid ? t('supplierEdit.vatValid') : t('supplierEdit.vatHint')}
                  error={errorText('vatNumber')}
                />
                <SelectRow
                  id="supplier-billing-country"
                  label={t('supplierEdit.country')}
                  value={values.billing.countryCode}
                  options={countries}
                  onChange={(next) =>
                    change('billing', {
                      ...values.billing,
                      countryCode: next,
                      // A governorate is Oman's; another country's address does not keep one.
                      ...(next === 'OM'
                        ? {}
                        : {
                            countrySubentity: '',
                            kept: { ...values.billing.kept, countrySubentityCode: null },
                          }),
                    })
                  }
                />
              </FieldGrid>
            </div>
          </SectionCard>

          <SectionCard step={2} title={t('supplierEdit.howBillsReach')}>
            <div className="flex flex-col gap-5">
              <ToggleRow
                label={t('supplierEdit.onPeppol')}
                hint={t('supplierEdit.onPeppolHint')}
                checked={values.registeredOnPeppol}
                onChange={(next) => change('registeredOnPeppol', next)}
                name="registeredOnPeppol"
              />
              {values.registeredOnPeppol ? (
                <CheckedField
                  id={inputId('peppolId')}
                  name="peppolId"
                  label={t('supplierEdit.peppolId')}
                  placeholder="0248:OM1100000000"
                  required
                  value={values.peppolId}
                  onChange={(next) => change('peppolId', next)}
                  valid={peppolValid}
                  hint={
                    peppolValid
                      ? t('supplierEdit.peppolValid')
                      : t('newSupplier.details.peppolIdHint')
                  }
                  error={errorText('peppolId')}
                />
              ) : null}
              <ToggleRow
                label={t('supplierEdit.autoMatch')}
                hint={t('supplierEdit.autoMatchHint')}
                checked={autoMatch}
                onChange={setAutoMatch}
                name="autoMatch"
              />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-[1.2] text-text-primary">
                    {t('supplierEdit.selfBilling')}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                    {record?.profile.selfBillingAgreement
                      ? t('supplierForm.selfBillingActive')
                      : t('supplierEdit.selfBillingHint')}
                  </p>
                </div>
                {/* Read from the agreement on file; it is turned on by signing one, not here. */}
                <Switch
                  checked={record?.profile.selfBillingAgreement ?? false}
                  onChange={() => undefined}
                  label={t('supplierEdit.selfBilling')}
                  disabled
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard step={3} title={t('supplierEdit.payingThem')}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <SelectRow
                  id={inputId('paymentTerms')}
                  label={t('supplierEdit.paymentTerms')}
                  required
                  value={values.paymentTerms}
                  options={paymentTerms}
                  placeholder={t('supplierForm.notSet')}
                  onChange={(next) => change('paymentTerms', next)}
                  error={errorText('paymentTerms')}
                />
                <EarlySettlementField
                  percent={values.earlyPaymentDiscountPercent}
                  days={values.earlyPaymentDiscountDays}
                  onPercent={(next) => change('earlyPaymentDiscountPercent', next)}
                  onDays={(next) => change('earlyPaymentDiscountDays', next)}
                  error={
                    errorText('earlyPaymentDiscountPercent') ??
                    errorText('earlyPaymentDiscountDays')
                  }
                />
                <SelectRow
                  id={inputId('defaultCurrency')}
                  label={t('supplierEdit.defaultCurrency')}
                  value={values.defaultCurrency}
                  options={withCurrent(currencies, values.defaultCurrency)}
                  onChange={(next) => change('defaultCurrency', next)}
                  error={errorText('defaultCurrency')}
                />
              </div>
              <FieldGrid>
                <TextField
                  id={inputId('bankName')}
                  name="bankName"
                  label={t('supplierEdit.bank')}
                  placeholder={t('supplierEdit.bankPlaceholder')}
                  maxLength={100}
                  value={values.bankName}
                  onChange={(next) => change('bankName', next)}
                  error={errorText('bankName')}
                />
                <TextField
                  id={inputId('bic')}
                  name="bic"
                  label={t('supplierEdit.bicSwift')}
                  placeholder="BMUSOMRX"
                  maxLength={11}
                  value={values.bic}
                  onChange={(next) => change('bic', next.toUpperCase())}
                  error={errorText('bic')}
                />
              </FieldGrid>
              <TextField
                id={inputId('iban')}
                name="iban"
                label={t('supplierEdit.iban')}
                placeholder="OM00 0000 0000 0000 0000 000"
                value={values.iban}
                onChange={(next) => change('iban', next.toUpperCase())}
                error={errorText('iban')}
                hint={editing && bank ? t('supplierForm.ibanChangeHint') : undefined}
              />
              {bankUnconfirmed ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-pending-200 bg-pending-100 p-4">
                  <p className="text-sm font-medium leading-[1.5] text-text-secondary">
                    {t('supplierForm.bankUnconfirmed')}
                  </p>
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
            </div>
          </SectionCard>

          <SectionCard step={4} title={t('supplierEdit.contactAndFiling')}>
            <div className="flex flex-col gap-4">
              <FieldGrid>
                <TextField
                  id={inputId('contactPerson')}
                  name="contactPerson"
                  label={t('supplierEdit.mainContact')}
                  placeholder={t('newSupplier.contact.personPlaceholder')}
                  required
                  maxLength={200}
                  value={values.contactPerson}
                  onChange={(next) => change('contactPerson', next)}
                  error={errorText('contactPerson')}
                />
                <TextField
                  id={inputId('emails')}
                  name="emails"
                  type="email"
                  label={t('supplierEdit.theirEmail')}
                  placeholder="name@supplier.om"
                  hint={t('supplierEdit.emailHint')}
                  value={values.emails}
                  onChange={(next) => change('emails', next)}
                  error={errorText('emails')}
                />
              </FieldGrid>
              <FieldGrid>
                <PhoneField
                  id={inputId('telephone')}
                  name="telephone"
                  label={t('supplierEdit.phone')}
                  value={values.telephone}
                  onChange={(next) => change('telephone', next)}
                  error={errorText('telephone')}
                />
                <TextField
                  id="supplier-billing-address"
                  name="address"
                  label={t('supplierEdit.address')}
                  placeholder={t('newCustomer.address.streetPlaceholder')}
                  maxLength={150}
                  value={values.billing.streetName}
                  onChange={(next) => changeAddress('streetName', next)}
                  error={addressError ? errorText(addressError) : undefined}
                />
              </FieldGrid>
              {/* The address in its parts, as a self-billed invoice needs them on the supplier as
                  seller (PINT-OM IBR-019-OM: address line, city and post code). */}
              <FieldGrid>
                <TextField
                  id={inputId('billing.cityName')}
                  name="city"
                  label={t('addressContact.city')}
                  placeholder={t('newCustomer.address.cityPlaceholder')}
                  maxLength={150}
                  value={values.billing.cityName}
                  onChange={(next) => changeAddress('cityName', next)}
                  error={errorText('billing.cityName')}
                />
                {values.billing.countryCode === 'OM' ? (
                  <SelectRow
                    id={inputId('billing.countrySubentity')}
                    label={t('addressContact.governorate')}
                    value={values.billing.countrySubentity}
                    options={governorates}
                    placeholder={t('supplierEdit.governoratePlaceholder')}
                    onChange={(next) => changeAddress('countrySubentity', next)}
                    error={errorText('billing.countrySubentity')}
                  />
                ) : null}
              </FieldGrid>
              <FieldGrid>
                <TextField
                  id={inputId('billing.postalCode')}
                  name="postalCode"
                  label={t('addressContact.postalCode')}
                  placeholder={t('supplierEdit.postalCodePlaceholder')}
                  inputMode="numeric"
                  maxLength={20}
                  value={values.billing.postalCode}
                  onChange={(next) => changeAddress('postalCode', next)}
                  error={errorText('billing.postalCode')}
                />
              </FieldGrid>
              <SelectRow
                id={inputId('supplierCategory')}
                label={t('supplierEdit.category')}
                value={values.supplierCategory}
                options={categories}
                onChange={(next) => change('supplierCategory', next)}
                error={errorText('supplierCategory')}
              />

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium leading-[1.2] text-text-primary">
                  {t('supplierEdit.tags')}
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex h-[34px] items-center gap-2 rounded-sm bg-primary-50 px-3 text-sm font-medium text-primary-800"
                    >
                      {tag}
                      <button
                        type="button"
                        aria-label={t('supplierEdit.removeTag', { tag })}
                        onClick={() =>
                          setTags((current) => current.filter((entry) => entry !== tag))
                        }
                      >
                        <img src={removeIcon} alt="" className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  <label className="inline-flex h-[34px] items-center gap-1.5 rounded-sm border border-dashed border-border-default bg-white px-3 text-sm font-medium text-text-secondary focus-within:border-primary-300">
                    <img src={plusIcon} alt="" className="size-3.5" />
                    <input
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        const tag = newTag.trim()
                        if (tag && !tags.includes(tag)) setTags((current) => [...current, tag])
                        setNewTag('')
                      }}
                      maxLength={40}
                      placeholder={t('supplierEdit.addTag')}
                      aria-label={t('supplierEdit.addTag')}
                      className="w-[110px] bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-secondary"
                    />
                  </label>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {editing && record ? (
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('supplierEdit.isComplete')}
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                <CheckItem
                  done={!health.has('NO_VAT_NUMBER') && record.profile.vatNumber !== null}
                  label={t('supplierEdit.complete.vat')}
                />
                <CheckItem
                  done={record.profile.participantId !== null}
                  label={t('supplierEdit.complete.peppol')}
                />
                <CheckItem
                  done={!health.has('NO_BANK_DETAILS') && hasBankAccount(record.profile.bankDetails)}
                  label={t('supplierEdit.complete.iban')}
                />
                <CheckItem
                  done={Boolean(record.profile.paymentTerms)}
                  label={t('supplierEdit.complete.terms')}
                />
                {/* TODO(backend): a contacts count on the record; the second contact is read as absent until then. */}
                <CheckItem
                  done={false}
                  label={t('supplierEdit.complete.secondContact', {
                    name:
                      (record.profile.contactPerson ?? '').split(' ')[0] ||
                      t('supplierEdit.theContact'),
                  })}
                />
              </ul>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('supplierEdit.whatItAffects')}
              </h2>
              <dl className="mt-3 flex flex-col">
                <AffectRow label={t('supplierEdit.openBills')}>
                  {overviewData ? (
                    <span className="flex items-center gap-1 tabular-nums">
                      {openBills}
                      <span className="text-text-quaternary">-</span>
                      <OmAmount
                        size="xs"
                        amount={formatAmount(overviewData.payables.total, currency, language)}
                        amountClassName="text-sm font-semibold text-text-primary tabular-nums"
                      />
                    </span>
                  ) : (
                    <span className="text-text-quaternary">{t('supplierEdit.notAvailable')}</span>
                  )}
                </AffectRow>
                {/* TODO(backend): the draft payment run holding their bills, and their recurring bills. */}
                <AffectRow label={t('supplierEdit.inDraftRun')}>
                  <span className="text-text-quaternary">{t('supplierEdit.notAvailable')}</span>
                </AffectRow>
                <AffectRow label={t('supplierEdit.openOrders')}>
                  {overviewData ? (
                    overviewData.tabs.orders > 0 ? (
                      String(overviewData.tabs.orders)
                    ) : (
                      t('supplierEdit.none')
                    )
                  ) : (
                    <span className="text-text-quaternary">{t('supplierEdit.notAvailable')}</span>
                  )}
                </AffectRow>
                <AffectRow label={t('supplierEdit.recurringBills')} last>
                  <span className="text-text-quaternary">{t('supplierEdit.notAvailable')}</span>
                </AffectRow>
              </dl>
            </section>

            <RecentChanges record={record} language={language} />
          </aside>
        ) : null}
      </div>

      <SwitchSupplierOffModal
        target={offTarget}
        busy={busy}
        onClose={() => setOffTarget(null)}
        // TODO(backend): send the reason and the note once `POST /suppliers/{id}/switch-off` takes them.
        onConfirm={() => void switchTo('off')}
      />
    </form>
  )
}

/** A stored code this build's list does not have is still shown, not silently replaced. */
function withCurrent(options: SelectOption[], current: string): SelectOption[] {
  const known = options.some((option) => option.value === current)
  return current && !known ? [{ value: current, label: current }, ...options] : options
}

function SelectRow({
  id,
  label,
  required,
  value,
  options,
  placeholder,
  onChange,
  error,
}: {
  id: string
  label: string
  required?: boolean
  value: string
  options: SelectOption[]
  placeholder?: string
  onChange: (next: string) => void
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1" id={id}>
      <FieldLabel label={label} required={required} />
      <Select
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        ariaLabel={label}
      />
      {error ? (
        <p className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** A field that confirms itself as you type, which is what the tick in the frame means. */
function CheckedField({
  id,
  name,
  label,
  placeholder,
  required,
  maxLength,
  value,
  onChange,
  valid,
  hint,
  error,
}: {
  id: string
  name: string
  label: string
  placeholder?: string
  required?: boolean
  maxLength?: number
  value: string
  onChange: (next: string) => void
  valid: boolean
  hint: string
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel label={label} required={required} htmlFor={id} />
      <div className="relative">
        <input
          id={id}
          name={name}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          // A code with a colon in it ("0248:OM…") splits into two runs in an Arabic page; it is
          // read left to right whatever the page's direction.
          dir="ltr"
          className={[
            'h-[50px] w-full rounded-sm border bg-surface-tab-bar px-4 pe-11 text-sm font-medium text-text-secondary outline-none transition-colors placeholder:text-text-placeholder focus:border-primary-700 rtl:text-right',
            error ? 'border-border-danger' : value ? 'border-primary-300' : 'border-border-default',
          ].join(' ')}
        />
        {valid && !error ? (
          <img
            src={checkIcon}
            alt=""
            className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2"
          />
        ) : null}
      </div>
      {error ? (
        <p className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs font-medium leading-[1.3] text-text-quaternary">
          {valid ? <img src={checkIcon} alt="" className="size-3.5" /> : null}
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * "2% within 7 days" in one box, as the frame draws it, holding the two numbers the request
 * carries. Both figure inputs select on focus so the first keystroke replaces what is there.
 */
function EarlySettlementField({
  percent,
  days,
  onPercent,
  onDays,
  error,
}: {
  percent: string
  days: string
  onPercent: (next: string) => void
  onDays: (next: string) => void
  error?: string
}) {
  const { t } = useTranslation()
  const filled = percent !== '' || days !== ''
  const figure =
    'w-11 min-w-0 bg-transparent text-center text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder'
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel
        label={t('supplierEdit.earlySettlement')}
        htmlFor="supplier-earlyPaymentDiscountPercent"
      />
      <div
        className={[
          'flex h-[50px] w-full items-center gap-1 rounded-sm border bg-surface-tab-bar px-3 transition-colors focus-within:border-primary-700',
          error ? 'border-border-danger' : filled ? 'border-primary-300' : 'border-border-default',
        ].join(' ')}
      >
        <input
          id="supplier-earlyPaymentDiscountPercent"
          name="earlyPaymentDiscountPercent"
          inputMode="decimal"
          placeholder="2"
          value={percent}
          onChange={(event) => onPercent(event.target.value)}
          onFocus={selectAllOnFocus}
          aria-label={t('supplierForm.earlyPercent')}
          className={figure}
        />
        <span className="shrink-0 text-sm font-medium text-text-secondary">
          {t('supplierEdit.earlyWithin')}
        </span>
        <input
          id="supplier-earlyPaymentDiscountDays"
          name="earlyPaymentDiscountDays"
          inputMode="numeric"
          placeholder="7"
          value={days}
          onChange={(event) => onDays(event.target.value)}
          onFocus={selectAllOnFocus}
          aria-label={t('supplierForm.earlyDays')}
          className={figure}
        />
        <span className="shrink-0 text-sm font-medium text-text-secondary">
          {t('supplierEdit.earlyDaysUnit')}
        </span>
      </div>
      {error ? (
        <p className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {done ? (
        <img src={checkIcon} alt="" className="mt-0.5 size-4 shrink-0" />
      ) : (
        <span className="mt-0.5 size-4 shrink-0 rounded-full border border-border-default" />
      )}
      <span
        className={[
          'text-sm font-medium leading-[1.4]',
          done ? 'text-text-secondary' : 'text-text-quaternary',
        ].join(' ')}
      >
        {label}
      </span>
    </li>
  )
}

function AffectRow({
  label,
  children,
  last,
}: {
  label: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold text-text-primary">{children}</dd>
    </div>
  )
}

/**
 * The frame's audit trail, from the dates the record carries: when the bank details changed and
 * were confirmed, when the supplier was switched off, when they were added. TODO(backend): an audit
 * feed with who made each change.
 */
function RecentChanges({ record, language }: { record: SupplierDetailDto; language: string }) {
  const { t } = useTranslation()
  const p = record.profile
  const entries: { id: string; key: string; at: string; day: boolean }[] = []
  if (p.bankDetails?.confirmedAt)
    entries.push({
      id: 'bankConfirmed',
      key: 'supplierEdit.change.bankConfirmed',
      at: p.bankDetails.confirmedAt,
      day: false,
    })
  if (p.bankDetails?.changedAt)
    entries.push({
      id: 'bankChanged',
      key: 'supplierEdit.change.iban',
      at: p.bankDetails.changedAt,
      day: false,
    })
  if (p.switchedOffAt)
    entries.push({
      id: 'switchedOff',
      key: 'supplierEdit.change.switchedOff',
      at: p.switchedOffAt,
      day: false,
    })
  if (p.supplierSince)
    entries.push({
      id: 'created',
      key: 'supplierEdit.change.created',
      at: p.supplierSince,
      day: true,
    })
  entries.sort((a, b) => b.at.localeCompare(a.at))

  return (
    <section className="rounded-md bg-surface-card p-5">
      <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
        {t('supplierEdit.recentChanges')}
      </h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm font-medium text-text-quaternary">
          {t('supplierEdit.noChanges')}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              className={[
                'flex items-start gap-3 py-3',
                index < entries.length - 1 ? 'border-b border-surface-background' : '',
              ].join(' ')}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-background">
                <span className="size-2 rounded-full bg-text-quaternary" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                  {t(entry.key)}
                </p>
                <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                  {entry.day
                    ? formatDate(entry.at, language)
                    : formatInstantDay(entry.at, language)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
