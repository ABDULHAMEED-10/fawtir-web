import { useEffect, useState, type ReactNode } from 'react'
import { setSaleCompany, setSaleLines, useOpenSale } from '../../lib/posSale'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { PosSalePanel } from './PosSalePanel'
import { PosTillGate } from './PosTillGate'
import { COMPANY_IS, WALK_IN_IS } from '../../lib/posPayment'
import { ArrowForwardIcon, CheckIcon, SearchIcon } from './posIcons'
import { Select } from '../../components/ui'
import { useApiRead } from '../../hooks'
import {
  ApiError,
  apiRequest,
  fromSpringPage,
  withQuery,
  type Page,
  type SpringPage,
} from '../../api'
import {
  BUYER_IDENTIFIER_SCHEMES,
  CUSTOMERS_PATH,
  loadCustomerRecord,
  patchCustomer,
  type CustomerDto,
  type CustomerRecordDto,
} from '../../api/customers/customers'
import { useCan } from '../../lib/session/session'
import { missingFieldsSentence, notEligiblePaths } from '../../lib/customerEligibility'
import { placeCustomerErrors, type CustomerField } from '../../lib/customerForm'
import { addPosCustomer, newPosKey, posSalesPath, type PosTodaySalesPage } from '../../api/pos/pos'
import { refusalSentence } from '../../lib/posRefusals'
import type { TillState } from '../../lib/posTill'

type Ready = Extract<TillState, { status: 'ready' }>

/** What the screen shows of a company, from the list row or the full record. */
type Found = {
  id: string
  name: string
  kind: 'BUSINESS' | 'GOVERNMENT'
  vat: string | null
  peppol: string | null
  city: string | null
  terms: string | null
  /** What a full invoice to them still needs (`missingInvoiceFields`); empty when nothing. */
  missing: string[]
  /** The buyer identifier of a company without a VAT number (CR and the like, IBR-016-OM). */
  identifier: { scheme: string; value: string } | null
}

/** The address parts a full invoice needs, the ones the till can fill in (F-1). */
const ADDRESS_NEEDED = [
  'invoiceAddress.countryCode',
  'invoiceAddress.cityName',
  'invoiceAddress.streetName',
]

/** The countries the customer form offers, Oman first and chosen. */
const COUNTRIES = ['OM', 'AE', 'SA', 'QA', 'KW', 'BH']

function foundOf(customer: CustomerDto | CustomerRecordDto): Found | null {
  if (customer.type === 'CONSUMER') return null
  const details = customer.profile?.details as
    | (CustomerDto['profile']['details'] & {
        peppolParticipantId?: { scheme: string; value: string } | null
        identifierScheme?: string | null
        identifierValue?: string | null
      })
    | null
  const participant = details?.peppolParticipantId
  const billing = (customer.profile as CustomerRecordDto['profile'] | undefined)?.billingDefaults
  return {
    id: customer.id,
    name: customer.displayName,
    kind: customer.type,
    vat: details?.vatRegistrationNumber ?? null,
    peppol: participant ? `${participant.scheme}:${participant.value}` : null,
    city: customer.profile?.invoiceAddress?.cityName ?? null,
    terms: billing?.paymentTerms ?? null,
    missing: customer.invoiceEligible === false ? (customer.missingInvoiceFields ?? []) : [],
    identifier:
      details?.identifierScheme && details.identifierValue
        ? { scheme: details.identifierScheme, value: details.identifierValue }
        : null,
  }
}

/**
 * What the payment screen hands over with "Complete it on the company screen": the paths the
 * refusal named, so the address form opens at once for the company already on the sale (retest N-1).
 */
export type CompanyScreenState = { missing?: string[] }

/** A VAT number is looked up once it could be one: `GET /v1/customers?vatNumber=` is exact. */
const lookupPath = (vat: string) =>
  vat.trim().length >= 8
    ? withQuery(CUSTOMERS_PATH, { vatNumber: vat.trim(), status: 'ACTIVE', size: 10 })
    : null

