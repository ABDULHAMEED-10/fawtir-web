import { AuthLayout } from '../../components/auth/AuthLayout'
import { SignupForm } from './SignupForm'

export function SignupPage() {
  return (
    <AuthLayout showHome>
      <SignupForm />
    </AuthLayout>
  )
}
