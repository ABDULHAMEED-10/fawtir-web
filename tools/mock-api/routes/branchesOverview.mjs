/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file outside tests;
 * only `tools/mock-api/server.mjs` loads it.
 *
 * Settings › Branches: `GET /v1/branches/overview` in the shape `BranchOverviewDto` in
 * `src/api/settings/branches.ts`. The Head Branch Fawtir created at approval carries `headBranch`
 * and its Arabic name (BR-1, BR-2); an ordinary branch has no Arabic name until an Administrator
 * gives one. Branch ids are the picker's in `drafts.mjs`.
 */
const row = (id, code, name, extra = {}) => ({
  id,
  code,
  name,
  headOffice: false,
  active: true,
  closedOn: null,
  invoicePrefix: code,
  nextNumber: 1,
  invoicesThisMonth: 0,
  invoicedThisMonth: 0,
  people: 0,
  devices: 0,
  headBranch: false,
  nameAr: null,
  ...extra,
})

export const BRANCHES_OVERVIEW = {
  openCount: 3,
  everCount: 4,
  peopleAcross: 4,
  invoicesThisMonth: 57,
  branches: [
    row('b-main', 'MAIN', 'Al Bahja Coffee (Main)', {
      headOffice: true,
      headBranch: true,
      nameAr: 'قهوة البهجة (الفرع الرئيسي)',
      nextNumber: 412,
      invoicesThisMonth: 38,
      invoicedThisMonth: 4210.5,
      people: 3,
      devices: 2,
    }),
    row('b-nizwa', 'NIZWA', 'Al Bahja Coffee (Nizwa)', {
      nameAr: 'قهوة البهجة (نزوى)',
      nextNumber: 131,
      invoicesThisMonth: 19,
      invoicedThisMonth: 1875.25,
      people: 4,
      devices: 1,
    }),
    row('b-seeb', 'SEEB', 'Al Bahja Coffee (Seeb)', { people: 1 }),
    row('b-sohar', 'SOHAR', 'Al Bahja Roastery (Sohar)', {
      active: false,
      closedOn: '2026-09-30',
      nextNumber: 58,
    }),
  ],
}

export default [{ match: '/api/v1/branches/overview', reply: () => BRANCHES_OVERVIEW }]
