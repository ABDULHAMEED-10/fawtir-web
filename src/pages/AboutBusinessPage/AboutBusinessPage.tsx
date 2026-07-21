import { AuthLayout } from '../../components/auth/AuthLayout'
import { AboutBusinessForm } from './AboutBusinessForm'

export function AboutBusinessPage() {
  return (
    <AuthLayout backTo="/verify-code" showLanguageSwitcher={false}>
      <AboutBusinessForm />
    </AuthLayout>
  )
}
