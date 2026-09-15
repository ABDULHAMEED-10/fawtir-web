import { AuthLayout } from '../../components/auth/AuthLayout'
import { NewPasswordForm } from './NewPasswordForm'

export function NewPasswordPage() {
  return (
    <AuthLayout backTo="/login" showLanguageSwitcher={false}>
      <NewPasswordForm />
    </AuthLayout>
  )
}
