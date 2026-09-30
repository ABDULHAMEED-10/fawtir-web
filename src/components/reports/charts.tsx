import { useId } from 'react'
import { useCompact } from '../../hooks'
import { formatTick } from '../../lib/reports'
import { SERIES, axisMax } from './scale'

/**
 * The chart primitives the six Reports screens are drawn with (Figma 112:8367 and siblings).
 *
 * Hand-built SVG rather than a charting library: every one of these is a fixed shape from the
 * design with a fixed axis treatment, and a library would have to be fought into matching it.
 * They share one grid so the cards line up across the pages.
 */

const AXIS_TEXT = '#8a8e96'
const GRID = '#eceef2'

/** Five gridlines plus the baseline, which is how every Figma chart is ruled. */
const TICKS = 5

/** Five rules of numbers is a thicket on a phone; three still tells the story. */
const COMPACT_TICKS = 3

/**
 * The coordinate system each chart is drawn in.
 *
 * A chart is an SVG scaled to its container, so everything in it — the axis text included —
 * shrinks by the same factor. At 500 units wide inside a 310px phone card that factor is 0.62,
 * which takes 11px labels down to 7px. Drawing into a narrower box on a phone means far less
 * shrinking, and the labels stay readable without changing anything about how a chart looks on a
 * desktop, where the box is 500 as it always was.
 */
const COMPACT_WIDTH = 340

/** Room above the top gridline so its label is not clipped. */
const TOP_PAD = 10

