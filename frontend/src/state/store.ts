import { create } from 'zustand'

type Prefs = {
  region: string
  theme: 'light' | 'dark'
  carbonMethod: 'marginal' | 'average'
  set: (p: Partial<Prefs>) => void
}

export const usePrefs = create<Prefs>((set) => ({
  region: 'bd-dhaka',
  theme: 'dark',
  carbonMethod: 'marginal',
  set: (p) => set(p),
}))

export type Role = 'viewer' | 'manager' | 'operator' | 'admin'
export const RANK: Record<string, number> = { viewer: 1, manager: 2, operator: 3, admin: 4 }

type AuthState = {
  token: string | null
  username: string | null
  role: Role | null
  login: (token: string, username: string, role: Role) => void
  logout: () => void
}

function initialAuth(): { token: string | null; username: string | null; role: Role | null } {
  try {
    const t = localStorage.getItem('eb_token')
    const u = localStorage.getItem('eb_user')
    if (t && u) {
      const parsed = JSON.parse(u)
      return { token: t, username: parsed.username, role: parsed.role }
    }
  } catch { /* fresh session */ }
  return { token: null, username: null, role: null }
}

export const useAuth = create<AuthState>((set) => ({
  ...initialAuth(),
  login: (token, username, role) => set({ token, username, role }),
  logout: () => set({ token: null, username: null, role: null }),
}))

/** Reactive role hook for gating buttons. */
export function useRole(): Role | null {
  return useAuth((s) => s.role)
}

/** Non-reactive permission check. */
export function can(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false
  return (RANK[role] || 0) >= RANK[minimum]
}
