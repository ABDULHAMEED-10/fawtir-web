import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Switch, type ActionMenuItem } from '../../../components/ui'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleSettingsFrame } from '../../../layouts/ConsoleShell/ConsoleSettingsFrame'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_CARD_HEAD,
  CONSOLE_CARD_NOTE,
  CONSOLE_CARD_TITLE,
  CONSOLE_PAGE,
  CONSOLE_SMALL,
  ConsoleButton,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { Mono } from '../../ErpPage/overview/idiom'
import {
  CATALOGUE_MANAGE_PERMISSION,
  CONSOLE_BUSINESS_TYPES_PATH,
  reorderBusinessTypes,
  reorderSubBusinessTypes,
  restoreBusinessType,
  restoreSubBusinessType,
  retireBusinessType,
  retireSubBusinessType,
  setBusinessTypeSignup,
  type ConsoleBusinessTypeDto,
  type ConsoleSubBusinessTypeDto,
} from '../../../api/platform/businessTypes'
import {
  hasArabic,
  inDisplayOrder,
  moved,
  refusalKey,
  templateEditorPath,
} from '../../../lib/console/catalogueTemplates'
import { nameOf } from '../../../lib/codeLists/codeList'
import { ISIC_ACTIVITIES } from '../../../lib/codeLists/isic'
import { formatInstantDay } from '../../../lib/format'
import {
  ConfirmRetireDialog,
  IsicDialog,
  SubTypeDialog,
  TypeDialog,
  type TypeDialogMode,
} from './BusinessTypeDialogs'
import editIcon from '../../../assets/settings/menu-edit.svg'
import removeIcon from '../../../assets/settings/menu-remove.svg'
import listIcon from '../../../assets/settings/menu-list.svg'
import upIcon from '../../../assets/catalog/arrow-up.svg'
import downIcon from '../../../assets/catalog/arrow-down.svg'
import restoreIcon from '../../../assets/catalog/menu-refresh.svg'
import moveIcon from '../../../assets/catalog/expand.svg'

const K = 'console.businessTypes.'

/**
 * Console › Settings › Business types (Catalogue guide 1A): the business types and sub business
 * types companies choose at sign-up, in the order sign-up lists them. Add, rename, reorder,
 * retire and restore (never delete: companies store the codes), open a type for sign-up, set the
 * activity each sub type suggests, and open its catalogue template. `platform.catalogue.manage`.
 *
 * No Figma frame: built on the console Settings screens (house standard, handbook 3.3).
 */
export function ConsoleBusinessTypesPage() {
  return (
    <ConsoleShell requires={CATALOGUE_MANAGE_PERMISSION}>
      <BusinessTypes />
    </ConsoleShell>
  )
}

type Dialog =
  | { kind: 'type'; mode: TypeDialogMode; type?: ConsoleBusinessTypeDto }
  | { kind: 'subType'; type: ConsoleBusinessTypeDto; subType?: ConsoleSubBusinessTypeDto }
  | { kind: 'isic'; subType: ConsoleSubBusinessTypeDto }
  | { kind: 'retire'; type?: ConsoleBusinessTypeDto; subType?: ConsoleSubBusinessTypeDto }

