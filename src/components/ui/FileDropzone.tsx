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
}: {
  /** Extension list for the picker, e.g. `.pdf,.jpg`. */
  accept?: string
  multiple?: boolean
  maxBytes?: number
  onFiles: (files: File[]) => void
  onReject?: (reason: 'size' | 'type', file: File) => void
  children: (state: { dragging: boolean }) => ReactNode
  className?: string
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
        onChange={(event) => {
          take(event.target.files)
          event.target.value = ''
        }}
      />
    </>
  )
}
