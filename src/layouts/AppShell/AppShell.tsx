import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-dvh overflow-hidden bg-surface-background">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -start-[10%] z-0 h-[280px] w-[420px] rounded-full bg-primary-100/70 blur-[90px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -end-[8%] z-0 h-[260px] w-[400px] rounded-full bg-primary-75/80 blur-[90px]"
        />
        <Topbar />
        <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-3 lg:px-4 lg:pb-6">
          {children}
        </main>
      </div>
    </div>
  )
}
