import {
  bundleInvoiceLinesPath,
  getBundleInvoiceLines,
  type BundleInvoiceLinesDto,
} from '../api/catalog/bundles'
import { NetworkError } from '../api'
import { loadOrRecall } from './posOffline'

/**
 * How a bundle goes on a till sale (`GET /v1/bundles/{id}/invoice-lines`): one line, or one line
 * per part when its parts differ in VAT. Read for one bundle: the part prices do not depend on how
 * many are sold, the sale line scales the quantities.
 *
 * Offline the till uses its last copy of the answer, whose prices the server takes (a queued sale's
 * old price is accepted with a warning). With no copy it cannot know, so the caller refuses the sale
 * of that bundle rather than guess at a VAT: it fails here with the `NetworkError`.
 */
const copyName = (branchId: string, bundleId: string) => `bundleLines.${branchId}.${bundleId}`

export function tillBundleLines(
  branchId: string,
  bundleId: string,
): Promise<BundleInvoiceLinesDto> {
  return loadOrRecall(copyName(branchId, bundleId), () =>
    getBundleInvoiceLines(bundleInvoiceLinesPath(bundleId, { branchId, quantity: 1 })),
  )
}

/** Reads each bundle on the shelf ahead, one at a time, so the copies exist before the line drops. */
export async function keepBundleLines(branchId: string, bundleIds: string[]): Promise<void> {
  for (const bundleId of bundleIds) {
    try {
      await tillBundleLines(branchId, bundleId)
    } catch (cause) {
      // No connection: the rest would fail the same way. Any other refusal is said on the tap.
      if (cause instanceof NetworkError) return
    }
  }
}
