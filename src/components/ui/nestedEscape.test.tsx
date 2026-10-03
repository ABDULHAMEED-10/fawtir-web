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

  it('gives Escape to the newest of two open popovers, then to the older one', () => {
    function Two() {
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
          <button ref={newerAnchor} type="button" onClick={() => setNewer(true)}>
            Pick a day
          </button>
          <Popover open={newer} anchorRef={newerAnchor} onClose={() => setNewer(false)}>
            <p>Calendar</p>
          </Popover>
        </>
      )
    }
    render(
      <StrictMode>
        <Two />
      </StrictMode>,
    )
    const pick = screen.getByRole('button', { name: 'Pick a day' })
    fireEvent.click(pick)

    escapeOn(pick)
    expect(screen.queryByText('Calendar')).toBeNull()
    expect(screen.getByText('Suggestions')).toBeTruthy()

    escapeOn(pick)
    expect(screen.queryByText('Suggestions')).toBeNull()
  })

  it('closes a dialog before a popover left open underneath it, and its own popover before both', () => {
    // The header search keeps its suggestions open after focus tabs away to the button that
    // opens a dialog. Those suggestions are underneath the dialog: Escape must not be spent on
    // them while the dialog is still open.
    function Stale({ onModalClose }: { onModalClose: () => void }) {
      const searchAnchor = useRef<HTMLButtonElement>(null)
      const dayAnchor = useRef<HTMLButtonElement>(null)
      const [suggestions, setSuggestions] = useState(true)
      const [dialog, setDialog] = useState(false)
      const [calendar, setCalendar] = useState(false)
      return (
        <>
          <button ref={searchAnchor} type="button">
            Search
          </button>
          <Popover
            open={suggestions}
            anchorRef={searchAnchor}
            onClose={() => setSuggestions(false)}
          >
            <p>Suggestions</p>
          </Popover>
          <button type="button" onClick={() => setDialog(true)}>
            Create draft
          </button>
          <Modal
            open={dialog}
            onClose={() => {
              onModalClose()
              setDialog(false)
            }}
            title="Editor"
          >
            <button ref={dayAnchor} type="button" onClick={() => setCalendar(true)}>
              Pick a day
            </button>
            <Popover open={calendar} anchorRef={dayAnchor} onClose={() => setCalendar(false)}>
              <p>Calendar</p>
            </Popover>
          </Modal>
        </>
      )
    }
    const onModalClose = vi.fn()
    render(
      <StrictMode>
        <Stale onModalClose={onModalClose} />
      </StrictMode>,
    )
    const opener = screen.getByRole('button', { name: 'Create draft' })
    opener.focus()
    fireEvent.click(opener)
    const pick = screen.getByRole('button', { name: 'Pick a day' })
    fireEvent.click(pick)

    escapeOn(pick)
    expect(screen.queryByText('Calendar')).toBeNull()
    expect(onModalClose).not.toHaveBeenCalled()

    escapeOn(pick)
    expect(onModalClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(screen.getByText('Suggestions')).toBeTruthy()

    escapeOn(opener)
    expect(screen.queryByText('Suggestions')).toBeNull()
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

  it('inside a dialog, closes two open popovers newest first, then the dialog, with no double close', () => {
    function Layers({ onModalClose }: { onModalClose: () => void }) {
      const firstAnchor = useRef<HTMLButtonElement>(null)
      const secondAnchor = useRef<HTMLButtonElement>(null)
      const [first, setFirst] = useState(false)
      const [second, setSecond] = useState(false)
      return (
        <Modal open onClose={onModalClose} title="Editor">
          <button ref={firstAnchor} type="button" onClick={() => setFirst(true)}>
            List
          </button>
          <Popover open={first} anchorRef={firstAnchor} onClose={() => setFirst(false)}>
            <p>Options</p>
          </Popover>
          <button ref={secondAnchor} type="button" onClick={() => setSecond(true)}>
            Day
          </button>
          <Popover open={second} anchorRef={secondAnchor} onClose={() => setSecond(false)}>
            <p>Calendar</p>
          </Popover>
        </Modal>
      )
    }
    const onModalClose = vi.fn()
    render(
      <StrictMode>
        <Layers onModalClose={onModalClose} />
      </StrictMode>,
    )
    // Opened by keyboard, a dropdown stays open while focus moves on, so both can be open.
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const day = screen.getByRole('button', { name: 'Day' })
    fireEvent.click(day)

    escapeOn(day)
    expect(screen.queryByText('Calendar')).toBeNull()
    expect(screen.getByText('Options')).toBeTruthy()
    escapeOn(day)
    expect(screen.queryByText('Options')).toBeNull()
    expect(onModalClose).not.toHaveBeenCalled()
    escapeOn(day)
    expect(onModalClose).toHaveBeenCalledTimes(1)
  })

  it('closes a dialog opened over a popover first, then the popover, then the outer dialog', () => {
    function Over({ onOuterClose }: { onOuterClose: () => void }) {
      const anchor = useRef<HTMLButtonElement>(null)
      const [list, setList] = useState(false)
      const [inner, setInner] = useState(false)
      return (
        <Modal open onClose={onOuterClose} title="Outer">
          <button ref={anchor} type="button" onClick={() => setList(true)}>
            List
          </button>
          <Popover open={list} anchorRef={anchor} onClose={() => setList(false)}>
            <p>Options</p>
          </Popover>
          <button type="button" onClick={() => setInner(true)}>
            Details
          </button>
          <Modal open={inner} onClose={() => setInner(false)} title="Inner">
            <button type="button">Inner action</button>
          </Modal>
        </Modal>
      )
    }
    const onOuterClose = vi.fn()
    render(
      <StrictMode>
        <Over onOuterClose={onOuterClose} />
      </StrictMode>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const details = screen.getByRole('button', { name: 'Details' })
    details.focus()
    fireEvent.click(details)
    const inner = screen.getByRole('dialog', { name: 'Inner' })

    escapeOn(inner)
    expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull()
    expect(screen.getByText('Options')).toBeTruthy()
    expect(document.activeElement).toBe(details)
    escapeOn(details)
    expect(screen.queryByText('Options')).toBeNull()
    expect(onOuterClose).not.toHaveBeenCalled()
    escapeOn(details)
    expect(onOuterClose).toHaveBeenCalledTimes(1)
  })
})
