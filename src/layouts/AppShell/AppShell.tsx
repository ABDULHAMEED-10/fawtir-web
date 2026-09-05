import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

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
 */
export function AppShell({ children }: AppShellProps) {
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
