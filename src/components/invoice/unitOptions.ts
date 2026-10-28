import type { TFunction } from 'i18next'
import type { SelectOption } from '../ui/Select'
import type { ReferenceDataDto } from '../../api/reference/referenceData'
import {
  SERVICE_UNITS,
  isBarePackageUnit,
  offeredUnitCode,
  unitsFor,
  type ItemType,
} from '../../lib/invoiceDraft'

/** UN/ECE Rec. 20 "mutually defined": the design's "Other", offered last on both lists. */
export const OTHER_UNIT = 'ZZ'

/**
 * The unit choices of one line, for every composer: the UN/ECE Rec 20 lists the invoice draft
 * carries (`GOODS_UNITS` / `SERVICE_UNITS`, "Other" `ZZ` last on both), named as the invoice
 * composer names them (`createInvoice.units.*`, then the platform's short name, then the code).
 *
 * With the platform's code list (`/v1/reference-data`) the choices are the units it carries,
 * split the same way: a unit the server does not list would be refused on save. "Other" stays
 * offered either way (a backend ask: the list lacks `ZZ`), and the full lists stand in until
 * the catalogue has answered. A unit the line already carries but the list does not (a product's
 * own, a loaded draft's) is shown rather than dropped.
 *
 * Rec 21 package codes are offered only in their `X` form (PINT-OM ibr-cl-23): a bare `BX` the
 * platform still lists counts as `XBX`, so a list carrying both during the switch shows one "Box".
 * A line that already holds a bare code keeps it on show, with its word, but greyed out so it is
 * not picked again beside its `X` twin.
 */
export function unitOptions(
  kind: ItemType,
  t: TFunction,
  current?: string,
  reference?: ReferenceDataDto | null,
): SelectOption[] {
  const known = [
    ...new Set(
      (reference?.units ?? [])
        .filter((unit) => unit.active)
        .map((unit) => offeredUnitCode(unit.code)),
    ),
  ]
  const ours = [...unitsFor(kind)]
  let codes: string[]
  if (known.length === 0) {
    codes = ours
  } else {
    // The design's order first, then the platform's own units of this kind, then Other.
    const service = SERVICE_UNITS as readonly string[]
    const ofKind = known.filter((code) =>
      code === OTHER_UNIT
        ? false
        : kind === 'service'
          ? service.includes(code)
          : !service.includes(code),
    )
    codes = [
      ...ours.filter((code) => code !== OTHER_UNIT && ofKind.includes(code)),
      ...ofKind.filter((code) => !ours.includes(code)),
      OTHER_UNIT,
    ]
  }
  if (current && !codes.includes(current)) codes.push(current)
  return codes.map((code) => ({
    value: code,
    label: t(`createInvoice.units.${code}`, {
      defaultValue: t(`reference.unitShort.${code}`, { defaultValue: code }),
    }),
    ...(isBarePackageUnit(code) && codes.includes(offeredUnitCode(code)) ? { disabled: true } : {}),
  }))
}
