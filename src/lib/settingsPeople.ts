/**
 * Settings › People — who can sign in, and what each of them may do.
 *
 * Figma 135:38461 (Team members), 135:38912 (Invite someone), 135:39357 (What each role can
 * do), 135:40069 (Make a role).
 *
 * The design's copy for a single invited person was written in the feminine ("what she's done",
 * "ask her to set up two-step"). A template is shown for whoever is on the row, so it is written
 * neutrally here — otherwise half the team is addressed wrongly.
 */

import { PLAN } from './plans'
import { TODAY, daysFrom } from './settings'

/* -------------------------------------------------------------- team members */

export type Member = {
  id: string
  name: string
  initials: string
  email: string
  you?: boolean
  role: RoleId
  /** Empty means every branch, now and in future. */
  branches: string[]
  /** Null for someone who has never signed in. */
  lastSignedIn: {
    agoKey: string
    agoValues?: Record<string, string | number>
    whereKey: string
    whereValues?: Record<string, string>
  } | null
  twoStep: 'on' | 'off' | 'never'
  /** Days since the last sign-in, for the "not lately" tab. */
  quietDays?: number
  invited?: { daysAgo: number; expiresInDays: number }
  removed?: boolean
}

export const MEMBERS: Member[] = [
  {
    id: 'hafidh',
    name: 'Hafidh Saif',
    initials: 'HS',
    email: 'hafidh@albahja.om',
    you: true,
    role: 'owner',
    branches: [],
    lastSignedIn: {
      agoKey: 'team.now',
      whereKey: 'team.whereBrowser',
      whereValues: { branch: 'Nizwa' },
    },
    twoStep: 'on',
    quietDays: 0,
  },
  {
    id: 'yusuf',
    name: 'Yusuf Al Balushi',
    initials: 'YB',
    email: 'yusuf@albahja.om',
    role: 'manager',
    branches: ['Muscat', 'Nizwa'],
    lastSignedIn: {
      agoKey: 'team.hoursAgo',
      agoValues: { count: 2 },
      whereKey: 'team.whereMobile',
      whereValues: { branch: 'Muscat' },
    },
    twoStep: 'on',
    quietDays: 0,
  },
  {
    id: 'salim',
    name: 'Salim Al Kindi',
    initials: 'SK',
    email: 'salim@albahja.om',
    role: 'manager',
    branches: ['Sohar', 'Nizwa'],
    lastSignedIn: {
      agoKey: 'team.yesterday',
      whereKey: 'team.whereWeb',
      whereValues: { branch: 'Sohar' },
    },
    twoStep: 'off',
    quietDays: 1,
  },
  {
    id: 'maryam',
    name: 'Maryam Al Hinai',
    initials: 'MA',
    email: 'maryam@albahja.om',
    role: 'till',
    branches: ['Nizwa', 'Muscat'],
    lastSignedIn: {
      agoKey: 'team.onDate',
      agoValues: { date: '12 August' },
      whereKey: 'team.whereTill',
      whereValues: { branch: 'Nizwa' },
    },
    twoStep: 'off',
    quietDays: 45,
  },
  {
    id: 'rashid',
    name: 'Rashid Al Amri',
    initials: 'RA',
    email: 'rashid@albahja.om',
    role: 'accountant',
    branches: [],
    lastSignedIn: null,
    twoStep: 'never',
    invited: { daysAgo: 9, expiresInDays: 5 },
  },
]

/** Someone is "quiet" once a fortnight has passed without a sign-in. */
export const QUIET_AFTER_DAYS = 14

export const withLogin = MEMBERS.filter((member) => !member.invited)
export const invited = MEMBERS.filter((member) => member.invited)
export const withoutTwoStep = MEMBERS.filter((member) => member.twoStep === 'off')
export const quiet = MEMBERS.filter((member) => (member.quietDays ?? 0) > QUIET_AFTER_DAYS)
export const signedInThisWeek = withLogin.filter((member) => (member.quietDays ?? 0) <= 7)

/** People taken off the account. They keep their entries in the log but hold no place. */
export const REMOVED_COUNT = 2

export const TEAM_TABS = [
  { id: 'all', labelKey: 'team.tab.all' },
  { id: 'waiting', labelKey: 'team.tab.waiting' },
  { id: 'quiet', labelKey: 'team.tab.quiet' },
  { id: 'withoutTwoStep', labelKey: 'team.tab.withoutTwoStep' },
  { id: 'removed', labelKey: 'team.tab.removed' },
] as const

export type TeamTab = (typeof TEAM_TABS)[number]['id']

