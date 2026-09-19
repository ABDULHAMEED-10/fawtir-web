import type {
  CustomerLogoDto,
  CustomerRecordDto,
  CustomerRequestDto,
  CustomerSendingMethod,
  CustomerTypeDto,
} from '../api/customers/customers'
import type { ProblemFieldError } from '../api/errors'
import { addressRequest, addressValues, blankAddress, e164, emailList, nationalPhone, type AddressField, type AddressValues } from './supplierForm'
import * as validate from './validation'

/**
 * The customer form: the full New/Edit page and the quick add in the invoice composer
 * (decisions of 2026-09-16, I-02).
 *
 * It holds what `CreateCustomerRequest` carries. The mock's commercial name, CR, IBAN, BIC, website
 * and logo upload have no customer field and are not here. An edit is a PUT that replaces the
 * record, so what the form does not draw — the logo, a special-zone licence, address parts — is
 * carried through from what was loaded rather than dropped.
 */

export type CustomerFormValues = {
  type: CustomerTypeDto
  firstName: string
  lastName: string
  /** The legal name of a business, or the entity/ministry name of a government customer. */
  legalName: string
  registeredForVat: boolean
  vatNumber: string
  registeredOnPeppol: boolean
  /** `scheme:value`, as quoted: `0248:OM1100000000`. */
  peppolId: string
  entityMinistryCode: string
  defaultBuyerReference: string
  defaultPurchaseOrderNumber: string
  defaultContractTenderReference: string
  contactPerson: string
  roleTitle: string
  emails: string
  telephone: string
  mobilePhone: string
  preferredLanguage: '' | 'en' | 'ar'
  defaultCurrency: string
  defaultTaxCategory: string
  paymentTerms: string
  defaultPaymentMethod: string
  sendingMethod: CustomerSendingMethod
  emailPdfCopy: boolean
  automaticPaymentReminders: boolean
  invoice: AddressValues
  sameAsInvoicing: boolean
  delivery: AddressValues
  note: string
  /** Loaded and sent back untouched: the form does not draw them. */
  kept: { logo: CustomerLogoDto | null; specialZoneLicenceNumber: string | null }
}

export type CustomerField =
  | Exclude<keyof CustomerFormValues, 'invoice' | 'delivery' | 'kept'>
  | `invoice.${AddressField}`
  | `delivery.${AddressField}`

export function blankCustomerForm(type: CustomerTypeDto = 'BUSINESS'): CustomerFormValues {
  return {
    type,
    firstName: '',
    lastName: '',
    legalName: '',
    registeredForVat: type !== 'CONSUMER',
    vatNumber: '',
    registeredOnPeppol: type !== 'CONSUMER',
    peppolId: '',
    entityMinistryCode: '',
    defaultBuyerReference: '',
    defaultPurchaseOrderNumber: '',
    defaultContractTenderReference: '',
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
    sendingMethod: type === 'CONSUMER' ? 'QR_RECEIPT' : 'PEPPOL',
    emailPdfCopy: false,
    automaticPaymentReminders: false,
    invoice: blankAddress(),
    sameAsInvoicing: true,
    delivery: blankAddress(),
    note: '',
    kept: { logo: null, specialZoneLicenceNumber: null },
  }
}

/** Switching type keeps what still applies and resets what the new type forbids. */
export function withType(values: CustomerFormValues, type: CustomerTypeDto): CustomerFormValues {
  if (type === values.type) return values
  const fresh = blankCustomerForm(type)
  return {
    ...values,
    type,
    registeredForVat: fresh.registeredForVat,
    registeredOnPeppol: fresh.registeredOnPeppol,
    // A consumer cannot be sent over Peppol; an organisation that was a consumer a moment ago
    // starts from Peppol again, as a new one would.
    sendingMethod:
      type === 'CONSUMER'
        ? values.sendingMethod === 'PEPPOL'
          ? 'QR_RECEIPT'
          : values.sendingMethod
        : values.type === 'CONSUMER' && values.sendingMethod === 'QR_RECEIPT'
          ? 'PEPPOL'
          : values.sendingMethod,
  }
}

const text = (value: string | null | undefined) => value ?? ''

