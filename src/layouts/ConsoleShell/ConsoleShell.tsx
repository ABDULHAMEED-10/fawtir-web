import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Topbar } from '../AppShell/Topbar'
import { forgetEntitlements, hasPermission, isPlatformOperator } from '../../lib/identity/entitlements'
import { LOGIN_ROUTE } from '../../lib/identity/login'
import { ConsoleAccessRefreshContext } from './consoleAccessRefresh'
import { ConsoleNotice, ConsoleReadFailure } from './ConsoleNotice'
import { ConsoleSidebar } from './ConsoleSidebar'
import { useConsoleAccess, type ConsoleAccess } from './useConsoleAccess'
import { CONSOLE_PAGE } from './consoleStyle'

/** One permission, or several that must all be held. */
type Requirement = string | readonly string[]

type ConsoleShellProps = {
  children: ReactNode
  /**
   * The permissions the screen's endpoints demand. Checked here only to say "no access" instead
   * of rendering a screen whose every request would be refused; the backend still decides.
   */
  requires?: Requirement
}

/**
 * The frame the Fawtir console sits in (Figma 143:17005).
 *
 * The same shape as the tenant shell — a 248px sidebar that becomes a drawer below `lg` — with
 * the console's own navigation and no Create Invoice, since nobody invoices from in here. The
 * topbar itself is shared, so search, notifications and the language switcher behave identically.
 *
 * It also decides whether the reader may be here at all: the console is for Fawtir operators, so a
 * screen renders only for someone holding a `platform.*` permission, and `requires` if given.
 */
export function ConsoleShell({ children, requires }: ConsoleShellProps) {
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()
  const { access, retry } = useConsoleAccess()
  const refreshAccess = useCallback(() => {
    forgetEntitlements()
    retry()
  }, [retry])

  useEffect(() => setNavOpen(false), [pathname])

  if (access.state === 'signedOut') return <Navigate to={LOGIN_ROUTE} replace />

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-background">
      <ConsoleSidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        userName={access.state === 'ready' ? access.entitlements.username : ''}
        entitlements={access.state === 'ready' ? access.entitlements : null}
      />

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
        <Topbar onOpenNav={() => setNavOpen(true)} showCreateInvoice={false} notes="console" />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3 lg:px-4 lg:pb-6">
          <ConsoleAccessRefreshContext.Provider value={refreshAccess}>
            <AccessGate access={access} retry={retry} requires={requires}>
              {children}
            </AccessGate>
          </ConsoleAccessRefreshContext.Provider>
        </main>
      </div>
    </div>
  )
}

function AccessGate({
  access,
  retry,
  requires,
  children,
}: {
  access: Exclude<ConsoleAccess, { state: 'signedOut' }>
  retry: () => void
  requires?: Requirement
  children: ReactNode
}) {
  const { t } = useTranslation()
  const required: readonly string[] = requires === undefined ? [] : typeof requires === 'string' ? [requires] : requires

  let notice: ReactNode
  if (access.state === 'checking') {
    notice = <ConsoleNotice busy body={t('console.access.checking')} />
  } else if (access.state === 'failed') {
    notice = <ConsoleReadFailure error={access.error} retry={retry} />
  } else if (!isPlatformOperator(access.entitlements)) {
    notice = <ConsoleNotice badge={t('console.access.noAccess')} body={t('console.access.notOperator')} />
  } else if (required.some((code) => !hasPermission(access.entitlements, code))) {
    notice = (
      <ConsoleNotice
        badge={t('console.access.noAccess')}
        body={t('console.access.missingPermission')}
        action={{ label: t('console.soon.back'), to: '/console' }}
      />
    )
  } else {
    return children
  }

  return <div className={CONSOLE_PAGE}>{notice}</div>
}
