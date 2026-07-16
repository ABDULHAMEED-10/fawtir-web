import { useTranslation } from 'react-i18next'

const languages = [
  { code: 'en', labelKey: 'english' },
  { code: 'ar', labelKey: 'arabic' },
] as const

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
    localStorage.setItem('language', lng)
    document.documentElement.lang = lng
    document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr'
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">{t('language')}</span>
      <div className="flex overflow-hidden rounded-md border border-slate-200">
        {languages.map(({ code, labelKey }) => {
          const active = i18n.language === code
          return (
            <button
              key={code}
              type="button"
              onClick={() => changeLanguage(code)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t(labelKey)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
