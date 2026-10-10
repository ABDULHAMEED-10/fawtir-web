import { AuthLayout } from '../../components/auth/AuthLayout'
import { ResumeSignupForm } from './ResumeSignupForm'

export function ResumeSignupPage() {
  return (
    <AuthLayout backTo="/login" showLanguageSwitcher={false}>
      <ResumeSignupForm />
    </AuthLayout>
  )
}
