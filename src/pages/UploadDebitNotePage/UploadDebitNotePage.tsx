import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { BillFilePicker } from '../../components/bills'
import { PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { NoteBreadcrumb } from '../../components/debit/NoteParts'
import { SupplierNoteIntake } from '../../components/debit/SupplierNoteIntake'
import { INTAKE_LIVE_MAX_MB, type IntakeDto } from '../../api/expenditure/billIntake'
import { BILL_FILE_TYPES } from '../../lib/billIntake'
import { can, useSession } from '../../lib/session/session'

/**
 * Expenditure > Debit notes > Upload (E-16), on its frame (Figma 163:20010).
 *
 * The same intake as a bill, confirmed as a **383**, drawn as the frame draws it: the file, which
 * bill it adds to and what that would change, the automatic read of the charge, the lines, and
 * the decision. Uploading records the charge; accepting or refusing it is the decision the frame
 * closes with, taken on the note once it is saved (`POST /debit-notes/{id}/accept` or `/refuse`),
 * or left for later with "Put it on hold".
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
      <NoteBreadcrumb
        to="/expenditure/debit-notes"
        parent={t('supplierDebitNotes.title')}
        current={t('supplierDebitNotes.upload.breadcrumb')}
      />

      {/* 16 px under the breadcrumb, as on a note's own page: any closer and the Arabic
          breadcrumb runs into the title. */}
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {uploaded
            ? t('supplierDebitNotes.upload.title')
            : t('supplierDebitNotes.upload.breadcrumb')}
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
          hint={t('billIntake.upload.hint', { mb: INTAKE_LIVE_MAX_MB })}
          onUploaded={([first]) => setUploaded(first)}
        />
      ) : (
        <SupplierNoteIntake
          kind="debit"
          intake={uploaded.intake}
          file={uploaded.file}
          cancelTo="/expenditure/debit-notes"
          onReplace={() => setUploaded(null)}
          onSaved={(note) => navigate(`/expenditure/debit-notes/${note.id}`)}
        />
      )}
    </div>
  )
}
