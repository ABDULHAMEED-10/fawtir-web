import { AuthLayout } from '../../components/auth/AuthLayout'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { AboutBusinessForm } from './AboutBusinessForm'

export function AboutBusinessPage() {
  return (
    // The first step: nothing before it can be missing, so any live session may open it.
    <OnboardingGate ready>
      {/* The code is spent and the account exists, so the code screen only sends the user
          straight back here. Back leaves the flow instead; every answer is saved on the server. */}
      <AuthLayout backTo="/" showLanguageSwitcher={false}>
        <AboutBusinessForm />
      </AuthLayout>
    </OnboardingGate>
  )
}
