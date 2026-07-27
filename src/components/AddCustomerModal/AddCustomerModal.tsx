import { useEffect, useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import closeIcon from '../../assets/add-customer/close.svg'
import tickIcon from '../../assets/add-customer/tick.svg'
import companyIcon from '../../assets/add-customer/company.svg'
import privateIcon from '../../assets/add-customer/private.svg'
import chevronIcon from '../../assets/add-customer/chevron.svg'
import arrowIcon from '../../assets/add-customer/arrow.svg'
import omanFlag from '../../assets/add-customer/oman-flag.svg'

export type CustomerProfileKind = 'company' | 'private'

export type SavedCustomer = {
  id: string
  name: string
  vat: string
  onPeppol: boolean
  kind: CustomerProfileKind
}

type AddCustomerModalProps = {
  open: boolean
  onClose: () => void
  onSave: (customer: SavedCustomer) => void
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <p className="mb-1 inline-flex items-center gap-0.5 text-sm font-medium text-text-primary">
      {label}
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
    </p>
  )
}

function TextField({
  label,
  required,
  defaultValue,
  placeholder,
  suffix,
}: {
  label: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  suffix?: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex w-full flex-col">
      <label htmlFor={id}>
        <FieldLabel label={label} required={required} />
      </label>
      <div className="flex h-[50px] w-full items-center justify-between rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
        <input
          id={id}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
        />
        {suffix}
      </div>
    </div>
  )
}

function PhoneField({ label }: { label: string }) {
  const id = useId()
  return (
    <div className="flex w-full flex-col">
      <label htmlFor={id}>
        <FieldLabel label={label} />
      </label>
      <div className="flex h-[50px] w-full items-center gap-2 rounded-sm border border-[#e3e4ea] bg-surface-tab-bar px-4">
        <img src={omanFlag} alt="" className="size-5 shrink-0" />
        <span className="shrink-0 text-sm font-medium tracking-[0.14px] text-text-secondary">
          +968
        </span>
        <input
          id={id}
          type="tel"
          placeholder="9XXX XXXX"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
        />
      </div>
    </div>
  )
}

function SectionHeader({
  step,
  title,
  collapsible,
  collapsed,
  onToggle,
}: {
  step: number
  title: string
  collapsible?: boolean
  collapsed?: boolean
  onToggle?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold text-primary-800">
          {step}
        </span>
        <h3 className="text-xl font-medium text-text-secondary">{title}</h3>
      </div>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary-800"
        >
          <span className="inline-block h-px w-3 bg-primary-800" />
          {collapsed ? t('addCustomer.expand') : t('addCustomer.collapse')}
        </button>
      ) : null}
    </div>
  )
}

