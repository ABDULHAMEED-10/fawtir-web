import { useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { VerifyCodeForm } from './VerifyCodeForm'

type VerifyLocationState = {
  from?: 'signup' | 'forgot-password'
}

export function VerifyCodePage() {
  const location = useLocation()
  const state = (location.state as VerifyLocationState | null) ?? {}
  const backTo = state.from === 'forgot-password' ? '/forgot-password' : '/signup'

  return (
    <AuthLayout backTo={backTo} showLanguageSwitcher={false}>
      <VerifyCodeForm />
    </AuthLayout>
  )
}
