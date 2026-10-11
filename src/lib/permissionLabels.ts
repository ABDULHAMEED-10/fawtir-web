import type { TFunction, i18n as I18n } from 'i18next'

/**
 * Words for a server permission code such as `invoice.submit` or `admin.users.manage`.
 *
 * A code is a resource path and an action, the last segment. The resource is named by the longest
 * prefix that has a label (`admin.users` before `admin`), the action by its own label, so a code
 * the screen has never seen still reads as words: an unknown segment is spelled out ("purchase
 * order" for `purchase_order`), never shown as the raw key. The server has no permission catalogue
 * with names yet (TODO(backend): SETTINGS.md row 8.1); when it has, its names replace these.
 */
export type PermissionWords = {
  /** The resource the permission is about: "Invoices", "People". Rows group under it. */
  group: string
  /** What it allows: "Submit", "Manage". */
  action: string
  /** Both together: "Invoices: Submit". */
  label: string
}

const keyOf = (segment: string) => segment.replace(/[^a-z0-9_]/gi, '_').toLowerCase()

/** `purchase_order` reads "Purchase order": the fallback for a segment with no label. */
export function spellOut(segments: string[]): string {
  const words = segments
    .join(' ')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : ''
}

export function permissionWords(code: string, t: TFunction, i18n: I18n): PermissionWords {
  const segments = code.split('.').filter(Boolean)
  const actionSegment = segments.length > 1 ? segments[segments.length - 1] : ''
  const resourceSegments = segments.length > 1 ? segments.slice(0, -1) : segments

  let group = ''
  for (let length = resourceSegments.length; length > 0 && !group; length -= 1) {
    const key = `permissionLabel.resource.${resourceSegments.slice(0, length).map(keyOf).join('_')}`
    if (i18n.exists(key)) {
      const rest = resourceSegments.slice(length)
      group = t(key) + (rest.length ? ` (${spellOut(rest)})` : '')
    }
  }
  if (!group) group = spellOut(resourceSegments)

  const actionKey = `permissionLabel.action.${keyOf(actionSegment)}`
  const action = actionSegment
    ? i18n.exists(actionKey)
      ? t(actionKey)
      : spellOut([actionSegment])
    : t('permissionLabel.action.any')

  return { group, action, label: t('permissionLabel.pair', { group, action }) }
}
