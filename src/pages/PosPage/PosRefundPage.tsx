import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { Rial, TableCheckbox, withRial } from '../../components/ui'
import { PosFootNote } from './PosFootNote'
import { DocumentIcon } from './posIcons'
import { LULL, OPEN_SALE, itemById, omr, omrSigned, unitPrice } from '../../lib/pos'
import {
  CREDITED_INVOICE,
  RETURNING,
  WHY_OPTIONS,
  creditFor,
  lineNote,
  soldQty,
  standsAt,
  type PutRightChoice,
  type ReturnLine,
  type StockChoice,
  type WhyId,
} from '../../lib/posRefund'

export function PosRefundPage() {
  const { t } = useTranslation()
  const [returning, setReturning] = useState<ReturnLine[]>(RETURNING)
  const [stock, setStock] = useState<StockChoice>('thrownAway')
  const [choice, setChoice] = useState<PutRightChoice>('moneyBack')
  const [why, setWhy] = useState<WhyId>('madeWrong')

  const credit = creditFor(returning)
  const anything = credit.items > 0

  const setQty = (lineId: string, qty: number) =>
    setReturning((current) =>
      current.map((entry) =>
        entry.lineId === lineId
          ? { ...entry, qty: Math.max(0, Math.min(soldQty(lineId), qty)) }
          : entry,
      ),
    )

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <Link
          to="/pos/today"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
        >
          ‹ {t('pos.backToSale')}
        </Link>

        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('pos.refund.title')}
          </h1>
          <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
            {t('pos.refund.soldAgo', {
              invoice: CREDITED_INVOICE.id,
              minutes: CREDITED_INVOICE.soldMinutesAgo,
              who: CREDITED_INVOICE.soldBy,
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-[320px] flex-1 flex-col gap-4">
            <section className="rounded-md bg-surface-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
                <div>
                  <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('pos.refund.whatsGoingBack')}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-text-quaternary">
                    {t('pos.refund.tickTheLines')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setReturning(OPEN_SALE.map((line) => ({ lineId: line.id, qty: line.qty })))
                  }
                  className="text-sm font-semibold text-primary-700"
                >
                  {t('pos.refund.allOfIt')}
                </button>
              </div>

              {/* The invoice and its lines run the full width of the card, divided like rows. */}
              <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary-25 text-primary-700">
                  <DocumentIcon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">
                    {CREDITED_INVOICE.id} · {t(CREDITED_INVOICE.whoKey)}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                    {CREDITED_INVOICE.when} ·{' '}
                    {withRial(t(CREDITED_INVOICE.paidKey, CREDITED_INVOICE.paidValues))}
                  </span>
                </span>
                <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-success-700">
                  <span className="size-1.5 rounded-full bg-current" />
                  {t('pos.refund.acceptedByOta')}
                </span>
              </div>

              <ul>
                {OPEN_SALE.map((line) => {
                  const item = itemById(line.itemId)
                  const entry = returning.find((r) => r.lineId === line.id)
                  const qty = entry?.qty ?? 0
                  const note = lineNote(line.id)
                  return (
                    <li
                      key={line.id}
                      className={[
                        'flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3.5 last:border-b-0',
                        qty > 0 ? 'bg-primary-25' : '',
                      ].join(' ')}
                    >
                      <TableCheckbox
                        checked={qty > 0}
                        onChange={() => setQty(line.id, qty > 0 ? 0 : line.qty)}
                        ariaLabel={t('pos.refund.sendBack', { name: item.name })}
                      />
                      <span className="min-w-[180px] flex-1">
                        <span className="block text-base font-medium leading-[1.2] text-text-primary">
                          {item.name}
                          {line.sizeId
                            ? ` · ${t(item.sizes?.find((s) => s.id === line.sizeId)?.labelKey ?? '')}`
                            : ''}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t(note.key, note.values)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 rounded-sm border border-border-subtle bg-white">
                        <button
                          type="button"
                          onClick={() => setQty(line.id, qty - 1)}
                          aria-label={t('pos.oneFewer', { name: item.name })}
                          className="flex size-8 items-center justify-center text-text-secondary"
                        >
                          −
                        </button>
                        <span className="min-w-[46px] text-center text-sm font-semibold tabular-nums text-text-primary">
                          {qty}{' '}
                          <span className="text-xs font-medium text-text-quaternary">
                            {t('pos.refund.ofSold', { count: line.qty })}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(line.id, qty + 1)}
                          aria-label={t('pos.oneMore', { name: item.name })}
                          className="flex size-8 items-center justify-center text-text-secondary"
                        >
                          +
                        </button>
                      </span>
                      <span className="w-[80px] shrink-0 text-end text-base font-semibold text-text-primary">
                        {omr(creditFor([{ lineId: line.id, qty }]).back)}
                      </span>
                    </li>
                  )
                })}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
                <div className="min-w-[240px] flex-1">
                  <p className="text-sm font-semibold text-text-primary">
                    {t('pos.refund.backOnShelf')}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('pos.refund.backOnShelfNote')}
                  </p>
                </div>
                <div className="inline-flex shrink-0 rounded-sm bg-surface-background p-1">
                  {(['backInStock', 'thrownAway'] as StockChoice[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setStock(option)}
                      aria-pressed={stock === option}
                      className={[
                        'inline-flex h-9 items-center whitespace-nowrap rounded-sm px-3 text-sm transition-colors',
                        stock === option
                          ? 'bg-surface-card font-semibold text-text-primary shadow-sm'
                          : 'font-medium text-text-quaternary',
                      ].join(' ')}
                    >
                      {t(`pos.refund.${option}`)}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-5 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.refund.moneyOrSwap')}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3 px-5 py-4 max-md:grid-cols-1">
                {(['moneyBack', 'makeAnother'] as PutRightChoice[]).map((option) => {
                  const chosen = option === choice
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setChoice(option)}
                      aria-pressed={chosen}
                      className={[
                        'flex items-start gap-3 rounded-md border px-4 py-3.5 text-start transition-colors',
                        chosen
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                          chosen ? 'border-primary-700' : 'border-border-default',
                        ].join(' ')}
                      >
                        {chosen ? <span className="size-2 rounded-full bg-primary-700" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={[
                            'text-sm font-semibold',
                            chosen ? 'text-primary-800' : 'text-text-primary',
                          ].join(' ')}
                        >
                          {t(`pos.refund.${option}`)}
                        </span>{' '}
                        <span className="text-xs font-medium leading-[1.5] text-text-quaternary">
                          {t(`pos.refund.${option}Note`, { amount: omr(credit.back) })}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-5 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.refund.why')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.refund.whyNote')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 px-5 py-4">
                {WHY_OPTIONS.map((option) => {
                  const chosen = option === why
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setWhy(option)}
                      aria-pressed={chosen}
                      className={[
                        'inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-sm border px-3 text-sm transition-colors',
                        chosen
                          ? 'border-primary-700 bg-primary-25 font-semibold text-primary-800'
                          : 'border-border-subtle bg-white font-medium text-text-secondary hover:border-primary-300',
                      ].join(' ')}
                    >
                      {t(`pos.refund.reason.${option}`)}
                    </button>
                  )
                })}
              </div>
              <div className="px-5 pb-5">
                <textarea
                  rows={3}
                  placeholder={t('pos.refund.anythingToAdd')}
                  className="w-full resize-none rounded-sm border border-border-subtle bg-white px-4 py-3 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand"
                />
              </div>
            </section>
          </div>

          <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.refund.creditNote')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('pos.refund.filedStraightAway', { number: CREDITED_INVOICE.number })}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 px-5 py-4">
              {returning
                .filter((entry) => entry.qty > 0)
                .map((entry) => {
                  const line = OPEN_SALE.find((l) => l.id === entry.lineId)!
                  const item = itemById(line.itemId)
                  return (
                    <Row
                      key={entry.lineId}
                      label={`${entry.qty} × ${item.name}${
                        line.sizeId
                          ? ` · ${t(item.sizes?.find((s) => s.id === line.sizeId)?.labelKey ?? '')}`
                          : ''
                      }`}
                      value={omr(unitPrice(line) * entry.qty)}
                    />
                  )
                })}
              {!anything ? (
                <p className="py-6 text-center text-sm font-medium text-text-tertiary">
                  {t('pos.refund.nothingSelected')}
                </p>
              ) : null}
              {anything ? (
                <>
                  <Row
                    label={t('pos.totals.lullShort', { percent: LULL.percent })}
                    value={omrSigned(-credit.discount)}
                  />
                  <Row label={t('pos.done.beforeVat')} value={omr(credit.beforeVat)} />
                  <Row label={t('pos.totals.vat')} value={omr(credit.vat)} />
                  <Row label={t('pos.refund.tipNotRefunded')} value={omr(0)} />
                </>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
              <span className="text-lg font-medium text-text-primary">
                {t('pos.refund.backToThem')}
              </span>
              <span className="inline-flex items-baseline gap-1.5 text-[26px] font-semibold leading-none text-danger-700">
                <Rial />
                {omr(credit.back)}
              </span>
            </div>

            <div className="mx-5 rounded-sm bg-surface-background p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                {t('pos.refund.worthAfterwards', { invoice: CREDITED_INVOICE.id })}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <Row label={t('pos.refund.was')} value={omr(CREDITED_INVOICE.was)} />
                <Row label={t('pos.refund.credited')} value={omrSigned(-credit.back)} />
                <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {t('pos.refund.standsAt')}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-text-primary">
                    {omr(standsAt(CREDITED_INVOICE.was, credit.back))}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-border-subtle px-5 py-5">
              <button
                type="button"
                disabled={!anything}
                className="inline-flex h-[52px] w-full items-center justify-center rounded-sm bg-danger-700 text-base font-semibold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('pos.refund.refundAmount', { amount: omr(credit.back) })}
              </button>
            </div>
            <PosFootNote>{t('pos.refund.filedNote')}</PosFootNote>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      <span dir="ltr" className="text-sm font-semibold tabular-nums text-text-primary">
        {value}
      </span>
    </div>
  )
}
