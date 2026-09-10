import { Fragment, type ReactNode } from 'react'
import omrSvg from '../../assets/brand/omr.svg?raw'

/**
 * The Omani rial sign, set where the copy used to say "OMR".
 *
 * Drawn from the same outline as `assets/brand/omr.svg` (see tools/rial/build.mjs), but inline, so
 * it simply takes the place of the letters it replaces — same size, same spot.
 *
 * Colour: `currentColor`, so the sign is part of its amount — black beside a black figure, grey in
 * a grey caption, red beside an overdue red one. Where a separate label holds it, that label takes
 * the amount's colour class.
 *
 * Its height is 0.7em, Urbanist's cap height, so it stands as tall as the "OMR" it stands in for
 * and sits on the same baseline.
 *
 * The letters stay in the page, visually hidden, so a screen reader still says the currency and a
 * copied figure pastes as "OMR 12.000" rather than losing its unit.
 */

const VIEWBOX = omrSvg.match(/viewBox="([^"]+)"/)![1]
const PATH = omrSvg.match(/ d="([^"]+)"/)![1]

export function Rial({ className = '' }: { className?: string }) {
  // `relative`: the hidden "OMR" is absolutely placed, and without a positioned box of its own
  // it escapes a sideways-scrolling table and widens the whole page. `inline-flex` keeps the sign
  // one item in a flex row and puts its foot on the text's baseline.
  return (
    <span className="relative inline-flex shrink-0">
      <svg
        viewBox={VIEWBOX}
        aria-hidden="true"
        focusable="false"
        className={['h-[0.7em] w-auto shrink-0 fill-current', className].filter(Boolean).join(' ')}
      >
        <path d={PATH} />
      </svg>
      <span className="sr-only">OMR</span>
    </span>
  )
}

/**
 * The drawn sign as a drop-in for the `<img src={omr…}>` copies: sized by width the same way
 * (`w-6` etc., height follows), but in `currentColor` — for a sign that has to match a coloured
 * amount, like a green "+ 12.750" or a red overdue figure, which an image can only fake with a
 * CSS filter. Give it the amount's colour class.
 */
export function RialMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox={VIEWBOX}
      aria-hidden="true"
      focusable="false"
      className={['block h-auto shrink-0 fill-current', className].filter(Boolean).join(' ')}
    >
      <path d={PATH} />
    </svg>
  )
}

/* ------------------------------------------------------------ text with "OMR" */

const DIGITS = '0-9\u0660-\u0669'
/**
 * A written amount: optional sign, digits with any separator either script uses, ending on a digit
 * — so the full stop after "saves OMR 47.090." stays with the sentence, not the figure.
 */
const FIGURE = `[+\\u2212-]?[${DIGITS}](?:[${DIGITS},.\\u066B\\u066C]*[${DIGITS}])?`
/**
 * The ways the copy spells the currency: "OMR", "ر.ع." and — after a figure — "ريال". "Letter" is
 * the Arabic letters only, not the whole block, so "٢٬٠٠٠ ريال،" still matches before its comma
 * while "ريالين" (two rials, a word) and "بالريال" (in rials) do not.
 */
const LETTER = '\u0621-\u064A\u066E-\u06D3'
const CODE = `(?<![A-Za-z])OMR(?![A-Za-z])|(?<![${LETTER}])\u0631\\.\u0639\\.?`
const WORD = `(?<![${LETTER}])\u0631\u064A\u0627\u0644(?![${LETTER}])`

const PATTERN = new RegExp(
  [
    `(?<code1>${CODE})(?<gap1>\\s?)(?<fig1>${FIGURE})`, // OMR 12.000 · OMR12.750
    `(?<fig2>${FIGURE})(?<gap2>\\s?)(?<code2>${CODE}|${WORD})`, // ٤٧٫٠٩٠ ريال · ١٢٫٧٥٠ ر.ع.
    `(?:${CODE})`, // the code on its own — "Total OMR", "EUR → OMR"
  ].join('|'),
  'g',
)

function swap(text: string, rialClassName?: string): ReactNode {
  PATTERN.lastIndex = 0
  if (!PATTERN.test(text)) return text
  PATTERN.lastIndex = 0

  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(PATTERN)) {
    const start = match.index!
    if (start > last) out.push(text.slice(last, start))
    const g = match.groups ?? {}
    // The sign replaces the letters where they stood. A figure next to it is kept on the same
    // line, with the space between them made unbreakable (and added where the copy left it out).
    if (g.fig1) {
      out.push(
        <span key={start} className="whitespace-nowrap">
          <Rial className={rialClassName} />
          {'\u00A0'}
          {g.fig1}
        </span>,
      )
    } else if (g.fig2) {
      out.push(
        <span key={start} className="whitespace-nowrap">
          {g.fig2}
          {'\u00A0'}
          <Rial className={rialClassName} />
        </span>,
      )
    } else {
      out.push(<Rial key={start} className={rialClassName} />)
    }
    last = start + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out.map((part, index) =>
    typeof part === 'string' ? <Fragment key={`t${index}`}>{part}</Fragment> : part,
  )
}

/**
 * Swaps every "OMR" in a string — and the Arabic "ر.ع." / "ريال" after a figure — for the sign,
 * in place. Anything that is not a string passes through untouched, so it is safe around `t()`
 * results, data strings and mixed children alike.
 *
 * Currency *codes* are left alone where they are codes: the currency pickers ("OMR - Omani
 * Rial"), the Peppol XML and bank BICs never go through this.
 */
export function withRial(node: ReactNode, rialClassName?: string): ReactNode {
  if (typeof node === 'string') return swap(node, rialClassName)
  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <Fragment key={index}>{withRial(child, rialClassName)}</Fragment>
    ))
  }
  return node
}

/**
 * `withRial` as an element — for JSX, and as a `<Trans>` component: pass
 * `components={{ b: <RialText as="b" /> }}` and the bold run's "OMR {{amount}}" comes out with
 * the sign. `Trans` hands the interpolated text in as children.
 */
export function RialText({
  children,
  as: Tag,
  className,
  rialClassName,
}: {
  children?: ReactNode
  as?: 'b' | 'strong' | 'span'
  className?: string
  /** Classes for the sign alone, when it must differ from the words around it. */
  rialClassName?: string
}) {
  const content = withRial(children, rialClassName)
  return Tag ? <Tag className={className}>{content}</Tag> : <>{content}</>
}
