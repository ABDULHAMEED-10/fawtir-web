import { useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Popover } from '../ui'
import { LOGIN_ROUTE } from '../../lib/identity/login'
import { dropLoginChallenge } from '../../lib/identity/loginChallenge'
import { signOut } from '../../lib/identity/logout'
import { USER_MENU } from '../../lib/shell'
import chevron from '../../assets/dashboard/chevron.svg'

/**
 * The card at the foot of a sidebar — whoever is signed in, and what they can do about it.
 *
 * Shared by both shells: the tenant app signs in a person at a business, the Fawtir console signs
 * in a Super Admin, and the menu is the same shape either way.
 */
export type UserMenuEntry = { id: string; labelKey: string; to: string }

export function UserMenu({
  name,
  roleKey,
  avatar,
  extraItems = [],
}: {
  name: string
  /** Null while there is nobody to describe yet; the line is left out rather than guessed. */
  roleKey: string | null
  avatar: string
  /** Entries only one shell offers, listed after the shared ones. */
  extraItems?: readonly UserMenuEntry[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)
  // A disabled look cannot stop a second click or Enter landing before the re-render; each would
  // be another revocation request.
  const inFlight = useRef(false)

  // Deliberately never aborted, not even when this menu unmounts (every page mounts its own
  // shell): the server may already be revoking the session, and a user who moved on must still
  // end up on Login rather than inside an app whose session is gone.
  const handleSignOut = async (event: MouseEvent<HTMLAnchorElement>) => {
    // The element stays the design's link to /login, but following it before the server confirms
    // would show a signed-out screen over a session that is still alive.
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setSigningOut(true)
    setSignOutFailed(false)
    let signedOut = false
    try {
      await signOut()
      signedOut = true
      dropLoginChallenge()
      // Replace: Back must not return to a page of the session that just ended.
      navigate(LOGIN_ROUTE, { replace: true })
    } catch {
      setSignOutFailed(true)
    } finally {
      inFlight.current = false
      // Left on after success: navigations commit as transitions, and resetting it would first
      // flash "Sign out" back as though nothing had happened.
      if (!signedOut) setSigningOut(false)
    }
  }

  const signOutLabel = signingOut
    ? t('shell.user.signingOut')
    : signOutFailed
      ? t('shell.user.signOutFailed')
      : t('shell.user.signOut')

  return (
    <>
      {/* Outside the popover so it exists before the failure is written into it, and so it is
          still heard when the menu is closed. Fuller than the item's label, which must stay one
          line: the popover is placed once, and a taller item would grow it over the trigger. */}
      <span role="status" className="sr-only">
        {signOutFailed ? t('shell.user.signOutFailedStatus') : ''}
      </span>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="mt-1 flex w-full items-center justify-between rounded-sm border border-black/[0.06] bg-[#292d32] p-[9px] text-start transition-colors hover:brightness-125"
      >
        <span className="flex min-w-0 items-center gap-[7px]">
          <img src={avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium leading-[1.2] text-white">
              {name}
            </span>
            {roleKey ? (
              <span className="block truncate text-xs font-medium leading-[1.2] text-white/70">
                {t(roleKey)}
              </span>
            ) : null}
          </span>
        </span>
        <img src={chevron} alt="" className="size-5 rotate-90 brightness-0 invert opacity-80" />
      </button>

      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)}>
        <ul role="menu" className="py-1">
          {[...USER_MENU, ...extraItems].map((entry) => (
            <li key={entry.id} role="none">
              <Link
                to={entry.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t(entry.labelKey)}
              </Link>
            </li>
          ))}
          <li role="none" className="mt-1 border-t border-border-subtle pt-1">
            <Link
              to={LOGIN_ROUTE}
              role="menuitem"
              aria-disabled={signingOut || undefined}
              onClick={handleSignOut}
              className="block px-4 py-2.5 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100"
            >
              {signOutLabel}
            </Link>
          </li>
        </ul>
      </Popover>
    </>
  )
}
