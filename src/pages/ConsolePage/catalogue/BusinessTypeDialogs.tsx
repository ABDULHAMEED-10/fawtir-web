import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox, Modal, Select, type SelectOption } from '../../../components/ui'
import { FieldLabel, TextField } from '../../../components/form'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import {
  createBusinessType,
  createSubBusinessType,
  setSuggestedIsic,
  updateBusinessType,
  updateSubBusinessType,
  type BusinessTypePatch,
  type ConsoleBusinessTypeDto,
  type ConsoleSubBusinessTypeDto,
  type SubBusinessTypePatch,
} from '../../../api/platform/businessTypes'
import {
  BUSINESS_TYPE_ICONS,
  CODE_PATTERN,
  codeFromName,
  refusalKey,
} from '../../../lib/console/catalogueTemplates'
import { isicOptions as isicOptionsFor } from '../../../lib/codeLists/isic'

const K = 'console.businessTypes.'

export type TypeDialogMode = 'add' | 'edit'

/** The fields both levels share: code (on add only), English and Arabic names. */
type NameFields = { code: string; nameEn: string; nameAr: string }

function useNameFields(initial: { code?: string; nameEn?: string; nameAr?: string | null }) {
  const [fields, setFields] = useState<NameFields>({
    code: initial.code ?? '',
    nameEn: initial.nameEn ?? '',
    nameAr: initial.nameAr ?? '',
  })
  // The code follows the English name until it is typed by hand.
  const [codeTouched, setCodeTouched] = useState(Boolean(initial.code))
  const setName = (nameEn: string) =>
    setFields((current) => ({
      ...current,
      nameEn,
      code: codeTouched ? current.code : codeFromName(nameEn),
    }))
  const setCode = (code: string) => {
    setCodeTouched(true)
    setFields((current) => ({ ...current, code: code.toUpperCase() }))
  }
  const setNameAr = (nameAr: string) => setFields((current) => ({ ...current, nameAr }))
  return { fields, setName, setCode, setNameAr }
}

function validateNames(fields: NameFields, withCode: boolean) {
  const errors: Partial<Record<keyof NameFields, string>> = {}
  if (!fields.nameEn.trim()) errors.nameEn = `${K}validation.nameRequired`
  else if (fields.nameEn.trim().length > 100) errors.nameEn = `${K}validation.nameTooLong`
  if (fields.nameAr.trim().length > 100) errors.nameAr = `${K}validation.nameTooLong`
  if (withCode && !CODE_PATTERN.test(fields.code)) errors.code = `${K}validation.code`
  return errors
}

/** Only what changed is sent; `""` clears the Arabic name (contract: absent = unchanged). */
function namePatch(
  fields: NameFields,
  stored: { nameEn: string; nameAr: string | null },
): BusinessTypePatch {
  const patch: BusinessTypePatch = {}
  if (fields.nameEn.trim() !== stored.nameEn) patch.nameEn = fields.nameEn.trim()
  if (fields.nameAr.trim() !== (stored.nameAr ?? '')) patch.nameAr = fields.nameAr.trim()
  return patch
}