/** What the document turns into once a company is named. */
function ChangeColumn({
  kicker,
  title,
  points,
  highlighted,
}: {
  kicker: string
  title: string
  points: string[]
  highlighted?: boolean
}) {
  return (
    <div
      className={[
        'flex min-w-0 flex-1 flex-col gap-3 rounded-md border p-5',
        highlighted
          ? 'border-primary-700 bg-primary-25'
          : 'border-border-subtle bg-surface-tab-bar',
      ].join(' ')}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
        {kicker}
      </p>
      <p
        className={[
          'text-lg font-medium leading-[1.2]',
          highlighted ? 'text-primary-800' : 'text-text-primary',
        ].join(' ')}
      >
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {points.map((point) => (
          <li
            key={point}
            className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary"
          >
            <span className={highlighted ? 'text-primary-700' : 'text-text-quaternary'}>✓</span>
            {point}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PosCompanyPage() {
  return (
    <AppShell>
      <PosTillGate>{(till) => <OnTheCompany till={till} />}</PosTillGate>
    </AppShell>
  )
}

function OnTheCompany({ till }: { till: Ready }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // The open sale is shared with the payment and receipt screens (src/lib/posSale.ts).
  const { lines, company } = useOpenSale()
  const [vat, setVat] = useState('')
  const handedOver = (useLocation().state as CompanyScreenState | null)?.missing ?? []
  const [picked, setPicked] = useState<Found | null>(
    company
      ? {
          ...company,
          vat: company.vat ?? null,
          peppol: null,
          city: null,
          terms: null,
          missing: handedOver,
          identifier: company.identifier ?? null,
        }
      : null,
  )
  const [byHand, setByHand] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const path = picked ? null : lookupPath(vat)
  const lookup = useApiRead<Page<CustomerDto>>(path, async () =>
    fromSpringPage(await apiRequest<SpringPage<CustomerDto>>(path as string)),
  )
  const matched =
    lookup.read.status === 'ready'
      ? (lookup.read.data.items.map(foundOf).find((entry) => entry !== null) ?? null)
      : null
  const found = picked ?? matched

  // Served recently: the companies on today's till sales (`tab=COMPANY`).
  const recentPath = posSalesPath({ branchId: till.branchId, tab: 'COMPANY', size: 50 })
  const recent = useApiRead<PosTodaySalesPage>(recentPath)
  const served =
    recent.read.status === 'ready'
      ? recent.read.data.content.filter(
          (row, index, rows) =>
            row.customer.name &&
            rows.findIndex((other) => other.customer.customerId === row.customer.customerId) ===
              index,
        )
      : []

  const choose = (next: Found | null) => {
    setPicked(next)
    setSaleCompany(
      next
        ? {
            id: next.id,
            name: next.name,
            kind: next.kind,
            vat: next.vat,
            identifier: next.identifier,
          }
        : null,
    )
  }
  // A match by VAT number is the company the sale goes on.
  const matchedId = matched?.id ?? null
  useEffect(() => {
    if (matched && !picked) choose(matched)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedId])

  const open = async (customerId: string) => {
    setError(null)
    try {
      choose(foundOf(await loadCustomerRecord(customerId)))
    } catch (cause) {
      setError(cause)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <Link
        to="/pos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
      >
        ‹ {t('pos.backToSale')}
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[320px] flex-1 flex-col gap-4">
          <section className="rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
              <div>
                <h1 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.company.whose')}
                </h1>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.company.vatIsAll')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setByHand((v) => !v)}
                aria-expanded={byHand}
                className="text-sm font-semibold text-primary-700"
              >
                {t('pos.company.byHand')}
              </button>
            </div>

            <div className="px-6 py-4">
              <label className="block text-xs font-semibold text-text-tertiary" htmlFor="vat">
                {t('pos.company.vatNumber')}
              </label>
              <div className="mt-2 flex h-[54px] items-center gap-3 rounded-sm border-2 border-primary-700 bg-primary-25 px-4">
                <SearchIcon className="size-5 shrink-0 text-primary-700" />
                <input
                  id="vat"
                  value={found?.vat ?? vat}
                  onChange={(event) => {
                    setVat(event.target.value)
                    choose(null)
                  }}
                  dir="ltr"
                  className="h-full w-full min-w-0 border-0 bg-transparent text-base font-medium text-text-primary outline-none rtl:text-end"
                />
                {found ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-success-700">
                    <CheckIcon className="size-3.5" />
                    {t('pos.company.found')}
                  </span>
                ) : null}
              </div>
              {path && lookup.read.status === 'ready' && !matched ? (
                <p className="mt-2 text-xs font-medium text-text-tertiary">
                  {t('pos.company.notFound')}
                </p>
              ) : null}
              {lookup.read.status === 'failed' || error ? (
                <p role="alert" className="mt-2 text-xs font-medium text-danger-700">
                  {refusalSentence(t, lookup.read.status === 'failed' ? lookup.read.error : error)}
                </p>
              ) : null}

              {found ? (
                <div className="mt-4 flex items-start gap-3 rounded-md border border-border-subtle bg-success-100 p-4 sm:gap-4 sm:p-5">
                  {/* A white square with a green check, as the frame draws the match. */}
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white text-success-700 shadow-sm">
                    <CheckIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <p className="text-base font-medium leading-[1.2] text-text-primary">
                          {found.name}
                        </p>
                        {/* TODO(backend): "one of your customers since" has no field on the
                            customer read (INCOME.md row P.30). */}
                        {found.city ? (
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {found.city}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVat('')
                          choose(null)
                        }}
                        className="inline-flex h-10 shrink-0 items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary"
                      >
                        {t('pos.company.notThem')}
                      </button>
                    </div>
                    {/* One row on a wide screen; wraps only where it must (phones). */}
                    <div className="mt-3 flex flex-wrap gap-1.5 sm:flex-nowrap">
                      {found.peppol ? (
                        <>
                          <Tag
                            label={
                              <>
                                <CheckIcon className="size-3 shrink-0" />
                                {t('pos.company.onPeppol')}
                              </>
                            }
                          />
                          <Tag label={found.peppol} mono />
                        </>
                      ) : null}
                      {found.terms === 'NET30' ? <Tag label={t('pos.company.terms30')} /> : null}
                      {/* TODO(backend): the customer's own price account ("Hotel accounts ·
                          12% off") is not served (INCOME.md row P.30). */}
                    </div>
                  </div>
                </div>
              ) : null}

              {found && found.missing.length ? (
                <CompleteAddress found={found} onDone={choose} />
              ) : null}

              {byHand && !found ? (
                <AddCompany tillId={till.till.id} vat={vat} onAdded={choose} />
              ) : null}
            </div>
          </section>

          {served.length ? (
            <section className="rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-6 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.company.servedRecently')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.company.noTyping')}
                </p>
              </div>
              <div className="grid gap-3 px-6 py-4 sm:grid-cols-3">
                {served.slice(0, 6).map((row) => (
                  <button
                    key={row.customer.customerId}
                    type="button"
                    onClick={() => void open(row.customer.customerId)}
                    className="flex min-w-0 items-center gap-3 rounded-md border border-border-subtle bg-white px-4 py-3 text-start transition-colors hover:border-primary-300 hover:bg-primary-25"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-25 text-xs font-semibold text-primary-700">
                      {(row.customer.name ?? '?').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span
                        title={row.customer.name ?? ''}
                        className="block truncate text-sm font-medium text-text-primary"
                      >
                        {row.customer.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-medium text-text-quaternary">
                        {t('pos.company.servedAt', { time: row.time })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-md bg-surface-card">
            <div className="border-b border-border-subtle px-6 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.company.whatChanges')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('pos.company.sameItems')}
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-4 px-6 py-5 sm:flex-row">
              <ChangeColumn
                kicker={t('pos.company.wasGoingToBe')}
                title={t('pos.company.tillReceipt')}
                points={WALK_IN_IS.map((id) => t(`pos.company.walkIn.${id}`))}
              />
              <span className="flex shrink-0 items-center justify-center text-text-quaternary max-sm:hidden">
                <ArrowForwardIcon />
              </span>
              <ChangeColumn
                kicker={t('pos.company.willNowBe')}
                title={t('pos.company.fullInvoice')}
                points={COMPANY_IS.map((id) =>
                  t(`pos.company.company.${id}`, { name: found?.name ?? '' }),
                )}
                highlighted
              />
            </div>
          </section>
        </div>

        <PosSalePanel
          lines={lines}
          onLines={setSaleLines}
          onTakePayment={() => navigate('/pos/payment')}
          company={found ?? undefined}
        />
      </div>
    </div>
  )
}

const FIELD =
  'h-11 w-full rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand'

/**
 * A company added at the till (`POST /v1/pos/customers`, Abdul 18): its legal name and a contact,
 * with its VAT number, or for a company without one its buyer ID (V480, IBR-016-OM).
 */
function AddCompany({
  tillId,
  vat,
  onAdded,
}: {
  tillId: string
  /** What was typed in the VAT lookup: the number they were looking for. */
  vat: string
  onAdded: (found: Found | null) => void
}) {
  const { t, i18n } = useTranslation()
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    vatNumber: vat.trim(),
    scheme: 'CR',
    value: '',
    email: '',
    countryCode: 'OM',
    cityName: '',
    streetName: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [key] = useState(() => newPosKey('customer'))
  // Backend #810 refuses a company it could never invoice, naming what is missing.
  const missing =
    error instanceof ApiError ? notEligiblePaths({ code: error.code, ...error.problem }) : null
  // A refusal that names its fields (a bad VAT number, say) goes on those fields.
  const placed = error instanceof ApiError ? placeCustomerErrors(error.fieldErrors) : null
  const fieldProblem = (field: CustomerField): string | undefined => {
    const problem = placed?.fields[field]
    if (!problem) return undefined
    return 'key' in problem ? t(problem.key) : problem.text
  }
  const onAField = SHOWN_ON_FIELDS.some((field) => placed?.fields[field])
  const offField = placed
    ? [
        ...Object.entries(placed.fields)
          .filter(([field]) => !SHOWN_ON_FIELDS.includes(field as CustomerField))
          .map(([, problem]) => ('key' in problem ? t(problem.key) : problem.text)),
        ...placed.other,
      ]
    : []
  const set = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }))
    // The named problem is about what was typed, so it goes once that changes.
    if (onAField) setError(null)
  }
  // What is still empty, said under the form so a greyed button is never a puzzle.
  const stillNeeded = [
    !form.name.trim() && t('pos.company.legalName'),
    !form.contactPerson.trim() && t('pos.company.contactPerson'),
    !form.vatNumber.trim() &&
      !form.value.trim() &&
      t('pos.company.vatOrId', { id: t('pos.buyer.value') }),
    !form.cityName.trim() && t('newCustomer.address.city'),
    !form.streetName.trim() && t('newCustomer.address.street'),
  ].filter((label): label is string => !!label)
  const ready = stillNeeded.length === 0

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const added = await addPosCustomer<CustomerRecordDto>(
        {
          tillId,
          name: form.name.trim(),
          contactPerson: form.contactPerson.trim(),
          vatNumber: form.vatNumber.trim() || null,
          email: form.email.trim() || null,
          address: {
            countryCode: form.countryCode,
            cityName: form.cityName.trim(),
            streetName: form.streetName.trim(),
          },
          ...(form.vatNumber.trim()
            ? {}
            : { identifierScheme: form.scheme as never, identifierValue: form.value.trim() }),
        },
        key,
      )
      onAdded(foundOf(added))
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-5 rounded-md border border-border-subtle p-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Labelled label={t('pos.company.legalName')} error={fieldProblem('legalName')}>
          <input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            className={FIELD}
          />
        </Labelled>
        <Labelled label={t('pos.company.contactPerson')} error={fieldProblem('contactPerson')}>
          <input
            value={form.contactPerson}
            onChange={(e) => set({ contactPerson: e.target.value })}
            className={FIELD}
          />
        </Labelled>
        <Labelled label={t('pos.company.vatNumber')} error={fieldProblem('vatNumber')}>
          <input
            value={form.vatNumber}
            dir="ltr"
            onChange={(e) => set({ vatNumber: e.target.value })}
            className={FIELD}
          />
        </Labelled>
        <Labelled label={t('pos.company.email')} error={fieldProblem('emails')}>
          <input
            value={form.email}
            dir="ltr"
            type="email"
            onChange={(e) => set({ email: e.target.value })}
            placeholder={t('pos.pay.optional')}
            className={FIELD}
          />
        </Labelled>
        {!form.vatNumber.trim() ? (
          <>
            <Labelled label={t('pos.buyer.scheme')} error={fieldProblem('identifierScheme')}>
              <Select
                quiet
                value={form.scheme}
                onChange={(scheme) => set({ scheme })}
                ariaLabel={t('pos.buyer.scheme')}
                options={BUYER_IDENTIFIER_SCHEMES.map((scheme) => ({
                  value: scheme,
                  label: t(`customerForm.identifier.schemes.${scheme}`),
                }))}
              />
            </Labelled>
            <Labelled label={t('pos.buyer.value')} error={fieldProblem('identifierValue')}>
              <input
                value={form.value}
                dir="ltr"
                maxLength={50}
                onChange={(e) => set({ value: e.target.value })}
                className={FIELD}
              />
            </Labelled>
          </>
        ) : null}
        <AddressFields value={form} onChange={(patch) => set(patch)} />
      </div>
      <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
        {t('pos.company.noVatNote')}
      </p>
      {!ready ? (
        <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
          {t('pos.company.stillNeeded', {
            fields: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(stillNeeded),
          })}
        </p>
      ) : null}
      {error && (!onAField || offField.length > 0) ? (
        <p role="alert" className="text-xs font-medium text-danger-700">
          {missing?.length
            ? t('pos.company.notReady', {
                missing: missingFieldsSentence(missing, t, i18n.language),
              })
            : offField.length > 0
              ? offField.join(' ')
              : refusalSentence(t, error)}
        </p>
      ) : null}
      <div>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void save()}
          className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
        >
          {t('pos.company.addCompany')}
        </button>
      </div>
    </div>
  )
}

type AddressForm = { countryCode: string; cityName: string; streetName: string }

/** Country, city and street: what a full invoice needs of the buyer's address (IBG-08). */
function AddressFields({
  value,
  onChange,
}: {
  value: AddressForm
  onChange: (patch: Partial<AddressForm>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Labelled label={t('newCustomer.address.country')}>
        <Select
          quiet
          value={value.countryCode}
          onChange={(countryCode) => onChange({ countryCode })}
          ariaLabel={t('newCustomer.address.country')}
          options={COUNTRIES.map((code) => ({
            value: code,
            label: t(`supplierForm.country.${code}`),
          }))}
        />
      </Labelled>
      <Labelled label={t('newCustomer.address.city')}>
        <input
          value={value.cityName}
          maxLength={150}
          onChange={(e) => onChange({ cityName: e.target.value })}
          className={FIELD}
        />
      </Labelled>
      <Labelled label={t('newCustomer.address.street')}>
        <input
          value={value.streetName}
          maxLength={150}
          onChange={(e) => onChange({ streetName: e.target.value })}
          className={FIELD}
        />
      </Labelled>
    </>
  )
}

/**
 * A company found by its VAT number or ID that a full invoice cannot be raised to yet (F-1): says
 * what is missing and, for whoever may edit customers (`customer.manage`), fills the invoice
 * address in here (`PATCH /v1/customers/{id}`). Anything else missing is for the customer form.
 */
function CompleteAddress({
  found,
  onDone,
}: {
  found: Found
  onDone: (next: Found | null) => void
}) {
  const { t, i18n } = useTranslation()
  const canEdit = useCan('customer.manage')
  const [form, setForm] = useState<AddressForm>({ countryCode: 'OM', cityName: '', streetName: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const addressOnly = found.missing.every((path) => ADDRESS_NEEDED.includes(path))
  const ready = form.cityName.trim() && form.streetName.trim()

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const record = await loadCustomerRecord(found.id)
      const saved = await patchCustomer(found.id, {
        invoiceAddress: {
          countryCode: form.countryCode,
          cityName: form.cityName.trim(),
          streetName: form.streetName.trim(),
        },
        expectedVersion: record.version,
      })
      onDone(foundOf(saved))
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-5 rounded-md border border-border-subtle p-5">
      <p role="status" className="text-sm font-medium leading-[1.5] text-pending-700">
        {t('pos.company.notReady', {
          missing: missingFieldsSentence(found.missing, t, i18n.language),
        })}
      </p>
      {canEdit && addressOnly ? (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <AddressFields
              value={form}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs font-medium text-danger-700">
              {refusalSentence(t, error)}
            </p>
          ) : null}
          <div>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => void save()}
              className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
            >
              {t('pos.company.saveAddress')}
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
          {canEdit ? t('pos.company.completeOnCustomer') : t('pos.company.askToComplete')}
        </p>
      )}
    </div>
  )
}

/** The add form's inputs, where a refusal naming them is shown; the rest goes under the form. */
const SHOWN_ON_FIELDS: CustomerField[] = [
  'legalName',
  'contactPerson',
  'vatNumber',
  'emails',
  'identifierScheme',
  'identifierValue',
]

function Labelled({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-text-tertiary">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger-700">
          {error}
        </span>
      ) : null}
    </label>
  )
}

function Tag({ label, mono }: { label: ReactNode; mono?: boolean }) {
  return (
    <span
      dir={mono ? 'ltr' : undefined}
      className={[
        'inline-flex h-[26px] min-w-0 items-center gap-1 whitespace-nowrap rounded-sm bg-white px-2 text-xs font-medium text-text-tertiary',
        mono ? 'shrink-0 font-mono' : '',
      ].join(' ')}
    >
      <span className="inline-flex min-w-0 items-center gap-1 truncate">{label}</span>
    </span>
  )
}
