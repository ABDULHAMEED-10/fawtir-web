import { useState, type FormEvent } from 'react'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BusinessTypeChip, Button, ChevronRightIcon } from '../../components/ui'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import { backendCategoryFor, recordBusinessCategory } from '../../lib/identity/onboarding'
import { CATEGORY_LABEL_KEYS, onboardingStateFrom, type OnboardingState } from '../../lib/onboarding'
import type { BusinessTypeId } from '../../lib/subBusinessTypes'
import foodBeverageIcon from '../../assets/business-types/food-beverage.svg'
import automotiveIcon from '../../assets/business-types/automotive.svg'
import retailIcon from '../../assets/business-types/retail.svg'
import beautyWellnessIcon from '../../assets/business-types/beauty-wellness.svg'
import healthcareIcon from '../../assets/business-types/healthcare.svg'
import hospitalityIcon from '../../assets/business-types/hospitality.svg'
import educationIcon from '../../assets/business-types/education.svg'
import professionalIcon from '../../assets/business-types/professional.svg'

const OPTIONS: Array<{ id: BusinessTypeId; icon: string }> = [
  { id: 'food-beverage', icon: foodBeverageIcon },
  { id: 'automotive', icon: automotiveIcon },
  { id: 'retail', icon: retailIcon },
  { id: 'beauty-wellness', icon: beautyWellnessIcon },
  { id: 'healthcare', icon: healthcareIcon },
  { id: 'hospitality', icon: hospitalityIcon },
  { id: 'education', icon: educationIcon },
  { id: 'professional', icon: professionalIcon },
]

export function BusinessTypeForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const state = onboardingStateFrom(useLocation().state)
  const [selected, setSelected] = useState<BusinessTypeId>(state.businessType ?? 'food-beverage')
  const { save, submitting, formError, setFormError } = useOnboardingStep()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const category = backendCategoryFor(selected)
    if (!category) {
      setFormError({ key: 'businessType.unavailable' })
      return
    }
    const result = await save((token, signal) => recordBusinessCategory(token, category, signal))
    if (!result.saved) return
    // A different category invalidates the trade chosen under the old one; the backend clears
    // it in the same statement, so the form must not carry it forward either.
    const { subBusinessType, ...rest } = state
    const next: OnboardingState = {
      ...rest,
      businessType: selected,
      ...(state.businessType === selected ? { subBusinessType } : {}),
    }
    navigate('/sub-business-type', { state: next })
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('businessType.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {t('businessType.description')}
          </p>
        </div>

        <div className="flex flex-wrap content-start items-start gap-3">
          {OPTIONS.map((option) => (
            <BusinessTypeChip
              key={option.id}
              label={t(CATEGORY_LABEL_KEYS[option.id])}
              iconSrc={option.icon}
              selected={selected === option.id}
              onSelect={() => {
                setSelected(option.id)
                setFormError(null)
              }}
            />
          ))}
        </div>
      </div>

      <OnboardingFormError error={formError} />

      <Button type="submit" fullWidth disabled={submitting} className="gap-1.5">
        {t('businessType.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
