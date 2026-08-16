import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  PauseRemindersModal,
  SendReminderModal,
  TemplateEditorModal,
} from '../../components/reminders/ReminderModals'
import {
  QUEUE_KPI,
  QUEUE_PAGE_NUMBERS,
  QUEUE_ROWS,
  QUEUE_TABS,
  TONE_CHIP,
  type QueueRow,
  type QueueTabId,
} from '../../lib/reminders'
import kpiGoingOutIcon from '../../assets/reminders/kpi-going-out.svg'
import kpiOverdueIcon from '../../assets/reminders/kpi-overdue.svg'
import kpiPaidIcon from '../../assets/reminders/kpi-paid.svg'
import pauseIcon from '../../assets/reminders/pause.svg'
import sendIcon from '../../assets/reminders/send.svg'
import sendWhiteIcon from '../../assets/reminders/send-white.svg'
import settingsIcon from '../../assets/dashboard/nav-figma/settings.svg'
import searchIcon from '../../assets/order-forms-v2/search.svg'
import filterIcon from '../../assets/order-forms-v2/filter.svg'
import sortIcon from '../../assets/order-forms-v2/sort.svg'
import chevronDownIcon from '../../assets/order-forms-v2/chevron-down.svg'
import chevronLeftIcon from '../../assets/order-forms-v2/chevron-left.svg'
import omrIcon from '../../assets/order-forms-v2/omr.svg'
import clockIcon from '../../assets/trade-create/clock.svg'

const KPI_ICONS = {
  goingOut: kpiGoingOutIcon,
  overdue: kpiOverdueIcon,
  paid: kpiPaidIcon,
  paused: pauseIcon,
} as const

function QueueHeader({ onSend }: { onSend: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[550px]">
        <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">
          {t('reminders.queue.title')}
        </h1>
        <p className="mt-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('reminders.queue.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/income/reminders/settings"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={settingsIcon} alt="" className="size-6" />
          {t('reminders.queue.scheduleSettings')}
        </Link>
        <button
          type="button"
          onClick={onSend}
          className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={sendWhiteIcon} alt="" className="size-6" />
          {t('reminders.queue.sendAReminder')}
        </button>
      </div>
    </div>
  )
}

/** The 24-hour hold is the safety net the whole screen depends on, so it leads. */
function HoldBanner() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#d5dcf1] bg-[#f4f6fb]/60 p-4">
      <span className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
          <img src={clockIcon} alt="" className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-semibold leading-[1.2] text-[#2c3342]">
            {t('reminders.queue.holdTitle')}
          </span>
          <span className="mt-1.5 block text-sm font-medium leading-[1.2] text-[#444957]">
            {t('reminders.queue.holdNote')}
          </span>
        </span>
      </span>
      <button
        type="button"
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#2c3342]"
      >
        <img src={pauseIcon} alt="" className="size-5" />
        {t('reminders.queue.pauseEverything')}
      </button>
    </div>
  )
}

function QueueKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {QUEUE_KPI.map((kpi) => (
        <article key={kpi.id} className="flex flex-col rounded-md bg-surface-card p-5">
          <div className="-me-5 flex items-center gap-2">
            <span
              className={[
                'flex size-[45px] shrink-0 items-center justify-center rounded-full',
                kpi.disc,
              ].join(' ')}
            >
              <img src={KPI_ICONS[kpi.icon]} alt="" className="size-6" />
            </span>
            <h3 className="whitespace-nowrap text-xl font-medium leading-[1.2] text-[#2c3342]">
              {t(kpi.titleKey)}
            </h3>
          </div>
          <p className="mt-2.5 flex items-center gap-1 text-[32px] font-semibold leading-[1.2] text-[#2c3342]">
            {kpi.money ? <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" /> : null}
            {kpi.value}
          </p>
          <p className="mt-2.5 text-sm font-medium leading-[1.2] text-[#444957]">
            {t(kpi.noteKey)}
          </p>
        </article>
      ))}
    </div>
  )
}

