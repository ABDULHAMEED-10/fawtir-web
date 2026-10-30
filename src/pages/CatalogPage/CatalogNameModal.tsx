import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Modal, Select } from '../../components/ui'
import {
  catalogNameOf,
  createCatalogGroup,
  createCatalogKind,
  updateCatalogGroup,
  updateCatalogKind,
  type CatalogGroupDto,
  type CatalogKindDto,
} from '../../api/catalog/groups'
import { describeApiFailure } from '../../lib/apiFailure'
import { catalogGroupRefusal, nextSortOrder } from '../../lib/catalogGroups'

const MAX_NAME = 200

/**
 * What the dialog does: add a group, add a kind inside a group, or rename one (a kind can also
 * move to another group, as `PUT /v1/catalog/kinds/{id}` allows with `groupId`).
 */
export type CatalogNameTarget =
  | { mode: 'newGroup'; groups: CatalogGroupDto[] }
  | { mode: 'newKind'; group: CatalogGroupDto }
  | { mode: 'editGroup'; group: CatalogGroupDto }
  | { mode: 'editKind'; kind: CatalogKindDto; groups: CatalogGroupDto[] }

/**
 * The name dialog for the catalogue's groups and kinds: an English name (required, at most 200
 * characters, unique case-insensitively) and an Arabic one. Shared by Catalog › Groups and the
 * item form's "Add a group" / "Add a kind".
 */
export function CatalogNameModal({
  target,
  onClose,
  onSaved,
}: {
  target: CatalogNameTarget
  onClose: () => void
  onSaved: (saved: CatalogGroupDto | CatalogKindDto) => void
}) {
  const { t, i18n } = useTranslation()
  const initial =
    target.mode === 'editGroup' ? target.group : target.mode === 'editKind' ? target.kind : null
  const [name, setName] = useState(initial?.name ?? '')
  const [nameAr, setNameAr] = useState(initial?.nameAr ?? '')
  const [groupId, setGroupId] = useState(target.mode === 'editKind' ? target.kind.groupId : '')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<{ field: 'name' | null; message: string } | null>(null)

  const isKind = target.mode === 'newKind' || target.mode === 'editKind'
  const title = t(`catalogGroups.dialog.${target.mode}`)
  const subtitle =
    target.mode === 'newKind'
      ? t('catalogGroups.dialog.newKindIn', { group: catalogNameOf(target.group, i18n.language) })
      : isKind
        ? t('catalogGroups.dialog.kindNote')
        : t('catalogGroups.dialog.groupNote')

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!name.trim()) {
      setFailure({ field: 'name', message: t('catalogGroups.refusal.nameRequired') })
      return
    }
    setSaving(true)
    setFailure(null)
    const body = { name: name.trim(), nameAr: nameAr.trim() || null }
    try {
      let saved: CatalogGroupDto | CatalogKindDto
      if (target.mode === 'newGroup') {
        saved = await createCatalogGroup({ ...body, sortOrder: nextSortOrder(target.groups) })
      } else if (target.mode === 'newKind') {
        saved = await createCatalogKind(target.group.id, {
          ...body,
          sortOrder: nextSortOrder(target.group.kinds),
        })
      } else if (target.mode === 'editGroup') {
        // The server sets a missing sort order to 0, so the current one is sent back.
        saved = await updateCatalogGroup(target.group.id, target.group.version, {
          ...body,
          sortOrder: target.group.sortOrder,
        })
      } else {
        const moving = groupId !== target.kind.groupId
        const into = target.groups.find((entry) => entry.id === groupId)
        saved = await updateCatalogKind(target.kind.id, target.kind.version, {
          ...body,
          // A kind moved to another group goes to the end of that group's list.
          sortOrder: moving && into ? nextSortOrder(into.kinds) : target.kind.sortOrder,
          ...(moving ? { groupId } : {}),
        })
      }
      onSaved(saved)
    } catch (error) {
      const refusal = catalogGroupRefusal(error)
      if (refusal) {
        setFailure({ field: refusal.field ?? null, message: t(refusal.key) })
      } else {
        const message = describeApiFailure(error)
        setFailure({ field: null, message: t(message.key, message.values) })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="catalog-name-form"
            disabled={saving}
            className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('catalogGroups.dialog.save')}
          </button>
        </div>
      }
    >
      <form id="catalog-name-form" noValidate onSubmit={save} className="flex flex-col gap-5">
        <Input
          bordered
          autoFocus
          label={isKind ? t('catalogGroups.dialog.kindName') : t('catalogGroups.dialog.groupName')}
          requiredMark
          value={name}
          maxLength={MAX_NAME}
          placeholder={
            isKind
              ? t('catalogGroups.dialog.kindPlaceholder')
              : t('catalogGroups.dialog.groupPlaceholder')
          }
          error={failure?.field === 'name' ? failure.message : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          bordered
          dir="rtl"
          label={t('catalogGroups.dialog.arabicName')}
          value={nameAr}
          maxLength={MAX_NAME}
          onChange={(event) => setNameAr(event.target.value)}
        />
        {target.mode === 'editKind' && target.groups.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            {t('catalogGroups.dialog.inGroup')}
            <Select
              value={groupId}
              onChange={setGroupId}
              ariaLabel={t('catalogGroups.dialog.inGroup')}
              options={target.groups.map((entry) => ({
                value: entry.id,
                label: catalogNameOf(entry, i18n.language),
              }))}
            />
          </label>
        ) : null}
        {failure && failure.field === null ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {failure.message}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
