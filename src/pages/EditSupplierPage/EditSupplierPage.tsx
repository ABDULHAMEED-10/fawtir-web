import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
import { FieldGrid, SectionCard, SelectField, TextField, ToggleRow } from '../../components/form'
import { SUPPLIER_DETAIL } from '../../lib/supplierDetail'
import { formatOmr } from '../../lib/suppliers'
import * as validate from '../../lib/validation'
import chevronIcon from '../../assets/invoices/chevron.svg'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'
import checkIcon from '../../assets/bill-detail/tick.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import removeIcon from '../../assets/create-invoice/remove-x.svg'
import menuCopyIcon from '../../assets/suppliers/menu-copy.svg'
import menuOffIcon from '../../assets/suppliers/menu-off.svg'
import menuStatementIcon from '../../assets/suppliers/menu-statement.svg'

/** The record is complete when each of these is on file. */
const COMPLETENESS = [
  { id: 'vat', done: true },
  { id: 'peppol', done: true },
  { id: 'iban', done: true },
  { id: 'terms', done: true },
  { id: 'secondContact', done: false },
]

const RECENT_CHANGES = [
  { id: 'early', who: 'Hafidh Saif', initials: 'HS', on: '14 Jan 2026' },
  { id: 'iban', who: 'Hafidh Saif', initials: 'HS', on: '14 Jan 2026' },
  { id: 'contact', who: 'Yusuf Al Balushi', initials: 'YB', on: '8 Nov 2025' },
  { id: 'created', who: '', initials: '—', on: '2 Sep 2024' },
]

