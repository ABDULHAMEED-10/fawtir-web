import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../../components/ui'
import { placeSentence } from '../../lib/removalRefusals'

/**
 * "Close {name}?" (Business Rules BR-2, BR-4; option (a), 21 Oct 2026): it closes now for new
 * documents, its records stay, and its paid place stays until the renewal with no refund and can
 * go to a new branch. Shared by the branch list's menu and the branch's own page.
 */
export function CloseBranchDialog({
  open,
  name,
  renewsOn,
  busy,
  failure,
  onCancel,
  onConfirm,
}: {
  open: boolean
  name: string
  renewsOn: string | null
  busy: boolean
  failure: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('removal.branch.title', { name })}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" size="md" onClick={onCancel}>
            {t('removal.cancel')}
          </Button>
          <Button size="md" disabled={busy} onClick={onConfirm}>
            {busy ? t('removal.saving') : t('removal.branch.confirm')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {t('removal.branch.body', { name })}
        </p>
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {placeSentence(t, 'removal.branch', 'place', renewsOn, i18n.language, name)}
        </p>
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {t('removal.branch.records')}
        </p>
        {failure ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {failure}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
