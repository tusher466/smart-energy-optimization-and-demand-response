import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserPlus, Trash2, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { Skeleton, TableSkeleton, Toast, QueryError, useMinDelay } from '../components/ui'
import { ROLE_ORDER, ROLE_BLURB, featuresFor } from '../lib/permissions'

const ROLE_DESC: Record<string, string> = Object.fromEntries(
  ROLE_ORDER.map((r) => [r, ROLE_BLURB[r]])
)

export function Users() {
  const q = useQuery({ queryKey: ['users'], queryFn: api.users })
  const [toast, setToast] = useState('')
  const [nu, setNu] = useState('')
  const [np, setNp] = useState('')
  const [nr, setNr] = useState('viewer')
  const [pwFor, setPwFor] = useState<number | null>(null)
  const [pw, setPw] = useState('')
  const listLoading = useMinDelay(q.isLoading)

  const act = async (fn: () => Promise<any>, msg: string) => {
    try { await fn(); setToast(msg); q.refetch() }
    catch (e: any) { setToast(e.message || 'Action failed') }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="fade-up">
        <h1 className="font-serif-d text-3xl tracking-tight">Users and roles</h1>
        <p className="muted text-sm mt-1">Admin only. Power flows viewer → manager → operator → admin; every step up unlocks a new class of actions.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 stagger">
        {Object.entries(ROLE_DESC).map(([r, d]) => (
          <div key={r} className="card card-lift p-3">
            <div className="font-semibold text-sm capitalize">{r}</div>
            <div className="muted text-xs mt-0.5">{d}</div>
            <ul className="text-xs mt-2 space-y-0.5">
              {featuresFor(r as any).map((f) => (
                <li key={f} className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ background: '#5F8F6B' }} />{f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="card p-4">
        <h2 className="font-serif-d text-lg flex items-center gap-2"><UserPlus size={17} /> Add user</h2>
        <div className="flex gap-2 mt-2 flex-wrap items-end">
          <label className="text-sm">Username<br /><input value={nu} onChange={(e) => setNu(e.target.value)} className="w-36" placeholder="name" /></label>
          <label className="text-sm">Password<br /><input type="password" value={np} onChange={(e) => setNp(e.target.value)} className="w-36" placeholder="min 4 chars" /></label>
          <label className="text-sm">Role<br />
            <select value={nr} onChange={(e) => setNr(e.target.value)}>
              {Object.keys(ROLE_DESC).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <button className="btn-primary text-sm" disabled={!nu.trim() || np.length < 4}
            onClick={() => act(() => api.createUser(nu.trim(), np, nr), `User ${nu.trim()} created as ${nr}`).then(() => { setNu(''); setNp('') })}>
            Create
          </button>
        </div>
      </div>
      <div className="card p-4 overflow-auto">
        {q.isError && !q.data ? <QueryError message={(q.error as Error)?.message} onRetry={() => q.refetch()} />
        : listLoading ? <TableSkeleton rows={5} cols={4} /> : (
          <table className="tbl row-enter text-sm w-full">
            <thead><tr className="muted text-left"><th>User</th><th>Role</th><th>Status</th><th className="no-print">Actions</th></tr></thead>
            <tbody>
              {(q.data?.users || []).map((u: any) => (
                <tr key={u.id} className="border-t hairline">
                  <td className="font-medium">{u.username}{u.username === 'admin' && <span className="muted text-xs"> · built-in</span>}</td>
                  <td>
                    <select value={u.role} aria-label={`Role for ${u.username}`}
                      disabled={u.username === 'admin'}
                      onChange={(e) => act(() => api.patchUser(u.id, { role: e.target.value }), `${u.username} → ${e.target.value}`)}>
                      {Object.keys(ROLE_DESC).map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="text-xs px-2 py-0.5 rounded font-semibold"
                      style={u.is_active ? { background: 'rgba(95,143,107,.15)', color: '#5F8F6B' } : { background: 'rgba(194,80,58,.15)', color: '#C2503A' }}
                      disabled={u.username === 'admin'}
                      onClick={() => act(() => api.patchUser(u.id, { is_active: !u.is_active }), `${u.username} ${u.is_active ? 'disabled' : 'enabled'}`)}>
                      {u.is_active ? 'active' : 'disabled'}
                    </button>
                  </td>
                  <td className="no-print">
                    <div className="flex gap-1.5">
                      <button className="btn-ghost text-xs !py-1" title="Set new password"
                        onClick={() => { setPwFor(pwFor === u.id ? null : u.id); setPw('') }}>
                        <KeyRound size={12} /> Password
                      </button>
                      <button className="btn-ghost text-xs !py-1" title="Delete user"
                        disabled={u.username === 'admin'}
                        onClick={() => { if (window.confirm(`Delete ${u.username}?`)) act(() => api.deleteUser(u.id), `${u.username} deleted`) }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {pwFor === u.id && (
                      <div className="flex gap-1.5 mt-1.5 fade-up">
                        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="new password" className="w-32 !py-1 text-xs" />
                        <button className="btn-primary text-xs !py-1" disabled={pw.length < 4}
                          onClick={() => act(() => api.patchUser(u.id, { password: pw }), 'Password updated').then(() => setPwFor(null))}>Save</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {q.isLoading && <Skeleton h={40} />}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}
