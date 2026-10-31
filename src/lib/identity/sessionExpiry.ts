import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SESSION_EXPIRED_EVENT } from '../../api/sessionExpiry'
import { forgetEntitlements } from './entitlements'
import { LOGIN_ROUTE } from './login'

/** For the signed-in shells: on a reported expiry, forget who was signed in and go to sign-in. */
export function useSessionExpiryRedirect(): void {
  const navigate = useNavigate()
  useEffect(() => {
    const onExpired = () => {
      forgetEntitlements()
      navigate(LOGIN_ROUTE, { replace: true })
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [navigate])
}
