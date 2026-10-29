import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Modal } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  CATALOG_GROUPS_PATH,
  catalogNameOf,
  deleteCatalogGroup,
  deleteCatalogKind,
  getCatalogGroups,
  updateCatalogGroup,
  updateCatalogKind,
  type CatalogGroupDto,
  type CatalogGroupsDto,
  type CatalogKindDto,
} from '../../api/catalog/groups'
import { describeApiFailure } from '../../lib/apiFailure'
import { catalogGroupRefusal, reorderMoves } from '../../lib/catalogGroups'
import { CatalogShell } from './CatalogShell'
import { CatalogNameModal, type CatalogNameTarget } from './CatalogNameModal'
import { useCanManageProducts } from './ItemFormPage'
import plusWhiteIcon from '../../assets/catalog/plus-white.svg'
import plusBrandIcon from '../../assets/catalog/plus-brand.svg'
import menuEditIcon from '../../assets/catalog/pencil-ink.svg'
import menuPlusIcon from '../../assets/catalog/plus-muted.svg'
import menuTrashIcon from '../../assets/catalog/trash-danger.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

type Removal = { kind: 'group'; entry: CatalogGroupDto } | { kind: 'kind'; entry: CatalogKindDto }

/**
 * Catalog › Groups: the company's own groups and the kinds inside them (Group › Kind › Item,
 * guide section 3), on `/v1/catalog/groups`. Reading needs `product.read`; adding, renaming,
 * reordering and deleting need `product.manage`. A new company starts with none; this is where it
 * adds them, and the item form's "Where it lives" picks from them.
 *
 * No Figma frame: built to the house standard from the catalogue list's shell and cards.
 */
