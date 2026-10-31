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
import type { SavedNoteState } from '../SupplierCreditNoteDetailPage/SupplierCreditNoteDetailPage'

/** The sentences said on the credit note's page after it was set against a debit note. */
const DEBIT_NOTE_DONE = new Set([
  'supplierCreditNotes.upload.savedAppliedDebitNote',
  'supplierCreditNotes.upload.savedClosesRefusedDebitNote',
])

/**
 * Expenditure > Credit notes > Upload (E-15), on its frame (Figma 163:19080).
 *
 * The same intake a bill goes through, confirmed as a **381** instead of a 380, drawn as the
 * frame draws it: the file beside the note, which bill it corrects and what that changes, the
 * lines, how to use the credit, and its effect on the VAT return. The first step, choosing the
 * file, is the picker every intake starts from; the frame shows the screen after it.
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
      <NoteBreadcrumb
        to="/expenditure/credit-notes"
        parent={t('supplierCreditNotes.title')}
        current={t('supplierCreditNotes.upload.breadcrumb')}
      />

      {/* 16 px under the breadcrumb, as on a note's own page: any closer and the Arabic
          breadcrumb runs into the title. */}
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {uploaded
            ? t('supplierCreditNotes.upload.title')
            : t('supplierCreditNotes.upload.breadcrumb')}
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
          hint={t('billIntake.upload.hint', { mb: INTAKE_LIVE_MAX_MB })}
          onUploaded={([first]) => setUploaded(first)}
        />
      ) : (
        <SupplierNoteIntake
          kind="credit"
          intake={uploaded.intake}
          file={uploaded.file}
          cancelTo="/expenditure/credit-notes"
          onReplace={() => setUploaded(null)}
          // The confirmed row is a credit note, so it opens on the credit-note detail rather
          // than the bill detail: the same id, but the screen that knows it reduces what is owed.
          // Set against a debit note, the detail says once what was done (owner, 9 Oct 2026).
          onSaved={(note, doneKey, doneValues) =>
            navigate(`/expenditure/credit-notes/${note.id}`, {
              state: DEBIT_NOTE_DONE.has(doneKey)
                ? ({ saved: { key: doneKey, values: doneValues } } satisfies SavedNoteState)
                : null,
            })
          }
        />
      )}
    </div>
  )
}
