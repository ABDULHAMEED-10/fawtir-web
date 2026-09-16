import type {
  BillingChannel,
  SupplierAddressDto,
  SupplierDetailDto,
  SupplierRequestDto,
  SupplierTypeDto,
} from '../api/expenditure/suppliers'
import type { ProblemFieldError } from '../api/errors'
import * as validate from './validation'

/**
 * The supplier form, for a new supplier and for an existing one (decisions of 2026-09-16, E-02).
 *
 * One form on the New page's layout. What it holds is what `SupplierRequest` carries; the mock's
 * logo, website, trading name, tags and self-billing switch have nothing behind them and are not
 * here. The request is flat, and an edit replaces what it is sent, so the mapping back to a request
 * is where most of the care is: the bank details are sent only when someone changed them, because
 * any change — even resending the same account without its bank name — raises "bank changed".
 */

export type AddressValues = {
  attention: string
  countryCode: string
  cityName: string
  streetName: string
  poBox: string
  postalCode: string
  /**
   * The parts the form does not draw (governorate, building number, …), carried through as they
   * were loaded: an edit replaces the whole address, and dropping them would erase them.
   */
  kept: Pick<SupplierAddressDto, 'countrySubentity' | 'buildingNumber' | 'additionalStreetName' | 'addressLine3' | 'countrySubentityCode'>
}

export type AddressField = Exclude<keyof AddressValues, 'kept'>

export type SupplierFormValues = {
  type: SupplierTypeDto
  legalName: string
  commercialRegistrationNumber: string
  supplierCategory: string
  registeredForVat: boolean
  vatNumber: string
  registeredOnPeppol: boolean
  /** `scheme:value`, as the supplier quotes it: `0248:OM1100000000`. */
  peppolId: string
  contactPerson: string
  roleTitle: string
  /** One address per line, or separated by commas. */
  emails: string
  /** The 8-digit Omani number the field shows beside +968, or a full `+…` number from elsewhere. */
  telephone: string
  mobilePhone: string
  preferredLanguage: '' | 'en' | 'ar'
  defaultCurrency: string
  defaultTaxCategory: string
  paymentTerms: string
  defaultPaymentMethod: string
  iban: string
  bic: string
  earlyPaymentDiscountPercent: string
  earlyPaymentDiscountDays: string
  receivingChannel: BillingChannel
  requiresApprovalBeforePayment: boolean
  billing: AddressValues
  sameAsBilling: boolean
  pickup: AddressValues
  notes: string
}

export type SupplierField =
  | Exclude<keyof SupplierFormValues, 'billing' | 'pickup'>
  | `billing.${AddressField}`
  | `pickup.${AddressField}`

/** What an edit was loaded with, to tell a changed account from an untouched one. */
export type LoadedBank = { iban: string; bic: string; beneficiaryName: string | null; bankName: string | null } | null

const NOTHING_KEPT: AddressValues['kept'] = {
  countrySubentity: null,
  buildingNumber: null,
  additionalStreetName: null,
  addressLine3: null,
  countrySubentityCode: null,
}

const blankAddress = (): AddressValues => ({
  attention: '',
  countryCode: 'OM',
  cityName: '',
  streetName: '',
  poBox: '',
  postalCode: '',
  kept: NOTHING_KEPT,
})

export function blankSupplierForm(): SupplierFormValues {
  return {
    type: 'BUSINESS',
    legalName: '',
    commercialRegistrationNumber: '',
    supplierCategory: '',
    registeredForVat: true,
    vatNumber: '',
    registeredOnPeppol: true,
    peppolId: '',
    contactPerson: '',
    roleTitle: '',
    emails: '',
    telephone: '',
    mobilePhone: '',
    preferredLanguage: '',
    defaultCurrency: 'OMR',
    defaultTaxCategory: 'S5',
    paymentTerms: 'NET30',
    defaultPaymentMethod: '30',
    iban: '',
    bic: '',
    earlyPaymentDiscountPercent: '',
    earlyPaymentDiscountDays: '',
    receivingChannel: 'PEPPOL',
    requiresApprovalBeforePayment: true,
    billing: blankAddress(),
    sameAsBilling: true,
    pickup: blankAddress(),
    notes: '',
  }
}

const text = (value: string | null | undefined) => value ?? ''

/** The +968 the phone field draws is not part of its value. */
function nationalPhone(value: string | null): string {
  if (!value) return ''
  return value.startsWith('+968') ? value.slice(4) : value
}

