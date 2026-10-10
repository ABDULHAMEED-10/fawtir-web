import type { CatalogueAdminPlan } from '../../../lib/console/planCatalogue'

/**
 * The plan's name in the reader's language, as the operator published it (V265 gave plans an
 * Arabic name). A plan with no Arabic name yet keeps its English one rather than an app-side
 * translation that the operator never saw or approved.
 */
export function displayPlanName(
  plan: Pick<CatalogueAdminPlan, 'nameEn' | 'nameAr'>,
  language: string,
) {
  return (language.startsWith('ar') ? plan.nameAr : null) || plan.nameEn
}
