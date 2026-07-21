import { AuthLayout } from '../../components/auth/AuthLayout'
import { PaymentForm } from './PaymentForm'
import { PaymentHero } from './PaymentHero'
import { useLocation } from 'react-router-dom'

export function PaymentPage() {
  const location = useLocation()

  return (
    <AuthLayout
      backTo="/plans"
      backState={location.state}
      showLanguageSwitcher={false}
      hero={<PaymentHero />}
    >
      <PaymentForm />
    </AuthLayout>
  )
}
