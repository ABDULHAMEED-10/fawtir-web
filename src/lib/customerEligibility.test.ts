import { describe, expect, it } from 'vitest'
import { missingCustomerFields } from './customerEligibility'

const say = (key: string) => key.replace('invoiceDraft.missing.', '').replace('part.', '')
const join = (items: string[]) => items.join(' and ')

describe('why a customer cannot be invoiced', () => {
  it('gathers the parts of one address into a single phrase', () => {
    const phrases = missingCustomerFields(
      ['invoiceAddress.countryCode', 'invoiceAddress.cityName', 'invoiceAddress.streetName'],
      say,
      join,
    )
    expect(phrases).toEqual([
      { key: 'invoiceDraft.missing.invoiceAddress', values: { parts: 'country and city and street' } },
    ])
  })

  it('keeps the two addresses and the plain fields apart, in the order the server gave them', () => {
    const phrases = missingCustomerFields(
      [
        'invoiceAddress.cityName',
        'details.vatRegistrationNumber',
        'deliveryAddress.streetName',
        'deliveryAddress.countryCode',
        'details.peppolParticipantId',
      ],
      say,
      join,
    )
    expect(phrases).toEqual([
      { key: 'invoiceDraft.missing.invoiceAddress', values: { parts: 'city' } },
      { key: 'invoiceDraft.missing.vatNumber' },
      { key: 'invoiceDraft.missing.deliveryAddress', values: { parts: 'street and country' } },
      { key: 'invoiceDraft.missing.peppolId' },
    ])
  })

  it('shows a path this build does not know rather than dropping the gap', () => {
    expect(missingCustomerFields(['details.somethingNew'], say, join)).toEqual([
      { key: 'invoiceDraft.missing.unknown', values: { path: 'details.somethingNew' } },
    ])
  })
})
