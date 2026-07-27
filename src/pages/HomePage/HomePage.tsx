import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '../../components/BrandLogo'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { Button } from '../../components/ui'
import homeHero from '../../assets/home/home-hero.png'
import './HomePage.css'

export function HomePage() {
  const { t } = useTranslation()

  return (
    <div className="home-hero relative min-h-screen overflow-hidden bg-[#f7f8fc] text-text-primary">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_12%_0%,rgba(44,78,183,0.12),transparent_42%),radial-gradient(ellipse_at_88%_18%,rgba(96,167,219,0.14),transparent_45%),linear-gradient(180deg,#ffffff_0%,#f4f6fb_48%,#eef1f8_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[42%] bg-[linear-gradient(180deg,transparent,rgba(44,78,183,0.06))]"
      />

      <header className="relative z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-5 sm:px-6 lg:px-8">
          <LanguageSwitcher />
          <Link to="/signup" className="hidden sm:block">
            <Button size="md" variant="ghost">
              {t('home.signup')}
            </Button>
          </Link>
          <Link to="/login">
            <Button size="md" variant="secondary">
              {t('home.login')}
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5.5rem)] max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
        <div className="grid flex-1 grid-cols-1 items-center gap-10 py-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12 lg:py-10">
          <div className="home-hero__copy flex flex-col justify-center pt-4 lg:pt-0">
            <div className="home-hero__brand mb-8 sm:mb-10">
              <BrandLogo tone="onLight" size="lg" to="/" />
            </div>

            <p className="home-hero__stage mb-4 text-sm font-semibold tracking-[0.08em] text-text-brand uppercase">
              {t('home.stage')}
            </p>

            <h1 className="home-hero__title max-w-xl text-[2.25rem] font-semibold leading-[1.15] text-text-primary sm:text-5xl lg:text-[3.25rem]">
              {t('home.heroTitle')}
            </h1>

            <p className="home-hero__subtitle mt-5 max-w-lg text-base font-medium leading-relaxed text-text-tertiary sm:text-lg">
              {t('home.heroSubtitle')}
            </p>

            <div className="home-hero__cta mt-9 flex flex-wrap items-center gap-3">
              <Link to="/dashboard">
                <Button size="lg" className="min-w-[160px] shadow-[0_14px_34px_rgba(44,78,183,0.28)]">
                  {t('home.dashboard')}
                </Button>
              </Link>
              <Link to="/signup" className="sm:hidden">
                <Button size="lg" variant="secondary">
                  {t('home.signup')}
                </Button>
              </Link>
            </div>
          </div>

          <div className="home-hero__visual relative flex min-h-[260px] items-center justify-center lg:min-h-[480px]">
            <div
              aria-hidden="true"
              className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,rgba(44,78,183,0.16),transparent_68%)] blur-2xl"
            />
            <img
              src={homeHero}
              alt=""
              className="home-hero__image relative z-10 h-auto w-full max-w-[640px] select-none object-contain drop-shadow-[0_28px_60px_rgba(21,28,45,0.18)]"
            />
          </div>
        </div>

        <footer className="relative z-10 border-t border-border-default/80 py-5">
          <p className="text-center text-sm font-medium leading-relaxed text-text-secondary sm:text-base">
            {t('home.footerNote')}
          </p>
        </footer>
      </main>
    </div>
  )
}
