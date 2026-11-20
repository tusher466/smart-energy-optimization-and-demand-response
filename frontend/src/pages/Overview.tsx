import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line } from 'recharts'
import { Pause, Play, RotateCcw, Check, X, Lock } from 'lucide-react'
import { api } from '../lib/api'
import { usePrefs, useRole, can } from '../state/store'
import { Kpi, Explain, Skeleton, ChartTip, Toast, TableSkeleton, QueryError, useMinDelay } from '../components/ui'
import { num } from '../lib/format'

function FlowScene({ tl, hour }: { tl: any[]; hour: number }) {
  const cur = tl.length ? tl[Math.min(hour, tl.length - 1)] : null
  const sol = cur ? Math.round(cur.solar_kw) : null
  const ev = cur ? Math.round(cur.ev_smart_kw) : null
  const dem = cur ? Math.round(cur.demand_kw) : null
  const feed = cur && dem !== null && ev !== null ? Math.round(ev + dem) : null
  const reduceMotion = typeof window !== 'undefined'
    && !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const nodes = [
    { x: 6, label: 'Solar', sub: 'rooftop', value: sol !== null ? `${sol} kW` : '—', accent: false },
    { x: 122, label: 'EV fleet', sub: 'smart charge', value: ev !== null ? `${ev} kW` : '—', accent: false },
    { x: 238, label: 'Battery', sub: 'storage', value: 'standby', accent: false },
    { x: 354, label: 'Feeder', sub: 'constrained', value: feed !== null ? `${feed} kW` : '—', accent: true },
  ]
  const links: { x1: number; x2: number; color: string }[] = [
    { x1: 106, x2: 122, color: '#E0A73A' },
    { x1: 222, x2: 238, color: '#3E7C86' },
    { x1: 338, x2: 354, color: '#3E7C86' },
  ]
  return (
    <svg viewBox="0 0 460 190" className="w-full mt-2" role="img" aria-label="Animated asset flow diagram with live kilowatt values">
      {links.map((l, i) => (
        <g key={i}>
          <line x1={l.x1} y1={91} x2={l.x2} y2={91} stroke="#8E9A92" strokeWidth={1.5} opacity={0.7} />
          {!reduceMotion && [0, 1].map((k) => (
            <circle key={k} r={4.5} fill={l.color}>
              <animateMotion dur="2.2s" begin={`${-k * 1.1}s`} repeatCount="indefinite" path={`M${l.x1},91 H${l.x2}`} />
            </circle>
          ))}
        </g>
      ))}
      {nodes.map((n) => (
        <g key={n.label}>
          <rect x={n.x} y={56} width={100} height={70} rx={10} fill="none"
            className={n.accent ? 'node-pulse' : undefined}
            stroke={n.accent ? '#E0A73A' : '#5F8F6B'} strokeWidth={n.accent ? 2.5 : 1.4} />
          <text x={n.x + 50} y={80} textAnchor="middle" fontSize={12} fontWeight={600} fill="currentColor">{n.label}</text>
          <text x={n.x + 50} y={94} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.6}>{n.sub}</text>
          <text x={n.x + 50} y={112} textAnchor="middle" fontSize={12} fill={n.accent ? '#E0A73A' : 'currentColor'} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{n.value}</text>
          {n.accent && <text x={n.x + 50} y={44} textAnchor="middle" fontSize={9} fontWeight={700} fill="#E0A73A" letterSpacing={1}>CONSTRAINED</text>}
        </g>
      ))}
    </svg>
  )
}

