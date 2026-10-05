import type { TFunction } from 'i18next'

/**
 * A certification attempt's document kind in words ("Invoice", "Credit note") rather than the
 * server's code (`STANDARD_INVOICE`). A kind with no translation yet shows the code, never a key.
 */
export function documentKindName(t: TFunction, kind: string): string {
  return t(`erp.certification.kind.${kind}`, { defaultValue: kind })
}

/**
 * A validation layer as people write it ("PINT-OM", "EN 16931") rather than the server's enum
 * (`PINT_OM`, `EN16931`). An unknown layer shows its code, never a key.
 */
export function findingLayerName(t: TFunction, layer: string): string {
  return t(`erp.finding.layer.${layer}`, {
    defaultValue: t(`erp.certification.stage.${layer}`, { defaultValue: layer }),
  })
}
