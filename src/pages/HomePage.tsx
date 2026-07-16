import { useTranslation } from 'react-i18next'

export function HomePage() {
  const { t } = useTranslation()

  return (
    <section className="space-y-4">
      <h2 className="text-3xl font-semibold tracking-tight">{t('welcome')}</h2>
      <p className="max-w-2xl text-lg text-slate-600">{t('description')}</p>
      <p className="text-slate-500">{t('getStarted')}</p>
    </section>
  )
}