export function matchesTeamTab(member: Member, tab: TeamTab) {
  if (tab === 'all') return true
  if (tab === 'waiting') return Boolean(member.invited)
  if (tab === 'quiet') return (member.quietDays ?? 0) > QUIET_AFTER_DAYS
  if (tab === 'withoutTwoStep') return member.twoStep === 'off'
  return false
}

export function countTeamTab(tab: TeamTab) {
  if (tab === 'removed') return REMOVED_COUNT
  return MEMBERS.filter((member) => matchesTeamTab(member, tab)).length
}

export const matchesMemberQuery = (member: Member, query: string) => {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return member.name.toLowerCase().includes(needle) || member.email.toLowerCase().includes(needle)
}

export const TEAM_SORTS = [
  { id: 'name', labelKey: 'team.sort.name' },
  { id: 'recent', labelKey: 'team.sort.recent' },
  { id: 'role', labelKey: 'team.sort.role' },
]

/** Included seats, and what the next person costs. */
export const SEATS = { included: PLAN.business.people, extraMonthly: PLAN.business.extraPerson }

export const EXTRA_PEOPLE_COST = Math.max(0, MEMBERS.length - SEATS.included) * SEATS.extraMonthly

/* --------------------------------------------------------------------- roles */

export type RoleId = 'owner' | 'manager' | 'accountant' | 'till' | 'wholesale'

export type Role = {
  id: RoleId
  /** Built-in roles ship with Fawtir; a custom one was made on this account. */
  kind: 'fixed' | 'builtIn' | 'yours'
}

export const ROLES: Role[] = [
  { id: 'owner', kind: 'fixed' },
  { id: 'manager', kind: 'builtIn' },
  { id: 'accountant', kind: 'builtIn' },
  { id: 'till', kind: 'builtIn' },
  { id: 'wholesale', kind: 'yours' },
]

/** How many people hold each role, counted from the team rather than typed. */
export const roleHolders = (role: RoleId) => MEMBERS.filter((member) => member.role === role)

export const BUILT_IN_ROLE_COUNT = ROLES.filter((role) => role.kind !== 'yours').length

/** A permission is either allowed, refused, or allowed within a limit the cell spells out. */
export type Grant = 'yes' | 'no' | { limitKey: string }

export type Permission = {
  id: string
  group: 'selling' | 'catalog' | 'money' | 'account'
  /** What each role may do. Owner is never anything but yes. */
  by: Record<RoleId, Grant>
  /** The last group can only ever belong to the owner. */
  ownerOnly?: boolean
}

export const PERMISSION_GROUPS = ['selling', 'catalog', 'money', 'account'] as const

export const PERMISSIONS: Permission[] = [
  {
    id: 'raiseInvoice',
    group: 'selling',
    by: { owner: 'yes', manager: 'yes', accountant: 'no', till: 'yes', wholesale: 'yes' },
  },
  {
    id: 'takePayment',
    group: 'selling',
    by: { owner: 'yes', manager: 'yes', accountant: 'no', till: 'yes', wholesale: 'no' },
  },
  {
    id: 'cancelOrCredit',
    group: 'selling',
    by: {
      owner: 'yes',
      manager: 'yes',
      accountant: 'no',
      till: 'no',
      wholesale: { limitKey: 'roles.limit.ownOnly' },
    },
  },
  {
    id: 'discountByHand',
    group: 'selling',
    by: {
      owner: 'yes',
      manager: 'yes',
      accountant: 'no',
      till: 'no',
      wholesale: { limitKey: 'roles.limit.upToTenPercent' },
    },
  },
  {
    id: 'seeWhatYouSell',
    group: 'catalog',
    by: { owner: 'yes', manager: 'yes', accountant: 'yes', till: 'yes', wholesale: 'yes' },
  },
  {
    id: 'changePrices',
    group: 'catalog',
    by: { owner: 'yes', manager: 'yes', accountant: 'no', till: 'no', wholesale: 'no' },
  },
  {
    id: 'addOrSwitchOff',
    group: 'catalog',
    by: { owner: 'yes', manager: 'yes', accountant: 'no', till: 'no', wholesale: 'no' },
  },
  {
    id: 'countStock',
    group: 'catalog',
    by: {
      owner: 'yes',
      manager: 'yes',
      accountant: 'no',
      till: { limitKey: 'roles.limit.countOnly' },
      wholesale: 'yes',
    },
  },
  {
    id: 'seeEarnings',
    group: 'money',
    by: {
      owner: 'yes',
      manager: { limitKey: 'roles.limit.ownBranch' },
      accountant: 'yes',
      till: 'no',
      wholesale: 'no',
    },
  },
  {
    id: 'pullReports',
    group: 'money',
    by: {
      owner: 'yes',
      manager: { limitKey: 'roles.limit.ownBranch' },
      accountant: 'yes',
      till: 'no',
      wholesale: 'no',
    },
  },
  {
    id: 'handleBills',
    group: 'money',
    by: { owner: 'yes', manager: 'yes', accountant: 'no', till: 'no', wholesale: 'yes' },
  },
  {
    id: 'seeTddLog',
    group: 'money',
    by: { owner: 'yes', manager: 'yes', accountant: 'yes', till: 'no', wholesale: 'no' },
  },
  {
    id: 'addOrRemovePeople',
    group: 'account',
    ownerOnly: true,
    by: { owner: 'yes', manager: 'no', accountant: 'no', till: 'no', wholesale: 'no' },
  },
  {
    id: 'changePlan',
    group: 'account',
    ownerOnly: true,
    by: { owner: 'yes', manager: 'no', accountant: 'no', till: 'no', wholesale: 'no' },
  },
  {
    id: 'changeCompany',
    group: 'account',
    ownerOnly: true,
    by: { owner: 'yes', manager: 'no', accountant: 'no', till: 'no', wholesale: 'no' },
  },
  {
    id: 'apiKeys',
    group: 'account',
    ownerOnly: true,
    by: { owner: 'yes', manager: 'no', accountant: 'no', till: 'no', wholesale: 'no' },
  },
]

