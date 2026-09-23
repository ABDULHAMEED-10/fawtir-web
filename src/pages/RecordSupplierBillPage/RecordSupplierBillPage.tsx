import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { BillFilePicker, BillIntakeForm } from '../../components/bills'
import { ApiReadFailure, LoadingNotice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import type { IntakeDto } from '../../api/expenditure/billIntake'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import { BILL_FILE_TYPES } from '../../lib/billIntake'
import { can, useSession } from '../../lib/session/session'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * A supplier › Record a bill (E-10). The same intake as Upload a bill with the supplier already
 * chosen. The bill's file comes first: the API only creates a bill from a stored file (D12a,
 * decision 2), so a bill typed from memory has nothing to attach later.
 */
export function RecordSupplierBillPage() {
  const { slug = '' } = useParams()
  return (
    <AppShell>
      <RecordBill id={slug} />
    </AppShell>
  )
}

function RecordBill({ id }: { id: string }) {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const supplier = useApiRead<SupplierDetailDto>(supplierPath(id), () => loadSupplier(id))
  const [uploaded, setUploaded] = useState<{ intake: IntakeDto; file: File } | null>(null)

  if (supplier.read.status === 'loading') return <LoadingNotice />
  if (supplier.read.status === 'failed') return <ApiReadFailure error={supplier.read.error} retry={supplier.retry} />
  const profile = supplier.read.data.profile
  const back = `/suppliers/${profile.id}`

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/suppliers" className="text-2xl font-medium leading-[1.2] text-primary-700 hover:text-primary-800">
          {t('suppliersPage.title')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <Link to={back} className="text-2xl font-medium leading-[1.2] text-primary-700 hover:text-primary-800">
          {profile.displayName}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">{t('recordBill.title')}</span>
      </div>

      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('recordBill.title')}</h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">{t('billIntake.record.subtitle', { name: profile.displayName })}</p>
      </div>

      {!can(session, 'invoice.payment.manage') ? (
        <PermissionDeniedNotice />
      ) : uploaded === null ? (
        <BillFilePicker
          accept={BILL_FILE_TYPES}
          source="UPLOADED"
          title={t('billIntake.record.choose')}
          hint={t('billIntake.upload.hint')}
          onUploaded={([first]) => setUploaded(first)}
        />
      ) : (
        <BillIntakeForm
          intake={uploaded.intake}
          file={uploaded.file}
          lockedSupplier={{ id: profile.id, name: profile.displayName, vatNumber: profile.vatNumber }}
          cancelTo={back}
          onSaved={(bill) => navigate(`/expenditure/bills/${bill.id}`)}
          onKept={() => navigate('/expenditure/bills?tab=needsAttention')}
        />
      )}
    </div>
  )
}
