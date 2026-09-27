/**
 * Oman's eleven governorates. The id keys the localized `governorate.*` label; the English name is
 * the value the backend stores, because it is printed as IBT-054 `cbc:CountrySubentity` on every
 * invoice and must not change with the registrant's UI language.
 */
export const GOVERNORATE_NAMES = {
  muscat: 'Muscat',
  dhofar: 'Dhofar',
  musandam: 'Musandam',
  buraimi: 'Al Buraimi',
  dakhiliyah: 'Ad Dakhiliyah',
  northBatinah: 'North Al Batinah',
  southBatinah: 'South Al Batinah',
  ashSharqiyahSouth: 'Ash Sharqiyah South',
  ashSharqiyahNorth: 'Ash Sharqiyah North',
  dhahirah: 'Adh Dhahirah',
  wusta: 'Al Wusta',
} as const

export type GovernorateId = keyof typeof GOVERNORATE_NAMES

export const GOVERNORATES = Object.keys(GOVERNORATE_NAMES) as GovernorateId[]

export function isGovernorateId(value: string): value is GovernorateId {
  return Object.hasOwn(GOVERNORATE_NAMES, value)
}

/** The id for a stored English name (IBT-054), for a form that edits a saved address. */
export function governorateIdFor(name: string | null | undefined): GovernorateId | undefined {
  return GOVERNORATES.find((id) => GOVERNORATE_NAMES[id] === name)
}
