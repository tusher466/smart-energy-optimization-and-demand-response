import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { api, setSession } from '../lib/api'
import { useAuth, type Role } from '../state/store'

const DEMO: { u: string; p: string; r: string }[] = [
  { u: 'admin', p: 'admin123', r: 'Admin' },
  { u: 'operator', p: 'op123', r: 'Operator' },
  { u: 'manager', p: 'mgr123', r: 'Manager' },
  { u: 'viewer', p: 'view123', r: 'Viewer' },
]

/** Facebook-style loading shell: the app's skeleton shimmers while the session opens. */
function LoginSkeleton({ role }: { role: string }) {
  return (
    <div className="fixed inset-0 z-[60] px-4 py-6 overflow-auto" style={{ background: 'var(--bg)' }}
      role="status" aria-label={`Signing in as ${role}, loading workspace`}>
      <div className="loadbar fixed top-0 left-0 right-0" />
      <div className="max-w-3xl mx-auto space-y-3 pt-4">
        <div className="flex items-center gap-2.5 fade-up">
          <div className="skeleton sk-circle" style={{ width: 30, height: 30 }} />
          <div className="skeleton sk-line" style={{ width: 170 }} />
          <div className="flex-1" />
          <div className="skeleton sk-line" style={{ width: 90 }} />
          <div className="skeleton sk-line" style={{ width: 60 }} />
        </div>
        <div className="flex gap-2 fade-up" style={{ animationDelay: '60ms' }}>
          {[130, 110, 120, 100, 90].map((w, i) => (
            <div key={i} className="skeleton" style={{ width: w, height: 30, borderRadius: 8 }} />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card p-4 space-y-2 fade-up" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="skeleton sk-line" style={{ width: '55%' }} />
              <div className="skeleton sk-value" style={{ width: '80%' }} />
              <div className="skeleton sk-line" />
            </div>
          ))}
        </div>
        <div className="sk-chart fade-up" style={{ height: 220, animationDelay: '120ms' }} />
        <div className="card p-4 flex items-center gap-3 fade-up" style={{ animationDelay: '180ms' }}>
          <span className="spinner" aria-hidden />
          <p className="text-sm">Signing in as <b className="num">{role}</b><span className="typing-dots" /> — preparing your workspace</p>
        </div>
      </div>
    </div>
  )
}

export function Login() {
  const nav = useNavigate()
  const loc = useLocation() as any
  const login = useAuth((s) => s.login)
  const [username, setU] = useState('operator')
  const [password, setP] = useState('op123')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    try {
      const [r] = await Promise.all([
        api.login(username, password),
        new Promise((res) => setTimeout(res, 1400)),
      ])
      setSession(r.access_token, r.username, r.role)
      login(r.access_token, r.username, r.role as Role)
      nav(loc.state?.from || '/', { replace: true })
    } catch (ex: any) {
      setErr(ex.message || 'Login failed')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* image half */}
      <div className="relative overflow-hidden min-h-[240px]">
        <img src="/login-side.jpg" alt="Solar panel array under a clear sky"
          className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(246,243,236,.94) 0%, rgba(246,243,236,.55) 42%, rgba(246,243,236,0) 70%)' }} />
        <div className="absolute bottom-0 left-0 right-0 p-8 fade-up" style={{ color: '#141A17' }}>
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center font-serif-d text-xl font-semibold" style={{ background: '#E0A73A', color: '#141A17' }}>E</span>
            <span className="font-serif-d text-2xl tracking-tight">Smart energy optimization and demand response</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed max-w-sm" style={{ color: '#141A17', opacity: 0.8 }}>
            Forecast the sun, dispatch the fleet, and prove every rupee, euro and
            dollar saved — one decision loop, fully receipted.
          </p>
        </div>
      </div>

      {/* form half */}
      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm fade-up" style={{ animationDelay: '80ms' }}>
          <h1 className="font-serif-d text-3xl tracking-tight">Sign in</h1>
          <p className="muted text-sm mt-1">Pick a role — the console reshapes around it.</p>

          <div className="grid grid-cols-4 gap-2 mt-5" role="radiogroup" aria-label="Role">
            {DEMO.map((d) => {
              const active = username === d.u
              return (
                <button type="button" key={d.u} role="radio" aria-checked={active}
                  onClick={() => { if (!busy) { setU(d.u); setP(d.p); setErr('') } }}
                  className="role-pick rounded-xl py-2.5 px-1 border hairline flex flex-col items-center gap-1.5">
                  <span className="rounded-xl p-1" style={{ background: '#fff', opacity: active ? 1 : 0.65, boxShadow: active ? '0 0 0 2px #E0A73A' : 'none' }}>
                    <img src={`/roles/${d.u}.png`} alt={`${d.r} icon`} width={38} height={38} draggable={false} />
                  </span>
                  <span className="text-xs font-medium" style={{ color: active ? '#E0A73A' : undefined }}>{d.r}</span>
                </button>
              )
            })}
          </div>

          <form onSubmit={submit} className="card p-5 mt-4">
            <label className="block text-sm">Username<br />
              <input value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" className="w-full mt-1" disabled={busy} />
            </label>
            <label className="block text-sm mt-3">Password<br />
              <input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" className="w-full mt-1" disabled={busy} />
            </label>
            {err && <p className="text-sm mt-3 fade-up" style={{ color: '#C2503A' }}>{err}</p>}
            <button className="btn-primary w-full justify-center mt-4" disabled={busy}>
              {busy ? <span className="spinner" aria-label="Signing in" /> : <LogIn size={15} />}
              {busy ? <span className="typing-dots">Signing in</span> : 'Sign in'}
            </button>
          </form>
          <p className="muted text-xs mt-4 text-center">Locked after 5 wrong tries · sessions expire after 12 h</p>
        </div>
      </div>

      {busy && <LoginSkeleton role={username} />}
    </div>
  )
}
