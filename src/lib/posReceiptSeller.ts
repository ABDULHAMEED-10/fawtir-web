import type { PosReceiptSellerDto } from '../api/pos/pos'

/**
 * The seller lines at the top of a till receipt.
 *
 * `frozen`: the server stated `receipt.seller`, the seller frozen on the issued invoice (CMP-5 S-A).
 * Only those values are printed. A value it does not have is never filled from the live company
 * profile or the workspace name, because a reprint would then present today's details as the
 * seller of a sale issued before they changed (owner requirement 7). Name and VAT number are the
 * lines a reader relies on to identify the seller, so a missing one is shown as not recorded; a
 * missing address part is left out, as the address line already prints only the parts it has.
 *
 * `live`: no `receipt.seller` key at all. Either the server predates S-A, or there is no server
 * answer yet (a sale queued offline, printed before it is issued). That is the receipt as it was
 * before S-A, kept so an older server prints what it always printed (requirement 8). Name and VAT
 * number come from the live profile when it could be read; otherwise, for a queued sale only, from
 * the seller in the till's QR profile the sale was queued with, so the header names the seller the
 * printed QR names (owner decision on QA-F11, OWNER-RC5-QA-DECISIONS-20261107f). That copy carries
 * no address, and none is made up. The workspace name is the last resort, as before.
 */
export type ReceiptSellerHeader = {
  source: 'frozen' | 'live'
  /** Null when the issued invoice recorded none: print as not recorded. */
  name: string | null
  address: string
  /**
   * Null in `frozen` when not recorded; null in `live` when neither the profile nor the queued
   * sale's QR profile gave one.
   */
  vatNumber: string | null
}

/** The seller in the till's QR profile a queued sale was numbered with (`PosQrProfile`). */
export type QueuedSeller = { name: string; vatNumber: string }

type LiveProfile = {
  legalName: string
  taxNumber: string
  registeredAddress: string
  registeredCity: string | null
}

const present = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim() !== ''

export function receiptSellerHeader(
  stated: PosReceiptSellerDto | null | undefined,
  liveProfile: LiveProfile | null,
  workspaceName: string | null | undefined,
  queuedSeller: QueuedSeller | null = null,
): ReceiptSellerHeader {
  // `undefined` is "no such key": an older server. `null` is not sent by a server with S-A; if it
  // ever came it is still a server that knows the field, so it is read as nothing recorded.
  if (stated !== undefined) {
    const seller: Partial<PosReceiptSellerDto> = stated ?? {}
    return {
      source: 'frozen',
      name: present(seller.legalName) ? seller.legalName : null,
      address: [seller.streetName, seller.additionalStreetName, seller.buildingNumber, seller.cityName]
        .filter(present)
        .join(', '),
      vatNumber: present(seller.vatNumber) ? seller.vatNumber : null,
    }
  }
  if (liveProfile) {
    return {
      source: 'live',
      name: liveProfile.legalName,
      address: [liveProfile.registeredAddress, liveProfile.registeredCity].filter(Boolean).join(', '),
      vatNumber: liveProfile.taxNumber,
    }
  }
  return {
    source: 'live',
    name: present(queuedSeller?.name) ? queuedSeller.name : (workspaceName ?? ''),
    address: '',
    vatNumber: present(queuedSeller?.vatNumber) ? queuedSeller.vatNumber : null,
  }
}
