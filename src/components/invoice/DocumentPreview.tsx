import { Rial, withRial } from '../ui'
import { useServerQr } from './useServerQr'

/**
 * The printable face of a tax document, rendered from data rather than shipped as an image.
 *
 * Everything on it comes from the invoice the page is already showing, so a change to a line
 * or a total is visible in the preview immediately — which a PNG could never do. It is also
 * what `print()` puts on paper, so the preview and the printout cannot drift apart.
 *
 * Sizing is by CSS variable so the zoom control can scale the whole page without re-laying
 * anything out: the sheet keeps ISO 216 proportions (1:√2) at every zoom step.
 */

export type PreviewParty = {
  name: string
  lines: string[]
  vat: string
}

export type PreviewLine = {
  id: string
  description: string
  unitPrice: string
  qty: string
  vat: string
  total: string
}

export type PreviewTotals = {
  subtotal: string
  discount?: string
  net: string
  vat: string
  vatLabel: string
  total: string
}

export type PreviewDocument = {
  /** "TAX INVOICE", "CREDIT NOTE", … — printed top right in brand blue. */
  kind: string
  number: string
  statusLabel?: string
  brand: { name: string; initial: string; vat: string }
  from: PreviewParty
  to: PreviewParty
  meta: { label: string; value: string }[]
  lines: PreviewLine[]
  totals: PreviewTotals
  notes?: string
  /** Foot lines: amount paid, balance, bank details, Peppol id. */
  footer?: { label: string; value: string }[]
  /**
   * A QR payload the server supplied, drawn as it is. Never built on the device: the QR is the
   * backend's (owner policy, B2C only), and the "number|date|total" stand-in this sheet used to
   * encode looked like a tax QR on every printed note without being one (CMP37-2b). Absent, the
   * sheet prints no QR.
   */
  qrPayload?: string | null
}

const COLUMNS = ['description', 'price', 'qty', 'vat', 'total'] as const