function RowCells({ row, onPause }: { row: QueueRow; onPause: () => void }) {
  const { t } = useTranslation()

  return (
    <>
      <td className="px-2 py-3.5 align-top">
        <p
          className={[
            'text-sm font-semibold leading-[1.2]',
            row.paused ? 'text-[#5b606c]' : 'text-[#151c2d]',
          ].join(' ')}
        >
          {t(row.sendingKey)}
        </p>
        <p className="mt-1 text-xs font-medium leading-[1.2] text-[#444957]">
          {t(row.sendingNoteKey)}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-[#151c2d]">{row.customer}</p>
        <p className="mt-1 text-xs font-medium leading-[1.2] text-[#444957]">
          {row.email.startsWith('reminders.') ? t(row.email) : row.email}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <Link
          to={`/invoices/${row.invoice}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-semibold leading-[1.2] text-[#1a2f6e] hover:underline"
        >
          {row.invoice}
        </Link>
        <p className="mt-1 text-xs font-medium leading-[1.2] text-[#444957]">
          {t(row.invoiceNoteKey)}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        {/* The numbered pill says which step of the schedule this is. */}
        <span
          className={[
            'inline-flex items-center gap-2 rounded-full py-[5px] pe-3 ps-1.5',
            TONE_CHIP[row.tone],
          ].join(' ')}
        >
          <span className="flex size-[18px] items-center justify-center rounded-full bg-white text-xs font-bold">
            {row.step}
          </span>
          <span className="text-sm font-medium leading-[1.2]">{t(row.stepLabelKey)}</span>
        </span>
      </td>
      <td className="px-2 py-3.5 align-top">
        <span className="inline-flex items-center gap-1">
          <img src={omrIcon} alt="" className="h-auto w-5 shrink-0" />
          <span className="text-base font-semibold leading-[1.2] text-[#2c3342]">{row.amount}</span>
        </span>
        <p className="mt-1 text-xs font-semibold leading-[1.2] text-[#737781]">{t(row.dueKey)}</p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <div className="flex flex-wrap items-center gap-3.5">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#2c3342]"
          >
            {row.action === 'sendNow' ? <img src={sendIcon} alt="" className="size-4" /> : null}
            {t(`reminders.queue.actions.${row.action}`)}
          </button>
          {row.secondary ? (
            <button
              type="button"
              onClick={row.secondary === 'pause' ? onPause : undefined}
              className="text-sm font-semibold text-[#2c3342] hover:underline"
            >
              {t(`reminders.queue.actions.${row.secondary}`)}
            </button>
          ) : null}
        </div>
      </td>
    </>
  )
}

export function RemindersPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<QueueTabId>('scheduled')
  const [page, setPage] = useState(2)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <QueueHeader onSend={() => setSendOpen(true)} />
        <HoldBanner />
        <QueueKpiCards />

        <section className="overflow-hidden rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-4 pt-4">
            {QUEUE_TABS.map((tab) => {
              const active = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'relative flex items-center gap-1.5 pb-3 text-base leading-[1.2] transition-colors',
                    active
                      ? 'font-semibold text-[#233e92]'
                      : 'font-medium text-[#5b606c] hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(tab.labelKey)}
                  <span
                    className={[
                      'text-xs font-semibold',
                      active ? 'text-[#233e92]' : 'text-[#5b606c]',
                    ].join(' ')}
                  >
                    {tab.count}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#233e92]" />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-4">
              <img src={searchIcon} alt="" className="size-5 shrink-0" />
              <input
                type="search"
                placeholder={t('reminders.queue.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-[#8a8e96]"
              />
            </label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-3 text-sm font-semibold text-[#444957]"
              >
                <img src={filterIcon} alt="" className="size-6" />
                {t('orderForms.filters')}
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-3 text-sm font-semibold text-[#444957]"
              >
                <img src={sortIcon} alt="" className="size-6" />
                {t('orderForms.sort')}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-start">
              {/* Figma column widths. */}
              <colgroup>
                <col className="w-[40px]" />
                <col className="w-[162px]" />
                <col className="w-[202px]" />
                <col className="w-[161px]" />
                <col className="w-[235px]" />
                <col className="w-[152px]" />
                <col className="w-[188px]" />
              </colgroup>
              <thead>
                <tr className="bg-[#2c3342]">
                  <th className="px-4 py-2.5 text-start">
                    <input
                      type="checkbox"
                      aria-label={t('reminders.queue.selectAll')}
                      className="size-[15px] rounded-[4px] border border-[#d0d2d5] bg-transparent"
                    />
                  </th>
                  {[
                    'reminders.queue.cols.sending',
                    'reminders.queue.cols.customer',
                    'reminders.queue.cols.invoice',
                    'reminders.queue.cols.whichReminder',
                    'reminders.queue.cols.amount',
                    'reminders.queue.cols.actions',
                  ].map((key) => (
                    <th
                      key={key}
                      className="px-2 py-2.5 text-start text-xs font-semibold uppercase leading-[1.2] text-white"
                    >
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {QUEUE_ROWS.map((row) => (
                  <tr key={row.id} className="border-b border-[#f3f3f3] last:border-b-0">
                    <td className="px-4 py-3.5 align-top">
                      <input
                        type="checkbox"
                        aria-label={t('reminders.queue.selectRow', { id: row.invoice })}
                        className="mt-1 size-[15px] rounded-[4px] border border-[#d0d2d5]"
                      />
                    </td>
                    <RowCells row={row} onPause={() => setPauseOpen(true)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 px-4 pb-4 pt-3">
            <label className="flex items-center gap-4 text-sm font-medium text-[#737781]">
              {t('orderForms.showResult')}
              <span className="inline-flex h-[33px] items-center gap-2.5 rounded-sm border border-[#e8e8ea] px-3 text-sm font-semibold text-[#2c3342]">
                5
                <img src={chevronDownIcon} alt="" className="size-4" />
              </span>
            </label>
            <nav className="flex items-center" aria-label={t('orderForms.pagination')}>
              <button
                type="button"
                aria-label={t('orderForms.previous')}
                className="flex size-10 items-center justify-center rounded-lg"
              >
                <img src={chevronLeftIcon} alt="" className="size-5 rtl:rotate-180" />
              </button>
              {QUEUE_PAGE_NUMBERS.map((label, index) =>
                label === '...' ? (
                  <span
                    key={`gap-${index}`}
                    className="flex size-10 items-center justify-center text-sm font-medium text-[#737781]"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setPage(Number(label))}
                    aria-current={page === Number(label) ? 'page' : undefined}
                    className={[
                      'flex size-10 items-center justify-center rounded-xl',
                      page === Number(label)
                        ? 'bg-[#f4f6fb] text-base font-extrabold text-[#2c4eb7]'
                        : 'text-sm font-medium text-[#737781]',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ),
              )}
              <button
                type="button"
                aria-label={t('orderForms.next')}
                className="flex size-10 items-center justify-center rounded-lg"
              >
                <img src={chevronLeftIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
              </button>
            </nav>
          </div>
        </section>
      </div>

      <PauseRemindersModal open={pauseOpen} onClose={() => setPauseOpen(false)} />
      <SendReminderModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onEditTemplate={() => {
          setSendOpen(false)
          setTemplateOpen(true)
        }}
      />
      <TemplateEditorModal open={templateOpen} onClose={() => setTemplateOpen(false)} />
    </AppShell>
  )
}
