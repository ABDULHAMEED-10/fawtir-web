import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AddressContactPage } from './pages/AddressContactPage'
import { AboutBusinessPage } from './pages/AboutBusinessPage'
import { BusinessIdentityPage } from './pages/BusinessIdentityPage'
import { BusinessTypePage } from './pages/BusinessTypePage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { LoginCodePage } from './pages/LoginCodePage'
import { NewPasswordPage } from './pages/NewPasswordPage'
import { OperatorInvitationPage } from './pages/OperatorInvitationPage'
import { AccountEmailConfirmPage } from './pages/AccountEmailConfirmPage'
import { ACCOUNT_EMAIL_CONFIRM_ROUTE } from './lib/identity/accountEmail'
import { PlansPage } from './pages/PlansPage'
import { PaymentPage } from './pages/PaymentPage'
import { FawtaraStatusPage } from './pages/FawtaraStatusPage'
import { DashboardPage } from './pages/DashboardPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { BillsPage } from './pages/BillsPage'
import { BillDetailPage } from './pages/BillDetailPage'
import { UploadBillPage } from './pages/UploadBillPage'
import { ScanReceiptsPage } from './pages/ScanReceiptsPage'
import { PaymentRunPage } from './pages/PaymentRunPage'
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
import { RecordSupplierBillPage } from './pages/RecordSupplierBillPage'
import { ImportSuppliersPage } from './pages/ImportSuppliersPage'
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
  BillingPage,
  ActivityLogPage,
  ExportPage,
  ClosingPage,
  SigningInPage,
  AddBranchPage,
  InvitePage,
  MakeRolePage,
} from './pages/SettingsPage'
import { DocumentDetailPage } from './pages/DocumentDetailPage'
import { UploadDocumentPage } from './pages/UploadDocumentPage'
import { PaymentRunInvoicesPage } from './pages/PaymentRunInvoicesPage'
import { CreateInvoicePage } from './pages/CreateInvoicePage'
import { InvoiceDetailsPage } from './pages/InvoiceDetailsPage'
import { SelfBillingPage } from './pages/SelfBillingPage'
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
import { PaymentRemindersPage } from './pages/PaymentRemindersPage'
import { RemindersPage } from './pages/RemindersPage'
import { OrderFormDetailPage } from './pages/OrderFormDetailPage'
import { DeliveryNotesPage } from './pages/DeliveryNotesPage'
import { DeliveryNoteDetailPage } from './pages/DeliveryNoteDetailPage'
import { NewDebitNotePage } from './pages/NewDebitNotePage'
import { DebitNoteDetailPage } from './pages/DebitNoteDetailPage'
import { AgreementsPage } from './pages/AgreementsPage'
import { NewSelfBillPage } from './pages/NewSelfBillPage'
import { SelfBillDetailPage } from './pages/SelfBillDetailPage'
import { PeriodicInvoicesPage } from './pages/PeriodicInvoicesPage'
import { PeriodicInvoicePage } from './pages/PeriodicInvoicePage'
import { NewCreditNotePage } from './pages/NewCreditNotePage'
import { CreditNotesPage } from './pages/CreditNotesPage'
import { CreditNoteDetailsPage } from './pages/CreditNoteDetailsPage'
import { CustomersPage } from './pages/CustomersPage'
import { NewCustomerPage } from './pages/NewCustomerPage'
import { SuppliersPage } from './pages/SuppliersPage'
import { NewSupplierPage } from './pages/NewSupplierPage'
import { SignupPage } from './pages/SignupPage'
import { SignupPendingPage } from './pages/SignupPendingPage'
import { SignupReviewPage } from './pages/SignupReviewPage'
import { SubBusinessTypePage } from './pages/SubBusinessTypePage'
import {
  ConsolePlansPage,
  ConsoleSoonPage,
  OperationsPage,
  OperatorsPage,
  TenantsPage,
  VerificationCompanyPage,
  VerificationPage,
} from './pages/ConsolePage'
import { VerifyCodePage } from './pages/VerifyCodePage'

