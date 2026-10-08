import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/ui'
import { CheckboxRow } from '../../components/form'
import type {
  ConfirmBankDetailsRequestDto,
  SupplierBankDetailsChangeDto,
} from '../../api/expenditure/suppliers'

/**
 * "Confirm bank details" for a change waiting for a second person (owner, 8 Oct 2026): the
 * previous and the new IBAN side by side, and, when the server asks for it (`checkRequired`), the
 * tick "I checked the new details with the supplier.", which is required and checked on press as
 * the other forms check theirs. The tick goes with the request; without it nothing is sent.
 */
export function ConfirmBankDetailsModal({
  change,
  onConfirm,
  onClose,
}: {
  change: SupplierBankDetailsChangeDto
  onConfirm: (body?: ConfirmBankDetailsRequestDto) => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState(false)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const confirm = async () => {
    if (inFlight.current) return
    if (change.checkRequired && !checked) {
      setMissing(true)
      return
    }
    inFlight.current = true
    setBusy(true)
    try {
      await onConfirm(change.checkRequired ? { checkedWithSupplier: true } : undefined)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('supplierForm.confirmBank')}
      footer={
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
          >
            {t('supplierForm.confirmBank')}
          </button>
        </div>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <IbanBox label={t('supplierForm.bankConfirm.previousIban')}>
          {change.previousIban ? (
            <span dir="ltr">{change.previousIban}</span>
          ) : (
            <span className="text-text-quaternary">
              {t('supplierForm.bankConfirm.notOnRecord')}
            </span>
          )}
        </IbanBox>
        <IbanBox label={t('supplierForm.bankConfirm.newIban')}>
          <span dir="ltr">{change.newIban}</span>
        </IbanBox>
      </dl>
      {change.checkRequired ? (
        // The sentence is longer than the row's one line at phone width, so it may wrap here.
        <div className="mt-5 flex flex-col gap-1 [&_label]:whitespace-normal">
          <CheckboxRow
            id="bank-checked-with-supplier"
            name="checkedWithSupplier"
            label={t('supplierForm.bankConfirm.checked')}
            checked={checked}
            onChange={(next) => {
              setChecked(next)
              if (next) setMissing(false)
            }}
          />
          {missing ? (
            <p className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
              {t('validation.required')}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}

function IbanBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-sm border border-border-subtle p-3">
      <dt className="text-xs font-medium leading-[1.2] text-text-tertiary">{label}</dt>
      <dd className="mt-1 break-all text-sm font-semibold leading-[1.3] text-text-primary">
        {children}
      </dd>
    </div>
  )
}
