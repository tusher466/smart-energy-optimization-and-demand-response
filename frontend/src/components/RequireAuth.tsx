import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, type Role, RANK } from '../state/store'

export function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuth((s) => s.token)
  const loc = useLocation()
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return children
}

export function RequireRole({ role, children }: { role: Role; children: JSX.Element }) {
  const token = useAuth((s) => s.token)
  const myRole = useAuth((s) => s.role)
  if (!token) return <Navigate to="/login" replace />
  if ((RANK[myRole || ''] || 0) < RANK[role]) return <Navigate to="/" replace />
  return children
}
