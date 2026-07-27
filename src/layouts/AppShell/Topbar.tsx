import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import searchIcon from '../../assets/dashboard/search.svg'
import plusIcon from '../../assets/dashboard/plus.svg'
import bellIcon from '../../assets/dashboard/bell.svg'

export function Topbar() {
  const { t } = useTranslation()
  const location = useLocation()
  const showCreateInvoice = !location.pathname.startsWith('/invoices')

  return (
    <header className="flex h-[74px] shrink-0 items-center justify-between gap-4 border-b border-black/10 bg-surface-tab-bar px-5">
      <label className="flex h-[50px] w-full max-w-[346px] items-center gap-2 rounded-md border border-black/10 bg-surface-card px-4">
        <img src={searchIcon} alt="" className="size-5 shrink-0" />
        <input
          type="search"
          placeholder={t('dashboard.searchPlaceholder')}
          className="h-full w-full border-0 bg-transparent text-sm font-medium tracking-[0.14px] text-text-primary outline-none placeholder:text-text-placeholder"
        />
      </label>

      <div className="flex items-center gap-4">
        {showCreateInvoice ? (
          <Link
            to="/invoices/new"
            className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-6" />
            {t('dashboard.createInvoice')}
          </Link>
        ) : null}

        <button
          type="button"
          className="relative inline-flex size-12 items-center justify-center rounded-full border border-border-subtle bg-surface-card"
          aria-label={t('dashboard.notifications')}
        >
          <img src={bellIcon} alt="" className="size-6" />
          <span className="absolute end-1 top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary-700 text-[10px] font-semibold text-white">
            2
          </span>
        </button>

        <div className="hidden h-12 w-px bg-border-subtle sm:block" />

        <LanguageSwitcher />
      </div>
    </header>
  )
}
