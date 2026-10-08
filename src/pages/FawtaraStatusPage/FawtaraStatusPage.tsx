import { AuthLayout } from '../../components/auth/AuthLayout'
import type { GoingLivePhase } from '../../lib/fawtaraStatus'
import { FawtaraStatusHero } from './FawtaraStatusHero'
import { FawtaraStatusPanel } from './FawtaraStatusPanel'

/**
 * The same "getting you live" screen, for a signed-in account that is approved but not yet
 * connected to Fawtara.
 *
 * TODO(backend): nothing reports the Fawtara authorisation yet, so the screen assumes the account
 * is waiting on it, and sign-in does not route here; once a signed-in read reports it, sign-in
 * should land here until the account is connected, then on the dashboard. The email to name is
 * not in the session either. ONBOARDING.md rows 1.7 and 1.8.
 */
const PHASE: GoingLivePhase = 'fawtara'

export function FawtaraStatusPage() {
  return (
    <AuthLayout
      backTo="/dashboard"
      showLanguageSwitcher={false}
      align="start"
      hero={<FawtaraStatusHero />}
    >
      <FawtaraStatusPanel phase={PHASE} />
    </AuthLayout>
  )
}
