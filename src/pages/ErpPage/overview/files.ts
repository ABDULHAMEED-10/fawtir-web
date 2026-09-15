import type { TFunction } from 'i18next'
import type { AuditEvent } from '../../../lib/erpMapping'

/** Reads a file the user chose and parses it as JSON; a failure is a reason, not a throw. */
export function readJsonFile(
  file: File,
): Promise<{ ok: true; value: unknown } | { ok: false; reason: 'read' | 'parse' }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve({ ok: false, reason: 'read' })
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      try {
        resolve({ ok: true, value: JSON.parse(text) })
      } catch {
        resolve({ ok: false, reason: 'parse' })
      }
    }
    reader.readAsText(file)
  })
}

/** `20260926` — the date the export file is named after. */
export const yyyymmdd = (date: Date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate(),
  ).padStart(2, '0')}`

/** Hands the browser a JSON file to save, through a Blob and a short-lived object URL. */
export function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Kilobytes with one decimal, the way the samples table states a size. */
export const kilobytes = (bytes: number) => (bytes / 1024).toFixed(1)

/** The sentence of an audit entry, with its route named in the reader's language. */
export function eventText(t: TFunction, event: AuditEvent) {
  const values: Record<string, string | number> = { ...(event.values ?? {}) }
  if (typeof values.route === 'string') values.route = t(`erp.certRoute.${values.route}`)
  return t(`erp.event.${event.actionKey}`, values)
}
