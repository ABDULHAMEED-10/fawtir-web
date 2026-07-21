import { Navigate, useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import {
  shouldShowBusinessTypeScreen,
  type AboutBusinessAnswers,
} from '../../lib/onboarding'
import { BusinessTypeForm } from './BusinessTypeForm'

export function BusinessTypePage() {
  const location = useLocation()
  const answers = (location.state as AboutBusinessAnswers | null) ?? null

  const canShow =
    answers != null &&
    shouldShowBusinessTypeScreen(answers.businessSize, answers.invoicingMethod)

  if (!canShow) {
    return <Navigate to="/about-business" replace />
  }

  return (
    <AuthLayout backTo="/about-business" showLanguageSwitcher={false}>
      <BusinessTypeForm />
    </AuthLayout>
  )
}
