import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { AddCustomerModal, type SavedCustomer } from '../../components/AddCustomerModal'
import backIcon from '../../assets/create-invoice/back.svg'
import businessIcon from '../../assets/create-invoice/business.svg'
import consumerIcon from '../../assets/create-invoice/consumer.svg'
import governmentIcon from '../../assets/create-invoice/government.svg'
import tickIcon from '../../assets/create-invoice/tick.svg'
import customerLogo from '../../assets/create-invoice/customer-logo.svg'
import peppolIcon from '../../assets/create-invoice/peppol.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import omrIcon from '../../assets/create-invoice/omr.svg'
import calendarIcon from '../../assets/create-invoice/calendar.svg'
import eyeIcon from '../../assets/create-invoice/eye.svg'
import saveDraftIcon from '../../assets/create-invoice/save-draft.svg'
import arrowIcon from '../../assets/create-invoice/arrow.svg'
import toggleOnIcon from '../../assets/create-invoice/toggle-on.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import qrBadgeIcon from '../../assets/create-invoice/qr-badge.svg'
import receiptQrIcon from '../../assets/create-invoice/receipt-qr.svg'

type CustomerType = 'business' | 'consumer' | 'government'
type DocType = 'invoice' | 'credit' | 'debit' | 'selfBilled'

const LINE_ITEMS = [
  {
    id: '1',
    description: 'Cappuccino - Large',
    excl: '1.8',
    vat: '5%',
    qty: '12',
    unit: 'EA',
    discount: '0',
    total: '21.600',
  },
  {
    id: '2',
    description: 'Coffee Beans 1kg - H Blend',
    excl: '9.5',
    vat: '5%',
    qty: '4',
    unit: 'KG',
    discount: '10',
    total: '34.200',
  },
]

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
        {step}
      </span>
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
    </div>
  )
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
      <span>{label}</span>
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
    </div>
  )
}

