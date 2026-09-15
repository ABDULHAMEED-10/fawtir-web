export type CustomerKind = 'business' | 'government' | 'consumer'

export type CustomerTabId = 'all' | CustomerKind

/** How the customer receives invoices. Consumers get a QR receipt; B2B/B2G go over Peppol. */
export type PeppolState = 'onPeppol' | 'notConnected' | 'qrReceipt'

/** Receivable state drives the colour of the amount cell. */
export type ReceivableState = 'overdue' | 'attention' | 'settled'

/**
 * Stand-ins for the shell's global search, which still indexes mock arrays (integration plan I-01
 * risk). The Customers list reads the API.
 */
export const CUSTOMER_ROWS: { id: string; name: string; subtitle: string }[] = [
  {
    id: 'salalah-beach-resort',
    name: 'Salalah Beach Resort',
    subtitle: 'VAT OM1100582341',
  },
  {
    id: 'qurum-business-center',
    name: 'Qurum Business Center',
    subtitle: 'VAT OM1100337812',
  },
  {
    id: 'muscat-grand-hotel',
    name: 'Muscat Grand Hotel LLC',
    subtitle: 'VAT OM1100447102',
  },
  {
    id: 'bahla-fort-restaurant',
    name: 'Bahla Fort Restaurant',
    subtitle: 'VAT OM1100771290',
  },
  {
    id: 'ministry-of-tourism',
    name: 'Ministry of Tourism',
    subtitle: 'B2G · via Peppol',
  },
  {
    id: 'ahmed-al-rawahi',
    name: 'Ahmed Al Rawahi',
    subtitle: 'B2C · QR receipt',
  },
]