export const PERMISSION_TOTAL = PERMISSIONS.length

/** How many of the sixteen a role holds, counting a limited grant as held. */
export const grantsFor = (role: RoleId) =>
  PERMISSIONS.filter((permission) => permission.by[role] !== 'no').length

/* ---------------------------------------------------------------- make a role */

/** The roles a new one can be copied from, plus the empty start. */
export const ROLE_TEMPLATES: { id: RoleId | 'nothing' }[] = [
  { id: 'till' },
  { id: 'manager' },
  { id: 'accountant' },
  { id: 'nothing' },
]

/** Permissions that carry a qualifier rather than a plain yes. */
export const LIMIT_CHOICES: Record<string, string[]> = {
  cancelOrCredit: ['roles.limit.ownOnly', 'roles.limit.anyInvoice'],
  discountByHand: [
    'roles.limit.upToTenPercent',
    'roles.limit.upToTwentyPercent',
    'roles.limit.any',
  ],
  countStock: ['roles.limit.countOnly', 'roles.limit.everything'],
  handleBills: ['roles.limit.approveOnly', 'roles.limit.approveAndPay'],
  seeEarnings: ['roles.limit.ownBranch', 'roles.limit.everyBranch'],
  pullReports: ['roles.limit.ownBranch', 'roles.limit.everyBranch'],
}

/** Starting grants when a new role is copied from an existing one. */
export function templateGrants(template: RoleId | 'nothing'): Record<string, boolean> {
  const grants: Record<string, boolean> = {}
  for (const permission of PERMISSIONS) {
    grants[permission.id] =
      template === 'nothing' ? false : permission.by[template as RoleId] !== 'no'
  }
  return grants
}

/* ------------------------------------------------------------ invite someone */

export const INVITE_LINK_DAYS = 14

export const INVITE_DEFAULTS = {
  name: 'Aisha Al Rawahi',
  email: 'aisha@albahja.om',
  note: 'Hi Aisha, this is for raising invoices at the Muscat shop. Any trouble signing in, give me a ring.',
  role: 'till' as RoleId,
  branches: ['muscat'],
  askForTwoStep: true,
}

/** Capability chips shown under each role on the invite screen. */
export const ROLE_CHIPS: Record<RoleId, { id: string; on: boolean }[]> = {
  till: [
    { id: 'sellAndInvoice', on: true },
    { id: 'seeCatalog', on: true },
    { id: 'reports', on: false },
    { id: 'changePrices', on: false },
    { id: 'billing', on: false },
  ],
  manager: [
    { id: 'everythingTill', on: true },
    { id: 'pricesAndStock', on: true },
    { id: 'theirBranchReports', on: true },
    { id: 'billing', on: false },
  ],
  accountant: [
    { id: 'allReports', on: true },
    { id: 'downloadDocuments', on: true },
    { id: 'changeAnything', on: false },
  ],
  owner: [],
  wholesale: [],
}

export { TODAY, daysFrom }
