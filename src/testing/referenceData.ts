import type { ReferenceDataDto } from '../api/reference/referenceData'

/**
 * The catalogues V193 seeds, as V210 left them (AE0 and G0 withdrawn, O0 without a required
 * reason, NET15 added), for tests.
 *
 * Test data, not a fallback: production reads these from `/v1/reference-data`. The figures are the
 * seeded ones rather than convenient round numbers, so a test that passes here fails for the same
 * reason it would against the real catalogue.
 */
export const SEEDED_REFERENCE: ReferenceDataDto = {
  taxCategories: [
    { code: 'S5', en16931Category: 'S', rate: '5', exemptionReasonRequired: false, active: true },
    { code: 'Z0', en16931Category: 'Z', rate: '0', exemptionReasonRequired: false, active: true },
    { code: 'E0', en16931Category: 'E', rate: '0', exemptionReasonRequired: true, active: true },
    { code: 'O0', en16931Category: 'O', rate: '0', exemptionReasonRequired: false, active: true },
    { code: 'AE0', en16931Category: 'AE', rate: '0', exemptionReasonRequired: true, active: false },
    { code: 'G0', en16931Category: 'G', rate: '0', exemptionReasonRequired: true, active: false },
  ],
  units: ['EA', 'KGM', 'LTR', 'BG', 'BX', 'SA', 'PK', 'HUR', 'DAY', 'MTR'].map((code) => ({
    code,
    active: true,
  })),
  paymentTerms: [
    { code: 'NET0', netDays: 0, active: true },
    { code: 'NET7', netDays: 7, active: true },
    { code: 'NET14', netDays: 14, active: true },
    { code: 'NET15', netDays: 15, active: true },
    { code: 'NET30', netDays: 30, active: true },
    { code: 'NET45', netDays: 45, active: true },
    { code: 'NET60', netDays: 60, active: true },
  ],
  paymentMethods: ['30', '10', '20', '48', '68'].map((code) => ({ code, active: true })),
}

export const SEEDED_TAX_CATEGORIES = SEEDED_REFERENCE.taxCategories
