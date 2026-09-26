import type { CodeListEntry } from './codeList'

/**
 * The reason a line carries no VAT (IBT-121), as a code. Two lists that must never be mixed
 * (CL-05-OM and CL-10-OM): a zero-rated line (category Z) takes a `VATZR-OM-nn` code and an
 * exempt line (category E) a `VATEX-OM-nn` code. The 16 and 12 codes and English names of the
 * published PINT-OM lists "ZeroRating" and "Aligned-TaxExemptionCodes" (docs.peppol.eu). Arabic
 * names are not published: the English name stands in until they are added.
 *
 * TODO(backend): replace with `GET /v1/code-lists/tax-reasons`.
 */
export type TaxReason = CodeListEntry

const r = (code: string, en: string, ar: string = en): TaxReason => ({ code, en, ar })

/** VATZR-OM-01..16, for a zero-rated line. */
export const ZERO_RATED_REASONS: TaxReason[] = [
  r('VATZR-OM-01', 'Qualifying Supply of Food items specified by a decision from the Chairman'),
  r('VATZR-OM-02', 'Qualifying Supply of Medicines and medical equipment'),
  r('VATZR-OM-03', 'Supply of investment gold, silver, and platinum'),
  r('VATZR-OM-04', 'Supplies of international and intra GCC transport of Goods or passengers'),
  r(
    'VATZR-OM-05',
    'Supply of Services related to International and Intra GCC transportation of Goods or passengers',
  ),
  r('VATZR-OM-06', 'Supply of qualifying air, sea and land means of transport'),
  r('VATZR-OM-07', 'Supply of rescue planes, and rescue and assistance boats'),
  r('VATZR-OM-08', 'Supply of oil, oil derivatives and natural gas'),
  r('VATZR-OM-09', 'Export of service'),
  r('VATZR-OM-10', 'Direct export of goods'),
  r('VATZR-OM-11', 'Indirect export of goods'),
  r('VATZR-OM-12', 'Re-export of goods'),
  r('VATZR-OM-13', 'Supply from a Special Zone to a Special Zone, or within a Special Zone'),
  r('VATZR-OM-14', 'Supply from Mainland to Special Zone'),
  r('VATZR-OM-15', 'Customs Duty Suspension Statuses to a Special Zone'),
  r('VATZR-OM-16', 'Special Zone to Customs Duty Suspension Statuses'),
]

/** VATEX-OM-01..12, for an exempt line. */
export const EXEMPT_REASONS: TaxReason[] = [
  r('VATEX-OM-01', 'Qualifying Financial Services'),
  r('VATEX-OM-02', 'Educational Services and Related Goods and Services'),
  r('VATEX-OM-03', 'Healthcare Services and related Goods and Services'),
  r('VATEX-OM-04', 'Rental of properties for residential purposes'),
  r('VATEX-OM-05', 'Local Passenger Transport'),
  r('VATEX-OM-06', 'Undeveloped land (bare land)'),
  r('VATEX-OM-07', 'Resale of residential properties'),
  r(
    'VATEX-OM-08',
    'Imported goods supplied to diplomatic and consular bodies, international organizations, and the heads and members of diplomatic and consular bodies',
  ),
  r('VATEX-OM-09', 'Imports for the Armed Forces and Internal Security Forces'),
  r('VATEX-OM-10', 'Imported supplies for non-profit charities'),
  r('VATEX-OM-11', 'Import of returned goods'),
  r(
    'VATEX-OM-12',
    'Imported Goods in cases where the supply of such Goods is exempted from Tax or subject to Tax at a rate of zero percent in the Final Destination Point of Entry',
  ),
]

/** The list a tax category takes its reason from; undefined for a category that takes a code from none. */
export function taxReasonsFor(en16931Category: string): TaxReason[] | undefined {
  if (en16931Category === 'Z') return ZERO_RATED_REASONS
  if (en16931Category === 'E') return EXEMPT_REASONS
  return undefined
}
