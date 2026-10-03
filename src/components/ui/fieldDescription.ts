import { createContext, useContext } from 'react'

/**
 * What a field wrapper knows about the control it wraps: the id of its error or help text, and
 * whether it is in error. `Select` and `DateField` draw their own trigger button, so a wrapper
 * cannot put `aria-describedby` on it directly; it provides this instead.
 */
export type FieldDescription = { describedBy?: string; invalid?: boolean }

export const FieldDescriptionContext = createContext<FieldDescription>({})

/** Explicit props win; a wrapper's description is added to, never replaces, the control's own. */
export function useFieldDescription(describedBy?: string, invalid?: boolean) {
  const field = useContext(FieldDescriptionContext)
  const ids = [describedBy, field.describedBy].filter(Boolean).join(' ')
  return {
    'aria-describedby': ids || undefined,
    'aria-invalid': (invalid ?? field.invalid) ? true : undefined,
  }
}
