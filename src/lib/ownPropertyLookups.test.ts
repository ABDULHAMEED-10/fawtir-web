import type { TFunction } from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import type { BillRowDto } from '../api/expenditure/bills'
import type { ImportWarningDto } from '../api/invoices/import'
import type { SignupCataloguePlan } from './identity/signupPlans'
import type { SupplierListRowDto } from '../api/expenditure/suppliers'
import type { TemplateItemDto } from '../api/catalog/templates'
import { planChangeRefusal } from '../pages/SettingsPage/PlanChangeSection'
import { launchCopy, launchFeatures } from '../pages/PlansPage/catalogueView'
import { inputVatNoteKey } from './billDetail'
import { branchAccessRefusalKey } from './branchAccessRefusals'
import { businessTypeIcon } from './businessTypes'
import { suggestedFrom } from './catalogTemplates'
import { fieldWordKey } from './console/catalogueTemplates'
import { placeCustomerErrors } from './customerForm'
import { missingCustomerFields } from './customerEligibility'
import { displayStatusTone, reconciliationTone } from './erp/reportingStatus'
import { importWarningColumnKey, importWarningKey } from './invoiceImport'
import { issueRefusalOf } from './invoiceIssue'
import { reminderRefusalNote } from './paymentReminders'
import { markPaidBlockKey, refusalOf, refusedBillOf } from './paymentRuns'
import { neededPlanFrom } from './planAccess'
import { nextAction } from './purchaseOrders'
import { removalRefusalKey } from './removalRefusals'
import { fieldLabel } from './stagedImport'
import { placeSupplierErrors } from './supplierForm'
import { toSupplierListItem } from './supplierList'
import { offeredUnitCode } from './unitCodes'

// A record keyed by a server value answers Object.prototype members too ("constructor" is a
// function, "__proto__" an object). Each of these must fall back exactly as an unknown value does.
// The shared fallback is held fixed: whether describeApiFailure itself resolves such a code belongs
// to that chain and is tested with it; here only each screen's own record is under test.
vi.mock('./apiFailure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./apiFailure')>()),
  describeApiFailure: () => ({ key: 'described', reference: null }),
}))

const PROTOTYPE_KEYS = ['constructor', 'toString', '__proto__', 'hasOwnProperty'] as const
const UNKNOWN = 'NO_SUCH_CODE'

const t = ((key: string) => key) as unknown as TFunction
const refused = (code: string | null, status = 409, problem: Record<string, unknown> = {}) =>
  new ApiError({ status, problemType: 'resource-conflict', code, problem })
const byProblemType = (problemType: string) => new ApiError({ status: 409, problemType, code: null })

