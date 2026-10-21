import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AddressContactPage } from './pages/AddressContactPage'
import { AboutBusinessPage } from './pages/AboutBusinessPage'
import { BusinessIdentityPage } from './pages/BusinessIdentityPage'
import { BusinessTypePage } from './pages/BusinessTypePage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { ContactPage, FeaturesPage, PricingPage } from './pages/SitePages'
import { LoginPage } from './pages/LoginPage'
import { LoginCodePage } from './pages/LoginCodePage'
import { NewPasswordPage } from './pages/NewPasswordPage'
import { OperatorInvitationPage } from './pages/OperatorInvitationPage'
import { CompanyInvitationPage } from './pages/CompanyInvitationPage'
import { AccountEmailConfirmPage } from './pages/AccountEmailConfirmPage'
import { ACCOUNT_EMAIL_CONFIRM_ROUTE } from './lib/identity/accountEmail'
import { COMPANY_INVITATION_ROUTE } from './lib/identity/operatorInvitation'
import { PlansPage } from './pages/PlansPage'
import { PaymentPage } from './pages/PaymentPage'
import { PayDonePage, PayPage } from './pages/PayPage'
import { PAY_DONE_ROUTE, PAY_ROUTE } from './lib/payLink'
import { FawtaraStatusPage } from './pages/FawtaraStatusPage'
import { DashboardPage } from './pages/DashboardPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { BillsPage } from './pages/BillsPage'
import { BillDetailPage } from './pages/BillDetailPage'
import { UploadBillPage } from './pages/UploadBillPage'
import { WaitingDocumentsPage } from './pages/WaitingDocumentsPage'
import { ScanReceiptsPage } from './pages/ScanReceiptsPage'
import { PaymentRunPage, PaymentRunsListPage } from './pages/PaymentRunPage'
import { RecurringBillsPage } from './pages/RecurringBillsPage'
import { NewRecurringBillPage } from './pages/NewRecurringBillPage'
import { RecurringBillDetailPage } from './pages/RecurringBillDetailPage'
import { SupplierCreditNotesPage } from './pages/SupplierCreditNotesPage'
import { UploadCreditNotePage } from './pages/UploadCreditNotePage'
import { SupplierCreditNoteDetailPage } from './pages/SupplierCreditNoteDetailPage'
import { SupplierDebitNotesPage } from './pages/SupplierDebitNotesPage'
import { SupplierDetailPage } from './pages/SupplierDetailPage'
import { EditSupplierPage } from './pages/EditSupplierPage'
import { NewPurchaseOrderPage } from './pages/NewPurchaseOrderPage'
import { PurchaseOrderDetailPage } from './pages/PurchaseOrderDetailPage'
import { RecordSupplierBillPage } from './pages/RecordSupplierBillPage'
import { ImportCustomersPage, ImportSuppliersPage } from './pages/StagedImportPage'
import { SupplierStatementPage } from './pages/SupplierStatementPage'
import { ReportsIncomePage } from './pages/ReportsIncomePage'
import { ReportsExpenditurePage } from './pages/ReportsExpenditurePage'
import { ReportsCashFlowPage } from './pages/ReportsCashFlowPage'
import { ReportsVatPage } from './pages/ReportsVatPage'
import { ReportsCompliancePage } from './pages/ReportsCompliancePage'
import { ReportsListsPage } from './pages/ReportsListsPage'
import { UploadDebitNotePage } from './pages/UploadDebitNotePage'
import { SupplierDebitNoteDetailPage } from './pages/SupplierDebitNoteDetailPage'
import { ExpenditureRemindersPage } from './pages/ExpenditureRemindersPage'
import { DocumentsPage } from './pages/DocumentsPage'
import {
  ActivityPage,
  ActivityEventPage,
  OtaCallLogPage,
  OtaCallDetailPage,
  TddResubmitPage,
  ComplianceReportPage,
} from './pages/ActivityPage'
import {
  CatalogPage,
  ItemFormPage,
  ItemSellsPage,
  ItemUsedPage,
  ItemChangesPage,
  ItemOptionsPage,
  BundlesPage,
  BundlePage,
  StockPage,
  StockDetailPage,
  PriceRulesPage,
  NewRulePage,
  UploadMenuPage,
  BuildCatalogPage,
} from './pages/CatalogPage'
import {
  SettingsPage,
  PeppolTaxPage,
  BranchesPage,
  CompanyProfilePage,
  TeamPage,
  RolesPage,
  PlanPage,
  DowngradeSwitchOffPage,
  ExtraDocumentsPage,
  PaidExtrasPage,
  BillingPage,
  ActivityLogPage,
  ExportPage,
  ClosingPage,
  SigningInPage,
  ApprovalPolicyPage,
  AddBranchPage,
  InvitePage,
  PersonPage,
  MakeRolePage,
} from './pages/SettingsPage'
import { DocumentDetailPage } from './pages/DocumentDetailPage'
import { UploadDocumentPage } from './pages/UploadDocumentPage'
import { PaymentRunInvoicesPage } from './pages/PaymentRunInvoicesPage'
import { CreateInvoicePage } from './pages/CreateInvoicePage'
import { InvoiceDetailsPage } from './pages/InvoiceDetailsPage'
import { SelfBillingPage } from './pages/SelfBillingPage'
import { NewSelfBillPage } from './pages/NewSelfBillPage'
import { DebitNotesPage } from './pages/DebitNotesPage'
import {
  PosPage,
  PosPaymentPage,
  PosDonePage,
  PosCompanyPage,
  PosTodayPage,
  PosClosePage,
  PosRefundPage,
} from './pages/PosPage'
import { QuotationsPage } from './pages/QuotationsPage'
import { NewQuotationPage } from './pages/NewQuotationPage'
import { QuotationDetailPage } from './pages/QuotationDetailPage'
import { OrderFormsPage } from './pages/OrderFormsPage'
import { NewOrderFormPage } from './pages/NewOrderFormPage'
import { NewDeliveryNotePage } from './pages/NewDeliveryNotePage'
import {
  ErpOverviewPage,
  ErpFieldsPage,
  ErpPreviewPage,
  ErpCertificationPage,
  ErpAdvancedPage,
  ErpHistoryPage,
  ErpSamplesPage,
  ErpConnectionsPage,
  ErpConnectPage,
  ErpBridgePage,
  ErpApiPushPage,
  ErpHomePage,
  ErpAccessPage,
  ErpDocumentsPage,
  ErpDocumentDetailPage,
  ErpAttentionPage,
  ErpRunsPage,
  ErpRunDetailPage,
  ConnectionOverviewPage,
  ConnectionMappingPage,
  ConnectionRunsPage,
  ConnectionRecordsPage,
  ConnectionWriteBackPage,
  ConnectionSettingsPage,
  ConnectionExtractionPage,
  ErpMappingGate,
} from './pages/ErpPage'
import { PaymentRemindersPage } from './pages/PaymentRemindersPage'
import { RemindersPage } from './pages/RemindersPage'
import { OrderFormDetailPage } from './pages/OrderFormDetailPage'
import { DeliveryNotesPage } from './pages/DeliveryNotesPage'
import { DeliveryNoteDetailPage } from './pages/DeliveryNoteDetailPage'
import { NewDebitNotePage } from './pages/NewDebitNotePage'
import { DebitNoteDetailPage } from './pages/DebitNoteDetailPage'
import { AgreementsPage } from './pages/AgreementsPage'
import { SelfBillDetailPage } from './pages/SelfBillDetailPage'
import { PeriodicInvoicesPage } from './pages/PeriodicInvoicesPage'
import { PeriodicInvoicePage } from './pages/PeriodicInvoicePage'
import { NewCreditNotePage, NewSelfBilledCreditNotePage } from './pages/NewCreditNotePage'
import { CreditNotesPage } from './pages/CreditNotesPage'
import { CreditNoteDetailsPage } from './pages/CreditNoteDetailsPage'
import { CustomersPage } from './pages/CustomersPage'
import { EditCustomerPage, NewCustomerPage } from './pages/NewCustomerPage'
import { SuppliersPage } from './pages/SuppliersPage'
import { NewSupplierPage } from './pages/NewSupplierPage'
import { SignupPage } from './pages/SignupPage'
import { ResumeSignupPage } from './pages/ResumeSignupPage'
import { RESUME_ROUTE } from './lib/identity/signupResume'
import { SignupPendingPage } from './pages/SignupPendingPage'
import { SignupReviewPage } from './pages/SignupReviewPage'
import { SubBusinessTypePage } from './pages/SubBusinessTypePage'
import {
  ConsolePlansPage,
  ConsoleBillingPaymentsPage,
  ConsoleRefundCasesPage,
  ConsoleBankAccountsPage,
  ConsoleBillingSettingsPage,
  ConsoleSellerPage,
  ConsoleCompanyContactPage,
  ConsoleDisconnectionsPage,
  ConsoleEnterprisePage,
  ConsoleEnterpriseTermsPage,
  ConsoleQueuePage,
  ConsoleIncidentsPage,
  ConsoleAuditPage,
  ConsoleErpPage,
  ConsoleErpConnectionPage,
  ConsoleOnboardPage,
  OperationsPage,
  OperatorsPage,
  TenantsPage,
  VerificationCompanyPage,
  VerificationPage,
  TenantDetailPage,
  ConsoleSettingsPage,
  ValidationPoliciesPage,
  ValidationPolicyPage,
} from './pages/ConsolePage'
import { VerifyCodePage } from './pages/VerifyCodePage'
import { PlanFromQuery, PlanGated } from './components/plan'
import { DemoModule } from './components/feedback/DemoModule'

