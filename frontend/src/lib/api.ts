const BASE = ''

export const docsUrl = () => {
  const target = (import.meta as any)?.env?.VITE_API_TARGET as string | undefined
  // Dev (vite proxy): backend docs. Production (single service): same-origin docs.
  return target ? `${target}/docs` : `${window.location.origin}/docs`
}

export function setSession(token: string, username: string, role: string) {
  localStorage.setItem('eb_token', token)
  localStorage.setItem('eb_user', JSON.stringify({ username, role }))
}

export function clearSession() {
  localStorage.removeItem('eb_token')
  localStorage.removeItem('eb_user')
}

export function storedUser(): { username: string; role: string } | null {
  try {
    const raw = localStorage.getItem('eb_user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function authHeader(): Record<string, string> {
  const t = localStorage.getItem('eb_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function handle401(status: number) {
  if (status === 401 && window.location.pathname !== '/login') {
    clearSession()
    window.location.href = '/login'
  }
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + url, { ...init, headers: { 'Content-Type': 'application/json', ...authHeader(), ...(init?.headers || {}) } })
  if (!r.ok) {
    handle401(r.status)
    let detail = `HTTP ${r.status} ${url}`
    try { detail = (await r.json()).detail || detail } catch { /* keep */ }
    throw new Error(detail)
  }
  return r.json()
}

async function authed(url: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(BASE + url, { ...init, headers: { ...authHeader(), ...(init?.headers || {}) } })
  if (!r.ok) handle401(r.status)
  return r
}

export const api = {
  login: (username: string, password: string) =>
    j<{ access_token: string; username: string; role: string }>('/api/v1/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => j<any>('/api/v1/auth/me'),
  users: () => j<any>('/api/v1/users'),
  createUser: (u: string, p: string, role: string) =>
    j<any>('/api/v1/users', { method: 'POST', body: JSON.stringify({ username: u, password: p, role }) }),
  patchUser: (id: number, b: any) => j<any>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteUser: (id: number) => j<any>(`/api/v1/users/${id}`, { method: 'DELETE' }),
  regions: () => j<{ regions: any[] }>('/api/v1/regions'),
  solar: (b: any) => j<any>('/api/v1/solar/forecast', { method: 'POST', body: JSON.stringify(b) }),
  demand: (b: any) => j<any>('/api/v1/demand/forecast', { method: 'POST', body: JSON.stringify(b) }),
  vpp: (b: any) => j<any>('/api/v1/vpp/dispatch', { method: 'POST', body: JSON.stringify(b) }),
  gridSim: (b: any) => j<any>('/api/v1/grid/simulate', { method: 'POST', body: JSON.stringify(b) }),
  gridScenarios: () => j<any>('/api/v1/grid/scenarios'),
  copilot: (b: any) => j<any>('/api/v1/grid/copilot', { method: 'POST', body: JSON.stringify(b) }),
  panelsInspect: (sample_id: string, region_id: string) =>
    j<any>(`/api/v1/panels/inspect?sample_id=${sample_id}&region_id=${region_id}`, { method: 'POST' }),
  panelsUpload: async (file: File, region_id: string, capacity_kw = 50) => {
    const fd = new FormData()
    fd.append('file', file)
    const r = await authed(`${BASE}/api/v1/panels/inspect?sample_id=upload&region_id=${region_id}&capacity_kw=${capacity_kw}`, { method: 'POST', body: fd })
    if (!r.ok) {
      let detail = `Upload failed (HTTP ${r.status})`
      try { detail = (await r.json()).detail || detail } catch { /* keep */ }
      throw new Error(detail)
    }
    return r.json()
  },
  ledgerSummary: () => j<any>('/api/v1/ledger/summary'),
  ledgerEntries: () => j<any>('/api/v1/ledger/entries?limit=50'),
  ledgerSeed: () => j<any>('/api/v1/ledger/seed', { method: 'POST' }),
  ledgerReset: () => j<any>('/api/v1/ledger/reset', { method: 'POST' }),
  approvals: () => j<any>('/api/v1/approvals?status=all'),
  decideApproval: (id: number, approve: boolean) => j<any>(`/api/v1/approvals/${id}/decide?approve=${approve}`, { method: 'POST' }),
  createApproval: (action: string, module: string, detail: string) =>
    j<any>('/api/v1/approvals', { method: 'POST', body: JSON.stringify({ action, module, detail }) }),
  integrations: () => j<any>('/api/v1/integrations/status'),
  refreshIntegrations: () => j<any>('/api/v1/integrations/refresh', { method: 'POST' }),
  regionLive: (region_id: string) => j<any>(`/api/v1/regions/${region_id}/live`),
  models: () => j<any>('/api/v1/models/status'),
  simulateDay: (region_id: string) => j<any>('/api/v1/simulate/day', { method: 'POST', body: JSON.stringify({ region_id }) }),
  compare: (b: any) => j<any>('/api/v1/scenarios/compare', { method: 'POST', body: JSON.stringify(b) }),
}
