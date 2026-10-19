/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * Fawtir's own contact details (CS-1): the console page (`/console/company-contact`) and the
 * public read every contact on the site and in the app comes from. Shapes follow
 * `src/lib/console/companyContact.ts` and `src/lib/companyContact.ts`. Version 1 is the backend's
 * seeded placeholder; a save answers the next version so the page can be clicked through, and
 * nothing is kept between requests.
 *
 * `MOCK_COMPANY_CONTACT=off` answers the public read 404, as a server without the setting does,
 * so the pages can be shown with their earlier values.
 */
const HISTORY = [
  {
    id: '7c1e0b5a-0000-4000-8000-000000000002',
    version: 2,
    supportEmail: 'fawtara@insight.om',
    supportPhone: '+968 0000 0000',
    websiteUrl: 'https://www.fawtir.om',
    addressEn: 'Al Rusayl 124, Sultanate of Oman',
    addressAr: 'الرسيل 124، سلطنة عُمان',
    linkedinUrl: 'https://www.linkedin.com/company/fawtir',
    instagramUrl: null,
    reason: 'Added the LinkedIn page',
    createdBy: 'u-other',
    createdAt: '2026-10-18T09:15:00Z',
  },
  {
    id: '7c1e0b5a-0000-4000-8000-000000000001',
    version: 1,
    supportEmail: 'fawtara@insight.om',
    supportPhone: '+968 0000 0000',
    websiteUrl: 'https://www.fawtir.om',
    addressEn: 'Al Rusayl 124, Sultanate of Oman',
    addressAr: 'الرسيل 124، سلطنة عُمان',
    linkedinUrl: null,
    instagramUrl: null,
    reason: 'Placeholders until the client gives the real contact details',
    createdBy: '00000000-0000-0000-0000-000000000000',
    createdAt: '2026-10-18T05:00:00Z',
  },
]

const CURRENT = HISTORY[0]
const off = process.env.MOCK_COMPANY_CONTACT === 'off'

/** The public read leaves the reason, the author and the row id in the console's. */
function publicView(contact) {
  const { id: _id, reason: _reason, createdBy: _by, createdAt: _at, ...shown } = contact
  return shown
}

export default [
  {
    match: '/api/v1/public/company-contact',
    reply: () =>
      off
        ? {
            status: 404,
            body: {
              type: 'https://api.fawtir.om/problems/resource-not-found',
              title: 'Not found',
              status: 404,
            },
          }
        : publicView(CURRENT),
  },
  { match: '/api/v1/platform/company-contact', reply: () => CURRENT },
  {
    match: '/api/v1/platform/company-contact/history',
    reply: ({ query }) => HISTORY.slice(0, Number(query.get('limit') ?? 50)),
  },
  {
    method: 'PUT',
    match: '/api/v1/platform/company-contact',
    reply: ({ body }) => ({
      ...CURRENT,
      ...body,
      id: '7c1e0b5a-0000-4000-8000-000000000003',
      version: CURRENT.version + 1,
      createdBy: 'u-nasser',
      createdAt: new Date().toISOString(),
    }),
  },
]
