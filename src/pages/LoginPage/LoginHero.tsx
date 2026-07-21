import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import loginHero from '../../assets/auth/login-hero.png'
import glowLeft from '../../assets/auth/glow-left.png'

export function LoginHero() {
  const { t } = useTranslation()

  return (
    <aside className="relative hidden h-full w-[596px] shrink-0 overflow-hidden bg-surface-inverse lg:block">
      <img
        src={glowLeft}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[25%] left-[-40%] z-0 h-auto w-[170%] max-w-none rotate-180 select-none opacity-80"
      />

      <div className="relative z-10 flex h-full min-h-0 flex-col px-8 py-6 xl:py-8">
        <Link
          to="/"
          className="w-fit shrink-0 bg-gradient-to-r from-[#265DF7] to-[#6EC8FF] bg-clip-text text-[42px] font-semibold tracking-[10px] text-transparent"
        >
          {t('brand.name')}
        </Link>

        <div className="mx-auto mt-8 flex min-h-0 w-full max-w-[530px] flex-1 flex-col items-center gap-6 xl:mt-12 xl:gap-10">
          <div className="flex w-full shrink-0 flex-col gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-neutral-25 xl:text-[40px]">
              {t('login.heroTitle')}
            </h1>
            <p className="text-base font-medium leading-[1.2] text-primary-75 opacity-80 xl:text-xl">
              {t('login.heroSubtitle')}
            </p>
          </div>

          <div className="flex min-h-0 w-full flex-1 items-end justify-center pb-2">
            <img
              src={loginHero}
              alt=""
              className="h-full max-h-[420px] w-full max-w-[453px] select-none object-contain object-bottom"
            />
          </div>
        </div>
      </div>
    </aside>
  )
}
