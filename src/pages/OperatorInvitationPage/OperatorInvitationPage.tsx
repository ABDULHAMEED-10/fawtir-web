import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { LOGIN_ROUTE } from '../../lib/identity/login'
import { tokenFromFragment } from '../../lib/identity/operatorInvitation'
import { OperatorInvitationForm } from './OperatorInvitationForm'

/**
 * Where an operator invitation mail lands (`/operator-invitation#token=…`). Public: the invitee
 * has no account yet.
 *
 * The token is read from the fragment once and the fragment is then removed, so it does not
 * linger in the address bar, the history entry or a copied URL. It is never stored: reloading
 * the page after that point means opening the link from the mail again.
 */
export function OperatorInvitationPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => tokenFromFragment(location.hash))
  const [spent, setSpent] = useState(false)

  useEffect(() => {
    if (location.hash) navigate({ pathname: location.pathname, search: location.search }, { replace: true })
  }, [location.hash, location.pathname, location.search, navigate])

  let content
  if (!token || spent) {
    content = (
      <div className="flex w-full max-w-[400px] flex-col gap-6" role="alert">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t(spent ? 'operatorInvitation.spent.title' : 'operatorInvitation.missing.title')}
          </h2>
          <p className="text-base font-medium leading-[1.4] text-text-quaternary">
            {t(spent ? 'operatorInvitation.spent.body' : 'operatorInvitation.missing.body')}
          </p>
        </div>
        <Link to={LOGIN_ROUTE} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          {t('operatorInvitation.toSignIn')}
        </Link>
      </div>
    )
  } else {
    content = <OperatorInvitationForm token={token} onLinkSpent={() => setSpent(true)} />
  }

  return <AuthLayout>{content}</AuthLayout>
}
