import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '../../components/BrandLogo'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { Button } from '../../components/ui'

export function HomePage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-surface-background">
      <header className="border-b border-border-subtle bg-surface-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandLogo size="sm" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/signup">
              <Button size="md" variant="secondary">{t('signup.submit')}</Button>
            </Link>
            <Link to="/login">
              <Button size="md">{t('login.submit')}</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-brand">
          {t('home.badge')}
        </p>
        <h1 className="max-w-2xl text-3xl font-semibold leading-[1.2] text-text-primary sm:text-4xl">
          {t('home.heroTitle')}
        </h1>
        <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-text-muted">
          {t('home.heroSubtitle')}
        </p>
        <p className="mt-8 rounded-sm border border-border-subtle bg-surface-card px-4 py-3 text-sm font-medium text-text-tertiary shadow-card">
          {t('home.waitingForDesigns')}
        </p>
      </main>
    </div>
  )
}