describe.each(PROTOTYPE_KEYS)('a server value of %j', (key) => {
  it('is no refusal the invoice issue, reminder or payment run screens word', () => {
    expect(issueRefusalOf(refused(key, 400))).toEqual(issueRefusalOf(refused(UNKNOWN, 400)))
    expect(reminderRefusalNote(refused(key), null, null)).toBeNull()
    expect(refusalOf(refused(key), t)).toBe(refusalOf(refused(UNKNOWN), t))
    expect(refusalOf(refused(key), t, 'add')).toBe(refusalOf(refused(UNKNOWN), t, 'add'))
    expect(refusalOf(refused(key), t, 'markPaid')).toBe(refusalOf(refused(UNKNOWN), t, 'markPaid'))
    expect(markPaidBlockKey(key)).toBeNull()
    expect(refusedBillOf(refused(key, 409, { billId: 'b-1' }), ['b-1'])).toBeNull()
    expect(planChangeRefusal(t, key)).toBe(planChangeRefusal(t, UNKNOWN))
  })

  it('is no problem type the branch access or removal screens word', () => {
    expect(branchAccessRefusalKey(byProblemType(key))).toBeNull()
    expect(removalRefusalKey(byProblemType(key))).toBeNull()
  })

  it('is no field or rule the customer and supplier forms place', () => {
    const asField = [{ field: key, message: 'server text' }]
    expect(placeCustomerErrors(asField)).toEqual({ fields: {}, other: ['server text'] })
    expect(placeSupplierErrors(asField)).toEqual({ fields: {}, other: ['server text'] })
    const asRule = (field: string) => [{ field, code: key, message: 'server text' }]
    expect(placeCustomerErrors(asRule('contact.telephone')).fields).toEqual({ telephone: { text: 'server text' } })
    expect(placeSupplierErrors(asRule('legalName')).fields).toEqual({ legalName: { text: 'server text' } })
  })

  it('is no missing customer field, staged-import column or template field', () => {
    const same = (value: string) => value
    const join = (parts: string[]) => parts.join(', ')
    expect(missingCustomerFields([key, `${key}.${key}`], same, join)).toEqual([
      { key: 'invoiceDraft.missing.unknown', values: { path: key } },
      { key: 'invoiceDraft.missing.unknown', values: { path: `${key}.${key}` } },
    ])
    expect(fieldLabel(key)).toEqual({ text: key })
    expect(fieldWordKey(key)).toBeNull()
  })

  it('is no warning, VAT reason, unit, icon, plan or state the app knows', () => {
    const warning = { rowNumbers: [1], column: 'c', code: key } as unknown as ImportWarningDto
    expect(importWarningKey(warning)).toBeNull()
    expect(importWarningColumnKey(warning)).toBeNull()
    expect(inputVatNoteKey({ counted: false, reason: key } as BillRowDto['inputVat'])).toBeNull()
    expect(offeredUnitCode(key)).toBe(key)
    expect(businessTypeIcon({ code: key, icon: key })).toBe(businessTypeIcon({ code: UNKNOWN, icon: UNKNOWN }))
    expect(displayStatusTone(key)).toBe('neutral')
    expect(reconciliationTone(key)).toBe('pending')
    expect(nextAction(key as never)).toBeNull()
    expect(launchCopy(key)).toBeUndefined()
    expect(launchFeatures({ code: key } as SignupCataloguePlan, t)).toBeNull()
    const plan = (code: string) =>
      ({ code, sortOrder: 1, features: [{ key: 'recurringBills', enabled: true }] }) as unknown as SignupCataloguePlan
    expect(neededPlanFrom([plan(key)], 'recurringBills')).toBe(neededPlanFrom([plan(UNKNOWN)], 'recurringBills'))
  })

  it('is no billing channel or tax category', () => {
    const row = {
      id: 's-1',
      displayName: 'Supplier',
      vatNumber: null,
      billingChannel: key,
      participantId: null,
      selfBilling: false,
      terms: { paymentTerms: null, netDays: null, earlyPaymentDiscountPercent: null, earlyPaymentDiscountDays: null, earlyPaymentDiscount: null },
      youOwe: { amount: 0, currency: 'OMR', openBills: 0, onHold: 0 },
      record: { health: [], paidOnTimeCount: 0, settledCount: 0, paidOnTime: null, bankChangedAt: null },
      status: 'ACTIVE',
    } as unknown as SupplierListRowDto
    expect(toSupplierListItem(row, 0).channel).toBe('manual')
    const item = {
      name: 'Wipes',
      nameAr: null,
      classification: { goodsOrService: 'G', hsCode: null, serviceTypeCode: null },
      defaultUnitCode: 'EA',
      defaultTaxCategory: key,
      defaultTaxReasonCode: null,
      defaultTaxReasonText: null,
      barcode: null,
      variants: null,
      addOns: [],
    } as unknown as TemplateItemDto
    const [group] = suggestedFrom([{ name: 'G', nameAr: null, kinds: [{ name: 'K', nameAr: null, items: [item] }] }])
    expect(group.kinds[0].sizes[0].taxCode).toBe('S5')
  })
})
