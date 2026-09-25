import type { ReactNode } from 'react'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { BackButton } from '../ui/BackButton'
import { LoginHero } from '../../pages/LoginPage/LoginHero'

type AuthLayoutProps = {
  children: ReactNode
  showLanguageSwitcher?: boolean
  backTo?: string
  backState?: unknown
  hero?: ReactNode
}

export function AuthLayout({
  children,
  showLanguageSwitcher = true,
  backTo,
  backState,
  hero,
}: AuthLayoutProps) {
  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-surface-background">
      {hero ?? <LoginHero />}

      <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-8 lg:px-12 lg:py-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -end-20 z-0 h-[200px] w-[290px] rounded-full bg-primary-75 blur-[80px]"
        />

        <div className="relative z-10 flex shrink-0 items-center justify-between gap-3">
          {backTo ? <BackButton to={backTo} state={backState} /> : <span />}
          {showLanguageSwitcher ? <LanguageSwitcher /> : <span />}
        </div>

        {/* Centred with auto margins, not justify-center: a form taller than the viewport would
            otherwise start above the scroll origin, its heading cut off where no scroll reaches. */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-4">
          <div className="my-auto flex w-full justify-center">{children}</div>
        </div>
      </section>
    </div>
  )
}