function BusinessTypes() {
  const { t } = useTranslation()
  const { read, retry } = useConsoleRead<ConsoleBusinessTypeDto[]>(CONSOLE_BUSINESS_TYPES_PATH)
  // The list as last answered: a change answers with the rows it touched, so the page never goes
  // back to loading after a save.
  const [types, setTypes] = useState<ConsoleBusinessTypeDto[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [dialog, setDialog] = useState<Dialog | null>(null)

  useEffect(() => {
    if (read.status === 'ready') setTypes(inDisplayOrder(read.data))
  }, [read])

  /** Applies one changed type, keeping its sub types when the answer leaves them out. */
  const withType = (changed: ConsoleBusinessTypeDto) =>
    setTypes((current) =>
      inDisplayOrder(
        (current ?? []).map((type) =>
          type.code === changed.code
            ? { ...changed, subTypes: changed.subTypes ?? type.subTypes }
            : type,
        ),
      ),
    )

  /** Applies one changed sub type, under the type it now belongs to. */
  const withSubType = (changed: ConsoleSubBusinessTypeDto) =>
    setTypes((current) =>
      inDisplayOrder(
        (current ?? []).map((type) => {
          const others = type.subTypes.filter((sub) => sub.code !== changed.code)
          return type.code === changed.businessTypeCode
            ? { ...type, subTypes: [...others, changed] }
            : { ...type, subTypes: others }
        }),
      ),
    )

  const run = async (scope: string, action: () => Promise<void>) => {
    setBusy(scope)
    setErrors((current) => ({ ...current, [scope]: undefined }))
    try {
      await action()
    } catch (error) {
      setErrors((current) => ({ ...current, [scope]: refusalKey(error) }))
    } finally {
      setBusy(null)
    }
  }

  let body: ReactNode
  if (types === null) {
    body =
      read.status === 'failed' ? (
        <ConsoleReadFailure error={read.error} retry={retry} />
      ) : (
        <ConsoleNotice busy body={t(`${K}loading`)} />
      )
  } else if (types.length === 0) {
    body = (
      <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t(`${K}empty`)}
      </p>
    )
  } else {
    const typeCodes = types.map((type) => type.code)
    body = types.map((type) => (
      <TypeCard
        key={type.code}
        type={type}
        busy={busy !== null}
        error={errors[type.code]}
        onToggleSignup={(open) =>
          run(type.code, async () => withType(await setBusinessTypeSignup(type.code, open)))
        }
        onMove={(by) => {
          const order = moved(typeCodes, type.code, by)
          if (order)
            void run(type.code, async () =>
              setTypes(inDisplayOrder(await reorderBusinessTypes(order))),
            )
        }}
        onMoveSub={(sub, by) => {
          const order = moved(
            type.subTypes.map((entry) => entry.code),
            sub.code,
            by,
          )
          if (order)
            void run(type.code, async () =>
              setTypes(inDisplayOrder(await reorderSubBusinessTypes(type.code, order))),
            )
        }}
        onRestore={() => run(type.code, async () => withType(await restoreBusinessType(type.code)))}
        onRestoreSub={(sub) =>
          run(type.code, async () => withSubType(await restoreSubBusinessType(sub.code)))
        }
        onDialog={setDialog}
        isFirst={type.code === typeCodes[0]}
        isLast={type.code === typeCodes[typeCodes.length - 1]}
      />
    ))
  }

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleSettingsFrame tab="platform" />
      <ConsolePageHeader
        level="section"
        title={t(`${K}title`)}
        subtitle={t(`${K}subtitle`)}
        actions={
          types !== null ? (
            <ConsoleButton onClick={() => setDialog({ kind: 'type', mode: 'add' })}>
              {t(`${K}addType`)}
            </ConsoleButton>
          ) : null
        }
      />
      {body}

      {dialog?.kind === 'type' ? (
        <TypeDialog
          mode={dialog.mode}
          type={dialog.type}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null)
            if (dialog.mode === 'add')
              setTypes((current) =>
                inDisplayOrder([...(current ?? []), { ...saved, subTypes: saved.subTypes ?? [] }]),
              )
            else withType(saved)
          }}
        />
      ) : null}
      {dialog?.kind === 'subType' && types ? (
        <SubTypeDialog
          type={dialog.type}
          subType={dialog.subType}
          types={types}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null)
            withSubType(saved)
          }}
        />
      ) : null}
      {dialog?.kind === 'isic' ? (
        <IsicDialog
          subType={dialog.subType}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null)
            withSubType(saved)
          }}
        />
      ) : null}
      {dialog?.kind === 'retire' ? (
        <ConfirmRetireDialog
          named={dialog.subType ?? dialog.type!}
          isSubType={Boolean(dialog.subType)}
          onClose={() => setDialog(null)}
          onRetire={async () => {
            if (dialog.subType) withSubType(await retireSubBusinessType(dialog.subType.code))
            else if (dialog.type) withType(await retireBusinessType(dialog.type.code))
            setDialog(null)
          }}
        />
      ) : null}
    </div>
  )
}

