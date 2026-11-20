import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, Sun, PlugZap, Activity, ScanSearch, BookOpen, ShieldCheck, Settings, Moon, Sun as SunIcon, Command, Droplets, Users as UsersIcon, LogOut, Globe } from 'lucide-react'
import { usePrefs, useAuth, can } from '../state/store'
import { api, docsUrl, clearSession } from '../lib/api'
import { PAGE_MIN } from '../lib/permissions'
import { Toast } from './ui'

/* Visible navigation is driven by PAGE_MIN: users only ever see the pages
   their role may open. Route guards enforce the same map (defense in depth). */
const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, hint: 'KPI strip, 24h timeline, approvals', min: PAGE_MIN.overview },
  { to: '/solar', label: 'Forecast', icon: Sun, hint: 'Solar bands, cloud motion', min: PAGE_MIN.solar },
  { to: '/demand', label: 'Demand', icon: Droplets, hint: 'Load forecast, drivers', min: PAGE_MIN.demand },
  { to: '/vpp', label: 'Dispatch', icon: PlugZap, hint: 'EV fleet optimizer', min: PAGE_MIN.dispatch },
  { to: '/grid', label: 'Recovery', icon: Activity, hint: 'Black-start simulator', min: PAGE_MIN.grid },
  { to: '/panels', label: 'Panels', icon: ScanSearch, hint: 'Thermal inspection', min: PAGE_MIN.panels },
  { to: '/ledger', label: 'Ledger', icon: BookOpen, hint: 'Savings receipts', min: PAGE_MIN.ledger },
  { to: '/sdgs', label: 'SDGs', icon: Globe, hint: 'UN goals we move', min: PAGE_MIN.sdgs },
  { to: '/trust', label: 'Trust', icon: ShieldCheck, hint: 'Provenance, fairness', min: PAGE_MIN.trust },
  { to: '/settings', label: 'Settings', icon: Settings, hint: 'Region, models, keys', min: PAGE_MIN.settings },
  { to: '/users', label: 'Users', icon: UsersIcon, hint: 'Roles (admin)', min: PAGE_MIN.users },
]

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000)
    return () => clearInterval(t)
  }, [])
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function Layout() {
  const { region, theme, set } = usePrefs()
  const [regions, setRegions] = useState<any[]>([])
  const loc = useLocation()
  const nav = useNavigate()
  const username = useAuth((s) => s.username)
  const role = useAuth((s) => s.role)
  const logout = useAuth((s) => s.logout)
  const visibleNav = NAV.filter((n) => can(role, n.min))
  const clock = useClock()
  const [pal, setPal] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [toast, setToast] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const health = useQuery({ queryKey: ['models-h'], queryFn: api.models, retry: false, refetchInterval: 60000 })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  useEffect(() => {
    api.regions().then((r) => setRegions(r.regions)).catch(() => setRegions([]))
  }, [])
  useEffect(() => {
    if (pal) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [pal])

  const actions = useMemo(() => {
    const navItems = visibleNav.map((n) => ({ ...n, kind: 'Go to', run: () => nav(n.to) }))
    const extra = [
      { to: '', label: theme === 'dark' ? 'Light theme' : 'Dark theme', icon: theme === 'dark' ? SunIcon : Moon, hint: 'Toggle appearance', kind: 'Action', run: () => set({ theme: theme === 'dark' ? 'light' : 'dark' }) },
      ...(can(role, 'admin') ? [{ to: '', label: 'Load demo dataset', icon: BookOpen, hint: 'Seed ledger entries (admin)', kind: 'Action', run: () => { api.ledgerSeed().then(() => setToast('Demo dataset loaded')).catch((e: any) => setToast(e.message)); } }] : []),
      { to: '', label: 'API docs', icon: Command, hint: 'OpenAPI in new tab', kind: 'Action', run: () => { window.open(docsUrl(), '_blank') } },
      { to: '', label: `Sign out (${username})`, icon: LogOut, hint: 'End session', kind: 'Action', run: () => { clearSession(); logout(); nav('/login') } },
    ]
    const all = [...navItems, ...extra]
    if (!q.trim()) return all
    const s = q.toLowerCase()
    return all.filter((a) => (a.label + a.hint).toLowerCase().includes(s))
  }, [q, nav, theme, set, role, visibleNav, username])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal((p) => !p) }
      if (pal && e.key === 'Escape') setPal(false)
      if (pal && e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, actions.length - 1)) }
      if (pal && e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
      if (pal && e.key === 'Enter' && actions[sel]) { actions[sel].run(); setPal(false) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [pal, actions, sel])

  const apiOk = health.data ? true : health.isError ? false : null

  return (
    <div className="min-h-screen">
      <header className="border-b hairline sticky top-0 z-20" style={{ background: 'var(--bg)', backdropFilter: 'blur(6px)' }}>
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 min-w-0 shrink-0" aria-label="Home — dispatch console">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center font-serif-d text-lg font-bold shrink-0" style={{ background: '#E0A73A', color: '#141A17' }}>E</span>
            <span className="min-w-0">
              <span className="font-serif-d font-semibold leading-tight block text-[14px] max-w-[230px]" title="Smart energy optimization and demand response">Smart energy optimization and demand response</span>
              <span className="flex items-center gap-1.5 mt-[3px] leading-none">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] px-2 py-[3px] rounded-full border hairline"
                  style={apiOk === false
                    ? { background: 'rgba(194,80,58,.12)', color: '#C2503A' }
                    : apiOk === null
                      ? { background: 'rgba(201,138,43,.12)', color: '#C98A2B' }
                      : { background: 'rgba(95,143,107,.14)', color: '#5F8F6B' }}>
                  <span className={apiOk === null ? 'dot-busy' : 'dot-live'} style={apiOk === false ? { background: '#C2503A' } : undefined} />
                  {apiOk === null ? 'CONNECTING' : apiOk ? 'LIVE' : 'OFFLINE'}
                </span>
                <span className="muted text-xs leading-none" aria-hidden>·</span>
                <span className="muted text-xs hidden sm:inline whitespace-nowrap leading-none">Dispatch console · <span className="num">{clock}</span></span>
              </span>
            </span>
          </Link>
          <div className="flex-1" />
          <select aria-label="Region" value={region} onChange={(e) => set({ region: e.target.value })} className="h-9 text-sm">
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.currency}</option>)}
            {regions.length === 0 && <option value="bd-dhaka">Dhaka · BDT</option>}
          </select>
          <button className="btn-ghost h-9" aria-label="Toggle theme" title="Toggle theme"
            onClick={() => set({ theme: theme === 'dark' ? 'light' : 'dark' })}>
            {theme === 'dark' ? <SunIcon size={16} /> : <Moon size={16} />}
          </button>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs h-9 px-2.5 rounded-md border hairline" title={`Signed in as ${username}`}>
            <span className="w-6 h-6 rounded-full flex items-center justify-center font-semibold" style={{ background: '#E0A73A', color: '#141A17' }}>
              {(username || '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="font-medium">{username}</span>
            <span className="muted capitalize">· {role}</span>
          </span>
          <button className="btn-ghost h-9 !px-2.5" aria-label="Sign out" title="Sign out"
            onClick={() => { clearSession(); logout(); nav('/login') }}>
            <LogOut size={16} />
          </button>
          <button className="btn-ghost h-9" onClick={() => setPal(true)} aria-label="Command palette" title="Command palette (Ctrl/⌘+K)">
            <Command size={16} /><span className="hidden md:inline text-sm">Cmd+K</span>
          </button>
        </div>
        <nav className="max-w-7xl mx-auto px-4 pb-2 flex gap-1 flex-wrap" aria-label="Primary">
          {visibleNav.map((n) => {
            const active = loc.pathname === n.to
            return (
              <Link key={n.to} to={n.to} aria-current={active ? 'page' : undefined}
                className={`text-sm px-3 py-1.5 rounded-md flex items-center gap-2 transition-all ${active ? 'btn-primary' : 'hover:underline'}`}>
                <n.icon size={15} />{n.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <AnimatePresence mode="wait">
        <motion.main key={loc.pathname} className="max-w-7xl mx-auto px-4 py-6"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}>
          <Outlet />
        </motion.main>
      </AnimatePresence>
      <footer className="max-w-7xl mx-auto px-4 pb-8 pt-2 muted text-xs flex gap-3 flex-wrap no-print">
        <span>Smart energy optimization and demand response · control room</span>
        <span>Synthetic offline data unless a key is set</span>
        <Link to="/trust" className="underline">Trust & methodology</Link>
        <a className="underline" href={docsUrl()} target="_blank" rel="noreferrer">API docs</a>
      </footer>
      {pal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4" role="dialog" aria-label="Command palette">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPal(false)} />
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18 }} className="card relative w-full max-w-md p-2">
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a command or page…"
              aria-label="Search commands" className="w-full mb-1" />
            <div className="max-h-72 overflow-auto">
              {actions.map((a, i) => (
                <button key={a.label} aria-selected={i === sel} onMouseEnter={() => setSel(i)}
                  className="pal-item w-full text-left px-3 py-2 rounded flex items-center gap-2"
                  onClick={() => { a.run(); setPal(false) }}>
                  <a.icon size={15} className="muted" />
                  <span className="text-sm">{a.kind}: {a.label}</span>
                  <span className="muted text-xs ml-auto">{a.hint}</span>
                </button>
              ))}
              {actions.length === 0 && <p className="muted text-sm px-3 py-2">No matches.</p>}
            </div>
          </motion.div>
        </div>
      )}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}
