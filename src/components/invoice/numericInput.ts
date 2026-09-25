import type { FocusEvent } from 'react'

/**
 * A figure field starts with its default ("0.000", "1", "0") already in it. Selecting the whole
 * value on focus lets the first keystroke replace it, so typing 5 gives 5, never 50.000 or 05.000;
 * the field's own blur handler then writes the value back in its normal form. The deferred second
 * select covers a mouse click, where the browser collapses the selection on mouse-up.
 */
export function selectAllOnFocus(event: FocusEvent<HTMLInputElement>) {
  const input = event.currentTarget
  input.select()
  window.setTimeout(() => {
    if (document.activeElement === input) input.select()
  }, 0)
}
