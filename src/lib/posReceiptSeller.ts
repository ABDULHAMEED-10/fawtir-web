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
 * before S-A, kept so an older server and the offline till print what they always printed
 * (requirement 8).
 */
export type ReceiptSellerHeader = {
  source: 'frozen' | 'live'
  /** Null when the issued invoice recorded none: print as not recorded. */
  name: string | null
  address: string
  /** Null in `frozen` when not recorded; null in `live` when the profile could not be read. */
  vatNumber: string | null
}

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
  return {
    source: 'live',
    name: liveProfile?.legalName ?? workspaceName ?? '',
    address: liveProfile
      ? [liveProfile.registeredAddress, liveProfile.registeredCity].filter(Boolean).join(', ')
      : '',
    vatNumber: liveProfile ? liveProfile.taxNumber : null,
  }
}
