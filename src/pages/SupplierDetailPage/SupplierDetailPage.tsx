import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { BillStatusChip } from '../../components/bills/BillStatusChip'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import type { BillRowDto } from '../../api/expenditure/bills'
import {
  downloadSupplierStatement,
  loadSupplierBills,
  loadSupplierContacts,
  loadSupplierDocuments,
  loadSupplierOverview,
  loadSupplierPurchases,
  supplierBillsPath,
  supplierContactsPath,
  supplierDocumentsPath,
  supplierOverviewPath,
  supplierPurchasesPath,
  type StatementFormat,
  type SupplierContactDto,
  type SupplierDocumentDto,
  type SupplierOverviewDto,
  type SupplierPurchaseDto,
} from '../../api/expenditure/supplierRecord'
import { dueNoteOf, toBillListItem } from '../../lib/billList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, initialsOf } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import {
  DETAIL_TABS,
  addressLine,
  bandsOf,
  documentMeta,
  earlySettlementNote,
  saveDownload,
  tabCount,
  termsNote,
  yearToDate,
  type DetailTabId,
  type Note,
} from '../../lib/supplierRecord'
import { BillsTab, DocumentsTab, OrdersTab, PaymentsTab, SupplierContactsModal, SwitchSupplierModal, UploadDocumentModal } from './SupplierRecordParts'
import chevronIcon from '../../assets/invoices/chevron.svg'
import editIcon from '../../assets/actions/edit.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import peppolIcon from '../../assets/suppliers/chip-peppol.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import cardIcon from '../../assets/suppliers/kpi-owe.svg'
import matchIcon from '../../assets/suppliers/menu-order.svg'
import selfBillIcon from '../../assets/suppliers/menu-attach.svg'
import paperIcon from '../../assets/bill-capture/file.svg'
import shieldIcon from '../../assets/bill-detail/compliance.svg'
import menuStatementIcon from '../../assets/suppliers/menu-statement.svg'

const BAND_TONE: Record<string, string> = {
  notDue: 'bg-[#4c6c5a]',
  dueSoon: 'bg-[#6d5a39]',
  late: 'bg-warning-700',
  onHold: 'bg-border-default',
}

const muscatToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

/** `/suppliers/:slug`; the list links by id. One shell around loading and the record alike. */
export function SupplierDetailPage() {
  const { slug = '' } = useParams()
  return (
    <AppShell>
      <SupplierRecord key={slug} id={slug} />
    </AppShell>
  )
}

