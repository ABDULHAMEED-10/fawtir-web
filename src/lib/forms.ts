/**
 * Picks the first field, in the order the form draws them, that has an error. Order is passed in
 * rather than read from the DOM because the error markers render only after the state update that
 * a failed submit makes.
 */
export function firstInvalidField<F extends string>(
  order: readonly F[],
  errors: Partial<Record<F, unknown>>,
): F | undefined {
  return order.find((field) => errors[field])
}

/**
 * Moves focus to the first invalid field after a failed submit. Field errors are not live
 * regions — several announcing at once is noise — so focusing the field is what makes a screen
 * reader read it, together with the message its `aria-describedby` points at.
 */
export function focusFirstInvalid<F extends string>(
  form: HTMLFormElement,
  order: readonly F[],
  errors: Partial<Record<F, unknown>>,
): void {
  const field = firstInvalidField(order, errors)
  const element = field ? form.elements.namedItem(field) : null
  if (element instanceof HTMLElement) element.focus()
}