function TypeCard({
  type,
  busy,
  error,
  isFirst,
  isLast,
  onToggleSignup,
  onMove,
  onMoveSub,
  onRestore,
  onRestoreSub,
  onDialog,
}: {
  type: ConsoleBusinessTypeDto
  busy: boolean
  error?: string
  isFirst: boolean
  isLast: boolean
  onToggleSignup: (open: boolean) => void
  onMove: (by: -1 | 1) => void
  onMoveSub: (sub: ConsoleSubBusinessTypeDto, by: -1 | 1) => void
  onRestore: () => void
  onRestoreSub: (sub: ConsoleSubBusinessTypeDto) => void
  onDialog: (dialog: Dialog) => void
}) {
  const { t } = useTranslation()
  const retired = Boolean(type.retiredAt)
  const active = type.subTypes.filter((sub) => !sub.retiredAt).length

  const menu: ActionMenuItem[] = [
    {
      id: 'rename',
      labelKey: `${K}action.rename`,
      icon: editIcon,
      onSelect: () => onDialog({ kind: 'type', mode: 'edit', type }),
    },
  ]
  if (!isFirst)
    menu.push({ id: 'up', labelKey: `${K}action.moveUp`, icon: upIcon, onSelect: () => onMove(-1) })
  if (!isLast)
    menu.push({
      id: 'down',
      labelKey: `${K}action.moveDown`,
      icon: downIcon,
      onSelect: () => onMove(1),
    })
  menu.push(
    retired
      ? { id: 'restore', labelKey: `${K}action.restore`, icon: restoreIcon, onSelect: onRestore }
      : {
          id: 'retire',
          labelKey: `${K}action.retire`,
          icon: removeIcon,
          danger: true,
          onSelect: () => onDialog({ kind: 'retire', type }),
        },
  )

  return (
    <section className={CONSOLE_CARD} aria-label={type.nameEn}>
      <div className={CONSOLE_CARD_HEAD}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className={CONSOLE_CARD_TITLE}>
              <bdi>{type.nameEn}</bdi>
            </h2>
            {retired ? (
              <ConsoleStatusPill tone="neutral" label={t(`${K}retired`)} />
            ) : (
              <ConsoleStatusPill
                tone={type.openForSignup ? 'success' : 'neutral'}
                label={t(type.openForSignup ? `${K}open` : `${K}closed`)}
              />
            )}
          </div>
          <p className={CONSOLE_CARD_NOTE}>
            <Mono>{type.code}</Mono>
            {' · '}
            {hasArabic(type) ? <bdi>{type.nameAr}</bdi> : t(`${K}noArabic`)}
            {' · '}
            {t(`${K}activeSubTypes`, { count: active })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {retired ? null : (
            <span className="inline-flex items-center gap-2 text-[13px] font-medium text-text-muted">
              <Switch
                size="sm"
                checked={type.openForSignup}
                disabled={busy}
                label={t(`${K}openForSignup`)}
                onChange={onToggleSignup}
              />
              {t(`${K}openForSignup`)}
            </span>
          )}
          <ActionMenu items={menu} label={t(`${K}typeMenu`, { name: type.nameEn })} floating />
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {t(error)}
        </p>
      ) : null}

      {type.subTypes.length === 0 ? (
        <p className="px-5 py-6 text-sm font-medium text-text-tertiary">{t(`${K}noSubTypes`)}</p>
      ) : (
        <ul>
          {type.subTypes.map((sub, index) => (
            <SubTypeRow
              key={sub.code}
              type={type}
              sub={sub}
              isFirst={index === 0}
              isLast={index === type.subTypes.length - 1}
              onMove={(by) => onMoveSub(sub, by)}
              onRestore={() => onRestoreSub(sub)}
              onDialog={onDialog}
            />
          ))}
        </ul>
      )}

      {retired ? null : (
        <div className="border-t border-border-subtle px-5 py-3.5">
          <button
            type="button"
            className={CONSOLE_SMALL}
            onClick={() => onDialog({ kind: 'subType', type })}
          >
            {t(`${K}addSubType`)}
          </button>
        </div>
      )}
    </section>
  )
}