export function AddCustomerModal({ open, onClose, onSave }: AddCustomerModalProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<CustomerProfileKind>('company')
  const [addressOpen, setAddressOpen] = useState(true)
  const [notesOpen, setNotesOpen] = useState(true)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const handleSave = () => {
    const customer: SavedCustomer =
      kind === 'company'
        ? {
            id: `CUS-${Date.now()}`,
            name: 'Golden Tech WLL',
            vat: 'VAT OM07182026 · 0248:OM07182026',
            onPeppol: true,
            kind,
          }
        : {
            id: `CUS-${Date.now()}`,
            name: 'Atiq Abdullah',
            vat: 'Private individual',
            onPeppol: false,
            kind,
          }
    onSave(customer)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-customer-title"
      onClick={onClose}
    >
      <div
        className="my-4 flex w-full max-w-[720px] flex-col overflow-hidden rounded-sm bg-white shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[min(85dvh,900px)] flex-col overflow-y-auto p-6">
          <div className="mb-4 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 id="add-customer-title" className="text-2xl font-medium text-text-primary">
                {t('addCustomer.title')}
              </h2>
              <p className="mt-0.5 text-sm font-medium text-text-quaternary">
                {t('addCustomer.subtitle')}
              </p>
            </div>
            <button
              type="button"
              aria-label={t('addCustomer.close')}
              onClick={onClose}
              className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full bg-text-primary/[0.04]"
            >
              <img src={closeIcon} alt="" className="size-5" />
            </button>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                {
                  id: 'company' as const,
                  icon: companyIcon,
                  titleKey: 'addCustomer.kinds.company',
                  subKey: 'addCustomer.kinds.companySub',
                },
                {
                  id: 'private' as const,
                  icon: privateIcon,
                  titleKey: 'addCustomer.kinds.private',
                  subKey: 'addCustomer.kinds.privateSub',
                },
              ] as const
            ).map((option) => {
              const active = kind === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setKind(option.id)}
                  className={[
                    'flex h-[65px] items-center justify-between rounded-sm p-4 text-start',
                    active
                      ? 'border-2 border-primary-500 bg-primary-50'
                      : 'border border-border-default bg-white',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2">
                    <img src={option.icon} alt="" className="size-6 shrink-0" />
                    <span>
                      <span className="block text-base font-medium tracking-[0.16px] text-text-primary">
                        {t(option.titleKey)}
                      </span>
                      <span className="block text-xs font-medium tracking-[0.12px] text-text-tertiary">
                        {t(option.subKey)}
                      </span>
                    </span>
                  </span>
                  {active ? <img src={tickIcon} alt="" className="size-[18px] shrink-0" /> : null}
                </button>
              )
            })}
          </div>

          {/* Section 1 */}
          <div className="mb-4 flex flex-col gap-3">
            <SectionHeader
              step={1}
              title={
                kind === 'company'
                  ? t('addCustomer.sections.companyDetails')
                  : t('addCustomer.sections.personalDetails')
              }
            />
            <div className="h-px w-full bg-border-subtle" />
            {kind === 'company' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label={t('addCustomer.fields.vat')}
                    required
                    defaultValue="07/18/2026"
                  />
                  <TextField
                    label={t('addCustomer.fields.corporateName')}
                    required
                    defaultValue="Golden Tech WLL"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label={t('addCustomer.fields.directorFirst')}
                    defaultValue="Atiq"
                  />
                  <TextField
                    label={t('addCustomer.fields.lastNameManager')}
                    defaultValue="Abdullah"
                  />
                </div>
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t('addCustomer.fields.firstName')} required defaultValue="Atiq" />
                <TextField
                  label={t('addCustomer.fields.lastName')}
                  required
                  defaultValue="Abdullah"
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t('addCustomer.fields.email')} defaultValue="atiq@goldentech.com" />
              <TextField
                label={t('addCustomer.fields.language')}
                defaultValue="Arabic (AR)"
                suffix={<img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-70" />}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PhoneField label={t('addCustomer.fields.telephone')} />
              <PhoneField label={t('addCustomer.fields.mobile')} />
            </div>
          </div>

          {/* Section 2 */}
          <div className="mb-4 flex flex-col gap-3">
            <SectionHeader
              step={2}
              title={t('addCustomer.sections.address')}
              collapsible
              collapsed={!addressOpen}
              onToggle={() => setAddressOpen((v) => !v)}
            />
            <div className="h-px w-full bg-border-subtle" />
            {addressOpen ? (
              <>
                <TextField label={t('addCustomer.fields.attn')} defaultValue="Atiq Abdullah" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label={t('addCustomer.fields.country')}
                    defaultValue="Oman"
                    suffix={
                      <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-70" />
                    }
                  />
                  <TextField label={t('addCustomer.fields.city')} defaultValue="Muscat" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField label={t('addCustomer.fields.zone')} defaultValue="61" />
                  <TextField label={t('addCustomer.fields.street')} defaultValue="840" />
                  <TextField label={t('addCustomer.fields.building')} defaultValue="12" />
                </div>
                <TextField label={t('addCustomer.fields.poBox')} defaultValue="23000" />
              </>
            ) : null}
          </div>

          {/* Section 3 */}
          <div className="flex flex-col gap-3">
            <SectionHeader
              step={3}
              title={t('addCustomer.sections.notes')}
              collapsible
              collapsed={!notesOpen}
              onToggle={() => setNotesOpen((v) => !v)}
            />
            <div className="h-px w-full bg-border-subtle" />
            {notesOpen ? (
              <div>
                <FieldLabel label={t('addCustomer.fields.note')} />
                <textarea
                  rows={3}
                  placeholder={t('addCustomer.fields.notePlaceholder')}
                  className="w-full resize-none rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-black/10 bg-surface-tab-bar px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[54px] w-[92px] items-center justify-center rounded-sm border border-border-subtle bg-white text-base font-semibold text-text-secondary transition-colors hover:bg-white"
          >
            {t('addCustomer.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-[54px] min-w-[255px] items-center justify-center gap-1.5 rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('addCustomer.save')}
            <img src={arrowIcon} alt="" className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )
}