export function Overview() {
  const { region } = usePrefs()
  const role = useRole()
  const mayRun = can(role, 'manager')
  const mayDecide = can(role, 'operator')
  const [playing, setPlaying] = useState(false)
  const [hour, setHour] = useState(23)
  const [toast, setToast] = useState('')
  const timer = useRef<number | null>(null)
  const sim = useQuery({ queryKey: ['sim-day', region], queryFn: () => api.simulateDay(region), enabled: mayRun, retry: false })
  const ledger = useQuery({ queryKey: ['ledger'], queryFn: api.ledgerSummary })
  const approvals = useQuery({ queryKey: ['approvals'], queryFn: api.approvals })
  const simLoading = useMinDelay(sim.isLoading || (sim.isFetching && !sim.data))
  const apLoading = useMinDelay(approvals.isLoading)

  /* 24h in 60s -> one hour every 2.5s */
  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setHour((h) => {
        if (h >= 23) { setPlaying(false); return h }
        return h + 1
      })
    }, 2500)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [playing])

  useEffect(() => { setHour(23); setPlaying(false) }, [region])

  const tl = (sim.data?.timeline || []).slice(0, hour + 1)
  const k = sim.data?.kpis

  const togglePlay = () => {
    if (!sim.data) { sim.refetch(); return }
    if (!playing && hour >= 23) setHour(0)
    setPlaying(!playing)
  }

  const decide = async (id: number, ok: boolean) => {
    try {
      await api.decideApproval(id, ok)
      approvals.refetch()
      setToast(ok ? 'Action approved and logged' : 'Action rejected and logged')
    } catch (e: any) {
      setToast(e.message || 'Decision failed — try again')
    }
  }

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="font-serif-d text-4xl font-semibold tracking-tight">Dispatch console</h1>
        <p className="muted mt-1">
          {role === 'viewer'
            ? 'Read-only view for the viewer role — live results, receipts and the approvals trail.'
            : 'One decision loop: forecast → uncertainty → optimize → act → explain → measure savings.'}
        </p>
      </div>
      {role === 'viewer' ? (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
        <Kpi label="Cumulative saved" value="—" countTo={ledger.data?.total_saved} decimals={0} loading={ledger.isLoading} sub={`${ledger.data?.decisions || 0} logged decisions`} />
        <Kpi label="CO₂ avoided" value="—" countTo={ledger.data?.total_co2_kg} decimals={0} suffix=" kg" loading={ledger.isLoading} sub="marginal factor" />
        <Kpi label="Peak shaved" value="—" countTo={ledger.data?.total_peak_kw} decimals={1} suffix=" kW" loading={ledger.isLoading} sub="sum of events" />
        <Kpi label="Decisions logged" value="—" countTo={ledger.data?.decisions} decimals={0} loading={ledger.isLoading} sub="SQLite · auditable" />
      </div>
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
        <Kpi label="Saved today" value="—" countTo={k?.saved_cost} decimals={0} prefix={k?.currency_symbol || ''}
          sub={k ? `${k.currency} · confidence ${Math.round((k.forecast_confidence || 0) * 100)}%` : 'loading'} delta={k ? 'today' : undefined} />
        <Kpi label="CO₂ avoided" value="—" countTo={k?.co2_kg} decimals={0} suffix=" kg" sub="marginal factor" />
        <Kpi label="Peak shaved" value="—" countTo={k?.peak_shaved_kw} decimals={1} suffix=" kW" sub="feeder limit respected" />
        <Kpi label="Solar today" value="—" countTo={k?.solar_kwh} decimals={0} suffix=" kWh" sub="P50 forecast" />
      </div>
      )}
      {role === 'viewer' ? (
      <div className="card p-8 text-center fade-up">
        <Lock size={22} className="mx-auto muted icon-float" />
        <h2 className="font-serif-d text-xl mt-2">Live simulation lives with managers and above</h2>
        <p className="muted text-sm mt-1 max-w-md mx-auto">Your viewer role is read-only by design. Ask a manager to run the day simulation or an operator to dispatch — every result lands in the ledger for you to verify.</p>
      </div>
      ) : (
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-serif-d text-xl">Next 24h decision timeline</h2>
          <div className="flex-1" />
          <button className="btn-primary" onClick={togglePlay} disabled={sim.isFetching || !mayRun}
            title={mayRun ? 'Run the 24h simulation' : `Requires manager role or above (you are ${role})`}
            aria-label={playing ? 'Pause simulation' : 'Play day simulation'}>
            {playing ? <Pause size={15} /> : hour >= 23 && sim.data ? <RotateCcw size={15} /> : <Play size={15} />}
            {sim.isFetching ? 'Computing…' : playing ? `Playing · ${hour}:00` : sim.data ? (hour >= 23 ? 'Replay the day' : `Resume from ${hour}:00`) : 'Simulate a day (60s → 24h)'}
          </button>
          <label className="text-sm muted flex items-center gap-2">Scrubber
            <input type="range" min={0} max={23} value={hour}
              style={{ ['--fill' as any]: `${(hour / 23) * 100}%` }}
              onChange={(e) => { setHour(Number(e.target.value)); setPlaying(false) }} aria-label="Hour scrubber" />
            <span className="num">{hour}:00</span>
          </label>
        </div>
        {/* progress hairline */}
        <div className="h-1 rounded-full mt-3" style={{ background: 'var(--line)' }} aria-hidden>
          <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${((hour + 1) / 24) * 100}%`, background: '#E0A73A' }} />
        </div>
        {sim.isError && !sim.data ? <div className="mt-3"><QueryError message={(sim.error as Error)?.message} onRetry={() => sim.refetch()} /></div>
        : simLoading ? <div className="mt-3"><Skeleton /></div> : (
          <div className="mt-2">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={tl}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(h: number) => `${h}:00`} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip units=" kW" />} />
                <Area type="monotone" dataKey="solar_kw" stroke="#E0A73A" fill="#E0A73A" fillOpacity={0.25} name="Solar P50" animationDuration={600} />
                <Area type="monotone" dataKey="demand_kw" stroke="#5F8F6B" fill="#5F8F6B" fillOpacity={0.15} name="Demand P50" animationDuration={600} />
                <Line type="monotone" dataKey="ev_smart_kw" stroke="#3E7C86" strokeDasharray="5 3" dot={false} strokeWidth={2} name="EV smart" animationDuration={600} />
                <Line type="monotone" dataKey="ev_base_kw" stroke="#C2503A" strokeDasharray="2 2" dot={false} name="EV baseline" animationDuration={600} />
              </AreaChart>
            </ResponsiveContainer>
            <p className="muted text-xs mt-1">Showing hours 0:00–{hour}:00 · drag the scrubber or press play to animate the full day.</p>
          </div>
        )}
        {sim.data && <Explain title="Today's dispatch" body={sim.data.explanation} counter={sim.data.counterfactual} confidence={0.9} />}
      </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="card card-lift p-4">
          <h3 className="font-serif-d text-lg">Live asset flow</h3>
          <p className="muted text-sm mt-1">Fleet → feeder → grid. Amber marks the single constrained resource.</p>
          <FlowScene tl={tl} hour={hour} />
          <p className="muted text-xs mt-1">Packets ride the wires in real time · values follow the scrubber at <span className="num">{hour}:00</span>.</p>
        </div>
        <div className="card p-4">
          <h3 className="font-serif-d text-lg">Human approvals queue</h3>
          <p className="muted text-sm">Every automated action needs operator approval.</p>
          {apLoading ? <div className="mt-2"><TableSkeleton rows={4} cols={2} /></div> : (
          <div className="mt-2 space-y-2 max-h-56 overflow-auto rise-list">
            {(approvals.data?.approvals || []).slice(0, 6).map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 text-sm border-b hairline pb-2">
                <span className="flex-1">{a.action} <span className="muted">· {a.status}</span></span>
                {a.status === 'pending' ? (
                  mayDecide ? (
                  <>
                    <button className="btn-ghost text-xs no-print" onClick={() => decide(a.id, true)}><Check size={13} /> Approve</button>
                    <button className="btn-ghost text-xs no-print" onClick={() => decide(a.id, false)}><X size={13} /> Reject</button>
                  </>
                  ) : (
                    <span className="muted text-xs" title={`Requires operator role (you are ${role})`}>awaiting operator</span>
                  )
                ) : (
                  <span className="muted text-xs">{a.status === 'approved' ? 'Approved ✓' : 'Rejected'}</span>
                )}
              </div>
            ))}
            {(!approvals.data?.approvals || approvals.data.approvals.length === 0) && <p className="muted text-sm">Queue empty. Run Dispatch to create an approval.</p>}
          </div>
          )}
          <p className="muted text-xs mt-2">Ledger cumulative: {ledger.data ? num(ledger.data.total_saved, 0) + ' saved · ' + num(ledger.data.total_co2_kg, 0) + ' kg CO₂' : '…'}</p>
        </div>
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}
