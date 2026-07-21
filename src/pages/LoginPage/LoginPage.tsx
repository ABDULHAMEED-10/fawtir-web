import { AuthLayout } from '../../components/auth/AuthLayout'
import { LoginForm } from './LoginForm'

export function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  )
}
