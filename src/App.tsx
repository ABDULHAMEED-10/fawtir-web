import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AddressContactPage } from './pages/AddressContactPage'
import { AboutBusinessPage } from './pages/AboutBusinessPage'
import { BusinessIdentityPage } from './pages/BusinessIdentityPage'
import { BusinessTypePage } from './pages/BusinessTypePage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NewPasswordPage } from './pages/NewPasswordPage'
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
import { ActivityPage, ActivityEventPage } from './pages/ActivityPage'
import { DocumentDetailPage } from './pages/DocumentDetailPage'
import { UploadDocumentPage } from './pages/UploadDocumentPage'
import { PaymentRunInvoicesPage } from './pages/PaymentRunInvoicesPage'
import { CreateInvoicePage } from './pages/CreateInvoicePage'
import { InvoiceDetailsPage } from './pages/InvoiceDetailsPage'
import { SelfBillingPage } from './pages/SelfBillingPage'
import { DebitNotesPage } from './pages/DebitNotesPage'
import { PosPage } from './pages/PosPage'
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
import { SubBusinessTypePage } from './pages/SubBusinessTypePage'
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
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-code" element={<VerifyCodePage />} />
          <Route path="/new-password" element={<NewPasswordPage />} />
          <Route path="/about-business" element={<AboutBusinessPage />} />
          <Route path="/business-type" element={<BusinessTypePage />} />
          <Route path="/sub-business-type" element={<SubBusinessTypePage />} />
          <Route path="/business-identity" element={<BusinessIdentityPage />} />
          <Route path="/address-contact" element={<AddressContactPage />} />
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
          <Route path="/compliance/activity" element={<ActivityPage />} />
          <Route path="/compliance/activity/:id" element={<ActivityEventPage />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
