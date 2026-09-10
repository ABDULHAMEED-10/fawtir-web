import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Topbar } from '../AppShell/Topbar'
import { ConsoleSidebar } from './ConsoleSidebar'

/**
 * The frame the Fawtir console sits in (Figma 143:17005).
 *
 * The same shape as the tenant shell — a 248px sidebar that becomes a drawer below `lg` — with
 * the console's own navigation and no Create Invoice, since nobody invoices from in here. The
 * topbar itself is shared, so search, notifications and the language switcher behave identically.
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => setNavOpen(false), [pathname])

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-background">
      <ConsoleSidebar open={navOpen} onClose={() => setNavOpen(false)} />

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
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3 lg:px-4 lg:pb-6">{children}</main>
      </div>
    </div>
  )
}
