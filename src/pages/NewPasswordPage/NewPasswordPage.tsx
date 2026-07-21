import { AuthLayout } from '../../components/auth/AuthLayout'
import { NewPasswordForm } from './NewPasswordForm'

export function NewPasswordPage() {
  return (
    <AuthLayout backTo="/verify-code" showLanguageSwitcher={false}>
      <NewPasswordForm />
    </AuthLayout>
  )
}
