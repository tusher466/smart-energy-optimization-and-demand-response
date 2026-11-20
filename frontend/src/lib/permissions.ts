import type { Role } from '../state/store'

/** Single source of truth for who may see and do what.
 *  Backend enforces the same rules (require_roles); the UI mirrors them so
 *  users only ever see features their role can actually use.
 */
export const ROLE_ORDER: Role[] = ['viewer', 'manager', 'operator', 'admin']

export const ROLE_BLURB: Record<Role, string> = {
  viewer: 'Read-only dashboards and reports.',
  manager: 'Runs forecasts, inspections, simulations, exports.',
  operator: 'Dispatches fleets, acts on the grid, approves.',
  admin: 'Manages users, roles, and destructive actions.',
}

/** Minimum role that may SEE a page. */
export const PAGE_MIN: Record<string, Role> = {
  overview: 'viewer',
  solar: 'manager',
  demand: 'manager',
  dispatch: 'operator',
  grid: 'manager',
  panels: 'manager',
  ledger: 'viewer',
  sdgs: 'viewer',
  trust: 'viewer',
  settings: 'viewer',
  users: 'admin',
}

/** Minimum role that may USE an action. */
export const ACTION_MIN = {
  simulate: 'manager',
  forecast: 'manager',
  inspect: 'manager',
  copilot: 'manager',
  compare: 'manager',
  dispatch: 'operator',
  approve: 'operator',
  requestApproval: 'operator',
  export: 'viewer',
  refresh: 'operator',
  decide: 'operator',
  seed: 'admin',
  reset: 'admin',
  manageUsers: 'admin',
} as Record<string, Role>

export const ACTION_LABEL: Record<string, string> = {
  simulate: 'Simulate a day',
  forecast: 'Run forecasts',
  inspect: 'Inspect panels',
  copilot: 'Ask the copilot',
  compare: 'Compare scenarios',
  dispatch: 'Run dispatch',
  approve: 'Approve / reject',
  requestApproval: 'Request approvals',
  export: 'Export CSV',
  refresh: 'Refresh live data',
  decide: 'Decide approvals',
  seed: 'Seed demo data',
  reset: 'Reset ledger',
  manageUsers: 'Manage users',
}

/** Human-readable feature list for a role (used by Users page + login hints). */
export function featuresFor(role: Role): string[] {
  const pages = Object.entries(PAGE_MIN)
    .filter(([, min]) => min === role)
    .map(([p]) => `View ${p}`)
  const actions = Object.entries(ACTION_MIN)
    .filter(([, min]) => min === role)
    .map(([a]) => ACTION_LABEL[a] || a)
  return [...pages, ...actions]
}

/** Everything a role can do, including inherited lower-role abilities. */
export function effectiveFeatures(role: Role): string[] {
  const idx = ROLE_ORDER.indexOf(role)
  return ROLE_ORDER.slice(0, idx + 1).flatMap((r) => featuresFor(r))
}
