import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DocumentsReport } from '../reporting/ErpDocumentsPage'
import { DocumentDetailBody } from '../reporting/ErpDocumentDetailPage'
import { useDocumentDetail } from '../reporting/reportingHooks'
import { BackLink } from '../reporting/reportingParts'
import { connectionLinks } from '../reporting/reportingHooks'
import { InConnection } from './ConnectionRunsPage'

/**
 * A connection's source documents, inside the connection's own frame, narrowed to it.
 *
 * The same report and detail the all-channels screens draw (`/settings/erp/documents`); only the
 * frame and the links differ. A reader without `erp.connection.read` is sent to the all-channels
 * report narrowed to the connection, as before (see {@link InConnection}).
 */
export function ConnectionRecordsPage() {
  const { id = '', recordId } = useParams<{ id: string; recordId?: string }>()
  return (
    <InConnection
      connectionId={id}
      fallback={
        recordId
          ? `/settings/erp/documents/${encodeURIComponent(recordId)}`
          : `/settings/erp/documents?connection=${encodeURIComponent(id)}`
      }
    >
      {() =>
        recordId ? (
          <RecordDetail connectionId={id} recordId={recordId} />
        ) : (
          <DocumentsReport connectionId={id} links={connectionLinks(id)} />
        )
      }
    </InConnection>
  )
}

function RecordDetail({ connectionId, recordId }: { connectionId: string; recordId: string }) {
  const { t } = useTranslation()
  const detail = useDocumentDetail(recordId)
  return (
    <>
      <div className="flex flex-col gap-1">
        <BackLink to={`/settings/erp/connections/${encodeURIComponent(connectionId)}/records`}>
          {t('erp.reporting.detail.back')}
        </BackLink>
        {detail.read.status === 'ready' ? (
          <h3 className="text-lg font-semibold text-text-primary break-words">
            <bdi dir="ltr">{detail.read.data.document.external_document_id}</bdi>
          </h3>
        ) : null}
      </div>
      <DocumentDetailBody detail={detail} links={connectionLinks(connectionId)} />
    </>
  )
}
