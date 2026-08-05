import { useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { FawtaraStatusHero } from './FawtaraStatusHero'
import { FawtaraStatusPanel } from './FawtaraStatusPanel'

export function FawtaraStatusPage() {
  const location = useLocation()

  return (
    <AuthLayout
      backTo="/payment"
      backState={location.state}
      showLanguageSwitcher={false}
      hero={<FawtaraStatusHero />}
    >
      <FawtaraStatusPanel />
    </AuthLayout>
  )
}
