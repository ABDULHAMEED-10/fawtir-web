/**
 * 15px checkbox for table rows and headers.
 *
 * A native checkbox paints its own white box and ignores `background-color`, so on the dark
 * table header it reads as a solid white square instead of the outlined box Figma draws
 * (15×15, 1px #d0d2d5, r=4). `appearance-none` strips that and we draw the tick ourselves, so
 * the same control sits correctly on both the dark header and the white rows.
 */
export function TableCheckbox({
  checked,
  onChange,
  ariaLabel,
  indeterminate,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  ariaLabel: string
  /** Some rows on the page selected, but not all — drawn as a dash. */
  indeterminate?: boolean
  /** A choice that is not the reader's to make — ticked and unclickable. */
  disabled?: boolean
}) {
  return (
    <span className="relative inline-flex size-[15px] shrink-0 align-middle">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
        aria-checked={indeterminate && !checked ? 'mixed' : checked}
        disabled={disabled}
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-default"
      />
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none flex size-[15px] items-center justify-center rounded-[4px] border transition-colors',
          checked || indeterminate
            ? 'border-primary-700 bg-primary-700'
            : 'border-border-default bg-transparent',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-border-brand',
        ].join(' ')}
      >
        {checked ? (
          <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
            <path
              d="M1 5.2L4.2 8.5L11 1.5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : indeterminate ? (
          <span className="block h-[2px] w-[7px] rounded-full bg-white" />
        ) : null}
      </span>
    </span>
  )
}
