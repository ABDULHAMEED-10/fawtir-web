import { AuthLayout } from '../../components/auth/AuthLayout'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { AboutBusinessForm } from './AboutBusinessForm'

export function AboutBusinessPage() {
  return (
    // The first step: nothing before it can be missing, so any live session may open it.
    <OnboardingGate ready>
      <AuthLayout backTo="/verify-code" showLanguageSwitcher={false}>
        <AboutBusinessForm />
      </AuthLayout>
    </OnboardingGate>
  )
}
