/**
 * Mirrors the server's card-number detector (backend `CardNumbers`, FIN-5, DEC-30-06) so a card
 * number typed where an approval code belongs is stopped on the device: it is never sent, never
 * queued in the offline till's local storage with the sale, and never printed back. The server
 * still refuses it (POS_PAYMENT_INVALID, POS_REFUND_MONEY_INVALID, PAYMENT_REFERENCE_CARD_NUMBER);
 * this only keeps it off the device.
 *
 * Same rule as the server: a run of 13 to 19 digits that passes the Luhn check, digits read in
 * ASCII, Arabic-Indic and Eastern Arabic-Indic, split freely by spaces, dashes, dots and the
 * invisible direction marks Arabic text carries. A longer run is not read as one, so a bank
 * reference that happens to hold a passing 16 digits is not refused. Applied to card references
 * only, as on the server.
 */
const SHORTEST = 13
const LONGEST = 19

function digitOf(char: string): number {
  const code = char.charCodeAt(0)
  if (code >= 0x30 && code <= 0x39) return code - 0x30
  if (code >= 0x660 && code <= 0x669) return code - 0x660
  if (code >= 0x6f0 && code <= 0x6f9) return code - 0x6f0
  return -1
}

function isSeparator(char: string): boolean {
  const code = char.charCodeAt(0)
  return (
    char === ' ' ||
    char === '-' ||
    char === '.' ||
    char === '\t' ||
    code === 0xa0 ||
    code === 0x2007 ||
    code === 0x202f ||
    (code >= 0x2010 && code <= 0x2015) ||
    code === 0x2212 ||
    code === 0x200b ||
    code === 0x200e ||
    code === 0x200f ||
    code === 0x061c ||
    code === 0xfeff ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  )
}

function luhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 0x30
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

const passes = (run: string) => run.length >= SHORTEST && run.length <= LONGEST && luhn(run)

/** Whether any run of digits in the text is a card number. */
export function containsCardNumber(text: string | null | undefined): boolean {
  if (!text) return false
  let run = ''
  for (let i = 0; i <= text.length; i++) {
    const char = i < text.length ? text[i] : '\0'
    const digit = digitOf(char)
    if (digit >= 0) {
      run += String(digit)
    } else if (isSeparator(char) && run.length > 0) {
      continue
    } else {
      if (passes(run)) return true
      run = ''
    }
  }
  return false
}
