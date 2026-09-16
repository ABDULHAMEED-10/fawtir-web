/**
 * The routes the responsive audit starts from.
 *
 * Only static paths live here. Every screen that needs a record id — `/invoices/:id` and its
 * ~40 siblings — is found by the audit itself, which follows the first link out of each list
 * screen. That keeps this list from going stale every time the sample data changes.
 */
export const SEED_ROUTES = [
  // Pre-login and onboarding. Already responsive; kept in so a regression here is caught.
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/verify-code',
  '/new-password',
  '/about-business',
  '/business-type',
  '/sub-business-type',
  '/business-identity',
  '/address-contact',
  '/plans',
  '/payment',
  '/fawtara-status',

  // The app.
  '/dashboard',
  '/pos',
  '/pos/payment',
  '/pos/done',
  '/pos/company',
  '/pos/today',
  '/pos/close',
  '/pos/refund',

  // Income.
  '/invoices',
  '/invoices/new',
  '/income/debit-notes',
  '/income/debit-notes/new',
  '/income/self-billing',
  '/income/self-billing/agreements',
  '/income/self-billing/new',
  '/income/reminders',
  '/income/reminders/settings',
  '/income/periodic',
  '/income/periodic/new',
  '/income/credit-notes',
  '/income/credit-notes/new',

  // Expenditure.
  '/expenditure/bills',
  '/expenditure/bills/upload',
  '/expenditure/bills/scan',
  '/expenditure/payments',
  '/expenditure/recurring-bills',
  '/expenditure/recurring-bills/new',
  '/expenditure/credit-notes',
  '/expenditure/credit-notes/upload',
  '/expenditure/debit-notes',
  '/expenditure/debit-notes/upload',
  '/expenditure/reminders',

  // Trade documents.
  '/trade-documents/quotations',
  '/trade-documents/quotations/new',
  '/trade-documents/order-forms',
  '/trade-documents/order-forms/new',
  '/trade-documents/delivery-notes',
  '/trade-documents/delivery-notes/new',

  // Contacts.
  '/customers',
  '/customers/new',
  '/suppliers',
  '/suppliers/new',
  '/suppliers/import',

  // Catalog and stock.
  '/catalog',
  '/catalog/new',
  '/catalog/upload',
  '/catalog/build',
  '/catalog/bundles',
  '/catalog/bundles/new',
  '/catalog/rules',
  '/catalog/rules/new',
  '/stock',

  // Insights.
  '/reports',
  '/reports/income',
  '/reports/expenditure',
  '/reports/cash-flow',
  '/reports/vat-tax',
  '/reports/compliance',
  '/reports/lists',

  // Compliance.
  '/compliance/activity',
  '/compliance/activity/call-log',
  '/compliance/activity/report',
  '/compliance/documents',
  '/compliance/documents/upload',

  // Settings.
  '/settings',
  '/settings/peppol',
  '/settings/company',
  '/settings/branches',
  '/settings/branches/new',
  '/settings/team',
  '/settings/team/invite',
  '/settings/roles',
  '/settings/roles/new',
  '/settings/plan',
  '/settings/bills',
  '/settings/activity-log',
  '/settings/export',
  '/settings/closing',
  '/settings/signing-in',
  '/settings/payment-reminders',
  '/settings/erp-mapping',
  '/settings/erp-mapping/fields',
  '/settings/erp-mapping/preview',
  '/settings/erp-mapping/certification',
  '/settings/erp-mapping/advanced',
  '/settings/erp-mapping/history',
  '/settings/erp-mapping/samples',
  '/settings/erp/connections',
  '/settings/erp/connections/new',
  '/settings/erp/connections/cx-odoo-ho',
  '/settings/erp/connections/cx-odoo-ho/mapping',
  '/settings/erp/connections/cx-odoo-ho/runs',
  '/settings/erp/connections/cx-odoo-ho/runs/run-ho-9',
  '/settings/erp/connections/cx-odoo-ho/records',
  '/settings/erp/connections/cx-odoo-ho/records/rec-381',
  '/settings/erp/connections/cx-odoo-ho/write-back',
  '/settings/erp/connections/cx-erpnext-salalah/settings',

  // The Fawtir console — a separate shell with its own navigation.
  '/console',
  '/console/tenants',
  '/console/queue',
  '/console/subscriptions',
  '/console/subscriptions/invoices',
  '/console/tenants/al-noor',
  '/console/tenants/al-bahja',
  '/console/plans',
  '/console/settings',
  '/console/settings?section=payments',
  '/console/onboarding',
  '/console/operators',

  // Sub-screens reached by a tab or an action rather than a plain link, so the crawl cannot find
  // them. The ids are real records from the sample data.
  '/catalog/flat-white/sells',
  '/catalog/flat-white/used',
  '/catalog/flat-white/changes',
  '/compliance/activity/INV-2041/resubmit',
  '/income/periodic/monthly-coffee-supply/edit',
  '/suppliers/muscat-roastery/edit',
  '/suppliers/muscat-roastery/purchase-order',
  '/suppliers/muscat-roastery/record-bill',
  '/suppliers/muscat-roastery/statement',
]

/** Phone, phone, tablet, small laptop, desktop, and the width the design was drawn at. */
export const WIDTHS = [360, 390, 768, 1024, 1280, 1440]

/** The band that must never change. Anything at or above this is gated by checksum. */
export const FROZEN_WIDTH = 1440

/**
 * Screens the checksum gate cannot judge, and why.
 *
 * The till used to be on this list: it hotlinked 24 product photographs from Wikimedia Commons, so
 * how much of each had decoded when the screenshot was taken varied with the network. Its tiles are
 * drawn in the app now, and it fingerprints like every other screen.
 */
export const UNSTABLE_ROUTES = [
  // `/payment` prints a renewal date worked out from the real clock (`getRenewalDate` in
  // `src/lib/pricing.ts`), so its render changes with the calendar and a fingerprint taken on one
  // day never matches the next. Every other date in the app comes from a fixed sample clock; this
  // one is the exception, which is worth deciding on separately rather than papering over here.
  '/payment',
]
