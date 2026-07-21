import { AuthLayout } from '../../components/auth/AuthLayout'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export function ForgotPasswordPage() {
  return (
    <AuthLayout backTo="/login" showLanguageSwitcher={false}>
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
