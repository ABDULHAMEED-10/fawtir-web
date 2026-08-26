import { useId } from 'react'
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

/** Room above the top gridline so its label is not clipped. */
const TOP_PAD = 10

function GridLines({
  width,
  height,
  max,
  min = 0,
  labelWidth,
}: {
  width: number
  height: number
  max: number
  min?: number
  labelWidth: number
}) {
  const steps = Array.from({ length: TICKS + 1 }, (_, index) => index)
  return (
    <g>
      {steps.map((step) => {
        const value = max - ((max - min) / TICKS) * step
        const y = (height / TICKS) * step
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
  const band = (width - labelWidth) / labels.length
  return (
    <g>
      {labels.map((label, index) => (
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
      ))}
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
  const width = 500
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
    >
      <GridLines width={width} height={height} max={max} labelWidth={labelWidth} />
      {data.map((d, index) => {
        const x = labelWidth + band * index + (band - barWidth) / 2
        const baseHeight = (d.base / max) * height
        const topHeight = (d.top / max) * height
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
  const width = 500
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
    >
      <GridLines width={width} height={height} max={max} labelWidth={labelWidth} />
      {data.map((d, index) => {
        const centre = labelWidth + band * index + band / 2
        const aHeight = (d.a / max) * height
        const bHeight = (d.b / max) * height
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

/** One bar per month — "What you kept", "Monthly net payable", "Time to clear the OTA". */
export function PlainBars({
  values,
  labels,
  highlight,
  color = SERIES.soft,
  highlightColor = SERIES.strong,
  height = 210,
  labelWidth = 46,
}: {
  values: number[]
  labels: string[]
  highlight?: number
  color?: string
  highlightColor?: string
  height?: number
  labelWidth?: number
}) {
  const width = 500
  const max = axisMax(values)
  const band = (width - labelWidth) / values.length
  const barWidth = Math.min(band * 0.52, 22)

  return (
    <svg
      viewBox={`0 -${TOP_PAD} ${width} ${height + 26 + TOP_PAD}`}
      className="w-full"
      role="presentation"
    >
      <GridLines width={width} height={height} max={max} labelWidth={labelWidth} />
      {values.map((value, index) => {
        const barHeight = (value / max) * height
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
  const width = 500
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
        const upHeight = (d.up / max) * half
        const downHeight = (d.down / max) * half
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
  values: number[]
  labels: string[]
  height?: number
  labelWidth?: number
  showDots?: boolean
  /** Percentages read better on their own scale than from zero. */
  fromZero?: boolean
}) {
  const width = 500
  const gradientId = useId()
  const max = fromZero ? axisMax(values, 1.275) : Math.max(...values) * 1.02
  const plotWidth = width - labelWidth
  const step = values.length > 1 ? plotWidth / (values.length - 1) : 0
  const pointAt = (value: number, index: number) => ({
    x: labelWidth + step * index,
    y: height - (value / max) * height,
  })
  const points = values.map(pointAt)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  const area = `${line} L${points[points.length - 1].x} ${height} L${points[0].x} ${height} Z`

  return (
    <svg
      viewBox={`0 -${TOP_PAD} ${width} ${height + 26 + TOP_PAD}`}
      className="w-full"
      role="presentation"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SERIES.strong} stopOpacity={0.12} />
          <stop offset="100%" stopColor={SERIES.strong} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <GridLines width={width} height={height} max={max} labelWidth={labelWidth} />
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
            x={pointAt(values[index], index).x}
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
        <li key={row.label} className="flex items-center gap-4">
          <span className="w-[120px] shrink-0 truncate text-xs font-medium leading-[1.3] text-text-secondary">
            {row.label}
          </span>
          <span className="flex min-w-0 flex-1 items-center">
            <span
              className="h-[18px] shrink-0 rounded-[3px]"
              style={{
                width: `${(row.value / max) * BAR_SCALE}%`,
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
  rows: { label: string; parts: number[] }[]
  colors: string[]
  /** Below this share a segment is too narrow for its own number. */
  minLabelWidth?: number
}) {
  return (
    <ul className="flex w-full flex-col gap-[42px] py-2">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-4">
          <span className="w-[76px] shrink-0 text-xs font-medium leading-[1.3] text-text-secondary">
            {row.label}
          </span>
          <span className="flex h-[22px] min-w-0 flex-1 gap-[3px]">
            {row.parts.map((part, index) => (
              <span
                key={index}
                className="flex items-center justify-center rounded-[3px] text-[10px] font-semibold"
                style={{
                  width: `${part}%`,
                  backgroundColor: colors[index],
                  color: index === 1 ? '#5b606c' : '#ffffff',
                }}
              >
                {part >= minLabelWidth ? `${part}%` : null}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}
