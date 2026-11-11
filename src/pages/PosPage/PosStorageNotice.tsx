import { useTranslation } from 'react-i18next'
import { checkStorageAgain, useStorageFailure } from '../../lib/posQueue'

/**
 * POS-MEMQ S8 (owner R2-1), widened by DES43 rev 4.7 D.9 (OQ-XT2-STORAGE): while this device cannot
 * read or keep its sales and numbers, the cashier is told that selling has stopped here, online and
 * offline, and why, never left to find out from a refused sale. The sell controls are off meanwhile
 * (`useSellingBlock`). Check again only re-tests storage; it never resends or reprints, so no number
 * can be printed twice.
 *
 * `reportStale` (the server named another series or year: the device's date or time is likely
 * wrong) has its own sentence and the same Check again.
 *
 * `burnt` is reported only when storage itself is fine (`offlineBlock` answers a storage fault
 * first), so it gets its own wording without "can't save", and no Check again: by the owner's ruling
 * on the burn neither Check again nor an online sale may clear an unverified number (posQueue
 * `burnBlocks`; IMPL2-U1).
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
          <p className="text-sm font-semibold">
            {t(blocked === 'reportStale' ? 'pos.storage.reportStale' : 'pos.storage.blocked')}
          </p>
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
