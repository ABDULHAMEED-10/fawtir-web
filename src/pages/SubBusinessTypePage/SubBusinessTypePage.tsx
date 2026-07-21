import { Navigate, useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import {
  shouldShowBusinessTypeScreen,
  type AboutBusinessAnswers,
} from '../../lib/onboarding'
import { isBusinessTypeId } from '../../lib/subBusinessTypes'
import { SubBusinessTypeForm } from './SubBusinessTypeForm'

type LocationState = AboutBusinessAnswers & {
  businessType?: string
}

export function SubBusinessTypePage() {
  const location = useLocation()
  const answers = (location.state as LocationState | null) ?? null

  const canShow =
    answers != null &&
    shouldShowBusinessTypeScreen(answers.businessSize, answers.invoicingMethod) &&
    isBusinessTypeId(answers.businessType)

  if (!canShow) {
    return <Navigate to="/business-type" replace />
  }

  return (
    <AuthLayout
      backTo="/business-type"
      backState={answers}
      showLanguageSwitcher={false}
    >
      <SubBusinessTypeForm />
    </AuthLayout>
  )
}
