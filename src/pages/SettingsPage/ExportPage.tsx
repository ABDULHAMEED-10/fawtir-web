import { useMemo, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { TableCheckbox } from '../../components/ui'
import {
  EXPORT_PARTS,
  EXPORT_SCHEDULES,
  EXPORT_ROOT,
  PAST_EXPORTS,
  exportSize,
} from '../../lib/settingsRecords'
import { BOOK } from '../../lib/settings'
import downloadIcon from '../../assets/settings/download-white.svg'
import downloadInkIcon from '../../assets/settings/download-ink.svg'

const FORMAT_TONE = {
  plain: 'bg-surface-background text-text-tertiary',
  brand: 'bg-primary-50 text-primary-800',
  danger: 'bg-danger-100 text-danger-700',
}

/**
 * Settings › Take your data with you (Figma 135:41931).
 *
 * The size in the footer is the sum of what is ticked, so unticking the reports visibly changes
 * what the download will weigh instead of leaving a fixed number on screen.
 */
export function ExportPage() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(
    () => new Set(EXPORT_PARTS.filter((part) => part.defaultOn && !part.always).map((p) => p.id)),
  )
  const [schedule, setSchedule] = useState('weekly')
  const [started, setStarted] = useState(false)

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setStarted(false)
      return next
    })

  const size = useMemo(() => exportSize([...selected]), [selected])
  const optional = EXPORT_PARTS.filter((part) => !part.always)
  const allOn = optional.every((part) => selected.has(part.id))

  return (
    <SettingsShell group="records">
      <SettingsHeader title={t('export.title')} subtitle={t('export.subtitle')} />

      <div className="flex flex-col gap-4 xl:flex-row">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md bg-surface-card">
          <div className="flex flex-wrap items-start justify-between gap-3 p-5">
            <div>
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('export.whatToInclude')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {t('export.whatToIncludeNote')}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSelected(allOn ? new Set() : new Set(optional.map((part) => part.id)))
              }
              className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
            >
              {allOn ? t('export.untickEverything') : t('export.tickEverything')}
            </button>
          </div>

          {/* How often a copy should be taken automatically */}
          <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-4">
            {EXPORT_SCHEDULES.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setSchedule(entry)}
                aria-pressed={schedule === entry}
                className={[
                  'inline-flex h-[46px] items-center justify-center rounded-sm border text-sm font-medium transition-colors',
                  schedule === entry
                    ? 'border-primary-700 bg-primary-25 text-primary-800'
                    : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                ].join(' ')}
              >
                {t(`export.schedule.${entry}`)}
              </button>
            ))}
          </div>

          <ul className="border-t border-surface-background">
            {EXPORT_PARTS.map((part) => {
              const on = part.always || selected.has(part.id)
              return (
                <li
                  key={part.id}
                  className="flex items-start gap-3 border-b border-surface-background px-5 py-4 last:border-0"
                >
                  <span className="pt-0.5">
                    <TableCheckbox
                      checked={on}
                      disabled={part.always}
                      onChange={() => toggle(part.id)}
                      ariaLabel={t(`export.part.${part.id}`)}
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm font-semibold text-text-primary">
                        {t(`export.part.${part.id}`)}
                      </span>
                      {part.always ? (
                        <span className="inline-flex h-[20px] items-center gap-1.5 rounded-[3px] bg-success-100 px-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#3d5648]">
                          <span className="size-1.5 rounded-full bg-[#4c6c5a]" />
                          {t('export.alwaysIncluded')}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 max-w-[620px] text-sm font-medium leading-[1.6] text-text-tertiary">
                      <Trans
                        i18nKey={`export.part.${part.id}Note`}
                        values={{ count: part.count.toLocaleString('en-US') }}
                        components={{ b: <b className="font-semibold text-text-primary" /> }}
                      />
                    </p>
                    <span className="mt-2 flex flex-wrap gap-2">
                      {part.formats.map((format) => (
                        <span
                          key={format.label}
                          className={[
                            'inline-flex h-[22px] items-center rounded-[3px] px-2 text-[11px] font-medium',
                            FORMAT_TONE[format.tone],
                          ].join(' ')}
                        >
                          {format.label}
                        </span>
                      ))}
                    </span>
                  </div>

                  <div className="shrink-0 text-end">
                    <p className="text-sm font-semibold text-text-primary tabular-nums">
                      {part.megabytes >= 1000
                        ? `${(part.megabytes / 1000).toFixed(1)} GB`
                        : `${part.megabytes} MB`}
                    </p>
                    <p className="mt-1 text-xs font-medium text-text-quaternary">
                      {t(part.countKey, { count: part.count.toLocaleString('en-US') })}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-surface-background p-5">
            <div>
              <p className="text-base font-semibold text-text-primary">
                {t('export.footerSize', { size })}
              </p>
              <p className="mt-1 max-w-[380px] text-xs font-medium leading-[1.5] text-text-quaternary">
                {started ? t('export.started') : t('export.footerTime')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('export.justTheInvoices')}
              </button>
              <button
                type="button"
                onClick={() => setStarted(true)}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                <img src={downloadIcon} alt="" className="size-[18px]" />
                {t('export.startDownload')}
              </button>
            </div>
          </div>
        </section>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('export.howItsLaidOut')}
            </h3>
            <pre
              dir="ltr"
              className="mt-3 overflow-x-auto rounded-sm bg-surface-background px-4 py-3 text-left font-mono text-[11px] leading-[1.8] text-text-tertiary"
            >
              <span className="font-semibold text-primary-800">{EXPORT_ROOT}</span>
              {'\n  '}
              <span className="font-semibold text-primary-800">invoices/</span>
              {'\n    '}
              <span className="font-semibold text-primary-800">2026-09/</span>
              {'\n      INV-2047.xml\n      INV-2047.pdf\n      …'}
              {(BOOK.invoicesSent - 2).toLocaleString('en-US')}
              {' more\n  '}
              <span className="font-semibold text-primary-800">bills/</span>
              {'\n  '}
              <span className="font-semibold text-primary-800">tax-reporting/</span>
              {'\n  '}
              <span className="font-semibold text-primary-800">contacts/</span>
              {'\n  '}
              <span className="font-semibold text-primary-800">catalog/</span>
              {'\n  activity-log.csv\n  README.txt'}
            </pre>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('export.onesTakenBefore')}
            </h3>
            <ul className="mt-2">
              {PAST_EXPORTS.map((entry, index) => (
                <li
                  key={entry.id}
                  className={[
                    'flex items-start gap-3 py-3',
                    index < PAST_EXPORTS.length - 1 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-background">
                    <img src={downloadInkIcon} alt="" className="size-4 opacity-60" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">
                      {entry.date}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium leading-[1.5] text-text-quaternary">
                      {t(entry.scopeKey)} · {entry.size}
                      {entry.noteKey ? ` · ${t(entry.noteKey)}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-text-quaternary">
                    {t('export.expired')}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('export.worthKnowing')}
            </h3>
            <dl className="mt-2">
              {(
                [
                  ['costs', t('export.nothing')],
                  ['howOften', t('export.asOftenAsYouLike')],
                  ['whoCanDoIt', t('export.ownerOnly')],
                  ['recorded', t('export.inTheActivityLog')],
                ] as const
              ).map(([key, value], index) => (
                <div
                  key={key}
                  className={[
                    'flex items-center justify-between gap-3 py-2.5',
                    index < 3 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <dt className="text-sm font-medium text-text-tertiary">{t(`export.${key}`)}</dt>
                  <dd className="shrink-0 text-sm font-semibold text-text-primary">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </SettingsShell>
  )
}
