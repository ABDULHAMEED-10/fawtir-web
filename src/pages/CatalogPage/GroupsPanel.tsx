import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionMenu } from '../../components/ui'
import { GROUPS, CATALOG_TOTAL, UNGROUPED, groupTotal } from '../../lib/catalog'
import chevronIcon from '../../assets/invoices/chevron.svg'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import menuChartIcon from '../../assets/catalog/menu-chart.svg'
import menuPercentIcon from '../../assets/catalog/menu-percent.svg'
import menuOffIcon from '../../assets/catalog/cross-muted.svg'
import menuEditIcon from '../../assets/catalog/pencil-ink.svg'
import menuPlusIcon from '../../assets/catalog/plus-muted.svg'
import menuDownloadIcon from '../../assets/catalog/download-ink.svg'
import menuTrashIcon from '../../assets/catalog/trash-danger.svg'

/**
 * The groups tree (Figma 135:48039).
 *
 * Every count here is the size of the branch below it, which is what makes the tree add up to
 * the catalog total rather than to a number typed at the top.
 */
export function GroupsPanel({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<string[]>(['greenBeans'])
  const [picked, setPicked] = useState('all')

  const toggle = (id: string) =>
    setOpen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const choose = (id: string) => {
    setPicked(id)
    onPick(id)
  }

  return (
    <div className="w-[282px] py-1">
      <p className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-base font-semibold text-text-primary">
          {t('catalog.groupsPanel.title')}
        </span>
        <button
          type="button"
          className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
        >
          {t('catalog.groupsPanel.rearrange')}
        </button>
      </p>

      <button
        type="button"
        onClick={() => choose('all')}
        className={[
          'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start transition-colors',
          picked === 'all'
            ? 'border-s-[3px] border-s-primary-700 bg-primary-25 text-primary-800'
            : 'text-text-secondary hover:bg-primary-25',
        ].join(' ')}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <img
            src={chevronIcon}
            alt=""
            className={['size-4 transition-transform', 'rotate-90'].join(' ')}
          />
          {t('catalog.groupsPanel.all')}
        </span>
        <span className="text-sm font-semibold tabular-nums">{CATALOG_TOTAL}</span>
      </button>

      <ul>
        {GROUPS.map((group) => {
          const expanded = open.includes(group.id)
          return (
            <li key={group.id}>
              <span
                className={[
                  'flex items-center gap-1 pe-2 ps-4 transition-colors',
                  picked === group.id ? 'bg-primary-25' : 'hover:bg-primary-25',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  aria-expanded={expanded}
                  aria-label={group.name}
                  className="inline-flex size-6 shrink-0 items-center justify-center"
                >
                  <img
                    src={chevronIcon}
                    alt=""
                    className={[
                      'size-4 transition-transform',
                      expanded ? 'rotate-90' : 'rtl:rotate-180',
                    ].join(' ')}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => choose(group.id)}
                  className="flex-1 py-2.5 text-start text-sm font-medium text-text-secondary"
                >
                  {group.name}
                </button>
                <span className="shrink-0 text-sm font-medium text-text-quaternary tabular-nums">
                  {groupTotal(group)}
                </span>
                <ActionMenu
                  size="md"
                  label={t('catalog.groupMenu.everythingIn', { group: group.name })}
                  items={[
                    {
                      id: 'prices',
                      sectionKey: 'catalog.groupMenu.everythingIn',
                      labelKey: 'catalog.groupMenu.changeThePrices',
                      icon: menuChartIcon,
                      values: { group: group.name },
                      hint: String(groupTotal(group)),
                    },
                    {
                      id: 'tax',
                      labelKey: 'catalog.groupMenu.changeTheTax',
                      icon: menuPercentIcon,
                      hint: String(groupTotal(group)),
                    },
                    {
                      id: 'offSale',
                      labelKey: 'catalog.groupMenu.takeThemOffSale',
                      icon: menuOffIcon,
                    },
                    {
                      id: 'rename',
                      sectionKey: 'catalog.groupMenu.theGroupItself',
                      labelKey: 'catalog.groupMenu.renameIt',
                      icon: menuEditIcon,
                    },
                    { id: 'addKind', labelKey: 'catalog.groupMenu.addAKind', icon: menuPlusIcon },
                    {
                      id: 'export',
                      labelKey: 'catalog.groupMenu.exportThese',
                      icon: menuDownloadIcon,
                      values: { count: groupTotal(group) },
                    },
                    {
                      id: 'remove',
                      labelKey: 'catalog.groupMenu.removeTheGroup',
                      icon: menuTrashIcon,
                      danger: true,
                    },
                  ]}
                />
              </span>

              {expanded ? (
                <ul>
                  {group.kinds.map((kind) => (
                    <li key={kind.id}>
                      <button
                        type="button"
                        onClick={() => choose(kind.id)}
                        className={[
                          'flex w-full items-center justify-between gap-3 py-2.5 pe-4 ps-10 text-start text-sm transition-colors',
                          picked === kind.id
                            ? 'bg-primary-25 text-primary-800'
                            : 'text-text-secondary hover:bg-primary-25',
                        ].join(' ')}
                      >
                        {kind.name}
                        <span className="shrink-0 text-text-quaternary tabular-nums">
                          {kind.items}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>

      <p className="flex items-center justify-between gap-3 border-t border-surface-background px-4 py-3 text-sm font-medium text-text-quaternary">
        {t('catalog.groupsPanel.notInAnyGroup')}
        <span className="tabular-nums">{UNGROUPED}</span>
      </p>

      <button
        type="button"
        className="flex w-full items-center gap-2 border-t border-surface-background px-4 py-3 text-start text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
      >
        <img src={plusIcon} alt="" className="size-4" />
        {t('catalog.groupsPanel.addAGroup')}
      </button>
    </div>
  )
}