export function DocumentPreview({
  document: doc,
  labels,
  /** 1 = 100%. The sheet scales as a whole; nothing reflows. */
  zoom = 1,
  className = '',
}: {
  document: PreviewDocument
  labels: {
    from: string
    billTo: string
    description: string
    price: string
    qty: string
    vat: string
    total: string
    subtotal: string
    discount: string
    net: string
    totalDue: string
    qrAlt: string
  }
  zoom?: number
  className?: string
}) {
  const qr = useServerQr(doc.qrPayload)

  const columnLabel: Record<(typeof COLUMNS)[number], string> = {
    description: labels.description,
    price: labels.price,
    qty: labels.qty,
    vat: labels.vat,
    total: labels.total,
  }

  return (
    <article
      data-document-preview
      style={{ width: 386 * zoom, fontSize: 10 * zoom }}
      className={[
        'shrink-0 rounded-sm bg-white text-[#151c2d] shadow-card',
        'origin-top',
        className,
      ].join(' ')}
    >
      <div style={{ padding: 18 * zoom }} className="flex flex-col">
        {/* Masthead */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span
              style={{ width: 34 * zoom, height: 34 * zoom, fontSize: 16 * zoom }}
              className="flex items-center justify-center rounded-sm bg-primary-700 font-bold text-white"
            >
              {doc.brand.initial}
            </span>
            <span className="flex flex-col">
              <span style={{ fontSize: 13 * zoom }} className="font-bold leading-[1.2]">
                {doc.brand.name}
              </span>
              <span
                style={{ fontSize: 8 * zoom }}
                className="mt-0.5 font-medium leading-[1.2] text-[#8f8f8f]"
              >
                {doc.brand.vat}
              </span>
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span
              style={{ fontSize: 15 * zoom }}
              className="font-bold uppercase leading-[1.2] tracking-[0.02em] text-primary-700"
            >
              {doc.kind}
            </span>
            <span
              style={{ fontSize: 9 * zoom }}
              className="mt-1 font-medium leading-[1.2] text-[#5b606c]"
            >
              {doc.number}
            </span>
            {doc.statusLabel ? (
              <span
                style={{ fontSize: 8 * zoom }}
                className="mt-1.5 rounded-full bg-warning-100 px-2 py-1 font-semibold leading-[1.2] text-[#6d5a39]"
              >
                {doc.statusLabel}
              </span>
            ) : null}
          </div>
        </header>

        {/* Parties */}
        <div style={{ marginTop: 16 * zoom }} className="grid grid-cols-2 gap-6">
          {[
            { heading: labels.from, party: doc.from },
            { heading: labels.billTo, party: doc.to },
          ].map(({ heading, party }) => (
            <div key={heading} className="flex flex-col">
              <span
                style={{ fontSize: 7 * zoom, letterSpacing: 0.08 * zoom + 'em' }}
                className="font-semibold uppercase leading-[1.2] text-[#8f8f8f]"
              >
                {heading}
              </span>
              <span
                style={{ fontSize: 10.5 * zoom, marginTop: 7 * zoom }}
                className="font-bold leading-[1.2]"
              >
                {party.name}
              </span>
              {party.lines.map((line) => (
                <span
                  key={line}
                  style={{ fontSize: 9 * zoom, marginTop: 5 * zoom }}
                  className="font-medium leading-[1.2] text-[#444957]"
                >
                  {line}
                </span>
              ))}
              <span
                style={{ fontSize: 9 * zoom, marginTop: 5 * zoom }}
                className="font-medium leading-[1.2] text-[#444957]"
              >
                {party.vat}
              </span>
            </div>
          ))}
        </div>

        {/* Dates and references */}
        <div
          style={{ marginTop: 16 * zoom, paddingTop: 12 * zoom, gap: 12 * zoom }}
          className="grid grid-cols-4 border-t border-[#eceef2]"
        >
          {doc.meta.map((entry) => (
            <div key={entry.label} className="flex min-w-0 flex-col">
              <span
                style={{ fontSize: 7 * zoom, letterSpacing: 0.08 * zoom + 'em' }}
                className="font-semibold uppercase leading-[1.2] text-[#8f8f8f]"
              >
                {entry.label}
              </span>
              <span
                style={{ fontSize: 9 * zoom, marginTop: 6 * zoom }}
                className="font-medium leading-[1.2] text-[#151c2d]"
              >
                {entry.value}
              </span>
            </div>
          ))}
        </div>

        {/* Lines */}
        <table
          style={{ marginTop: 16 * zoom }}
          className="w-full border-collapse text-start tabular-nums"
        >
          <thead>
            <tr className="bg-primary-700 text-white">
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  style={{
                    fontSize: 7.5 * zoom,
                    padding: `${7 * zoom}px ${8 * zoom}px`,
                    letterSpacing: 0.06 * zoom + 'em',
                  }}
                  className={[
                    'font-semibold uppercase leading-[1.2]',
                    column === 'description' ? 'text-start' : 'text-end',
                  ].join(' ')}
                >
                  {columnLabel[column]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line) => (
              <tr key={line.id} className="border-b border-[#eceef2]">
                <td
                  style={{ fontSize: 9 * zoom, padding: `${6 * zoom}px ${8 * zoom}px` }}
                  className="font-medium leading-[1.3]"
                >
                  {line.description}
                </td>
                {[line.unitPrice, line.qty, line.vat, line.total].map((cell, index) => (
                  <td
                    key={index}
                    style={{ fontSize: 9 * zoom, padding: `${6 * zoom}px ${8 * zoom}px` }}
                    className="text-end font-medium leading-[1.3] text-[#444957]"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals — right half only, as printed */}
        <div style={{ marginTop: 12 * zoom }} className="flex justify-end">
          <div style={{ width: '58%' }} className="flex flex-col">
            {[
              { label: labels.subtotal, value: `OMR ${doc.totals.subtotal}` },
              ...(doc.totals.discount
                ? [{ label: labels.discount, value: `− ${doc.totals.discount}` }]
                : []),
              { label: labels.net, value: `OMR ${doc.totals.net}` },
              { label: doc.totals.vatLabel, value: `OMR ${doc.totals.vat}` },
            ].map((row) => (
              <div
                key={row.label}
                style={{ fontSize: 9 * zoom, paddingBlock: 4 * zoom }}
                className="flex items-center justify-between gap-4 font-medium leading-[1.2] text-[#444957]"
              >
                <span>{row.label}</span>
                <span className="tabular-nums">{withRial(row.value)}</span>
              </div>
            ))}
            <div
              style={{ marginTop: 6 * zoom, paddingTop: 8 * zoom, fontSize: 12 * zoom }}
              className="flex items-center justify-between gap-4 border-t border-[#151c2d] font-bold leading-[1.2] text-[#151c2d]"
            >
              <span>{labels.totalDue}</span>
              <span className="tabular-nums">
                <Rial /> {doc.totals.total}
              </span>
            </div>
          </div>
        </div>

        {/* Notes and QR */}
        <div
          style={{ marginTop: 16 * zoom, paddingTop: 12 * zoom, gap: 16 * zoom }}
          className="flex items-start justify-between border-t border-[#eceef2]"
        >
          {doc.notes ? (
            <p
              style={{ fontSize: 8.5 * zoom }}
              className="max-w-[62%] font-medium leading-[1.5] text-[#444957]"
            >
              {withRial(doc.notes)}
            </p>
          ) : (
            <span />
          )}
          {qr ? (
            <img
              src={qr}
              alt={labels.qrAlt}
              style={{ width: 78 * zoom, height: 78 * zoom }}
              className="shrink-0"
            />
          ) : doc.qrPayload ? (
            <span
              style={{ width: 78 * zoom, height: 78 * zoom }}
              className="shrink-0 rounded-sm bg-[#f3f3f3]"
            />
          ) : null}
        </div>

        {/* Foot */}
        {doc.footer?.length ? (
          <div
            style={{ marginTop: 12 * zoom, paddingTop: 10 * zoom, gap: 3 * zoom }}
            className="flex flex-col border-t border-[#eceef2]"
          >
            {doc.footer.map((entry) => (
              <p key={entry.label} style={{ fontSize: 8 * zoom }} className="leading-[1.4]">
                <span className="font-bold text-[#151c2d]">{entry.label}</span>{' '}
                <span className="font-medium text-[#444957]">{withRial(entry.value)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}
