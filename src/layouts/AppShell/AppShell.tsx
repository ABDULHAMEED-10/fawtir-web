import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
// Who is signed in is asked the same way the console asks it: once per session, 401 meaning
// "sign in" rather than an error. The hook lives with the console only because it came first.
import { useConsoleAccess, type ConsoleAccess } from '../ConsoleShell/useConsoleAccess'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { LOGIN_ROUTE } from '../../lib/identity/login'
import { REQUIRE_SESSION, SessionContext } from '../../lib/session/session'
import { useApiRead } from '../../hooks'
import { REFERENCE_DATA_PATH, loadReferenceData, type ReferenceDataDto } from '../../api/reference/referenceData'
import { ReferenceDataContext, useReferenceData } from '../../lib/reference/referenceData'

type AppShellProps = {
  children: ReactNode
}

/**
 * The frame every signed-in screen sits in.
 *
 * From `lg` up this is what it has always been: a 248px sidebar beside the page. Below that the
 * sidebar would take two thirds of a phone, so it slides in over the page instead and the topbar
 * grows a button to call it. Nothing about the wide layout changes — the drawer behaviour is
 * written entirely in `max-lg:` variants, which do not exist at desktop widths.
 *
 * It also decides whether anyone may be here: without a session the reader goes to sign in, and
 * with one, who they are and what they may do is handed to every screen through `SessionContext`.
 * `REQUIRE_SESSION` turns that off for the prototype build, which cannot reach the API.
 */
export function AppShell({ children }: AppShellProps) {
  return REQUIRE_SESSION ? <GuardedShell>{children}</GuardedShell> : <Frame>{children}</Frame>
}

function GuardedShell({ children }: AppShellProps) {
  const { access, retry } = useConsoleAccess()
  // Fetched beside the session rather than by each form that needs a dropdown: it is the same
  // small, rarely-changing payload for every screen, and the shell already waits here, so this
  // costs one parallel request instead of a loading branch in ten components.
  const reference = useApiRead<ReferenceDataDto>(REFERENCE_DATA_PATH, loadReferenceData)
  // Fall through to an enclosing provider while this request is in flight, rather than shadowing
  // it with null: a nested provider always wins, so publishing null here would blank out a value
  // a caller further out had already supplied.
  const enclosing = useReferenceData()
  if (access.state === 'signedOut') return <Navigate to={LOGIN_ROUTE} replace />
  return (
    <SessionContext.Provider value={access.state === 'ready' ? access.entitlements : null}>
      <ReferenceDataContext.Provider
        value={reference.read.status === 'ready' ? reference.read.data : enclosing}
      >
        <Frame>
          <AccessGate access={access} retry={retry}>
            {children}
          </AccessGate>
        </Frame>
      </ReferenceDataContext.Provider>
    </SessionContext.Provider>
  )
}

function AccessGate({
  access,
  retry,
  children,
}: {
  access: Exclude<ConsoleAccess, { state: 'signedOut' }>
  retry: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  if (access.state === 'ready') return children
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {access.state === 'checking' ? (
        <LoadingNotice label={t('appAccess.checking')} />
      ) : (
        <ApiReadFailure error={access.error} retry={retry} />
      )}
    </div>
  )
}

function Frame({ children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()

  // Going somewhere closes the drawer. Today each page mounts its own shell so this happens by
  // itself, but leaning on that would make the drawer stick the day the shell is hoisted.
  useEffect(() => setNavOpen(false), [pathname])

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-background">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      {navOpen ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3 lg:px-4 lg:pb-6">{children}</main>
      </div>
    </div>
  )
}
