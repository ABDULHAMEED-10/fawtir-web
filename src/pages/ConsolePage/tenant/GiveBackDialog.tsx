import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox, Input } from '../../../components/ui'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { formatCount, formatDate } from '../../../lib/format'
import {
  GIVE_BACK_MAX_DOCUMENTS,
  describeCompanySubscriptionFailure,
  findIssuedDocuments,
  giveBackDocuments,
  type CompanyExtraDocumentsDto,
  type IssuedDocumentDto,
} from '../../../lib/console/companySubscription'
import { OperatorReasonDialog } from '../operators/OperatorReasonDialog'

const K = 'console.companySubscription.giveBack.'

const TYPES = new Set([
  'INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'SELF_BILLED_INVOICE',
  'SELF_BILLED_CREDIT_NOTE',
])

type Lookup =
  { status: 'loading' } | { status: 'ready'; rows: IssuedDocumentDto[] } | { status: 'failed' }

/**
 * Give back documents a Fawtir platform fault cost the customer (Business Rules AL-F4, OP-1,
 * CON-10; plan v4 §6). The operator finds the company's issued documents by number, ticks the ones
 * the fault made them cancel and reissue, and gives the reason; exactly that many documents are
 * added to the current allowance month and end with it. A document already given back cannot be
 * ticked, and the server refuses it a second time anyway. Never automatic.
 */
export function GiveBackDialog({
  tenantId,
  periodEnd,
  onDone,
  onClose,
}: {
  tenantId: string
  periodEnd: string
  onDone: (answer: CompanyExtraDocumentsDto) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const [number, setNumber] = useState('')
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' })
  // Kept across searches: what was ticked under one number stays ticked under the next.
  const [chosen, setChosen] = useState<Map<string, IssuedDocumentDto>>(new Map())
  const [chosenError, setChosenError] = useState<string | undefined>()
  const latest = useRef(0)
  const n = (value: number) => formatCount(value, i18n.language)
  const day = (iso: string) => formatDate(iso, i18n.language)

  const search = (part: string) => {
    const ticket = ++latest.current
    setLookup({ status: 'loading' })
    findIssuedDocuments(tenantId, part).then(
      (rows) => {
        if (ticket === latest.current) setLookup({ status: 'ready', rows })
      },
      () => {
        if (ticket === latest.current) setLookup({ status: 'failed' })
      },
    )
  }

  // The newest issued documents, before anything is typed.
  useEffect(() => {
    search('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const toggle = (row: IssuedDocumentDto, on: boolean) => {
    setChosenError(undefined)
    setChosen((current) => {
      const next = new Map(current)
      if (on) next.set(row.id, row)
      else next.delete(row.id)
      return next
    })
  }

  const typeLabel = (type: string) => t(`${K}type.${TYPES.has(type) ? type : 'OTHER'}`)

  return (
    <OperatorReasonDialog<CompanyExtraDocumentsDto>
      formId="company-extra-documents-give-back"
      title={t(`${K}title`)}
      body={t(`${K}body`, { date: day(periodEnd) })}
      fields={
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-0 flex-1 basis-[200px]">
              <Input
                bordered
                name="number"
                label={t(`${K}number`)}
                autoComplete="off"
                maxLength={50}
                hint={t(`${K}numberHint`)}
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  // Enter looks the number up; it does not send the give-back.
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    search(number)
                  }
                }}
              />
            </div>
            <ConsoleButton
              type="button"
              size="md"
              variant="secondary"
              onClick={() => search(number)}
            >
              {t(`${K}search`)}
            </ConsoleButton>
          </div>

          <div
            data-field="documents"
            tabIndex={-1}
            aria-live="polite"
            className="flex max-h-[260px] flex-col gap-2 overflow-y-auto rounded-sm border border-border-subtle p-3"
          >
            {lookup.status === 'loading' ? (
              <p role="status" className="text-sm font-medium text-text-tertiary">
                {t(`${K}loading`)}
              </p>
            ) : lookup.status === 'failed' ? (
              <p className="text-sm font-medium text-danger-700">{t(`${K}failed`)}</p>
            ) : lookup.rows.length === 0 ? (
              <p className="text-sm font-medium text-text-tertiary">{t(`${K}none`)}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lookup.rows.map((row) => (
                  <li key={row.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <Checkbox
                      label={row.number}
                      className="!text-sm !font-semibold !text-text-primary"
                      checked={chosen.has(row.id)}
                      disabled={row.alreadyGivenBack}
                      onChange={(event) => toggle(row, event.target.checked)}
                    />
                    <span className="text-xs font-medium text-text-tertiary">
                      {[
                        typeLabel(row.type),
                        t(`${K}issuedOn`, { date: day(row.issuedOn) }),
                        row.alreadyGivenBack ? t(`${K}alreadyGivenBack`) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-sm font-semibold text-text-primary">
            {t(`${K}chosen`, { count: chosen.size, n: n(chosen.size) })}
          </p>
          {chosenError ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {chosenError}
            </p>
          ) : null}
        </div>
      }
      validate={() => {
        if (chosen.size === 0) {
          setChosenError(t(`${K}chooseOne`))
          return 'documents'
        }
        if (chosen.size > GIVE_BACK_MAX_DOCUMENTS) {
          setChosenError(t(`${K}tooMany`, { max: n(GIVE_BACK_MAX_DOCUMENTS) }))
          return 'documents'
        }
        return undefined
      }}
      confirmLabel={t(`${K}confirm`)}
      confirmingLabel={t('console.companySubscription.sending')}
      send={(reason) => giveBackDocuments(tenantId, [...chosen.keys()], reason)}
      describeFailure={describeCompanySubscriptionFailure}
      onDone={onDone}
      onClose={onClose}
    />
  )
}
