import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** Example hook: tracks current language and RTL state */
export function useLanguage() {
  const { i18n } = useTranslation()
  const [language, setLanguage] = useState(i18n.language)
  const isRtl = language === 'ar'

  useEffect(() => {
    const handleLanguageChanged = (lng: string) => setLanguage(lng)
    i18n.on('languageChanged', handleLanguageChanged)
    return () => {
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [i18n])

  return { language, isRtl, changeLanguage: i18n.changeLanguage.bind(i18n) }
}