export function fromCustomerRecord(record: CustomerRecordDto): CustomerFormValues {
  const p = record.profile
  const d = p.details
  const participant = d.peppolParticipantId
  return {
    type: record.type,
    firstName: text(d.firstName),
    lastName: text(d.lastName),
    legalName: text(record.type === 'GOVERNMENT' ? d.entityMinistryName : d.legalRegisteredName),
    registeredForVat: d.registeredForVat ?? false,
    vatNumber: text(d.vatRegistrationNumber),
    registeredOnPeppol: d.registeredOnPeppol ?? false,
    peppolId: participant ? `${participant.scheme}:${participant.value}` : '',
    entityMinistryCode: text(d.entityMinistryCode),
    defaultBuyerReference: text(d.defaultBuyerReference),
    defaultPurchaseOrderNumber: text(d.defaultPurchaseOrderNumber),
    defaultContractTenderReference: text(d.defaultContractTenderReference),
    contactPerson: text(p.contact.contactPerson),
    roleTitle: text(p.contact.roleTitle),
    emails: p.contact.emailRecipients.join('\n'),
    telephone: nationalPhone(p.contact.telephone),
    mobilePhone: nationalPhone(p.contact.mobilePhone),
    preferredLanguage: p.contact.preferredLanguage ?? '',
    defaultCurrency: text(p.billingDefaults.defaultCurrency),
    defaultTaxCategory: text(p.billingDefaults.defaultTaxCategory),
    paymentTerms: text(p.billingDefaults.paymentTerms),
    defaultPaymentMethod: text(p.billingDefaults.defaultPaymentMethod),
    sendingMethod: p.deliveryPreferences.sendingMethod,
    emailPdfCopy: p.deliveryPreferences.emailPdfCopy,
    automaticPaymentReminders: p.deliveryPreferences.automaticPaymentReminders,
    invoice: addressValues(p.invoiceAddress),
    sameAsInvoicing: p.sameAsInvoicingAddress,
    delivery: addressValues(p.deliveryAddress),
    note: text(p.customerVisibleNote),
    kept: { logo: p.logo, specialZoneLicenceNumber: d.specialZoneLicenceNumber ?? null },
  }
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())

/**
 * The request for the values. Fields a type forbids are sent as null, never as `false` or `""`:
 * a consumer's `registeredForVat: false` is refused as an organisation field.
 */
export function toCustomerRequest(values: CustomerFormValues, expectedVersion?: number): CustomerRequestDto {
  const consumer = values.type === 'CONSUMER'
  const government = values.type === 'GOVERNMENT'
  const [scheme, ...rest] = values.peppolId.trim().split(':')
  const participant = !consumer && values.registeredOnPeppol && values.peppolId.trim()
    ? { scheme: scheme.trim(), value: rest.join(':').trim().toUpperCase() }
    : null
  const delivery = values.sameAsInvoicing ? null : addressRequest(values.delivery)
  const org = (value: string) => (consumer ? null : orNull(value))
  const gov = (value: string) => (government ? orNull(value) : null)
  return {
    type: values.type,
    logo: values.kept.logo,
    details: {
      firstName: consumer ? orNull(values.firstName) : null,
      lastName: consumer ? orNull(values.lastName) : null,
      legalRegisteredName: values.type === 'BUSINESS' ? orNull(values.legalName) : null,
      entityMinistryName: government ? orNull(values.legalName) : null,
      vatRegistrationNumber: !consumer && values.registeredForVat ? orNull(values.vatNumber.toUpperCase()) : null,
      registeredForVat: consumer ? null : values.registeredForVat,
      entityMinistryCode: gov(values.entityMinistryCode),
      defaultBuyerReference: gov(values.defaultBuyerReference),
      defaultPurchaseOrderNumber: gov(values.defaultPurchaseOrderNumber),
      defaultContractTenderReference: gov(values.defaultContractTenderReference),
      peppolParticipantId: participant,
      registeredOnPeppol: consumer ? null : values.registeredOnPeppol,
      specialZoneLicenceNumber: values.kept.specialZoneLicenceNumber,
    },
    contact: {
      contactPerson: org(values.contactPerson),
      roleTitle: org(values.roleTitle),
      emailRecipients: emailList(values.emails),
      telephone: e164(values.telephone),
      mobilePhone: e164(values.mobilePhone),
      preferredLanguage: values.preferredLanguage || null,
    },
    billingDefaults: {
      defaultCurrency: orNull(values.defaultCurrency),
      defaultTaxCategory: orNull(values.defaultTaxCategory),
      paymentTerms: orNull(values.paymentTerms),
      defaultPaymentMethod: orNull(values.defaultPaymentMethod),
    },
    deliveryPreferences: {
      sendingMethod: values.sendingMethod,
      emailPdfCopy: values.emailPdfCopy,
      automaticPaymentReminders: values.automaticPaymentReminders,
    },
    invoiceAddress: addressRequest(values.invoice),
    sameAsInvoicingAddress: values.sameAsInvoicing || delivery === null,
    deliveryAddress: values.sameAsInvoicing ? null : delivery,
    customerVisibleNote: orNull(values.note),
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  }
}

export type CustomerProblems = Partial<Record<CustomerField, string>>

const OM_PARTICIPANT = /^OM11\d{8}$/

/**
 * What the server would refuse, said before the request goes — including the sending-method rules,
 * which the server refuses without naming a field. It still decides: a 0242 identifier's grammar and
 * whether a VAT number or Peppol ID is already on another record are known only there.
 */