function GridLines({
  width,
  height,
  max,
  min = 0,
  labelWidth,
  ticks = TICKS,
}: {
  width: number
  height: number
  max: number
  min?: number
  labelWidth: number
  ticks?: number
}) {
  const steps = Array.from({ length: ticks + 1 }, (_, index) => index)
  return (
    <g>
      {steps.map((step) => {
        const value = max - ((max - min) / ticks) * step
        const y = (height / ticks) * step
        return (
          <g key={step}>
            <line x1={labelWidth} x2={width} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
            <text
              x={labelWidth - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fontWeight={500}
              fill={AXIS_TEXT}
            >
              {formatTick(value)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function MonthLabels({
  labels,
  width,
  labelWidth,
  y,
  highlight,
}: {
  labels: string[]
  width: number
  labelWidth: number
  y: number
  highlight?: number
}) {
  // Twelve months will not fit across a phone, so every other one is drawn — but never at the
  // cost of the month being pointed at. Four quarters or three years always fit, so are left be.
  const compact = useCompact()
  const every = compact && labels.length > 6 ? 2 : 1
  const band = (width - labelWidth) / labels.length
  return (
    <g>
      {labels.map((label, index) =>
        index % every !== 0 && index !== highlight ? null : (
          <text
            key={label + index}
            x={labelWidth + band * index + band / 2}
            y={y}
            textAnchor="middle"
            fontSize={11}
            fontWeight={index === highlight ? 600 : 500}
            fill={index === highlight ? SERIES.strong : AXIS_TEXT}
          >
            {label}
          </text>
        ),
      )}
    </g>
  )
}

/* ------------------------------------------------------------ stacked bars */

/**
 * Net and VAT stacked in one bar, one bar per month — Income and Expenditure "Monthly".
 * The current month is drawn solid, as in the design.
 */
export function StackedBars({
  data,
  labels,
  highlight,
  height = 210,
  labelWidth = 46,
}: {
  data: { base: number; top: number }[]
  labels: string[]
  highlight?: number
  height?: number
  labelWidth?: number
}) {
  const compact = useCompact()
  const width = compact ? COMPACT_WIDTH : 500
  const max = axisMax(
    data.map((d) => d.base + d.top),
    1.15,
  )
  const band = (width - labelWidth) / data.length
  const barWidth = Math.min(band * 0.52, 22)

  return (
    <svg
      viewBox={`0 -${TOP_PAD} ${width} ${height + 26 + TOP_PAD}`}
      className="w-full"
      role="presentation"
      // Time runs left to right in both languages; RTL would also flip every text anchor.
      direction="ltr"
    >
      <GridLines
        width={width}
        height={height}
        max={max}
        labelWidth={labelWidth}
        ticks={compact ? COMPACT_TICKS : TICKS}
      />
      {data.map((d, index) => {
        const x = labelWidth + band * index + (band - barWidth) / 2
        const baseHeight = Math.max(0, (d.base / max) * height)
        const topHeight = Math.max(0, (d.top / max) * height)
        const current = index === highlight
        return (
          <g key={index}>
            <rect
              x={x}
              y={height - baseHeight}
              width={barWidth}
              height={baseHeight}
              fill={current ? SERIES.strong : SERIES.soft}
              rx={2}
            />
            <rect
              x={x}
              y={height - baseHeight - topHeight}
              width={barWidth}
              height={topHeight}
              fill={current ? SERIES.strong : SERIES.grey}
              rx={2}
            />
          </g>
        )
      })}
      <MonthLabels
        labels={labels}
        width={width}
        labelWidth={labelWidth}
        y={height + 18}
        highlight={highlight}
      />
    </svg>
  )
}

/* ------------------------------------------------------------ grouped bars */

/** Two series side by side per category — "Quarterly" and "Quarterly position". */
export function GroupedBars({
  data,
  labels,
  colors = [SERIES.soft, SERIES.strong],
  height = 210,
  labelWidth = 52,
}: {
  data: { a: number; b: number }[]
  labels: string[]
  /** `[first series, second series]`, in the order the legend lists them. */
  colors?: [string, string]
  height?: number
  labelWidth?: number
}) {
  const compact = useCompact()
  const width = compact ? COMPACT_WIDTH : 500
  const max = axisMax(
    data.flatMap((d) => [d.a, d.b]),
    1.188,
  )
  const band = (width - labelWidth) / data.length
  const barWidth = Math.min(band * 0.24, 26)
  const gap = 6

  return (
    <svg
      viewBox={`0 -${TOP_PAD} ${width} ${height + 26 + TOP_PAD}`}
      className="w-full"
      role="presentation"
      // Time runs left to right in both languages; RTL would also flip every text anchor.
      direction="ltr"
    >
      <GridLines
        width={width}
        height={height}
        max={max}
        labelWidth={labelWidth}
        ticks={compact ? COMPACT_TICKS : TICKS}
      />
      {data.map((d, index) => {
        const centre = labelWidth + band * index + band / 2
        const aHeight = Math.max(0, (d.a / max) * height)
        const bHeight = Math.max(0, (d.b / max) * height)
        return (
          <g key={index}>
            <rect
              x={centre - barWidth - gap / 2}
              y={height - aHeight}
              width={barWidth}
              height={aHeight}
              fill={colors[0]}
              rx={2}
            />
            <rect
              x={centre + gap / 2}
              y={height - bHeight}
              width={barWidth}
              height={bHeight}
              fill={colors[1]}
              rx={2}
            />
          </g>
        )
      })}
      <MonthLabels labels={labels} width={width} labelWidth={labelWidth} y={height + 18} />
    </svg>
  )
}

/* -------------------------------------------------------------- plain bars */

/** How tall the dashed "no data" outline stands: visible, and plainly not a measured bar. */
const MISSING_HEIGHT = 14

/** One bar per month — "What you kept", "Monthly net payable", "Time to clear the OTA". */
export function PlainBars({
  values,
  labels,
  highlight,
  color = SERIES.soft,
  highlightColor = SERIES.strong,
  height = 210,
  labelWidth = 46,
  missingLabel,
}: {
  /** `null` is a month with no data: drawn as an empty dashed outline, never as a zero bar. */
  values: (number | null)[]
  labels: string[]
  highlight?: number
  color?: string
  highlightColor?: string
  height?: number
  labelWidth?: number
  /** Tooltip on a month with no data. */
  missingLabel?: string
}) {
  const compact = useCompact()
  const width = compact ? COMPACT_WIDTH : 500
  const max = axisMax(values.filter((value): value is number => value !== null))
  const band = (width - labelWidth) / values.length
  const barWidth = Math.min(band * 0.52, 22)

  return (
    <svg
      viewBox={`0 -${TOP_PAD} ${width} ${height + 26 + TOP_PAD}`}
      className="w-full"
      role="presentation"
      // Time runs left to right in both languages; RTL would also flip every text anchor.
      direction="ltr"
    >
      <GridLines
        width={width}
        height={height}
        max={max}
        labelWidth={labelWidth}
        ticks={compact ? COMPACT_TICKS : TICKS}
      />
      {values.map((value, index) => {
        if (value === null) {
          return (
            <rect
              key={index}
              x={labelWidth + band * index + (band - barWidth) / 2 + 0.5}
              y={height - MISSING_HEIGHT}
              width={barWidth - 1}
              height={MISSING_HEIGHT - 0.5}
              fill="none"
              stroke={AXIS_TEXT}
              strokeWidth={1}
              strokeDasharray="3 2"
              rx={2}
            >
              {missingLabel ? <title>{missingLabel}</title> : null}
            </rect>
          )
        }
        const barHeight = Math.max(0, (value / max) * height)
        return (
          <rect
            key={index}
            x={labelWidth + band * index + (band - barWidth) / 2}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            fill={index === highlight ? highlightColor : color}
            rx={2}
          />
        )
      })}
      <MonthLabels
        labels={labels}
        width={width}
        labelWidth={labelWidth}
        y={height + 18}
        highlight={highlight}
      />
    </svg>
  )
}

/* ---------------------------------------------------------- diverging bars */

/** Four intervals: two above the line, two below, and zero in the middle. */
const DIVERGING_TICKS = 4

/**
 * Money in above the line, money out below — "Monthly in and out" and "The next eight weeks".
 * Both sides share one scale so the two halves stay comparable.
 */
export function DivergingBars({
  data,
  labels,
  highlight,
  upColor = SERIES.green,
  downColor = SERIES.brown,
  upSoft = SERIES.greenSoft,
  downSoft = SERIES.brownSoft,
  height = 210,
  labelWidth = 50,
}: {
  data: { up: number; down: number }[]
  labels: string[]
  highlight?: number
  upColor?: string
  downColor?: string
  upSoft?: string
  downSoft?: string
  height?: number
  labelWidth?: number
}) {
  const compact = useCompact()
  const width = compact ? COMPACT_WIDTH : 500
  const max = axisMax(data.flatMap((d) => [d.up, d.down]))
  const half = height / 2
  const band = (width - labelWidth) / data.length
  const barWidth = Math.min(band * 0.5, 22)
  // An even number of intervals so zero lands on the middle gridline, as in the design.
  const steps = Array.from({ length: DIVERGING_TICKS + 1 }, (_, index) => index)

  return (
    <svg
      viewBox={`0 -${TOP_PAD} ${width} ${height + 26 + TOP_PAD}`}
      className="w-full"
      role="presentation"
      // Time runs left to right in both languages; RTL would also flip every text anchor.
      direction="ltr"
    >
      {steps.map((step) => {
        const y = (height / DIVERGING_TICKS) * step
        // The scale runs +max at the top, through zero, to −max at the bottom.
        const value = max - ((max * 2) / DIVERGING_TICKS) * step
        const zero = Math.abs(value) < max / 1000
        return (
          <g key={step}>
            <line
              x1={labelWidth}
              x2={width}
              y1={y}
              y2={y}
              stroke={zero ? '#d6d8dd' : GRID}
              strokeWidth={1}
            />
            <text
              x={labelWidth - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fontWeight={500}
              fill={AXIS_TEXT}
            >
              {formatTick(Math.abs(value))}
            </text>
          </g>
        )
      })}
      {data.map((d, index) => {
        const x = labelWidth + band * index + (band - barWidth) / 2
        const upHeight = Math.max(0, (d.up / max) * half)
        const downHeight = Math.max(0, (d.down / max) * half)
        const current = index === highlight
        return (
          <g key={index}>
            <rect
              x={x}
              y={half - upHeight}
              width={barWidth}
              height={upHeight}
              fill={current ? upColor : upSoft}
              rx={2}
            />
            <rect
              x={x}
              y={half}
              width={barWidth}
              height={downHeight}
              fill={current ? downColor : downSoft}
              rx={2}
            />
          </g>
        )
      })}
      <MonthLabels
        labels={labels}
        width={width}
        labelWidth={labelWidth}
        y={height + 18}
        highlight={highlight}
      />
    </svg>
  )
}

/* -------------------------------------------------------------- line chart */

/** A line over a soft fill — "Annually" and "Accepted first time". */
export function LineChart({
  values,
  labels,
  height = 210,
  labelWidth = 52,
  showDots = true,
  fromZero = true,
}: {
  /**
   * `null` is a point with no data (a month nothing was sent in): the line breaks there and no
   * dot is drawn, rather than the line dropping to zero or holding the month before.
   */
  values: (number | null)[]
  labels: string[]
  height?: number
  labelWidth?: number
  showDots?: boolean
  /** Percentages read better on their own scale than from zero. */
  fromZero?: boolean
}) {
  const compact = useCompact()
  const width = compact ? COMPACT_WIDTH : 500
  const gradientId = useId()
  const known = values.filter((value): value is number => value !== null)
  const max = fromZero ? axisMax(known, 1.275) : Math.max(...known, 0) * 1.02 || 1
  const plotWidth = width - labelWidth
  const step = values.length > 1 ? plotWidth / (values.length - 1) : 0
  const xAt = (index: number) => labelWidth + step * index
  const pointAt = (value: number, index: number) => ({
    x: xAt(index),
    y: height - (value / max) * height,
  })
  // Runs of consecutive points with data; each is drawn as its own line and fill.
  const runs: { x: number; y: number }[][] = []
  values.forEach((value, index) => {
    if (value === null) return
    const previous = index > 0 ? values[index - 1] : null
    if (index === 0 || previous === null) runs.push([])
    runs[runs.length - 1].push(pointAt(value, index))
  })
  const points = runs.flat()
  const lineOf = (run: { x: number; y: number }[]) =>
    run.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  const line = runs.map(lineOf).join(' ')
  const area = runs
    .map((run) => `${lineOf(run)} L${run[run.length - 1].x} ${height} L${run[0].x} ${height} Z`)
    .join(' ')

  return (
    <svg
      viewBox={`0 -${TOP_PAD} ${width} ${height + 26 + TOP_PAD}`}
      className="w-full"
      role="presentation"
      // Time runs left to right in both languages; RTL would also flip every text anchor.
      direction="ltr"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SERIES.strong} stopOpacity={0.12} />
          <stop offset="100%" stopColor={SERIES.strong} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <GridLines
        width={width}
        height={height}
        max={max}
        labelWidth={labelWidth}
        ticks={compact ? COMPACT_TICKS : TICKS}
      />
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={SERIES.strong} strokeWidth={2} strokeLinejoin="round" />
      {showDots
        ? points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={4}
              fill="#ffffff"
              stroke={SERIES.strong}
              strokeWidth={2}
            />
          ))
        : null}
      <g>
        {labels.map((label, index) => (
          <text
            key={label + index}
            x={xAt(index)}
            y={height + 18}
            textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}
            fontSize={11}
            fontWeight={index === labels.length - 1 ? 600 : 500}
            fill={index === labels.length - 1 ? SERIES.strong : AXIS_TEXT}
          >
            {label}
          </text>
        ))}
      </g>
    </svg>
  )
}

/* ------------------------------------------------------- horizontal bars */

/** The longest bar stops here, leaving room for the figure printed after it. */
const BAR_SCALE = 82

/** A ranked list with a bar and its figure — "Top customers", "Where it went". */
export function HorizontalBars({
  rows,
}: {
  rows: { label: string; value: number; display: string }[]
}) {
  const max = Math.max(...rows.map((row) => row.value), 1)
  return (
    <ul className="flex w-full flex-col gap-[26px] py-1">
      {rows.map((row, index) => (
        <li key={index} className="flex items-center gap-4">
          {/* dir=auto: a Latin name cut short on an Arabic page loses its end, not its start. */}
          <span
            title={row.label}
            dir="auto"
            className="w-[120px] shrink-0 truncate text-xs font-medium leading-[1.3] text-text-secondary max-md:w-[92px] rtl:text-right"
          >
            {row.label}
          </span>
          <span className="flex min-w-0 flex-1 items-center">
            <span
              className="h-[18px] shrink-0 rounded-[3px]"
              style={{
                width: `${(Math.max(0, row.value) / max) * BAR_SCALE}%`,
                backgroundColor: index === 0 ? SERIES.strong : SERIES.soft,
              }}
            />
            <span className="ms-2 shrink-0 text-xs font-medium text-text-secondary tabular-nums">
              {row.display}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------- stacked percent rows */

/** A row per period, split into shares that total 100 — "How bills reach you". */
export function StackedPercentRows({
  rows,
  colors,
  minLabelWidth = 8,
}: {
  /**
   * `pending` draws the row as one neutral bar carrying that text, for a row whose split the
   * platform does not report yet; the row keeps its place rather than vanishing.
   */
  rows: { label: string; parts: number[]; pending?: string }[]
  colors: string[]
  /** Below this share a segment is too narrow for its own number. */
  minLabelWidth?: number
}) {
  return (
    <ul className="flex w-full flex-col gap-[42px] py-2">
      {rows.map((row, rowIndex) => (
        <li key={rowIndex} className="flex items-center gap-4">
          <span className="w-[76px] shrink-0 text-xs font-medium leading-[1.3] text-text-secondary">
            {row.label}
          </span>
          <span className="flex h-[22px] min-w-0 flex-1 gap-[3px]">
            {row.pending !== undefined ? (
              <span className="flex w-full items-center justify-center rounded-[3px] bg-[#eceef2] text-[10px] font-semibold text-text-quaternary">
                {row.pending}
              </span>
            ) : null}
            {(row.pending !== undefined ? [] : row.parts).map((part, index) =>
              part <= 0 ? null : (
                <span
                  key={index}
                  className="flex items-center justify-center rounded-[3px] text-[10px] font-semibold"
                  style={{
                    width: `${part}%`,
                    backgroundColor: colors[index],
                    color: isLight(colors[index]) ? '#5b606c' : '#ffffff',
                  }}
                >
                  {part >= minLabelWidth ? `${part}%` : null}
                </span>
              ),
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Whether a segment's fill is pale enough to need dark text on it. */
function isLight(hex: string) {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 170
}
