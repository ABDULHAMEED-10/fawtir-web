import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "../../layouts/AppShell";
import { ActionMenu } from "../../components/ui";
import { orderFormRowActions } from "../../lib/rowActions";
import {
  ORDER_FORM_DETAIL,
  type LifecycleStep,
} from "../../lib/orderFormDetail";
import backIcon from "../../assets/quotation-detail/back.svg";
import downloadIcon from "../../assets/quotation-detail/download.svg";
import deliverIcon from "../../assets/order-form-detail/deliver.svg";
import invoiceWhiteIcon from "../../assets/order-form-detail/invoice-white.svg";
import convertInvoiceIcon from "../../assets/order-form-detail/convert-invoice.svg";
import stepInvoiceIcon from "../../assets/order-form-detail/step-invoice.svg";
import stepTickIcon from "../../assets/quotations/step-tick.svg";
import stepOrderIcon from "../../assets/quotations/step-order.svg";
import warningIcon from "../../assets/order-form-detail/warning.svg";
import filePdfIcon from "../../assets/order-form-detail/file-pdf.svg";
import fileJpgIcon from "../../assets/order-form-detail/file-jpg.svg";
import downloadSmIcon from "../../assets/order-form-detail/download-sm.svg";
import deleteSmIcon from "../../assets/order-form-detail/delete-sm.svg";
import uploadIcon from "../../assets/order-form-detail/upload.svg";
import timelineOpenIcon from "../../assets/quotation-detail/timeline-open.svg";
import timelineDoneIcon from "../../assets/quotation-detail/timeline-done.svg";
import omrIcon from "../../assets/quotations/omr-row.svg";

const FILE_ICONS = { pdf: filePdfIcon, jpg: fileJpgIcon } as const;

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={["rounded-sm bg-surface-card p-4", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="mb-6 text-xl font-medium leading-[1.2] text-[#2c3342]">
      {title}
    </h2>
  );
}

