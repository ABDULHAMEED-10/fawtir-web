import type { TFunction } from 'i18next'
import type { SelectOption } from '../ui/Select'
import { unitsFor, type ItemType } from '../../lib/invoiceDraft'

/**
 * The unit choices of one line, for every composer: the UN/ECE Rec 20 lists the invoice draft
 * carries (`GOODS_UNITS` / `SERVICE_UNITS`, "Other" `ZZ` last on both), named as the invoice
 * composer names them (`createInvoice.units.*`). A unit the line already carries but the list
 * does not (a product's own) is shown rather than dropped.
 */
export function unitOptions(kind: ItemType, t: TFunction, current?: string): SelectOption[] {
  const codes = [...unitsFor(kind)]
  if (current && !codes.includes(current)) codes.push(current)
  return codes.map((code) => ({
    value: code,
    label: t(`createInvoice.units.${code}`, { defaultValue: code }),
  }))
}