export function CatalogGroupsPage() {
  const { t, i18n } = useTranslation()
  const canManage = useCanManageProducts() === true
  const groupsRead = useApiRead<CatalogGroupsDto>(CATALOG_GROUPS_PATH, getCatalogGroups)
  // The last answer stays on screen while a reload after a change is in flight.
  const latest = groupsRead.read.status === 'ready' ? groupsRead.read.data.groups : null
  const [shown, setShown] = useState<CatalogGroupDto[] | null>(null)
  if (latest && latest !== shown) setShown(latest)
  const groups = latest ?? shown

  const [dialog, setDialog] = useState<CatalogNameTarget | null>(null)
  const [removal, setRemoval] = useState<Removal | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removalProblem, setRemovalProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const nameOf = (entry: { name: string; nameAr: string | null }) =>
    catalogNameOf(entry, i18n.language)
  /** The other language's name, shown smaller under the first when there is one. */
  const otherNameOf = (entry: { name: string; nameAr: string | null }) => {
    if (!entry.nameAr) return null
    return i18n.language.startsWith('ar') ? entry.name : entry.nameAr
  }

  const wordFailure = (error: unknown) => {
    const refusal = catalogGroupRefusal(error)
    if (refusal) return t(refusal.key)
    const message = describeApiFailure(error)
    return t(message.key, message.values)
  }

  // TODO(backend): no reorder route, so a move saves each row whose place changed with its own
  // `PUT ?expectedVersion=`; a failure part way leaves the rows saved so far (INCOME.md P.40).
  const move = async (rows: (CatalogGroupDto | CatalogKindDto)[], id: string, step: -1 | 1) => {
    const changes = reorderMoves(rows, id, step)
    if (changes.length === 0) return
    setBusy(true)
    setProblem(null)
    try {
      for (const { row, sortOrder } of changes) {
        const body = { name: row.name, nameAr: row.nameAr, sortOrder }
        if ('kinds' in row) await updateCatalogGroup(row.id, row.version, body)
        else await updateCatalogKind(row.id, row.version, body)
      }
    } catch (error) {
      setProblem(wordFailure(error))
    } finally {
      setBusy(false)
      groupsRead.retry()
    }
  }

  const remove = async () => {
    if (!removal) return
    setRemoving(true)
    setRemovalProblem(null)
    try {
      if (removal.kind === 'group')
        await deleteCatalogGroup(removal.entry.id, removal.entry.version)
      else await deleteCatalogKind(removal.entry.id, removal.entry.version)
      setRemoval(null)
      groupsRead.retry()
    } catch (error) {
      setRemovalProblem(wordFailure(error))
    } finally {
      setRemoving(false)
    }
  }

  const saved = () => {
    setDialog(null)
    setProblem(null)
    groupsRead.retry()
  }

  const moveButtons = (rows: (CatalogGroupDto | CatalogKindDto)[], index: number, label: string) =>
    canManage && rows.length > 1 ? (
      <span className="flex shrink-0 items-center">
        {([-1, 1] as const).map((step) => {
          const edge = step === -1 ? index === 0 : index === rows.length - 1
          return (
            <button
              key={step}
              type="button"
              disabled={busy || edge}
              onClick={() => void move(rows, rows[index].id, step)}
              aria-label={t(step === -1 ? 'catalogGroups.moveUp' : 'catalogGroups.moveDown', {
                name: label,
              })}
              className="inline-flex size-8 items-center justify-center rounded-sm transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <img
                src={chevronIcon}
                alt=""
                className={['size-4', step === -1 ? '-rotate-90' : 'rotate-90'].join(' ')}
              />
            </button>
          )
        })}
      </span>
    ) : null

  const newGroupButton = (
    <button
      type="button"
      onClick={() => setDialog({ mode: 'newGroup', groups: groups ?? [] })}
      className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
    >
      <img src={plusWhiteIcon} alt="" className="size-4" />
      {t('catalogGroups.newGroup')}
    </button>
  )

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalogReal.title', to: '/catalog' },
        { labelKey: 'catalogGroups.title' },
      ]}
      title={t('catalogGroups.title')}
      subtitle={t('catalogGroups.subtitle')}
      actions={canManage && groups ? newGroupButton : undefined}
    >
      {problem ? (
        <p
          role="alert"
          className="rounded-md bg-danger-100 px-5 py-3 text-sm font-medium text-danger-700"
        >
          {problem}
        </p>
      ) : null}

      {groups === null ? (
        groupsRead.read.status === 'failed' ? (
          <ApiReadFailure error={groupsRead.read.error} retry={groupsRead.retry} />
        ) : (
          <LoadingNotice />
        )
      ) : groups.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-md bg-surface-card px-5 py-10 text-center">
          <h2 className="text-base font-semibold text-text-primary">
            {t('catalogGroups.emptyTitle')}
          </h2>
          <p className="max-w-[520px] text-sm font-medium leading-[1.5] text-text-quaternary">
            {canManage ? t('catalogGroups.emptyBody') : t('catalogGroups.emptyReadOnly')}
          </p>
          {canManage ? newGroupButton : null}
        </section>
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((group, groupIndex) => {
            const label = nameOf(group)
            const other = otherNameOf(group)
            return (
              <li key={group.id}>
                <section
                  aria-labelledby={`group-${group.id}`}
                  className="overflow-hidden rounded-md bg-surface-card"
                >
                  <div className="flex items-center gap-2 p-5">
                    <div className="min-w-0 flex-1">
                      <h2
                        id={`group-${group.id}`}
                        className="truncate text-base font-semibold text-text-primary"
                      >
                        {label}
                      </h2>
                      {/* TODO(backend): the tree has no item counts, so only the kinds are counted (INCOME.md P.41). */}
                      <p className="mt-0.5 truncate text-xs font-medium text-text-quaternary">
                        {/* Isolated so a name in the other script does not reorder the count. */}
                        {other ? (
                          <>
                            <bdi>{other}</bdi>
                            {' · '}
                          </>
                        ) : null}
                        {t('catalogGroups.kindCount', { count: group.kinds.length })}
                      </p>
                    </div>
                    {moveButtons(groups, groupIndex, label)}
                    {canManage ? (
                      <ActionMenu
                        size="md"
                        label={t('catalogGroups.groupActions', { name: label })}
                        items={[
                          {
                            id: 'rename',
                            labelKey: 'catalog.groupMenu.renameIt',
                            icon: menuEditIcon,
                            onSelect: () => setDialog({ mode: 'editGroup', group }),
                          },
                          {
                            id: 'addKind',
                            labelKey: 'catalog.groupMenu.addAKind',
                            icon: menuPlusIcon,
                            onSelect: () => setDialog({ mode: 'newKind', group }),
                          },
                          {
                            id: 'remove',
                            labelKey: 'catalog.groupMenu.removeTheGroup',
                            icon: menuTrashIcon,
                            danger: true,
                            onSelect: () => {
                              setRemovalProblem(null)
                              setRemoval({ kind: 'group', entry: group })
                            },
                          },
                        ]}
                      />
                    ) : null}
                  </div>

                  {group.kinds.length === 0 ? (
                    <p className="border-t border-surface-background px-5 py-4 text-sm font-medium text-text-quaternary">
                      {t('catalogGroups.noKinds')}
                    </p>
                  ) : (
                    <ul aria-label={t('catalogGroups.kindsIn', { group: label })}>
                      {group.kinds.map((kind, kindIndex) => {
                        const kindLabel = nameOf(kind)
                        const kindOther = otherNameOf(kind)
                        return (
                          <li
                            key={kind.id}
                            className="flex items-center gap-2 border-t border-surface-background py-3 pe-5 ps-9"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-text-secondary">
                                {kindLabel}
                              </span>
                              {kindOther ? (
                                <span className="block truncate text-xs font-medium text-text-quaternary">
                                  <bdi>{kindOther}</bdi>
                                </span>
                              ) : null}
                            </span>
                            {moveButtons(group.kinds, kindIndex, kindLabel)}
                            {canManage ? (
                              <ActionMenu
                                size="md"
                                label={t('catalogGroups.kindActions', { name: kindLabel })}
                                items={[
                                  {
                                    id: 'rename',
                                    labelKey: 'catalogGroups.renameKind',
                                    icon: menuEditIcon,
                                    onSelect: () => setDialog({ mode: 'editKind', kind, groups }),
                                  },
                                  {
                                    id: 'remove',
                                    labelKey: 'catalogGroups.removeKind',
                                    icon: menuTrashIcon,
                                    danger: true,
                                    onSelect: () => {
                                      setRemovalProblem(null)
                                      setRemoval({ kind: 'kind', entry: kind })
                                    },
                                  },
                                ]}
                              />
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {canManage ? (
                    <div className="border-t border-surface-background px-5 py-3">
                      <button
                        type="button"
                        onClick={() => setDialog({ mode: 'newKind', group })}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                      >
                        <img src={plusBrandIcon} alt="" className="size-4" />
                        {t('catalogGroups.addKindTo', { group: label })}
                      </button>
                    </div>
                  ) : null}
                </section>
              </li>
            )
          })}
        </ul>
      )}

      {dialog ? (
        <CatalogNameModal target={dialog} onClose={() => setDialog(null)} onSaved={saved} />
      ) : null}

      {removal ? (
        <Modal
          open
          onClose={() => setRemoval(null)}
          title={t(
            removal.kind === 'group'
              ? 'catalogGroups.remove.groupTitle'
              : 'catalogGroups.remove.kindTitle',
            { name: nameOf(removal.entry) },
          )}
          footer={
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoval(null)}
                className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={removing}
                className="inline-flex h-11 items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {removing ? t('catalogGroups.remove.removing') : t('catalogGroups.remove.confirm')}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium leading-[1.5] text-text-secondary">
              {removal.kind === 'group'
                ? t('catalogGroups.remove.groupBody')
                : t('catalogGroups.remove.kindBody')}
            </p>
            {removalProblem ? (
              <p role="alert" className="text-sm font-medium text-danger-700">
                {removalProblem}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </CatalogShell>
  )
}
