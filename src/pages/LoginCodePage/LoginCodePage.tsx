import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { LOGIN_ROUTE } from '../../lib/identity/login'
import { readLoginChallenge } from '../../lib/identity/loginChallenge'
import { LoginCodeForm } from './LoginCodeForm'

/**
 * The second step of every sign-in: the backend never issues a session for a password alone.
 * Read once per visit so the form keeps its challenge while it drops it on the way out.
 */
export function LoginCodePage() {
  const [challenge] = useState(() => readLoginChallenge())

  // Opened directly, reloaded, or after the challenge lapsed: the password step has to run again.
  if (!challenge) return <Navigate to={LOGIN_ROUTE} replace />

  return (
    <AuthLayout backTo={LOGIN_ROUTE} showLanguageSwitcher={false}>
      <LoginCodeForm challenge={challenge} />
    </AuthLayout>
  )
}
