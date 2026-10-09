import { useState, type FormEvent } from 'react'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, Chip } from '../../components/ui'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import { backendTypeFor, recordBusinessType, registrableCategory } from '../../lib/identity/onboarding'
import { onboardingStateFrom, type OnboardingState } from '../../lib/onboarding'
import { SUB_TYPES_BY_BUSINESS } from '../../lib/subBusinessTypes'

export function SubBusinessTypeForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const state = onboardingStateFrom(useLocation().state)
  const category = registrableCategory(state.businessType)
  const options = SUB_TYPES_BY_BUSINESS[category]
  // Restores the saved trade on Back; a trade from another category never matches this list,
  // so a stale one falls back to the first option instead of surviving the change.
  const [selected, setSelected] = useState(
    options.some((option) => option.id === state.subBusinessType)
      ? (state.subBusinessType as string)
      : options[0].id,
  )
  const { save, submitting, formError, setFormError } = useOnboardingStep()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const businessType = backendTypeFor(selected)
    if (!businessType) {
      setFormError({ key: 'businessType.unavailable' })
      return
    }
    const result = await save((token, signal) => recordBusinessType(token, businessType, signal))
    if (!result.saved) return
    const next: OnboardingState = { ...state, businessType: category, subBusinessType: selected }
    navigate('/business-identity', { state: next })
  }

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
        {t('subBusinessType.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
