import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import type { CustomerKind } from '../../lib/customers'
import {
  CheckboxRow,
  FieldGrid,
  ImageUploadField,
  PhoneField,
  SectionCard,
  SelectField,
  TextAreaField,
  TextField,
  Toggle,
  ToggleInline,
  ToggleRow,
} from '../../components/form'
import businessIcon from '../../assets/create-invoice/business.svg'
import consumerIcon from '../../assets/customers/type-consumer.svg'
import governmentIcon from '../../assets/customers/type-government.svg'
import tickCircle from '../../assets/customers/tick-circle.svg'
import saveIcon from '../../assets/customers/save.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const TYPE_CARDS: { id: CustomerKind; icon: string }[] = [
  { id: 'business', icon: businessIcon },
  { id: 'consumer', icon: consumerIcon },
  { id: 'government', icon: governmentIcon },
]

/**
 * Figma gives the invoicing column six fields and the delivery column only four —
 * PO Box and postal code are invoicing-only.
 */
function AddressBlock({ prefix, t }: { prefix: 'invoicing' | 'delivery'; t: (k: string) => string }) {
  const isInvoicing = prefix === 'invoicing'

  return (
    <div className="flex flex-col gap-5">
      <TextField
        id={`${prefix}-attn`}
        name={`${prefix}Attn`}
        label={t('newCustomer.address.attn')}
        placeholder={t('newCustomer.address.attnPlaceholder')}
      />
      <SelectField
        id={`${prefix}-country`}
        name={`${prefix}Country`}
        label={t('newCustomer.address.country')}
        options={['Oman', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain']}
      />
      <TextField
        id={`${prefix}-city`}
        name={`${prefix}City`}
        label={t('newCustomer.address.city')}
        placeholder={t('newCustomer.address.cityPlaceholder')}
      />
      <TextField
        id={`${prefix}-street`}
        name={`${prefix}Street`}
        label={t('newCustomer.address.street')}
        placeholder={t('newCustomer.address.streetPlaceholder')}
      />
      {isInvoicing ? (
        <>
          <TextField
            id={`${prefix}-pobox`}
            name={`${prefix}PoBox`}
            label={t('newCustomer.address.poBox')}
            placeholder={t('newCustomer.address.poBoxPlaceholder')}
          />
          <TextField
            id={`${prefix}-postal`}
            name={`${prefix}PostalCode`}
            label={t('newCustomer.address.postalCode')}
            placeholder={t('newCustomer.address.postalCodePlaceholder')}
          />
        </>
      ) : null}
    </div>
  )
}

export function NewCustomerPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [customerType, setCustomerType] = useState<CustomerKind>('business')
  const [advanced, setAdvanced] = useState(false)
  const [registeredForVat, setRegisteredForVat] = useState(true)
  const [registeredOnPeppol, setRegisteredOnPeppol] = useState(true)
  const [emailPdfCopy, setEmailPdfCopy] = useState(true)
  const [autoReminders, setAutoReminders] = useState(true)
  const [sameAsInvoicing, setSameAsInvoicing] = useState(true)
  const [addressesOpen, setAddressesOpen] = useState(true)
  const [notesOpen, setNotesOpen] = useState(true)

  const isConsumer = customerType === 'consumer'
  const isGovernment = customerType === 'government'
  /** Business and government share the organisation-shaped field set. */
  const isOrganisation = !isConsumer

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/customers')
  }

  const collapseButton = (open: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className="text-sm font-semibold text-primary-800 hover:underline"
    >
      {open ? t('newCustomer.collapse') : t('newCustomer.expand')}
    </button>
  )

  return (
    <AppShell>
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {/* Header — breadcrumb, advanced-fields toggle and the primary save, all on one row. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/customers"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('customersPage.title')}
            </Link>
            <img
              src={chevronIcon}
              alt=""
              aria-hidden="true"
              className="size-6 opacity-70 rtl:rotate-180"
            />
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('newCustomer.title')}
            </h1>
            <ToggleInline
              label={t('newCustomer.advancedFields')}
              checked={advanced}
              onChange={setAdvanced}
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={saveIcon} alt="" className="size-6 shrink-0 brightness-0 invert" />
            {t('newCustomer.save')}
          </button>
        </div>

        <SectionCard step={1} title={t('newCustomer.sections.customerType')}>
          <div className="grid gap-4 md:grid-cols-3">
            {TYPE_CARDS.map((card) => {
              const active = card.id === customerType
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setCustomerType(card.id)}
                  aria-pressed={active}
                  className={[
                    'flex h-[65px] items-center gap-2 rounded-sm px-4 text-start transition-colors',
                    active
                      ? 'border-2 border-primary-500 bg-primary-50'
                      : 'border border-border-default hover:border-primary-300',
                  ].join(' ')}
                >
                  <img
                    src={card.icon}
                    alt=""
                    className={['size-6 shrink-0', active ? '' : 'opacity-70'].join(' ')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium leading-[1.2] text-text-primary">
                      {t(`newCustomer.types.${card.id}.title`)}
                    </span>
                    <span className="block text-xs font-medium leading-[1.2] text-text-tertiary">
                      {t(`newCustomer.types.${card.id}.subtitle`)}
                    </span>
                  </span>
                  {active ? (
                    <img src={tickCircle} alt="" className="size-[18px] shrink-0" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </SectionCard>

        {/* Two-column band: Details + Billing on the left, Contact + Sending on the right. */}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <SectionCard step={2} title={t('newCustomer.sections.details')}>
              <div className="flex flex-col gap-5">
                <ImageUploadField
                  id="company-logo"
                  name="companyLogo"
                  label={t('newCustomer.details.logo')}
                  title={t('newCustomer.details.logoTitle')}
                  hint={t('newCustomer.details.logoHint')}
                />

                {isConsumer ? (
                  <FieldGrid>
                    <TextField
                      id="first-name"
                      name="firstName"
                      label={t('newCustomer.details.firstName')}
                      placeholder={t('newCustomer.details.firstNamePlaceholder')}
                      required
                    />
                    <TextField
                      id="last-name"
                      name="lastName"
                      label={t('newCustomer.details.lastName')}
                      placeholder={t('newCustomer.details.lastNamePlaceholder')}
                      required
                    />
                  </FieldGrid>
                ) : (
                  <>
                    <TextField
                      id="legal-name"
                      name="legalName"
                      label={
                        isGovernment
                          ? t('newCustomer.details.entityName')
                          : t('newCustomer.details.legalName')
                      }
                      placeholder={
                        isGovernment
                          ? t('newCustomer.details.entityNamePlaceholder')
                          : t('newCustomer.details.legalNamePlaceholder')
                      }
                      required
                    />

                    {advanced ? (
                      <FieldGrid>
                        <TextField
                          id="commercial-name"
                          name="commercialName"
                          label={t('newCustomer.details.commercialName')}
                          placeholder={t('newCustomer.details.commercialNamePlaceholder')}
                        />
                        <TextField
                          id="cr-number"
                          name="crNumber"
                          label={t('newCustomer.details.commercialRegistration')}
                          placeholder={t('newCustomer.details.crPlaceholder')}
                        />
                      </FieldGrid>
                    ) : null}

                    {/* VAT number with its "registered" checkbox inline, as drawn. */}
                    <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
                      <TextField
                        id="vat-number"
                        name="vatNumber"
                        label={t('newCustomer.details.vatNumber')}
                        placeholder="OM1100000000"
                      />
                      <CheckboxRow
                        id="registered-vat"
                        name="registeredForVat"
                        label={t('newCustomer.details.registeredForVat')}
                        checked={registeredForVat}
                        onChange={setRegisteredForVat}
                      />
                    </div>

                  </>
                )}

                {isGovernment ? (
                  <div className="flex flex-col gap-5">
                    <FieldGrid>
                      <TextField
                        id="entity-code"
                        name="entityCode"
                        label={t('newCustomer.government.entityCode')}
                        placeholder={t('newCustomer.government.entityCodePlaceholder')}
                      />
                      <TextField
                        id="buyer-reference"
                        name="buyerReference"
                        label={t('newCustomer.government.buyerReference')}
                        placeholder={t('newCustomer.government.buyerReferencePlaceholder')}
                        hint={t('newCustomer.government.buyerReferenceHint')}
                        required
                      />
                      <TextField
                        id="purchase-order"
                        name="purchaseOrder"
                        label={t('newCustomer.government.purchaseOrder')}
                        placeholder={t('newCustomer.government.purchaseOrderPlaceholder')}
                      />
                      <TextField
                        id="contract-reference"
                        name="contractReference"
                        label={t('newCustomer.government.contractReference')}
                        placeholder={t('newCustomer.government.contractReferencePlaceholder')}
                      />
                    </FieldGrid>
                  </div>
                ) : null}

                {isOrganisation ? (
                  <div className="flex flex-col gap-4 rounded-sm border border-border-brand-subtle bg-primary-25 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-base font-medium leading-[1.2] text-text-primary">
                        {t('newCustomer.details.peppolSection')}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium leading-[1.2] text-text-primary">
                          {t('newCustomer.details.registeredOnPeppol')}
                        </span>
                        <Toggle
                          checked={registeredOnPeppol}
                          onChange={setRegisteredOnPeppol}
                          label={t('newCustomer.details.registeredOnPeppol')}
                          name="registeredOnPeppol"
                        />
                      </div>
                    </div>
                    {registeredOnPeppol ? (
                      <TextField
                        id="peppol-id"
                        name="peppolId"
                        label={t('newCustomer.details.peppolId')}
                        placeholder="0248:OM1100000000"
                        defaultValue="0248:OM1100000000"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard step={4} title={t('newCustomer.sections.billing')}>
              <div className="flex flex-col gap-5">
                <FieldGrid>
                  <SelectField
                    id="currency"
                    name="currency"
                    label={t('newCustomer.billing.currency')}
                    options={['OMR - Omani Rial', 'USD - US Dollar', 'EUR - Euro', 'AED - UAE Dirham']}
                  />
                  <SelectField
                    id="tax-category"
                    name="taxCategory"
                    label={t('newCustomer.billing.taxCategory')}
                    options={['Standard rate - 5%', 'Zero rated - 0%', 'Exempt', 'Out of scope']}
                  />
                  <SelectField
                    id="payment-terms"
                    name="paymentTerms"
                    label={t('newCustomer.billing.paymentTerms')}
                    options={['Net 30 days', 'Net 15 days', 'Net 60 days', 'Due on receipt']}
                  />
                  <SelectField
                    id="payment-method"
                    name="paymentMethod"
                    label={t('newCustomer.billing.paymentMethod')}
                    options={['Bank transfer', 'Card', 'Cash', 'Cheque']}
                  />
                </FieldGrid>

                {advanced && isOrganisation ? (
                  <FieldGrid>
                    <TextField
                      id="iban"
                      name="iban"
                      label={t('newCustomer.billing.iban')}
                      placeholder="OM00 0000 0000 0000"
                    />
                    <TextField
                      id="bic"
                      name="bic"
                      label={t('newCustomer.billing.bic')}
                      placeholder="BIC"
                    />
                  </FieldGrid>
                ) : null}
              </div>
            </SectionCard>
          </div>

          <div className="flex flex-col gap-4">
            <SectionCard step={3} title={t('newCustomer.sections.contact')}>
              <div className="flex flex-col gap-5">
                {isOrganisation ? (
                  <FieldGrid>
                    <TextField
                      id="contact-person"
                      name="contactPerson"
                      label={t('newCustomer.contact.person')}
                      placeholder={t('newCustomer.contact.personPlaceholder')}
                      required
                    />
                    <TextField
                      id="contact-role"
                      name="contactRole"
                      label={t('newCustomer.contact.role')}
                      placeholder={t('newCustomer.contact.rolePlaceholder')}
                    />
                  </FieldGrid>
                ) : null}

                <TextAreaField
                  id="contact-email"
                  name="contactEmail"
                  label={t('newCustomer.contact.email')}
                  placeholder="name@company.om"
                />

                <FieldGrid>
                  <PhoneField
                    id="telephone"
                    name="telephone"
                    label={t('newCustomer.contact.telephone')}
                  />
                  <PhoneField id="mobile" name="mobile" label={t('newCustomer.contact.mobile')} />
                </FieldGrid>

                <SelectField
                  id="preferred-language"
                  name="preferredLanguage"
                  label={t('newCustomer.contact.preferredLanguage')}
                  options={['Arabic (AR)', 'English (EN)']}
                />

                {/* Figma puts Website in Contact, not Details. */}
                {advanced && isOrganisation ? (
                  <TextField
                    id="website"
                    name="website"
                    label={t('newCustomer.details.website')}
                    placeholder="https://"
                    type="url"
                  />
                ) : null}
              </div>
            </SectionCard>

            <SectionCard step={5} title={t('newCustomer.sections.sending')}>
              <div className="flex flex-col gap-5">
                <SelectField
                  id="sending-method"
                  name="sendingMethod"
                  label={t('newCustomer.sending.method')}
                  options={
                    isConsumer
                      ? [t('newCustomer.sending.qrReceipt'), t('newCustomer.sending.emailPdf')]
                      : [t('newCustomer.sending.peppol'), t('newCustomer.sending.emailPdf')]
                  }
                />
                <ToggleRow
                  label={t('newCustomer.sending.alsoEmailPdf')}
                  hint={t('newCustomer.sending.alsoEmailPdfHint')}
                  checked={emailPdfCopy}
                  onChange={setEmailPdfCopy}
                  name="emailPdfCopy"
                />
                <ToggleRow
                  label={t('newCustomer.sending.autoReminders')}
                  hint={t('newCustomer.sending.autoRemindersHint')}
                  checked={autoReminders}
                  onChange={setAutoReminders}
                  name="autoReminders"
                />
              </div>
            </SectionCard>
          </div>
        </div>

        <SectionCard
          step={6}
          title={t('newCustomer.sections.addresses')}
          action={collapseButton(addressesOpen, () => setAddressesOpen((v) => !v))}
        >
          {addressesOpen ? (
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="flex flex-col gap-5">
                <p className="text-xs font-semibold uppercase leading-[1.2] tracking-wide text-text-quaternary">
                  {t('newCustomer.address.invoicing')}
                </p>
                <AddressBlock prefix="invoicing" t={t} />
              </div>
              <div className="flex flex-col gap-5">
                <p className="text-xs font-semibold uppercase leading-[1.2] tracking-wide text-text-quaternary">
                  {t('newCustomer.address.delivery')}
                </p>
                <ToggleRow
                  label={t('newCustomer.address.sameAsInvoicing')}
                  hint={t('newCustomer.address.sameAsInvoicingHint')}
                  checked={sameAsInvoicing}
                  onChange={setSameAsInvoicing}
                  name="sameAsInvoicing"
                />
                {sameAsInvoicing ? null : <AddressBlock prefix="delivery" t={t} />}
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          step={7}
          title={t('newCustomer.sections.notes')}
          action={collapseButton(notesOpen, () => setNotesOpen((v) => !v))}
        >
          {notesOpen ? (
            <TextAreaField
              id="internal-notes"
              name="internalNotes"
              label={t('newCustomer.notes.label')}
              placeholder={t('newCustomer.notes.placeholder')}
              minHeightClass="min-h-[71px]"
            />
          ) : null}
        </SectionCard>

        <div className="flex flex-wrap items-center justify-end gap-3 pb-2">
          <Link
            to="/customers"
            className="inline-flex h-[54px] items-center rounded-sm border border-border-subtle px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-card"
          >
            {t('newCustomer.cancel')}
          </Link>
          <button
            type="submit"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-neutral-25"
          >
            <img src={saveIcon} alt="" className="size-6 shrink-0" />
            {t('newCustomer.saveAndAddAnother')}
          </button>
          {/* Figma centres this label with no icon — only the header button carries one. */}
          <button
            type="submit"
            className="inline-flex h-[54px] min-w-[255px] items-center justify-center rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('newCustomer.save')}
          </button>
        </div>
      </form>
    </AppShell>
  )
}
