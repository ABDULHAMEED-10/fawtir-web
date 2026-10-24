import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import chevronIcon from '../../assets/invoices/chevron.svg'
import {
  CONSOLE_SETTINGS_PATH,
  CONSOLE_SETTINGS_TABS,
  type ConsoleSettingsTab,
} from '../../lib/console/consoleSettingsHub'

/**
 * The top of every console Settings screen, drawn as the tenant side's Settings frame is
 * (`SettingsShell`): the "Settings" title, the group tabs, and on an inner screen the way back to
 * all settings. It takes the place of the "Console › Page" breadcrumb on those screens.
 *
 * On the hub the tabs filter the cards; on an inner screen they lead back to the hub at that tab.
 */
export function ConsoleSettingsFrame({
  tab,
  hub = false,
}: {
  /** Which tab is lit. */
  tab: ConsoleSettingsTab
  /** The hub itself: no back link. */
  hub?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
        {t('console.settingsHub.title')}
      </h1>

      <nav
        aria-label={t('console.settingsHub.tabsLabel')}
        className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle"
      >
        {CONSOLE_SETTINGS_TABS.map((entry) => {
          const active = entry.id === tab
          return (
            <Link
              key={entry.id}
              to={
                entry.id === 'all'
                  ? CONSOLE_SETTINGS_PATH
                  : `${CONSOLE_SETTINGS_PATH}?tab=${entry.id}`
              }
              aria-current={active ? 'page' : undefined}
              className={[
                'inline-flex h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-t-sm px-4 text-sm font-medium transition-colors',
                active
                  ? 'border-b-2 border-primary-700 bg-primary-25 text-primary-800'
                  : 'border-b-2 border-transparent text-text-quaternary hover:text-text-secondary',
              ].join(' ')}
            >
              {entry.id !== 'records' ? (
                <span
                  className={[
                    'size-1.5 rounded-full',
                    active ? 'bg-primary-700' : 'bg-[#d0d2d5]',
                  ].join(' ')}
                />
              ) : null}
              {t(entry.labelKey)}
            </Link>
          )
        })}
      </nav>

      {!hub ? (
        <Link
          to={CONSOLE_SETTINGS_PATH}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-text-quaternary transition-colors hover:text-primary-700"
        >
          <img
            src={chevronIcon}
            alt=""
            aria-hidden="true"
            className="size-4 rotate-180 rtl:rotate-0"
          />
          {t('console.settingsHub.back')}
        </Link>
      ) : null}
    </div>
  )
}