function FieldShell({
  children,
  suffix,
  highlighted,
}: {
  children: ReactNode
  suffix?: ReactNode
  highlighted?: boolean
}) {
  return (
    <div
      className={[
        'flex h-[50px] w-full items-center justify-between rounded-sm border border-primary-300 px-4',
        highlighted ? 'bg-primary-25' : 'bg-surface-tab-bar',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {suffix}
    </div>
  )
}

function OmAmount({
  value,
  size = 'sm',
  muted,
}: {
  value: string
  size?: 'sm' | 'md' | 'lg'
  muted?: boolean
}) {
  const iconSize = size === 'lg' ? 'size-6' : 'size-4'
  const textSize =
    size === 'lg' ? 'text-[22px] font-semibold' : size === 'md' ? 'text-base font-semibold' : 'text-sm font-semibold'
  return (
    <span className={['inline-flex items-center gap-0.5', muted ? 'text-text-quaternary' : 'text-text-secondary'].join(' ')}>
      <img src={omrIcon} alt="" className={iconSize} />
      <span className={textSize}>{value}</span>
    </span>
  )
}

export function CreateInvoicePage() {
  const { t } = useTranslation()
  const [customerType, setCustomerType] = useState<CustomerType>('business')
  const [docType, setDocType] = useState<DocType>('invoice')
  const [exclVat, setExclVat] = useState(true)
  const [customers, setCustomers] = useState<SavedCustomer[]>([
    {
      id: 'CUS-001',
      name: 'Muscat Grand Hotel LLC',
      vat: 'VAT OM1100447102 · 0248:OM1100447102',
      onPeppol: true,
      kind: 'company',
    },
  ])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>('CUS-001')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null

  useEffect(() => {
    if (!pickerOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [pickerOpen])

  const openAddCustomer = () => {
    setPickerOpen(false)
    setAddCustomerOpen(true)
  }

  const handleSaveCustomer = (customer: SavedCustomer) => {
    setCustomers((prev) => [...prev, customer])
    setSelectedCustomerId(customer.id)
  }

  const customerTypes: { id: CustomerType; titleKey: string; subtitleKey: string; icon: string }[] = [
    { id: 'business', titleKey: 'createInvoice.customerTypes.business', subtitleKey: 'createInvoice.customerTypes.businessSub', icon: businessIcon },
    { id: 'consumer', titleKey: 'createInvoice.customerTypes.consumer', subtitleKey: 'createInvoice.customerTypes.consumerSub', icon: consumerIcon },
    { id: 'government', titleKey: 'createInvoice.customerTypes.government', subtitleKey: 'createInvoice.customerTypes.governmentSub', icon: governmentIcon },
  ]

  const docTypes: { id: DocType; labelKey: string }[] = [
    { id: 'invoice', labelKey: 'createInvoice.docTypes.invoice' },
    { id: 'credit', labelKey: 'createInvoice.docTypes.credit' },
    { id: 'debit', labelKey: 'createInvoice.docTypes.debit' },
    { id: 'selfBilled', labelKey: 'createInvoice.docTypes.selfBilled' },
  ]

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        {/* Breadcrumb / title */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary"
          >
            {t('createInvoice.breadcrumb')}
            <img src={backIcon} alt="" className="size-6 rotate-180" />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('createInvoice.title')}
            </h1>
            <span className="text-sm font-medium text-[#8f8f8f]">{t('createInvoice.draftMeta')}</span>
          </div>
        </div>

        {/* Doc type tabs */}
        <div className="inline-flex w-fit rounded-md border border-border-subtle bg-surface-card p-1">
          {docTypes.map((tab) => {
            const active = tab.id === docType
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDocType(tab.id)}
                className={[
                  'rounded-sm px-4 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary-50 text-primary-800' : 'text-text-tertiary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>

        {/* 1 Customer + Summary */}
        <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
            <SectionTitle step={1} title={t('createInvoice.sections.customer')} />
            <div className="h-px w-full bg-border-subtle" />
            <div className="grid gap-3 sm:grid-cols-3">
              {customerTypes.map((type) => {
                const active = type.id === customerType
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setCustomerType(type.id)}
                    className={[
                      'flex h-[65px] items-center justify-between rounded-sm p-4 text-start transition-colors',
                      active
                        ? 'border-2 border-primary-500 bg-primary-50'
                        : 'border border-border-default bg-surface-card',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-2">
                      <img src={type.icon} alt="" className="size-6" />
                      <span>
                        <span className="block text-base font-medium tracking-[0.16px] text-text-primary">
                          {t(type.titleKey)}
                        </span>
                        <span className="block text-xs font-medium tracking-[0.12px] text-text-tertiary">
                          {t(type.subtitleKey)}
                        </span>
                      </span>
                    </span>
                    {active ? <img src={tickIcon} alt="" className="size-[18px]" /> : null}
                  </button>
                )
              })}
            </div>

            {customerType === 'consumer' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <FieldLabel label={t('createInvoice.consumer.name')} />
                    <FieldShell>
                      <span className="text-sm font-medium text-text-placeholder">
                        {t('createInvoice.consumer.namePlaceholder')}
                      </span>
                    </FieldShell>
                  </div>
                  <div className="flex flex-col gap-1">
                    <FieldLabel label={t('createInvoice.consumer.contact')} />
                    <FieldShell>
                      <span className="text-sm font-medium text-text-placeholder">
                        {t('createInvoice.consumer.contactPlaceholder')}
                      </span>
                    </FieldShell>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-sm border border-primary-50 bg-primary-25 p-2">
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-sm bg-white">
                    <img src={qrBadgeIcon} alt="" className="size-8" />
                  </span>
                  <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                    {t('createInvoice.consumer.peppolNote')}
                  </p>
                </div>
              </>
            ) : customers.length === 0 ? (
              <button
                type="button"
                onClick={openAddCustomer}
                className="inline-flex h-[65px] w-full items-center justify-center gap-2 rounded-sm border border-dashed border-primary-300 bg-primary-25 px-4 text-base font-semibold text-primary-800 transition-colors hover:bg-primary-50"
              >
                <img src={plusIcon} alt="" className="size-6" />
                {t('createInvoice.customer.addCustomer')}
              </button>
            ) : (
              <div
                ref={pickerRef}
                className="relative flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-3 py-4"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {selectedCustomer ? (
                    <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
                  ) : (
                    <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-sm bg-white text-sm font-semibold text-primary-800">
                      +
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {selectedCustomer?.name ?? t('createInvoice.customer.select')}
                    </p>
                    <p className="truncate text-xs font-medium text-text-quaternary">
                      {selectedCustomer?.vat ?? t('createInvoice.customer.selectHint')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {selectedCustomer?.onPeppol ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary-75 bg-white/70 py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                      <img src={peppolIcon} alt="" className="size-4" />
                      {t('createInvoice.customer.onPeppol')}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen((v) => !v)}
                    className="inline-flex items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800"
                  >
                    {selectedCustomer
                      ? t('createInvoice.customer.change')
                      : t('createInvoice.customer.select')}
                    <img
                      src={chevronIcon}
                      alt=""
                      className={['size-6 transition-transform', pickerOpen ? '-rotate-90' : 'rotate-90'].join(' ')}
                    />
                  </button>
                </div>

                {pickerOpen ? (
                  <div className="absolute end-3 top-[calc(100%-8px)] z-20 w-[min(100%,320px)] overflow-hidden rounded-sm border border-border-subtle bg-white shadow-card">
                    <ul className="max-h-56 overflow-y-auto py-1">
                      {customers.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(c.id)
                              setPickerOpen(false)
                            }}
                            className={[
                              'flex w-full flex-col gap-0.5 px-3 py-2.5 text-start transition-colors hover:bg-primary-25',
                              c.id === selectedCustomerId ? 'bg-primary-25' : '',
                            ].join(' ')}
                          >
                            <span className="text-sm font-semibold text-text-primary">{c.name}</span>
                            <span className="text-xs font-medium text-text-quaternary">{c.vat}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-border-subtle p-1">
                      <button
                        type="button"
                        onClick={openAddCustomer}
                        className="inline-flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-25"
                      >
                        <img src={plusIcon} alt="" className="size-5" />
                        {t('createInvoice.customer.addCustomer')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <aside className="rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
            <h3 className="text-base font-medium text-text-primary">{t('createInvoice.summary.title')}</h3>
            <div className="my-4 h-px bg-border-subtle" />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary/70">{t('createInvoice.summary.subtotal')}</span>
                <OmAmount value="59.600" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary/50">{t('createInvoice.summary.discount')}</span>
                <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-text-quaternary">
                  − <OmAmount value="3.800" muted />
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary/70">{t('createInvoice.summary.net')}</span>
                <OmAmount value="55.800" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">{t('createInvoice.summary.vat')}</span>
                <OmAmount value="2.790" />
              </div>
            </div>
            <div className="my-4 h-px bg-border-subtle" />
            <div className="flex items-center justify-between">
              <span className="text-base font-medium text-text-primary/90">{t('createInvoice.summary.totalDue')}</span>
              <OmAmount value="58.590" size="lg" />
            </div>
          </aside>
        </div>

        {/* 2 Invoice details (+ Receipt QR for consumer) */}
        <div
          className={
            customerType === 'consumer' ? 'grid gap-4 xl:grid-cols-[1fr_332px]' : undefined
          }
        >
          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
            <SectionTitle step={2} title={t('createInvoice.sections.details')} />
            <div className="h-px w-full bg-border-subtle" />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.invoiceNumber')} required />
                <FieldShell highlighted>
                  <span className="text-sm font-medium text-primary-800">INV-2044</span>
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.issueDate')} required />
                <FieldShell suffix={<img src={calendarIcon} alt="" className="size-6" />}>
                  <span className="text-sm font-medium text-text-secondary">07/18/2026</span>
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.dueDate')} required />
                <FieldShell suffix={<img src={calendarIcon} alt="" className="size-6" />}>
                  <span className="text-sm font-medium text-text-secondary">07/18/2026</span>
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.deliveryDate')} />
                <FieldShell suffix={<img src={calendarIcon} alt="" className="size-6" />}>
                  <span className="text-sm font-medium text-text-secondary">07/18/2026</span>
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.paymentTerms')} required />
                <FieldShell suffix={<img src={chevronIcon} alt="" className="size-6 rotate-90" />}>
                  <span className="text-sm font-medium text-text-secondary">{t('createInvoice.values.net30')}</span>
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.branch')} required />
                <FieldShell suffix={<img src={chevronIcon} alt="" className="size-6 rotate-90" />}>
                  <span className="text-sm font-medium text-text-secondary">{t('createInvoice.values.branch')}</span>
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.currency')} required />
                <FieldShell suffix={<img src={chevronIcon} alt="" className="size-6 rotate-90" />}>
                  <span className="text-sm font-medium text-text-secondary">{t('createInvoice.values.currency')}</span>
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.taxCategory')} required />
                <FieldShell suffix={<img src={chevronIcon} alt="" className="size-6 rotate-90" />}>
                  <span className="text-sm font-medium text-text-secondary">{t('createInvoice.values.tax')}</span>
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.project')} />
                <FieldShell>
                  <span className="text-sm font-medium text-text-secondary">{t('createInvoice.values.project')}</span>
                </FieldShell>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.subject')} />
                <FieldShell>
                  <span className="truncate text-sm font-medium text-text-secondary">
                    {t('createInvoice.values.subject')}
                  </span>
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.po')} />
                <FieldShell>
                  <span className="text-sm font-medium text-text-secondary">PO-88213</span>
                </FieldShell>
              </div>
            </div>
          </section>

          {customerType === 'consumer' ? (
            <aside className="flex min-h-[400px] flex-col rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
              <h3 className="text-base font-medium text-text-primary">
                {t('createInvoice.consumer.receiptQr')}
              </h3>
              <div className="my-4 h-px bg-border-subtle" />
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
                <img src={receiptQrIcon} alt="" className="size-[140px]" />
                <p className="max-w-[175px] whitespace-pre-line text-sm font-medium leading-[1.2] text-text-secondary">
                  {t('createInvoice.consumer.receiptQrHint')}
                </p>
              </div>
            </aside>
          ) : null}
        </div>

        {/* 3 Items */}
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle step={3} title={t('createInvoice.sections.items')} />
            <div className="inline-flex rounded-md border border-border-subtle p-0.5">
              <button
                type="button"
                onClick={() => setExclVat(true)}
                className={[
                  'rounded-sm px-3 py-1.5 text-sm font-medium',
                  exclVat ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary',
                ].join(' ')}
              >
                {t('createInvoice.items.exclVat')}
              </button>
              <button
                type="button"
                onClick={() => setExclVat(false)}
                className={[
                  'rounded-sm px-3 py-1.5 text-sm font-medium',
                  !exclVat ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary',
                ].join(' ')}
              >
                {t('createInvoice.items.inclVat')}
              </button>
            </div>
          </div>
          <div className="h-px w-full bg-border-subtle" />

          <div className="overflow-x-auto">
            <div className="min-w-[960px]">
              <div className="grid grid-cols-[1.6fr_0.55fr_0.7fr_0.55fr_0.55fr_0.45fr_0.7fr] gap-2 px-1 text-sm font-medium text-text-tertiary">
                <span>{t('createInvoice.items.description')}</span>
                <span>{t('createInvoice.items.excl')}</span>
                <span>{t('createInvoice.items.vat')}</span>
                <span>{t('createInvoice.items.qty')}</span>
                <span>{t('createInvoice.items.unit')}</span>
                <span>{t('createInvoice.items.discount')}</span>
                <span>{t('createInvoice.items.totExcl')}</span>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {LINE_ITEMS.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1.6fr_0.55fr_0.7fr_0.55fr_0.55fr_0.45fr_0.7fr] items-center gap-2"
                  >
                    <FieldShell suffix={<img src={chevronIcon} alt="" className="size-6 rotate-90" />}>
                      <span className="truncate text-sm font-medium text-text-secondary">{row.description}</span>
                    </FieldShell>
                    <FieldShell>
                      <span className="text-sm font-medium text-text-secondary">{row.excl}</span>
                    </FieldShell>
                    <FieldShell>
                      <span className="text-sm font-medium text-text-secondary">{row.vat}</span>
                    </FieldShell>
                    <FieldShell>
                      <span className="text-sm font-medium text-text-secondary">{row.qty}</span>
                    </FieldShell>
                    <FieldShell suffix={<img src={chevronIcon} alt="" className="size-6 rotate-90" />}>
                      <span className="text-sm font-medium text-text-secondary">{row.unit}</span>
                    </FieldShell>
                    <FieldShell>
                      <span className="text-sm font-medium text-text-secondary">{row.discount}</span>
                    </FieldShell>
                    <div className="flex items-center justify-between gap-2 pe-1">
                      <OmAmount value={row.total} size="md" />
                      <button
                        type="button"
                        className="inline-flex size-8 items-center justify-center rounded-sm text-text-quaternary hover:bg-neutral-25"
                        aria-label={t('createInvoice.items.remove')}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm border border-dashed border-primary-300 text-sm font-semibold text-primary-800"
          >
            <span className="text-xl leading-none">+</span>
            {t('createInvoice.items.addLine')}
          </button>

          <div className="ms-auto w-full max-w-[301px] space-y-3 pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-text-tertiary">{t('createInvoice.items.totalExcluding')}</span>
              <OmAmount value="55.800" size="md" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-text-tertiary">{t('createInvoice.items.vatAmount')}</span>
              <OmAmount value="2.790" size="md" />
            </div>
            <div className="h-px bg-border-subtle" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">{t('createInvoice.items.totalAmount')}</span>
              <OmAmount value="58.590" size="lg" />
            </div>
          </div>
        </section>

        {/* 4 Payment & status */}
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <SectionTitle step={4} title={t('createInvoice.sections.payment')} />
          <div className="h-px w-full bg-border-subtle" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.paymentMethod')} />
              <FieldShell suffix={<img src={chevronIcon} alt="" className="size-6 rotate-90" />}>
                <span className="text-sm font-medium text-text-secondary">{t('createInvoice.values.bankTransfer')}</span>
              </FieldShell>
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.paymentReference')} />
              <FieldShell>
                <span className="text-sm font-medium text-text-secondary">MGH-2044-07</span>
              </FieldShell>
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.paymentDate')} />
              <FieldShell>
                <span className="text-sm font-medium text-text-secondary">18/07/2026</span>
              </FieldShell>
            </div>
          </div>
          <div className="flex flex-wrap gap-8 pt-2">
            <div className="flex max-w-md items-start gap-2.5">
              <img src={toggleOnIcon} alt="" className="mt-0.5 h-[23px] w-[42px]" />
              <div>
                <p className="text-sm font-medium text-text-primary">{t('createInvoice.toggles.paid')}</p>
                <p className="text-sm font-medium text-text-quaternary">{t('createInvoice.toggles.paidHint')}</p>
              </div>
            </div>
            <div className="flex max-w-xl items-start gap-2.5">
              <img src={toggleOnIcon} alt="" className="mt-0.5 h-[23px] w-[42px]" />
              <div>
                <p className="text-sm font-medium text-text-primary">{t('createInvoice.toggles.sent')}</p>
                <p className="text-sm font-medium text-text-quaternary">{t('createInvoice.toggles.sentHint')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5 Notes */}
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <SectionTitle step={5} title={t('createInvoice.sections.notes')} />
          <div className="h-px w-full bg-border-subtle" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span className="text-text-primary">{t('createInvoice.notes.toCustomer')}</span>
                <span className="text-xs text-text-quaternary">{t('createInvoice.notes.onInvoice')}</span>
              </div>
              <div className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.2] text-text-secondary">
                {t('createInvoice.notes.customerText')}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span className="text-text-primary">{t('createInvoice.notes.internal')}</span>
                <span className="text-xs text-text-quaternary">{t('createInvoice.notes.private')}</span>
              </div>
              <div className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.2] text-text-secondary">
                {t('createInvoice.notes.internalText')}
              </div>
            </div>
          </div>
          <div className="flex min-h-[129px] flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-primary-300 bg-surface-tab-bar px-4 py-6 text-center">
            <img src={uploadIcon} alt="" className="size-6" />
            <p className="text-sm font-semibold text-text-secondary">{t('createInvoice.notes.uploadTitle')}</p>
            <p className="text-sm font-medium text-text-quaternary">{t('createInvoice.notes.uploadHint')}</p>
          </div>
        </section>
      </div>

      {/* Sticky footer actions */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-surface-tab-bar md:ps-[248px]">
        <div className="mx-auto flex max-w-[1144px] items-center justify-end gap-3 px-4 py-4">
          <button
            type="button"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
          >
            <img src={eyeIcon} alt="" className="size-6" />
            {t('createInvoice.actions.preview')}
          </button>
          <button
            type="button"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
          >
            <img src={saveDraftIcon} alt="" className="size-6 rotate-180" />
            {t('createInvoice.actions.saveDraft')}
          </button>
          <button
            type="button"
            className="inline-flex h-[54px] w-[255px] items-center justify-center gap-1.5 rounded-sm bg-primary-700 text-base font-semibold text-white hover:bg-primary-800"
          >
            {t('createInvoice.actions.submit')}
            <img src={arrowIcon} alt="" className="size-[18px]" />
          </button>
        </div>
      </div>

      <AddCustomerModal
        open={addCustomerOpen}
        onClose={() => setAddCustomerOpen(false)}
        onSave={handleSaveCustomer}
      />
    </AppShell>
  )
}
