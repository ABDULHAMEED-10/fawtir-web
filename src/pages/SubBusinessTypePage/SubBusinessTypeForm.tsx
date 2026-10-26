import { useState, type FormEvent } from 'react'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, Chip } from '../../components/ui'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import { BUSINESS_TYPE_NOT_AVAILABLE } from '../../api/catalog/businessTypes'
import { recordBusinessType } from '../../lib/identity/onboarding'
import { onboardingStateFrom, type OnboardingState } from '../../lib/onboarding'
import { findBusinessType, localName, useSignupBusinessTypes } from '../../lib/businessTypes'
import { SignupListState } from '../BusinessTypePage/SignupListState'

/**
 * Sign-up › Sub business type: the active sub types of the type saved on the step before, as the
 * server lists them (`GET /v1/auth/signup/business-types`).
 */
export function SubBusinessTypeForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const state = onboardingStateFrom(useLocation().state)
  const { read, retry } = useSignupBusinessTypes()
  const options =
    read.status === 'ready' ? (findBusinessType(read.data, state.businessType)?.subTypes ?? []) : []
  // Restores the saved sub type on Back; one from another type, or one since retired, never
  // matches this list, so the first option is offered instead.
  const [chosen, setChosen] = useState<string | undefined>(state.subBusinessType)
  const selected = options.some((option) => option.code === chosen) ? chosen : options[0]?.code
  const { save, submitting, formError, setFormError } = useOnboardingStep()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const result = await save((token, signal) => recordBusinessType(token, selected, signal))
    if (!result.saved) {
      if (result.conflict === BUSINESS_TYPE_NOT_AVAILABLE) retry()
      return
    }
    const next: OnboardingState = { ...state, subBusinessType: selected }
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

        {read.status !== 'ready' || options.length === 0 ? (
          <SignupListState
            read={read.status === 'ready' ? { ...read, data: options } : read}
            retry={retry}
          />
        ) : (
          <div className="flex flex-wrap content-start items-start gap-3">
            {options.map((option) => (
              <Chip
                key={option.code}
                label={localName(option, i18n.language)}
                selected={selected === option.code}
                onSelect={() => {
                  setChosen(option.code)
                  setFormError(null)
                }}
              />
            ))}
          </div>
        )}
      </div>

      <OnboardingFormError error={formError} />

      <Button type="submit" fullWidth disabled={submitting || !selected} className="gap-1.5">
        {t('subBusinessType.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