function addressValues(address: SupplierAddressDto | null): AddressValues {
  if (!address) return blankAddress()
  return {
    attention: text(address.attention),
    countryCode: text(address.countryCode),
    cityName: text(address.cityName),
    streetName: text(address.streetName),
    poBox: text(address.poBox),
    postalCode: text(address.postalCode),
    kept: {
      countrySubentity: address.countrySubentity ?? null,
      buildingNumber: address.buildingNumber ?? null,
      additionalStreetName: address.additionalStreetName ?? null,
      addressLine3: address.addressLine3 ?? null,
      countrySubentityCode: address.countrySubentityCode ?? null,
    },
  }
}

export function fromSupplierDetail(detail: SupplierDetailDto): { values: SupplierFormValues; bank: LoadedBank } {
  const p = detail.profile
  const values: SupplierFormValues = {
    type: p.type,
    legalName: text(p.legalName ?? p.displayName),
    commercialRegistrationNumber: text(p.commercialRegistrationNumber),
    supplierCategory: text(p.supplierCategory),
    registeredForVat: p.registeredForVat ?? p.vatNumber !== null,
    vatNumber: text(p.vatNumber),
    registeredOnPeppol: p.registeredOnPeppol ?? p.participantId !== null,
    peppolId: text(p.participantId),
    contactPerson: text(p.contactPerson),
    roleTitle: text(p.roleTitle),
    emails: (p.emailRecipients ?? []).join('\n'),
    telephone: nationalPhone(p.telephone),
    mobilePhone: nationalPhone(p.mobilePhone),
    preferredLanguage: p.preferredLanguage === 'en' || p.preferredLanguage === 'ar' ? p.preferredLanguage : '',
    defaultCurrency: text(p.defaultCurrency),
    defaultTaxCategory: text(p.defaultTaxCategory),
    paymentTerms: text(p.paymentTerms),
    defaultPaymentMethod: text(p.defaultPaymentMethod),
    iban: text(p.bankDetails?.iban),
    bic: text(p.bankDetails?.bic),
    earlyPaymentDiscountPercent: p.earlyPaymentDiscountPercent === null ? '' : String(p.earlyPaymentDiscountPercent),
    earlyPaymentDiscountDays: p.earlyPaymentDiscountDays === null ? '' : String(p.earlyPaymentDiscountDays),
    receivingChannel: p.receivingChannel ?? 'MANUAL',
    requiresApprovalBeforePayment: p.requiresApprovalBeforePayment ?? false,
    billing: addressValues(detail.invoiceAddress),
    sameAsBilling: detail.sameAsInvoicingAddress,
    pickup: addressValues(detail.deliveryAddress),
    notes: text(p.notes),
  }
  const bank = p.bankDetails
    ? { iban: p.bankDetails.iban, bic: text(p.bankDetails.bic), beneficiaryName: p.bankDetails.beneficiaryName, bankName: p.bankDetails.bankName }
    : null
  return { values, bank }
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())

function e164(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.startsWith('+') ? trimmed.replace(/[\s().-]/g, '') : validate.toOmanE164(trimmed)
}

function addressRequest(address: AddressValues): SupplierAddressDto | null {
  const request: SupplierAddressDto = {
    ...address.kept,
    attention: orNull(address.attention),
    countryCode: orNull(address.countryCode),
    cityName: orNull(address.cityName),
    streetName: orNull(address.streetName),
    poBox: orNull(address.poBox),
    postalCode: orNull(address.postalCode),
  }
  // The country select always holds a value, so a country alone is not an address anyone entered.
  const entered = Object.entries(request).some(([field, value]) => field !== 'countryCode' && value !== null && value !== undefined)
  return entered ? request : null
}

const compactIban = (value: string) => value.replace(/\s+/g, '').toUpperCase()

/**
 * @param loadedBank the account the edit opened with; null on a new supplier. The account is sent
 *        only when the IBAN or BIC differs from it, with the beneficiary and bank name it had, so an
 *        edit that never touched it neither clears the bank name nor flags a change nobody made.
 */
