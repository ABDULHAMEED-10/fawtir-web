import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Select, Input, Rial, withRial } from '../../components/ui'
import {
  BULK_SAMPLE,
  BULK_SCOPE,
  CHANGE_WAYS,
  ROUNDING,
  newPrice,
  priceMovePercent,
  omr,
} from '../../lib/catalog'
import chartIcon from '../../assets/catalog/menu-chart.svg'
import percentIcon from '../../assets/catalog/menu-percent.svg'
import listIcon from '../../assets/catalog/menu-list.svg'
import lockIcon from '../../assets/catalog/kind-service.svg'
import tickIcon from '../../assets/catalog/check-white.svg'

const WHAT = [
  { id: 'price', icon: chartIcon },
  { id: 'tax', icon: percentIcon },
  { id: 'group', icon: listIcon },
  { id: 'onOff', icon: lockIcon },
]

/**
 * Change many prices at once (Figma 135:51601).
 *
 * The table under the controls is the whole point: rounding is applied after the change, so a
 * small price can move further than the percentage asked for. The screen works that out and
 * names the item it happens to rather than leaving it as a surprise.
 */
export function ChangePricesModal({
  open,
  onClose,
  count = BULK_SCOPE.count,
}: {
  open: boolean
  onClose: () => void
  count?: number
}) {
  const { t } = useTranslation()
  const [what, setWhat] = useState('price')
  const [way, setWay] = useState('percentUp')
  const [amount, setAmount] = useState('4')
  const [rounding, setRounding] = useState('0.050')
  const [applied, setApplied] = useState(false)

  const step = ROUNDING.find((entry) => entry.id === rounding)?.step ?? 0
  const value = Number(amount) || 0

  const rows = useMemo(
    () =>
      BULK_SAMPLE.map((row) => {
        const becomes = row.handSet ? row.price : newPrice(row.price, way, value, step)
        return { ...row, becomes, move: priceMovePercent(row.price, becomes) }
      }),
    [way, value, step],
  )

  const changing = rows.filter((row) => !row.handSet && row.becomes !== row.price)
  /** The scope is wider than the five rows drawn, so the count follows the scope. */
  const changingTotal = count - BULK_SCOPE.handSet
  const biggest = [...changing].sort((a, b) => Math.abs(b.move) - Math.abs(a.move))[0]
  const goingUp = way === 'percentUp' || way === 'amountUp'

  /** What the change would be worth over a quarter at the same volumes. */
  const quarterEffect = useMemo(() => {
    const perItem = rows
      .filter((row) => !row.handSet)
      .reduce((total, row) => total + (row.becomes - row.price) * row.sold, 0)
    const scale =
      BULK_SCOPE.quarterSales /
      Math.max(
        1,
        rows.reduce((n, r) => n + r.sold, 0),
      )
    return Math.round(perItem * scale * 1000) / 1000
  }, [rows])

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      title={t('changePrices.title', { count })}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-text-tertiary">
            {applied
              ? t('changePrices.applied')
              : t('changePrices.footer', {
                  count: changingTotal,
                  direction: goingUp ? t('changePrices.up') : t('changePrices.down'),
                  amount: value,
                  left: BULK_SCOPE.handSet,
                })}
          </p>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('changePrices.cancel')}
            </button>
            <button
              type="button"
              onClick={() => setApplied(true)}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={tickIcon} alt="" className="size-4" />
              {t('changePrices.apply', { count: changingTotal })}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* What to change */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
            {t('changePrices.whatToChange')}
          </p>
          <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {WHAT.map((entry) => {
              const picked = entry.id === what
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setWhat(entry.id)}
                  aria-pressed={picked}
                  className={[
                    'flex flex-col gap-2.5 rounded-sm border p-3 text-start transition-colors',
                    picked
                      ? 'border-primary-700 bg-primary-25'
                      : 'border-border-subtle bg-white hover:bg-primary-25',
                  ].join(' ')}
                >
                  <span className="flex size-7 items-center justify-center rounded-md bg-surface-background">
                    <img src={entry.icon} alt="" className="size-4" />
                  </span>
                  <span
                    className={[
                      'text-sm font-medium',
                      picked ? 'text-primary-800' : 'text-text-secondary',
                    ].join(' ')}
                  >
                    {t(`changePrices.what.${entry.id}`)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* How much */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
            {t('changePrices.howMuch')}
          </p>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                {t('changePrices.wayOfChanging')}
              </span>
              <Select
                ariaLabel={t('changePrices.wayOfChanging')}
                value={way}
                onChange={setWay}
                options={CHANGE_WAYS.map((entry) => ({
                  value: entry.id,
                  label: t(entry.labelKey),
                }))}
              />
            </label>
            <Input
              bordered
              label={t('changePrices.byHowMuch')}
              value={amount}
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
              trailingIcon={
                <span className="text-sm font-medium text-text-quaternary">
                  {way.startsWith('percent') ? '%' : <Rial />}
                </span>
              }
            />
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                {t('changePrices.roundTo')}
              </span>
              <Select
                ariaLabel={t('changePrices.roundTo')}
                value={rounding}
                onChange={setRounding}
                options={ROUNDING.map((entry) => ({
                  value: entry.id,
                  label: t(entry.labelKey),
                }))}
              />
            </label>
          </div>
        </div>

        {/* What each becomes */}
        <div>
          <p className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
              {t('changePrices.whatEachBecomes')}
            </span>
            <button
              type="button"
              className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
            >
              {t('changePrices.seeAll', { count })}
            </button>
          </p>

          <div className="mt-2 overflow-hidden rounded-sm border border-border-subtle">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-background/60 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                  <th className="h-[36px] px-3 text-start font-semibold">
                    {t('changePrices.col.item')}
                  </th>
                  <th className="h-[36px] px-3 text-end font-semibold">
                    {t('changePrices.col.now')}
                  </th>
                  <th className="h-[36px] px-3 text-end font-semibold">
                    {t('changePrices.col.becomes')}
                  </th>
                  <th className="h-[36px] px-3 text-end font-semibold">
                    {t('changePrices.col.change')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={[
                      'border-b border-surface-background last:border-0',
                      row.handSet ? 'bg-pending-100/40' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-3 align-top">
                      <p className="text-sm font-medium text-text-primary">{row.name}</p>
                      {row.handSet ? (
                        <p className="mt-1.5 inline-flex rounded-sm bg-pending-100 px-2 py-1 text-xs font-medium text-pending-700">
                          {t('changePrices.handSet')}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs font-medium text-text-quaternary">
                          {t(row.noteKey, { count: row.sold.toLocaleString('en-US') })}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-end text-sm font-medium text-text-quaternary tabular-nums">
                      {omr(row.price)}
                    </td>
                    <td className="px-3 py-3 align-top text-end text-sm font-semibold text-text-primary tabular-nums">
                      {omr(row.becomes)}
                    </td>
                    <td className="px-3 py-3 align-top text-end">
                      {row.handSet || row.move === 0 ? (
                        <span className="text-xs font-medium text-text-quaternary">
                          {t('changePrices.noChange')}
                        </span>
                      ) : (
                        <span
                          className={[
                            'text-sm font-semibold tabular-nums',
                            row.move > 0 ? 'text-[#3d5648]' : 'text-danger-700',
                          ].join(' ')}
                        >
                          {row.move > 0 ? '+' : ''}
                          {row.move}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Consequences */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Consequence
            edge="border-s-primary-700"
            label={t('changePrices.changing')}
            value={t('changePrices.changingOf', { changing: changingTotal, total: count })}
            note={t('changePrices.changingNote', { count: BULK_SCOPE.handSet })}
          />
          <Consequence
            edge="border-s-[#4c6c5a]"
            label={t('changePrices.onLastQuarter')}
            value={`${quarterEffect > 0 ? '+' : ''}OMR ${omr(Math.abs(quarterEffect))}`}
            note={t('changePrices.ifVolumesHold')}
          />
          <Consequence
            edge="border-s-pending-500"
            label={goingUp ? t('changePrices.biggestJump') : t('changePrices.biggestDrop')}
            value={biggest ? `${biggest.move > 0 ? '+' : ''}${biggest.move}%` : '—'}
            note={biggest ? t('changePrices.biggestJumpNote', { name: biggest.name }) : ''}
            tone="pending"
          />
        </div>
      </div>
    </Modal>
  )
}

function Consequence({
  edge,
  label,
  value,
  note,
  tone,
}: {
  edge: string
  label: string
  value: string
  note: string
  tone?: 'pending'
}) {
  return (
    <div className={['border-s-[3px] ps-3', edge].join(' ')}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
        {label}
      </p>
      <p
        className={[
          'mt-1.5 text-lg font-semibold leading-[1.2]',
          tone === 'pending'
            ? 'inline-flex rounded-sm bg-pending-100 px-2 py-1 text-pending-700'
            : 'text-text-primary',
        ].join(' ')}
      >
        {withRial(value)}
      </p>
      <p className="mt-1.5 text-xs font-medium leading-[1.5] text-text-quaternary">{note}</p>
    </div>
  )
}
