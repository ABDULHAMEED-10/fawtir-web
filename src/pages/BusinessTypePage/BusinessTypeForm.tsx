import { useState, type FormEvent } from 'react'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BusinessTypeChip, Button, ChevronRightIcon } from '../../components/ui'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import { BUSINESS_TYPE_NOT_AVAILABLE } from '../../api/catalog/businessTypes'
import { recordBusinessCategory } from '../../lib/identity/onboarding'
import { onboardingStateFrom, type OnboardingState } from '../../lib/onboarding'
import { businessTypeIcon, localName, useSignupBusinessTypes } from '../../lib/businessTypes'
import { SignupListState } from './SignupListState'

/**
 * Sign-up › Business type. The types are the ones the console has opened for sign-up
 * (`GET /v1/auth/signup/business-types`), in its order; nothing else is offered.
 */
export function BusinessTypeForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const state = onboardingStateFrom(useLocation().state)
  const { read, retry } = useSignupBusinessTypes()
  const types = read.status === 'ready' ? read.data : []
  const [chosen, setChosen] = useState<string | undefined>(state.businessType)
  // A saved type the console has since closed is not on the list: the first one is offered instead.
  const selected = types.some((type) => type.code === chosen) ? chosen : types[0]?.code
  const { save, submitting, formError, setFormError } = useOnboardingStep()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const result = await save((token, signal) => recordBusinessCategory(token, selected, signal))
    if (!result.saved) {
      if (result.conflict === BUSINESS_TYPE_NOT_AVAILABLE) retry()
      return
    }
    // A different type invalidates the sub type chosen under the old one; the backend clears it
    // in the same statement, so the form must not carry it forward either.
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

        {read.status !== 'ready' || types.length === 0 ? (
          <SignupListState read={read} retry={retry} />
        ) : (
          <div className="flex flex-wrap content-start items-start gap-3">
            {types.map((type) => (
              <BusinessTypeChip
                key={type.code}
                label={localName(type, i18n.language)}
                iconSrc={businessTypeIcon(type)}
                selected={selected === type.code}
                onSelect={() => {
                  setChosen(type.code)
                  setFormError(null)
                }}
              />
            ))}
          </div>
        )}
      </div>

      <OnboardingFormError error={formError} />

      <Button type="submit" fullWidth disabled={submitting || !selected} className="gap-1.5">
        {t('businessType.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
