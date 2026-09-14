import { useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BuildingIcon,
  Button,
  ChevronRightIcon,
  InvoiceIcon,
  SelectionCard,
  SoftwareIcon,
  SpreadsheetIcon,
  UserIcon,
  UsersIcon,
} from '../../components/ui'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import { recordBusinessProfile } from '../../lib/identity/onboarding'
import {
  BUSINESS_SIZE_LABEL_KEYS,
  INVOICING_METHOD_LABEL_KEYS,
  onboardingStateFrom,
  type BusinessSize,
  type InvoicingMethod,
  type OnboardingState,
} from '../../lib/onboarding'

export function AboutBusinessForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const state = onboardingStateFrom(useLocation().state)
  const [businessSize, setBusinessSize] = useState<BusinessSize>(state.businessSize ?? 'just-me')
  const [invoicingMethod, setInvoicingMethod] = useState<InvoicingMethod>(
    state.invoicingMethod ?? 'paper',
  )
  const { save, submitting, formError } = useOnboardingStep()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = await save((token, signal) =>
      recordBusinessProfile(token, businessSize, invoicingMethod, signal),
    )
    if (!result.saved) return
    const next: OnboardingState = { ...state, businessSize, invoicingMethod }
    navigate('/business-type', { state: next })
  }

  const sizeOptions: Array<{
    value: BusinessSize
    title: string
    description: string
    icon: ReactNode
  }> = [
    {
      value: 'just-me',
      title: t(BUSINESS_SIZE_LABEL_KEYS['just-me']),
      description: t('aboutBusiness.size.justMeDesc'),
      icon: <UserIcon size={24} />,
    },
    {
      value: '2-10',
      title: t(BUSINESS_SIZE_LABEL_KEYS['2-10']),
      description: t('aboutBusiness.size.twoToTenDesc'),
      icon: <UserIcon size={24} />,
    },
    {
      value: '11-50',
      title: t(BUSINESS_SIZE_LABEL_KEYS['11-50']),
      description: t('aboutBusiness.size.elevenToFiftyDesc'),
      icon: <UsersIcon size={24} />,
    },
    {
      value: '50-plus',
      title: t(BUSINESS_SIZE_LABEL_KEYS['50-plus']),
      description: t('aboutBusiness.size.fiftyPlusDesc'),
      icon: <BuildingIcon size={24} />,
    },
  ]

  const invoicingOptions: Array<{
    value: InvoicingMethod
    title: string
    description: string
    icon: ReactNode
  }> = [
    {
      value: 'paper',
      title: t(INVOICING_METHOD_LABEL_KEYS.paper),
      description: t('aboutBusiness.invoicing.paperDesc'),
      icon: <InvoiceIcon size={24} />,
    },
    {
      value: 'spreadsheets',
      title: t(INVOICING_METHOD_LABEL_KEYS.spreadsheets),
      description: t('aboutBusiness.invoicing.spreadsheetsDesc'),
      icon: <SpreadsheetIcon size={24} />,
    },
    {
      value: 'accounting',
      title: t(INVOICING_METHOD_LABEL_KEYS.accounting),
      description: t('aboutBusiness.invoicing.accountingDesc'),
      icon: <SoftwareIcon size={24} />,
    },
    {
      value: 'erp',
      title: t(INVOICING_METHOD_LABEL_KEYS.erp),
      description: t('aboutBusiness.invoicing.erpDesc'),
      icon: <BuildingIcon size={24} />,
    },
  ]

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-[700px] flex-col items-center gap-11"
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('aboutBusiness.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {t('aboutBusiness.description')}
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-xl font-medium leading-[1.2] text-text-primary">
              {t('aboutBusiness.sizeTitle')}
            </h3>
            <p className="text-base font-medium leading-[1.2] text-text-quaternary">
              {t('aboutBusiness.sizeSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {sizeOptions.map((option) => (
              <SelectionCard
                key={option.value}
                title={option.title}
                description={option.description}
                icon={option.icon}
                selected={businessSize === option.value}
                onSelect={() => setBusinessSize(option.value)}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-xl font-medium leading-[1.2] text-text-primary">
              {t('aboutBusiness.invoicingTitle')}
            </h3>
            <p className="text-base font-medium leading-[1.2] text-text-quaternary">
              {t('aboutBusiness.invoicingSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {invoicingOptions.map((option) => (
              <SelectionCard
                key={option.value}
                title={option.title}
                description={option.description}
                icon={option.icon}
                selected={invoicingMethod === option.value}
                onSelect={() => setInvoicingMethod(option.value)}
              />
            ))}
          </div>
        </section>
      </div>

      {formError ? (
        <p className="text-xs font-medium text-text-danger" role="alert">
          {t(formError.key, formError.values)}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting} className="w-full max-w-[400px] gap-1.5">
        {t('aboutBusiness.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
