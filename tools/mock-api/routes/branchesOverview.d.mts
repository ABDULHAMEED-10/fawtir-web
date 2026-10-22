/** Types for `branchesOverview.mjs`, so the branches tests can render the mock's own answer. */
import type { BranchOverviewDto } from '../../../src/api/settings/branches'

export declare const BRANCHES_OVERVIEW: BranchOverviewDto

declare const routes: { match: string; reply: () => BranchOverviewDto }[]
export default routes
