import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import emptyIcon from '../../assets/suppliers/empty.svg'
import importIcon from '../../assets/bills/upload.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'

/**
 * Suppliers before anyone has been added (Figma 117:31877).
 *
 * Kept beside the list rather than inside it: the page has no tabs, no cards and no toolbar in
 * this state, so sharing one component would mean threading emptiness through all of them.
 */
export function SuppliersEmptyState() {
  const { t } = useTranslation()

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="max-w-[720px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('suppliersPage.title')}
          </h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('suppliersPage.subtitle')}
          </p>
        </div>

        <section className="flex min-h-[560px] flex-col items-center justify-center rounded-md bg-surface-card px-6 py-20 text-center">
          <img src={emptyIcon} alt="" className="h-auto w-[170px]" />
          <h2 className="mt-8 text-2xl font-medium leading-[1.2] text-text-primary">
            {t('suppliersPage.emptyState.title')}
          </h2>
          <p className="mt-2.5 max-w-[520px] text-sm font-medium leading-[1.5] text-text-quaternary">
            {t('suppliersPage.emptyState.body')}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/suppliers/new"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
              {t('suppliersPage.emptyState.addFirst')}
            </Link>
            <Link
              to="/suppliers/import"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={importIcon} alt="" className="size-5" />
              {t('suppliersPage.emptyState.importList')}
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
