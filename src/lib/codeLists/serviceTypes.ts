import type { CodeListEntry } from './codeList'

/**
 * Service types, code list CL-12-OM (IBR-155-OM; `cac:ItemSpecificationDocumentReference` with
 * scheme MP). The 21 codes and English names of the published PINT-OM list ("ServiceType").
 * 00000000 is "Other". A service line needs one only on an export of services; every other
 * services line takes 00000000 from the backend. Arabic names are not published: the English
 * name stands in until they are added.
 *
 * TODO(backend): replace with `GET /v1/code-lists/service-types?q=`.
 */
export type ServiceType = CodeListEntry

const s = (code: string, en: string, ar: string = en): ServiceType => ({ code, en, ar })

export const SERVICE_TYPES: ServiceType[] = [
  s('00000000', 'Other'),
  s('64000000', 'Financial Instruments, Products, Contracts and Agreements'),
  s('70000000', 'Farming, Fishing, Forestry and Wildlife Services'),
  s('71000000', 'Mining and Oil and Gas Services'),
  s('72000000', 'Building and Facility Construction and Maintenance Services'),
  s('73000000', 'Industrial Production and Manufacturing Services'),
  s('76000000', 'Industrial Cleaning Services'),
  s('77000000', 'Environmental Services'),
  s('78000000', 'Transportation, Storage and Mail Services'),
  s('80000000', 'Management, Business and Administrative Services'),
  s('81000000', 'Engineering, Research and Technology Services'),
  s('82000000', 'Editorial, Design, Graphic and Fine Art Services'),
  s('83000000', 'Public Utilities and Public Sector Services'),
  s('84000000', 'Financial and Insurance Services'),
  s('85000000', 'Healthcare Services'),
  s('86000000', 'Education and Training Services'),
  s('90000000', 'Travel, Food, Lodging and Entertainment Services'),
  s('91000000', 'Personal and Domestic Services'),
  s('92000000', 'Defense, Security and Safety Services'),
  s('93000000', 'Politics and Civic Affairs Services'),
  s('94000000', 'Organizations and Clubs'),
]
