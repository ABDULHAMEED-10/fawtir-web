import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { BillFilePicker, BillIntakeForm } from '../../components/bills'
import { PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import type { IntakeDto } from '../../api/expenditure/billIntake'
import { BILL_FILE_TYPES } from '../../lib/billIntake'
import { can, useSession } from '../../lib/session/session'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * Expenditure › Credit notes › Upload (E-15).
 *
 * The same intake a bill goes through, confirmed as a **381** instead of a 380. One endpoint takes
 * all three document types and the fields are identical — a supplier, a number, a date, lines and
 * a total — so this is the bill upload with the type stated and the destination changed. Reusing
 * it is not a shortcut: a second form would be a second place for the supplier match, the
 * duplicate check and the line arithmetic to drift.
 *
 * Nothing is read out of a PDF or a photo; only a Peppol/UBL XML file fills fields in.
 */
export function UploadCreditNotePage() {
  return (
    <AppShell>
      <UploadCreditNote />
    </AppShell>
  )
}

function UploadCreditNote() {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const [uploaded, setUploaded] = useState<{ intake: IntakeDto; file: File } | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/expenditure/credit-notes"
          className="text-2xl font-medium leading-[1.2] text-primary-700 hover:text-primary-800"
        >
          {t('supplierCreditNotes.title')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">
          {t('supplierCreditNotes.upload.breadcrumb')}
        </span>
      </div>

      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('supplierCreditNotes.upload.breadcrumb')}
        </h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
          {t('supplierCreditNotes.upload.subtitle')}
        </p>
      </div>

      {!can(session, 'invoice.payment.manage') ? (
        <PermissionDeniedNotice />
      ) : uploaded === null ? (
        <BillFilePicker
          accept={BILL_FILE_TYPES}
          source="UPLOADED"
          title={t('supplierCreditNotes.upload.choose')}
          hint={t('billIntake.upload.hint')}
          onUploaded={([first]) => setUploaded(first)}
        />
      ) : (
        <BillIntakeForm
          intake={uploaded.intake}
          file={uploaded.file}
          documentTypeCode="381"
          cancelTo="/expenditure/credit-notes"
          // The confirmed row is a credit note, so it is opened on the credit-note detail rather
          // than the bill detail: the same id, but the screen that knows it reduces what is owed.
          onSaved={(note) => navigate(`/expenditure/credit-notes/${note.id}`)}
        />
      )}
    </div>
  )
}
