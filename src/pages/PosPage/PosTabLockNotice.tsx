import { useTranslation } from 'react-i18next'
import { checkTillLockAgain, useTillLock } from '../../lib/posTillLock'

/**
 * POS-TABLOCK (Q-25 R-TABS). Mounted on every till screen by PosTillGate, and its mount is what
 * holds the till's one-tab lock: the lock goes when the screens go (till change, sign-out, page
 * closed). Shown only when this tab may not number offline sales. The wording speaks of this
 * device's tabs and windows only: the lock does nothing for another device, and must never be
 * read as if it did. There is no "use this tab" takeover, since taking the lock from a tab that
 * may be numbering a sale is the overlap it prevents; Check again only asks for the lock, and gets
 * it once the other tab has let go.
 */
export function PosTabLockNotice({ tillId }: { tillId: string }) {
  const { t } = useTranslation()
  const lock = useTillLock(tillId)
  if (lock !== 'otherTab' && lock !== 'unsupported') return null
  return (
    <section
      role="alert"
      className="mx-auto mb-4 flex w-full max-w-[1144px] flex-col gap-3 rounded-md border border-danger-700 bg-danger-100 px-5 py-4 text-danger-700"
    >
      <p className="text-sm font-semibold">{t(`pos.tabLock.${lock}`)}</p>
      {lock === 'otherTab' ? (
        <div>
          <button
            type="button"
            onClick={() => {
              void checkTillLockAgain(tillId)
            }}
            className="inline-flex h-9 items-center rounded-sm bg-primary-700 px-4 text-xs font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
          >
            {t('pos.tabLock.checkAgain')}
          </button>
        </div>
      ) : null}
    </section>
  )
}
