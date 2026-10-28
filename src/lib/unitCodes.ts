/**
 * UN/ECE Recommendation 21 package codes, keyed by the bare two letters some lists still carry.
 * PINT-OM accepts a Rec 21 code only with its `X` prefix (rule ibr-cl-23, IBT-130 / IBT-150), so a
 * line in a bare `BX` is refused at issue. New choices offer the `X` form; a draft, product or
 * invoice that already holds a bare code still opens and shows its word (the bare keys stay in the
 * locale files), it is just not offered again. A line filled from a saved product in a bare code
 * takes the X form (the same unit); the product itself is not changed.
 *
 * Its own module so the line fill (`productLine`, `pos`) can use it without an import cycle.
 */
export const REC21_PACKAGE_UNITS: Readonly<Record<string, string>> = {
  BX: 'XBX',
  CT: 'XCT',
  PK: 'XPK',
  BG: 'XBG',
  BO: 'XBO',
  CA: 'XCA',
  RO: 'XRO',
  SA: 'XSA',
}

/** The code to offer for a unit: a bare Rec 21 package code's `X` form, any other code itself. */
export function offeredUnitCode(code: string): string {
  return REC21_PACKAGE_UNITS[code] ?? code
}

/** Whether a stored unit is a bare Rec 21 package code that PINT-OM refuses (ibr-cl-23). */
export function isBarePackageUnit(code: string): boolean {
  return code in REC21_PACKAGE_UNITS
}
