import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, Chip } from '../../components/ui'
import type { AboutBusinessAnswers } from '../../lib/onboarding'
import {
  isBusinessTypeId,
  SUB_TYPES_BY_BUSINESS,
  type BusinessTypeId,
} from '../../lib/subBusinessTypes'

type LocationState = AboutBusinessAnswers & {
  businessType?: string
}

export function SubBusinessTypeForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const answers = (location.state as LocationState | null) ?? null
  const businessType: BusinessTypeId = isBusinessTypeId(answers?.businessType)
    ? answers.businessType
    : 'food-beverage'

  const options = SUB_TYPES_BY_BUSINESS[businessType]
  const [selected, setSelected] = useState(options[0]?.id ?? '')

  useEffect(() => {
    setSelected(options[0]?.id ?? '')
  }, [businessType, options])

  const selectedOption = useMemo(
    () => options.find((option) => option.id === selected) ?? options[0],
    [options, selected],
  )

  const groups = useMemo(() => {
    if (!selectedOption) return []
    const translated = t(`subBusinessType.groups.${selectedOption.groupsKey}`, {
      returnObjects: true,
    })
    return Array.isArray(translated) ? (translated as string[]) : []
  }, [selectedOption, t])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/business-identity', {
      state: {
        ...answers,
        businessType,
        subBusinessType: selected,
      },
    })
  }

  if (!selectedOption) return null

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('subBusinessType.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {t('subBusinessType.description')}
          </p>
        </div>

        <div className="flex flex-wrap content-start items-start gap-3">
          {options.map((option) => (
            <Chip
              key={option.id}
              label={t(option.labelKey)}
              selected={selected === option.id}
              onSelect={() => setSelected(option.id)}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col">
            <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
              {t('subBusinessType.youllStartWith')}
            </p>
            <p className="text-2xl font-medium leading-[1.2] text-text-primary">
              {t(selectedOption.labelKey)}
            </p>
            <p className="text-sm font-medium leading-[1.2] text-text-secondary">
              {t('subBusinessType.preBuiltGroups')}
            </p>
          </div>

          <div className="flex flex-wrap content-start items-start gap-[9px]">
            {groups.map((group) => (
              <Chip key={group} label={group} interactive={false} />
            ))}
          </div>
        </div>
      </div>

      <Button type="submit" fullWidth className="gap-1.5">
        {t('subBusinessType.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