function Amount({
  value,
  size = "md",
}: {
  value: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const text = {
    sm: "text-xs font-semibold",
    md: "text-sm font-semibold",
    lg: "text-[22px] font-semibold",
    xl: "text-[28px] font-semibold",
  }[size];
  const mark = { sm: "w-3", md: "w-4", lg: "w-6", xl: "w-7" }[size];
  return (
    <span className="inline-flex items-center gap-0.5">
      <img
        src={omrIcon}
        alt=""
        className={["h-auto shrink-0", mark].join(" ")}
      />
      <span className={text}>{value}</span>
    </span>
  );
}

/** Six 46px stations joined by 91px hairlines — more than one can be live at a time. */
function LifecycleStrip({ steps }: { steps: LifecycleStep[] }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between">
      {steps.map((step, i) => (
        <div
          key={step.labelKey}
          className="flex flex-1 items-start last:flex-none"
        >
          <div className="flex min-w-[46px] flex-col items-center gap-[5px]">
            <span
              className={[
                "flex size-[46px] items-center justify-center rounded-full",
                step.state === "active"
                  ? "bg-[#2c4eb7]"
                  : step.state === "done"
                    ? "border border-[#b7c4bd] bg-[#e6efea]"
                    : "border border-[#d0d2d5]",
              ].join(" ")}
            >
              {step.state === "active" ? (
                <img
                  src={
                    step.glyph === "invoice" ? stepInvoiceIcon : stepOrderIcon
                  }
                  alt=""
                  className="size-6"
                />
              ) : step.state === "done" ? (
                <img src={stepTickIcon} alt="" className="size-6" />
              ) : null}
            </span>
            <span className="whitespace-pre-line text-center text-xs font-semibold leading-[1.5] text-[#444957]">
              {t(step.labelKey)}
            </span>
            {step.note ? (
              <span className="text-[10px] font-medium leading-[1.2] text-[#5b606c]">
                {step.note}
              </span>
            ) : null}
            {step.amount ? (
              <span className="text-[#444957]">
                <Amount value={step.amount} size="sm" />
              </span>
            ) : null}
          </div>
          {i < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className="mx-2 mt-[23px] h-[3px] flex-1 bg-[#e8e8ea]"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function OrderFormDetailPage() {
  const { t } = useTranslation();
  const doc = ORDER_FORM_DETAIL;
  const f = doc.fulfilment;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {/* Trade documents › Order forms */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-medium leading-[1.2] text-[#5b606c]">
                {t("orderFormDetail.breadcrumbParent")}
              </span>
              <img
                src={backIcon}
                alt=""
                aria-hidden="true"
                className="size-6 rtl:rotate-180"
              />
              <Link
                to="/trade-documents/order-forms"
                className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
              >
                {t("orderFormDetail.breadcrumbOrderForms")}
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">
                {doc.id}
              </h1>
              <span className="inline-flex items-center rounded-full border border-[#d5dcf1] bg-[#f4f6fb] px-3 py-[5px] text-sm font-semibold text-[#2c4eb7]">
                {t(doc.statusKey)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
              <span className="font-medium text-[#5b606c]">{doc.subject}</span>
              <span className="font-medium text-[#5b606c]">·</span>
              <span className="font-medium text-[#5b606c]">
                {t("orderFormDetail.for")}
              </span>
              <span className="font-semibold text-[#151c2d]">
                {doc.customer}
              </span>
              <span className="font-medium text-[#5b606c]">·</span>
              <span className="font-medium text-[#5b606c]">{doc.meta}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ActionMenu
              items={orderFormRowActions(doc.id)}
              label={t("orderFormDetail.moreActions")}
              variant="bordered"
            />
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
            >
              <img src={downloadIcon} alt="" className="size-6" />
              {t("orderFormDetail.download")}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
            >
              <img src={deliverIcon} alt="" className="size-6" />
              {t("orderFormDetail.convertToDelivery")}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={invoiceWhiteIcon} alt="" className="size-6" />
              {t("orderFormDetail.convertToInvoice")}
            </button>
          </div>
        </div>

        {/* Lifecycle strip */}
        <Card className="px-[54px] py-4">
          <LifecycleStrip steps={doc.lifecycle} />
          <p className="mt-4 text-sm font-medium leading-[1.2] text-[#444957]">
            {doc.lifecycleNote}
          </p>
        </Card>

        {/* Fulfilment (795) | Order value (332) */}
        <div className="grid gap-4 xl:grid-cols-[795fr_332px]">
          <Card className="pb-6">
            <SectionTitle title={t("orderFormDetail.fulfilment")} />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col rounded-sm border border-[#e8e8ea] bg-surface-tab-bar p-4">
                <span className="text-xs font-semibold leading-[1.5] text-[#5b606c]">
                  {t("orderFormDetail.delivered")}
                </span>
                <span className="mt-1 text-[#2c3342]">
                  <Amount value={f.delivered.amount} size="xl" />
                </span>
                <span className="mt-1 text-sm font-medium leading-[1.2] text-[#2c3342]">
                  {f.delivered.note}
                </span>
              </div>
              {/* The one card that needs action is tinted and carries the button. */}
              <div className="flex flex-col rounded-sm border border-[#d5dcf1] bg-[#f4f6fb] p-4">
                <span className="text-xs font-semibold leading-[1.5] text-[#5b606c]">
                  {t("orderFormDetail.readyToInvoice")}
                </span>
                <span className="mt-1 text-[#2c3342]">
                  <Amount value={f.readyToInvoice.amount} size="xl" />
                </span>
                <span className="mt-1 text-sm font-medium leading-[1.2] text-[#2c3342]">
                  {f.readyToInvoice.note}
                </span>
                <button
                  type="button"
                  className="mt-3 inline-flex h-9 items-center gap-1 self-start rounded-sm bg-primary-700 px-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                >
                  <img src={convertInvoiceIcon} alt="" className="size-5" />
                  {t("orderFormDetail.convertToInvoice")}
                </button>
              </div>
              <div className="flex flex-col rounded-sm border border-[#e8e8ea] bg-surface-tab-bar p-4">
                <span className="text-xs font-semibold leading-[1.5] text-[#5b606c]">
                  {t("orderFormDetail.stillToDeliver")}
                </span>
                <span className="mt-1 text-[#2c3342]">
                  <Amount value={f.stillToDeliver.amount} size="xl" />
                </span>
                <span className="mt-1 text-sm font-medium leading-[1.2] text-[#2c3342]">
                  {f.stillToDeliver.note}
                </span>
              </div>
            </div>

            {/* Value bar: blue billed sits on top of the sand delivered segment. */}
            <div className="relative mt-3 h-3 w-full overflow-hidden rounded-[2px] bg-[#f3f3f3]">
              <div
                className="absolute inset-y-0 start-0 rounded-[2px] bg-[#b99a66]"
                style={{ width: `${f.deliveredPercent}%` }}
              />
              <div
                className="absolute inset-y-0 start-0 rounded-[2px] bg-[#2c4eb7]"
                style={{ width: `${f.billedPercent}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-[22px] gap-y-2">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-[18px] rounded-[2px] bg-[#2c4eb7]" />
                <span className="text-xs font-medium leading-[1.2] text-[#444957]">
                  {t("orderFormDetail.legend.billed")}
                </span>
                <span className="text-[#2c3342]">
                  <Amount value={f.legend.billed} size="sm" />
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-[18px] rounded-[2px] bg-[#b99a66]" />
                <span className="text-xs font-medium leading-[1.2] text-[#444957]">
                  {t("orderFormDetail.legend.deliveredNotBilled")}
                </span>
                <span className="text-[#2c3342]">
                  <Amount value={f.legend.deliveredNotBilled} size="sm" />
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-[18px] rounded-[2px] bg-[#f3f3f3]" />
                <span className="text-xs font-medium leading-[1.2] text-[#444957]">
                  {t("orderFormDetail.legend.stillToDeliver")}
                </span>
                <span className="text-[#2c3342]">
                  <Amount value={f.legend.stillToDeliver} size="sm" />
                </span>
              </span>
            </div>
          </Card>

          {/* Order value */}
          <aside className="flex flex-col rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
            <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">
              {t("orderFormDetail.orderValue")}
            </h2>
            <dl className="mt-9 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#151c2d]/70">
                  {t("orderFormDetail.subtotal")}
                </dt>
                <dd className="text-[#2c3342]">
                  <Amount value={doc.value.subtotal} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#2c3342]">
                  {t("orderFormDetail.vatLine")}
                </dt>
                <dd className="text-[#2c3342]">
                  <Amount value={doc.value.vat} />
                </dd>
              </div>
            </dl>
            <div className="mt-9 flex items-center justify-between gap-3">
              <span className="text-base font-medium text-[#151c2d]/90">
                {t("orderFormDetail.orderTotal")}
              </span>
              <span className="text-[#151c2d]/90">
                <Amount value={doc.value.total} size="lg" />
              </span>
            </div>
            {/* An order is not a tax document — VAT lands on the invoices raised against it. */}
            <div className="mt-4 flex items-start gap-1.5 rounded-sm bg-[#f4f6fb] px-3 py-2">
              <img
                src={warningIcon}
                alt=""
                className="mt-0.5 size-[17px] shrink-0"
              />
              <p className="text-sm font-medium leading-[1.2] text-[#2c4eb7]">
                {doc.value.vatNote}
              </p>
            </div>
          </aside>
        </div>

        {/* Lines — full width */}
        <Card>
          <SectionTitle title={t("orderFormDetail.lines")} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className="border-b border-[#f3f3f3] text-xs font-semibold leading-[1.2] text-[#5b606c]">
                  <th className="py-2 text-start">
                    {t("orderFormDetail.col.item")}
                  </th>
                  <th className="w-[128px] py-2 text-start">
                    {t("orderFormDetail.col.ordered")}
                  </th>
                  <th className="w-[106px] py-2 text-start">
                    {t("orderFormDetail.col.delivered")}
                  </th>
                  <th className="w-[112px] py-2 text-start">
                    {t("orderFormDetail.col.invoiced")}
                  </th>
                  <th className="w-[116px] py-2 text-start">
                    {t("orderFormDetail.col.toInvoice")}
                  </th>
                  <th className="w-[137px] py-2 text-start">
                    {t("orderFormDetail.col.toDeliver")}
                  </th>
                  <th className="w-[100px] py-2 text-end">
                    {t("orderFormDetail.col.total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-2">
                      <p className="text-base font-medium leading-[1.2] text-[#151c2d]">
                        {line.description}
                      </p>
                      <p className="mt-1 text-sm font-medium leading-[1.2] text-[#5b606c]">
                        {line.rate}
                      </p>
                    </td>
                    <td className="py-2 text-base font-medium text-[#2c3342]">
                      {line.ordered}
                    </td>
                    <td className="py-2 text-base font-medium text-[#2c3342]">
                      {line.delivered}
                    </td>
                    <td className="py-2 text-base font-medium text-[#2c3342]">
                      {line.invoiced}
                    </td>
                    <td className="py-2 text-base font-medium text-[#2c3342]">
                      {line.toInvoice}
                    </td>
                    <td className="py-2 text-base font-medium text-[#2c3342]">
                      {line.toDeliver}
                    </td>
                    <td className="py-2 text-end text-xl font-semibold text-[#151c2d]/90">
                      {line.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Activity — full width */}
        <Card>
          <SectionTitle title={t("orderFormDetail.activity")} />
          <ol className="flex flex-col">
            {doc.activity.map((event, i) => (
              <li key={event.id} className="flex gap-5">
                <span className="flex w-[52px] shrink-0 flex-col items-center">
                  <img
                    src={
                      event.tone === "open"
                        ? timelineOpenIcon
                        : timelineDoneIcon
                    }
                    alt=""
                    className={event.tone === "open" ? "size-7" : "size-[27px]"}
                  />
                  {i < doc.activity.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={[
                        "w-px flex-1",
                        event.tone === "open" ? "bg-[#887147]" : "bg-[#4c6c5a]",
                      ].join(" ")}
                    />
                  ) : null}
                </span>
                <div className="flex flex-col gap-1.5 pb-6">
                  <p className="text-base font-medium leading-[1.2] text-[#2c3342]">
                    {event.title}
                  </p>
                  <p className="text-sm font-medium leading-[1.2] text-[#444957]">
                    {event.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {/* Attachments — full width */}
        <Card>
          <SectionTitle title={t("orderFormDetail.attachments")} />
          <div className="flex flex-col gap-3">
            {doc.attachments.map((file) => (
              <div
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#e8e8ea] p-2.5"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="flex size-[54px] shrink-0 items-center justify-center rounded-sm bg-surface-tab-bar">
                    <img
                      src={FILE_ICONS[file.kind]}
                      alt=""
                      className="size-9"
                    />
                  </span>
                  <div className="flex min-w-0 flex-col gap-[7px]">
                    <p className="truncate text-base font-medium leading-[1.2] text-[#151c2d]">
                      {file.name}
                    </p>
                    <p className="truncate text-sm font-medium leading-[1.2] text-[#444957]">
                      {file.meta}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t("orderFormDetail.downloadFile")}
                    className="flex size-8 items-center justify-center rounded-sm border border-[#e8e8ea] bg-white"
                  >
                    <img src={downloadSmIcon} alt="" className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("orderFormDetail.removeFile")}
                    className="flex size-8 items-center justify-center rounded-sm border border-[#e8e8ea] bg-white"
                  >
                    <img src={deleteSmIcon} alt="" className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex min-h-[57px] flex-wrap items-center justify-center gap-2 rounded-sm border border-[#d5dcf1] bg-[#f4f6fb] p-4 text-center">
            <img src={uploadIcon} alt="" className="size-6" />
            <p className="text-base font-medium leading-[1.2] text-[#2c3342]">
              {t("orderFormDetail.dropFiles")}
            </p>
            <p className="text-sm font-medium leading-[1.2] text-[#737781]">
              {t("orderFormDetail.dropFilesHint")}
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