export function toSupplierRequest(values: SupplierFormValues, loadedBank: LoadedBank, version?: number): SupplierRequestDto {
  const [scheme, ...rest] = values.peppolId.trim().split(':')
  const participantValue = rest.join(':').trim()
  const iban = compactIban(values.iban)
  const bic = values.bic.trim().toUpperCase()
  const bankChanged = iban !== '' && (loadedBank === null || iban !== compactIban(loadedBank.iban) || bic !== loadedBank.bic.toUpperCase())
  const percent = values.earlyPaymentDiscountPercent.trim()
  const days = values.earlyPaymentDiscountDays.trim()
  const pickup = values.sameAsBilling ? null : addressRequest(values.pickup)
  return {
    type: values.type,
    legalName: values.legalName.trim(),
    vatNumber: values.registeredForVat ? orNull(values.vatNumber.toUpperCase()) : null,
    registeredForVat: values.registeredForVat,
    registeredOnPeppol: values.registeredOnPeppol,
    participantScheme: values.registeredOnPeppol ? orNull(scheme ?? '') : null,
    participantValue: values.registeredOnPeppol ? orNull(participantValue.toUpperCase()) : null,
    defaultCurrency: orNull(values.defaultCurrency),
    defaultTaxCategory: orNull(values.defaultTaxCategory),
    paymentTerms: orNull(values.paymentTerms),
    defaultPaymentMethod: orNull(values.defaultPaymentMethod),
    bankDetails: bankChanged
      ? { beneficiaryName: loadedBank?.beneficiaryName ?? null, iban, bic: bic || null, bankName: loadedBank?.bankName ?? null }
      : null,
    contactPerson: values.contactPerson.trim(),
    roleTitle: orNull(values.roleTitle),
    emailRecipients: emailList(values.emails),
    telephone: e164(values.telephone),
    mobilePhone: e164(values.mobilePhone),
    preferredLanguage: values.preferredLanguage || null,
    receivingChannel: values.receivingChannel,
    requiresApprovalBeforePayment: values.requiresApprovalBeforePayment,
    earlyPaymentDiscountPercent: percent === '' ? null : Number(percent),
    earlyPaymentDiscountDays: days === '' ? null : Number(days),
    invoiceAddress: addressRequest(values.billing),
    sameAsInvoicingAddress: values.sameAsBilling || pickup === null,
    deliveryAddress: values.sameAsBilling ? null : pickup,
    commercialRegistrationNumber: orNull(values.commercialRegistrationNumber),
    notes: orNull(values.notes),
    supplierCategory: orNull(values.supplierCategory),
    ...(version === undefined ? {} : { version }),
  }
}

export function emailList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export type SupplierProblems = Partial<Record<SupplierField, string>>

const IBAN_SHAPE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/
const BIC_SHAPE = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/
const OM_PARTICIPANT = /^OM11\d{8}$/

/**
 * What the server would refuse, said before the request goes. The server still decides: the SPIS
 * grammar of a 0242 identifier, and whether a VAT number or Peppol ID is already on another record,
 * are only known there.
 */
export function supplierProblems(values: SupplierFormValues, loadedBank: LoadedBank): SupplierProblems {
  const problems: SupplierProblems = {}
  if (!values.legalName.trim()) problems.legalName = 'validation.required'
  if (!values.contactPerson.trim()) problems.contactPerson = 'validation.required'
  if (values.registeredForVat) {
    const vat = validate.vatin(values.vatNumber)
    if (vat) problems.vatNumber = vat
  }
  if (values.registeredOnPeppol) {
    const [scheme, ...rest] = values.peppolId.trim().split(':')
    const value = rest.join(':').trim().toUpperCase()
    if (!values.peppolId.trim()) problems.peppolId = 'validation.required'
    else if ((scheme !== '0248' && scheme !== '0242') || !value) problems.peppolId = 'supplierForm.error.peppolShape'
    // OM11 only: a group VAT number (OM12) is not a participant, which the server names separately.
    else if (scheme === '0248' && !OM_PARTICIPANT.test(value)) problems.peppolId = 'supplierForm.error.peppolVat'
  }
  const emails = emailList(values.emails)
  if (emails.some((entry) => validate.email(entry))) problems.emails = 'validation.email'
  else if (new Set(emails.map((entry) => entry.toLowerCase())).size !== emails.length) problems.emails = 'supplierForm.error.duplicateEmail'
  else if (emails.length > 10) problems.emails = 'supplierForm.error.tooManyEmails'
  for (const field of ['telephone', 'mobilePhone'] as const) {
    const value = values[field].trim()
    if (!value) continue
    if (value.startsWith('+')) {
      if (!/^\+[1-9][0-9]{6,14}$/.test(value.replace(/[\s().-]/g, ''))) problems[field] = 'supplierForm.error.phone'
    } else {
      const refused = validate.omanPhone(value)
      if (refused) problems[field] = refused
    }
  }
  const iban = compactIban(values.iban)
  if (iban && !IBAN_SHAPE.test(iban)) problems.iban = 'supplierForm.error.iban'
  if (!iban && loadedBank) problems.iban = 'supplierForm.error.ibanKeep'
  if (!iban && values.bic.trim()) problems.iban = 'validation.required'
  if (values.bic.trim() && !BIC_SHAPE.test(values.bic.trim().toUpperCase())) problems.bic = 'supplierForm.error.bic'
  const percent = values.earlyPaymentDiscountPercent.trim()
  const days = values.earlyPaymentDiscountDays.trim()
  if (percent !== '' || days !== '') {
    if (percent === '') problems.earlyPaymentDiscountPercent = 'supplierForm.error.discountPair'
    else if (!/^\d{1,3}(\.\d{1,2})?$/.test(percent) || Number(percent) > 100) {
      problems.earlyPaymentDiscountPercent = 'supplierForm.error.discountPercent'
    }
    if (days === '') problems.earlyPaymentDiscountDays = 'supplierForm.error.discountPair'
    else if (!/^\d{1,4}$/.test(days)) problems.earlyPaymentDiscountDays = 'supplierForm.error.discountDays'
  }
  if (!values.sameAsBilling && addressRequest(values.pickup) === null) problems['pickup.cityName'] = 'supplierForm.error.pickupRequired'
  return problems
}

