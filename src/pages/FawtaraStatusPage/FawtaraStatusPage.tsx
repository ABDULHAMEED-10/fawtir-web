import { AuthLayout } from '../../components/auth/AuthLayout'
import type { GoingLivePhase } from '../../lib/fawtaraStatus'
import { FawtaraStatusHero } from './FawtaraStatusHero'
import { FawtaraStatusPanel } from './FawtaraStatusPanel'

/**
 * The same "getting you live" screen, for a signed-in account that is approved but not yet
 * connected through Fawtara.
 *
 * TODO(backend): nothing reports the portal connection yet (requested, accepted, registered on
 * the SMP, declined, expired), so the screen assumes the request still has to be sent, and
 * sign-in does not route here; once a signed-in read reports it, sign-in should land here until
 * the account is connected, then on the dashboard. The email to name is not in the session
 * either. ONBOARDING.md rows 1.8 and 1.9.
 */
const PHASE: GoingLivePhase = 'request'

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
