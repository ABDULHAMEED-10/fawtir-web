import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import copyIcon from '../../../assets/settings/copy.svg'

/**
 * A JSON value as a collapsible tree — the preview's two panes, and later the record and run
 * detail screens (docs/erp-and-console-plan.md §2.8).
 *
 * Always laid out left-to-right, whatever the page's direction: JSON is code, and a key that
 * reads right-to-left with its brackets swapped is a different document. Collapsed nodes say
 * how much they hide, so a reader can tell a two-line array from a two-hundred-line one without
 * opening it.
 */
export function JsonTree({
  value,
  copyable = true,
  openDepth = 2,
}: {
  value: unknown
  /** A "copy JSON" control in the corner. */
  copyable?: boolean
  /** Nodes deeper than this start collapsed. */
  openDepth?: number
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div dir="ltr" className="rounded-sm bg-surface-background/60 text-left">
      {copyable ? (
        <div className="flex justify-end px-2 pt-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(JSON.stringify(value, null, 2))
              setCopied(true)
            }}
            aria-label={t('erp.shared.copyJson')}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={copyIcon} alt="" className="size-4" />
            {copied ? t('erp.shared.copied') : t('erp.shared.copyJson')}
          </button>
        </div>
      ) : null}
      <div
        className={[
          'overflow-x-auto px-4 font-mono text-[12px] leading-[1.7] text-text-secondary',
          copyable ? 'pb-3 pt-1' : 'py-3',
        ].join(' ')}
      >
        <Node value={value} depth={0} openDepth={openDepth} last />
      </div>
    </div>
  )
}

function Node({
  name,
  value,
  depth,
  openDepth,
  last,
}: {
  name?: string
  value: unknown
  depth: number
  openDepth: number
  last: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(depth < openDepth)
  const isArray = Array.isArray(value)
  const isObject = value !== null && typeof value === 'object'
  const comma = last ? '' : ','
  const indent = { paddingLeft: depth * 16 }

  const key =
    name !== undefined ? (
      <>
        <span className="font-semibold text-primary-800">&quot;{name}&quot;</span>
        <span className="text-text-quaternary">: </span>
      </>
    ) : null

  if (!isObject) {
    return (
      <div style={indent} className="flex whitespace-pre">
        <span className="inline-block w-4 shrink-0" />
        {key}
        <Leaf value={value} />
        {comma}
      </div>
    )
  }

  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((item, index) => [String(index), item])
    : Object.entries(value as Record<string, unknown>)
  const openBracket = isArray ? '[' : '{'
  const closeBracket = isArray ? ']' : '}'

  if (entries.length === 0) {
    return (
      <div style={indent} className="flex whitespace-pre">
        <span className="inline-block w-4 shrink-0" />
        {key}
        {openBracket}
        {closeBracket}
        {comma}
      </div>
    )
  }

  const count = isArray
    ? t('erp.shared.items', { count: entries.length })
    : t('erp.shared.keys', { count: entries.length })

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        style={indent}
        className="flex w-full items-center whitespace-pre text-left transition-colors hover:bg-primary-25/70"
      >
        <span className="inline-flex w-4 shrink-0 items-center">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden="true"
            className={['transition-transform', open ? 'rotate-90' : ''].join(' ')}
          >
            <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
        {key}
        {openBracket}
        {open ? null : (
          <>
            <span className="text-text-quaternary"> {count} </span>
            {closeBracket}
            {comma}
          </>
        )}
      </button>
      {open ? (
        <>
          {entries.map(([childKey, child], index) => (
            <Node
              key={childKey}
              name={isArray ? undefined : childKey}
              value={child}
              depth={depth + 1}
              openDepth={openDepth}
              last={index === entries.length - 1}
            />
          ))}
          <div style={indent} className="flex whitespace-pre">
            <span className="inline-block w-4 shrink-0" />
            {closeBracket}
            {comma}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Leaf({ value }: { value: unknown }) {
  if (typeof value === 'string') return <span className="text-[#3d5648]">&quot;{value}&quot;</span>
  if (typeof value === 'number')
    return <span className="text-pending-700 tabular-nums">{value}</span>
  if (typeof value === 'boolean') return <span className="text-primary-700">{String(value)}</span>
  return <span className="italic text-text-quaternary">null</span>
}