/** The request's field names, as the server's refusals use them, and the input each belongs to. */
const REQUEST_TO_FORM: Record<string, SupplierField> = {
  type: 'type',
  legalName: 'legalName',
  vatNumber: 'vatNumber',
  registeredForVat: 'vatNumber',
  participantValue: 'peppolId',
  participantScheme: 'peppolId',
  registeredOnPeppol: 'peppolId',
  contactPerson: 'contactPerson',
  roleTitle: 'roleTitle',
  emailRecipients: 'emails',
  telephone: 'telephone',
  mobilePhone: 'mobilePhone',
  defaultCurrency: 'defaultCurrency',
  defaultTaxCategory: 'defaultTaxCategory',
  paymentTerms: 'paymentTerms',
  defaultPaymentMethod: 'defaultPaymentMethod',
  'bankDetails.iban': 'iban',
  'bankDetails.bic': 'bic',
  earlyPaymentDiscountPercent: 'earlyPaymentDiscountPercent',
  earlyPaymentDiscountDays: 'earlyPaymentDiscountDays',
  commercialRegistrationNumber: 'commercialRegistrationNumber',
  supplierCategory: 'supplierCategory',
  notes: 'notes',
  deliveryAddress: 'pickup.cityName',
}

/** A rule the server names, per input, in words this build has; anything else shows the server's own. */
const RULE_KEYS: Partial<Record<SupplierField, Record<string, string>>> = {
  vatNumber: { INVALID_FORMAT: 'validation.vatin', INVALID_CHARACTERS: 'validation.vatin' },
  peppolId: { INVALID_FORMAT: 'supplierForm.error.peppolShape', VAT_GROUP_NOT_A_PARTICIPANT: 'supplierForm.error.vatGroup' },
  emails: { INVALID_FORMAT: 'validation.email', DUPLICATE: 'supplierForm.error.duplicateEmail', TOO_MANY: 'supplierForm.error.tooManyEmails' },
  telephone: { INVALID_FORMAT: 'supplierForm.error.phone' },
  mobilePhone: { INVALID_FORMAT: 'supplierForm.error.phone' },
  iban: { INVALID_FORMAT: 'supplierForm.error.iban' },
  bic: { INVALID_FORMAT: 'supplierForm.error.bic' },
  earlyPaymentDiscountPercent: { REQUIRED: 'supplierForm.error.discountPair', OUT_OF_RANGE: 'supplierForm.error.discountPercent', INVALID_FORMAT: 'supplierForm.error.discountPercent' },
  earlyPaymentDiscountDays: { REQUIRED: 'supplierForm.error.discountPair', OUT_OF_RANGE: 'supplierForm.error.discountDays' },
  'pickup.cityName': { REQUIRED: 'supplierForm.error.pickupRequired' },
}

export type PlacedError = { key: string } | { text: string }

/**
 * The server's field refusals on their inputs. An address field arrives with its full path
 * (`invoiceAddress.countryCode`); a field this form does not draw is returned for a notice instead.
 */
export function placeSupplierErrors(errors: readonly ProblemFieldError[]): {
  fields: Partial<Record<SupplierField, PlacedError>>
  other: string[]
} {
  const fields: Partial<Record<SupplierField, PlacedError>> = {}
  const other: string[] = []
  for (const error of errors) {
    const address = /^(invoiceAddress|deliveryAddress)\.(attention|countryCode|cityName|streetName|poBox|postalCode)$/.exec(error.field)
    const field: SupplierField | undefined = address
      ? (`${address[1] === 'invoiceAddress' ? 'billing' : 'pickup'}.${address[2]}` as SupplierField)
      : REQUEST_TO_FORM[error.field]
    if (!field) {
      other.push(error.message)
      continue
    }
    if (fields[field]) continue
    const key = error.code === 'REQUIRED' ? 'validation.required' : error.code === 'TOO_LONG' ? 'validation.tooLong' : error.code ? RULE_KEYS[field]?.[error.code] : undefined
    fields[field] = key ? { key } : { text: error.message }
  }
  return { fields, other }
}
