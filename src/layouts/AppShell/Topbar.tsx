import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { GlobalSearch, NotificationsBell } from '../../components/shell'
import { CloseIcon, MenuIcon } from '../../components/ui/icons'
import type { NoteScope } from '../../lib/notifications'
import searchIcon from '../../assets/dashboard/search.svg'
import plusIcon from '../../assets/dashboard/plus.svg'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'
import { useCan } from '../../lib/session/session'
import { ConsoleSearch } from '../ConsoleShell/ConsoleSearch'

/** Below this the bar cannot hold a search field as well as everything else. */
const SEARCH_FITS = '(min-width: 48rem)'

export function Topbar({
  onOpenNav = () => {},
  showCreateInvoice: allowCreateInvoice = true,
  notes = 'tenant',
  search = 'tenant',
}: {
  onOpenNav?: () => void
  /** The Fawtir console has no Create Invoice — nobody invoices from inside the platform. */
  showCreateInvoice?: boolean
  /** Whose notifications the bell shows — the console's are not a shop's. */
  notes?: NoteScope
  /** Which search the bar carries: a shop's documents, or the console's companies. */
  search?: 'tenant' | 'console'
}) {
  const { t } = useTranslation()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  // No new drafts while the subscription is read-only (ST-2, CA-3).
  const mayDraft = useSubscriptionAllows('CREATE_DRAFTS')
  // A reader who may not draft was offered Create Invoice, on the phone as the bare "+" (C-9).
  const canDraft = useCan('invoice.draft')
  const showCreateInvoice =
    allowCreateInvoice &&
    mayDraft &&
    canDraft &&
    !location.pathname.startsWith('/invoices') &&
    !location.pathname.startsWith('/income') &&
    // Self-billing moved to Expenditure (6 Oct 2026) but keeps the bar its frames draw.
    !location.pathname.startsWith('/expenditure/self-billing')

  // The phone search takes over the whole bar, so it must not survive into a width where the bar
  // has room for the field anyway — otherwise a rotate or resize leaves the bar showing nothing.
  useEffect(() => {
    if (!searchOpen) return
    const fits = window.matchMedia(SEARCH_FITS)
    const close = () => {
      if (fits.matches) setSearchOpen(false)
    }
    close()
    fits.addEventListener('change', close)
    return () => fits.removeEventListener('change', close)
  }, [searchOpen])

  return (
    <header className="flex h-[74px] shrink-0 items-center justify-between gap-4 border-b border-black/10 bg-surface-tab-bar px-5 max-md:gap-2 max-md:px-3">
      {searchOpen && search === 'console' ? (
        <div className="flex w-full items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label={t('common.close')}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-primary-25"
          >
            <CloseIcon size={18} />
          </button>
          <ConsoleSearch autoFocus className="max-w-none flex-1" />
        </div>
      ) : searchOpen ? (
        <div className="flex w-full items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label={t('common.close')}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-primary-25"
          >
            <CloseIcon size={18} />
          </button>
          <label className="flex h-[46px] flex-1 items-center gap-2 rounded-md border border-black/10 bg-surface-card px-4">
            <img src={searchIcon} alt="" className="size-5 shrink-0" />
            <input
              type="search"
              autoFocus
              placeholder={t('dashboard.searchPlaceholder')}
              className="h-full w-full border-0 bg-transparent text-sm font-medium tracking-[0.14px] text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpenNav}
            aria-label={t('dashboard.openNav')}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-primary-25 lg:hidden"
          >
            <MenuIcon size={22} />
          </button>

          {search === 'console' ? (
            <ConsoleSearch className="max-md:hidden" />
          ) : (
            <GlobalSearch className="max-md:hidden" />
          )}

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={
              search === 'console' ? t('console.search.label') : t('dashboard.searchPlaceholder')
            }
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-primary-25 md:hidden"
          >
            <img src={searchIcon} alt="" className="size-5" />
          </button>

          <div className="flex items-center gap-4 max-md:gap-2">
            {showCreateInvoice ? (
              <Link
                to="/invoices/new"
                aria-label={t('dashboard.createInvoice')}
                className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800 max-md:h-10 max-md:px-2"
              >
                <img src={plusIcon} alt="" className="size-6" />
                <span className="max-md:hidden">{t('dashboard.createInvoice')}</span>
              </Link>
            ) : null}

            <NotificationsBell scope={notes} />

            <div className="hidden h-12 w-px bg-border-subtle sm:block max-md:hidden" />

            <LanguageSwitcher />
          </div>
        </>
      )}
    </header>
  )
}
