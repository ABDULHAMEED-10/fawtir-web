/**
 * The app's toggle switch (Figma: 42×23 track, 18px knob).
 *
 * Written as a `role="switch"` button rather than a checkbox so the track and knob can be drawn
 * exactly as designed without fighting a native control's own painting — the same reason
 * `TableCheckbox` exists.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name — required, since the switch itself carries no visible text. */
  label: string
  disabled?: boolean
  /** `sm` is the 36×20 variant used inside dense rows. */
  size?: 'sm' | 'md'
}) {
  const track = size === 'md' ? 'h-[23px] w-[42px]' : 'h-5 w-9'
  const knob = size === 'md' ? 'size-[18px] top-[2.5px]' : 'size-4 top-0.5'
  const on = size === 'md' ? 'start-[21px]' : 'start-[18px]'
  const off = size === 'md' ? 'start-[2.5px]' : 'start-0.5'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative shrink-0 rounded-full transition-colors disabled:opacity-40',
        track,
        checked ? 'bg-primary-700' : 'bg-[#d0d2d5]',
      ].join(' ')}
    >
      <span
        className={['absolute rounded-full bg-white transition-all', knob, checked ? on : off].join(
          ' ',
        )}
      />
    </button>
  )
}