export function EditSupplierPage() {
  const { t } = useTranslation()
  const supplier = SUPPLIER_DETAIL

  const [vat, setVat] = useState(supplier.vat)
  const [onPeppol, setOnPeppol] = useState(true)
  const [autoMatch, setAutoMatch] = useState(true)
  const [selfBilling, setSelfBilling] = useState(false)
  const [tags, setTags] = useState(['Raw materials', 'Key supplier'])

  /** The VAT field confirms itself as you type, which is what the tick in the design means. */
  const vatError = validate.vatin(vat)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Breadcrumb + actions */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/suppliers"
                className="text-base font-medium text-text-quaternary hover:text-primary-700"
              >
                {t('suppliersPage.title')}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-4 rtl:rotate-180" />
              <Link
                to={`/suppliers/${supplier.slug}`}
                className="text-base font-medium text-text-quaternary hover:text-primary-700"
              >
                {supplier.name}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-4 rtl:rotate-180" />
              <span className="text-base font-semibold text-text-primary">
                {t('supplierEdit.edit')}
              </span>
            </div>
            <h1 className="mt-1.5 text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('supplierEdit.title', { name: supplier.name })}
            </h1>
            <p className="mt-1 max-w-[780px] text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('supplierEdit.subtitle')}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
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
                  to: `/suppliers/${supplier.slug}/statement`,
                },
                {
                  id: 'copyToNew',
                  labelKey: 'suppliersPage.menu.copyToNew',
                  descriptionKey: 'suppliersPage.menu.copyToNewNote',
                  icon: menuCopyIcon,
                  to: '/suppliers/new',
                },
                {
                  id: 'switchOff',
                  labelKey: 'suppliersPage.menu.switchOff',
                  descriptionKey: 'suppliersPage.menu.switchOffNote',
                  values: { count: supplier.counts.bills },
                  icon: menuOffIcon,
                  danger: true,
                },
              ]}
            />
            <Link
              to={`/suppliers/${supplier.slug}`}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierEdit.cancel')}
            </Link>
            <Link
              to={`/suppliers/${supplier.slug}`}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={tickIcon} alt="" className="size-4" />
              {t('supplierEdit.save')}
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          {/* Form */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <SectionCard step={1} title={t('supplierEdit.whoTheyAre')}>
              <div className="flex flex-col gap-4">
                <TextField
                  id="legalName"
                  name="legalName"
                  label={t('supplierEdit.legalName')}
                  required
                  defaultValue={supplier.legalName}
                />
                <FieldGrid>
                  <TextField
                    id="tradingName"
                    name="tradingName"
                    label={t('supplierEdit.tradingName')}
                    defaultValue="Muscat Roastery"
                  />
                  <TextField
                    id="cr"
                    name="cr"
                    label={t('supplierEdit.commercialRegistration')}
                    defaultValue={supplier.crNumber}
                  />
                </FieldGrid>
                <FieldGrid>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="vat"
                      className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary"
                    >
                      {t('supplierEdit.vatNumber')}
                      <span className="text-xl leading-4 text-primary-700">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="vat"
                        value={vat}
                        onChange={(event) => setVat(event.target.value.toUpperCase())}
                        aria-invalid={vatError ? true : undefined}
                        className={[
                          'h-[50px] w-full rounded-sm border bg-surface-tab-bar px-4 pe-11 text-sm font-medium text-text-secondary outline-none',
                          vatError ? 'border-border-danger' : 'border-primary-300',
                        ].join(' ')}
                      />
                      {!vatError ? (
                        <img
                          src={checkIcon}
                          alt=""
                          className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2"
                        />
                      ) : null}
                    </div>
                    <p
                      className={[
                        'flex items-center gap-1.5 text-xs font-medium leading-[1.3]',
                        vatError ? 'text-text-danger' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {!vatError ? <img src={checkIcon} alt="" className="size-3.5" /> : null}
                      {vatError ? t(vatError) : t('supplierEdit.vatHint')}
                    </p>
                  </div>
                  <SelectField
                    id="country"
                    name="country"
                    label={t('supplierEdit.country')}
                    options={['Oman', 'United Arab Emirates', 'Saudi Arabia']}
                  />
                </FieldGrid>
              </div>
            </SectionCard>

            <SectionCard step={2} title={t('supplierEdit.howBillsReach')}>
              <div className="flex flex-col gap-5">
                <ToggleRow
                  label={t('supplierEdit.onPeppol')}
                  hint={t('supplierEdit.onPeppolHint')}
                  checked={onPeppol}
                  onChange={setOnPeppol}
                />

                {onPeppol ? (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="peppolId"
                      className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary"
                    >
                      {t('supplierEdit.peppolId')}
                      <span className="text-xl leading-4 text-primary-700">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="peppolId"
                        defaultValue={supplier.billing.peppolId}
                        className="h-[50px] w-full rounded-sm border border-border-subtle bg-surface-background px-4 pe-11 text-sm font-medium text-text-secondary outline-none"
                      />
                      <img
                        src={checkIcon}
                        alt=""
                        className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2"
                      />
                    </div>
                    <p className="flex items-center gap-1.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                      <img src={checkIcon} alt="" className="size-3.5" />
                      {t('supplierEdit.peppolHint')}
                    </p>
                  </div>
                ) : null}

                <ToggleRow
                  label={t('supplierEdit.autoMatch')}
                  hint={t('supplierEdit.autoMatchHint')}
                  checked={autoMatch}
                  onChange={setAutoMatch}
                />
                <ToggleRow
                  label={t('supplierEdit.selfBilling')}
                  hint={t('supplierEdit.selfBillingHint')}
                  checked={selfBilling}
                  onChange={setSelfBilling}
                />
              </div>
            </SectionCard>

            <SectionCard step={3} title={t('supplierEdit.payingThem')}>
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <SelectField
                    id="terms"
                    name="terms"
                    label={t('supplierEdit.paymentTerms')}
                    required
                    options={['Net 30 days', 'Net 10 days', 'On receipt']}
                  />
                  <TextField
                    id="early"
                    name="early"
                    label={t('supplierEdit.earlySettlement')}
                    defaultValue="2% within 7 days"
                  />
                  <SelectField
                    id="currency"
                    name="currency"
                    label={t('supplierEdit.defaultCurrency')}
                    options={['OMR - Omani Rial', 'USD - US Dollar', 'AED - UAE Dirham']}
                  />
                </div>
                <FieldGrid>
                  <TextField
                    id="bank"
                    name="bank"
                    label={t('supplierEdit.bank')}
                    defaultValue={supplier.paying.bank}
                  />
                  <TextField
                    id="bic"
                    name="bic"
                    label={t('supplierEdit.bicSwift')}
                    defaultValue={supplier.paying.bic}
                  />
                </FieldGrid>
                <TextField
                  id="iban"
                  name="iban"
                  label={t('supplierEdit.iban')}
                  defaultValue="OM55 0018 0000 4471 2290"
                />
              </div>
            </SectionCard>

            <SectionCard step={4} title={t('supplierEdit.contactAndFiling')}>
              <div className="flex flex-col gap-4">
                <FieldGrid>
                  <TextField
                    id="contact"
                    name="contact"
                    label={t('supplierEdit.mainContact')}
                    defaultValue={supplier.contacts[0].name}
                  />
                  <TextField
                    id="email"
                    name="email"
                    type="email"
                    label={t('supplierEdit.theirEmail')}
                    defaultValue={supplier.contacts[0].detail}
                  />
                </FieldGrid>
                <FieldGrid>
                  <TextField
                    id="phone"
                    name="phone"
                    label={t('supplierEdit.phone')}
                    defaultValue="+968 9xxx 2290"
                  />
                  <TextField
                    id="address"
                    name="address"
                    label={t('supplierEdit.address')}
                    defaultValue="Rusayl Industrial Estate, Muscat"
                  />
                </FieldGrid>
                <SelectField
                  id="category"
                  name="category"
                  label={t('supplierEdit.category')}
                  options={['Raw materials', 'Logistics', 'Utilities', 'Services']}
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
                          onClick={() => setTags((current) => current.filter((x) => x !== tag))}
                        >
                          <img src={removeIcon} alt="" className="size-3.5" />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setTags((current) => [
                          ...current,
                          t('supplierEdit.newTag', { n: current.length + 1 }),
                        ])
                      }
                      className="inline-flex h-[34px] items-center gap-1.5 rounded-sm border border-dashed border-border-default bg-white px-3 text-sm font-medium text-text-secondary transition-colors hover:border-primary-300"
                    >
                      <img src={plusIcon} alt="" className="size-3.5" />
                      {t('supplierEdit.addTag')}
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Side column */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('supplierEdit.isComplete')}
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {COMPLETENESS.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2.5">
                    {entry.done ? (
                      <img src={checkIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                    ) : (
                      <span className="mt-0.5 size-4 shrink-0 rounded-full border border-border-default" />
                    )}
                    <span
                      className={[
                        'text-sm font-medium leading-[1.4]',
                        entry.done ? 'text-text-secondary' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {t(`supplierEdit.complete.${entry.id}`, {
                        name: supplier.contacts[0].name.split(' ')[0],
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('supplierEdit.whatItAffects')}
              </h2>
              <dl className="mt-3 flex flex-col">
                <AffectRow label={t('supplierEdit.openBills')}>
                  <span className="flex items-center gap-1 tabular-nums">
                    {supplier.openBills.length} ·
                    <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                    {formatOmr(supplier.owed)}
                  </span>
                </AffectRow>
                <AffectRow label={t('supplierEdit.inDraftRun')}>{supplier.paymentRun}</AffectRow>
                <AffectRow label={t('supplierEdit.openOrders')}>PO-0033</AffectRow>
                <AffectRow label={t('supplierEdit.recurringBills')} last>
                  {t('supplierEdit.none')}
                </AffectRow>
              </dl>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('supplierEdit.recentChanges')}
              </h2>
              <ul className="mt-3 flex flex-col">
                {RECENT_CHANGES.map((entry, index) => (
                  <li
                    key={entry.id}
                    className={[
                      'flex items-start gap-3 py-3',
                      index < RECENT_CHANGES.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-background text-[11px] font-semibold text-text-tertiary">
                      {entry.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                        {t(`supplierEdit.change.${entry.id}`)}
                      </p>
                      <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {t(`supplierEdit.change.${entry.id}Meta`, {
                          who: entry.who,
                          on: entry.on,
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function AffectRow({
  label,
  children,
  last,
}: {
  label: string
  children: React.ReactNode
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
