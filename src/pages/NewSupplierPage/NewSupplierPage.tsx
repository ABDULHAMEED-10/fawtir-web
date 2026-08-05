import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import type { SupplierKind } from '../../lib/suppliers'
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
import governmentIcon from '../../assets/customers/type-government.svg'
import tickCircle from '../../assets/customers/tick-circle.svg'
import saveIcon from '../../assets/customers/save.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const TYPE_CARDS: { id: SupplierKind; icon: string }[] = [
  { id: 'business', icon: businessIcon },
  { id: 'government', icon: governmentIcon },
]

function AddressBlock({ prefix, t }: { prefix: 'billing' | 'pickup'; t: (k: string) => string }) {
  const isBilling = prefix === 'billing'

  return (
    <div className="flex flex-col gap-5">
      <TextField
        id={`${prefix}-attn`}
        name={`${prefix}Attn`}
        label={t('newSupplier.address.attn')}
        placeholder={t('newSupplier.address.attnPlaceholder')}
      />
      <SelectField
        id={`${prefix}-country`}
        name={`${prefix}Country`}
        label={t('newSupplier.address.country')}
        options={['Oman', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain']}
      />
      <TextField
        id={`${prefix}-city`}
        name={`${prefix}City`}
        label={t('newSupplier.address.city')}
        placeholder={t('newSupplier.address.cityPlaceholder')}
      />
      <TextField
        id={`${prefix}-street`}
        name={`${prefix}Street`}
        label={t('newSupplier.address.street')}
        placeholder={t('newSupplier.address.streetPlaceholder')}
      />
      {isBilling ? (
        <>
          <TextField
            id={`${prefix}-pobox`}
            name={`${prefix}PoBox`}
            label={t('newSupplier.address.poBox')}
            placeholder={t('newSupplier.address.poBoxPlaceholder')}
          />
          <TextField
            id={`${prefix}-postal`}
            name={`${prefix}PostalCode`}
            label={t('newSupplier.address.postalCode')}
            placeholder={t('newSupplier.address.postalCodePlaceholder')}
          />
        </>
      ) : null}
    </div>
  )
}

export function NewSupplierPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [supplierType, setSupplierType] = useState<SupplierKind>('business')
  const [advanced, setAdvanced] = useState(false)
  const [registeredForVat, setRegisteredForVat] = useState(true)
  const [registeredOnPeppol, setRegisteredOnPeppol] = useState(true)
  const [selfBilling, setSelfBilling] = useState(false)
  const [approvalRequired, setApprovalRequired] = useState(true)
  const [samePickup, setSamePickup] = useState(true)
  const [addressesOpen, setAddressesOpen] = useState(true)
  const [notesOpen, setNotesOpen] = useState(true)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/suppliers')
  }

  const collapseButton = (open: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className="text-sm font-semibold text-primary-800 hover:underline"
    >
      {open ? t('newSupplier.collapse') : t('newSupplier.expand')}
    </button>
  )

  return (
    <AppShell>
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/suppliers"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('suppliersPage.title')}
            </Link>
            <img
              src={chevronIcon}
              alt=""
              aria-hidden="true"
              className="size-6 opacity-70 rtl:rotate-180"
            />
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('newSupplier.title')}
            </h1>
            <ToggleInline
              label={t('newSupplier.advancedFields')}
              checked={advanced}
              onChange={setAdvanced}
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={saveIcon} alt="" className="size-6 shrink-0 brightness-0 invert" />
            {t('newSupplier.save')}
          </button>
        </div>

        <SectionCard step={1} title={t('newSupplier.sections.supplierType')}>
          <div className="grid gap-4 md:grid-cols-3">
            {TYPE_CARDS.map((card) => {
              const active = card.id === supplierType
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSupplierType(card.id)}
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
                      {t(`newSupplier.types.${card.id}.title`)}
                    </span>
                    <span className="block text-xs font-medium leading-[1.2] text-text-tertiary">
                      {t(`newSupplier.types.${card.id}.subtitle`)}
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
                <ImageUploadField
                  id="supplier-logo"
                  name="supplierLogo"
                  label={t('newSupplier.details.logo')}
                  title={t('newSupplier.details.logoTitle')}
                  hint={t('newSupplier.details.logoHint')}
                />

                <TextField
                  id="supplier-legal-name"
                  name="legalName"
                  label={
                    supplierType === 'government'
                      ? t('newSupplier.details.entityName')
                      : t('newSupplier.details.legalName')
                  }
                  placeholder={
                    supplierType === 'government'
                      ? t('newSupplier.details.entityNamePlaceholder')
                      : t('newSupplier.details.legalNamePlaceholder')
                  }
                  required
                />

                {advanced ? (
                  <FieldGrid>
                    <TextField
                      id="supplier-commercial-name"
                      name="commercialName"
                      label={t('newSupplier.details.commercialName')}
                      placeholder={t('newSupplier.details.commercialNamePlaceholder')}
                    />
                    <TextField
                      id="supplier-cr"
                      name="crNumber"
                      label={t('newSupplier.details.commercialRegistration')}
                      placeholder={t('newSupplier.details.crPlaceholder')}
                    />
                  </FieldGrid>
                ) : null}

                <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
                  <TextField
                    id="supplier-vat"
                    name="vatNumber"
                    label={t('newSupplier.details.vatNumber')}
                    placeholder="OM1100000000"
                    hint={t('newSupplier.details.vatHint')}
                  />
                  <CheckboxRow
                    id="supplier-registered-vat"
                    name="registeredForVat"
                    label={t('newSupplier.details.registeredForVat')}
                    checked={registeredForVat}
                    onChange={setRegisteredForVat}
                  />
                </div>

                <div className="flex flex-col gap-4 rounded-sm border border-border-brand-subtle bg-primary-25 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-base font-medium leading-[1.2] text-text-primary">
                      {t('newSupplier.details.peppolSection')}
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium leading-[1.2] text-text-primary">
                        {t('newSupplier.details.registeredOnPeppol')}
                      </span>
                      <Toggle
                        checked={registeredOnPeppol}
                        onChange={setRegisteredOnPeppol}
                        label={t('newSupplier.details.registeredOnPeppol')}
                        name="registeredOnPeppol"
                      />
                    </div>
                  </div>
                  {registeredOnPeppol ? (
                    <TextField
                      id="supplier-peppol-id"
                      name="peppolId"
                      label={t('newSupplier.details.peppolId')}
                      placeholder="0248:OM1100000000"
                      hint={t('newSupplier.details.peppolIdHint')}
                    />
                  ) : null}
                </div>
              </div>
            </SectionCard>

            <SectionCard step={4} title={t('newSupplier.sections.payment')}>
              <div className="flex flex-col gap-5">
                <FieldGrid>
                  <SelectField
                    id="supplier-currency"
                    name="currency"
                    label={t('newSupplier.payment.currency')}
                    options={['OMR - Omani Rial', 'USD - US Dollar', 'EUR - Euro', 'AED - UAE Dirham']}
                  />
                  <SelectField
                    id="supplier-tax-category"
                    name="taxCategory"
                    label={t('newSupplier.payment.taxCategory')}
                    options={['Standard rate - 5%', 'Zero rated - 0%', 'Exempt', 'Out of scope']}
                  />
                  <SelectField
                    id="supplier-payment-terms"
                    name="paymentTerms"
                    label={t('newSupplier.payment.paymentTerms')}
                    options={['Net 30 days', 'Net 15 days', 'Net 60 days', 'Due on receipt']}
                  />
                  <SelectField
                    id="supplier-payment-method"
                    name="paymentMethod"
                    label={t('newSupplier.payment.paymentMethod')}
                    options={['Bank transfer', 'Card', 'Cash', 'Cheque']}
                  />
                </FieldGrid>

                {/* Bank details are not "advanced" here — we pay the supplier from them. */}
                <FieldGrid>
                  <TextField
                    id="supplier-iban"
                    name="iban"
                    label={t('newSupplier.payment.iban')}
                    placeholder="OM00 0000 0000 0000"
                  />
                  <TextField
                    id="supplier-bic"
                    name="bic"
                    label={t('newSupplier.payment.bic')}
                    placeholder="BIC"
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
                    id="supplier-contact-person"
                    name="contactPerson"
                    label={t('newSupplier.contact.person')}
                    placeholder={t('newSupplier.contact.personPlaceholder')}
                    required
                  />
                  <TextField
                    id="supplier-contact-role"
                    name="contactRole"
                    label={t('newSupplier.contact.role')}
                    placeholder={t('newSupplier.contact.rolePlaceholder')}
                  />
                </FieldGrid>

                <TextAreaField
                  id="supplier-contact-email"
                  name="contactEmail"
                  label={t('newSupplier.contact.email')}
                  placeholder="name@supplier.om"
                />

                <FieldGrid>
                  <PhoneField
                    id="supplier-telephone"
                    name="telephone"
                    label={t('newSupplier.contact.telephone')}
                  />
                  <PhoneField
                    id="supplier-mobile"
                    name="mobile"
                    label={t('newSupplier.contact.mobile')}
                  />
                </FieldGrid>

                <SelectField
                  id="supplier-language"
                  name="preferredLanguage"
                  label={t('newSupplier.contact.preferredLanguage')}
                  options={['Arabic (AR)', 'English (EN)']}
                />

                {advanced ? (
                  <TextField
                    id="supplier-website"
                    name="website"
                    label={t('newSupplier.contact.website')}
                    placeholder="https://"
                    type="url"
                  />
                ) : null}
              </div>
            </SectionCard>

            <SectionCard step={5} title={t('newSupplier.sections.receiving')}>
              <div className="flex flex-col gap-5">
                <SelectField
                  id="supplier-receiving-method"
                  name="receivingMethod"
                  label={t('newSupplier.receiving.method')}
                  options={[
                    t('newSupplier.receiving.peppol'),
                    t('newSupplier.receiving.emailPdf'),
                    t('newSupplier.receiving.manual'),
                  ]}
                />
                <ToggleRow
                  label={t('newSupplier.receiving.selfBilling')}
                  hint={t('newSupplier.receiving.selfBillingHint')}
                  checked={selfBilling}
                  onChange={setSelfBilling}
                  name="selfBilling"
                />
                <ToggleRow
                  label={t('newSupplier.receiving.approvalRequired')}
                  hint={t('newSupplier.receiving.approvalRequiredHint')}
                  checked={approvalRequired}
                  onChange={setApprovalRequired}
                  name="approvalRequired"
                />
              </div>
            </SectionCard>
          </div>
        </div>

        <SectionCard
          step={6}
          title={t('newSupplier.sections.addresses')}
          action={collapseButton(addressesOpen, () => setAddressesOpen((v) => !v))}
        >
          {addressesOpen ? (
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="flex flex-col gap-5">
                <p className="text-xs font-semibold uppercase leading-[1.2] tracking-wide text-text-quaternary">
                  {t('newSupplier.address.billing')}
                </p>
                <AddressBlock prefix="billing" t={t} />
              </div>
              <div className="flex flex-col gap-5">
                <p className="text-xs font-semibold uppercase leading-[1.2] tracking-wide text-text-quaternary">
                  {t('newSupplier.address.pickup')}
                </p>
                <ToggleRow
                  label={t('newSupplier.address.sameAsBilling')}
                  hint={t('newSupplier.address.sameAsBillingHint')}
                  checked={samePickup}
                  onChange={setSamePickup}
                  name="sameAsBilling"
                />
                {samePickup ? null : <AddressBlock prefix="pickup" t={t} />}
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          step={7}
          title={t('newSupplier.sections.notes')}
          action={collapseButton(notesOpen, () => setNotesOpen((v) => !v))}
        >
          {notesOpen ? (
            <TextAreaField
              id="supplier-notes"
              name="internalNotes"
              label={t('newSupplier.notes.label')}
              placeholder={t('newSupplier.notes.placeholder')}
              minHeightClass="min-h-[71px]"
            />
          ) : null}
        </SectionCard>

        <div className="flex flex-wrap items-center justify-end gap-3 pb-2">
          <Link
            to="/suppliers"
            className="inline-flex h-[54px] items-center rounded-sm border border-border-subtle px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-card"
          >
            {t('newSupplier.cancel')}
          </Link>
          <button
            type="submit"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-neutral-25"
          >
            <img src={saveIcon} alt="" className="size-6 shrink-0" />
            {t('newSupplier.saveAndAddAnother')}
          </button>
          <button
            type="submit"
            className="inline-flex h-[54px] min-w-[255px] items-center justify-center rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('newSupplier.save')}
          </button>
        </div>
      </form>
    </AppShell>
  )
}
