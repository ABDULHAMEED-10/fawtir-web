import type { ReactNode } from 'react'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { BackButton } from '../ui/BackButton'
import { HomeButton } from '../ui/HomeButton'
import { LoginHero } from '../../pages/LoginPage/LoginHero'

type AuthLayoutProps = {
  children: ReactNode
  showLanguageSwitcher?: boolean
  backTo?: string
  backState?: unknown
  /** A house at the top start that leads to the public site, for pages with no Back (owner, 22 Oct). */
  showHome?: boolean
  hero?: ReactNode
  /**
   * `start` sits the content at the top, its start edge in line with Back (the Fawtara status
   * frame); forms keep the default centring.
   */
  align?: 'center' | 'start'
}

export function AuthLayout({
  children,
  showLanguageSwitcher = true,
  backTo,
  backState,
  showHome = false,
  hero,
  align = 'center',
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
          {backTo ? (
            <BackButton to={backTo} state={backState} />
          ) : showHome ? (
            <HomeButton />
          ) : (
            <span />
          )}
          {showLanguageSwitcher ? <LanguageSwitcher /> : <span />}
        </div>

        {/* Centred with auto margins, not justify-center: a form taller than the viewport would
            otherwise start above the scroll origin, its heading cut off where no scroll reaches. */}
        {align === 'start' ? (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto pb-4 pt-8 lg:pt-12">
            <div className="flex w-full justify-start">{children}</div>
          </div>
        ) : (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-4">
            <div className="my-auto flex w-full justify-center">{children}</div>
          </div>
        )}
      </section>
    </div>
  )
}
