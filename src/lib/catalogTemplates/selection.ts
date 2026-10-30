import type { CatalogTemplateDto } from '../../api/catalog/templates'

/**
 * "Save and finish later" on Build from a template: the ticks, prices, units and taxes, kept in
 * this browser for this company and put back when the screen opens on the same template. Nothing
 * is sent: the catalogue changes only on "Add N to the catalog". The suggestion ids are places in
 * the template, so a selection is only put back on the version it was made on.
 *
 * Storage can be missing (a private window, blocked site data); then the work lasts no longer
 * than the page, and the screen still works.
 */
export type BuildSelection = {
  picks: string[]
  prices: Record<string, string>
  units: Record<string, string>
  taxes: Record<string, string>
}

type Stored = BuildSelection & { subBusinessTypeCode: string; version: number }

const PREFIX = 'fawtir.buildCatalog'

export const buildSelectionKey = (tenantId: string | null | undefined) =>
  `${PREFIX}.${tenantId ?? '-'}`

const strings = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

export function readBuildSelection(
  key: string,
  template: Pick<CatalogTemplateDto, 'subBusinessTypeCode' | 'version'>,
): BuildSelection | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as Partial<Stored>
    if (
      stored.subBusinessTypeCode !== template.subBusinessTypeCode ||
      stored.version !== template.version ||
      !Array.isArray(stored.picks)
    ) {
      return null
    }
    return {
      picks: stored.picks.filter((id): id is string => typeof id === 'string'),
      prices: strings(stored.prices),
      units: strings(stored.units),
      taxes: strings(stored.taxes),
    }
  } catch {
    return null
  }
}

export function saveBuildSelection(
  key: string,
  template: Pick<CatalogTemplateDto, 'subBusinessTypeCode' | 'version'>,
  selection: BuildSelection,
): void {
  const stored: Stored = {
    ...selection,
    subBusinessTypeCode: template.subBusinessTypeCode,
    version: template.version,
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(stored))
  } catch {
    // No storage: the work lasts as long as the page.
  }
}

export function forgetBuildSelection(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing kept, nothing to forget.
  }
}