function App() {
  const { i18n } = useTranslation()
  const isRtl = i18n.language === 'ar' || i18n.language.startsWith('ar')

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-dvh font-sans text-text-primary">
      <BrowserRouter>
        {/* Lets any screen be opened as another plan sees it: `?plan=starter`. */}
        <PlanFromQuery />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/mfa" element={<LoginCodePage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path={RESUME_ROUTE} element={<ResumeSignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-code" element={<VerifyCodePage />} />
          <Route path="/new-password" element={<NewPasswordPage />} />
          <Route path="/operator-invitation" element={<OperatorInvitationPage />} />
          <Route path={PAY_ROUTE} element={<PayPage />} />
          <Route path={PAY_DONE_ROUTE} element={<PayDonePage />} />
          <Route path={COMPANY_INVITATION_ROUTE} element={<CompanyInvitationPage />} />
          <Route path={ACCOUNT_EMAIL_CONFIRM_ROUTE} element={<AccountEmailConfirmPage />} />
          <Route path="/about-business" element={<AboutBusinessPage />} />
          <Route path="/business-type" element={<BusinessTypePage />} />
          <Route path="/sub-business-type" element={<SubBusinessTypePage />} />
          <Route path="/business-identity" element={<BusinessIdentityPage />} />
          <Route path="/address-contact" element={<AddressContactPage />} />
          <Route path="/signup-review" element={<SignupReviewPage />} />
          <Route path="/signup-pending" element={<SignupPendingPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/fawtara-status" element={<FawtaraStatusPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/expenditure/bills" element={<BillsPage />} />
          <Route path="/expenditure/bills/upload" element={<UploadBillPage />} />
          <Route path="/expenditure/bills/upload/:intakeId" element={<UploadBillPage />} />
          <Route path="/expenditure/bills/scan" element={<ScanReceiptsPage />} />
          <Route path="/expenditure/bills/waiting" element={<WaitingDocumentsPage />} />
          <Route path="/expenditure/payments" element={<PaymentRunsListPage />} />
          <Route path="/expenditure/payments/new" element={<PaymentRunPage />} />
          <Route path="/expenditure/payments/:runId" element={<PaymentRunPage />} />
          <Route
            path="/expenditure/recurring-bills"
            element={
              <PlanGated feature="recurringBills">
                <RecurringBillsPage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/recurring-bills/new"
            element={
              <PlanGated feature="recurringBills">
                <NewRecurringBillPage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/recurring-bills/:id/edit"
            element={
              <PlanGated feature="recurringBills">
                <NewRecurringBillPage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/recurring-bills/:id"
            element={
              <PlanGated feature="recurringBills">
                <RecurringBillDetailPage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/credit-notes"
            element={
              <PlanGated feature="supplierNotes">
                <SupplierCreditNotesPage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/credit-notes/upload"
            element={
              <PlanGated feature="supplierNotes">
                <UploadCreditNotePage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/credit-notes/:id"
            element={
              <PlanGated feature="supplierNotes">
                <SupplierCreditNoteDetailPage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/debit-notes"
            element={
              <PlanGated feature="supplierNotes">
                <SupplierDebitNotesPage />
              </PlanGated>
            }
          />
          <Route path="/reports" element={<Navigate to="/reports/income" replace />} />
          <Route path="/reports/income" element={<ReportsIncomePage />} />
          <Route path="/reports/expenditure" element={<ReportsExpenditurePage />} />
          <Route path="/reports/cash-flow" element={<ReportsCashFlowPage />} />
          <Route path="/reports/vat-tax" element={<ReportsVatPage />} />
          <Route path="/reports/compliance" element={<ReportsCompliancePage />} />
          <Route path="/reports/lists" element={<ReportsListsPage />} />
          <Route
            path="/expenditure/debit-notes/upload"
            element={
              <PlanGated feature="supplierNotes">
                <UploadDebitNotePage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/debit-notes/:id"
            element={
              <PlanGated feature="supplierNotes">
                <SupplierDebitNoteDetailPage />
              </PlanGated>
            }
          />
          <Route path="/expenditure/reminders" element={<ExpenditureRemindersPage />} />
          <Route path="/stock" element={<DemoModule module="stock"><StockPage /></DemoModule>} />
          <Route path="/stock/:id" element={<DemoModule module="stock"><StockDetailPage /></DemoModule>} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/upload" element={<DemoModule module="catalog"><UploadMenuPage /></DemoModule>} />
          <Route path="/catalog/build" element={<DemoModule module="catalog"><BuildCatalogPage /></DemoModule>} />
          <Route path="/catalog/new" element={<DemoModule module="catalog"><ItemFormPage mode="new" /></DemoModule>} />
          <Route path="/catalog/rules" element={<DemoModule module="catalog"><PriceRulesPage /></DemoModule>} />
          <Route path="/catalog/rules/new" element={<DemoModule module="catalog"><NewRulePage /></DemoModule>} />
          <Route path="/catalog/bundles" element={<DemoModule module="catalog"><BundlesPage /></DemoModule>} />
          <Route path="/catalog/bundles/new" element={<DemoModule module="catalog"><BundlePage /></DemoModule>} />
          <Route path="/catalog/bundles/:id" element={<DemoModule module="catalog"><BundlePage /></DemoModule>} />
          <Route path="/catalog/:id" element={<DemoModule module="catalog"><ItemFormPage mode="edit" /></DemoModule>} />
          <Route path="/catalog/:id/sells" element={<DemoModule module="catalog"><ItemSellsPage /></DemoModule>} />
          <Route path="/catalog/:id/used" element={<DemoModule module="catalog"><ItemUsedPage /></DemoModule>} />
          <Route path="/catalog/:id/changes" element={<DemoModule module="catalog"><ItemChangesPage /></DemoModule>} />
          <Route path="/catalog/:id/options" element={<DemoModule module="catalog"><ItemOptionsPage /></DemoModule>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/peppol" element={<PeppolTaxPage />} />
          <Route path="/settings/branches" element={<BranchesPage />} />
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
          <Route path="/settings/branches/:id" element={<AddBranchPage />} />
          <Route path="/settings/company" element={<CompanyProfilePage />} />
          <Route path="/settings/team" element={<TeamPage />} />
          <Route path="/settings/team/invite" element={<InvitePage />} />
          <Route path="/settings/team/:userId" element={<PersonPage />} />
          <Route path="/settings/roles" element={<RolesPage />} />
          <Route path="/settings/roles/new" element={<DemoModule module="makeRole"><MakeRolePage /></DemoModule>} />
          <Route path="/settings/plan" element={<PlanPage />} />
          <Route path="/settings/plan/switch-off" element={<DowngradeSwitchOffPage />} />
          <Route path="/settings/plan/extra-documents" element={<ExtraDocumentsPage />} />
          <Route path="/settings/plan/extras" element={<PaidExtrasPage />} />
          {/* Real subscription dates above; the bills prototype inside keeps its own ribbon. */}
          <Route path="/settings/bills" element={<BillingPage />} />
          <Route path="/settings/activity-log" element={<ActivityLogPage />} />
          <Route path="/settings/export" element={<DemoModule module="export"><ExportPage /></DemoModule>} />
          <Route path="/settings/closing" element={<DemoModule module="closing"><ClosingPage /></DemoModule>} />
          <Route path="/settings/signing-in" element={<SigningInPage />} />
          <Route path="/settings/approvals" element={<ApprovalPolicyPage />} />
          <Route path="/compliance/activity" element={<ActivityPage />} />
          <Route path="/compliance/activity/call-log" element={<DemoModule module="otaCallLog"><OtaCallLogPage /></DemoModule>} />
          <Route path="/compliance/activity/call-log/:id" element={<DemoModule module="otaCallLog"><OtaCallDetailPage /></DemoModule>} />
          <Route path="/compliance/activity/report" element={<ComplianceReportPage />} />
          <Route path="/compliance/activity/:id" element={<ActivityEventPage />} />
          <Route path="/compliance/activity/:id/resubmit" element={<TddResubmitPage />} />
          <Route path="/compliance/documents" element={<DocumentsPage />} />
          <Route path="/compliance/documents/upload" element={<UploadDocumentPage />} />
          <Route path="/compliance/documents/:id" element={<DocumentDetailPage />} />
          <Route
            path="/expenditure/payments/:runId/invoices"
            element={<PaymentRunInvoicesPage />}
          />
          <Route path="/expenditure/bills/:id" element={<BillDetailPage />} />
          <Route path="/invoices/new" element={<CreateInvoicePage />} />
          <Route path="/invoices/:id/edit" element={<CreateInvoicePage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
          <Route path="/pos" element={<DemoModule module="pos"><PosPage /></DemoModule>} />
          <Route path="/pos/payment" element={<DemoModule module="pos"><PosPaymentPage /></DemoModule>} />
          <Route path="/pos/done" element={<DemoModule module="pos"><PosDonePage /></DemoModule>} />
          <Route path="/pos/company" element={<DemoModule module="pos"><PosCompanyPage /></DemoModule>} />
          <Route path="/pos/today" element={<DemoModule module="pos"><PosTodayPage /></DemoModule>} />
          <Route path="/pos/close" element={<DemoModule module="pos"><PosClosePage /></DemoModule>} />
          <Route path="/pos/refund" element={<DemoModule module="pos"><PosRefundPage /></DemoModule>} />
          <Route path="/income/debit-notes" element={<DebitNotesPage />} />
          <Route
            path="/trade-documents/quotations"
            element={
              <PlanGated feature="tradeDocuments">
                <DemoModule module="tradeDocuments"><QuotationsPage /></DemoModule>
              </PlanGated>
            }
          />
          <Route
            path="/trade-documents/quotations/new"
            element={
              <PlanGated feature="tradeDocuments">
                <DemoModule module="tradeDocuments"><NewQuotationPage /></DemoModule>
              </PlanGated>
            }
          />
          <Route
            path="/trade-documents/quotations/:id"
            element={
              <PlanGated feature="tradeDocuments">
                <DemoModule module="tradeDocuments"><QuotationDetailPage /></DemoModule>
              </PlanGated>
            }
          />
          <Route
            path="/trade-documents/order-forms"
            element={
              <PlanGated feature="tradeDocuments">
                <DemoModule module="tradeDocuments"><OrderFormsPage /></DemoModule>
              </PlanGated>
            }
          />
          <Route
            path="/trade-documents/order-forms/new"
            element={
              <PlanGated feature="tradeDocuments">
                <DemoModule module="tradeDocuments"><NewOrderFormPage /></DemoModule>
              </PlanGated>
            }
          />
          <Route
            path="/trade-documents/order-forms/:id"
            element={
              <PlanGated feature="tradeDocuments">
                <DemoModule module="tradeDocuments"><OrderFormDetailPage /></DemoModule>
              </PlanGated>
            }
          />
          <Route
            path="/trade-documents/delivery-notes"
            element={
              <PlanGated feature="tradeDocuments">
                <DemoModule module="tradeDocuments"><DeliveryNotesPage /></DemoModule>
              </PlanGated>
            }
          />
          <Route
            path="/trade-documents/delivery-notes/new"
            element={
              <PlanGated feature="tradeDocuments">
                <DemoModule module="tradeDocuments"><NewDeliveryNotePage /></DemoModule>
              </PlanGated>
            }
          />
          <Route
            path="/trade-documents/delivery-notes/:id"
            element={
              <PlanGated feature="tradeDocuments">
                <DemoModule module="tradeDocuments"><DeliveryNoteDetailPage /></DemoModule>
              </PlanGated>
            }
          />
          <Route path="/income/debit-notes/new" element={<NewDebitNotePage />} />
          <Route path="/income/debit-notes/:id/edit" element={<NewDebitNotePage />} />
          <Route path="/income/debit-notes/:id" element={<DebitNoteDetailPage />} />
          <Route
            path="/expenditure/self-billing"
            element={
              <PlanGated feature="selfBilling">
                <SelfBillingPage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/self-billing/agreements"
            element={
              <PlanGated feature="selfBilling">
                <AgreementsPage />
              </PlanGated>
            }
          />
          {/* The design's dedicated composer (Figma 154:161180), writing a self-billed draft. */}
          <Route
            path="/expenditure/self-billing/new"
            element={
              <PlanGated feature="selfBilling">
                <NewSelfBillPage />
              </PlanGated>
            }
          />
          {/* A self-billed credit note, in the credit-note composer (D6), from an issued self-billed invoice. */}
          <Route
            path="/expenditure/self-billing/credit-notes/new"
            element={
              <PlanGated feature="selfBilling">
                <NewSelfBilledCreditNotePage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/self-billing/credit-notes/:id/edit"
            element={
              <PlanGated feature="selfBilling">
                <NewSelfBilledCreditNotePage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/self-billing/:id/edit"
            element={
              <PlanGated feature="selfBilling">
                <NewSelfBillPage />
              </PlanGated>
            }
          />
          <Route
            path="/expenditure/self-billing/:id"
            element={
              <PlanGated feature="selfBilling">
                <SelfBillDetailPage />
              </PlanGated>
            }
          />
          {/* Self-billing moved from Income to Expenditure (owner decision, 6 Oct 2026). The old
              addresses keep working, with the rest of the path and the query carried over. */}
          <Route path="/income/self-billing/*" element={<SelfBillingMovedRedirect />} />
          {/* One settings page, one address. It lived at both paths, so the Settings one now
              points at the Income one rather than rendering a second copy of it. */}
          <Route
            path="/settings/payment-reminders"
            element={<Navigate to="/income/reminders/settings" replace />}
          />
          <Route
            path="/settings/erp-mapping"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpMappingGate>
                  <ErpOverviewPage />
                </ErpMappingGate>
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp-mapping/fields"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpMappingGate>
                  <ErpFieldsPage />
                </ErpMappingGate>
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp-mapping/preview"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpMappingGate>
                  <ErpPreviewPage />
                </ErpMappingGate>
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp-mapping/certification"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpMappingGate>
                  <ErpCertificationPage />
                </ErpMappingGate>
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp-mapping/advanced"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpMappingGate>
                  <ErpAdvancedPage />
                </ErpMappingGate>
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp-mapping/history"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpMappingGate>
                  <ErpHistoryPage />
                </ErpMappingGate>
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp-mapping/samples"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpMappingGate>
                  <ErpSamplesPage />
                </ErpMappingGate>
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpConnectionsPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/bridge"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpBridgePage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpHomePage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/access"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpAccessPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/api-push"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpApiPushPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/documents"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpDocumentsPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/documents/:recordId"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpDocumentDetailPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/attention"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpAttentionPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/runs"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpRunsPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/runs/:runId"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpRunDetailPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/new"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ErpConnectPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/:id"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ConnectionOverviewPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/:id/mapping"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ConnectionMappingPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/:id/runs"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ConnectionRunsPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/:id/runs/:runId"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ConnectionRunsPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/:id/records"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ConnectionRecordsPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/:id/records/:recordId"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ConnectionRecordsPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/:id/write-back"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ConnectionWriteBackPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/:id/settings"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ConnectionSettingsPage />
              </PlanGated>
            }
          />
          <Route
            path="/settings/erp/connections/:id/extraction"
            element={
              <PlanGated feature="erpMapping" shell="settings">
                <ConnectionExtractionPage />
              </PlanGated>
            }
          />
          <Route path="/income/reminders" element={<RemindersPage />} />
          <Route path="/income/reminders/settings" element={<PaymentRemindersPage />} />
          <Route
            path="/income/periodic"
            element={
              <PlanGated feature="recurringInvoices">
                <PeriodicInvoicesPage />
              </PlanGated>
            }
          />
          <Route
            path="/income/periodic/new"
            element={
              <PlanGated feature="recurringInvoices">
                <PeriodicInvoicePage mode="create" />
              </PlanGated>
            }
          />
          <Route
            path="/income/periodic/:id"
            element={
              <PlanGated feature="recurringInvoices">
                <PeriodicInvoicePage mode="view" />
              </PlanGated>
            }
          />
          <Route
            path="/income/periodic/:id/edit"
            element={
              <PlanGated feature="recurringInvoices">
                <PeriodicInvoicePage mode="edit" />
              </PlanGated>
            }
          />
          <Route path="/income/credit-notes" element={<CreditNotesPage />} />
          <Route path="/income/credit-notes/new" element={<NewCreditNotePage />} />
          <Route path="/income/credit-notes/:id/edit" element={<NewCreditNotePage />} />
          <Route path="/income/credit-notes/:id" element={<CreditNoteDetailsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/new" element={<NewCustomerPage />} />
          <Route path="/customers/:id/edit" element={<EditCustomerPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/suppliers/new" element={<NewSupplierPage />} />
          <Route path="/suppliers/import" element={<ImportSuppliersPage />} />
          <Route path="/customers/import" element={<ImportCustomersPage />} />
          <Route path="/suppliers/:slug/edit" element={<EditSupplierPage />} />
          <Route path="/suppliers/:slug/purchase-order" element={<NewPurchaseOrderPage />} />
          <Route path="/expenditure/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="/suppliers/:slug/record-bill" element={<RecordSupplierBillPage />} />
          <Route path="/suppliers/:slug/statement" element={<SupplierStatementPage />} />
          <Route path="/suppliers/:slug" element={<SupplierDetailPage />} />
          <Route path="/console" element={<DemoModule module="console"><OperationsPage /></DemoModule>} />
          <Route path="/console/tenants" element={<TenantsPage />} />
          <Route path="/console/tenants/:id" element={<TenantDetailPage />} />
          <Route path="/console/tenants/:id/enterprise-terms" element={<ConsoleEnterpriseTermsPage />} />
          <Route path="/console/enterprise" element={<ConsoleEnterprisePage />} />
          {/* The sample-data subscription screens are retired: a company's subscription is on its
              tenant page, and payments have their own queue. Old links land there. */}
          <Route path="/console/subscriptions" element={<Navigate to="/console/tenants" replace />} />
          <Route path="/console/subscriptions/invoices" element={<Navigate to="/console/billing/payments" replace />} />
          <Route path="/console/queue" element={<DemoModule module="console"><ConsoleQueuePage /></DemoModule>} />
          <Route path="/console/incidents" element={<DemoModule module="console"><ConsoleIncidentsPage /></DemoModule>} />
          <Route path="/console/incidents/:id" element={<DemoModule module="console"><ConsoleIncidentsPage /></DemoModule>} />
          <Route path="/console/onboarding" element={<VerificationPage />} />
          <Route path="/console/onboarding/:companyId" element={<VerificationCompanyPage />} />
          <Route path="/console/plans" element={<ConsolePlansPage />} />
          <Route path="/console/billing/payments" element={<ConsoleBillingPaymentsPage />} />
          <Route path="/console/billing/refunds" element={<ConsoleRefundCasesPage />} />
          <Route path="/console/billing/accounts" element={<ConsoleBankAccountsPage />} />
          <Route path="/console/billing/settings" element={<ConsoleBillingSettingsPage />} />
          <Route path="/console/billing/seller" element={<ConsoleSellerPage />} />
          <Route path="/console/company-contact" element={<ConsoleCompanyContactPage />} />
          <Route path="/console/disconnections" element={<ConsoleDisconnectionsPage />} />
          <Route path="/console/operators" element={<OperatorsPage />} />
          <Route path="/console/policies" element={<ValidationPoliciesPage />} />
          <Route path="/console/policies/:type" element={<ValidationPolicyPage />} />
          <Route path="/console/audit" element={<DemoModule module="console"><ConsoleAuditPage /></DemoModule>} />
          <Route path="/console/erp" element={<ConsoleErpPage />} />
          <Route path="/console/erp/connections/:id" element={<ConsoleErpConnectionPage />} />
          {/* Kept so a bookmark does not 404; each says where ERP access is really changed. */}
          <Route path="/console/erp/templates" element={<ConsoleErpPage />} />
          <Route path="/console/erp/templates/:id" element={<ConsoleErpPage />} />
          <Route path="/console/erp/add-on-requests" element={<ConsoleErpPage />} />
          <Route path="/console/tenants/new" element={<ConsoleOnboardPage />} />
          <Route path="/console/settings" element={<DemoModule module="console"><ConsoleSettingsPage /></DemoModule>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App

/** `/income/self-billing/...` to `/expenditure/self-billing/...`, keeping the rest of the address. */
function SelfBillingMovedRedirect() {
  const { pathname, search, hash } = useLocation()
  const to =
    pathname.replace(/^\/income\/self-billing/, '/expenditure/self-billing') + search + hash
  return <Navigate to={to} replace />
}
