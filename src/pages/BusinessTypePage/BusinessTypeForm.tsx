import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BusinessTypeChip, Button, ChevronRightIcon } from '../../components/ui'
import type { AboutBusinessAnswers } from '../../lib/onboarding'
import foodBeverageIcon from '../../assets/business-types/food-beverage.svg'
import automotiveIcon from '../../assets/business-types/automotive.svg'
import retailIcon from '../../assets/business-types/retail.svg'
import beautyWellnessIcon from '../../assets/business-types/beauty-wellness.svg'
import healthcareIcon from '../../assets/business-types/healthcare.svg'
import hospitalityIcon from '../../assets/business-types/hospitality.svg'
import educationIcon from '../../assets/business-types/education.svg'
import professionalIcon from '../../assets/business-types/professional.svg'

type BusinessTypeId =
  | 'food-beverage'
  | 'automotive'
  | 'retail'
  | 'beauty-wellness'
  | 'healthcare'
  | 'hospitality'
  | 'education'
  | 'professional'

const OPTIONS: Array<{ id: BusinessTypeId; labelKey: string; icon: string }> = [
  { id: 'food-beverage', labelKey: 'businessType.options.foodBeverage', icon: foodBeverageIcon },
  { id: 'automotive', labelKey: 'businessType.options.automotive', icon: automotiveIcon },
  { id: 'retail', labelKey: 'businessType.options.retail', icon: retailIcon },
  { id: 'beauty-wellness', labelKey: 'businessType.options.beautyWellness', icon: beautyWellnessIcon },
  { id: 'healthcare', labelKey: 'businessType.options.healthcare', icon: healthcareIcon },
  { id: 'hospitality', labelKey: 'businessType.options.hospitality', icon: hospitalityIcon },
  { id: 'education', labelKey: 'businessType.options.education', icon: educationIcon },
  { id: 'professional', labelKey: 'businessType.options.professional', icon: professionalIcon },
]

export function BusinessTypeForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const answers = (location.state as AboutBusinessAnswers | null) ?? null
  const [selected, setSelected] = useState<BusinessTypeId>('food-beverage')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/sub-business-type', {
      state: {
        ...answers,
        businessType: selected,
      },
    })
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
              label={t(option.labelKey)}
              iconSrc={option.icon}
              selected={selected === option.id}
              onSelect={() => setSelected(option.id)}
            />
          ))}
        </div>
      </div>

      <Button type="submit" fullWidth className="gap-1.5">
        {t('businessType.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
