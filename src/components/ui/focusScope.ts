const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
  '[contenteditable="true"]',
].join(', ')

/** jsdom has no layout and no `checkVisibility`; there every element counts as visible. */
function isVisible(element: HTMLElement) {
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ checkVisibilityCSS: true })
    : true
}

/**
 * What Tab visits inside `roots`, in document order within each root. A radio group is one stop,
 * its checked radio (or its first, when none is), as the browser treats it.
 */
export function tabbablesIn(roots: Element[]): HTMLElement[] {
  const seenGroups = new Set<string>()
  const result: HTMLElement[] = []
  for (const root of roots) {
    for (const element of root.querySelectorAll<HTMLElement>(TABBABLE)) {
      if (element.tabIndex < 0 || element.closest('[inert], [hidden]') || !isVisible(element)) {
        continue
      }
      if (element instanceof HTMLInputElement && element.type === 'radio' && element.name) {
        const group = `${element.form?.id ?? ''}::${element.name}`
        if (seenGroups.has(group)) continue
        const checked = root.querySelector<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(element.name)}"]:checked`,
        )
        seenGroups.add(group)
        result.push(checked ?? element)
        continue
      }
      result.push(element)
    }
  }
  return result
}
