import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Popover } from '../ui'
import { HIT_KINDS, SEARCH_SUGGESTIONS, type Hit } from '../../lib/shell'
import { searchEverywhere } from '../../lib/globalSearch'
import searchIcon from '../../assets/dashboard/search.svg'

/**
 * The search box in the topbar.
 *
 * Opens on focus, asks the server as you type (after a pause, from two characters) across
 * invoices, customers and suppliers, and is driven from the keyboard: up and down move, Enter
 * opens, Escape closes. With nothing typed it offers the three things people most often come here
 * for. Documents and the catalogue are not searched: their lists have no search the box can ask.
 */
const MIN_QUERY = 2
const DEBOUNCE_MS = 300

export function GlobalSearch({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const anchor = useRef<HTMLLabelElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)

  const [result, setResult] = useState<{ query: string; hits: Hit[]; failed: boolean } | null>(
    null,
  )
  const trimmed = query.trim()
  const askable = trimmed.length >= MIN_QUERY

  useEffect(() => {
    if (!askable) return
    let active = true
    const timer = setTimeout(() => {
      searchEverywhere(trimmed, i18n.language).then((answer) => {
        if (active) setResult({ query: trimmed, ...answer })
      })
    }, DEBOUNCE_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [askable, trimmed, i18n.language])

  // An answer counts only for the query it was asked for, so typing on never shows stale rows.
  const current = askable && result?.query === trimmed ? result : null
  const hits = current?.hits ?? []
  const grouped = HIT_KINDS.map((kind) => ({
    kind,
    hits: hits.filter((hit) => hit.kind === kind),
  })).filter((group) => group.hits.length)

  // A new query starts the selection again at the top.
  useEffect(() => setCursor(0), [query])

  const go = (hit: Hit) => {
    setOpen(false)
    setQuery('')
    navigate(hit.to)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false)
      input.current?.blur()
      return
    }
    if (!hits.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => (c + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => (c - 1 + hits.length) % hits.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(hits[cursor])
    }
  }

  return (
    <>
      <label
        ref={anchor}
        className={[
          'flex h-[50px] w-full max-w-[346px] items-center gap-2 rounded-md border border-black/10 bg-surface-card px-4',
          className,
        ].join(' ')}
      >
        <img src={searchIcon} alt="" className="size-5 shrink-0" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          placeholder={t('dashboard.searchPlaceholder')}
          className="h-full w-full border-0 bg-transparent text-sm font-medium tracking-[0.14px] text-text-primary outline-none placeholder:text-text-placeholder"
        />
      </label>

      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={420}>
        <div id="global-search-results" className="max-h-[420px] overflow-y-auto py-2">
          {!query.trim() ? (
            <div className="px-2">
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                {t('shell.search.tryThese')}
              </p>
              {SEARCH_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.labelKey}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    navigate(suggestion.to)
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2.5 text-start text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t(suggestion.labelKey)}
                </button>
              ))}
            </div>
          ) : !askable || !current || current.failed || !hits.length ? (
            <p className="px-4 py-6 text-center text-sm font-medium text-text-tertiary">
              {!askable
                ? t('shell.search.keepTyping')
                : !current
                  ? t('shell.search.searching')
                  : current.failed
                    ? t('shell.search.unavailable')
                    : t('shell.search.nothing', { query: trimmed })}
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.kind} className="px-2">
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                  {t(`shell.search.kind.${group.kind}`)}
                </p>
                {group.hits.map((hit) => {
                  const index = hits.indexOf(hit)
                  const active = index === cursor
                  return (
                    <button
                      key={`${hit.kind}-${hit.id}`}
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => go(hit)}
                      className={[
                        'flex w-full items-center gap-3 rounded-sm px-2 py-2.5 text-start transition-colors',
                        active ? 'bg-primary-25' : 'hover:bg-primary-25',
                      ].join(' ')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text-primary">
                          {hit.title}
                        </span>
                        {hit.subtitle ? (
                          <span className="mt-0.5 block truncate text-xs font-medium text-text-quaternary">
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {hit.trailing ? (
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-text-tertiary">
                          {hit.trailing}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </Popover>
    </>
  )
}