function App() {
  const { i18n } = useTranslation()
  const isRtl = i18n.language === 'ar' || i18n.language.startsWith('ar')

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-dvh font-sans text-text-primary">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/mfa" element={<LoginCodePage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-code" element={<VerifyCodePage />} />
          <Route path="/new-password" element={<NewPasswordPage />} />
          <Route path="/operator-invitation" element={<OperatorInvitationPage />} />
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
          <Route path="/expenditure/bills/scan" element={<ScanReceiptsPage />} />
          <Route path="/expenditure/payments" element={<PaymentRunPage />} />
          <Route path="/expenditure/recurring-bills" element={<RecurringBillsPage />} />
          <Route path="/expenditure/recurring-bills/new" element={<NewRecurringBillPage />} />
          <Route path="/expenditure/recurring-bills/:id" element={<RecurringBillDetailPage />} />
          <Route path="/expenditure/credit-notes" element={<SupplierCreditNotesPage />} />
          <Route path="/expenditure/credit-notes/upload" element={<UploadCreditNotePage />} />
          <Route path="/expenditure/credit-notes/:id" element={<SupplierCreditNoteDetailPage />} />
          <Route path="/expenditure/debit-notes" element={<SupplierDebitNotesPage />} />
          <Route path="/reports" element={<Navigate to="/reports/income" replace />} />
          <Route path="/reports/income" element={<ReportsIncomePage />} />
          <Route path="/reports/expenditure" element={<ReportsExpenditurePage />} />
          <Route path="/reports/cash-flow" element={<ReportsCashFlowPage />} />
          <Route path="/reports/vat-tax" element={<ReportsVatPage />} />
          <Route path="/reports/compliance" element={<ReportsCompliancePage />} />
          <Route path="/reports/lists" element={<ReportsListsPage />} />
          <Route path="/expenditure/debit-notes/upload" element={<UploadDebitNotePage />} />
          <Route path="/expenditure/debit-notes/:id" element={<SupplierDebitNoteDetailPage />} />
          <Route path="/expenditure/reminders" element={<ExpenditureRemindersPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/stock/:id" element={<StockDetailPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/upload" element={<UploadMenuPage />} />
          <Route path="/catalog/build" element={<BuildCatalogPage />} />
          <Route path="/catalog/new" element={<ItemFormPage mode="new" />} />
          <Route path="/catalog/rules" element={<PriceRulesPage />} />
          <Route path="/catalog/rules/new" element={<NewRulePage />} />
          <Route path="/catalog/bundles" element={<BundlesPage />} />
          <Route path="/catalog/bundles/new" element={<BundlePage />} />
          <Route path="/catalog/bundles/:id" element={<BundlePage />} />
          <Route path="/catalog/:id" element={<ItemFormPage mode="edit" />} />
          <Route path="/catalog/:id/sells" element={<ItemSellsPage />} />
          <Route path="/catalog/:id/used" element={<ItemUsedPage />} />
          <Route path="/catalog/:id/changes" element={<ItemChangesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/peppol" element={<PeppolTaxPage />} />
          <Route path="/settings/branches" element={<BranchesPage />} />
          <Route path="/settings/branches/new" element={<AddBranchPage />} />
          <Route path="/settings/branches/:id" element={<AddBranchPage />} />
          <Route path="/settings/company" element={<CompanyProfilePage />} />
          <Route path="/settings/team" element={<TeamPage />} />
          <Route path="/settings/team/invite" element={<InvitePage />} />
          <Route path="/settings/roles" element={<RolesPage />} />
          <Route path="/settings/roles/new" element={<MakeRolePage />} />
          <Route path="/settings/plan" element={<PlanPage />} />
          <Route path="/settings/bills" element={<BillingPage />} />
          <Route path="/settings/activity-log" element={<ActivityLogPage />} />
          <Route path="/settings/export" element={<ExportPage />} />
          <Route path="/settings/closing" element={<ClosingPage />} />
          <Route path="/settings/signing-in" element={<SigningInPage />} />
          <Route path="/compliance/activity" element={<ActivityPage />} />
          <Route path="/compliance/activity/call-log" element={<OtaCallLogPage />} />
          <Route path="/compliance/activity/call-log/:id" element={<OtaCallDetailPage />} />
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
          <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
          <Route path="/pos" element={<PosPage />} />
          <Route path="/pos/payment" element={<PosPaymentPage />} />
          <Route path="/pos/done" element={<PosDonePage />} />
          <Route path="/pos/company" element={<PosCompanyPage />} />
          <Route path="/pos/today" element={<PosTodayPage />} />
          <Route path="/pos/close" element={<PosClosePage />} />
          <Route path="/pos/refund" element={<PosRefundPage />} />
          <Route path="/income/debit-notes" element={<DebitNotesPage />} />
          <Route path="/trade-documents/quotations" element={<QuotationsPage />} />
          <Route path="/trade-documents/quotations/new" element={<NewQuotationPage />} />
          <Route path="/trade-documents/quotations/:id" element={<QuotationDetailPage />} />
          <Route path="/trade-documents/order-forms" element={<OrderFormsPage />} />
          <Route path="/trade-documents/order-forms/new" element={<NewOrderFormPage />} />
          <Route path="/trade-documents/order-forms/:id" element={<OrderFormDetailPage />} />
          <Route path="/trade-documents/delivery-notes" element={<DeliveryNotesPage />} />
          <Route path="/trade-documents/delivery-notes/new" element={<NewDeliveryNotePage />} />
          <Route path="/trade-documents/delivery-notes/:id" element={<DeliveryNoteDetailPage />} />
          <Route path="/income/debit-notes/new" element={<NewDebitNotePage />} />
          <Route path="/income/debit-notes/:id" element={<DebitNoteDetailPage />} />
          <Route path="/income/self-billing" element={<SelfBillingPage />} />
          <Route path="/income/self-billing/agreements" element={<AgreementsPage />} />
          <Route path="/income/self-billing/new" element={<NewSelfBillPage />} />
          <Route path="/income/self-billing/:id" element={<SelfBillDetailPage />} />
          <Route path="/settings/payment-reminders" element={<PaymentRemindersPage />} />
          <Route path="/income/reminders" element={<RemindersPage />} />
          <Route path="/income/reminders/settings" element={<PaymentRemindersPage />} />
          <Route path="/income/periodic" element={<PeriodicInvoicesPage />} />
          <Route path="/income/periodic/new" element={<PeriodicInvoicePage mode="create" />} />
          <Route path="/income/periodic/:id" element={<PeriodicInvoicePage mode="view" />} />
          <Route path="/income/periodic/:id/edit" element={<PeriodicInvoicePage mode="edit" />} />
          <Route path="/income/credit-notes" element={<CreditNotesPage />} />
          <Route path="/income/credit-notes/new" element={<NewCreditNotePage />} />
          <Route path="/income/credit-notes/:id" element={<CreditNoteDetailsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/new" element={<NewCustomerPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/suppliers/new" element={<NewSupplierPage />} />
          <Route path="/suppliers/import" element={<ImportSuppliersPage />} />
          <Route path="/suppliers/:slug/edit" element={<EditSupplierPage />} />
          <Route path="/suppliers/:slug/purchase-order" element={<NewPurchaseOrderPage />} />
          <Route path="/suppliers/:slug/record-bill" element={<RecordSupplierBillPage />} />
          <Route path="/suppliers/:slug/statement" element={<SupplierStatementPage />} />
          <Route path="/suppliers/:slug" element={<SupplierDetailPage />} />
          <Route path="/console" element={<OperationsPage />} />
          <Route path="/console/tenants" element={<TenantsPage />} />
          <Route path="/console/queue" element={<ConsoleSoonPage />} />
          <Route path="/console/incidents" element={<ConsoleSoonPage />} />
          <Route path="/console/onboarding" element={<VerificationPage />} />
          <Route path="/console/onboarding/:companyId" element={<VerificationCompanyPage />} />
          <Route path="/console/plans" element={<ConsolePlansPage />} />
          <Route path="/console/operators" element={<OperatorsPage />} />
          <Route path="/console/audit" element={<ConsoleSoonPage />} />
          <Route path="/console/settings" element={<ConsoleSoonPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
