import { StrictMode, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../../i18n'
import { Modal, Popover, Select } from '.'
import { ActivateModal } from '../../pages/ConsolePage/subscriptions/ActivateModal'
import { useSubscriptions } from '../../lib/consoleSubscriptions'
import { TENANTS } from '../../lib/superAdmin'

afterEach(cleanup)

const escapeOn = (element: Element) => fireEvent.keyDown(element, { key: 'Escape' })

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

function LooseSelect() {
  const [value, setValue] = useState('a')
  return <Select value={value} onChange={setValue} options={OPTIONS} ariaLabel="Letter" />
}

/** A real consumer outside the policy console: two dropdowns and a calendar inside `Modal`. */
function Activate({ onClose }: { onClose: () => void }) {
  const ledger = useSubscriptions()
  return (
    <ActivateModal tenantId={TENANTS[0].id} ledger={ledger} onClose={onClose} onDone={() => {}} />
  )
}

describe('Escape across nested overlays', () => {
  it('still closes a Modal with nothing open inside it', () => {
    const onClose = vi.fn()
    render(
      <StrictMode>
        <Modal open onClose={onClose} title="Plain">
          <button type="button">Inside</button>
        </Modal>
      </StrictMode>,
    )

    escapeOn(screen.getByRole('button', { name: 'Inside' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('still closes a dropdown that is not inside any Modal, and keeps focus on it', () => {
    render(
      <StrictMode>
        <LooseSelect />
      </StrictMode>,
    )
    const trigger = screen.getByRole('button', { name: 'Letter' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByRole('listbox')).toBeTruthy()

    escapeOn(trigger)

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('gives Escape to the newest of two open popovers, then to the older one, then to the Modal', () => {
    // The header search keeps its suggestions open after focus tabs away, so a calendar opened
    // later in a dialog is the second popover on the page.
    function Two({ onModalClose }: { onModalClose: () => void }) {
      const olderAnchor = useRef<HTMLButtonElement>(null)
      const newerAnchor = useRef<HTMLButtonElement>(null)
      const [older, setOlder] = useState(true)
      const [newer, setNewer] = useState(false)
      return (
        <>
          <button ref={olderAnchor} type="button">
            Search
          </button>
          <Popover open={older} anchorRef={olderAnchor} onClose={() => setOlder(false)}>
            <p>Suggestions</p>
          </Popover>
          <Modal open onClose={onModalClose} title="Editor">
            <button ref={newerAnchor} type="button" onClick={() => setNewer(true)}>
              Pick a day
            </button>
            <Popover open={newer} anchorRef={newerAnchor} onClose={() => setNewer(false)}>
              <p>Calendar</p>
            </Popover>
          </Modal>
        </>
      )
    }
    const onModalClose = vi.fn()
    render(
      <StrictMode>
        <Two onModalClose={onModalClose} />
      </StrictMode>,
    )
    const pick = screen.getByRole('button', { name: 'Pick a day' })
    fireEvent.click(pick)
    expect(screen.getByText('Calendar')).toBeTruthy()

    escapeOn(pick)
    expect(screen.queryByText('Calendar')).toBeNull()
    expect(screen.getByText('Suggestions')).toBeTruthy()
    expect(onModalClose).not.toHaveBeenCalled()

    escapeOn(pick)
    expect(screen.queryByText('Suggestions')).toBeNull()
    expect(onModalClose).not.toHaveBeenCalled()

    escapeOn(pick)
    expect(onModalClose).toHaveBeenCalledTimes(1)
  })

  it('in the subscription Activate dialog, closes the dropdown first and the dialog second', () => {
    const onClose = vi.fn()
    render(
      <StrictMode>
        <Activate onClose={onClose} />
      </StrictMode>,
    )
    const reason = document.querySelector('textarea')!
    fireEvent.change(reason, { target: { value: 'Pilot agreed by phone' } })
    const plan = screen.getByRole('button', { name: 'Plan' })
    plan.focus()
    fireEvent.keyDown(plan, { key: 'Enter' })
    expect(screen.getByRole('listbox')).toBeTruthy()

    escapeOn(plan)

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(reason.value).toBe('Pilot agreed by phone')
    expect(document.activeElement).toBe(plan)

    escapeOn(plan)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('in the subscription Activate dialog, closes the calendar first and returns focus to its field', () => {
    const onClose = vi.fn()
    render(
      <StrictMode>
        <Activate onClose={onClose} />
      </StrictMode>,
    )
    const calendar = screen.getByRole('button', { name: 'Start date' })
    fireEvent.click(calendar)
    const nextMonth = screen.getByRole('button', { name: 'Next month' })
    nextMonth.focus()

    escapeOn(nextMonth)

    expect(screen.queryByRole('button', { name: 'Next month' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(calendar)

    escapeOn(calendar)

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
