import { useTranslation } from 'react-i18next'
import { checkStorageAgain, useStorageFailure } from '../../lib/posQueue'

/**
 * POS-MEMQ S8 (owner R2-1): while this device cannot keep an offline sale, the cashier is told that
 * offline selling has stopped and why, never left to find out from a refused sale. Check again only
 * re-tests storage; it never resends or reprints, so no number can be printed twice.
 *
 * `burnt` is reported only when storage itself is fine (`offlineBlock` answers a storage fault
 * first), so it gets its own wording without "isn't saving", and no Check again: that re-tests
 * storage and by design cannot clear a burn; only an online sale on this till that files at or past
 * that number does (posQueue `burnt`; IMPL2-U1).
 */
export function PosStorageNotice({ tillId }: { tillId: string }) {
  const { t } = useTranslation()
  const blocked = useStorageFailure(tillId)
  if (!blocked) return null
  return (
    <section
      role="alert"
      className="mx-auto mb-4 flex w-full max-w-[1144px] flex-col gap-3 rounded-md border border-danger-700 bg-danger-100 px-5 py-4 text-danger-700"
    >
      {blocked === 'burnt' ? (
        <>
          <p className="text-sm font-semibold">{t('pos.storage.burntHeadline')}</p>
          <p className="text-xs font-medium">{t('pos.storage.burnt')}</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold">{t('pos.storage.blocked')}</p>
          <div>
            <button
              type="button"
              onClick={() => {
                checkStorageAgain()
              }}
              className="inline-flex h-9 items-center rounded-sm bg-primary-700 px-4 text-xs font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
            >
              {t('pos.storage.checkAgain')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
