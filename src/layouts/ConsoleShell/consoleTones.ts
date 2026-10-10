/**
 * The console's tone colours and tab class, kept apart from the components in consoleStyle.tsx so
 * that file exports components and class strings only. Styling only: nothing here reads or sends data.
 */

export type ConsoleTone = 'good' | 'watch' | 'bad' | 'info' | 'calm'

/** Text colour per tone: Filed green, Waiting gold, Our fault red. */
export const CONSOLE_TONE_TEXT: Record<ConsoleTone, string> = {
  good: 'text-success-700',
  watch: 'text-pending-500',
  bad: 'text-danger-700',
  info: 'text-primary-700',
  calm: 'text-text-primary',
}

/** The tint an icon tile sits on, per tone. */
export const CONSOLE_TONE_TINT: Record<ConsoleTone, string> = {
  good: 'bg-success-100',
  watch: 'bg-pending-100',
  bad: 'bg-danger-100',
  info: 'bg-primary-50',
  calm: 'bg-primary-50',
}

/** One tab in a console tab bar. */
export function consoleTab(active: boolean): string {
  return [
    'relative flex min-h-[57px] items-center gap-1.5 text-[15px] transition-colors',
    active ? 'font-semibold text-primary-700' : 'font-medium text-[#494d56] hover:text-text-primary',
  ].join(' ')
}
