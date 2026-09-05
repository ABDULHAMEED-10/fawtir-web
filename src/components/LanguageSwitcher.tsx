import { useTranslation } from 'react-i18next'

const languages = [
  { code: 'en', labelKey: 'language.english' },
  { code: 'ar', labelKey: 'language.arabic' },
] as const

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()

  const changeLanguage = (lng: string) => {
    void i18n.changeLanguage(lng)
    localStorage.setItem('language', lng)
    document.documentElement.lang = lng
    document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr'
  }

  // Below md the switcher shrinks to fit its own labels — a fixed 180px is half a phone's topbar.
  return (
    <div
      className="inline-flex w-[180px] items-start overflow-hidden rounded-sm border border-primary-50 bg-primary-25 p-1 max-md:w-auto"
      role="group"
      aria-label={t('language.label')}
    >
      {languages.map(({ code, labelKey }) => {
        const active = i18n.language === code || i18n.language.startsWith(code)
        return (
          <button
            key={code}
            type="button"
            onClick={() => changeLanguage(code)}
            className={[
              'flex h-9 w-[86px] items-center justify-center rounded-sm px-[15px] text-base transition-colors',
              'max-md:h-8 max-md:w-auto max-md:px-2.5 max-md:text-sm',
              active
                ? 'bg-surface-card font-semibold text-primary-800'
                : 'bg-transparent font-medium text-text-quaternary hover:text-text-secondary',
            ].join(' ')}
          >
            {t(labelKey)}
          </button>
        )
      })}
    </div>
  )
}
