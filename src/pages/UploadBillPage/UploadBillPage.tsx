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
 * Bills › Upload a bill (E-10). The supplier's file goes up first; the person then types the bill
 * beside it. Nothing is read out of a PDF or a photo — only a Peppol/UBL XML file fills fields in.
 */
export function UploadBillPage() {
  return (
    <AppShell>
      <UploadBill />
    </AppShell>
  )
}

function UploadBill() {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const [uploaded, setUploaded] = useState<{ intake: IntakeDto; file: File } | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/expenditure/bills" className="text-2xl font-medium leading-[1.2] text-primary-700 hover:text-primary-800">
          {t('billDetail.breadcrumb')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">{t('uploadBill.breadcrumb')}</span>
      </div>

      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('uploadBill.breadcrumb')}</h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">{t('billIntake.upload.subtitle')}</p>
      </div>

      {!can(session, 'invoice.payment.manage') ? (
        <PermissionDeniedNotice />
      ) : uploaded === null ? (
        <BillFilePicker
          accept={BILL_FILE_TYPES}
          source="UPLOADED"
          title={t('billIntake.upload.choose')}
          hint={t('billIntake.upload.hint')}
          onUploaded={([first]) => setUploaded(first)}
        />
      ) : (
        <BillIntakeForm
          intake={uploaded.intake}
          file={uploaded.file}
          cancelTo="/expenditure/bills"
          onSaved={(bill) => navigate(`/expenditure/bills/${bill.id}`)}
        />
      )}
    </div>
  )
}