/** One dialog's shell: the form, its refusal inline above the buttons, Cancel and Save. */
function DialogForm({
  id,
  title,
  subtitle,
  saving,
  refusal,
  onClose,
  onSubmit,
  saveLabel,
  danger,
  children,
}: {
  id: string
  title: string
  subtitle?: string
  saving: boolean
  refusal: string | null
  onClose: () => void
  onSubmit: () => void
  saveLabel?: string
  danger?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose()
      }}
      title={title}
      subtitle={subtitle}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <ConsoleButton variant="secondary" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </ConsoleButton>
          <ConsoleButton
            type="submit"
            form={id}
            variant={danger ? 'danger' : 'primary'}
            disabled={saving}
          >
            {saving ? t(`${K}saving`) : (saveLabel ?? t(`${K}save`))}
          </ConsoleButton>
        </div>
      }
    >
      <form
        id={id}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        {children}
        {refusal ? (
          <p
            role="alert"
            className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
          >
            {t(refusal)}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}

function useSaving() {
  const [saving, setSaving] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const save = async (action: () => Promise<void>) => {
    setSaving(true)
    setRefusal(null)
    try {
      await action()
    } catch (error) {
      setRefusal(refusalKey(error))
    } finally {
      setSaving(false)
    }
  }
  return { saving, refusal, save }
}

/* -------------------------------------------------------------- the type */

export function TypeDialog({
  mode,
  type,
  onClose,
  onSaved,
}: {
  mode: TypeDialogMode
  type?: ConsoleBusinessTypeDto
  onClose: () => void
  onSaved: (type: ConsoleBusinessTypeDto) => void
}) {
  const { t } = useTranslation()
  const adding = mode === 'add'
  const { fields, setName, setCode, setNameAr } = useNameFields(type ?? {})
  const [icon, setIcon] = useState(type?.icon ?? '')
  const [errors, setErrors] = useState<Partial<Record<keyof NameFields, string>>>({})
  const { saving, refusal, save } = useSaving()

  const iconOptions: SelectOption[] = [
    { value: '', label: t(`${K}icon.none`) },
    ...BUSINESS_TYPE_ICONS.map((name) => ({ value: name, label: t(`${K}icon.${name}`) })),
  ]

  const submit = () => {
    const next = validateNames(fields, adding)
    setErrors(next)
    if (Object.keys(next).length > 0) return
    void save(async () => {
      if (adding) {
        onSaved(
          await createBusinessType({
            code: fields.code,
            nameEn: fields.nameEn.trim(),
            ...(fields.nameAr.trim() ? { nameAr: fields.nameAr.trim() } : {}),
            ...(icon ? { icon } : {}),
          }),
        )
        return
      }
      if (!type) return
      const patch = namePatch(fields, type)
      if (icon !== (type.icon ?? '')) patch.icon = icon
      onSaved(Object.keys(patch).length === 0 ? type : await updateBusinessType(type.code, patch))
    })
  }

  return (
    <DialogForm
      id="business-type-form"
      title={t(adding ? `${K}dialog.addType` : `${K}dialog.editType`)}
      subtitle={t(adding ? `${K}dialog.addTypeNote` : `${K}dialog.editTypeNote`)}
      saving={saving}
      refusal={refusal}
      onClose={onClose}
      onSubmit={submit}
    >
      <NameInputs
        idPrefix="business-type"
        adding={adding}
        fields={fields}
        errors={errors}
        setName={setName}
        setCode={setCode}
        setNameAr={setNameAr}
      />
      <div className="flex flex-col gap-1">
        <FieldLabel label={t(`${K}field.icon`)} />
        <Select
          value={icon}
          onChange={setIcon}
          options={iconOptions}
          ariaLabel={t(`${K}field.icon`)}
        />
        <p className="text-xs font-medium leading-[1.2] text-text-quaternary">
          {t(`${K}field.iconHint`)}
        </p>
      </div>
    </DialogForm>
  )
}

function NameInputs({
  idPrefix,
  adding,
  fields,
  errors,
  setName,
  setCode,
  setNameAr,
}: {
  idPrefix: string
  adding: boolean
  fields: NameFields
  errors: Partial<Record<keyof NameFields, string>>
  setName: (value: string) => void
  setCode: (value: string) => void
  setNameAr: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <TextField
        id={`${idPrefix}-name-en`}
        name="nameEn"
        label={t(`${K}field.nameEn`)}
        required
        value={fields.nameEn}
        onChange={setName}
        maxLength={100}
        dir="ltr"
        error={errors.nameEn ? t(errors.nameEn) : undefined}
      />
      <TextField
        id={`${idPrefix}-name-ar`}
        name="nameAr"
        label={t(`${K}field.nameAr`)}
        value={fields.nameAr}
        onChange={setNameAr}
        maxLength={100}
        dir="rtl"
        hint={t(`${K}field.nameArHint`)}
        error={errors.nameAr ? t(errors.nameAr) : undefined}
      />
      {adding ? (
        <TextField
          id={`${idPrefix}-code`}
          name="code"
          label={t(`${K}field.code`)}
          required
          value={fields.code}
          onChange={setCode}
          maxLength={40}
          dir="ltr"
          hint={t(`${K}field.codeHint`)}
          error={errors.code ? t(errors.code) : undefined}
        />
      ) : null}
    </>
  )
}

/* ----------------------------------------------------------- the sub type */

export function SubTypeDialog({
  type,
  subType,
  types,
  onClose,
  onSaved,
}: {
  type: ConsoleBusinessTypeDto
  subType?: ConsoleSubBusinessTypeDto
  types: ConsoleBusinessTypeDto[]
  onClose: () => void
  onSaved: (subType: ConsoleSubBusinessTypeDto) => void
}) {
  const { t, i18n } = useTranslation()
  const adding = !subType
  const { fields, setName, setCode, setNameAr } = useNameFields(subType ?? {})
  const [parent, setParent] = useState(subType?.businessTypeCode ?? type.code)
  const [isic, setIsic] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof NameFields, string>>>({})
  const { saving, refusal, save } = useSaving()
  const isicChoices = useIsicOptions(i18n.language)

  const parentOptions: SelectOption[] = types
    .filter((entry) => !entry.retiredAt || entry.code === parent)
    .map((entry) => ({ value: entry.code, label: entry.nameEn }))

  const submit = () => {
    const next = validateNames(fields, adding)
    setErrors(next)
    if (Object.keys(next).length > 0) return
    void save(async () => {
      if (adding) {
        onSaved(
          await createSubBusinessType(type.code, {
            code: fields.code,
            nameEn: fields.nameEn.trim(),
            ...(fields.nameAr.trim() ? { nameAr: fields.nameAr.trim() } : {}),
            ...(isic ? { suggestedIsicCode: isic } : {}),
          }),
        )
        return
      }
      if (!subType) return
      const patch: SubBusinessTypePatch = namePatch(fields, subType)
      if (parent !== subType.businessTypeCode) patch.businessTypeCode = parent
      onSaved(
        Object.keys(patch).length === 0
          ? subType
          : await updateSubBusinessType(subType.code, patch),
      )
    })
  }

  return (
    <DialogForm
      id="sub-business-type-form"
      title={t(adding ? `${K}dialog.addSubType` : `${K}dialog.editSubType`)}
      subtitle={t(adding ? `${K}dialog.addSubTypeNote` : `${K}dialog.editSubTypeNote`, {
        type: type.nameEn,
      })}
      saving={saving}
      refusal={refusal}
      onClose={onClose}
      onSubmit={submit}
    >
      <NameInputs
        idPrefix="sub-business-type"
        adding={adding}
        fields={fields}
        errors={errors}
        setName={setName}
        setCode={setCode}
        setNameAr={setNameAr}
      />
      {adding ? (
        <div className="flex flex-col gap-1">
          <FieldLabel label={t(`${K}field.isic`)} />
          <Combobox
            value={isic}
            onChange={setIsic}
            options={isicChoices}
            placeholder={t(`${K}field.isicPlaceholder`)}
            searchPlaceholder={t(`${K}field.isicSearch`)}
            emptyText={t(`${K}field.isicNone`)}
            ariaLabel={t(`${K}field.isic`)}
          />
          <p className="text-xs font-medium leading-[1.2] text-text-quaternary">
            {t(`${K}field.isicHint`)}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <FieldLabel label={t(`${K}field.businessType`)} />
          <Select
            value={parent}
            onChange={setParent}
            options={parentOptions}
            ariaLabel={t(`${K}field.businessType`)}
          />
          <p className="text-xs font-medium leading-[1.2] text-text-quaternary">
            {t(`${K}field.businessTypeHint`)}
          </p>
        </div>
      )}
    </DialogForm>
  )
}

/** The official activity list, with "none" first, searched by name with the code as the hint. */
function useIsicOptions(language: string): SelectOption[] {
  const { t } = useTranslation()
  return useMemo(
    () => [{ value: '', label: t(`${K}field.isicNoneChosen`) }, ...isicOptionsFor(language)],
    [language, t],
  )
}

export function IsicDialog({
  subType,
  onClose,
  onSaved,
}: {
  subType: ConsoleSubBusinessTypeDto
  onClose: () => void
  onSaved: (subType: ConsoleSubBusinessTypeDto) => void
}) {
  const { t, i18n } = useTranslation()
  const [isic, setIsic] = useState(subType.suggestedIsic?.code ?? '')
  const { saving, refusal, save } = useSaving()
  const options = useIsicOptions(i18n.language)

  return (
    <DialogForm
      id="suggested-isic-form"
      title={t(`${K}dialog.isic`)}
      subtitle={t(`${K}dialog.isicNote`, { name: subType.nameEn })}
      saving={saving}
      refusal={refusal}
      onClose={onClose}
      onSubmit={() =>
        save(async () =>
          onSaved(
            isic === (subType.suggestedIsic?.code ?? '')
              ? subType
              : await setSuggestedIsic(subType.code, isic || null),
          ),
        )
      }
    >
      <div className="flex flex-col gap-1">
        <FieldLabel label={t(`${K}field.isic`)} />
        <Combobox
          value={isic}
          onChange={setIsic}
          options={options}
          placeholder={t(`${K}field.isicPlaceholder`)}
          searchPlaceholder={t(`${K}field.isicSearch`)}
          emptyText={t(`${K}field.isicNone`)}
          ariaLabel={t(`${K}field.isic`)}
        />
        <p className="text-xs font-medium leading-[1.2] text-text-quaternary">
          {t(`${K}field.isicHint`)}
        </p>
      </div>
    </DialogForm>
  )
}

/* ---------------------------------------------------------------- retire */

export function ConfirmRetireDialog({
  named,
  isSubType,
  onClose,
  onRetire,
}: {
  named: { nameEn: string }
  isSubType: boolean
  onClose: () => void
  onRetire: () => Promise<void>
}) {
  const { t } = useTranslation()
  const { saving, refusal, save } = useSaving()
  return (
    <DialogForm
      id="retire-business-type-form"
      title={t(`${K}dialog.retire`, { name: named.nameEn })}
      saving={saving}
      refusal={refusal}
      onClose={onClose}
      onSubmit={() => save(onRetire)}
      saveLabel={t(`${K}action.retire`)}
      danger
    >
      <p className="text-sm font-medium leading-[1.6] text-text-secondary">
        {t(isSubType ? `${K}dialog.retireSubTypeNote` : `${K}dialog.retireTypeNote`)}
      </p>
    </DialogForm>
  )
}
