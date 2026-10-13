import type { CompanyProfileDto } from '../api/company/companyProfile'
import type { CustomerDto } from '../api/customers/customers'
import type {
  InvoiceBuyerDto,
  InvoicePartyAddressDto,
  InvoiceSellerDto,
} from '../api/invoices/detail'
import { countryName } from './console/format'
import { governorateIdFor } from './governorates'

type Translate = (key: string, options?: Record<string, unknown>) => string

/** A party as the printed document shows it: the name, then the VAT number, then the address. */
export type DocumentParty = {
  name: string
  vat: string | null
  addressLines: string[]
}

const present = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim() !== ''

/**
 * The address in the order a reader in Oman expects it on paper: street, additional street,
 * line 3, building, PO box, postal code with the city, governorate, country. The governorate is
 * stored in English because the document prints it (IBT-039 / IBT-054); the screen translates it
 * when it is one of the eleven, and shows the stored spelling otherwise.
 */
export function addressLines(
  address: Partial<InvoicePartyAddressDto> | null | undefined,
  t: Translate,
  language: string,
): string[] {
  if (!address) return []
  const governorate = governorateIdFor(address.countrySubentity)
  const lines = [
    address.streetName,
    address.additionalStreetName,
    address.addressLine3,
    present(address.buildingNumber)
      ? t('documentParty.building', { number: address.buildingNumber })
      : null,
    present(address.poBox) ? t('documentParty.poBox', { number: address.poBox }) : null,
    [address.postalCode, address.cityName].filter(present).join(' '),
    governorate ? t(`governorate.${governorate}`) : address.countrySubentity,
    present(address.countryCode) ? countryName(address.countryCode, language) : null,
  ]
  return lines.filter(present)
}

/** The registered address of the live company profile, in the document's address shape. */
function profileAddress(profile: CompanyProfileDto): Partial<InvoicePartyAddressDto> {
  return {
    streetName: profile.registeredAddress,
    additionalStreetName: profile.registeredAddressLine2,
    addressLine3: profile.registeredAddressLine3,
    cityName: profile.registeredCity,
    postalCode: profile.registeredPostalCode,
    countrySubentity: profile.registeredCountrySubdivision,
    countryCode: profile.country,
    poBox: profile.registeredPoBox,
  }
}

/**
 * The seller: the snapshot frozen at issue when the server sends it, else the live company profile.
 * The profile is only a stand-in for a draft (or a server that predates the snapshot); an issued
 * document's seller is what was issued, even if the profile changed since.
 */
export function sellerParty(
  snapshot: InvoiceSellerDto | null | undefined,
  profile: CompanyProfileDto | null,
  t: Translate,
  language: string,
): DocumentParty | null {
  if (snapshot) {
    return {
      name: snapshot.legalName,
      vat: present(snapshot.vatin) ? snapshot.vatin : null,
      addressLines: addressLines(snapshot.address, t, language),
    }
  }
  if (!profile) return null
  return {
    name: profile.legalName,
    vat: present(profile.taxNumber) ? profile.taxNumber : null,
    addressLines: addressLines(profileAddress(profile), t, language),
  }
}

/**
 * The buyer: the issued snapshot, else the customer the document names. A consumer invoice names
 * a saved consumer customer too, so the record answers for B2C as it does for B2B.
 */
export function buyerParty(
  snapshot: InvoiceBuyerDto | null | undefined,
  customer: CustomerDto | null,
  t: Translate,
  language: string,
): DocumentParty | null {
  if (snapshot) {
    return {
      name: snapshot.name,
      vat: present(snapshot.vatin) ? snapshot.vatin : null,
      addressLines: addressLines(snapshot.address, t, language),
    }
  }
  if (!customer) return null
  const vat = customer.profile.details?.vatRegistrationNumber
  return {
    name: customer.displayName,
    vat: present(vat) ? vat : null,
    addressLines: addressLines(customer.profile.invoiceAddress, t, language),
  }
}
