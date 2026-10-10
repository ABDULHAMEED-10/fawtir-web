import { useRef, useState, type ReactNode } from 'react'

/**
 * Drag-and-drop file area.
 *
 * One place that knows about dragover/drop, the hidden input, type and size limits — used by
 * invoice attachments, the scan modal and anywhere else a file is taken. Rejected files come
 * back through `onReject` so the caller can show why rather than dropping them silently.
 */
export function FileDropzone({
  accept,
  multiple,
  maxBytes,
  onFiles,
  onReject,
  children,
  className = '',
  id,
  labelledBy,
  describedBy,
}: {
  /** Extension list for the picker, e.g. `.pdf,.jpg`. */
  accept?: string
  multiple?: boolean
  maxBytes?: number
  onFiles: (files: File[]) => void
  onReject?: (reason: 'size' | 'type', file: File) => void
  children: (state: { dragging: boolean }) => ReactNode
  className?: string
  id?: string
  /** The visible caption, so the button is announced by it and not by its drop-zone text alone. */
  labelledBy?: string
  /** The limits line or a rejection message, read after the name. */
  describedBy?: string
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const accepted = (accept ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

  const take = (list: FileList | null) => {
    if (!list) return
    const ok: File[] = []
    for (const file of Array.from(list)) {
      const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
      if (accepted.length > 0 && !accepted.includes(extension)) {
        onReject?.('type', file)
        continue
      }
      if (maxBytes && file.size > maxBytes) {
        onReject?.('size', file)
        continue
      }
      ok.push(file)
    }
    if (ok.length > 0) onFiles(multiple ? ok : ok.slice(0, 1))
  }

  return (
    <>
      <button
        type="button"
        id={id}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          take(event.dataTransfer.files)
        }}
        className={['w-full text-start', className].filter(Boolean).join(' ')}
      >
        {children({ dragging })}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          take(event.target.files)
          event.target.value = ''
        }}
      />
    </>
  )
}
