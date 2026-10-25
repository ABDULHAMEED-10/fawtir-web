import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import searchIcon from '../../assets/dashboard/search.svg'

/** Where a console search lands: the register, its search box filled in. */
export const CONSOLE_SEARCH_ROUTE = '/console/tenants'

/**
 * The console's search box in the topbar (owner, 24 Oct 2026). The tenant topbar's search asks a
 * shop's own invoices and customers, which an operator has none of; this one finds a company.
 *
 * There is no server search across the register yet (CONSOLE.md row 1.10), so Enter opens Tenants
 * with the words in its search box, which narrows the rows that page has loaded.
 * TODO(backend): CONSOLE.md rows 1.10 and 5.2, search the whole register as you type.
 */
export function ConsoleSearch({
  className = '',
  autoFocus = false,
}: {
  className?: string
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  return (
    <form
      role="search"
      className={['w-full max-w-[346px]', className].join(' ')}
      onSubmit={(event) => {
        event.preventDefault()
        const words = query.trim()
        navigate(
          words ? `${CONSOLE_SEARCH_ROUTE}?q=${encodeURIComponent(words)}` : CONSOLE_SEARCH_ROUTE,
        )
        setQuery('')
      }}
    >
      <label className="flex h-[50px] items-center gap-2 rounded-md border border-black/10 bg-surface-card px-4 max-md:h-[46px]">
        <img src={searchIcon} alt="" className="size-5 shrink-0" />
        <span className="sr-only">{t('console.search.label')}</span>
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('console.search.placeholder')}
          className="h-full w-full min-w-0 border-0 bg-transparent text-sm font-medium tracking-[0.14px] text-text-primary outline-none placeholder:text-text-placeholder"
        />
      </label>
    </form>
  )
}