export function customerProblems(values: CustomerFormValues): CustomerProblems {
  const problems: CustomerProblems = {}
  const consumer = values.type === 'CONSUMER'
  if (consumer) {
    if (!values.firstName.trim()) problems.firstName = 'validation.required'
    if (!values.lastName.trim()) problems.lastName = 'validation.required'
  } else {
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
      else if (scheme === '0248' && !OM_PARTICIPANT.test(value)) problems.peppolId = 'supplierForm.error.peppolVat'
    }
  }
  // The B2G form asks for it (directive of 2026-08-13); the API does not require it.
  if (values.type === 'GOVERNMENT' && !values.defaultBuyerReference.trim()) problems.defaultBuyerReference = 'validation.required'

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

  if (values.sendingMethod === 'PEPPOL') {
    if (consumer) problems.sendingMethod = 'customerForm.error.consumerPeppol'
    else if (!values.registeredOnPeppol) problems.sendingMethod = 'customerForm.error.peppolNotRegistered'
  }
  const needsEmail = values.sendingMethod === 'EMAIL_PDF' || values.emailPdfCopy || values.automaticPaymentReminders
  if (needsEmail && emails.length === 0 && !problems.emails) problems.emails = 'customerForm.error.emailNeeded'

  if (!values.sameAsInvoicing && addressRequest(values.delivery) === null) problems['delivery.cityName'] = 'customerForm.error.deliveryRequired'
  return problems
}

/** The model's field paths, as a customer refusal names them, and the input each belongs to. */
const MODEL_TO_FORM: Record<string, CustomerField> = {
  type: 'type',
  'details.firstName': 'firstName',
  'details.lastName': 'lastName',
  'details.legalRegisteredName': 'legalName',
  'details.entityMinistryName': 'legalName',
  'details.vatRegistrationNumber': 'vatNumber',
  'details.registeredForVat': 'vatNumber',
  'details.registeredOnPeppol': 'peppolId',
  'details.peppolParticipantId': 'peppolId',
  'details.peppolParticipantId.scheme': 'peppolId',
  'details.peppolParticipantId.value': 'peppolId',
  'details.entityMinistryCode': 'entityMinistryCode',
  'details.defaultBuyerReference': 'defaultBuyerReference',
  'details.defaultPurchaseOrderNumber': 'defaultPurchaseOrderNumber',
  'details.defaultContractTenderReference': 'defaultContractTenderReference',
  'contact.contactPerson': 'contactPerson',
  'contact.roleTitle': 'roleTitle',
  'contact.emailRecipients': 'emails',
  'contact.telephone': 'telephone',
  'contact.mobilePhone': 'mobilePhone',
  'billingDefaults.defaultCurrency': 'defaultCurrency',
  'billingDefaults.defaultTaxCategory': 'defaultTaxCategory',
  'billingDefaults.paymentTerms': 'paymentTerms',
  'billingDefaults.defaultPaymentMethod': 'defaultPaymentMethod',
  deliveryAddress: 'delivery.cityName',
  customerVisibleNote: 'note',
}

const RULE_KEYS: Partial<Record<CustomerField, Record<string, string>>> = {
  vatNumber: { INVALID_FORMAT: 'validation.vatin', INVALID_CHARACTERS: 'validation.vatin' },
  peppolId: { INVALID_FORMAT: 'supplierForm.error.peppolShape', VAT_GROUP_NOT_A_PARTICIPANT: 'supplierForm.error.vatGroup' },
  emails: { INVALID_FORMAT: 'validation.email', DUPLICATE: 'supplierForm.error.duplicateEmail', TOO_MANY: 'supplierForm.error.tooManyEmails' },
  telephone: { INVALID_FORMAT: 'supplierForm.error.phone' },
  mobilePhone: { INVALID_FORMAT: 'supplierForm.error.phone' },
  'delivery.cityName': { REQUIRED: 'customerForm.error.deliveryRequired' },
}

export type PlacedCustomerError = { key: string } | { text: string }

export function placeCustomerErrors(errors: readonly ProblemFieldError[]): {
  fields: Partial<Record<CustomerField, PlacedCustomerError>>
  other: string[]
} {
  const fields: Partial<Record<CustomerField, PlacedCustomerError>> = {}
  const other: string[] = []
  for (const error of errors) {
    const address = /^(invoiceAddress|deliveryAddress)\.(attention|countryCode|cityName|streetName|poBox|postalCode)$/.exec(error.field)
    const field: CustomerField | undefined = address
      ? (`${address[1] === 'invoiceAddress' ? 'invoice' : 'delivery'}.${address[2]}` as CustomerField)
      : MODEL_TO_FORM[error.field]
    if (!field) {
      other.push(error.message)
      continue
    }
    if (fields[field]) continue
    const key =
      error.code === 'REQUIRED' ? 'validation.required' : error.code === 'TOO_LONG' ? 'validation.tooLong' : error.code ? RULE_KEYS[field]?.[error.code] : undefined
    fields[field] = key ? { key } : { text: error.message }
  }
  return { fields, other }
}
