import type { ItemArt } from '../../lib/pos'
import cappuccino from '../../assets/pos/cappuccino.jpg'
import coldBrew from '../../assets/pos/cold-brew.jpg'
import cortado from '../../assets/pos/cortado.jpg'
import dateWalnut from '../../assets/pos/date-walnut.jpg'
import espresso from '../../assets/pos/espresso.jpg'
import flatWhite from '../../assets/pos/flat-white.jpg'
import handGrinder from '../../assets/pos/hand-grinder.jpg'
import houseBlend from '../../assets/pos/house-blend.jpg'
import icedLatte from '../../assets/pos/iced-latte.jpg'
import latte from '../../assets/pos/latte.jpg'
import matchaLatte from '../../assets/pos/matcha-latte.jpg'
import pumpkinSpice from '../../assets/pos/pumpkin-spice.jpg'
import ramadanBox from '../../assets/pos/ramadan-box.jpg'
import v60 from '../../assets/pos/v60.jpg'

/**
 * The picture on a shelf tile (Figma 143:18015).
 *
 * The demo shelf shows a real photograph of each item. The photos ship with the app (CC0 or public
 * domain, sources in `src/assets/pos/CREDITS.md`); the till once hotlinked Wikimedia Commons, which
 * left a third party deciding whether the shelf had pictures. An item with no photo falls back to
 * a flat illustration on a tinted ground.
 */

const PHOTO: Record<string, string> = {
  'flat-white': flatWhite,
  cappuccino,
  espresso,
  'cold-brew': coldBrew,
  v60,
  cortado,
  latte,
  'iced-latte': icedLatte,
  'matcha-latte': matchaLatte,
  'house-blend': houseBlend,
  'date-walnut': dateWalnut,
  'hand-grinder': handGrinder,
  'pumpkin-spice': pumpkinSpice,
  'ramadan-box': ramadanBox,
}

const GROUND: Record<ItemArt, string> = {
  cup: '#efe6dc',
  cupDark: '#e6ddd4',
  cupIced: '#e2e6ea',
  cupGreen: '#e2ece2',
  bag: '#e9e2d8',
  bagPale: '#e6e6ea',
  pastry: '#f0e6d6',
  grinder: '#e4e6ea',
  bottle: '#e6ecec',
}

const COFFEE: Record<string, { body: string; rim: string }> = {
  cup: { body: '#a9714a', rim: '#c99a75' },
  cupDark: { body: '#5b3a26', rim: '#7d5237' },
  cupIced: { body: '#7a4a30', rim: '#a0704f' },
  cupGreen: { body: '#7fa06a', rim: '#a3bd92' },
}

/** Steam curls above a hot drink. */
function Steam() {
  return (
    <g stroke="#c9b7a6" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85">
      <path d="M64 30c6-6-6-11 0-17" />
      <path d="M80 30c6-6-6-11 0-17" />
    </g>
  )
}

function Cup({ art }: { art: 'cup' | 'cupDark' | 'cupIced' | 'cupGreen' }) {
  const colour = COFFEE[art]
  return (
    <g>
      {art !== 'cupIced' ? <Steam /> : null}
      <path d="M42 46h58v30a24 24 0 0 1-24 24H66a24 24 0 0 1-24-24V46Z" fill={colour.body} />
      <ellipse cx="71" cy="46" rx="29" ry="7.5" fill={colour.rim} />
      <path
        d="M100 54h8a13 13 0 0 1 0 26h-8"
        stroke={colour.body}
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      {art === 'cupIced' ? (
        <g fill="#ffffff" opacity="0.55">
          <rect x="54" y="54" width="14" height="14" rx="3" />
          <rect x="74" y="62" width="14" height="14" rx="3" />
        </g>
      ) : null}
    </g>
  )
}

function Bag({ pale }: { pale: boolean }) {
  return (
    <g>
      <path
        d="M46 40h52v58a8 8 0 0 1-8 8H54a8 8 0 0 1-8-8V40Z"
        fill={pale ? '#9c9cae' : '#4a3526'}
      />
      <path d="M46 40l8-10h36l8 10Z" fill={pale ? '#b6b6c4' : '#634834'} />
      <rect x="60" y="62" width="24" height="16" rx="3" fill={pale ? '#e6e6ea' : '#c9a884'} />
    </g>
  )
}

function Pastry() {
  return (
    <g>
      <ellipse cx="72" cy="78" rx="34" ry="20" fill="#c08b53" />
      <ellipse cx="72" cy="72" rx="34" ry="20" fill="#d8a468" />
      <g fill="#8b5e33">
        <circle cx="60" cy="68" r="3.5" />
        <circle cx="78" cy="64" r="3" />
        <circle cx="84" cy="76" r="3.5" />
        <circle cx="66" cy="78" r="3" />
      </g>
    </g>
  )
}

function Grinder() {
  return (
    <g>
      <rect x="52" y="52" width="40" height="50" rx="6" fill="#8a8e96" />
      <rect x="56" y="72" width="32" height="20" rx="3" fill="#d0d2d5" />
      <path d="M72 52V34" stroke="#5b606c" strokeWidth="5" strokeLinecap="round" />
      <path d="M72 34h16" stroke="#5b606c" strokeWidth="5" strokeLinecap="round" />
      <circle cx="72" cy="52" r="9" fill="#5b606c" />
    </g>
  )
}

function Bottle() {
  return (
    <g>
      <path d="M62 34h20v14l8 12v42a8 8 0 0 1-8 8H62a8 8 0 0 1-8-8V60l8-12V34Z" fill="#6f8f8f" />
      <rect x="60" y="28" width="24" height="10" rx="3" fill="#4f6b6b" />
    </g>
  )
}

/** One tile's picture, filling the box it is given. */
export function PosArt({
  itemId,
  art,
  className = '',
}: {
  itemId?: string
  art: ItemArt
  className?: string
}) {
  const photo = itemId ? PHOTO[itemId] : undefined
  if (photo) {
    return <img src={photo} alt="" loading="lazy" className={className} />
  }
  return (
    <svg viewBox="0 0 144 120" className={className} role="presentation" aria-hidden="true">
      <rect width="144" height="120" fill={GROUND[art]} />
      {art === 'cup' || art === 'cupDark' || art === 'cupIced' || art === 'cupGreen' ? (
        <Cup art={art} />
      ) : null}
      {art === 'bag' || art === 'bagPale' ? <Bag pale={art === 'bagPale'} /> : null}
      {art === 'pastry' ? <Pastry /> : null}
      {art === 'grinder' ? <Grinder /> : null}
      {art === 'bottle' ? <Bottle /> : null}
    </svg>
  )
}
