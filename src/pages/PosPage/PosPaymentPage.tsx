import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import {
  OPEN_SALE,
  VAT_RATE,
  itemById,
  omr,
  omrSigned,
  totalsFor,
  unitPrice,
  LULL,
} from '../../lib/pos'
import {
  METHODS,
  TAKEN,
  TIP_CHOICES,
  changeDue,
  quickCash,
  stillToCollect,
  tipFor,
  toPay,
  type MethodId,
  type Taken,
  type TipChoice,
} from '../../lib/posPayment'

function MethodTile({
  id,
  label,
  hotkey,
  chosen,
  onPick,
}: {
  id: MethodId
  label: string
  hotkey: string
  chosen: boolean
  onPick: (id: MethodId) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      aria-pressed={chosen}
      className={[
        'flex min-w-[150px] flex-1 flex-col items-center gap-2 rounded-md border py-6 transition-colors',
        chosen
          ? 'border-primary-700 bg-primary-25'
          : 'border-border-subtle bg-surface-card hover:border-primary-300',
      ].join(' ')}
    >
      <span
        className={[
          'flex size-10 items-center justify-center rounded-sm',
          chosen ? 'bg-primary-700 text-white' : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect
            x="2.5"
            y="5"
            width="15"
            height="10"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <span
        className={[
          'text-base',
          chosen ? 'font-semibold text-primary-800' : 'font-medium text-text-secondary',
        ].join(' ')}
      >
        {label}
      </span>
      <span className="text-xs font-medium text-text-quaternary">{hotkey}</span>
    </button>
  )
}

export function PosPaymentPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const totals = totalsFor(OPEN_SALE)

  const [tipChoice, setTipChoice] = useState<TipChoice>('roundUp')
  const [taken, setTaken] = useState<Taken[]>(TAKEN)
  const [method, setMethod] = useState<MethodId>('cash')
  const [handedOver, setHandedOver] = useState(5000)

  const tip = tipFor(tipChoice, totals.sale)
  const owed = toPay(totals.sale, tip)
  const left = stillToCollect(owed, taken)
  const change = changeDue(taken)
  const covered = left === 0

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <Link
          to="/pos"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
        >
          ‹ {t('pos.backToSale')}
        </Link>

        <section className="flex flex-wrap items-center justify-between gap-6 rounded-md bg-surface-card px-6 py-5">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                {t('pos.pay.toPay')}
              </p>
              <p className="mt-1 text-[34px] font-semibold leading-none text-text-primary">
                {omr(owed)}
              </p>
            </div>
            <div className="flex gap-6 border-s border-border-subtle ps-6 max-md:border-s-0 max-md:ps-0">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                  {t('pos.pay.sale')}
                </p>
                <p className="mt-1 text-xl font-medium text-text-secondary">{omr(totals.sale)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                  {t('pos.pay.tip')}
                </p>
                <p className="mt-1 text-xl font-medium text-text-secondary">{omr(tip)}</p>
              </div>
            </div>
          </div>
          <div className="text-end">
            <p className="text-sm font-medium text-text-quaternary">
              {t('pos.pay.stillToCollect')}
            </p>
            <p
              className={[
                'mt-1 text-2xl font-semibold',
                covered ? 'text-success-700' : 'text-text-primary',
              ].join(' ')}
            >
              {omr(left)}
            </p>
          </div>
        </section>

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-[320px] flex-1 flex-col gap-4">
            <section className="flex flex-col rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-6 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.pay.howPaying')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.pay.splitIt')}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 px-6 py-4">
                {METHODS.map((entry) => (
                  <MethodTile
                    key={entry.id}
                    id={entry.id}
                    label={t(entry.labelKey)}
                    hotkey={entry.hotkey}
                    chosen={
                      method === entry.id || taken.some((payment) => payment.method === entry.id)
                    }
                    onPick={setMethod}
                  />
                ))}
              </div>

              {method === 'cash' && !covered ? (
                <div className="flex flex-wrap gap-4 px-6 pb-4">
                  <div className="min-w-[260px] flex-1">
                    <p className="text-xs font-medium text-text-tertiary">
                      {t('pos.pay.handedOver', { amount: omr(left) })}
                    </p>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={(handedOver / 1000).toFixed(3)}
                      onChange={(event) => {
                        const next = Number(event.target.value.replace(/[^0-9.]/g, '')) * 1000
                        setHandedOver(Number.isFinite(next) ? Math.round(next) : 0)
                      }}
                      aria-label={t('pos.pay.handedOverLabel')}
                      className="mt-2 h-[60px] w-full rounded-sm border-2 border-primary-700 bg-primary-25 px-4 text-end text-2xl font-semibold text-text-primary outline-none"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickCash(left).map((amount, index) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setHandedOver(amount)}
                          className={[
                            'inline-flex h-10 items-center rounded-sm border px-3 text-sm font-semibold transition-colors',
                            handedOver === amount
                              ? 'border-primary-700 bg-primary-25 text-primary-800'
                              : 'border-border-subtle bg-white text-text-secondary hover:border-primary-300',
                          ].join(' ')}
                        >
                          {index === 0 ? t('pos.pay.exact', { amount: omr(amount) }) : omr(amount)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-[240px] flex-1 rounded-sm bg-success-100 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                      {t('pos.pay.changeToGive')}
                    </p>
                    <p className="mt-1 text-[30px] font-semibold leading-none text-success-700">
                      {omr(Math.max(0, handedOver - left))}
                    </p>
                    <p className="mt-2 text-xs font-medium leading-[1.5] text-text-tertiary">
                      {t('pos.pay.drawerOpens')}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setTaken((current) => [
                          ...current,
                          {
                            id: `p${Date.now()}`,
                            method: 'cash',
                            amount: left,
                            handedOver,
                          },
                        ])
                      }
                      className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-sm bg-success-700 text-sm font-semibold text-white"
                    >
                      {t('pos.pay.takeCash', { amount: omr(left) })}
                    </button>
                  </div>
                </div>
              ) : null}

              <ul className="flex flex-wrap gap-4 border-t border-border-subtle px-6 py-4">
                {taken.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex min-w-[260px] flex-1 items-center gap-3 border-b border-border-subtle pb-3 last:border-b-0 max-md:border-b"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background text-text-tertiary">
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                        <rect
                          x="2.5"
                          y="5"
                          width="15"
                          height="10"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text-primary">
                        {t(`pos.pay.${payment.method}`)}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                        {payment.approvalKey
                          ? t(payment.approvalKey, payment.approvalValues)
                          : t('pos.pay.cashGiven', {
                              given: omr(payment.handedOver ?? 0),
                              change: omr((payment.handedOver ?? 0) - payment.amount),
                            })}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-text-primary">
                      {omr(payment.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTaken((c) => c.filter((p) => p.id !== payment.id))}
                      aria-label={t('pos.pay.remove')}
                      className="shrink-0 text-text-quaternary transition-colors hover:text-danger-700"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-6 py-4">
                {covered ? (
                  <p className="flex flex-1 items-center gap-2 rounded-sm bg-success-100 px-3 py-2.5 text-sm font-medium text-text-tertiary">
                    <span className="text-success-700">✓</span>
                    {t('pos.pay.allCovered', { amount: omr(owed) })}
                  </p>
                ) : (
                  <p className="flex-1 text-sm font-medium text-text-tertiary">
                    {t('pos.pay.stillOwed', { amount: omr(left) })}
                  </p>
                )}
              </div>
            </section>

            <section className="flex flex-col rounded-md bg-surface-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
                <div>
                  <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('pos.pay.tipTitle')}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-text-quaternary">
                    {t('pos.pay.tipNote')}
                  </p>
                </div>
                <button type="button" className="text-sm font-semibold text-primary-700">
                  {t('pos.pay.whoGetsIt')}
                </button>
              </div>
              <div className="flex flex-wrap gap-3 px-6 py-4">
                {TIP_CHOICES.map((choice) => {
                  const value = tipFor(choice, totals.sale)
                  const chosen = choice === tipChoice
                  return (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setTipChoice(choice)}
                      aria-pressed={chosen}
                      className={[
                        'flex min-w-[110px] flex-1 flex-col items-center gap-1 rounded-md border py-4 transition-colors',
                        chosen
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'text-base',
                          chosen
                            ? 'font-semibold text-primary-800'
                            : 'font-medium text-text-secondary',
                        ].join(' ')}
                      >
                        {t(`pos.pay.tipChoice.${choice}`)}
                      </span>
                      {choice !== 'none' ? (
                        <span className="text-xs font-medium text-text-quaternary">
                          {omr(value)}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <p className="border-t border-border-subtle px-6 py-4 text-xs font-medium leading-[1.6] text-text-tertiary">
                {t('pos.pay.tipExplained', {
                  base: omr(totals.beforeVat),
                  tip: omr(tip),
                  rate: VAT_RATE * 100,
                })}
              </p>
            </section>
          </div>

          <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.pay.walkInCustomer')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('pos.pay.receiptWithQr', { count: OPEN_SALE.length })}
              </p>
            </div>
            <ul className="flex flex-col px-5">
              {OPEN_SALE.map((line) => {
                const item = itemById(line.itemId)
                const size = item.sizes?.find((s) => s.id === line.sizeId)
                const addOns = (item.addOns ?? []).filter((a) => line.addOnIds.includes(a.id))
                return (
                  <li
                    key={line.id}
                    className="flex items-start gap-3 border-b border-border-subtle py-3 last:border-b-0"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-surface-background text-xs font-semibold text-text-tertiary">
                      {line.qty}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-text-primary">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                        {size ? t(size.labelKey) : t('pos.oneSizeOnly')}
                        {addOns.length
                          ? ` · ${addOns.map((a) => `+ ${t(a.labelKey)}`).join(', ')}`
                          : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-text-primary">
                      {omr(unitPrice(line) * line.qty)}
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-col gap-2.5 border-t border-border-subtle px-5 py-4">
              <Row label={t('pos.totals.items')} value={omr(totals.items)} />
              <Row
                label={t('pos.totals.lull', { percent: LULL.percent })}
                value={omrSigned(-totals.discount)}
              />
              <Row label={t('pos.totals.vat')} value={omr(totals.vat)} />
              <Row label={t('pos.pay.sale')} value={omr(totals.sale)} />
              <Row label={t(`pos.pay.tipRow.${tipChoice}`)} value={omr(tip)} />
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
                <span className="text-lg font-medium text-text-primary">{t('pos.pay.total')}</span>
                <span className="text-[26px] font-semibold leading-none text-text-primary">
                  {omr(owed)}
                </span>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                type="button"
                disabled={!covered}
                onClick={() => navigate('/pos/done')}
                className="inline-flex h-[52px] w-full items-center justify-center rounded-sm bg-success-700 text-base font-semibold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('pos.pay.finish')}
              </button>
              <p className="mt-3 text-xs font-medium leading-[1.6] text-text-quaternary">
                {t('pos.pay.finishNote', { change: omr(change) })}
              </p>
            </div>
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
      <span className="text-sm font-semibold tabular-nums text-text-primary">{value}</span>
    </div>
  )
}
