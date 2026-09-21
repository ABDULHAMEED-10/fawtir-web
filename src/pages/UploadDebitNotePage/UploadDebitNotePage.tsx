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
 * Expenditure › Debit notes › Upload (E-16).
 *
 * The same intake as a bill, confirmed as a **383**. See the credit-note upload for why the form
 * is shared rather than copied.
 *
 * A note confirmed here is UNCHECKED: uploading records the charge the supplier is making, it
 * does not accept it. The decision is taken on the note's own screen.
 */
export function UploadDebitNotePage() {
  return (
    <AppShell>
      <UploadDebitNote />
    </AppShell>
  )
}

function UploadDebitNote() {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const [uploaded, setUploaded] = useState<{ intake: IntakeDto; file: File } | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/expenditure/debit-notes"
          className="text-2xl font-medium leading-[1.2] text-primary-700 hover:text-primary-800"
        >
          {t('supplierDebitNotes.title')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">
          {t('supplierDebitNotes.upload.breadcrumb')}
        </span>
      </div>

      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('supplierDebitNotes.upload.breadcrumb')}
        </h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
          {t('supplierDebitNotes.upload.subtitle')}
        </p>
      </div>

      {!can(session, 'invoice.payment.manage') ? (
        <PermissionDeniedNotice />
      ) : uploaded === null ? (
        <BillFilePicker
          accept={BILL_FILE_TYPES}
          source="UPLOADED"
          title={t('supplierDebitNotes.upload.choose')}
          hint={t('billIntake.upload.hint')}
          onUploaded={([first]) => setUploaded(first)}
        />
      ) : (
        <BillIntakeForm
          intake={uploaded.intake}
          file={uploaded.file}
          documentTypeCode="383"
          cancelTo="/expenditure/debit-notes"
          onSaved={(note) => navigate(`/expenditure/debit-notes/${note.id}`)}
        />
      )}
    </div>
  )
}
