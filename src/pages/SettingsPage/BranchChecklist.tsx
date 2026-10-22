import { useTranslation } from 'react-i18next'

/**
 * The branches a person works in (Business Rules BA-1), as ticks: the invitation's picker, shared
 * with "Switch back on". With one branch to give it is ticked and fixed (`onlyBranch`); `missing`
 * says a branch must be chosen.
 */
export function BranchChecklist({
  legend,
  choices,
  picked,
  onlyBranch,
  missing,
  onChange,
}: {
  legend: string
  choices: { id: string; name: string }[]
  picked: string[]
  onlyBranch: string | null
  missing: boolean
  onChange: (branchId: string, checked: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="sr-only">{legend}</legend>
      {choices.map((branch) => (
        <label
          key={branch.id}
          className="flex cursor-pointer items-center gap-3 rounded-sm border border-border-subtle bg-white px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-primary-25"
        >
          <input
            type="checkbox"
            checked={picked.includes(branch.id)}
            disabled={onlyBranch !== null}
            onChange={(event) => onChange(branch.id, event.target.checked)}
            className="size-[18px] shrink-0 accent-[#2c4eb7]"
          />
          {branch.name}
        </label>
      ))}
      {missing ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {t('branchAccess.refusal.branchRequired')}
        </p>
      ) : null}
    </fieldset>
  )
}
