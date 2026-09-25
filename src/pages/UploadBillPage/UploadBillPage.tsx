import { useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { BillFilePicker, BillIntakeForm } from '../../components/bills'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  discardIntake,
  intakePath,
  loadIntake,
  loadIntakeFile,
  type IntakeDto,
} from '../../api/expenditure/billIntake'
import { BILL_FILE_TYPES } from '../../lib/billIntake'
import { can, useSession } from '../../lib/session/session'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * Bills › Upload a bill (Figma 163:22397). The supplier's file goes up first; the person then
 * checks or types the bill beside it. Only a Peppol/UBL XML file fills fields in; a PDF or a
 * photo is not read, and the page says so instead of claiming it was. With `:intakeId`, an
 * upload saved for later comes back with its file and whatever was typed.
 */
export function UploadBillPage() {
  const { intakeId } = useParams()
  return (
    <AppShell>
      {intakeId ? <ResumeUpload key={intakeId} intakeId={intakeId} /> : <UploadBill />}
    </AppShell>
  )
}

type Uploaded = { intake: IntakeDto; file: File }

function ResumeUpload({ intakeId }: { intakeId: string }) {
  const read = useApiRead<Uploaded>(intakePath(intakeId), async () => {
    const intake = await loadIntake(intakeId)
    return { intake, file: await loadIntakeFile(intake) }
  })
  if (read.read.status === 'loading') {
    return (
      <Frame read={false}>
        <LoadingNotice />
      </Frame>
    )
  }
  if (read.read.status === 'failed') {
    return (
      <Frame read={false}>
        <ApiReadFailure error={read.read.error} retry={read.retry} />
      </Frame>
    )
  }
  // Confirmed since the link was made: the bill is the thing to look at, not its provenance.
  const billId = read.read.data.intake.confirmedBillId
  if (billId) return <Navigate to={`/expenditure/bills/${billId}`} replace />
  return <UploadBill resumed={read.read.data} />
}

function UploadBill({ resumed = null }: { resumed?: Uploaded | null }) {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const [uploaded, setUploaded] = useState<Uploaded | null>(resumed)
  const read = uploaded?.intake.extractionStatus === 'EXTRACTED'

  // "Replace the file": the stored upload goes, and the picker comes back for the next one.
  const replace = async () => {
    if (!uploaded) return
    await discardIntake(uploaded.intake.id).catch(() => undefined)
    setUploaded(null)
  }

  return (
    <Frame read={read ?? false}>
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
          onKept={() => navigate('/expenditure/bills?tab=needsAttention')}
          onReplace={() => void replace()}
        />
      )}
    </Frame>
  )
}

/** Breadcrumb and title. The title says whether anything was read out of the file. */
function Frame({ read, children }: { read: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/expenditure/bills"
          className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
        >
          {t('billDetail.breadcrumb')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">
          {t('uploadBill.breadcrumb')}
        </span>
      </div>
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t(read ? 'uploadBill.title' : 'uploadBill.titleTyped')}
        </h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
          {t(read ? 'uploadBill.subtitle' : 'billIntake.upload.subtitle')}
        </p>
      </div>
      {children}
    </div>
  )
}
