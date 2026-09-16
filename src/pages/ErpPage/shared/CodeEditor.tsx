import type { KeyboardEvent } from 'react'

/**
 * A mono textarea with a line-number gutter — the hand-written profile, and later the transform
 * editor (docs/erp-and-console-plan.md §2.5, §2.8). No library in V1.
 *
 * The textarea sits over an invisible copy of its own text, so the box is exactly as wide as the
 * longest line and as tall as the line count; the gutter then lines up by construction and the
 * whole thing scrolls as one. Left-to-right always: a JSONata expression is code.
 */
export function CodeEditor({
  id,
  value,
  onChange,
  ariaLabel,
  minLines = 18,
  maxHeight = 520,
  invalid = false,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  minLines?: number
  maxHeight?: number
  invalid?: boolean
}) {
  const lineCount = value.split('\n').length
  const rows = Math.max(lineCount, minLines)
  const filler = '\n'.repeat(Math.max(0, rows - lineCount) + 1)

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const target = event.currentTarget
    const { selectionStart, selectionEnd } = target
    onChange(`${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`)
    requestAnimationFrame(() => {
      target.selectionStart = selectionStart + 2
      target.selectionEnd = selectionStart + 2
    })
  }

  return (
    <div
      dir="ltr"
      style={{ maxHeight }}
      className={[
        'overflow-auto rounded-sm border bg-white text-left transition-colors',
        invalid ? 'border-border-danger' : 'border-border-default focus-within:border-border-brand',
      ].join(' ')}
    >
      <div className="flex min-w-full">
        <pre
          aria-hidden="true"
          className="sticky left-0 z-10 shrink-0 select-none border-r border-border-subtle bg-surface-background/80 px-3 py-3 text-right font-mono text-[12px] leading-[1.7] text-text-quaternary"
        >
          {Array.from({ length: rows }, (_, index) => index + 1).join('\n')}
        </pre>
        <div className="relative min-w-0 flex-1">
          <pre
            aria-hidden="true"
            className="invisible whitespace-pre px-4 py-3 font-mono text-[12px] leading-[1.7]"
          >
            {value}
            {filler}
          </pre>
          <textarea
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre bg-transparent px-4 py-3 font-mono text-[12px] leading-[1.7] text-text-secondary outline-none"
          />
        </div>
      </div>
    </div>
  )
}