function SubTypeRow({
  type,
  sub,
  isFirst,
  isLast,
  onMove,
  onRestore,
  onDialog,
}: {
  type: ConsoleBusinessTypeDto
  sub: ConsoleSubBusinessTypeDto
  isFirst: boolean
  isLast: boolean
  onMove: (by: -1 | 1) => void
  onRestore: () => void
  onDialog: (dialog: Dialog) => void
}) {
  const { t, i18n } = useTranslation()
  const retired = Boolean(sub.retiredAt)
  const isicName = useMemo(() => {
    if (!sub.suggestedIsic) return null
    const listed = ISIC_ACTIVITIES.find((entry) => entry.code === sub.suggestedIsic?.code)
    return listed ? nameOf(listed, i18n.language) : sub.suggestedIsic.nameEn
  }, [sub.suggestedIsic, i18n.language])
  const template = sub.template

  const menu: ActionMenuItem[] = [
    {
      id: 'rename',
      labelKey: `${K}action.rename`,
      icon: editIcon,
      onSelect: () => onDialog({ kind: 'subType', type, subType: sub }),
    },
    {
      id: 'isic',
      labelKey: `${K}action.isic`,
      icon: listIcon,
      onSelect: () => onDialog({ kind: 'isic', subType: sub }),
    },
    {
      id: 'move',
      labelKey: `${K}action.moveToType`,
      icon: moveIcon,
      onSelect: () => onDialog({ kind: 'subType', type, subType: sub }),
    },
  ]
  if (!isFirst)
    menu.push({ id: 'up', labelKey: `${K}action.moveUp`, icon: upIcon, onSelect: () => onMove(-1) })
  if (!isLast)
    menu.push({
      id: 'down',
      labelKey: `${K}action.moveDown`,
      icon: downIcon,
      onSelect: () => onMove(1),
    })
  menu.push(
    retired
      ? { id: 'restore', labelKey: `${K}action.restore`, icon: restoreIcon, onSelect: onRestore }
      : {
          id: 'retire',
          labelKey: `${K}action.retire`,
          icon: removeIcon,
          danger: true,
          onSelect: () => onDialog({ kind: 'retire', subType: sub }),
        },
  )

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3 border-t border-border-subtle px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
          <bdi>{sub.nameEn}</bdi>
          {retired ? <ConsoleStatusPill tone="neutral" label={t(`${K}retired`)} /> : null}
        </p>
        <p className="mt-1 text-[12.5px] font-medium leading-[1.5] text-text-muted">
          <Mono>{sub.code}</Mono>
          {' · '}
          {hasArabic(sub) ? <bdi>{sub.nameAr}</bdi> : t(`${K}noArabic`)}
        </p>
      </div>
      <dl className="grid min-w-0 flex-[2] basis-[280px] gap-1 text-[12.5px] font-medium leading-[1.5] text-text-muted">
        <div>
          <dt className="inline">{t(`${K}suggestedIsic`)}: </dt>
          <dd className="inline text-text-secondary">
            {sub.suggestedIsic ? (
              <>
                <bdi dir="ltr">{sub.suggestedIsic.code}</bdi>, <bdi>{isicName}</bdi>
              </>
            ) : (
              t(`${K}noIsic`)
            )}
          </dd>
        </div>
        <div>
          <dt className="inline">{t(`${K}templateLabel`)}: </dt>
          <dd className="inline text-text-secondary">
            {template?.publishedVersion
              ? t(`${K}templatePublished`, {
                  version: template.publishedVersion,
                  count: template.publishedItemCount,
                  date: template.publishedAt
                    ? formatInstantDay(template.publishedAt, i18n.language)
                    : '',
                })
              : template?.hasDraft
                ? t(`${K}templateDraftOnly`, { count: template.draftItemCount })
                : t(`${K}templateNone`)}
          </dd>
        </div>
        <div>
          <dt className="sr-only">{t(`${K}companiesLabel`)}</dt>
          <dd>{t(`${K}companies`, { count: sub.companies })}</dd>
        </div>
      </dl>
      <div className="flex shrink-0 items-center gap-2">
        <Link to={templateEditorPath(sub.code)} className={CONSOLE_SMALL}>
          {t(`${K}editTemplate`)}
        </Link>
        <ActionMenu items={menu} label={t(`${K}subTypeMenu`, { name: sub.nameEn })} floating />
      </div>
    </li>
  )
}