function SupplierRecord({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'supplier.manage')
  const [tab, setTab] = useState<DetailTabId>('overview')
  const [notice, setNotice] = useState<Note | { body: string } | null>(null)
  const [switching, setSwitching] = useState(false)
  const [managingContacts, setManagingContacts] = useState(false)
  const [uploading, setUploading] = useState(false)

  const supplier = useApiRead<SupplierDetailDto>(supplierPath(id), () => loadSupplier(id))
  const overview = useApiRead<SupplierOverviewDto>(supplierOverviewPath(id), () => loadSupplierOverview(id))
  const contacts = useApiRead<SupplierContactDto[]>(supplierContactsPath(id), () => loadSupplierContacts(id))
  const documents = useApiRead<SupplierDocumentDto[]>(supplierDocumentsPath(id), () => loadSupplierDocuments(id))
  const recentBillsPath = supplierBillsPath(id, 0, 5)
  const recentBills = useApiRead<Page<BillRowDto>>(recentBillsPath, () => loadSupplierBills(recentBillsPath))
  const purchasesPath = supplierPurchasesPath(id, 12)
  const purchases = useApiRead<SupplierPurchaseDto[]>(purchasesPath, () => loadSupplierPurchases(purchasesPath))

  if (supplier.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {supplier.read.status === 'loading' ? <LoadingNotice /> : <ApiReadFailure error={supplier.read.error} retry={supplier.retry} />}
      </div>
    )
  }

  const record = supplier.read.data
  const profile = record.profile
  const head = overview.read.status === 'ready' ? overview.read.data : null
  const currency = head?.payables.currencyCode ?? 'OMR'
  const money = (value: number) => formatAmount(value, currency, language)
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')
  const text = (note: Note | null) => (note ? t(note.key, note.values) : '—')
  const switchedOff = profile.status === 'SWITCHED_OFF'
  const complete = profile.health.length === 0

  const failed = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice({ body: message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body })
  }

  const exportStatement = async (format: StatementFormat) => {
    setNotice(null)
    const { from, to } = yearToDate(muscatToday())
    try {
      saveDownload(await downloadSupplierStatement(id, format, from, to), `statement-${profile.displayName}.${format}`)
    } catch (error) {
      failed(error)
    }
  }

  const afterDocuments = () => {
    documents.retry()
    overview.retry()
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/suppliers" className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700">
            {t('suppliersPage.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <h1 className="text-2xl font-medium leading-[1.2] text-text-primary">{profile.displayName}</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
          {canManage ? (
            <Link
              to={`/suppliers/${id}/edit`}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={editIcon} alt="" className="size-5" />
              {t('supplierDetail.editSupplier')}
            </Link>
          ) : null}
          <Link
            to={`/suppliers/${id}/purchase-order`}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('supplierDetail.newPurchaseOrder')}
          </Link>
          <Link
            to={`/suppliers/${id}/record-bill`}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
            {t('supplierDetail.recordBill')}
          </Link>
        </div>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-card p-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-lg font-semibold text-primary-800">
            {initialsOf(profile.displayName)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-medium leading-[1.2] text-text-primary">{profile.displayName}</h2>
              {profile.receivingChannel ? (
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
                  {profile.receivingChannel === 'PEPPOL' ? <img src={peppolIcon} alt="" className="size-3" /> : null}
                  {t(`supplierRecord.channel.${profile.receivingChannel}`)}
                </span>
              ) : null}
              {profile.supplierCategory ? (
                <span className="inline-flex h-[26px] items-center rounded-full bg-primary-50 px-2.5 text-xs font-medium text-primary-800">
                  {profile.supplierCategory}
                </span>
              ) : null}
              {switchedOff ? (
                <span className="inline-flex h-[26px] items-center rounded-full bg-pending-100 px-2.5 text-xs font-medium text-pending-700">
                  {t('supplierRecord.switchedOff')}
                </span>
              ) : complete ? (
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
                  <img src={tickIcon} alt="" className="size-3" />
                  {t('supplierDetail.recordComplete')}
                </span>
              ) : (
                <span className="inline-flex h-[26px] items-center rounded-full bg-pending-100 px-2.5 text-xs font-medium text-pending-700">
                  {t('supplierRecord.needsFix', { count: profile.health.length })}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
              {[
                profile.vatNumber ? t('supplierRecord.vat', { vat: profile.vatNumber }) : t('supplierRecord.noVat'),
                text(termsNote(profile.paymentTerms)),
                profile.supplierSince ? t('supplierRecord.since', { date: day(profile.supplierSince) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <ActionMenu
          wide
          variant="bordered"
          label={t('supplierDetail.statement')}
          items={(['pdf', 'xlsx', 'csv'] as const).map((format) => ({
            id: format,
            labelKey: `supplierRecord.statement.${format}`,
            descriptionKey: 'supplierRecord.statement.note',
            icon: menuStatementIcon,
            onSelect: () => void exportStatement(format),
          }))}
        />
      </section>

      {notice ? (
        <Notice body={'key' in notice ? t(notice.key, notice.values) : notice.body} action={{ label: t('common.close'), onClick: () => setNotice(null) }} />
      ) : null}

      <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-border-subtle">
        {DETAIL_TABS.map((entry) => {
          const active = entry === tab
          const count = tabCount(entry, head)
          return (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry)}
              className={[
                'inline-flex h-[46px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                active ? 'border-primary-700 text-primary-700' : 'border-transparent text-text-quaternary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(`supplierDetail.tabs.${entry}`)}
              {count !== null ? (
                <span className="rounded-sm bg-surface-background px-1.5 py-0.5 text-[11px] font-semibold text-text-quaternary">{count}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {tab === 'bills' ? (
        <BillsTab supplierId={id} />
      ) : tab === 'payments' ? (
        <PaymentsTab supplierId={id} />
      ) : tab === 'orders' ? (
        <OrdersTab supplierId={id} />
      ) : tab === 'documents' ? (
        <DocumentsTab supplierId={id} documents={documents} onUpload={() => setUploading(true)} onChanged={afterDocuments} canManage={canManage} />
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('supplierDetail.whatYouOwe')}</h3>
              {head === null ? (
                <p className="mt-4 text-sm font-medium text-text-quaternary">{t('appAccess.loading')}</p>
              ) : (
                <Bands overview={head} money={money} day={day} />
              )}
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('supplierRecord.recentBills')}</h3>
                <button type="button" onClick={() => setTab('bills')} className="text-sm font-semibold text-primary-700 hover:underline">
                  {head ? t('supplierDetail.seeAll', { count: head.tabs.bills }) : t('supplierRecord.seeAllBills')}
                </button>
              </div>
              {recentBills.read.status === 'ready' ? (
                recentBills.read.data.items.length === 0 ? (
                  <p className="mt-4 text-sm font-medium text-text-quaternary">{t('supplierRecord.noBills')}</p>
                ) : (
                  <ul className="mt-2 flex flex-col">
                    {recentBills.read.data.items.map((row) => {
                      const item = toBillListItem(row)
                      const due = dueNoteOf(item)
                      return (
                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-background py-3.5 last:border-0">
                          <div className="min-w-0">
                            <Link to={`/expenditure/bills/${row.id}`} className="text-sm font-semibold text-primary-700 hover:underline">
                              {row.supplierBillNumber ?? t('supplierRecord.unnumbered')}
                            </Link>
                            <p className="mt-1 text-xs font-medium text-text-quaternary">
                              {[row.issueDate ? t('supplierRecord.issued', { date: day(row.issueDate) }) : null, due ? t(due.key, due.values) : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <BillStatusChip item={item} />
                            <span className="flex min-w-[96px] items-center justify-end gap-1 text-sm font-semibold text-text-primary tabular-nums">
                              <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                              {money(row.totalIncludingVat ?? row.outstandingAmount)}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )
              ) : recentBills.read.status === 'loading' ? (
                <p className="mt-4 text-sm font-medium text-text-quaternary">{t('appAccess.loading')}</p>
              ) : (
                <ApiReadFailure error={recentBills.read.error} retry={recentBills.retry} />
              )}
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('supplierDetail.whatYouBuy')}</h3>
                <span className="text-xs font-medium text-text-quaternary">{t('supplierDetail.lastTwelveMonths')}</span>
              </div>
              {purchases.read.status === 'ready' ? (
                purchases.read.data.length === 0 ? (
                  <p className="mt-4 text-sm font-medium text-text-quaternary">{t('supplierRecord.noPurchases')}</p>
                ) : (
                  <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                    {[...purchases.read.data]
                      .sort((a, b) => b.totalAmount - a.totalAmount)
                      .slice(0, 6)
                      .map((line) => (
                        <div key={`${line.description}-${line.unit}`}>
                          <p className="text-sm font-medium leading-[1.3] text-text-secondary">{line.description}</p>
                          <p className="mt-1 flex items-baseline gap-2">
                            <span className="flex items-center gap-1 text-lg font-semibold leading-[1.2] text-text-primary tabular-nums">
                              <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                              {formatAmount(line.totalAmount, line.currencyCode, language)}
                            </span>
                            <span className="text-xs font-medium text-text-quaternary">
                              · {new Intl.NumberFormat(language).format(line.totalQuantity)} {line.unit ?? ''}
                            </span>
                          </p>
                        </div>
                      ))}
                  </div>
                )
              ) : purchases.read.status === 'loading' ? (
                <p className="mt-4 text-sm font-medium text-text-quaternary">{t('appAccess.loading')}</p>
              ) : (
                <ApiReadFailure error={purchases.read.error} retry={purchases.retry} />
              )}
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('supplierDetail.papersOnFile')}</h3>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setUploading(true)}
                    className="inline-flex h-[38px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    {t('supplierDetail.attachDocument')}
                  </button>
                ) : null}
              </div>
              {documents.read.status === 'ready' ? (
                documents.read.data.length === 0 ? (
                  <p className="mt-4 text-sm font-medium text-text-quaternary">{t('supplierRecord.noDocuments')}</p>
                ) : (
                  <ul className="mt-2 flex flex-col">
                    {documents.read.data.slice(0, 4).map((entry) => {
                      const meta = documentMeta(entry)
                      return (
                        <li
                          key={entry.document.id}
                          className={[
                            'flex items-center gap-3 border-b border-surface-background py-3.5 last:border-0',
                            entry.standing === 'SUPERSEDED' ? 'opacity-60' : '',
                          ].join(' ')}
                        >
                          <span
                            className={['flex size-9 shrink-0 items-center justify-center rounded-sm', entry.standing === 'ON_FILE' ? 'bg-success-100' : 'bg-primary-50'].join(
                              ' ',
                            )}
                          >
                            <img src={entry.standing === 'ON_FILE' ? shieldIcon : paperIcon} alt="" className="size-[18px]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-[1.3] text-text-primary">{entry.document.title}</p>
                            <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                              {t(`supplierRecord.kind.${entry.document.kind}`)} · {t(meta.key, { date: day(String(meta.values?.date ?? '')) })}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                            {t(`supplierRecord.standing.${entry.standing}`)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )
              ) : documents.read.status === 'loading' ? (
                <p className="mt-4 text-sm font-medium text-text-quaternary">{t('appAccess.loading')}</p>
              ) : (
                <ApiReadFailure error={documents.read.error} retry={documents.retry} />
              )}
            </section>
          </div>

          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-background p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-text-tertiary">
                <img src={cardIcon} alt="" className="size-[18px]" />
                {t('supplierDetail.youOweThem')}
              </p>
              <p className="mt-2.5 flex items-center gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                <img src={omrRowIcon} alt="" className="h-auto w-[22px] shrink-0" />
                {head ? money(head.payables.total) : '—'}
              </p>
              {head ? (
                <p className="mt-2.5 text-sm font-medium leading-[1.5] text-text-tertiary">
                  {head.payables.everLate ? t('supplierRecord.everLate') : t('supplierRecord.neverLate')}
                </p>
              ) : null}
            </section>

            <SideCard title={t('supplierDetail.payingThem')}>
              <DetailRow label={t('supplierDetail.terms')} value={text(termsNote(profile.paymentTerms))} />
              <DetailRow label={t('supplierDetail.earlySettlement')} value={text(earlySettlementNote(profile))} />
              <DetailRow label={t('supplierDetail.bank')} value={profile.bankDetails?.bankName ?? '—'} />
              <DetailRow label={t('supplierDetail.iban')} value={profile.bankDetails?.iban ?? '—'} />
              <DetailRow label={t('supplierDetail.bic')} value={profile.bankDetails?.bic ?? '—'} />
              <DetailRow
                label={t('supplierDetail.detailsLastChanged')}
                value={profile.bankDetails?.changedAt ? day(profile.bankDetails.changedAt.slice(0, 10)) : '—'}
                last
              />
              {profile.health.includes('BANK_CHANGED_UNCONFIRMED') ? (
                <p className="mt-2 rounded-sm bg-pending-100 p-3 text-xs font-medium leading-[1.4] text-pending-700">{t('supplierRecord.bankUnconfirmed')}</p>
              ) : null}
            </SideCard>

            <SideCard title={t('supplierDetail.howTheyBillYou')}>
              <BillingRow
                icon={peppolIcon}
                title={profile.participantId ? t('supplierDetail.overPeppol') : t('supplierRecord.notOnPeppol')}
                note={profile.participantId ?? undefined}
                value={profile.receivingChannel ? t(`supplierRecord.channel.${profile.receivingChannel}`) : '—'}
              />
              <BillingRow
                icon={matchIcon}
                title={t('supplierDetail.matchedToOrders')}
                note={t('supplierRecord.matchedNote')}
                value={head && head.match.orderBacked > 0 ? t('supplierDetail.matchedOf', { matched: head.match.agreed, total: head.match.orderBacked }) : '—'}
              />
              <BillingRow
                icon={selfBillIcon}
                title={t('supplierDetail.selfBilling')}
                note={t('supplierDetail.selfBillingNote')}
                value={profile.selfBillingAgreement ? t('supplierRecord.on') : t('supplierDetail.off')}
                last
              />
            </SideCard>

            <SideCard
              title={t('supplierDetail.whoToSpeakTo')}
              action={
                canManage ? (
                  <button type="button" onClick={() => setManagingContacts(true)} className="text-sm font-semibold text-primary-700 hover:underline">
                    {t('supplierRecord.contacts.manage')}
                  </button>
                ) : null
              }
            >
              {contacts.read.status === 'ready' ? (
                contacts.read.data.length === 0 ? (
                  <p className="py-3 text-sm font-medium text-text-quaternary">{t('supplierRecord.contacts.none', { name: profile.contactPerson ?? '—' })}</p>
                ) : (
                  contacts.read.data.map((contact) => (
                    <div key={contact.id} className="flex items-center gap-3 border-b border-surface-background py-3 last:border-0">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">
                        {initialsOf(contact.fullName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{contact.fullName}</p>
                        <p className="mt-0.5 truncate text-xs font-medium text-text-quaternary"><bdi dir="ltr">{contact.email ?? contact.telephone ?? contact.mobilePhone ?? ''}</bdi></p>
                      </div>
                      <span className="shrink-0 rounded-sm bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-800">
                        {t(`supplierRecord.purpose.${contact.purpose}`)}
                      </span>
                    </div>
                  ))
                )
              ) : contacts.read.status === 'loading' ? (
                <p className="py-3 text-sm font-medium text-text-quaternary">{t('appAccess.loading')}</p>
              ) : (
                <ApiReadFailure error={contacts.read.error} retry={contacts.retry} />
              )}
            </SideCard>

            <SideCard title={t('supplierDetail.record')}>
              <DetailRow label={t('supplierDetail.legalName')} value={profile.legalName ?? profile.displayName} />
              <DetailRow label={t('supplierDetail.vatNumber')} value={profile.vatNumber ?? '—'} />
              <DetailRow label={t('supplierDetail.crNumber')} value={profile.commercialRegistrationNumber ?? '—'} />
              <DetailRow label={t('supplierDetail.address')} value={addressLine(record.invoiceAddress) ?? '—'} />
              <DetailRow label={t('supplierDetail.supplierSince')} value={day(profile.supplierSince)} last />
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setSwitching(true)}
                  className="mt-4 inline-flex h-[42px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:border-warning-700 hover:text-warning-700"
                >
                  {switchedOff ? t('supplierRecord.switchOn') : t('supplierDetail.switchOff')}
                </button>
              ) : null}
            </SideCard>
          </aside>
        </div>
      )}

      {switching ? (
        <SwitchSupplierModal
          supplierId={id}
          name={profile.displayName}
          to={switchedOff ? 'on' : 'off'}
          onClose={() => setSwitching(false)}
          onSwitched={(to) => {
            setSwitching(false)
            setNotice({ key: to === 'off' ? 'supplierForm.done.switchedOff' : 'supplierForm.done.switchedOn' })
            supplier.retry()
          }}
        />
      ) : null}
      {managingContacts ? (
        <SupplierContactsModal supplierId={id} contacts={contacts.read.status === 'ready' ? contacts.read.data : []} onClose={() => setManagingContacts(false)} onChanged={contacts.retry} />
      ) : null}
      {uploading ? (
        <UploadDocumentModal
          supplierId={id}
          onClose={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false)
            setNotice({ key: 'supplierRecord.documents.uploadedDone' })
            afterDocuments()
          }}
        />
      ) : null}
    </div>
  )
}

function Bands({ overview, money, day }: { overview: SupplierOverviewDto; money: (value: number) => string; day: (value: string | null) => string }) {
  const { t } = useTranslation()
  const { bands, total } = bandsOf(overview)
  if (total === 0) return <p className="mt-4 text-sm font-medium text-text-quaternary">{t('supplierRecord.nothingOwed')}</p>
  return (
    <>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-background">
        {bands
          .filter((band) => band.amount > 0)
          .map((band) => (
            <span key={band.id} className={BAND_TONE[band.id]} style={{ width: `${(band.amount / total) * 100}%` }} />
          ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {bands.map((band) => (
          <div key={band.id} className="border-s-2 border-surface-background ps-3">
            <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">{t(`supplierRecord.band.${band.id}`)}</p>
            {band.amount > 0 ? (
              <p className="mt-1.5 flex items-center gap-1 text-xl font-semibold leading-[1.2] text-text-primary tabular-nums">
                <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                {money(band.amount)}
              </p>
            ) : (
              <p className="mt-1.5 text-xl font-semibold leading-[1.2] text-text-quaternary">—</p>
            )}
            <p className="mt-1.5 text-xs font-medium leading-[1.3] text-text-quaternary">
              {band.bills === 0
                ? t('supplierRecord.bandEmpty')
                : band.nextDue
                  ? t('supplierRecord.bandNote', { count: band.bills, date: day(band.nextDue) })
                  : t('supplierRecord.bandCount', { count: band.bills })}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

function SideCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold leading-[1.2] text-text-primary">{title}</h3>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={['flex items-center justify-between gap-3 py-2.5', last ? '' : 'border-b border-surface-background'].join(' ')}>
      <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">{label}</dt>
      <dd className="min-w-0 truncate text-end text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  )
}

function BillingRow({ icon, title, note, value, last }: { icon: string; title: string; note?: string; value: string; last?: boolean }) {
  return (
    <div className={['flex items-start gap-3 py-3', last ? '' : 'border-b border-surface-background'].join(' ')}>
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-50">
        <img src={icon} alt="" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{title}</p>
        {note ? <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p> : null}
      </div>
      <span className="shrink-0 text-xs font-medium text-text-tertiary">{value}</span>
    </div>
  )
}
